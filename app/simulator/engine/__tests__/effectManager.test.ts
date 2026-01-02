import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addEffect, removeEffect } from '../effectManager';
import { GameState, Unit } from '../types';
import { IEffect } from '../../effect/types';
import { UnitRegistry } from '../unitRegistry';
import { createUnitId } from '../unitId';

// Mock dependencies
vi.mock('../dispatcher', () => ({
    publishEvent: vi.fn((state: GameState, _event: any) => state)
}));

vi.mock('../../statBuilder', () => ({
    recalculateUnitStats: vi.fn((unit: Unit, _units: Unit[]) => unit.stats)
}));

vi.mock('../../effect/relicHandler', () => ({
    updatePassiveBuffs: vi.fn((state: GameState) => state)
}));

// Mock Unit Factory
function createMockUnit(id: string = 'unit-1', overrides: Partial<Unit> = {}): Unit {
    return {
        id: createUnitId(id),
        name: 'Test Character',
        isEnemy: false,
        element: 'Physical',
        path: 'Destruction',
        level: 80,
        maxToughness: 100,
        toughness: 100,
        hp: 1000,
        ep: 0,
        stats: {
            hp: 1000,
            atk: 1000,
            def: 1000,
            spd: 100,
            max_ep: 140,
        } as any,
        effects: [],
        modifiers: [],
        abilities: {} as any,
        actionValue: 100,
        ...overrides,
    } as Unit;
}

// Mock Effect Factory
function createMockEffect(overrides: Partial<IEffect> = {}): IEffect {
    return {
        id: 'test-effect',
        name: 'Test Effect',
        category: 'BUFF',
        sourceUnitId: 'source-unit',
        duration: 2,
        durationType: 'TURN_END_BASED',
        statModifiers: {},
        ...overrides,
    } as IEffect;
}

// Mock GameState Factory
function createMockState(units: Unit[]): GameState {
    const registry = UnitRegistry.fromArray(units);
    return {
        registry,
        actionQueue: [],
        pendingActions: [],
        currentTurnOwnerId: null,
        log: [],
        config: {
            characters: [],
            enemies: [],
            weaknesses: new Set(),
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        },
        eventHandlers: [],
        eventHandlerLogics: {},
        round: 1,
        time: 0,
        sp: 3,
        maxSp: 5,
        nextLogId: 1,
        animaStickyFrozen: false,
    } as unknown as GameState;
}

