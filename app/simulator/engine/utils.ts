import { GameState, Unit } from './types';
import { UnitId, createUnitId } from './unitId';
import { removeEffect, addEffect } from './effectManager';
import { advanceUnitAction, delayUnitAction } from './actionValue';
import { IEffect } from '../effect/types';
import { publishEvent, appendShield, appendHealing, appendDamageTaken } from './dispatcher';

/**
 * 回復計算ロジック
 */
export interface HealLogic {
    scaling: 'atk' | 'hp' | 'def';
    multiplier: number;
    flat?: number;
    /** 追加の与回復ブースト（加算、例: 羅刹E2の+30%） */
    additionalOutgoingBoost?: number;
    /** 基礎回復量に乗算（例: ヒアンシーの速度ブースト） */
    baseMultiplier?: number;
    /** 最終回復量に乗算（例: ヒアンシーの微笑む暗雲+25%） */
    finalMultiplier?: number;
}

/**
 * Applies healing to a target unit.
 * @param state Current game state
 * @param sourceId ID of the source unit
 * @param targetId ID of the target unit
 * @param healLogicOrAmount HealLogic for auto-calculation, or number for pre-calculated amount
 * @param details Optional details for the log
 * @param skipLog Whether to skip logging
 * @returns Updated game state
 */
export function applyHealing(
    state: GameState,
    sourceId: string,
    targetId: string,
    healLogicOrAmount: HealLogic | number,
    details: string = 'Heal',
    skipLog: boolean = false
): GameState {
    let newState = { ...state };
    const source = newState.registry.get(createUnitId(sourceId));
    const target = newState.registry.get(createUnitId(targetId));

    if (!source || !target) return newState;

    let healAmount: number;
    let breakdownMultipliers: any;

    if (typeof healLogicOrAmount === 'number') {
        // 計算済み回復量が渡された場合（後方互換性）
        healAmount = healLogicOrAmount;
        // 内訳は生成しない（キャラクター側で複雑な計算をしている場合）
        breakdownMultipliers = undefined;
    } else {
        // HealLogicが渡された場合、内部で計算
        const healLogic = healLogicOrAmount;
        const scalingValue = source.stats[healLogic.scaling] || 0;
        let baseHeal = scalingValue * healLogic.multiplier + (healLogic.flat || 0);

        // 基礎回復量に乗算（速度ブースト等）
        const baseMultiplier = healLogic.baseMultiplier || 1;
        baseHeal *= baseMultiplier;

        const outgoingHealBoost = (source.stats.outgoing_healing_boost || 0) + (healLogic.additionalOutgoingBoost || 0);
        const incomingHealBoost = target.stats.incoming_heal_boost || 0;
        const healBoostMult = 1 + outgoingHealBoost + incomingHealBoost;
        healAmount = baseHeal * healBoostMult;

        // 最終回復量に乗算（微笑む暗雲等）
        const finalMultiplier = healLogic.finalMultiplier || 1;
        healAmount *= finalMultiplier;

        // 計算式内訳を生成
        breakdownMultipliers = {
            baseHeal,
            outgoingHealBoost,
            incomingHealBoost,
            healBoostMult,
            scalingStat: healLogic.scaling,
            multiplier: healLogic.multiplier,
            flat: healLogic.flat || 0,
            baseMultiplier: baseMultiplier !== 1 ? baseMultiplier : undefined,
            finalMultiplier: finalMultiplier !== 1 ? finalMultiplier : undefined
        };
    }

    // HP回復適用
    const newHp = Math.min(target.stats.hp, target.hp + healAmount);
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(targetId), u => ({ ...u, hp: newHp }))
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

    // 統合ログに回復を追記（個別ログは二重になるため削除）
    // skipLogフラグは統合ログへの追記も制御

    if (!skipLog) {
        newState = appendHealing(newState, {
            source: source.name,
            name: details === 'Heal' ? '回復' : details,
            amount: healAmount,
            target: target.name,
            breakdownMultipliers
        });
    }

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
    const targetUnit = newState.registry.get(createUnitId(targetId));
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

        // 統合ログにデバフ解除を追記（個別ログは削除）
        const { appendEquipmentEffect } = require('./dispatcher');
        newState = appendEquipmentEffect(newState, {
            source: targetUnit?.name || targetId,
            name: `デバフ解除: ${debuffToRemove.name}`,
            type: 'relic' // 効果系として表示
        });

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
    const targetUnit = newState.registry.get(createUnitId(targetId));
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

        // 統合ログにバフ解除を追記（個別ログは削除）
        const { appendEquipmentEffect: appendEquipmentEffect2 } = require('./dispatcher');
        newState = appendEquipmentEffect2(newState, {
            source: targetUnit?.name || targetId,
            name: `バフ解除: ${buffToRemove.name}`,
            type: 'relic' // 効果系として表示
        });

        removedCount++;
    }

    return newState;
}

