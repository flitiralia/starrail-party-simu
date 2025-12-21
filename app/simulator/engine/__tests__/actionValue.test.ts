import { describe, it, expect, beforeEach } from 'vitest';
import {
    calculateActionValue,
    calculateBaseAV,
    initializeActionQueue,
    updateActionQueue,
    setUnitActionValue,
    advanceUnitAction,
    delayUnitAction,
    resetUnitActionValue,
    advanceTimeline,
    adjustActionValueForSpeedChange,
    BASE_ACTION_VALUE
} from '../actionValue';
import { Unit, GameState } from '../types';
import { UnitRegistry } from '../unitRegistry';
import { createUnitId } from '../unitId';

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
            energy_regen_rate: 0,
            crit_rate: 0.05,
            crit_dmg: 0.5,
            break_effect: 0,
            outgoing_healing_boost: 0,
            effect_hit_rate: 0,
            effect_res: 0,
        } as any,
        effects: [],
        modifiers: [],
        abilities: {} as any,
        actionValue: 100,
        ...overrides,
    } as Unit;
}

// Mock GameState Factory
function createMockState(units: Unit[]): GameState {
    const registry = UnitRegistry.fromArray(units);
    return {
        registry,
        actionQueue: units.map(u => ({ unitId: u.id as string, actionValue: u.actionValue })),
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

describe('Action Value System', () => {
    describe('calculateActionValue', () => {
        it('should calculate AV as 10000/SPD', () => {
            expect(calculateActionValue(100)).toBe(100);
            expect(calculateActionValue(200)).toBe(50);
            expect(calculateActionValue(50)).toBe(200);
        });

        it('should handle speed = 0 gracefully', () => {
            // Should return BASE_ACTION_VALUE to prevent division by zero
            expect(calculateActionValue(0)).toBe(BASE_ACTION_VALUE);
        });

        it('should handle very high speed', () => {
            expect(calculateActionValue(1000)).toBe(10);
        });
    });

    describe('calculateBaseAV', () => {
        it('should calculate base AV as 10000/SPD', () => {
            expect(calculateBaseAV(100)).toBe(100);
            expect(calculateBaseAV(134)).toBeCloseTo(74.63, 1);
        });

        it('should handle edge case of speed < 1', () => {
            // Should use Math.max(1, speed) to prevent NaN/Infinity
            expect(calculateBaseAV(0)).toBe(10000);
        });
    });

    describe('initializeActionQueue', () => {
        it('should create queue sorted by AV', () => {
            const units = [
                createMockUnit('slow', { stats: { spd: 50 } as any }),
                createMockUnit('fast', { stats: { spd: 200 } as any }),
                createMockUnit('medium', { stats: { spd: 100 } as any }),
            ];

            const queue = initializeActionQueue(units);

            expect(queue[0].unitId).toBe(createUnitId('fast'));   // AV = 50
            expect(queue[1].unitId).toBe(createUnitId('medium')); // AV = 100
            expect(queue[2].unitId).toBe(createUnitId('slow'));   // AV = 200
        });
    });

    describe('updateActionQueue', () => {
        it('should sync queue with unit action values', () => {
            const units = [
                createMockUnit('unit-a', { actionValue: 50, hp: 100 }),
                createMockUnit('unit-b', { actionValue: 150, hp: 100 }),
            ];
            const state = createMockState(units);
            // Manually change unit-b's AV in registry
            const modifiedState = {
                ...state,
                registry: state.registry.update(createUnitId('unit-b'), u => ({ ...u, actionValue: 30 }))
            };

            const result = updateActionQueue(modifiedState);

            expect(result.actionQueue[0].unitId).toBe(createUnitId('unit-b')); // Now faster
            expect(result.actionQueue[0].actionValue).toBe(30);
        });

        it('should filter out dead units', () => {
            const units = [
                createMockUnit('alive', { actionValue: 50, hp: 100 }),
                createMockUnit('dead', { actionValue: 30, hp: 0 }),
            ];
            const state = createMockState(units);

            const result = updateActionQueue(state);

            expect(result.actionQueue.length).toBe(1);
            expect(result.actionQueue[0].unitId).toBe(createUnitId('alive'));
        });
    });

    describe('setUnitActionValue', () => {
        it('should set unit AV directly', () => {
            const unit = createMockUnit('test', { actionValue: 100 });
            const state = createMockState([unit]);

            const result = setUnitActionValue(state, 'test', 50);

            const updated = result.registry.get(createUnitId('test'));
            expect(updated?.actionValue).toBe(50);
        });

        it('should sync action queue by default', () => {
            const units = [
                createMockUnit('unit-a', { actionValue: 100 }),
                createMockUnit('unit-b', { actionValue: 50 }),
            ];
            const state = createMockState(units);

            const result = setUnitActionValue(state, 'unit-a', 30);

            expect(result.actionQueue[0].unitId).toBe(createUnitId('unit-a'));
            expect(result.actionQueue[0].actionValue).toBe(30);
        });

        it('should skip queue sync when specified', () => {
            const unit = createMockUnit('test', { actionValue: 100 });
            const state = createMockState([unit]);

            const result = setUnitActionValue(state, 'test', 50, false);

            // Unit updated but queue not synced
            const updated = result.registry.get(createUnitId('test'));
            expect(updated?.actionValue).toBe(50);
            expect(result.actionQueue[0].actionValue).toBe(100); // Still old value
        });
    });

    describe('advanceUnitAction', () => {
        it('should advance by percentage of base AV', () => {
            // SPD=100, Base AV = 100
            const unit = createMockUnit('test', { actionValue: 100, stats: { spd: 100 } as any });
            const state = createMockState([unit]);

            // Advance by 50% = 50
            const result = advanceUnitAction(state, 'test', 0.5);

            const updated = result.registry.get(createUnitId('test'));
            expect(updated?.actionValue).toBe(50);
        });

        it('should advance by fixed value', () => {
            const unit = createMockUnit('test', { actionValue: 100 });
            const state = createMockState([unit]);

            const result = advanceUnitAction(state, 'test', 30, 'fixed');

            const updated = result.registry.get(createUnitId('test'));
            expect(updated?.actionValue).toBe(70);
        });

        it('should not go below 0', () => {
            const unit = createMockUnit('test', { actionValue: 20 });
            const state = createMockState([unit]);

            const result = advanceUnitAction(state, 'test', 50, 'fixed');

            const updated = result.registry.get(createUnitId('test'));
            expect(updated?.actionValue).toBe(0);
        });
    });

    describe('delayUnitAction', () => {
        it('should delay by percentage of base AV', () => {
            // SPD=100, Base AV = 100
            const unit = createMockUnit('test', { actionValue: 50, stats: { spd: 100 } as any });
            const state = createMockState([unit]);

            // Delay by 30% = 30
            const result = delayUnitAction(state, 'test', 0.3);

            const updated = result.registry.get(createUnitId('test'));
            expect(updated?.actionValue).toBe(80);
        });

        it('should delay by fixed value', () => {
            const unit = createMockUnit('test', { actionValue: 50 });
            const state = createMockState([unit]);

            const result = delayUnitAction(state, 'test', 25, 'fixed');

            const updated = result.registry.get(createUnitId('test'));
            expect(updated?.actionValue).toBe(75);
        });
    });

    describe('resetUnitActionValue', () => {
        it('should reset AV to 10000/SPD', () => {
            // SPD=100, expected AV = 100
            const unit = createMockUnit('test', { actionValue: 0, stats: { spd: 100 } as any });
            const state = createMockState([unit]);

            const result = resetUnitActionValue(state, 'test');

            const updated = result.registry.get(createUnitId('test'));
            expect(updated?.actionValue).toBe(100);
        });

        it('should calculate correctly for different speeds', () => {
            // SPD=134, expected AV ≈ 74.63
            const unit = createMockUnit('test', { actionValue: 0, stats: { spd: 134 } as any });
            const state = createMockState([unit]);

            const result = resetUnitActionValue(state, 'test');

            const updated = result.registry.get(createUnitId('test'));
            expect(updated?.actionValue).toBeCloseTo(74.63, 1);
        });
    });

    describe('advanceTimeline', () => {
        it('should reduce all units AV by amount', () => {
            const units = [
                createMockUnit('unit-a', { actionValue: 100 }),
                createMockUnit('unit-b', { actionValue: 80 }),
            ];
            const state = createMockState(units);

            const result = advanceTimeline(state, 50);

            // Check that both units had their AV reduced
            const unitA = result.actionQueue.find(e => e.unitId === createUnitId('unit-a'));
            const unitB = result.actionQueue.find(e => e.unitId === createUnitId('unit-b'));
            expect(unitA?.actionValue).toBe(50); // 100 - 50
            expect(unitB?.actionValue).toBe(30); // 80 - 50
        });

        it('should not reduce below 0', () => {
            const unit = createMockUnit('test', { actionValue: 30 });
            const state = createMockState([unit]);

            const result = advanceTimeline(state, 50);

            expect(result.actionQueue[0].actionValue).toBe(0);
        });

        it('should update game time', () => {
            const state = createMockState([createMockUnit('test')]);

            const result = advanceTimeline(state, 75);

            expect(result.time).toBe(75);
        });

        it('should accumulate time across multiple advances', () => {
            let state = createMockState([createMockUnit('test')]);

            state = advanceTimeline(state, 30);
            state = advanceTimeline(state, 20);

            expect(state.time).toBe(50);
        });
    });

    describe('adjustActionValueForSpeedChange', () => {
        it('should adjust AV proportionally when speed increases', () => {
            // Current AV = 100, SPD 100 -> 200
            // New AV = 100 * (100 / 200) = 50
            const unit = createMockUnit('test', { actionValue: 100 });

            const result = adjustActionValueForSpeedChange(unit, 100, 200);

            expect(result.actionValue).toBe(50);
        });

        it('should adjust AV proportionally when speed decreases', () => {
            // Current AV = 50, SPD 200 -> 100
            // New AV = 50 * (200 / 100) = 100
            const unit = createMockUnit('test', { actionValue: 50 });

            const result = adjustActionValueForSpeedChange(unit, 200, 100);

            expect(result.actionValue).toBe(100);
        });

        it('should return same unit if speeds are equal', () => {
            const unit = createMockUnit('test', { actionValue: 100 });

            const result = adjustActionValueForSpeedChange(unit, 100, 100);

            expect(result).toBe(unit);
        });

        it('should return same unit if new speed is <= 0', () => {
            const unit = createMockUnit('test', { actionValue: 100 });

            const result = adjustActionValueForSpeedChange(unit, 100, 0);

            expect(result).toBe(unit);
        });
    });
});
