import { IEventHandlerFactory, IEventHandler, IEventHandlerLogic, GameState, Unit } from '../types';
import { RelicSet, OrnamentSet, ILightConeData, StatKey, STAT_KEYS, IEffect, CooldownResetType } from '../../../types';
import { createUnitId } from '../unitId';

type IRelicSet = ILightConeData; // Adjusted to remove RelicSet/OrnamentSet dependency if possible, or just keep ILightConeData usage

/**
 * Updates the unit's stats based on the modifier change.
 * @param unit The unit to update.
 * @param stat The stat key being modified.
 * @param value The value of the modification.
 * @param isPercentage Whether the modification is a percentage of base stats.
 * @param isAddition True if adding the buff, False if removing.
 */
function updateUnitStats(unit: Unit, stat: StatKey, value: number, isPercentage: boolean, isAddition: boolean) {
    const multiplier = isAddition ? 1 : -1;
    const change = value * multiplier;

    // Update the specific stat key (e.g., 'atk_pct' or 'spd')
    // Initialize if undefined (though FinalStats should have all keys initialized to 0)
    if (unit.stats[stat] === undefined) unit.stats[stat] = 0;
    unit.stats[stat] += change;

    // If it's a percentage buff, we also need to update the derived flat stat
    if (isPercentage) {
        let baseStatValue = 0;
        let flatKey: StatKey | null = null;

        if (stat.startsWith('atk')) { baseStatValue = unit.baseStats.atk; flatKey = 'atk'; }
        else if (stat.startsWith('def')) { baseStatValue = unit.baseStats.def; flatKey = 'def'; }
        else if (stat.startsWith('hp')) { baseStatValue = unit.baseStats.hp; flatKey = 'hp'; }
        else if (stat.startsWith('spd')) { baseStatValue = unit.baseStats.spd; flatKey = 'spd'; }

        if (flatKey) {
            unit.stats[flatKey] += baseStatValue * change;
        }
    }
}

// createGenericRelicHandlerFactory removed