/**
 * シールド計算ロジック
 */
export interface ShieldLogic {
    scaling: 'atk' | 'hp' | 'def';
    multiplier: number;
    flat?: number;
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
 * Shield calculation is done internally based on shieldLogic.
 * @param state Current game state
 * @param sourceId ID of the source unit
 * @param targetId ID of the target unit
 * @param shieldLogic Shield calculation logic (scaling stat, multiplier, flat)
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
    shieldLogic: ShieldLogic,
    duration: number,
    durationType: 'TURN_START_BASED' | 'TURN_END_BASED',
    name: string = 'Shield',
    id?: string,
    skipLog: boolean = false,
    options?: ApplyShieldOptions
): GameState {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceId));
    if (!source) return newState;

    const target = newState.registry.get(createUnitId(targetId));
    if (!target) return newState;

    // シールド計算（ソースのステータスを参照）
    const scalingValue = source.stats[shieldLogic.scaling] || 0;
    const shieldBoost = source.stats.shield_strength_boost || 0;
    const baseShieldValue = (scalingValue * shieldLogic.multiplier + (shieldLogic.flat || 0)) * (1 + shieldBoost);
    let shieldValue = baseShieldValue;

    // 計算式内訳を生成
    const breakdownMultipliers = {
        baseShield: baseShieldValue,
        scalingStat: shieldLogic.scaling,
        multiplier: shieldLogic.multiplier,
        flat: shieldLogic.flat || 0,
        shieldBoost: shieldBoost,
        cap: options?.cap
    };

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
            const u = s.registry.get(t.id);
            if (u) {
                return {
                    ...s,
                    registry: s.registry.update(t.id, unit => ({ ...unit, shield: (unit.shield || 0) + finalShieldValue }))
                };
            }
            return s;
        },
        onRemove: (t: Unit, s: GameState) => {
            const u = s.registry.get(t.id);
            if (u) {
                const newShield = Math.max(0, (u.shield || 0) - finalShieldValue);
                return {
                    ...s,
                    registry: s.registry.update(t.id, unit => ({ ...unit, shield: newShield }))
                };
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

    // 統合ログにシールドを追記（個別ログは二重になるため削除）
    // skipLogフラグは統合ログへの追記も制御

    if (!skipLog) {
        newState = appendShield(newState, {
            source: source.name,
            name: options?.stackable ? `${name} (累積)` : name,
            amount: addedShieldValue,
            target: target.name,
            breakdownMultipliers
        });
    }

    return newState;
}

/**
 * Advances the action of a unit.
 * Wrapper for advanceUnitAction in actionValue.ts.
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
    // 一元化された関数を呼び出し
    return advanceUnitAction(state, unitId, value, type);
}

/**
 * Delays the action of a unit (opposite of advanceAction).
 * Wrapper for delayUnitAction in actionValue.ts.
 * @param state Current game state
 * @param unitId ID of the unit to delay
 * @param value Amount to delay (0.0 to 1.0 for percent, or flat value if type is 'fixed')
 * @param type Type of delay ('percent' of Action Gauge (Base AV), or 'fixed' value)
 * @param skipLog Whether to skip logging the delay (currently unused, preserved for API compatibility)
 * @returns Updated game state
 */
export function delayAction(
    state: GameState,
    unitId: string,
    value: number,
    type: 'percent' | 'fixed' = 'percent',
    skipLog: boolean = false
): GameState {
    // 一元化された関数を呼び出し
    return delayUnitAction(state, unitId, value, type);
}

/**
 * Consumes HP from a unit.
 * @param state Current game state
 * @param sourceId ID of the unit causing the consumption (usually self, or ally)
 * @param targetId ID of the unit losing HP
 * @param hpCostRatio Ratio of max HP to consume (e.g. 0.30 for 30%)
 * @param description Description for the log
 * @param options optional { minHp?: number }
 * @returns Updated game state and amount consumed
 */
export function consumeHp(
    state: GameState,
    sourceId: string,
    targetId: string,
    hpCostRatio: number,
    description: string,
    options: { minHp?: number } = { minHp: 1 }
): { state: GameState; consumed: number } {
    let newState = state;
    const target = newState.registry.get(createUnitId(targetId));
    if (!target) return { state, consumed: 0 };

    const maxHp = target.stats.hp;
    const costAmount = maxHp * hpCostRatio;
    const minHp = options.minHp !== undefined ? options.minHp : 1;

    let newHp: number;
    let actualConsumed: number;

    if (target.hp - costAmount < minHp) {
        // HP不足: minHpにする
        newHp = minHp;
        actualConsumed = Math.max(0, target.hp - minHp);
    } else {
        actualConsumed = costAmount;
        newHp = target.hp - costAmount;
    }

    if (actualConsumed <= 0) return { state, consumed: 0 };

    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(targetId), u => ({ ...u, hp: newHp }))
    };

    // ログ更新
    if (newState.currentActionLog) {
        newState = appendDamageTaken(newState, {
            source: description,
            type: 'self',
            damage: actualConsumed,
            dotType: `HP消費 (${(hpCostRatio * 100).toFixed(0)}%)`,
            hpConsumeBreakdown: {
                maxHp: maxHp,
                consumeRatio: hpCostRatio,
                expectedCost: costAmount,
                actualConsumed: actualConsumed,
                hpBefore: target.hp,
                hpAfter: newHp
            }
        });
    }

    // イベント発行
    newState = publishEvent(newState, {
        type: 'ON_HP_CONSUMED',
        targetId,
        sourceId,
        amount: actualConsumed,
        sourceType: description
    });

    return { state: newState, consumed: actualConsumed };
}

