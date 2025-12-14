import { GameState, Unit } from './types';
import { addEffect, removeEffect } from './effectManager';

/**
 * Adds a value to a generic accumulator stored as a buff on the unit.
 * @param state Current game state
 * @param unitId Unit ID to store value on
 * @param key Unique key for this accumulator (e.g. 'accumulated-healing')
 * @param value Amount to add
 * @param cap Optional maximum value cap
 * @returns Updated game state
 */
export function addAccumulatedValue(
    state: GameState,
    unitId: string,
    key: string,
    value: number,
    cap?: number
): GameState {
    const u = state.units.find(unit => unit.id === unitId);
    if (!u) return state;

    const effectName = `蓄積: ${key}`;
    const effectIdBase = `acc-${key}-${unitId}`;

    let total = value;
    const current = u.effects.find(e => e.name === effectName);

    if (current) {
        total += ((current as any).value || 0);
        state = removeEffect(state, unitId, current.id);
    }

    if (cap !== undefined) {
        total = Math.min(total, cap);
    }

    // Use a fixed ID or rotate? Rotating ID avoids removal issues if multiple identical exist (unlikely here)
    // But consistent ID is better for finding it.
    // removeEffect removes by ID.
    // If we use fixed ID, we must ensure removeEffect works.
    // Usually effectManager handles unique IDs if we pass them.

    return addEffect(state, unitId, {
        id: `${effectIdBase}-${Date.now()}`,
        name: effectName,
        category: 'BUFF',
        type: 'Buff', // Generic Buff
        sourceUnitId: unitId,
        duration: -1,
        durationType: 'PERMANENT',
        value: total,
        modifiers: [],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    } as any);
}

/**
 * Gets the current accumulated value for a specific key.
 * @param state Current game state
 * @param unitId Unit ID
 * @param key Accumulator key
 * @returns Current value (0 if none)
 */
export function getAccumulatedValue(
    state: GameState,
    unitId: string,
    key: string
): number {
    const u = state.units.find(unit => unit.id === unitId);
    if (!u) return 0;

    const effectName = `蓄積: ${key}`;
    const current = u.effects.find(e => e.name === effectName);
    return current ? ((current as any).value || 0) : 0;
}

/**
 * Consumes a fixed amount or percentage of the accumulated value.
 * @param state Current game state
 * @param unitId Unit ID
 * @param key Accumulator key
 * @param value Amount to consume (if type is 'fixed') or percentage (0.0-1.0, if type is 'percent')
 * @param type 'fixed' or 'percent' (default 'fixed')
 * @returns Updated game state
 */
export function consumeAccumulatedValue(
    state: GameState,
    unitId: string,
    key: string,
    value: number,
    type: 'fixed' | 'percent' = 'fixed'
): GameState {
    const currentVal = getAccumulatedValue(state, unitId, key);
    if (currentVal <= 0) return state;

    let consumeAmount = 0;
    if (type === 'percent') {
        consumeAmount = currentVal * value;
    } else {
        consumeAmount = value;
    }

    const remaining = Math.max(0, currentVal - consumeAmount);

    // Update by removing old and adding new
    const effectName = `蓄積: ${key}`;
    const u = state.units.find(unit => unit.id === unitId);
    if (u) {
        const current = u.effects.find(e => e.name === effectName);
        if (current) {
            state = removeEffect(state, unitId, current.id);
        }
    }

    if (remaining > 0) {
        const effectIdBase = `acc-${key}-${unitId}`;
        state = addEffect(state, unitId, {
            id: `${effectIdBase}-${Date.now()}`,
            name: effectName,
            category: 'BUFF',
            type: 'Buff',
            sourceUnitId: unitId,
            duration: -1,
            durationType: 'PERMANENT',
            value: remaining,
            modifiers: [],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        } as any);
    }

    return state;
}

/**
 * Clears the accumulated value (alias for consume 100%).
 * @param state Current game state
 * @param unitId Unit ID
 * @param key Accumulator key
 * @returns Updated game state
 */
export function clearAccumulatedValue(
    state: GameState,
    unitId: string,
    key: string
): GameState {
    return consumeAccumulatedValue(state, unitId, key, 1.0, 'percent');
}
