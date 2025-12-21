import { ILightConeData, IUnitData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const riverFlowsInSpring: ILightConeData = {
    id: 'river-flows-in-spring',
    name: '春水に初生する',
    description: '戦闘に入った後、装備キャラの速度+8%、与ダメージ+12%。この効果はキャラがダメージを受けた後に失効し、装備キャラの次のターンが終了した時に再度効力を発生する。',
    descriptionTemplate: '戦闘に入った後、装備キャラの速度+{0}%、与ダメージ+{1}%。この効果はキャラがダメージを受けた後に失効し、装備キャラの次のターンが終了した時に再度効力を発生する。',
    descriptionValues: [
        ['8', '12'],
        ['9', '15'],
        ['10', '18'],
        ['11', '21'],
        ['12', '24']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 846,
        atk: 476,
        def: 396,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'river_flows_init',
            name: '春水に初生する（初期化）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const spdVal = [0.08, 0.09, 0.10, 0.11, 0.12][superimposition - 1];
                const dmgVal = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `river_flows_buff_${unit.id}`,
                    name: '春水に初生する',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    modifiers: [
                        { target: 'spd_pct', source: '春水に初生する', type: 'add', value: spdVal },
                        { target: 'all_type_dmg_boost', source: '春水に初生する', type: 'add', value: dmgVal }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'river_flows_hit_check',
            name: '春水に初生する（被弾判定）',
            events: ['ON_AFTER_HIT'],
            handler: (event, state, unit, superimposition) => {
                // 装備者がダメージを受けた場合（ターゲットである）
                if (!('targetId' in event) || !event.targetId) return state;
                if (event.targetId !== unit.id) return state;

                // バフが存在するか確認
                const buffId = `river_flows_buff_${unit.id}`;
                const hasBuff = unit.effects.some(e => e.id === buffId);

                if (hasBuff) {
                    // バフ削除
                    let newState = removeEffect(state, unit.id, buffId);

                    // 後でバフを復元するための「クールダウン」効果を追加
                    // 「次のターン終了時に再度効力を発生する」-> 1ターン継続？
                    // 「次のターン」は「装備者の次のターン終了時」を意味すると仮定。
                    // 期間1はフェーズに応じて現在/次のターン終了時に終了する。
                    // 安全のため、`arrows`（3ターン）を参照。
                    // 期間1を使用する。
                    const spdVal = [0.08, 0.09, 0.10, 0.11, 0.12][superimposition - 1];
                    const dmgVal = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                    // `remove` で復元コールバックを定義
                    newState = addEffect(newState, unit.id, {
                        id: `river_flows_cooldown_${unit.id}`,
                        name: '春水に初生する（クールダウン）',
                        category: 'STATUS', // Hidden/Status
                        sourceUnitId: unit.id,
                        durationType: 'TURN_END_BASED',
                        duration: 1,
                        modifiers: [],
                        apply: (u, s) => s,
                        remove: (u, s) => {
                            // バフを復元
                            return addEffect(s, u.id, {
                                id: `river_flows_buff_${u.id}`,
                                name: '春水に初生する',
                                category: 'BUFF',
                                sourceUnitId: u.id,
                                durationType: 'PERMANENT',
                                duration: -1,
                                modifiers: [
                                    { target: 'spd_pct', source: '春水に初生する', type: 'add', value: spdVal },
                                    { target: 'all_type_dmg_boost', source: '春水に初生する', type: 'add', value: dmgVal }
                                ],
                                apply: (uu, ss) => ss,
                                remove: (uu, ss) => ss
                            });
                        }
                    });
                    return newState;
                }
                return state;
            }
        }
    ]
};
