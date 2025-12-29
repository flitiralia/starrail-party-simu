import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { fuXuan, fuXuanHandlerFactory } from '../../data/characters/fu-xuan';
import { Character, Enemy, PartyConfig, Element } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';
import { IEffect } from '../effect/types';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

// Helper: Get effect by ID prefix
const getEffectByPrefix = (unit: Unit | undefined, prefix: string): IEffect | undefined => {
    if (!unit) return undefined;
    return unit.effects.find(e => e.id.includes(prefix));
};

describe('Fu Xuan Scenario Test', () => {
    let initialState: GameState;
    const fuXuanId = 'fu-xuan-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    // Create a simplified ally character for testing
    const createAllyCharacter = (id: string): Character => ({
        ...fuXuan,
        id,
        name: 'テスト味方',
        stats: { ...fuXuan.stats, hp: 100000 } // Ensure high HP to survive damage sharing
    } as any);

    beforeEach(() => {
        // Setup initial state with Fu Xuan, an Ally, and an Enemy
        const characters: Character[] = [
            {
                ...fuXuan,
                id: fuXuanId,
                stats: { ...fuXuan.stats, hp: 100000 } // Ensure high HP
            } as any,
            createAllyCharacter(allyId),
        ];

        const enemies: Enemy[] = [{
            id: enemyId,
            name: 'Test Enemy',
            level: 80,
            element: 'Physical' as Element,
            toughness: 100,
            // High ATK to test damage sharing logic properly (avoid shield absorption noise)
            baseStats: { hp: 100000, atk: 200000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
            baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
            abilities: {
                basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' }
            }
        } as Enemy];

        const partyConfig: PartyConfig = {
            members: characters.map(char => ({
                character: char,
                config: { rotation: [], rotationMode: 'sequence', ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0,
            }))
        };

        // Create config
        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Quantum']) as Set<Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Fu Xuan's event handlers
        const { handlerMetadata, handlerLogic } = fuXuanHandlerFactory(fuXuanId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Dispatch BATTLE_START to trigger initial buffs (Yakubarai, Technique effect)
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Matrix of Prescience (窮観の陣)', () => {
        it('should deploy Matrix of Prescience on skill use', () => {
            let state = initialState;

            // Use skill
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // Check if Matrix effect exists
            const fuXuanUnit = getUnit(state, fuXuanId);
            const matrixEffect = getEffectByPrefix(fuXuanUnit, 'matrix');
            expect(matrixEffect).toBeDefined();
            expect(matrixEffect?.name).toBe('窮観の陣');
        });

        it('should grant Jianzhi shield to all allies on skill use', () => {
            let state = initialState;

            // Use skill
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // Check shield on Fu Xuan
            const fuXuanUnit = getUnit(state, fuXuanId);
            expect(fuXuanUnit?.shield).toBeGreaterThan(0);

            // Check shield on ally
            const allyUnit = getUnit(state, allyId);
            expect(allyUnit?.shield).toBeGreaterThan(0);
        });

        it('should grant crit rate buff to allies in Matrix', () => {
            let state = initialState;

            // Use skill
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // Check crit rate buff on ally
            const allyUnit = getUnit(state, allyId);
            const critEffect = getEffectByPrefix(allyUnit, 'jianzhi-crit');
            expect(critEffect).toBeDefined();
            expect(critEffect?.modifiers?.[0].target).toBe('crit_rate');
        });

        it('should share damage with allies', () => {
            let state = initialState;

            // Force set high HP to survive damage
            state = {
                ...state,
                registry: state.registry
                    .update(createUnitId(fuXuanId), u => ({ ...u, hp: 100000, stats: { ...u.stats, hp: 100000 } }))
                    .update(createUnitId(allyId), u => ({ ...u, hp: 100000, stats: { ...u.stats, hp: 100000 } }))
            };

            // Use skill to activate Matrix
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // Get initial HP
            const getHp = (id: string, s: GameState) => getUnit(s, id)?.hp || 0;
            const initialAllyHp = getHp(allyId, state);
            const initialFuXuanHp = getHp(fuXuanId, state);

            // Enemy attacks Ally
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: enemyId, targetId: allyId });

            const finalAllyHp = getHp(allyId, state);
            const finalFuXuanHp = getHp(fuXuanId, state);

            const allyDamage = initialAllyHp - finalAllyHp;
            const fuXuanDamage = initialFuXuanHp - finalFuXuanHp;

            // Verify Fu Xuan took damage
            expect(fuXuanDamage).toBeGreaterThan(0);

            const totalHealthLost = allyDamage + fuXuanDamage;
            const shareRatio = fuXuanDamage / totalHealthLost;

            // Should be around 0.65 (Fu Xuan takes 65% of original damage)
            // Note: Ratio might slightly vary due to floating point arithmetic but should be within range
            expect(shareRatio).toBeGreaterThan(0.5);
            expect(shareRatio).toBeLessThan(0.8);
        });
    });

    describe('Yakubarai (厄払い)', () => {
        it('should apply Yakubarai to all allies on battle start', () => {
            // Yakubarai should be applied during battle start via technique
            const fuXuanUnit = getUnit(initialState, fuXuanId);
            const yakubaraiEffect = getEffectByPrefix(fuXuanUnit, 'yakubarai');
            expect(yakubaraiEffect).toBeDefined();

            const allyUnit = getUnit(initialState, allyId);
            const allyYakubarai = getEffectByPrefix(allyUnit, 'yakubarai');
            expect(allyYakubarai).toBeDefined();
            // Check if custom property exists
            expect((allyYakubarai as any).damageShare).toBeDefined();
            expect((allyYakubarai as any).damageShare).toBe(0.65);
        });

        it('should grant HP boost from Yakubarai', () => {
            const allyUnit = getUnit(initialState, allyId);
            const hpBoostEffect = getEffectByPrefix(allyUnit, 'hp-boost');
            expect(hpBoostEffect).toBeDefined();
        });
    });

    describe('HP Recovery Charges', () => {
        it('should gain HP recovery charge on ultimate use', () => {
            let state = initialState;

            // Get initial charges
            const getCharges = (s: GameState): number => {
                const unit = getUnit(s, fuXuanId);
                const effect = unit?.effects.find(e => e.id.includes('hp-recovery'));
                return effect?.stackCount || 0;
            };

            const initialCharges = getCharges(state);

            // Set EP to full and use ultimate
            state = {
                ...state,
                registry: state.registry.update(createUnitId(fuXuanId), u => ({
                    ...u,
                    ep: 135
                }))
            };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: fuXuanId, targetId: enemyId });

            const chargesAfterUlt = getCharges(state);
            expect(chargesAfterUlt).toBe(Math.min(initialCharges + 1, 2)); // Max 2
        });
    });

    describe('E1 - Crit Damage Bonus', () => {
        it('should grant additional crit damage in Matrix at E1', () => {
            // Create state with E1
            let state = initialState;

            // Re-register with E1
            const { handlerMetadata, handlerLogic } = fuXuanHandlerFactory(fuXuanId, 80, 1);
            state = {
                ...state,
                eventHandlers: [...state.eventHandlers, handlerMetadata],
                eventHandlerLogics: { ...state.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
            };

            // Use skill
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // Check crit damage buff on ally
            const allyUnit = getUnit(state, allyId);
            const critEffect = allyUnit?.effects.find(e => e.id.includes('jianzhi-crit'));
            const hasCritDmgBonus = critEffect?.modifiers?.some(m => m.target === 'crit_dmg');
            expect(hasCritDmgBonus).toBe(true);
        });
    });
});
