import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const theHellWhereIdealsBurn: ILightConeData = {
    id: 'the-hell-where-ideals-burn',
    name: '理想を焼く奈落で',
    description: '装備キャラの会心率+16%。戦闘に入る時、味方の最大SPが6以上の場合、装備キャラの攻撃力+40%。装備キャラが戦闘スキルを発動するたびに、装備キャラの攻撃力+10%、最大4層まで累積できる。',
    descriptionTemplate: '装備キャラの会心率+{0}%。戦闘に入る時、味方の最大SPが6以上の場合、装備キャラの攻撃力+{1}%。装備キャラが戦闘スキルを発動するたびに、装備キャラの攻撃力+{2}%、最大4層まで累積できる。',
    descriptionValues: [
        ['16', '40', '10'],
        ['20', '50', '12'],
        ['24', '60', '14'],
        ['28', '70', '16'],
        ['32', '80', '18']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 952,
        atk: 582,
        def: 529,
    },
    passiveEffects: [
        {
            id: 'ideals-burn-crit',
            name: '理想を焼く奈落で（会心率）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'ideals-burn-sp-check',
            name: '理想を焼く奈落で（SP条件）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                if (state.maxSkillPoints < 6) return state;

                const atkVal = [0.40, 0.50, 0.60, 0.70, 0.80][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `ideals_burn_sp_buff_${unit.id}`,
                    name: '理想を焼く奈落で（SPボーナス）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    modifiers: [
                        { target: 'atk_pct', source: '理想を焼く奈落で', type: 'add', value: atkVal }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'ideals-burn-skill-stack',
            name: '理想を焼く奈落で（スキルスタック）',
            events: ['ON_SKILL_USED'], // スキル使用時にこのイベントが発火すると仮定
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const atkStep = [0.10, 0.12, 0.14, 0.16, 0.18][superimposition - 1];

                // スタックを1追加
                return addEffect(state, unit.id, {
                    id: `ideals_burn_stack_${unit.id}`,
                    name: '理想を焼く奈落で（累積）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // 持続時間が指定されていない？
                    // 「戦闘終了まで？」通常、「継続ターン」が指定されていない限り、累積バフはそうなる。
                    // テキストに持続時間の指定はないため永続と仮定。
                    duration: -1,
                    stackCount: 1,
                    maxStacks: 4,
                    modifiers: [
                        { target: 'atk_pct', source: '理想を焼く奈落で', type: 'add', value: atkStep }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
