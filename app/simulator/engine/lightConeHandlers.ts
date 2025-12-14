import { GameState, Unit, CooldownMetadata } from './types';
import { Character, StatKey } from '@/app/types';
import { IEffect } from '../effect/types';

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
        const unit = newState.units.find(u => u.id === unitId);
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
                newState = {
                    ...newState,
                    units: newState.units.map(u => u.id === unitId ? updatedUnit : u)
                };
            }
        }
    }

    // イベントハンドラーの登録（既存ロジック）
    if (!lightCone.eventHandlers) return newState;

    for (const eventHandler of lightCone.eventHandlers) {
        const handlerId = `lc-${lightCone.id}-${eventHandler.id}-${unitId}`;
        const cooldownTurns = (eventHandler as any).cooldown || 0;

        // イベントハンドラーメタデータを登録
        newState.eventHandlers = [
            ...newState.eventHandlers,
            {
                id: handlerId,
                subscribesTo: eventHandler.events
            }
        ];

        // ハンドラーロジックを登録
        newState.eventHandlerLogics = {
            ...newState.eventHandlerLogics,
            [handlerId]: (event, s) => {
                const unit = s.units.find(u => u.id === unitId);
                if (!unit) return s;

                // クールダウンチェック（クールダウンがある場合のみ）
                const cooldownKey = handlerId;
                if (cooldownTurns > 0 && s.cooldowns[cooldownKey] > 0) return s;

                // ハンドラー実行
                const result = eventHandler.handler(event, s, unit, superimposition);

                // クールダウン設定（cooldownが1以上の場合のみ）
                if (cooldownTurns > 0 && result.cooldowns[cooldownKey] === undefined) {
                    return {
                        ...result,
                        cooldowns: { ...result.cooldowns, [cooldownKey]: cooldownTurns }
                    };
                }

                return result;
            }
        };

        // クールダウンメタデータを登録（クールダウンがある場合のみ）
        if (cooldownTurns > 0) {
            const resetType = eventHandler.cooldownResetType || 'wearer_turn';
            newState.cooldownMetadata = {
                ...newState.cooldownMetadata,
                [handlerId]: {
                    handlerId,
                    resetType,
                    ownerId: unitId
                }
            };
        }
    }

    return newState;
}

