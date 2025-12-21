
import { GameState, Unit, ActionQueueEntry } from './types';
import { UnitId, createUnitId } from './unitId';


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
 * Calculates the base AV for a unit (used for percentage-based calculations).
 * Formula: Base AV = 10000 / SPD
 */
export function calculateBaseAV(speed: number): number {
    return BASE_ACTION_VALUE / Math.max(1, speed);
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
 * Updates the Action Queue to sync with unit states.
 * This ensures that changes to Unit AV are reflected in the queue.
 */
export function updateActionQueue(state: GameState): GameState {
    const newQueue = state.registry.toArray()
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

// ============================================================================
// 一元化されたAV管理関数
// ============================================================================

/**
 * Sets a unit's Action Value directly.
 * This is the core function that all other AV modifications should use.
 * @param state Current game state
 * @param unitId ID of the unit to update
 * @param newAV New Action Value
 * @param syncQueue Whether to sync the action queue (default: true)
 */
export function setUnitActionValue(
    state: GameState,
    unitId: UnitId | string,
    newAV: number,
    syncQueue: boolean = true
): GameState {
    const id = typeof unitId === 'string' ? createUnitId(unitId) : unitId;
    const unit = state.registry.get(id);
    if (!unit) return state;

    let newState = {
        ...state,
        registry: state.registry.update(id, u => ({ ...u, actionValue: newAV }))
    };

    if (syncQueue) {
        newState = updateActionQueue(newState);
    }

    return newState;
}

/**
 * Advances a unit's action (reduces AV).
 * @param state Current game state
 * @param unitId ID of the unit to advance
 * @param value Amount to advance (0.0 to 1.0 for percent, or flat value if type is 'fixed')
 * @param type Type of advance ('percent' of Base AV, or 'fixed' value)
 */
export function advanceUnitAction(
    state: GameState,
    unitId: UnitId | string,
    value: number,
    type: 'percent' | 'fixed' = 'percent'
): GameState {
    const id = typeof unitId === 'string' ? createUnitId(unitId) : unitId;
    const unit = state.registry.get(id);
    if (!unit) return state;

    let reduction: number;
    if (type === 'percent') {
        const baseAV = calculateBaseAV(unit.stats.spd);
        reduction = baseAV * value;
    } else {
        reduction = value;
    }

    const newAV = Math.max(0, unit.actionValue - reduction);
    return setUnitActionValue(state, id, newAV);
}

/**
 * Delays a unit's action (increases AV).
 * @param state Current game state
 * @param unitId ID of the unit to delay
 * @param value Amount to delay (0.0 to 1.0 for percent, or flat value if type is 'fixed')
 * @param type Type of delay ('percent' of Base AV, or 'fixed' value)
 */
export function delayUnitAction(
    state: GameState,
    unitId: UnitId | string,
    value: number,
    type: 'percent' | 'fixed' = 'percent'
): GameState {
    const id = typeof unitId === 'string' ? createUnitId(unitId) : unitId;
    const unit = state.registry.get(id);
    if (!unit) return state;

    let delay: number;
    if (type === 'percent') {
        const baseAV = calculateBaseAV(unit.stats.spd);
        delay = baseAV * value;
    } else {
        delay = value;
    }

    const newAV = unit.actionValue + delay;
    return setUnitActionValue(state, id, newAV);
}

/**
 * Resets a unit's Action Value to its base value (for turn end).
 * Formula: New AV = 10000 / SPD
 * @param state Current game state
 * @param unitId ID of the unit to reset
 */
export function resetUnitActionValue(
    state: GameState,
    unitId: UnitId | string
): GameState {
    const id = typeof unitId === 'string' ? createUnitId(unitId) : unitId;
    const unit = state.registry.get(id);
    if (!unit) return state;

    const baseAV = calculateActionValue(unit.stats.spd);
    return setUnitActionValue(state, id, baseAV);
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

    // Update unit states as well
    const newRegistry = state.registry.updateWhere(
        () => true, // All units
        unit => {
            const entry = newQueue.find(e => e.unitId === unit.id);
            if (entry) {
                return {
                    ...unit,
                    actionValue: entry.actionValue
                };
            }
            return unit;
        }
    );

    return {
        ...state,
        registry: newRegistry,
        actionQueue: newQueue,
        time: state.time + amount
    };
}

/**
 * Adds a specific amount to a unit's Action Value.
 * @deprecated Use setUnitActionValue or delayUnitAction instead.
 */
export function addActionValue(state: GameState, unitId: string, amount: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const newAV = (unit.actionValue || 0) + amount;
    return setUnitActionValue(state, unitId, newAV);
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
