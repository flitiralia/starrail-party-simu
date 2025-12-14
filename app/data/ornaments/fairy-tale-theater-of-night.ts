import { OrnamentSet } from '../../types';

/**
 * 夢を紡ぐ妖精の楽園
 * 2セット: 味方数4でない時、超過/不足1名ごとに与ダメ+9%/12%。
 */
export const FAIRY_TALE_THEATER_OF_NIGHT: OrnamentSet = {
    id: 'fairy_tale_theater_of_night',
    name: '夢を紡ぐ妖精の楽園',
    setBonuses: [
        {
            pieces: 2,
            description: 'フィールド上にいる現在の味方の数が4ではない時、1名超過/不足するごとに、装備キャラおよびその記憶の精霊の与ダメージ+9%/12%、最大で4/3層累積できる。',
            passiveEffects: [
                {
                    stat: 'all_type_dmg_boost',
                    value: 0, // 動的計算
                    target: 'self',
                    condition: (stats, state, unitId) => {
                        // 味方数をカウント（敵以外、精霊は含まない場合あり）
                        const allyCount = state.units.filter(u => !u.isEnemy && !u.isSummon).length;
                        return allyCount !== 4;
                    },
                    evaluationTiming: 'dynamic'
                }
            ],
            eventHandlers: [
                {
                    events: ['ON_BATTLE_START', 'ON_TURN_START', 'ON_UNIT_DEATH'],
                    handler: (event, state, sourceUnitId) => {
                        const unit = state.units.find(u => u.id === sourceUnitId);
                        if (!unit) return state;

                        const { addEffect, removeEffect } = require('../../simulator/engine/effectManager');

                        // 味方数をカウント（召喚物除く）
                        const allyCount = state.units.filter(u => !u.isEnemy && !u.isSummon && u.hp > 0).length;

                        let dmgBoost = 0;
                        if (allyCount > 4) {
                            // 超過: 1名ごとに+9%、最大4層(+36%)
                            const excess = Math.min(allyCount - 4, 4);
                            dmgBoost = excess * 0.09;
                        } else if (allyCount < 4) {
                            // 不足: 1名ごとに+12%、最大3層(+36%)
                            const deficit = Math.min(4 - allyCount, 3);
                            dmgBoost = deficit * 0.12;
                        }

                        let newState = removeEffect(state, sourceUnitId, 'fairy-tale-dmg');

                        if (dmgBoost > 0) {
                            const buff = {
                                id: 'fairy-tale-dmg',
                                name: '夢を紡ぐ妖精の楽園',
                                category: 'BUFF' as const,
                                sourceUnitId: sourceUnitId,
                                durationType: 'PERMANENT' as const,
                                duration: 999,
                                modifiers: [{
                                    target: 'all_type_dmg_boost' as const,
                                    source: '夢を紡ぐ妖精の楽園',
                                    type: 'add' as const,
                                    value: dmgBoost
                                }],
                                apply: (t: any, s: any) => s,
                                remove: (t: any, s: any) => s
                            };
                            newState = addEffect(newState, sourceUnitId, buff);

                            // 精霊にも適用
                            const spirit = newState.units.find((u: any) =>
                                u.linkedUnitId === sourceUnitId && u.isSummon
                            );
                            if (spirit) {
                                const spiritBuff = { ...buff, id: 'fairy-tale-dmg-spirit' };
                                newState = addEffect(newState, spirit.id, spiritBuff);
                            }
                        }

                        return newState;
                    }
                }
            ],
        },
    ],
};
