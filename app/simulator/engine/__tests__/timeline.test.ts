import { describe, it, expect } from 'vitest';
import { Timeline } from '../timeline';
import { Unit } from '../types';
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
        } as any,
        effects: [],
        modifiers: [],
        abilities: {} as any,
        actionValue: 100,
        ...overrides,
    } as Unit;
}

describe('Timeline', () => {
    describe('constructor', () => {
        it('should sort units by action value (ascending)', () => {
            const units = [
                createMockUnit('slow', { actionValue: 200 }),
                createMockUnit('fast', { actionValue: 50 }),
                createMockUnit('medium', { actionValue: 100 }),
            ];

            const timeline = new Timeline(units);

            expect(timeline.getNext().id).toBe(createUnitId('fast'));
        });

        it('should not mutate the original array', () => {
            const units = [
                createMockUnit('slow', { actionValue: 200 }),
                createMockUnit('fast', { actionValue: 50 }),
            ];
            const originalFirst = units[0].id;

            new Timeline(units);

            expect(units[0].id).toBe(originalFirst);
        });
    });

    describe('getNext', () => {
        it('should return the unit with lowest actionValue', () => {
            const units = [
                createMockUnit('unit-a', { actionValue: 100 }),
                createMockUnit('unit-b', { actionValue: 50 }),
                createMockUnit('unit-c', { actionValue: 150 }),
            ];

            const timeline = new Timeline(units);

            expect(timeline.getNext().id).toBe(createUnitId('unit-b'));
        });

        it('should not change the timeline state', () => {
            const units = [
                createMockUnit('unit-a', { actionValue: 50 }),
                createMockUnit('unit-b', { actionValue: 100 }),
            ];

            const timeline = new Timeline(units);

            // Call getNext multiple times
            const first = timeline.getNext();
            const second = timeline.getNext();

            expect(first.id).toBe(second.id);
        });
    });

    describe('advance', () => {
        it('should return the acting unit', () => {
            const units = [
                createMockUnit('fast', { actionValue: 50, stats: { spd: 100 } as any }),
                createMockUnit('slow', { actionValue: 100, stats: { spd: 100 } as any }),
            ];

            const timeline = new Timeline(units);
            const actingUnit = timeline.advance();

            expect(actingUnit.id).toBe(createUnitId('fast'));
        });

        it('should subtract elapsed time from all units', () => {
            const units = [
                createMockUnit('fast', { actionValue: 50, stats: { spd: 100 } as any }),
                createMockUnit('slow', { actionValue: 100, stats: { spd: 100 } as any }),
            ];

            const timeline = new Timeline(units);
            timeline.advance();

            // After advance: fast had AV=50, so elapsed=50
            // slow: 100 - 50 = 50
            // fast: reset to 10000/100 = 100
            const next = timeline.getNext();
            expect(next.id).toBe(createUnitId('slow'));
            expect(next.actionValue).toBe(50);
        });

        it('should reset acting unit AV based on SPD', () => {
            const units = [
                createMockUnit('fast', { actionValue: 50, stats: { spd: 200 } as any }),
            ];

            const timeline = new Timeline(units);
            const actingUnit = timeline.advance();

            // AV should reset to 10000 / 200 = 50
            expect(actingUnit.actionValue).toBe(50);
        });

        it('should re-sort timeline after advance', () => {
            const units = [
                createMockUnit('unit-a', { actionValue: 50, stats: { spd: 50 } as any }),   // After: 200
                createMockUnit('unit-b', { actionValue: 100, stats: { spd: 200 } as any }), // After: 50
            ];

            const timeline = new Timeline(units);
            timeline.advance(); // unit-a acts, resets to 200

            // Now unit-b (AV=50) should be next
            expect(timeline.getNext().id).toBe(createUnitId('unit-b'));
        });

        it('should handle multiple advances correctly', () => {
            const units = [
                createMockUnit('fast', { actionValue: 50, stats: { spd: 100 } as any }),
                createMockUnit('slow', { actionValue: 150, stats: { spd: 100 } as any }),
            ];

            const timeline = new Timeline(units);

            // Turn 1: fast acts (AV=50), elapsed=50
            // After: fast=100, slow=100
            const turn1 = timeline.advance();
            expect(turn1.id).toBe(createUnitId('fast'));

            // Turn 2: Both at 100, first in sorted order goes
            // Depending on stable sort, either could go first
            // After first of them acts, they reset to 100
            const turn2 = timeline.advance();
            expect([createUnitId('fast'), createUnitId('slow')]).toContain(turn2.id);
        });
    });
});