export function createGenericLightConeHandlerFactory(lightCone: ILightConeData, superimposition: number): IEventHandlerFactory {
    return (sourceUnitId, level) => {
        const handlerId = `lc-${lightCone.id}-${sourceUnitId}`;

        const handlerMetadata: IEventHandler = {
            id: handlerId,
            subscribesTo: ['ON_BATTLE_START', 'ON_TURN_START', 'ON_UNIT_HEALED', 'ON_DAMAGE_DEALT', 'ON_ULTIMATE_USED', 'ON_BASIC_ATTACK', 'ON_SKILL_USED', 'ON_WEAKNESS_BREAK'],
        };

        const handlerLogic: IEventHandlerLogic = (event, state, handlerId) => {
            let newState = { ...state };
            const unit = newState.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            let currentUnit = { ...unit };
            let statsChanged = false;

            // --- 新形式: eventHandlers ---
            for (const handler of lightCone.eventHandlers || []) {
                // 購読イベントチェック
                if (!handler.events.includes(event.type as any)) continue;

                // クールダウン状態取得
                const lcState = currentUnit.lightConeState?.[handler.id] || { cooldown: 0, activations: 0 };
                const resetType = handler.cooldownResetType || CooldownResetType.WEARER_TURN;
                const cooldownTurns = handler.cooldownTurns ?? 0;
                const maxActivations = handler.maxActivations ?? (cooldownTurns > 0 ? 1 : Infinity);

                // リセット処理 (ON_TURN_START)
                if (event.type === 'ON_TURN_START') {
                    let shouldReset = false;
                    if (resetType === CooldownResetType.WEARER_TURN && event.sourceId === sourceUnitId) shouldReset = true;
                    if (resetType === CooldownResetType.ANY_TURN) shouldReset = true;

                    if (shouldReset) {
                        const newCooldown = Math.max(0, lcState.cooldown - 1);
                        const newActivations = 0; // 新しいターンなのでリセット

                        // 状態更新
                        if (lcState.cooldown !== newCooldown || lcState.activations !== newActivations) {
                            currentUnit.lightConeState = {
                                ...currentUnit.lightConeState,
                                [handler.id]: { cooldown: newCooldown, activations: newActivations }
                            };
                            statsChanged = true;
                        }
                    }
                }

                // リセット処理 (ON_ACTION_COMPLETE) - PER_ACTION用
                if (event.type === 'ON_ACTION_COMPLETE' && resetType === CooldownResetType.PER_ACTION) {
                    if (event.sourceId === sourceUnitId) {
                        const newCooldown = Math.max(0, lcState.cooldown - 1);
                        const newActivations = 0; // アクション完了でリセット

                        if (lcState.cooldown !== newCooldown || lcState.activations !== newActivations) {
                            currentUnit.lightConeState = {
                                ...currentUnit.lightConeState,
                                [handler.id]: { cooldown: newCooldown, activations: newActivations }
                            };
                            statsChanged = true;
                        }
                    }
                }

                // 発動チェック
                const canActivate = lcState.cooldown === 0 && lcState.activations < maxActivations;

                // クールダウン中はスキップ（ただし、ON_TURN_STARTのようなリセット用イベントでもハンドラ自体は呼び出しても良いが、
                // 光円錐の効果発動イベント（ON_ATTACK等）の場合はガードすべき。
                // 厳密には、ハンドラ内で判定するのが柔軟だが、generic側で共通ガードを提供する。
                // ただし、'ON_TURN_START' はリセット目的で必ず通過させる必要があるため、上のリセット処理と分離。

                if (event.type !== 'ON_TURN_START' && !canActivate) {
                    continue;
                }

                // ハンドラ実行
                // 状態更新前に実行して、イベントの結果（バフ付与など）を newState に反映
                // ハンドラ内部で newState.registry.update を呼ぶと競合するため、
                // ハンドラには「現在の暫定 unit」ではなく「現在の newState」を渡すのが基本だが、
                // ハンドラが `state` を返す仕様なので、chained update になる。

                // ここで重要なのは、handler実行後に activations を増やすかどうか。
                // 実際に効果が発動したかどうか（条件満たしたか）を知る由がないため、
                // ハンドラ側で判定して state を更新したか、あるいは戻り値でシグナルを送る必要があるが、
                // 現在のインターフェースでは state のみを返す。
                // とりあえず、イベントタイプが一致してハンドラが実行されたらカウントする（簡易実装）。
                // ※ より厳密にするなら、ハンドラ側で lightConeState を更新すべきだが、
                // 汎用化のためここでラップしてカウントアップする。
                // 
                // ただし、ハンドラ内でも条件判定（例：会心時のみ）があるため、
                // 無条件カウントアップは危険。
                // 
                // 妥協案: クールダウン管理はハンドラ内で行う必要があるが、
                // ユーザー要望は「汎用的に実装」なので、
                // ハンドラ実行前の state と実行後の state を比較して変更があれば発動とみなす？
                // あるいは、generic handler内ではリセットのみ管理し、
                // 発動制限は各ハンドラ（memories-of-the-past.ts等）で `checkCooldown(unit, handlerId)` みたいなヘルパー呼ぶ？
                // 
                // 今回は「ハンドララッパーで管理」する方針で、
                // ハンドラが `state` を変更した場合のみカウントアップする方式を採用する。

                const previousStateJson = JSON.stringify(newState); // 簡易比較用 (Performance注意だが正確)
                // あるいは registry のバージョン管理があればよいが。

                // Note: currentUnit はまだ newState に反映されていない変更を持っている可能性があるため、
                // handler に渡す unit も最新化して渡す必要がある。
                // しかし handler の引数は (event, state, unit, superimposition)。
                // currentUnit の変更（stats等）を一時的に state に反映させてから渡す。

                let tempState = newState;
                if (statsChanged) {
                    tempState = {
                        ...newState,
                        registry: newState.registry.update(createUnitId(sourceUnitId), u => currentUnit)
                    };
                }

                const executedState = handler.handler(event, tempState, currentUnit, superimposition);

                // 変更検知 (参照等価性チェックだけでは不十分な場合もあるが、Redux流儀ならOK)
                if (executedState !== tempState) {
                    newState = executedState;

                    // 発動カウント更新 (ON_TURN_START以外)
                    if (event.type !== 'ON_TURN_START') {
                        const newActivations = lcState.activations + 1;
                        // クールダウン設定 (初回発動時のみ、あるいは毎回リセット？要件による。通常は発動したらCD発生)
                        // ここでは「発動したら指定ターン数のCDセット」とする
                        const newCooldown = handler.cooldownTurns || 0;

                        // currentUnit も更新 (ループ継続のため)
                        currentUnit.lightConeState = {
                            ...currentUnit.lightConeState,
                            [handler.id]: { cooldown: newCooldown, activations: newActivations }
                        };
                        statsChanged = true;
                    }

                    // ハンドラ実行で unit が変更された場合、currentUnit に反映
                    const updatedUnit = newState.registry.get(createUnitId(sourceUnitId));
                    if (updatedUnit) {
                        // lightConeStateは維持しつつ他をマージ
                        const preservedLcState = currentUnit.lightConeState;
                        currentUnit = { ...updatedUnit };
                        if (preservedLcState) {
                            currentUnit.lightConeState = preservedLcState;
                        }
                    }
                }
            }

            // --- 旧形式: effects (互換性維持) ---
            for (const effect of lightCone.effects || []) {
                // If custom handler is present, delegate logic to it
                if (effect.customHandler) {
                    if (effect.condition) {
                        const conditionMet = effect.condition(currentUnit.stats);
                        const modifierId = `${handlerId}-${effect.id || 'effect'}`;
                        const existingModifierIndex = currentUnit.modifiers.findIndex(m => m.source === modifierId);

                        if (conditionMet && existingModifierIndex === -1) {
                            newState = effect.apply(currentUnit, newState, event);
                            // Sync unit from registry
                            const freshUnit = newState.registry.get(createUnitId(sourceUnitId));
                            if (freshUnit) currentUnit = { ...freshUnit };
                            statsChanged = true;
                        } else if (!conditionMet && existingModifierIndex !== -1) {
                            newState = effect.remove(currentUnit, newState, event);
                            // Sync unit from registry
                            const freshUnit = newState.registry.get(createUnitId(sourceUnitId));
                            if (freshUnit) currentUnit = { ...freshUnit };
                            statsChanged = true;
                        }
                    } else {
                        // If no condition, just call apply (e.g. permanent dynamic buff or event trigger)
                        newState = effect.apply(currentUnit, newState, event);
                        const freshUnit = newState.registry.get(createUnitId(sourceUnitId));
                        if (freshUnit) currentUnit = { ...freshUnit };
                        statsChanged = true;
                    }
                    continue;
                }

                if (!effect.condition) continue;

                const conditionMet = effect.condition(currentUnit.stats);
                const modifierId = `${handlerId}-${effect.id || 'effect'}`;
                const existingModifierIndex = currentUnit.modifiers.findIndex(m => m.source === modifierId);

                if (effect.targetStat && Array.isArray(effect.effectValue)) {
                    const value = effect.effectValue[superimposition - 1];
                    const isPercentage = effect.targetStat.endsWith('_pct');

                    if (conditionMet && existingModifierIndex === -1) {
                        console.log(`[GenericLightConeHandler] Applying buff: ${lightCone.name} to ${currentUnit.name}`);
                        // Apply
                        updateUnitStats(currentUnit, effect.targetStat, value, isPercentage, true);
                        // イミュータブルな配列操作（NEW）
                        currentUnit.modifiers = [...currentUnit.modifiers, {
                            target: effect.targetStat,
                            source: modifierId,
                            type: isPercentage ? 'pct' : 'add',
                            value: value,
                        }];

                        // Add Effect for display
                        currentUnit.effects = [...currentUnit.effects, {
                            id: `effect-${modifierId}`,
                            name: effect.name || lightCone.name,
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'PERMANENT',
                            duration: -1,
                            apply: (t: Unit, s: GameState) => s,
                            remove: (t: Unit, s: GameState) => s
                        }];

                        statsChanged = true;
                        newState.log.push({
                            actionType: 'バフ',
                            sourceId: sourceUnitId,
                            characterName: currentUnit.name,
                            targetId: sourceUnitId,
                            details: `${lightCone.name} 効果適用: ${effect.targetStat} +${value}`
                        });
                    } else if (!conditionMet && existingModifierIndex !== -1) {
                        console.log(`[GenericLightConeHandler] Removing buff: ${lightCone.name} from ${currentUnit.name}`);
                        // Remove
                        updateUnitStats(currentUnit, effect.targetStat, value, isPercentage, false);
                        // イミュータブルな配列操作（NEW）
                        currentUnit.modifiers = currentUnit.modifiers.filter((_, i) => i !== existingModifierIndex);

                        // Remove Effect
                        const effectIndex = currentUnit.effects.findIndex(e => e.id === `effect-${modifierId}`);
                        if (effectIndex !== -1) {
                            currentUnit.effects = currentUnit.effects.filter((_, i) => i !== effectIndex);
                        }

                        statsChanged = true;
                        newState.log.push({
                            actionType: 'バフ解除',
                            sourceId: sourceUnitId,
                            characterName: currentUnit.name,
                            targetId: sourceUnitId,
                            details: `${lightCone.name} 効果解除`
                        });
                    }
                }
            }

            if (statsChanged) {
                newState = {
                    ...newState,
                    registry: newState.registry.update(createUnitId(sourceUnitId), u => currentUnit)
                };
            }

            return newState;
        };

        return { handlerMetadata, handlerLogic };
    };
}
