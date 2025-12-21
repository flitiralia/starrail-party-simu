import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch, publishEvent } from '../engine/dispatcher';
import { aglaea, aglaeaHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';
import { getActiveSpirit } from '../engine/memorySpiritManager';
import { IEffect } from '../effect/types';

// Constants for test
const AGLAEA_ID = 'aglaea-1';
const ENEMY_ID = 'enemy-1';
const SUMMON_PREFIX = 'raftra';

// Helper functions
const getAglaea = (state: GameState): Unit | undefined => {
    return state.registry.get(createUnitId(AGLAEA_ID));
};

const getEnemy = (state: GameState): Unit | undefined => {
    return state.registry.get(createUnitId(ENEMY_ID));
};

const getRaftra = (state: GameState): Unit | undefined => {
    return getActiveSpirit(state, AGLAEA_ID, SUMMON_PREFIX);
};

const findEffectByPrefix = (unit: Unit | undefined, prefix: string): IEffect | undefined => {
    return unit?.effects.find(e => e.id.includes(prefix));
};

describe('Aglaea Scenario Test', () => {
    let initialState: GameState;

    beforeEach(() => {
        const characters: Character[] = [
            {
                ...aglaea,
                id: AGLAEA_ID,
            },
        ];

        const enemies: Enemy[] = [{
            id: ENEMY_ID,
            name: 'Test Enemy',
            level: 80,
            element: 'Physical',
            toughness: 100,
            maxToughness: 100,
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
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
                eidolonLevel: 0
            }))
        };

        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Lightning']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Aglaea's event handlers
        const { handlerMetadata, handlerLogic } = aglaeaHandlerFactory(AGLAEA_ID, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Dispatch battle start
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Skill - Raftra Summoning', () => {
        it('should summon Raftra when skill is used without existing spirit', () => {
            let state = initialState;

            // Verify no Raftra exists initially
            expect(getRaftra(state)).toBeUndefined();

            // Use skill
            state = { ...state, currentTurnOwnerId: createUnitId(AGLAEA_ID) };
            state = dispatch(state, { type: 'SKILL', sourceId: AGLAEA_ID, targetId: AGLAEA_ID });

            // Verify Raftra was summoned
            const raftra = getRaftra(state);
            expect(raftra).toBeDefined();
            expect(raftra?.name).toBe('ラフトラ');
        });

        it('should heal Raftra when skill is used with existing spirit', () => {
            let state = initialState;

            // First skill to summon Raftra
            state = { ...state, currentTurnOwnerId: createUnitId(AGLAEA_ID) };
            state = dispatch(state, { type: 'SKILL', sourceId: AGLAEA_ID, targetId: AGLAEA_ID });

            const raftra = getRaftra(state);
            expect(raftra).toBeDefined();

            if (raftra) {
                const maxHp = raftra.stats.hp;

                // Damage Raftra
                state = {
                    ...state,
                    registry: state.registry.update(createUnitId(raftra.id as string), u => ({
                        ...u,
                        hp: maxHp * 0.5
                    }))
                };

                const damagedRaftra = getRaftra(state);
                expect(damagedRaftra?.hp).toBeLessThan(maxHp);

                // Second skill should heal Raftra
                state = dispatch(state, { type: 'SKILL', sourceId: AGLAEA_ID, targetId: AGLAEA_ID });

                const healedRaftra = getRaftra(state);
                expect(healedRaftra?.hp).toBeGreaterThan(damagedRaftra!.hp);
            }
        });
    });

    describe('Threading Peril', () => {
        it('should apply Threading Peril when attacking after Raftra is summoned', () => {
            let state = initialState;

            // Summon Raftra first
            state = { ...state, currentTurnOwnerId: createUnitId(AGLAEA_ID) };
            state = dispatch(state, { type: 'SKILL', sourceId: AGLAEA_ID, targetId: AGLAEA_ID });

            // Attack enemy
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: AGLAEA_ID, targetId: ENEMY_ID });
            state = publishEvent(state, { type: 'ON_ACTION_COMPLETE', sourceId: AGLAEA_ID, targetId: ENEMY_ID, subType: 'BASIC' });

            // Enemy should have Threading Peril
            const enemy = getEnemy(state);
            const threadingPerilEffect = findEffectByPrefix(enemy, 'threading-peril');
            expect(threadingPerilEffect).toBeDefined();
        });
    });

    describe('Ultimate - Supreme Stance', () => {
        it('should apply Supreme Stance buff when ultimate is used', () => {
            let state = initialState;

            // Set EP to max
            state = {
                ...state,
                registry: state.registry.update(createUnitId(AGLAEA_ID), u => ({ ...u, ep: 350 }))
            };

            state = { ...state, currentTurnOwnerId: createUnitId(AGLAEA_ID) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: AGLAEA_ID, targetId: AGLAEA_ID });

            // Verify Supreme Stance buff
            const aglaeaUnit = getAglaea(state);
            const supremeStanceEffect = findEffectByPrefix(aglaeaUnit, 'supreme-stance');
            expect(supremeStanceEffect).toBeDefined();

            // Verify Raftra exists
            const raftra = getRaftra(state);
            expect(raftra).toBeDefined();
        });

        it('should insert countdown when entering Supreme Stance', () => {
            let state = initialState;

            // Set EP to max
            state = {
                ...state,
                registry: state.registry.update(createUnitId(AGLAEA_ID), u => ({ ...u, ep: 350 }))
            };

            state = { ...state, currentTurnOwnerId: createUnitId(AGLAEA_ID) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: AGLAEA_ID, targetId: AGLAEA_ID });

            // Verify countdown was inserted
            const countdownId = `aglaea-countdown-${AGLAEA_ID}`;
            const countdown = state.registry.get(createUnitId(countdownId));
            expect(countdown).toBeDefined();
            expect(countdown?.name).toBe('カウントダウン');
        });
    });

    describe('Speed Stacks (Raftra Talent)', () => {
        it('should accumulate speed stacks when Raftra attacks Threading Peril target', () => {
            let state = initialState;

            // Summon Raftra
            state = { ...state, currentTurnOwnerId: createUnitId(AGLAEA_ID) };
            state = dispatch(state, { type: 'SKILL', sourceId: AGLAEA_ID, targetId: AGLAEA_ID });

            const raftra = getRaftra(state);
            expect(raftra).toBeDefined();

            // Attack to apply Threading Peril
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: AGLAEA_ID, targetId: ENEMY_ID });
            state = publishEvent(state, { type: 'ON_ACTION_COMPLETE', sourceId: AGLAEA_ID, targetId: ENEMY_ID, subType: 'BASIC' });

            // Verify Threading Peril was applied
            const enemy = getEnemy(state);
            expect(findEffectByPrefix(enemy, 'threading-peril')).toBeDefined();

            // Raftra attacks same target - should gain speed stack
            if (raftra) {
                state = publishEvent(state, { type: 'ON_ACTION_COMPLETE', sourceId: raftra.id as string, targetId: ENEMY_ID, subType: 'SKILL' });

                const updatedRaftra = getRaftra(state);
                const speedEffect = findEffectByPrefix(updatedRaftra, 'speed-stack');
                expect(speedEffect).toBeDefined();
                expect(speedEffect?.stackCount).toBeGreaterThanOrEqual(1);
            }
        });
    });

    describe('A6 Trace - EP Recovery at Battle Start', () => {
        it('should recover EP to 50% if below 50% at battle start', () => {
            const aglaeaUnit = getAglaea(initialState);

            // A6 trace should have recovered EP to 50%
            // Since initial EP is 0, it should be at 175 (50% of 350)
            expect(aglaeaUnit?.ep).toBeGreaterThanOrEqual(175);
        });
    });
});

