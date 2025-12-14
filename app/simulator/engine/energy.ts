import { Unit, GameState } from './types';

/**
 * Calculates the actual energy gain based on Base EP and Energy Regeneration Rate (ERR).
 * Formula: Actual Gain = Base EP * (1 + ERR)
 * Note: ERR is usually represented as a decimal (e.g., 0.194 for 19.4%).
 * 
 * @param baseEp The base amount of energy to gain.
 * @param err The Energy Regeneration Rate of the unit (e.g., 0.0 for 0%, 0.194 for 19.4%).
 * @returns The calculated energy gain.
 */
export function calculateEnergyGain(baseEp: number, err: number): number {
    return baseEp * (1 + err);
}

/**
 * Adds energy to a unit, respecting the maximum energy limit.
 * Applies ERR to the base amount, and adds flat amount directly (if any).
 * 
 * @param unit The unit to add energy to.
 * @param baseEp The base amount of energy to gain (affected by ERR unless skipERR is true).
 * @param flatEp Optional flat amount of energy to gain (NOT affected by ERR). Default 0.
 * @param skipERR If true, ERR is not applied to baseEp. Default false.
 * @returns The updated unit with new EP.
 */
export function addEnergy(unit: Unit, baseEp: number, flatEp: number = 0, skipERR: boolean = false): Unit {
    const err = unit.stats.energy_regen_rate || 0;
    const baseGain = skipERR ? baseEp : calculateEnergyGain(baseEp, err);
    const gain = baseGain + flatEp;
    const newEp = Math.min(unit.stats.max_ep, unit.ep + gain);

    return {
        ...unit,
        ep: newEp
    };
}

/**
 * Adds energy to a unit in a GameState, respecting the maximum energy limit.
 * 
 * @param state Current game state
 * @param unitId ID of the unit to add energy to
 * @param baseEp The base amount of energy to gain (affected by ERR unless skipERR is true).
 * @param flatEp Optional flat amount of energy to gain (NOT affected by ERR). Default 0.
 * @param skipERR If true, ERR is not applied to baseEp. Default false.
 * @returns Updated game state
 */
export function addEnergyToUnit(
    state: GameState,
    unitId: string,
    baseEp: number,
    flatEp: number = 0,
    skipERR: boolean = false
): GameState {
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return state;

    const updatedUnit = addEnergy(unit, baseEp, flatEp, skipERR);
    return {
        ...state,
        units: state.units.map(u => u.id === unitId ? updatedUnit : u)
    };
}

/**
 * Initializes a unit's energy to a percentage of their max EP.
 * 
 * @param unit The unit to initialize.
 * @param percentage The percentage of max EP to start with (0.0 to 1.0). Default 0.5 (50%).
 * @returns The updated unit.
 */
export function initializeEnergy(unit: Unit, percentage: number = 0.5): Unit {
    const startEp = unit.stats.max_ep * percentage;
    return {
        ...unit,
        ep: Math.min(unit.stats.max_ep, startEp)
    };
}

