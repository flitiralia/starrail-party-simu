import { OrnamentSet } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

/**
 * 天国@配信ルーム
 * 2セット: 会心ダメ+16%。同ターンにSP3以上消費で会心ダメ+32%、3ターン継続。
 */
export const HEAVEN_AT_STREAMING_ROOM: OrnamentSet = {
    id: 'heaven_at_streaming_room',
    name: '天国@配信ルーム',
    setBonuses: [
        {
            pieces: 2,
            description: '装備キャラの会心ダメージ+16%。同じターンにSPを3以上消費した場合、さらに会心ダメージ+32%、3ターン継続する。',
            passiveEffects: [
                {
                    stat: 'crit_dmg',
                    value: 0.16,
                    target: 'self'
                }
            ],
            eventHandlers: [
                {
                    // SP消費を追跡
                    events: ['ON_SKILL_USED'],
                    handler: (event, state, sourceUnitId) => {
                        const unit = state.units.find(u => u.id === sourceUnitId);
                        if (!unit) return state;

                        // SP消費追跡用のカウンターを更新
                        const trackerId = `heaven-sp-tracker-${sourceUnitId}`;
                        const currentCount = (state.cooldowns[trackerId] || 0) + 1;

                        let newState = {
                            ...state,
                            cooldowns: {
                                ...state.cooldowns,
                                [trackerId]: currentCount
                            }
                        };

                        // 3以上消費したら会心ダメ+32%バフ付与
                        if (currentCount >= 3) {
                            const buff: IEffect = {
                                id: 'heaven-cdmg-boost',
                                name: '天国@配信ルーム（会心ダメージ）',
                                category: 'BUFF',
                                sourceUnitId: sourceUnitId,
                                durationType: 'TURN_END_BASED',
                                skipFirstTurnDecrement: true,
                                duration: 3,
                                modifiers: [{
                                    target: 'crit_dmg',
                                    source: '天国@配信ルーム',
                                    type: 'add',
                                    value: 0.32
                                }],
                                apply: (t, s) => s,
                                remove: (t, s) => s
                            };
                            newState = addEffect(newState, sourceUnitId, buff);
                        }

                        return newState;
                    }
                },
                {
                    // ターン終了時にカウンターリセット
                    events: ['ON_TURN_END'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        const trackerId = `heaven-sp-tracker-${sourceUnitId}`;
                        if (state.cooldowns[trackerId]) {
                            return {
                                ...state,
                                cooldowns: {
                                    ...state.cooldowns,
                                    [trackerId]: 0
                                }
                            };
                        }
                        return state;
                    }
                }
            ],
        },
    ],
};
