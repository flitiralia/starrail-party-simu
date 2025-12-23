import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { aventurine, aventurineHandlerFactory } from '../../data/characters/aventurine';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Aventurine Scenario Test', () => {
    let initialState: GameState;
    const aventurineId = 'aventurine-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        // Setup initial state with Aventurine, an Ally, and an Enemy
        const characters: Character[] = [
            {
                ...aventurine,
                id: aventurineId,
            },
            {
                ...aventurine,
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
            weaknesses: new Set(['Imaginary']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Aventurine's event handlers
        const { handlerMetadata, handlerLogic } = aventurineHandlerFactory(aventurineId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Dispatch BATTLE_START to trigger initial buffs (A4 shield)
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Blind Bet Stack Management', () => {
        it('should gain Blind Bet stacks when shielded ally is attacked', () => {
            let state = initialState;

            // Helper to get Blind Bet stacks
            const getBlindBetStacks = (s: GameState): number => {
                const unit = getUnit(s, aventurineId);
                const effect = unit?.effects.find(e => e.id.includes('blind-bet'));
                return effect?.stackCount || 0;
            };

            // Initial state: 0 stacks (秘技未使用のため)
            expect(getBlindBetStacks(state)).toBe(0);

            // Simulate enemy attacking a shielded ally
            // First, ensure ally has shield from A4
            const ally = getUnit(state, aventurineId);
            expect(ally?.shield).toBeGreaterThan(0);

            // Enemy attacks Aventurine (who has shield)
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: enemyId, targetId: aventurineId });

            // Aventurine被弾で+2 (自身被弾は+2)
            expect(getBlindBetStacks(state)).toBe(2);

            // Enemy attacks ally (if they have shield)
            const allyUnit = getUnit(state, allyId);
            if (allyUnit && allyUnit.shield > 0) {
                state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: enemyId, targetId: allyId });
                // シールド持ち味方被弾で+1
                expect(getBlindBetStacks(state)).toBe(3);
            }
        });

        it('should accumulate Blind Bet stacks on attacks', () => {
            let state = initialState;

            const getBlindBetStacks = (s: GameState): number => {
                const unit = getUnit(s, aventurineId);
                const effect = unit?.effects.find(e => e.id.includes('blind-bet'));
                return effect?.stackCount || 0;
            };

            // 攻撃前
            expect(getBlindBetStacks(state)).toBe(0);

            // 1回攻撃（シールドあり: +2）
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: enemyId, targetId: aventurineId });
            expect(getBlindBetStacks(state)).toBe(2);

            // 2回目攻撃（シールド消費後: +1）
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: enemyId, targetId: aventurineId });
            expect(getBlindBetStacks(state)).toBeGreaterThan(2);
        });
    });

    describe('Shield Stacking', () => {
        it('should stack shields from skill usage', () => {
            let state = initialState;

            // Get initial shield value
            const getShield = (s: GameState, unitId: string): number => {
                const unit = getUnit(s, unitId);
                return unit?.shield || 0;
            };

            const initialShield = getShield(state, aventurineId);
            expect(initialShield).toBeGreaterThan(0); // A4 shield from battle start

            // Use skill to add more shield
            state = dispatch(state, { type: 'SKILL', sourceId: aventurineId, targetId: aventurineId });

            const afterSkillShield = getShield(state, aventurineId);
            // Shield should have increased (stacked)
            expect(afterSkillShield).toBeGreaterThan(initialShield);
        });

        it('should respect shield cap (200% of skill shield)', () => {
            let state = initialState;

            const getShield = (s: GameState, unitId: string): number => {
                const unit = getUnit(s, unitId);
                return unit?.shield || 0;
            };

            // Spam skill to try to exceed cap
            for (let i = 0; i < 5; i++) {
                state = dispatch(state, { type: 'SKILL', sourceId: aventurineId, targetId: aventurineId });
            }

            const aventurineUnit = getUnit(state, aventurineId);
            const def = aventurineUnit?.stats.def || 0;

            // Calculate expected cap (24% DEF + 320) * 2
            const baseShield = def * 0.24 + 320;
            const expectedCap = baseShield * 2;

            const actualShield = getShield(state, aventurineId);
            // Shield should not exceed cap (with some tolerance for shield boost)
            expect(actualShield).toBeLessThanOrEqual(expectedCap * 1.5); // Allow for shield strength boost
        });
    });

    describe('Upset Debuff', () => {
        it('should apply Upset debuff on ultimate', () => {
            let state = initialState;

            // Set EP to full
            const aventurineUnit = getUnit(state, aventurineId);
            if (aventurineUnit) {
                state = {
                    ...state,
                    registry: state.registry.update(createUnitId(aventurineId), u => ({
                        ...u,
                        ep: 110
                    }))
                };
            }

            // Use ultimate
            state = dispatch(state, { type: 'ULTIMATE', sourceId: aventurineId, targetId: enemyId });

            // Check if enemy has Upset debuff
            const enemy = getUnit(state, enemyId);
            const hasUpset = enemy?.effects.some(e => e.tags?.includes('UPSET'));
            expect(hasUpset).toBe(true);
        });
    });
});
