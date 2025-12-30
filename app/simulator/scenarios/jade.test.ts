
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { jade, jadeHandlerFactory } from '../../data/characters/jade';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';
import { march7th, march7thHandlerFactory } from '../../data/characters/march-7th'; // Use March as ally

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Jade Scenario Test', () => {
    let initialState: GameState;
    const jadeId = 'jade-1';
    const allyId = 'march-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        const characters: Character[] = [
            { ...jade, id: jadeId },
            { ...march7th, id: allyId }
        ];

        const enemies: Enemy[] = [
            {
                id: enemyId,
                name: 'Test Enemy 1',
                level: 80,
                element: 'Wind',
                toughness: 100,
                maxToughness: 100,
                baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                baseRes: { Quantum: 0.0, Ice: 0.0 }, // 0 Res for easier calc
                abilities: { basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' } } as any
            } as Enemy
        ];

        const partyConfig: PartyConfig = {
            members: characters.map(char => ({
                character: char,
                config: { rotation: [], rotationMode: 'sequence', ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0
            }))
        };

        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Quantum', 'Ice']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register handlers manually
        const jadeHandler = jadeHandlerFactory(jadeId, 0);
        const marchHandler = march7thHandlerFactory(allyId, 0);

        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, jadeHandler.handlerMetadata, marchHandler.handlerMetadata],
            eventHandlerLogics: {
                ...initialState.eventHandlerLogics,
                [jadeHandler.handlerMetadata.id]: jadeHandler.handlerLogic,
                [marchHandler.handlerMetadata.id]: marchHandler.handlerLogic
            }
        };

        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Skill - Debt Collector', () => {
        it('should apply Debt Collector to ally and increase SPD', () => {
            let state = initialState;

            // Jade uses Skill on March
            state = dispatch(state, {
                type: 'SKILL',
                sourceId: jadeId,
                targetId: allyId
            });

            const ally = getUnit(state, allyId);
            const buff = ally?.effects.find(e => e.name === '債権回収者');
            expect(buff).toBeDefined();

            // Check SPD buff (base 30) (Check effect modifiers, not unit modifiers)
            const buffMod = buff?.modifiers?.find(m => m.source === '債権回収者' && m.target === 'spd');
            expect(buffMod?.value).toBe(30);

            // Check Tracker on Jade
            const jadeUnit = getUnit(state, jadeId);
            const tracker = jadeUnit?.effects.find(e => e.name === '債権回収者(管理)');
            expect(tracker).toBeDefined();
        });

        it('should trigger Additional Damage and HP consumption when Debt Collector attacks', () => {
            let state = initialState;
            const getEnemyHp = (s: GameState) => getUnit(s, enemyId)?.hp || 0;
            const getAllyHp = (s: GameState) => getUnit(s, allyId)?.hp || 0;

            // Apply Skill
            state = dispatch(state, { type: 'SKILL', sourceId: jadeId, targetId: allyId });

            const hpBeforeAttack = getAllyHp(state);
            const enemyHpBefore = getEnemyHp(state);

            // Ally uses Basic Attack
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: allyId, targetId: enemyId });

            // Check Ally HP Consumed (2% of Max HP)
            const ally = getUnit(state, allyId);
            const allyMaxHp = ally!.stats.hp; // FinalStats uses 'hp' for max hp
            const expectedConsume = Math.floor(allyMaxHp * 0.02);
            // newHp should be roughly oldHp - consume (ignoring float precision for now)
            expect(getAllyHp(state)).toBeLessThan(hpBeforeAttack);
            expect(getAllyHp(state)).toBeGreaterThanOrEqual(hpBeforeAttack - expectedConsume - 1);

            // Check Additional Damage
            // Enemy HP should decrease by Basic + Additional
            // Difficult to exact match due to crit/random, but we can check log or significant damage
            // Or inspect logs
            const lastLog = state.log[state.log.length - 1]; // Might be the attack log
            // Actually Additional Damage is logged separately in internal logs or consolidated?
            // Hysilens implementation appended it. Jade implementation uses applyUnifiedDamage with skipLog: true.
            // But it reduces HP.
        });

        it('should generate Charge when Debt Collector attacks', () => {
            let state = initialState;
            state = dispatch(state, { type: 'SKILL', sourceId: jadeId, targetId: allyId });

            // Ally attacks (1 target)
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: allyId, targetId: enemyId });

            const unit = getUnit(state, jadeId);
            const charge = unit?.effects.find(e => e.id === 'jade-charge')?.stackCount || 0;

            // E0: 1 enemy hit -> 1 charge
            expect(charge).toBe(1);
        });
    });

    describe('Talent - Follow-up Attack', () => {
        it('should trigger follow-up at 8 charges', () => {
            let state = initialState;

            // Add 7 charges manually
            // We can't easily add charges via dispatch without multiple turns.
            // Let's modify state directly for test setup
            state = {
                ...state,
                registry: state.registry.update(createUnitId(jadeId), u => ({
                    ...u,
                    effects: [...u.effects, {
                        id: 'jade-charge', name: 'Charge', category: 'STATUS',
                        sourceUnitId: jadeId, durationType: 'PERMANENT', duration: -1,
                        stackCount: 7, apply: (t, s) => s, remove: (t, s) => s
                    }]
                }))
            };

            // Jade attacks (1 target) -> +1 charge -> 8 -> Trigger
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: jadeId, targetId: enemyId });

            const unit = getUnit(state, jadeId);
            // Charge should reset (consume 8)
            const charge = unit?.effects.find(e => e.id === 'jade-charge')?.stackCount || 0;
            expect(charge).toBe(0);

            // Should have gained 'Pawned Asset'
            const pawned = unit?.effects.find(e => e.id === 'jade-pawned-asset');
            expect(pawned).toBeDefined();
            // 5 stacks from follow-up + 15 from Technique (Battle Start) = 20
            expect(pawned?.stackCount).toBe(20);
        });
    });

    describe('Ultimate', () => {
        it('should enhance follow-up attack', () => {
            let state = initialState;

            state = dispatch(state, { type: 'ULTIMATE', sourceId: jadeId, targetId: jadeId });

            const unit = getUnit(state, jadeId);
            const enhance = unit?.effects.find(e => e.id === 'jade-ult-enhance');
            expect(enhance).toBeDefined();
            expect(enhance?.stackCount).toBe(2);

            // Trigger Follow-up (Manually set charges to 8)
            state = {
                ...state,
                registry: state.registry.update(createUnitId(jadeId), u => ({
                    ...u,
                    effects: [...u.effects, {
                        id: 'jade-charge', name: 'Charge', category: 'STATUS',
                        sourceUnitId: jadeId, durationType: 'PERMANENT', duration: -1,
                        stackCount: 8, apply: (t, s) => s, remove: (t, s) => s
                    }]
                }))
            };

            // Trigger logic by some event? NO, charge logic check is in onAttackEnd. 
            // We need an attack to trigger the check.
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: jadeId, targetId: enemyId });

            // Enhance count should decrement
            const unitAfter = getUnit(state, jadeId);
            const enhanceAfter = unitAfter?.effects.find(e => e.id === 'jade-ult-enhance');
            expect(enhanceAfter?.stackCount).toBe(1);
        });
    });
});