/**
 * 削靭処理（キャラクター固有の追加削靭用）
 * 
 * 通常のアクションによる削靭はdispatcherが処理するため、
 * このユーティリティは「ダメージを伴わない追加削靭」（例: ダリアA6、E1）に使用します。
 * 
 * @param state ゲーム状態
 * @param sourceId 削靭のソースユニットID
 * @param targetId 削靭対象のユニットID
 * @param baseToughnessReduction 基礎削靭値
 * @param options オプション設定
 * @returns 更新後のゲーム状態と撃破フラグ
 */
export function reduceToughness(
    state: GameState,
    sourceId: string,
    targetId: string,
    baseToughnessReduction: number,
    options?: {
        /** 弱点を無視して削靭するか（飛霄A2など） */
        ignoreWeakness?: boolean;
        /** 撃破時にイベントを発火するか（デフォルト: true） */
        publishBreakEvent?: boolean;
    }
): { state: GameState; wasBroken: boolean } {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceId));
    const target = newState.registry.get(createUnitId(targetId));

    if (!source || !target) {
        return { state, wasBroken: false };
    }

    // 敵でなければ削靭しない
    if (!target.isEnemy) {
        return { state, wasBroken: false };
    }

    // 既に撃破済みなら何もしない
    if (target.toughness <= 0) {
        return { state, wasBroken: false };
    }

    // 弱点チェック（オプションで無視可能）
    const ignoreWeakness = options?.ignoreWeakness ?? false;
    if (!ignoreWeakness && !target.weaknesses.has(source.element)) {
        return { state, wasBroken: false };
    }

    // 削靭値計算: 基礎 × (1 + break_efficiency_boost)
    const breakEfficiency = source.stats.break_efficiency_boost || 0;
    const actualReduction = baseToughnessReduction * (1 + breakEfficiency);
    const newToughness = Math.max(0, target.toughness - actualReduction);

    // ターゲットの靭性を更新
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(targetId), u => ({ ...u, toughness: newToughness }))
    };

    const wasBroken = target.toughness > 0 && newToughness <= 0;

    // 撃破イベント発火
    if (wasBroken && (options?.publishBreakEvent !== false)) {
        newState = publishEvent(newState, {
            type: 'ON_WEAKNESS_BREAK',
            sourceId: sourceId,
            targetId: targetId,
            value: 0
        });
    }

    return { state: newState, wasBroken };
}
