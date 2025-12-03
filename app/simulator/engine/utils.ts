import { GameState, Unit } from './types';
import { removeEffect, addEffect } from './effectManager';
import { IEffect } from '../effect/types';

/**
 * Applies healing to a target unit.
 * @param state Current game state
 * @param sourceId ID of the source unit
 * @param targetId ID of the target unit
 * @param healAmount Amount of healing
 * @param details Optional details for the log
 * @returns Updated game state
 */
export function applyHealing(
    state: GameState,
    sourceId: string,
    targetId: string,
    healAmount: number,
    details: string = 'Heal',
    skipLog: boolean = false
): GameState {
    let newState = { ...state };

    newState = {
        ...newState,
        units: newState.units.map(u => {
            if (u.id === targetId) {
                const newHp = Math.min(u.stats.hp, u.hp + healAmount);
                return { ...u, hp: newHp };
            }
            return u;
        })
    };

    // Update Statistics
    const currentStats = newState.result.characterStats[sourceId] || {
        damageDealt: 0,
        healingDealt: 0,
        shieldProvided: 0
    };
    newState = {
        ...newState,
        result: {
            ...newState.result,
            characterStats: {
                ...newState.result.characterStats,
                [sourceId]: {
                    ...currentStats,
                    healingDealt: currentStats.healingDealt + healAmount
                }
            }
        }
    };

    if (!skipLog) {
        newState.log = [...newState.log, {
            actionType: 'Heal',
            sourceId: sourceId,
            targetId: targetId,
            healingDone: healAmount,
            details: details
        }];
    }

    return newState;
}

/**
 * Removes debuffs from a target unit.
 * @param state Current game state
 * @param targetId ID of the target unit
 * @param count Number of debuffs to remove (default: 1)
 * @returns Updated game state
 */
export function cleanse(
    state: GameState,
    targetId: string,
    count: number = 1
): GameState {
    let newState = state;
    const targetUnit = newState.units.find(u => u.id === targetId);
    if (!targetUnit) return newState;

    const debuffs = targetUnit.effects.filter(e => e.category === 'DEBUFF');

    let removedCount = 0;
    // Remove latest debuffs first (LIFO)
    for (let i = debuffs.length - 1; i >= 0 && removedCount < count; i--) {
        const debuffToRemove = debuffs[i];
        newState = removeEffect(newState, targetId, debuffToRemove.id);

        // Log the cleanse
        newState.log = [...newState.log, {
            actionType: 'Cleanse',
            targetId: targetId,
            details: `Removed debuff: ${debuffToRemove.name}`
        }];

        removedCount++;
    }

    return newState;
}

/**
 * Applies a shield to a target unit.
 * @param state Current game state
 * @param sourceId ID of the source unit
 * @param targetId ID of the target unit
 * @param shieldValue Amount of shield
 * @param duration Duration of the shield
 * @param durationType Type of duration
 * @param name Name of the shield effect
 * @param id Optional stable ID for the shield effect
 * @param skipLog Whether to skip logging
 * @returns Updated game state
 */
export function applyShield(
    state: GameState,
    sourceId: string,
    targetId: string,
    shieldValue: number,
    duration: number,
    durationType: 'TURN_START_BASED' | 'DURATION_BASED' | 'TURN_END_BASED',
    name: string = 'Shield',
    id?: string,
    skipLog: boolean = false
): GameState {
    let newState = state;
    const source = newState.units.find(u => u.id === sourceId);
    if (!source) return newState;

    const shieldEffect: IEffect = {
        id: id || `shield-${sourceId}-${targetId}-${Date.now()}`,
        name: name,
        category: 'BUFF',
        type: 'Shield',
        sourceUnitId: sourceId,
        durationType: durationType,
        duration: duration,
        value: shieldValue,
        onApply: (t: Unit, s: GameState) => {
            const u = s.units.find(unit => unit.id === t.id);
            if (u) {
                const newU = { ...u, shield: (u.shield || 0) + shieldValue };
                return { ...s, units: s.units.map(unit => unit.id === u.id ? newU : unit) };
            }
            return s;
        },
        onRemove: (t: Unit, s: GameState) => {
            const u = s.units.find(unit => unit.id === t.id);
            if (u) {
                const newShield = Math.max(0, (u.shield || 0) - shieldValue);
                const newU = { ...u, shield: newShield };
                return { ...s, units: s.units.map(unit => unit.id === u.id ? newU : unit) };
            }
            return s;
        },
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s,
    } as any;

    newState = addEffect(newState, targetId, shieldEffect);

    // Update Statistics
    const currentStats = newState.result.characterStats[sourceId] || {
        damageDealt: 0,
        healingDealt: 0,
        shieldProvided: 0
    };
    newState = {
        ...newState,
        result: {
            ...newState.result,
            characterStats: {
                ...newState.result.characterStats,
                [sourceId]: {
                    ...currentStats,
                    shieldProvided: currentStats.shieldProvided + shieldValue
                }
            }
        }
    };

    if (!skipLog) {
        newState.log = [...newState.log, {
            actionType: 'Shield',
            sourceId: sourceId,
            targetId: targetId,
            shieldApplied: shieldValue,
            details: name
        }];
    }

    return newState;
}
