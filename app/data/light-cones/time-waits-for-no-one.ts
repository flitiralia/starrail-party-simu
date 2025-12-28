import { ILightConeData } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';
import { IEffect } from '../../simulator/effect/types';

export const timeWaitsForNoOne: ILightConeData = {
    id: 'time-waits-for-no-one',
    name: '時節は居らず',
    description: '装備キャラの最大HP+18%、治癒量+12%。装備キャラが味方に治癒を行った時、治癒量が記録される。任意の味方が攻撃を行った後、攻撃を受けたランダムな敵1体に対して、装備キャラの属性と同じ属性で、記録された治癒量36%分の付加ダメージを与える。このダメージはバフの影響を受けず、ターンが回ってくるたびに1回まで発生する。',
    descriptionTemplate: '装備キャラの最大HP+{0}%、治癒量+{1}%。装備キャラが味方に治癒を行った時、治癒量が記録される。任意の味方が攻撃を行った後、攻撃を受けたランダムな敵1体に対して、装備キャラの属性と同じ属性で、記録された治癒量{2}%分の付加ダメージを与える。このダメージはバフの影響を受けず、ターンが回ってくるたびに1回まで発生する。',
    descriptionValues: [
        ['18', '12', '36'],
        ['21', '14', '42'],
        ['24', '16', '48'],
        ['27', '18', '54'],
        ['30', '20', '60']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 1270,
        atk: 476,
        def: 463,
    },

    passiveEffects: [
        {
            id: 'time-waits-hp',
            name: '一日は四時あり（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
        },
        {
            id: 'time-waits-heal',
            name: '一日は四時あり（治癒量）',
            category: 'BUFF',
            targetStat: 'outgoing_healing_boost',
            effectValue: [0.12, 0.14, 0.16, 0.18, 0.20]
        }
    ],

    eventHandlers: [
        {
            id: 'time-waits-recorder',
            name: '一日は四時あり（記録と発動）',
            events: ['ON_BATTLE_START', 'ON_UNIT_HEALED', 'ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                const recorderId = `time-waits-record-${unit.id}`;

                // 1. レコーダーを戦闘開始時に初期化
                if (event.type === 'ON_BATTLE_START') {
                    return addEffect(state, unit.id, {
                        id: recorderId,
                        name: '一日は四時あり（治癒記録）',
                        category: 'OTHER',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        miscData: { recordedHealing: 0, cooldown: false },
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                // Fetch Recorder
                const existing = unit.effects.find(e => e.id === recorderId);
                if (!existing) return state; // Should be initialized

                let recordedHealing = existing.miscData?.recordedHealing || 0;
                const cooldown = existing.miscData?.cooldown || false;

                // 2. 治癒量の記録
                if (event.type === 'ON_UNIT_HEALED' && event.sourceId === unit.id) {
                    const healAmount = (event as any).healingDone || 0; // HealEvent は通常 `healingDone` を持つ
                    recordedHealing += healAmount;

                    // 効果を更新
                    return addEffect(state, unit.id, {
                        ...existing,
                        miscData: { ...existing.miscData, recordedHealing }
                    });
                }

                // 3. 攻撃時にダメージ発動
                if (event.type === 'ON_ATTACK') {
                    // 任意の味方の攻撃（自身を含む）
                    const attacker = state.registry.get(createUnitId(event.sourceId));
                    if (!attacker || attacker.isEnemy) return state;

                    if (recordedHealing <= 0) return state;
                    if (cooldown) return state; // このターンはクールダウン中

                    // ターゲット：攻撃を受けたランダムな敵。event.targetId を使用
                    if (!event.targetId) return state;

                    const multiplier = [0.36, 0.42, 0.48, 0.54, 0.60][superimposition - 1];
                    const dmg = recordedHealing * multiplier;

                    // ダメージ適用（直接HP減少または付加ダメージログ？）
                    // 「付加ダメージ... バフの影響を受けない」。
                    // 通常、固定ダメージまたは `ADDITIONAL_DAMAGE` タイプとして固定値で実装される。
                    // シミュレーター `damage.ts` は `baseDmg` をサポートしている。
                    // しかしここでは別のログエントリまたは「付加ダメージ」が必要。
                    // 最善の方法：`state.log` を使用して記録し、HPを減らす？
                    // シミュレーターのパイプラインは、このアドホックなダメージを検証しない可能性がある。
                    // ダメージをトリガーする「偽」の効果適用を使用するか、単にHPを変更することができる。
                    // 「付加ダメージ」は通常 `ON_DAMAGE_DEALT` をトリガーする。

                    // HPを直接変更し、それをログに記録しよう。
                    // そしてクールダウンを設定する。
                    // クールダウンはいつリセットされる？ "ターンが回ってくるたびに1回"。
                    // 通常、装備者のターン開始時にリセットされることを意味する？ それとも攻撃者のターン？
                    // 「装備者のターン」と仮定。
                    // 注：クールダウンをリセットするメカニズムが必要。
                    // そのために ON_TURN_START を使用できる。

                    let newState = state;
                    const targetUnit = newState.registry.get(createUnitId(event.targetId));
                    if (targetUnit) {
                        // 直接HP減少（固定ダメージをシミュレート）
                        const newHp = Math.max(0, targetUnit.hp - dmg);
                        newState = {
                            ...newState,
                            registry: newState.registry.update(targetUnit.id, u => ({ ...u, hp: newHp }))
                        };

                        // 統合ログに付加ダメージを追記
                        const { appendAdditionalDamage } = require('../../simulator/engine/dispatcher');
                        newState = appendAdditionalDamage(newState, {
                            source: unit.name,
                            name: '時節は居らず',
                            damage: dmg,
                            target: targetUnit.name,
                            damageType: 'additional',
                            isCrit: false,
                            breakdownMultipliers: {
                                baseDmg: dmg,
                                critMult: 1,
                                dmgBoostMult: 1,
                                defMult: 1,
                                resMult: 1,
                                vulnMult: 1,
                                brokenMult: 1
                            }
                        });
                    }

                    // 治癒記録をリセット？
                    // テキストは「1ターンに1回発生する」と言っている。「記録を消去する」とは明言していない。
                    // しかし消去しないと累積してします。
                    // 「記録された治癒量36%分の...」。
                    // 通常は消去される。消去します。

                    return addEffect(newState, unit.id, {
                        ...existing,
                        miscData: { recordedHealing: 0, cooldown: true }
                    });
                }

                return state;
            }
        },
        {
            id: 'time-waits-reset',
            name: '一日は四時あり（CDリセット）',
            events: ['ON_TURN_START'],
            handler: (event, state, unit) => {
                if (event.sourceId !== unit.id) return state;

                const recorderId = `time-waits-record-${unit.id}`;
                const existing = unit.effects.find(e => e.id === recorderId);
                if (!existing) return state;

                return addEffect(state, unit.id, {
                    ...existing,
                    miscData: { ...existing.miscData, cooldown: false }
                });
            }
        }
    ]
};