describe('Effect Manager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('addEffect', () => {
        it('should add a new effect to unit', () => {
            const unit = createMockUnit('target');
            const state = createMockState([unit]);
            const effect = createMockEffect({ id: 'buff-1', name: 'ATK Buff' });

            const result = addEffect(state, 'target', effect);

            const updatedUnit = result.registry.get(createUnitId('target'));
            expect(updatedUnit?.effects.length).toBe(1);
            expect(updatedUnit?.effects[0].id).toBe('buff-1');
        });

        it('should return same state if target not found', () => {
            const state = createMockState([]);
            const effect = createMockEffect();

            const result = addEffect(state, 'nonexistent', effect);

            expect(result).toBe(state);
        });

        it('should block debuffs on immune units', () => {
            const unit = createMockUnit('target', { debuffImmune: true } as any);
            const state = createMockState([unit]);
            const debuff = createMockEffect({ id: 'debuff-1', category: 'DEBUFF' });

            const result = addEffect(state, 'target', debuff);

            const updatedUnit = result.registry.get(createUnitId('target'));
            expect(updatedUnit?.effects.length).toBe(0);
        });

        it('should allow buffs on immune units', () => {
            const unit = createMockUnit('target', { debuffImmune: true } as any);
            const state = createMockState([unit]);
            const buff = createMockEffect({ id: 'buff-1', category: 'BUFF' });

            const result = addEffect(state, 'target', buff);

            const updatedUnit = result.registry.get(createUnitId('target'));
            expect(updatedUnit?.effects.length).toBe(1);
        });

        describe('stacking behavior', () => {
            it('should default to legacy "auto" behavior (increment by 1 if not specified)', () => {
                const existingEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 1,
                    maxStacks: 5
                });
                const unit = createMockUnit('target', { effects: [existingEffect] });
                const state = createMockState([unit]);

                const newEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    maxStacks: 5
                });

                const result = addEffect(state, 'target', newEffect);
                const updatedUnit = result.registry.get(createUnitId('target'));
                expect(updatedUnit?.effects[0].stackCount).toBe(2);
            });

            it('should use "add" strategy correctly', () => {
                const existingEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 2,
                    maxStacks: 10
                });
                const unit = createMockUnit('target', { effects: [existingEffect] });
                const state = createMockState([unit]);

                const newEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 3,
                    stackStrategy: 'add',
                    maxStacks: 10
                });

                const result = addEffect(state, 'target', newEffect);
                const updatedUnit = result.registry.get(createUnitId('target'));
                expect(updatedUnit?.effects[0].stackCount).toBe(5); // 2 + 3
            });

            it('should use "replace" strategy correctly', () => {
                const existingEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 5,
                    maxStacks: 10
                });
                const unit = createMockUnit('target', { effects: [existingEffect] });
                const state = createMockState([unit]);

                const newEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 1,
                    stackStrategy: 'replace',
                    maxStacks: 10
                });

                const result = addEffect(state, 'target', newEffect);
                const updatedUnit = result.registry.get(createUnitId('target'));
                expect(updatedUnit?.effects[0].stackCount).toBe(1); // Replaced with 1
            });

            it('should use "max" strategy correctly', () => {
                const existingEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 3,
                    maxStacks: 10
                });
                const unit = createMockUnit('target', { effects: [existingEffect] });
                const state = createMockState([unit]);

                // Case 1: New is lower (should ignore)
                const lowerEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 2,
                    stackStrategy: 'max',
                    maxStacks: 10
                });
                let result = addEffect(state, 'target', lowerEffect);
                let updatedUnit = result.registry.get(createUnitId('target'));
                expect(updatedUnit?.effects[0].stackCount).toBe(3);

                // Case 2: New is higher (should update)
                const higherEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 5,
                    stackStrategy: 'max',
                    maxStacks: 10
                });
                result = addEffect(state, 'target', higherEffect);
                updatedUnit = result.registry.get(createUnitId('target'));
                expect(updatedUnit?.effects[0].stackCount).toBe(5);
            });

            it('should not exceed max stacks with any strategy', () => {
                const existingEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 3,
                    maxStacks: 3
                });
                const unit = createMockUnit('target', { effects: [existingEffect] });
                const state = createMockState([unit]);

                const newEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 10,
                    stackStrategy: 'add', // 3 + 10 = 13 -> clamped to 3
                    maxStacks: 3
                });

                const result = addEffect(state, 'target', newEffect);

                const updatedUnit = result.registry.get(createUnitId('target'));
                expect(updatedUnit?.effects[0].stackCount).toBe(3); // Capped at max
            });

            it('should refresh duration on stack', () => {
                const existingEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    stackCount: 1,
                    maxStacks: 5,
                    duration: 1
                });
                const unit = createMockUnit('target', { effects: [existingEffect] });
                const state = createMockState([unit]);

                const newEffect = createMockEffect({
                    id: 'stackable',
                    sourceUnitId: 'source-1',
                    maxStacks: 5,
                    duration: 3
                });

                const result = addEffect(state, 'target', newEffect);

                const updatedUnit = result.registry.get(createUnitId('target'));
                expect(updatedUnit?.effects[0].duration).toBe(3);
            });

            it('should add separate effect from different source', () => {
                const existingEffect = createMockEffect({
                    id: 'buff',
                    sourceUnitId: 'source-1',
                    stackCount: 1
                });
                const unit = createMockUnit('target', { effects: [existingEffect] });
                const state = createMockState([unit]);

                const newEffect = createMockEffect({
                    id: 'buff',
                    sourceUnitId: 'source-2' // Different source
                });

                const result = addEffect(state, 'target', newEffect);

                const updatedUnit = result.registry.get(createUnitId('target'));
                expect(updatedUnit?.effects.length).toBe(2);
            });
        });

        it('should call onApply callback if provided', () => {
            const unit = createMockUnit('target');
            const state = createMockState([unit]);

            const onApply = vi.fn((t: Unit, s: GameState) => s);
            const effect = createMockEffect({ id: 'with-callback', onApply });

            addEffect(state, 'target', effect);

            expect(onApply).toHaveBeenCalledTimes(1);
        });

        it('should set appliedDuringTurnOf when skipFirstTurnDecrement is true', () => {
            const unit = createMockUnit('target');
            const state = createMockState([unit]);
            const stateWithTurn = { ...state, currentTurnOwnerId: createUnitId('acting-unit') };

            const effect = createMockEffect({
                id: 'skip-first',
                skipFirstTurnDecrement: true
            });

            const result = addEffect(stateWithTurn as GameState, 'target', effect);

            const updatedUnit = result.registry.get(createUnitId('target'));
            expect(updatedUnit?.effects[0].appliedDuringTurnOf).toBe(createUnitId('acting-unit'));
        });
    });

    describe('removeEffect', () => {
        it('should remove effect from unit', () => {
            const effect = createMockEffect({ id: 'to-remove' });
            const unit = createMockUnit('target', { effects: [effect] });
            const state = createMockState([unit]);

            const result = removeEffect(state, 'target', 'to-remove');

            const updatedUnit = result.registry.get(createUnitId('target'));
            expect(updatedUnit?.effects.length).toBe(0);
        });

        it('should return same state if target not found', () => {
            const state = createMockState([]);

            const result = removeEffect(state, 'nonexistent', 'any-effect');

            expect(result).toBe(state);
        });

        it('should return same state if effect not found', () => {
            const unit = createMockUnit('target', { effects: [] });
            const state = createMockState([unit]);

            const result = removeEffect(state, 'target', 'nonexistent-effect');

            expect(result).toBe(state);
        });

        it('should call onRemove callback if provided', () => {
            const onRemove = vi.fn((t: Unit, s: GameState) => s);
            const effect = createMockEffect({ id: 'with-callback', onRemove });
            const unit = createMockUnit('target', { effects: [effect] });
            const state = createMockState([unit]);

            removeEffect(state, 'target', 'with-callback');

            expect(onRemove).toHaveBeenCalledTimes(1);
        });

        it('should unregister event handler when effect removed', () => {
            const effect = createMockEffect({
                id: 'handler-effect',
                subscribesTo: ['ON_TURN_START'] as any,
                onEvent: vi.fn()
            });
            const unit = createMockUnit('target', { effects: [effect] });
            const state = createMockState([unit]);
            const stateWithHandler = {
                ...state,
                eventHandlers: [{ id: 'handler-effect', subscribesTo: ['ON_TURN_START'] as any }],
                eventHandlerLogics: { 'handler-effect': vi.fn() }
            };

            const result = removeEffect(stateWithHandler as GameState, 'target', 'handler-effect');

            expect(result.eventHandlers.length).toBe(0);
            expect(result.eventHandlerLogics['handler-effect']).toBeUndefined();
        });

        it('should remove linked effects when parent is removed', () => {
            const parentEffect = createMockEffect({ id: 'parent-effect' });
            const linkedEffect = createMockEffect({
                id: 'linked-effect',
                durationType: 'LINKED',
                linkedEffectId: 'parent-effect'
            });

            const unitA = createMockUnit('unit-a', { effects: [parentEffect] });
            const unitB = createMockUnit('unit-b', { effects: [linkedEffect] });
            const state = createMockState([unitA, unitB]);

            const result = removeEffect(state, 'unit-a', 'parent-effect');

            const updatedUnitB = result.registry.get(createUnitId('unit-b'));
            expect(updatedUnitB?.effects.length).toBe(0); // Linked effect also removed
        });
    });
});
