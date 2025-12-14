import { GameState, Unit } from './types';
import { removeEffect, addEffect } from './effectManager';
import { IEffect } from '../effect/types';
import { publishEvent, appendShield, appendHealing } from './dispatcher';

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
    const source = newState.units.find(u => u.id === sourceId);
    const target = newState.units.find(u => u.id === targetId);

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
        const sourceUnit = newState.units.find(u => u.id === sourceId);
        newState.log = [...newState.log, {
            actionType: '回復',
            sourceId: sourceId,
            characterName: sourceUnit?.name || sourceId,
            targetId: targetId,
            healingDone: healAmount,
            details: details === 'Heal' ? '回復' : details
        }];
    }

    // 統合ログに回復を追記
    newState = appendHealing(newState, {
        source: source?.name || sourceId,
        name: details === 'Heal' ? '回復' : details,
        amount: healAmount,
        target: target?.name || targetId
    });

    // ON_UNIT_HEALED イベント発行
    newState = publishEvent(newState, {
        type: 'ON_UNIT_HEALED',
        sourceId: sourceId, // 回復させた人
        targetId: targetId, // 回復した人
        healingDone: healAmount,
        value: healAmount
    });

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

    const debuffs = targetUnit.effects.filter(e =>
        e.category === 'DEBUFF' &&
        e.isCleansable === true  // 明示的にtrueのみ解除可能
    );

    let removedCount = 0;
    // Remove latest debuffs first (LIFO)
    for (let i = debuffs.length - 1; i >= 0 && removedCount < count; i--) {
        const debuffToRemove = debuffs[i];
        newState = removeEffect(newState, targetId, debuffToRemove.id);

        // Log the cleanse
        const targetUnit2 = newState.units.find(u => u.id === targetId);
        newState.log = [...newState.log, {
            actionType: 'デバフ解除',
            sourceId: targetId,
            characterName: targetUnit2?.name || targetId,
            targetId: targetId,
            details: `デバフ解除: ${debuffToRemove.name}`
        }];

        removedCount++;
    }

    return newState;
}

/**
 * Removes buffs from a target unit (dispel).
 * @param state Current game state
 * @param targetId ID of the target unit
 * @param count Number of buffs to remove (default: 1)
 * @returns Updated game state
 */
export function dispelBuffs(
    state: GameState,
    targetId: string,
    count: number = 1
): GameState {
    let newState = state;
    const targetUnit = newState.units.find(u => u.id === targetId);
    if (!targetUnit) return newState;

    // 明示的にisDispellable: trueのバフのみを対象（シールド、リンクは除外）
    const buffs = targetUnit.effects.filter(e =>
        e.category === 'BUFF' &&
        e.isDispellable === true &&  // 明示的にtrueのみ解除可能
        e.type !== 'Shield' &&
        e.durationType !== 'LINKED'
    );

    let removedCount = 0;
    // Remove latest buffs first (LIFO)
    for (let i = buffs.length - 1; i >= 0 && removedCount < count; i--) {
        const buffToRemove = buffs[i];
        newState = removeEffect(newState, targetId, buffToRemove.id);

        // Log the dispel
        const targetUnit2 = newState.units.find(u => u.id === targetId);
        newState = {
            ...newState,
            log: [...newState.log, {
                actionType: 'バフ解除',
                sourceId: targetId,
                characterName: targetUnit2?.name || targetId,
                targetId: targetId,
                details: `バフ解除: ${buffToRemove.name}`
            }]
        };

        removedCount++;
    }

    return newState;
}

/**
 * Options for applying a shield.
 */
export interface ApplyShieldOptions {
    /** If true, shield stacks with existing shields of the same name and source */
    stackable?: boolean;
    /** Maximum cap for stackable shields */
    cap?: number;
}

/**
 * Applies a shield to a target unit.
 * @param state Current game state
 * @param sourceId ID of the source unit
 * @param targetId ID of the target unit
 * @param shieldValue Amount of shield to add
 * @param duration Duration of the shield
 * @param durationType Type of duration
 * @param name Name of the shield effect
 * @param id Optional stable ID for the shield effect
 * @param skipLog Whether to skip logging
 * @param options Optional settings for stackable shields
 * @returns Updated game state
 */
