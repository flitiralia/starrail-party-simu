import { GameState, Unit, CooldownMetadata } from './types';
import { Character, StatKey, CooldownResetType } from '@/app/types';
import { IEffect } from '../effect/types';
import { createUnitId } from './unitId';

/**
 * 光円錐のイベントハンドラーを登録
 */
export function registerLightConeEventHandlers(
    state: GameState,
    character: Character,
    unitId: string
): GameState {
    const lightCone = character.equippedLightCone?.lightCone;
    if (!lightCone) return state;

    const superimposition = character.equippedLightCone?.superimposition || 1;
    let newState = { ...state };

    // パッシブ効果をIEffectとしてunit.effectsに追加
    if (lightCone.passiveEffects) {
        const unit = newState.registry.get(createUnitId(unitId));
        if (unit) {
            const passiveEffects: IEffect[] = lightCone.passiveEffects
                .filter(pe => !pe.condition) // 条件なしのパッシブのみ
                .map(pe => {
                    const value = pe.effectValue[superimposition - 1] || 0;
                    return {
                        id: `lc-passive-${lightCone.id}-${pe.id}-${unitId}`,
                        name: `${lightCone.name}: ${pe.name}`,
                        category: 'BUFF' as const,
                        sourceUnitId: unitId,
                        durationType: 'PERMANENT' as const,
                        duration: -1,
                        modifiers: [{
                            target: pe.targetStat as StatKey,
                            value: value,
                            type: 'add' as const,
                            source: lightCone.name
                        }],
                        apply: (t: Unit, s: GameState) => s,
                        remove: (t: Unit, s: GameState) => s
                    };
                });

            // 既に追加されていないエフェクトのみ追加
            const existingIds = new Set(unit.effects.map(e => e.id));
            const newEffects = passiveEffects.filter(e => !existingIds.has(e.id));

            if (newEffects.length > 0) {
                const updatedUnit = {
                    ...unit,
                    effects: [...unit.effects, ...newEffects]
                };
                // newState = updateUnit(newState, createUnitId(unitId), { effects: [...unit.effects, ...newEffects] });
                newState = {
                    ...newState,
                    registry: newState.registry.update(createUnitId(unitId), u => ({ ...u, effects: [...u.effects, ...newEffects] }))
                };
            }
        }
    }

    // イベントハンドラーの登録（既存ロジック）
    if (!lightCone.eventHandlers) return newState;

    for (const eventHandler of lightCone.eventHandlers) {
        const handlerId = `lc-${lightCone.id}-${eventHandler.id}-${unitId}`;
        const cooldownTurns = eventHandler.cooldownTurns ?? 0;
        const maxActivations = eventHandler.maxActivations ?? (cooldownTurns > 0 ? 1 : Infinity);
        const resetType = eventHandler.cooldownResetType || CooldownResetType.WEARER_TURN;

        // イベントハンドラーメタデータを登録
        // ON_TURN_START も購読してリセット処理を行う
        // PER_ACTION の場合は ON_ACTION_COMPLETE も購読
        const subscribesTo = [...eventHandler.events];
        if (!subscribesTo.includes('ON_TURN_START')) {
            subscribesTo.push('ON_TURN_START');
        }
        if (resetType === CooldownResetType.PER_ACTION && !subscribesTo.includes('ON_ACTION_COMPLETE')) {
            subscribesTo.push('ON_ACTION_COMPLETE');
        }

        newState.eventHandlers = [
            ...newState.eventHandlers,
            {
                id: handlerId,
                subscribesTo: subscribesTo
            }
        ];

        // ハンドラーロジックを登録
        newState.eventHandlerLogics = {
            ...newState.eventHandlerLogics,
            [handlerId]: (event, s) => {
                const unit = s.registry.get(createUnitId(unitId));
                if (!unit) return s;

                // lightConeState から状態取得
                const lcState = unit.lightConeState?.[handlerId] || { cooldown: 0, activations: 0 };

                // ON_TURN_START: ターンベースのリセット処理
                if (event.type === 'ON_TURN_START') {
                    let shouldReset = false;
                    if (resetType === CooldownResetType.WEARER_TURN && event.sourceId === unitId) shouldReset = true;
                    if (resetType === CooldownResetType.ANY_TURN) shouldReset = true;

                    if (shouldReset) {
                        const newCooldown = Math.max(0, lcState.cooldown - 1);
                        const newActivations = 0; // ターン開始時にリセット

                        if (lcState.cooldown !== newCooldown || lcState.activations !== newActivations) {
                            const updatedLcState = {
                                ...unit.lightConeState,
                                [handlerId]: { cooldown: newCooldown, activations: newActivations }
                            };
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(unitId), u => ({
                                    ...u,
                                    lightConeState: updatedLcState
                                }))
                            };
                        }
                    }
                    return s; // ON_TURN_START はリセット処理のみ
                }

                // ON_ACTION_COMPLETE: アクションベースのリセット処理（PER_ACTION用）
                if (event.type === 'ON_ACTION_COMPLETE' && resetType === CooldownResetType.PER_ACTION) {
                    if (event.sourceId === unitId) {
                        // アクション完了時にクールダウンを減らし、発動回数をリセット
                        const newCooldown = Math.max(0, lcState.cooldown - 1);
                        const newActivations = 0;

                        if (lcState.cooldown !== newCooldown || lcState.activations !== newActivations) {
                            const updatedLcState = {
                                ...unit.lightConeState,
                                [handlerId]: { cooldown: newCooldown, activations: newActivations }
                            };
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(unitId), u => ({
                                    ...u,
                                    lightConeState: updatedLcState
                                }))
                            };
                        }
                    }
                    return s; // ON_ACTION_COMPLETE はリセット処理のみ
                }

                // その他のイベント: 発動チェック
                if (!eventHandler.events.includes(event.type as any)) return s;

                const canActivate = lcState.cooldown === 0 && lcState.activations < maxActivations;
                if (!canActivate) return s;

                // ハンドラー実行
                const result = eventHandler.handler(event, s, unit, superimposition);

                // 発動したかどうかは result !== s で判定（ハンドラが状態を変更したか）
                if (result !== s) {
                    // 発動カウント更新
                    const freshUnit = result.registry.get(createUnitId(unitId));
                    if (freshUnit) {
                        const updatedLcState = {
                            ...freshUnit.lightConeState,
                            [handlerId]: {
                                cooldown: cooldownTurns,
                                activations: lcState.activations + 1
                            }
                        };
                        return {
                            ...result,
                            registry: result.registry.update(createUnitId(unitId), u => ({
                                ...u,
                                lightConeState: updatedLcState
                            }))
                        };
                    }
                }

                return result;
            }
        };

        // クールダウンメタデータを登録（クールダウンがある場合のみ）
        if (cooldownTurns > 0) {
            newState.cooldownMetadata = {
                ...newState.cooldownMetadata,
                [handlerId]: {
                    handlerId,
                    resetType: resetType as 'wearer_turn' | 'any_turn',
                    ownerId: unitId
                }
            };
        }
    }

    return newState;
}

