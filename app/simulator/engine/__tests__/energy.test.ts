import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    calculateEnergyGain,
    addEnergy,
    addEnergyToUnit,
    initializeEnergy
} from '../energy';
import { Unit, GameState, IEvent } from '../types';
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
            physical_dmg_boost: 0,
            fire_dmg_boost: 0,
            ice_dmg_boost: 0,
            lightning_dmg_boost: 0,
            wind_dmg_boost: 0,
            quantum_dmg_boost: 0,
            imaginary_dmg_boost: 0,
            physical_res: 0,
            fire_res: 0,
            ice_res: 0,
            lightning_res: 0,
            wind_res: 0,
            quantum_res: 0,
            imaginary_res: 0,
            physical_res_pen: 0,
            fire_res_pen: 0,
            ice_res_pen: 0,
            lightning_res_pen: 0,
            wind_res_pen: 0,
            quantum_res_pen: 0,
            imaginary_res_pen: 0,
            all_type_res_pen: 0,
            all_type_dmg_boost: 0,
            def_ignore: 0,
            dmg_taken_reduction: 0,
            all_type_vuln: 0,
            physical_vuln: 0,
        } as any,
        effects: [],
        modifiers: [],
        abilities: {
            basic: { id: 'basic', description: '', name: 'Basic', type: 'Basic ATK', targetType: 'single_enemy' },
            skill: { id: 'skill', description: '', name: 'Skill', type: 'Skill', targetType: 'single_enemy' },
            ultimate: { id: 'ult', description: '', name: 'Ultimate', type: 'Ultimate', targetType: 'single_enemy' },
            talent: { id: 'talent', description: '', name: 'Talent', type: 'Talent', targetType: 'self' },
            technique: { id: 'tech', description: '', name: 'Technique', type: 'Technique', targetType: 'self' },
        },
        actionValue: 100,
        ...overrides,
    } as Unit;
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

describe('Energy System', () => {
    describe('calculateEnergyGain', () => {
        it('should calculate energy gain with 0% ERR', () => {
            const result = calculateEnergyGain(20, 0);
            expect(result).toBe(20);
        });

        it('should calculate energy gain with positive ERR', () => {
            // 20 * (1 + 0.194) = 20 * 1.194 = 23.88
            const result = calculateEnergyGain(20, 0.194);
            expect(result).toBeCloseTo(23.88);
        });

        it('should calculate energy gain with 100% ERR', () => {
            // 20 * (1 + 1.0) = 40
            const result = calculateEnergyGain(20, 1.0);
            expect(result).toBe(40);
        });
    });

    describe('addEnergy', () => {
        it('should add energy to unit respecting max EP', () => {
            const unit = createMockUnit('test', { ep: 50, stats: { ...createMockUnit().stats, max_ep: 140 } });
            const result = addEnergy(unit, 30);
            expect(result.ep).toBe(80);
        });

        it('should not exceed max EP', () => {
            const unit = createMockUnit('test', { ep: 130, stats: { ...createMockUnit().stats, max_ep: 140 } });
            const result = addEnergy(unit, 50);
            expect(result.ep).toBe(140);
        });

        it('should apply ERR when not skipped', () => {
            const unit = createMockUnit('test', {
                ep: 0,
                stats: { ...createMockUnit().stats, max_ep: 140, energy_regen_rate: 0.5 }
            });
            // 20 * (1 + 0.5) = 30
            const result = addEnergy(unit, 20);
            expect(result.ep).toBe(30);
        });

        it('should skip ERR when skipERR is true', () => {
            const unit = createMockUnit('test', {
                ep: 0,
                stats: { ...createMockUnit().stats, max_ep: 140, energy_regen_rate: 0.5 }
            });
            const result = addEnergy(unit, 20, 0, true);
            expect(result.ep).toBe(20);
        });

        it('should add flat EP without ERR', () => {
            const unit = createMockUnit('test', {
                ep: 0,
                stats: { ...createMockUnit().stats, max_ep: 140, energy_regen_rate: 0.5 }
            });
            // Base: 20 * 1.5 = 30, Flat: 10
            // Total: 40
            const result = addEnergy(unit, 20, 10);
            expect(result.ep).toBe(40);
        });
    });

    describe('addEnergyToUnit', () => {
        it('should update unit EP in GameState', () => {
            const unit = createMockUnit('test-unit', { ep: 50 });
            const state = createMockState([unit]);

            const newState = addEnergyToUnit(state, 'test-unit', 20);

            const updatedUnit = newState.registry.get(createUnitId('test-unit'));
            expect(updatedUnit?.ep).toBe(70);
        });

        it('should not exceed max EP in GameState', () => {
            const unit = createMockUnit('test-unit', { ep: 130 });
            const state = createMockState([unit]);

            const newState = addEnergyToUnit(state, 'test-unit', 50);

            const updatedUnit = newState.registry.get(createUnitId('test-unit'));
            expect(updatedUnit?.ep).toBe(140);
        });

        it('should return same state if unit not found', () => {
            const state = createMockState([]);
            const newState = addEnergyToUnit(state, 'nonexistent', 20);
            expect(newState).toBe(state);
        });

        it('should return same state if no energy gained', () => {
            const unit = createMockUnit('test-unit', { ep: 140 }); // Already at max
            const state = createMockState([unit]);

            const newState = addEnergyToUnit(state, 'test-unit', 20);
            // Should return original state since no actual gain
            expect(newState).toBe(state);
        });

        it('should publish ON_EP_GAINED event when publishEventFn provided', () => {
            const unit = createMockUnit('test-unit', { ep: 50 });
            const state = createMockState([unit]);

            const mockPublish = vi.fn((s: GameState, _e: IEvent) => s);

            addEnergyToUnit(state, 'test-unit', 20, 0, false, {
                publishEventFn: mockPublish
            });

            expect(mockPublish).toHaveBeenCalledTimes(1);
            expect(mockPublish).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    type: 'ON_EP_GAINED',
                    targetId: 'test-unit',
                    epGained: 20
                })
            );
        });
    });

    describe('initializeEnergy', () => {
        it('should initialize energy to 50% by default', () => {
            const unit = createMockUnit('test', { ep: 0, stats: { ...createMockUnit().stats, max_ep: 140 } });
            const result = initializeEnergy(unit);
            expect(result.ep).toBe(70);
        });

        it('should initialize energy to specified percentage', () => {
            const unit = createMockUnit('test', { ep: 0, stats: { ...createMockUnit().stats, max_ep: 100 } });
            const result = initializeEnergy(unit, 0.3);
            expect(result.ep).toBe(30);
        });

        it('should not exceed max EP', () => {
            const unit = createMockUnit('test', { ep: 0, stats: { ...createMockUnit().stats, max_ep: 100 } });
            const result = initializeEnergy(unit, 1.5); // 150%
            expect(result.ep).toBe(100);
        });
    });
});
