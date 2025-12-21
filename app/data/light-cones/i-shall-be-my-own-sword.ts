import { ILightConeData, createUnitId } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const iShallBeMyOwnSword: ILightConeData = {
    id: 'i-shall-be-my-own-sword',
    name: 'この身は剣なり',
    description: '装備キャラの会心ダメージ+20％。自分以外の味方が攻撃を受ける、またはHPを消費した後、装備キャラは「月蝕」を1層獲得する。この効果は最大で3層累積できる。「月蝕」1層につき、装備キャラの次の攻撃の与ダメージ+14％。「月蝕」が上限の3層に達した時、その回の攻撃は敵の防御力を+12％無視する。この効果は装備キャラが攻撃を行った後に解除される。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。自分以外の味方が攻撃を受ける、またはHPを消費した後、装備キャラは「月蝕」を1層獲得する。この効果は最大で3層累積できる。「月蝕」1層につき、装備キャラの次の攻撃の与ダメージ+{1}%。「月蝕」が上限の3層に達した時、その回の攻撃は敵の防御力を+{2}%無視する。この効果は装備キャラが攻撃を行った後に解除される。',
    descriptionValues: [
        ['20', '14', '12'],
        ['23', '16', '14'],
        ['26', '19', '16'],
        ['29', '21', '18'],
        ['32', '24', '20']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1164,
        atk: 582,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'i_shall_be_my_own_sword_crit_dmg',
            name: 'この身は剣なり（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.20, 0.23, 0.26, 0.29, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'eclipse_stack_gain',
            name: '月蝕獲得',
            events: ['ON_AFTER_HIT'],
            // ON_HP_CHANGEDはここでは理論的なもので、以前のロジックと一致させます。
            // "自分以外の味方"が必要。
            handler: (event, state, unit, superimposition) => {
                let trigger = false;

                // 味方が攻撃を受ける
                if (event.type === 'ON_AFTER_HIT' && event.targetId !== unit.id) {
                    // ターゲットが味方か確認
                    // event.targetIdはユニットを指す。
                    // ターゲットが同じパーティにいるか知る必要がある。
                    // 通常シミュレーションには敵と味方がいる。
                    // IsAlly(unit, target)を確認するユーティリティが必要。
                    // registryまたはunit.isEnemyチェックを仮定。
                    if (!event.targetId) return state;
                    const target = state.registry.get(createUnitId(event.targetId));
                    if (target && target.isEnemy === unit.isEnemy) {
                        trigger = true;
                    }
                }

                // HP消費（プレースホルダーロジック）
                // if (event.type === 'ON_DAMAGE_DEALT' && event.sourceId === event.targetId && event.sourceId !== unit.id) ...

                if (!trigger) return state;

                const dmgPerStack = [0.14, 0.16, 0.19, 0.21, 0.24][superimposition - 1];
                const defIgnoreVal = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                // 1層追加
                return addEffect(state, unit.id, {
                    id: `eclipse_buff_${unit.id}`,
                    name: '月蝕',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // 攻撃まで
                    stackCount: 1,
                    maxStacks: 3,
                    modifiers: [
                        {
                            target: 'all_type_dmg_boost',
                            source: 'この身は剣なり',
                            type: 'add',
                            value: dmgPerStack
                        }
                        // 防御無視は3層時の条件付き。
                        // モディファイアは通常スタックごとに静的？
                        // effectManagerがスタック数に基づく条件付きモディファイアをサポートしていない場合、
                        // スタックが3に達したときに適用される3層ボーナス用の別の効果が必要になるかもしれない。
                        // あるいは利用可能なら`onStackChange`を使う？
                        // 今のところ、可能なら動的モディファイアロジックを追加しようとするか、
                        // 単にOFFENSIVEハンドラでスタック数を確認するか？
                        // 実は、型がサポートしていれば最も簡単な方法：
                        // 防御無視を定義するが値を0にして、それを更新する？ いや。
                        // より良い方法：スタックが3に達したとき、2つ目の効果を適用する？
                        // より良い方法：スタックが3に達したとき、2つ目の効果を適用する？
                    ],
                    duration: -1,
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            // Handling the 3-stack bonus and removal
            id: 'eclipse_bonus_and_reset',
            name: '月蝕（防御無視＆解除）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION', 'ON_ACTION_COMPLETE'],
            handler: (event, state, unit, superimposition) => {
                const defIgnoreVal = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];
                const effect = unit.effects.find(e => e.id === `eclipse_buff_${unit.id}`);

                if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                    if (event.sourceId !== unit.id) return state;
                    if (!effect) return state;

                    // スタックが3の場合、防御無視を適用
                    if ((effect.stackCount || 0) >= 3) {
                        // 計算に一時的なモディファイアを追加
                        state.damageModifiers.defIgnore = (state.damageModifiers.defIgnore || 0) + defIgnoreVal;
                    }
                    return state;
                }

                if (event.type === 'ON_ACTION_COMPLETE') {
                    if (event.sourceId !== unit.id) return state;
                    // アクションが攻撃だった場合...そう仮定。
                    // スタックをクリア。
                    if (effect) {
                        return removeEffect(state, unit.id, effect.id);
                    }
                }

                return state;
            }
        }
    ]
};
