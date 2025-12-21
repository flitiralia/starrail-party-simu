import { ILightConeData } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { addAura, removeAura } from '../../simulator/engine/auraManager';
import { createUnitId } from '../../simulator/engine/unitId';

// 値を計算するヘルパー
const getValues = (s: number) => {
    // S1: 脆弱 10%, 会心ダメ 16%, ブースト 60%
    // S2: 脆弱 12%, 会心ダメ 19%, ブースト 65%
    // S5: 脆弱 18%, 会心ダメ 28%, ブースト 80%

    // Vuln: 10, 12, 14, 16, 18
    const msgVuln = [0.10, 0.12, 0.14, 0.16, 0.18][s - 1];
    // CD: 16, 19, 22, 25, 28
    const msgCd = [0.16, 0.19, 0.22, 0.25, 0.28][s - 1];
    // Boost: 0.60, 0.65, 0.70, 0.75, 0.80
    const boost = [0.60, 0.65, 0.70, 0.75, 0.80][s - 1];

    return { msgVuln, msgCd, boost };
};

export const loveIsNowEternal: ILightConeData = {
    id: 'love-is-now-eternal',
    name: '愛はいま永遠に',
    description: '装備キャラの速度+18%。装備キャラの記憶の精霊は、味方単体に精霊スキルを発動する時に「空白」を獲得する。「空白」の効果:敵全体の受けるダメージ+10%。装備キャラの記憶の精霊は、敵に精霊スキルを発動する時に「詩句」を獲得する。「詩句」の効果:味方全体の会心ダメージ+16%。装備キャラの記憶の精霊が「空白」と「詩句」を同時に所持している時、「空白」と「詩句」の効果が元の60%分アップする。',
    descriptionTemplate: '装備キャラの速度+{0}%。装備キャラの記憶の精霊は、味方単体に精霊スキルを発動する時に「空白」を獲得する。「空白」の効果:敵全体の受けるダメージ+{1}%。装備キャラの記憶の精霊は、敵に精霊スキルを発動する時に「詩句」を獲得する。「詩句」の効果:味方全体の会心ダメージ+{2}%。装備キャラの記憶の精霊が「空白」と「詩句」を同時に所持している時、「空白」と「詩句」の効果が元の{3}%分アップする。',
    descriptionValues: [
        ['18', '10', '16', '60'],
        ['21', '12', '19', '65'],
        ['24', '14', '22', '70'],
        ['27', '16', '25', '75'],
        ['30', '18', '28', '80']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 1270,
        atk: 476,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'love-spd',
            name: '約束（速度）',
            category: 'BUFF',
            targetStat: 'spd_pct',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
        }
    ],
    eventHandlers: [
        {
            id: 'love-grant-states',
            name: '約束（空白・詩句付与）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source || !source.isSummon || source.ownerId !== unit.id) return state;

                const { msgVuln, msgCd, boost } = getValues(superimposition);
                const targetId = (event as any).targetId;
                if (!targetId) return state;

                const targetUnit = state.registry.get(createUnitId(targetId));
                if (!targetUnit) return state;

                const isTargetEnemy = targetUnit.isEnemy;

                // ロジック:
                // ターゲットが敵でない（味方）場合 -> 「空白」を獲得（脆弱デバフオーラ）
                // ターゲットが敵の場合 -> 「詩句」を獲得（会心ダメバフオーラ）

                let newState = state;

                // 相互作用ロジックを持つバフを追加する関数
                // 効果ID: `love-blank-${source.id}`, `love-verse-${source.id}`

                if (!isTargetEnemy) { // 空白（味方ターゲット）
                    // 空白を付与
                    newState = addEffect(newState, source.id, {
                        id: `love-blank-${source.id}`,
                        name: '空白',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        // オーラソースが source.id の場合、ソースが死亡すると消滅する。正しい。
                        durationType: 'PERMANENT',
                        duration: -1,
                        modifiers: [],
                        onApply: (u, s) => {
                            // 詩句をチェック
                            const hasVerse = u.effects.some(e => e.id === `love-verse-${u.id}`);
                            const multiplier = hasVerse ? (1 + boost) : 1;

                            // 空白オーラを追加/更新
                            const auraValue = msgVuln * multiplier;
                            s = addAura(s, {
                                id: `aura-love-blank-${u.id}`,
                                name: '空白（被ダメ）',
                                sourceUnitId: u.id,
                                target: 'all_enemies',
                                modifiers: [{ target: 'all_type_vuln', value: auraValue, type: 'add', source: '空白' }]
                            });

                            // 詩句が存在する場合、それも更新
                            if (hasVerse) {
                                const verseValue = msgCd * multiplier;
                                s = addAura(s, {
                                    id: `aura-love-verse-${u.id}`,
                                    name: '詩句（会心ダメ）',
                                    sourceUnitId: u.id,
                                    target: 'all_allies',
                                    modifiers: [{ target: 'crit_dmg', value: verseValue, type: 'add', source: '詩句' }]
                                });
                            }
                            return s;
                        },
                        onRemove: (u, s) => {
                            s = removeAura(s, `aura-love-blank-${u.id}`);
                            // 詩句が存在する場合、通常に戻す
                            const hasVerse = u.effects.some(e => e.id === `love-verse-${u.id}`);
                            if (hasVerse) {
                                s = addAura(s, {
                                    id: `aura-love-verse-${u.id}`,
                                    name: '詩句（会心ダメ）',
                                    sourceUnitId: u.id,
                                    target: 'all_allies',
                                    modifiers: [{ target: 'crit_dmg', value: msgCd, type: 'add', source: '詩句' }]
                                });
                            }
                            return s;
                        },
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                } else { // 詩句（敵ターゲット）
                    // 詩句を付与
                    newState = addEffect(newState, source.id, {
                        id: `love-verse-${source.id}`,
                        name: '詩句',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        modifiers: [],
                        onApply: (u, s) => {
                            // 空白をチェック
                            const hasBlank = u.effects.some(e => e.id === `love-blank-${u.id}`);
                            const multiplier = hasBlank ? (1 + boost) : 1;

                            // 詩句オーラを追加/更新
                            const auraValue = msgCd * multiplier;
                            s = addAura(s, {
                                id: `aura-love-verse-${u.id}`,
                                name: '詩句（会心ダメ）',
                                sourceUnitId: u.id,
                                target: 'all_allies',
                                modifiers: [{ target: 'crit_dmg', value: auraValue, type: 'add', source: '詩句' }]
                            });

                            // 空白が存在する場合、それも更新
                            if (hasBlank) {
                                const blankValue = msgVuln * multiplier;
                                s = addAura(s, {
                                    id: `aura-love-blank-${u.id}`,
                                    name: '空白（被ダメ）',
                                    sourceUnitId: u.id,
                                    target: 'all_enemies',
                                    modifiers: [{ target: 'all_type_vuln', value: blankValue, type: 'add', source: '空白' }]
                                });
                            }
                            return s;
                        },
                        onRemove: (u, s) => {
                            s = removeAura(s, `aura-love-verse-${u.id}`);
                            // 空白が存在する場合、通常に戻す
                            const hasBlank = u.effects.some(e => e.id === `love-blank-${u.id}`);
                            if (hasBlank) {
                                s = addAura(s, {
                                    id: `aura-love-blank-${u.id}`,
                                    name: '空白（被ダメ）',
                                    sourceUnitId: u.id,
                                    target: 'all_enemies',
                                    modifiers: [{ target: 'all_type_vuln', value: msgVuln, type: 'add', source: '空白' }]
                                });
                            }
                            return s;
                        },
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return newState;
            }
        }
    ]
};
