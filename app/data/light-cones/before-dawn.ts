import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const beforeDawn: ILightConeData = {
    id: 'before-dawn',
    name: '夜明け前',
    description: '装備キャラの会心ダメージ+36%。装備キャラの戦闘スキルと必殺技の与ダメージ+18%。装備キャラが戦闘スキル、または必殺技を発動した後、「夢身」効果を獲得する。追加攻撃を発動した時、「夢身」を消費し、追加攻撃の与ダメージ+48%。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。装備キャラの戦闘スキルと必殺技の与ダメージ+{1}%。装備キャラが戦闘スキル、または必殺技を発動した後、「夢身」効果を獲得する。追加攻撃を発動した時、「夢身」を消費し、追加攻撃の与ダメージ+{2}%。',
    descriptionValues: [
        ['36', '18', '48'],
        ['42', '21', '56'],
        ['48', '24', '64'],
        ['54', '28', '72'],
        ['60', '30', '80']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'before-dawn-crit',
            name: '夜明け前（ステータス）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.36, 0.42, 0.48, 0.54, 0.60]
        },
        {
            id: 'before-dawn-skill-ult-dmg',
            name: '夜明け前（スキル・必殺技与ダメ）',
            category: 'BUFF',
            targetStat: 'skill_dmg_boost',
            effectValue: [0.18, 0.21, 0.24, 0.28, 0.30]
        }
    ],
    eventHandlers: [
        {
            id: 'before-dawn-passive-stats',
            name: '夜明け前（常時バフ）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const skillUltDmg = [0.18, 0.21, 0.24, 0.28, 0.30][superimposition - 1];
                return addEffect(state, unit.id, {
                    id: `before_dawn_passive_${unit.id}`,
                    name: '夜明け前（与ダメUP）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    modifiers: [
                        { target: 'skill_dmg_boost', value: skillUltDmg, type: 'add', source: '夜明け前' },
                        { target: 'ult_dmg_boost', value: skillUltDmg, type: 'add', source: '夜明け前' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'before-dawn-somnus-gain',
            name: '夜明け前（夢身獲得）',
            events: ['ON_SKILL_USED', 'ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // Gain "Somnus Corpus"
                return addEffect(state, unit.id, {
                    id: `before_dawn_somnus_${unit.id}`,
                    name: '夢身',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // 使用されるまで持続
                    duration: -1,
                    stackCount: 1,
                    modifiers: [], // 直接的なステータスはなく、与ダメのために消費される
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'before-dawn-somnus-consume',
            name: '夜明け前（夢身消費）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION', 'ON_ACTION_COMPLETE'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // ロジック:
                // 1. ON_BEFORE_DAMAGE_CALCULATION: 追加攻撃かつ夢身がある場合 -> 与ダメージUPを追加
                // 2. ON_ACTION_COMPLETE: 追加攻撃かつ夢身がある（またはあった）場合、夢身を解除。

                // 注：ON_ACTION_COMPLETEで解除する場合、多段ヒットがあった場合に二重取りしないようにする必要があるか？
                // 与ダメージUPは一時的（モディファイア注入）。必ずしも「夢身」効果自体を変更しない。
                // しかしブーストを適用するために「夢身」の存在を確認する。

                if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                    // 追加攻撃かチェック
                    const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                    // このダメージが追加攻撃によるものか知る必要がある。
                    // 通常 subType または actionType が示す。
                    // シミュレータは BeforeDamageCalcEvent で actionType/subType を渡すか？
                    // 以前の修正で `subType` が `BeforeDamageCalcEvent` に追加された。

                    if (dmgEvent.subType !== 'FOLLOW_UP_ATTACK') return state;

                    // 夢身をチェック
                    const somnus = unit.effects.find(e => e.id === `before_dawn_somnus_${unit.id}`);
                    if (!somnus) return state;

                    const fuaDmgBoost = [0.48, 0.56, 0.64, 0.72, 0.80][superimposition - 1];

                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            fuaDmg: (state.damageModifiers.fuaDmg || 0) + fuaDmgBoost
                        }
                    };
                } else if (event.type === 'ON_ACTION_COMPLETE') {
                    // 追加攻撃完了後に夢身を解除
                    const actionEvent = event as import('@/app/simulator/engine/types').ActionEvent;
                    if (actionEvent.type === 'ON_FOLLOW_UP_ATTACK') {
                        const somnus = unit.effects.find(e => e.id === `before_dawn_somnus_${unit.id}`);
                        if (somnus) {
                            return removeEffect(state, unit.id, somnus.id);
                        }
                    }
                }

                return state;
            }
        }
    ]
};
