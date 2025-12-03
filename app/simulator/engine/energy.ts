import { Unit } from './types';

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
 * @param baseEp The base amount of energy to gain (affected by ERR).
 * @param flatEp Optional flat amount of energy to gain (NOT affected by ERR). Default 0.
 * @returns The updated unit with new EP.
 */
export function addEnergy(unit: Unit, baseEp: number, flatEp: number = 0): Unit {
    const err = unit.stats.energy_regen_rate || 0;
    const gain = calculateEnergyGain(baseEp, err) + flatEp;
    const newEp = Math.min(unit.stats.max_ep, unit.ep + gain);

    return {
        ...unit,
        ep: newEp
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
