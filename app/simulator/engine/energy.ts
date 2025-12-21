import { Unit, GameState, IEvent } from './types';
import { UnitId, createUnitId } from './unitId';


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
    if (unit.disableEnergyRecovery) return unit;

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
 * Options for addEnergyToUnit function.
 */
export interface AddEnergyOptions {
    /** ID of the unit that caused the EP recovery (for event tracking). Defaults to target unit. */
    sourceId?: string;
    /** Function to publish events. If provided, ON_EP_GAINED event will be fired. */
    publishEventFn?: (state: GameState, event: IEvent) => GameState;
}

/**
 * Adds energy to a unit in a GameState, respecting the maximum energy limit.
 * Optionally publishes ON_EP_GAINED event if publishEventFn is provided in options.
 * 
 * @param state Current game state
 * @param unitId ID of the unit to add energy to
 * @param baseEp The base amount of energy to gain (affected by ERR unless skipERR is true).
 * @param flatEp Optional flat amount of energy to gain (NOT affected by ERR). Default 0.
 * @param skipERR If true, ERR is not applied to baseEp. Default false.
 * @param options Optional settings including sourceId and publishEventFn for event firing
 * @returns Updated game state
 */
export function addEnergyToUnit(
    state: GameState,
    unitId: string,
    baseEp: number,
    flatEp: number = 0,
    skipERR: boolean = false,
    options?: AddEnergyOptions
): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    if (unit.disableEnergyRecovery) return state;

    const err = unit.stats.energy_regen_rate || 0;
    const baseGain = skipERR ? baseEp : calculateEnergyGain(baseEp, err);
    const gain = baseGain + flatEp;
    const oldEp = unit.ep;
    const newEp = Math.min(unit.stats.max_ep, unit.ep + gain);
    const actualGain = newEp - oldEp;

    if (actualGain <= 0) return state;

    let newState: GameState = {
        ...state,
        registry: state.registry.update(createUnitId(unitId), u => ({ ...u, ep: newEp }))
    };

    // Publish ON_EP_GAINED event if publishEventFn is provided
    if (options?.publishEventFn && actualGain > 0) {
        newState = options.publishEventFn(newState, {
            type: 'ON_EP_GAINED',
            sourceId: options.sourceId || unitId,
            targetId: unitId,
            value: actualGain,
            epGained: actualGain
        });
    }

    return newState;
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
