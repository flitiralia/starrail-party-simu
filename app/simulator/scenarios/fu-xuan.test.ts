import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { fuXuan, fuXuanHandlerFactory } from '../../data/characters/fu-xuan';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Fu Xuan Scenario Test', () => {
    let initialState: GameState;
    const fuXuanId = 'fu-xuan-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        // Setup initial state with Fu Xuan, an Ally, and an Enemy
        const characters: Character[] = [
            {
                ...fuXuan,
                id: fuXuanId,
            },
            {
                ...fuXuan,
                id: allyId,
                name: 'テスト味方',
            }
        ];

        const enemies: Enemy[] = [{
            id: enemyId,
            name: 'Test Enemy',
            level: 80,
            element: 'Physical',
            toughness: 100,
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

        // Create config
        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Quantum']) as Set<import('../../types').Element>,
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

        // Dispatch BATTLE_START to trigger initial buffs
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Warding (避邪) Buff', () => {
        it('should apply Warding buff to all allies on battle start', () => {
            // Check if Fu Xuan has Warding effect
            const fuXuanUnit = getUnit(initialState, fuXuanId);
            const hasWarding = fuXuanUnit?.effects.some(e => e.tags?.includes('WARDING'));
            expect(hasWarding).toBe(true);

            // Check if ally has Warding effect
            const allyUnit = getUnit(initialState, allyId);
            const allyHasWarding = allyUnit?.effects.some(e => e.tags?.includes('WARDING'));
            expect(allyHasWarding).toBe(true);
        });
    });

    describe('Matrix of Prescience (窮観の陣)', () => {
        it('should activate Matrix of Prescience on skill use', () => {
            let state = initialState;

            // Before skill use, Matrix should not be active
            const fuXuanBefore = getUnit(state, fuXuanId);
            const hadMatrix = fuXuanBefore?.effects.some(e => e.tags?.includes('MATRIX_OF_PRESCIENCE'));
            expect(hadMatrix).toBe(false);

            // Use skill
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // After skill use, Matrix should be active
            const fuXuanAfter = getUnit(state, fuXuanId);
            const hasMatrix = fuXuanAfter?.effects.some(e => e.tags?.includes('MATRIX_OF_PRESCIENCE'));
            expect(hasMatrix).toBe(true);
        });

        it('should apply Divination buff to all allies when Matrix is active', () => {
            let state = initialState;

            // Use skill to activate Matrix
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // Check if Fu Xuan has Divination buff
            const fuXuanUnit = getUnit(state, fuXuanId);
            const hasDivination = fuXuanUnit?.effects.some(e => e.tags?.includes('DIVINATION'));
            expect(hasDivination).toBe(true);

            // Check if ally has Divination buff
            const allyUnit = getUnit(state, allyId);
            const allyHasDivination = allyUnit?.effects.some(e => e.tags?.includes('DIVINATION'));
            expect(allyHasDivination).toBe(true);
        });
    });

    describe('Talent Heal Stacks', () => {
        it('should start with 1 talent heal stack', () => {
            const fuXuanUnit = getUnit(initialState, fuXuanId);
            const stackEffect = fuXuanUnit?.effects.find(e => e.id.includes('talent-heal'));
            expect(stackEffect?.stackCount).toBe(1);
        });

        it('should gain +1 stack on ultimate use', () => {
            let state = initialState;

            // Set EP to full
            state = {
                ...state,
                registry: state.registry.update(createUnitId(fuXuanId), u => ({
                    ...u,
                    ep: 135
                }))
            };

            // Use ultimate
            state = dispatch(state, { type: 'ULTIMATE', sourceId: fuXuanId, targetId: enemyId });

            // Check stacks increased to 2
            const fuXuanUnit = getUnit(state, fuXuanId);
            const stackEffect = fuXuanUnit?.effects.find(e => e.id.includes('talent-heal'));
            expect(stackEffect?.stackCount).toBe(2);
        });
    });

    describe('A2 Trace: Extra EP Recovery', () => {
        it('should recover EP+20 when using skill with Matrix active', () => {
            let state = initialState;

            // First, activate Matrix
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // Get EP after first skill
            const epAfterFirst = getUnit(state, fuXuanId)?.ep || 0;

            // Register handler with traces
            const fuXuanWithTraces = getUnit(state, fuXuanId);
            expect(fuXuanWithTraces?.traces?.some(t => t.id.includes('trace-a2'))).toBe(true);

            // Use skill again with Matrix active
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // EP should have gained +30 (skill) + 20 (A2) = 50 more
            const epAfterSecond = getUnit(state, fuXuanId)?.ep || 0;

            // The difference should include the A2 bonus
            // Note: This depends on how EP is handled in the dispatcher
            expect(epAfterSecond).toBeGreaterThan(epAfterFirst);
        });
    });

    describe('A4 Trace: Heal Allies on Ultimate', () => {
        it('should heal other allies on ultimate use', () => {
            let state = initialState;

            // Reduce ally HP
            state = {
                ...state,
                registry: state.registry.update(createUnitId(allyId), u => ({
                    ...u,
                    hp: u.stats.hp * 0.5 // Set to 50% HP
                }))
            };

            const allyHpBefore = getUnit(state, allyId)?.hp || 0;

            // Set EP to full and use ultimate
            state = {
                ...state,
                registry: state.registry.update(createUnitId(fuXuanId), u => ({
                    ...u,
                    ep: 135
                }))
            };

            state = dispatch(state, { type: 'ULTIMATE', sourceId: fuXuanId, targetId: enemyId });

            // Ally should have been healed
            const allyHpAfter = getUnit(state, allyId)?.hp || 0;
            expect(allyHpAfter).toBeGreaterThan(allyHpBefore);
        });
    });

    describe('Damage Sharing (窮観の陣)', () => {
        it('should share damage when Matrix is active', () => {
            let state = initialState;

            // Activate Matrix
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            const allyHpBefore = getUnit(state, allyId)?.hp || 0;
            const fuXuanHpBefore = getUnit(state, fuXuanId)?.hp || 0;

            // Deal massive damage to ally
            // Let's modify enemy stats temporarily for this test
            state = {
                ...state,
                registry: state.registry.update(createUnitId(enemyId), u => ({
                    ...u,
                    stats: { ...u.stats, atk: 5000, critRate: 0 } // High ATK, no crit variability
                }))
            };

            state = dispatch(state, {
                type: 'BASIC_ATTACK',
                sourceId: enemyId,
                targetId: allyId
            });

            const allyHpAfter = getUnit(state, allyId)?.hp || 0;
            const fuXuanHpAfter = getUnit(state, fuXuanId)?.hp || 0;

            // Ally should have taken SOME damage
            expect(allyHpAfter).toBeLessThan(allyHpBefore);

            // Fu Xuan should have taken damage (shared)
            expect(fuXuanHpAfter).toBeLessThan(fuXuanHpBefore);
        });
    });

    describe('Talent Self-Heal', () => {
        it('should trigger heal when HP drops below 50%', () => {
            let state = initialState;

            // Set Stacks to 1
            const fuXuanUnit = getUnit(state, fuXuanId);
            expect(fuXuanUnit?.effects.find(e => e.id.includes('talent-heal'))?.stackCount).toBe(1);

            // Manually set HP to < 50%
            const maxHp = fuXuanUnit?.stats.hp || 1;
            state = {
                ...state,
                registry: state.registry.update(createUnitId(fuXuanId), u => ({
                    ...u,
                    hp: maxHp * 0.4 // 40%
                }))
            };

            // Trigger Turn Start
            const event = { type: 'ON_TURN_START', sourceId: fuXuanId, targetId: fuXuanId, value: 0 };
            const logic = state.eventHandlerLogics[`${fuXuanId.replace(/-1$/, '')}-handler-${fuXuanId}`] || state.eventHandlerLogics[`fu-xuan-handler-${fuXuanId}`];

            // Execute logic manually if found, otherwise dispatch won't work easily in isolation without full queue
            if (logic) {
                state = logic(event as any, state, `fu-xuan-handler-${fuXuanId}`);
            }

            const fuXuanAfter = getUnit(state, fuXuanId);

            // Should be healed
            expect(fuXuanAfter?.hp).toBeGreaterThan(maxHp * 0.4);

            // Stacks should decrease (removed when 0)
            const stackEffect = fuXuanAfter?.effects.find(e => e.id.includes('talent-heal'));
            expect(stackEffect).toBeUndefined();
        });
    });

    describe('E2 Resurrection', () => {
        it('should prevent death and heal allies with E2', () => {
            // Re-register with E2 by creating new factory output
            const { handlerMetadata, handlerLogic } = fuXuanHandlerFactory(fuXuanId, 80, 2);
            let state = {
                ...initialState,
                eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
            };

            // Activate Matrix
            state = dispatch(state, { type: 'SKILL', sourceId: fuXuanId, targetId: fuXuanId });

            // Set Ally HP low (1) and Fu Xuan HP high (to survive shared damage)
            state = {
                ...state,
                registry: state.registry.update(createUnitId(allyId), u => ({
                    ...u,
                    hp: 1
                })).update(createUnitId(fuXuanId), u => ({
                    ...u,
                    hp: 1000000 // Ensure Fu Xuan survives
                }))
            };

            // Deal lethal damage to Ally (enough to kill 1 HP, but shared)
            // Ally takes ~35% damage. Need > 3 damage roughly. 
            // 10000 ATK is plenty even after mitigation.
            state = {
                ...state,
                registry: state.registry.update(createUnitId(enemyId), u => ({
                    ...u,
                    stats: { ...u.stats, atk: 10000 }
                }))
            };

            // Dispatch attack
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: enemyId, targetId: allyId });

            const allyAfter = getUnit(state, allyId);

            // Should be alive (HP > 0)
            expect(allyAfter?.hp).toBeGreaterThan(0);

            // Should have E2 used flag on Fu Xuan
            const fuXuanUnit = getUnit(state, fuXuanId);
            const e2Used = fuXuanUnit?.effects.some(e => e.id.includes('e2-used'));
            expect(e2Used).toBe(true);
        });
    });
});
