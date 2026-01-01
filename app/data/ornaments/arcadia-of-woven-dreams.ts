import { OrnamentSet } from '../../types';
import { Unit, GameState } from '../../simulator/engine/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

/**
 * 夢を紡ぐ妖精の楽園
 * 2セット: 味方数4でない時、超過/不足1名ごとに与ダメ+9%/12%。
 */
export const ARCADIA_OF_WOVEN_DREAMS: OrnamentSet = {
    id: 'arcadia-of-woven-dreams',
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
                        if (!state?.registry) return false;
                        // 味方数をカウント（敵以外、精霊は含まない場合あり）
                        const allyCount = state.registry.getAliveAllies().filter((u: Unit) => !u.isSummon).length;
                        return allyCount !== 4;
                    },
                    evaluationTiming: 'dynamic'
                }
            ],
            eventHandlers: [
                {
                    events: ['ON_BATTLE_START', 'ON_TURN_START', 'ON_UNIT_DEATH'],
                    handler: (event, state, sourceUnitId) => {
                        const unit = state.registry.get(createUnitId(sourceUnitId));
                        if (!unit) return state;

                        // 味方数をカウント（召喚物除く）
                        const allyCount = state.registry.getAliveAllies().filter((u: Unit) => !u.isSummon).length;

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
                                apply: (t: Unit, s: GameState) => s,
                                remove: (t: Unit, s: GameState) => s
                            };
                            newState = addEffect(newState, sourceUnitId, buff);

                            // 精霊にも適用
                            const spirit = newState.registry.toArray().find((u: Unit) =>
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