export function applyShield(
    state: GameState,
    sourceId: string,
    targetId: string,
    shieldValue: number,
    duration: number,
    durationType: 'TURN_START_BASED' | 'TURN_END_BASED',
    name: string = 'Shield',
    id?: string,
    skipLog: boolean = false,
    options?: ApplyShieldOptions
): GameState {
    let newState = state;
    const source = newState.units.find(u => u.id === sourceId);
    if (!source) return newState;

    const target = newState.units.find(u => u.id === targetId);
    if (!target) return newState;

    let finalShieldValue = shieldValue;
    let addedShieldValue = shieldValue; // 今回追加した分（統計・ログ用）

    // 累積モードの処理
    if (options?.stackable) {
        const existing = target.effects.find(e =>
            e.name === name &&
            e.sourceUnitId === sourceId &&
            (e as any).type === 'Shield'
        );

        if (existing) {
            const currentVal = (existing as any).value || 0;
            finalShieldValue = currentVal + shieldValue;

            // 上限を適用
            if (options.cap !== undefined) {
                finalShieldValue = Math.min(finalShieldValue, options.cap);
                // 上限により追加分が制限される場合
                addedShieldValue = finalShieldValue - currentVal;
                if (addedShieldValue < 0) addedShieldValue = 0;
            }

            // 古いシールドを削除
            newState = removeEffect(newState, targetId, existing.id);
        } else {
            // 上限を適用（新規シールドにも適用）
            if (options.cap !== undefined) {
                finalShieldValue = Math.min(finalShieldValue, options.cap);
                addedShieldValue = finalShieldValue;
            }
        }
    }

    const shieldEffect: IEffect = {
        id: id || `shield-${sourceId}-${targetId}-${Date.now()}`,
        name: name,
        category: 'BUFF',
        type: 'Shield',
        sourceUnitId: sourceId,
        durationType: durationType,
        duration: duration,
        skipFirstTurnDecrement: true,
        value: finalShieldValue,
        onApply: (t: Unit, s: GameState) => {
            const u = s.units.find(unit => unit.id === t.id);
            if (u) {
                const newU = { ...u, shield: (u.shield || 0) + finalShieldValue };
                return { ...s, units: s.units.map(unit => unit.id === u.id ? newU : unit) };
            }
            return s;
        },
        onRemove: (t: Unit, s: GameState) => {
            const u = s.units.find(unit => unit.id === t.id);
            if (u) {
                const newShield = Math.max(0, (u.shield || 0) - finalShieldValue);
                const newU = { ...u, shield: newShield };
                return { ...s, units: s.units.map(unit => unit.id === u.id ? newU : unit) };
            }
            return s;
        },
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s,
    } as any;

    newState = addEffect(newState, targetId, shieldEffect);

    // Update Statistics (今回追加した分のみ)
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
                    shieldProvided: currentStats.shieldProvided + addedShieldValue
                }
            }
        }
    };

    if (!skipLog) {
        newState.log = [...newState.log, {
            actionType: 'シールド',
            sourceId: sourceId,
            characterName: source.name,
            targetId: targetId,
            shieldApplied: addedShieldValue, // 今回追加した分
            details: options?.stackable ? `${name} (累積: 総計${Math.round(finalShieldValue)})` : name
        }];
    }

    // 統合ログにシールドを追記 (今回追加した分)
    newState = appendShield(newState, {
        source: source.name,
        name: options?.stackable ? `${name} (累積)` : name,
        amount: addedShieldValue,
        target: target.name
    });

    return newState;
}

/**
 * Advances the action of a unit.
 * @param state Current game state
 * @param unitId ID of the unit to advance
 * @param value Amount to advance (0.0 to 1.0 for percent, or flat value if type is 'fixed')
 * @param type Type of advance ('percent' of Action Gauge (Base AV), or 'fixed' value)
 * @returns Updated game state
 */
export function advanceAction(
    state: GameState,
    unitId: string,
    value: number,
    type: 'percent' | 'fixed' = 'percent'
): GameState {
    let newState = state;
    const idx = newState.actionQueue.findIndex(i => i.unitId === unitId);
    if (idx !== -1) {
        const item = newState.actionQueue[idx];
        const unit = newState.units.find(u => u.id === unitId);

        let reduction = 0;
        if (type === 'percent') {
            const spd = unit ? unit.stats.spd : 100; // Fallback
            const baseAV = 10000 / Math.max(1, spd); // Avoid div by zero
            reduction = baseAV * value;
        } else {
            reduction = value;
        }

        // AV=0未満にはならない（ターン開始時にAVが設定されるため）
        const newAV = Math.max(0, item.actionValue - reduction);
        const newQueue = [...newState.actionQueue];
        newQueue[idx] = { ...item, actionValue: newAV };
        // Sort queue
        newQueue.sort((a, b) => a.actionValue - b.actionValue);

        // ログは呼び出し元で管理するため、ここでは出力しない

        // Sync units array with actionQueue
        const newUnits = newState.units.map(u =>
            u.id === unitId ? { ...u, actionValue: newAV } : u
        );

        newState = { ...newState, actionQueue: newQueue, units: newUnits };
    }
    return newState;
}

/**
 * Delays the action of a unit (opposite of advanceAction).
 * @param state Current game state
 * @param unitId ID of the unit to delay
 * @param value Amount to delay (0.0 to 1.0 for percent, or flat value if type is 'fixed')
 * @param type Type of delay ('percent' of Action Gauge (Base AV), or 'fixed' value)
 * @param skipLog Whether to skip logging the delay
 * @returns Updated game state
 */
export function delayAction(
    state: GameState,
    unitId: string,
    value: number,
    type: 'percent' | 'fixed' = 'percent',
    skipLog: boolean = false
): GameState {
    let newState = state;
    const idx = newState.actionQueue.findIndex(i => i.unitId === unitId);
    if (idx !== -1) {
        const item = newState.actionQueue[idx];
        const unit = newState.units.find(u => u.id === unitId);

        let delay = 0;
        if (type === 'percent') {
            const spd = unit ? unit.stats.spd : 100; // Fallback
            const baseAV = 10000 / Math.max(1, spd); // Avoid div by zero
            delay = baseAV * value;
        } else {
            delay = value;
        }

        const newAV = item.actionValue + delay;
        const newQueue = [...newState.actionQueue];
        newQueue[idx] = { ...item, actionValue: newAV };
        // Sort queue
        newQueue.sort((a, b) => a.actionValue - b.actionValue);

        // Update Log
        if (!skipLog) {
            const actionUnit = newState.units.find(u => u.id === unitId);
            newState.log.push({
                actionType: '行動遅延',
                sourceId: unitId,
                characterName: actionUnit?.name || unitId,
                targetId: unitId,
                value: delay,
                details: `行動遅延 ${type === 'percent' ? (value * 100).toFixed(0) + '%' : value.toFixed(0)}`
            } as any);
        }

        // Sync units array with actionQueue
        const newUnits = newState.units.map(u =>
            u.id === unitId ? { ...u, actionValue: newAV } : u
        );

        newState = { ...newState, actionQueue: newQueue, units: newUnits };
    }
    return newState;
}