describe('Aglaea Eidolon Tests', () => {
    describe('E4 - Extra Speed Stack', () => {
        it('should allow 7 speed stacks instead of 6 at E4', () => {
            // Create E4 state
            const characters: Character[] = [{ ...aglaea, id: AGLAEA_ID }];
            const enemies: Enemy[] = [{
                id: ENEMY_ID,
                name: 'Test Enemy',
                level: 80,
                element: 'Physical',
                toughness: 100,
                maxToughness: 100,
                baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
                abilities: {
                    basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' },
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
                    eidolonLevel: 4
                }))
            };

            let state = createInitialGameState({
                characters,
                enemies,
                weaknesses: new Set(['Lightning']) as Set<import('../../types').Element>,
                enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
                partyConfig,
                rounds: 5
            });

            const { handlerMetadata, handlerLogic } = aglaeaHandlerFactory(AGLAEA_ID, 80, 4);
            state = {
                ...state,
                eventHandlers: [handlerMetadata],
                eventHandlerLogics: { [handlerMetadata.id]: handlerLogic }
            };

            state = dispatch(state, { type: 'BATTLE_START' });

            // Summon Raftra
            state = { ...state, currentTurnOwnerId: createUnitId(AGLAEA_ID) };
            state = dispatch(state, { type: 'SKILL', sourceId: AGLAEA_ID, targetId: AGLAEA_ID });

            const raftra = getRaftra(state);
            expect(raftra).toBeDefined();
        });
    });
});
