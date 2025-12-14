
import { GameState, Unit, ActionQueueEntry } from './types';

/**
 * Constants for Action Value calculations
 */
export const BASE_ACTION_VALUE = 10000;

/**
 * Calculates the Action Value (AV) for a given Speed (SPD).
 * Formula: AV = 10000 / SPD
 */
export function calculateActionValue(speed: number): number {
    if (speed <= 0) return BASE_ACTION_VALUE; // Prevent division by zero, though SPD should be > 0
    return BASE_ACTION_VALUE / speed;
}

/**
 * Initializes the Action Queue based on current unit speeds.
 * Should be called at the start of battle or wave.
 */
export function initializeActionQueue(units: Unit[]): ActionQueueEntry[] {
    return units.map(unit => ({
        unitId: unit.id,
        actionValue: calculateActionValue(unit.stats.spd)
    })).sort((a, b) => a.actionValue - b.actionValue);
}

/**
 * Updates the Action Queue after a unit takes an action or AV changes.
 * This is a simplified version; real HSR logic involves "current AV" and "base AV".
 * For this simulator, we'll track "remaining AV" for each unit.
 */
export function updateActionQueue(state: GameState): GameState {
    // Sync Action Queue with Unit states
    // This ensures that changes to Unit AV (e.g. from turn end) are reflected in the queue
    const newQueue = state.units
        .filter(u => u.hp > 0) // Filter out dead units
        .map(unit => ({
            unitId: unit.id,
            actionValue: unit.actionValue
        }))
        .sort((a, b) => a.actionValue - b.actionValue);




    return {
        ...state,
        actionQueue: newQueue
    };
}

/**
 * Advances the timeline by a specific amount of AV.
 * Reduces the AV of all units by the given amount.
 */
export function advanceTimeline(state: GameState, amount: number): GameState {

    const newQueue = state.actionQueue.map(entry => ({
        ...entry,
        actionValue: Math.max(0, entry.actionValue - amount)
    }));

    // Update unit states as well (optional, but good for consistency)
    const newUnits = state.units.map(unit => {
        const entry = newQueue.find(e => e.unitId === unit.id);
        if (entry) {
            // Update Action Point as well to keep it in sync with AV
            // AP increases as AV decreases (time passes)
            const apGain = amount * unit.stats.spd;
            const newAp = (unit.actionPoint || 0) + apGain;

            return {
                ...unit,
                actionValue: entry.actionValue,
                actionPoint: newAp
            };
        }
        return unit;
    });

    return {
        ...state,
        units: newUnits,
        actionQueue: newQueue,
        time: state.time + amount
    };
}

// NOTE: actionAdvance は utils.ts の advanceAction に統一されました

/**
 * Adds a specific amount to a unit's Action Value.
 * Used primarily at turn end to reset for the next turn.
 * Formula: New AV = Current AV + Amount
 */
export function addActionValue(state: GameState, unitId: string, amount: number): GameState {
    const newUnits = state.units.map(u => {
        if (u.id === unitId) {
            return { ...u, actionValue: (u.actionValue || 0) + amount };
        }
        return u;
    });

    return updateActionQueue({ ...state, units: newUnits });
}

/**
 * Adjusts a unit's Action Value when their speed changes.
 * HSR Formula: New AV = Old AV × (Old Speed / New Speed)
 * This maintains the unit's position in the timeline proportionally.
 */
export function adjustActionValueForSpeedChange(
    unit: Unit,
    oldSpeed: number,
    newSpeed: number
): Unit {
    if (oldSpeed === newSpeed || newSpeed <= 0) {
        return unit;
    }

    const newAV = unit.actionValue * (oldSpeed / newSpeed);
    return { ...unit, actionValue: newAV };
}

/**
 * Recalculates Action Value from Action Point and Speed.
 * Formula: AV = (10000 - AP) / Speed
 * Used when AP is modified (e.g., delay effects).
 */
export function recalculateActionValueFromActionPoint(
    unit: Unit,
    actionPoint?: number
): Unit {
    const ap = actionPoint ?? unit.actionPoint ?? 0;
    const newAV = Math.max(0, (BASE_ACTION_VALUE - ap) / unit.stats.spd);
    return { ...unit, actionValue: newAV };
}
