import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';
import { publishEvent } from '@/app/simulator/engine/dispatcher';

export const aThanklessCoronation: ILightConeData = {
    id: 'a-thankless-coronation',
    name: '報われぬ戴冠',
    description: '装備キャラの会心ダメージ+36%。必殺技を発動する時、装備キャラの攻撃力+40%、2ターン継続。なお、装備キャラの最大EPが300以上の場合、自身の最大EP10%分のEPを回復し、追加で装備キャラの攻撃力+40%、2ターン継続。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。必殺技を発動する時、装備キャラの攻撃力+{1}%、2ターン継続。なお、装備キャラの最大EPが300以上の場合、自身の最大EP10%分のEPを回復し、追加で装備キャラの攻撃力+{1}%、2ターン継続。',
    descriptionValues: [
        ['36', '40'],
        ['45', '50'],
        ['54', '60'],
        ['63', '70'],
        ['72', '80']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 952,
        atk: 582,
        def: 529,
    },
    passiveEffects: [
        {
            id: 'thankless_coronation_cd',
            name: '報われぬ戴冠（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.36, 0.45, 0.54, 0.63, 0.72]
        }
    ],
    eventHandlers: [
        {
            id: 'thankless_coronation_proc',
            name: '報われぬ戴冠（発動）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const atkVal = [0.40, 0.50, 0.60, 0.70, 0.80][superimposition - 1];

                const maxEp = unit.stats.max_ep || 140; // フォールバック
                const isHighEp = maxEp >= 300;

                let stateWithEP = state;
                let additionalAtk = 0;

                if (isHighEp) {
                    additionalAtk = atkVal;
                    // EP回復 (最大EPの10%)
                    stateWithEP = addEnergyToUnit(
                        state,
                        unit.id,
                        maxEp * 0.10, // 10%
                        0,
                        true, // skipERR: true (固定割合回復は通常ERR乗らないが、テキスト「EPを回復し」は乗る場合も。明示がない場合、効果による回復は乗らないことが多いが、安全策でskipERR=trueにするか？テキストは「10%分のEPを回復」。EP Gainではない。ERR非適用で実装。)
                        {
                            sourceId: unit.id,
                            publishEventFn: publishEvent
                        }
                    );
                }

                return addEffect(stateWithEP, unit.id, {
                    id: `thankless_coronation_buff_${unit.id}`,
                    name: '報われぬ戴冠（攻撃力）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    skipFirstTurnDecrement: true,
                    modifiers: [
                        {
                            target: 'atk_pct',
                            source: '報われぬ戴冠',
                            type: 'add',
                            value: atkVal + additionalAtk
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
