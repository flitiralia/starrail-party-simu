import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const shadowedByNight: ILightConeData = {
    id: 'shadowed-by-night',
    name: '夜は影のように付き纏う',
    description: '装備キャラの撃破特効+28%、戦闘に入った時または弱点撃破ダメージを与えた後、速度+8%、2ターン継続。この効果はターンが回ってくるたびに1回まで発動できる。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%、戦闘に入った時または弱点撃破ダメージを与えた後、速度+{1}%、2ターン継続。この効果はターンが回ってくるたびに1回まで発動できる。',
    descriptionValues: [
        ['28', '8'],
        ['35', '9'],
        ['42', '10'],
        ['49', '11'],
        ['56', '12']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 846,
        atk: 476,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'shadowed_by_night_be',
            name: '夜は影のように付き纏う（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.28, 0.35, 0.42, 0.49, 0.56]
        }
    ],
    eventHandlers: [
        {
            id: 'shadowed_by_night_spd_proc',
            name: '夜は影のように付き纏う（速度）',
            events: ['ON_BATTLE_START', 'ON_WEAKNESS_BREAK'],
            cooldownResetType: CooldownResetType.WEARER_TURN,
            maxActivations: 1,
            handler: (event, state, unit, superimposition) => {
                if (event.type === 'ON_WEAKNESS_BREAK' && event.sourceId !== unit.id) return state;

                // ON_BATTLE_STARTはグローバルイベントであり、'sourceId'のチェックは不要（undefinedかシステム）。
                // いずれにせよ'unit'に適用する必要がある。
                // ただし、ON_WEAKNESS_BREAKはソースを確認する。

                const spdVal = [0.08, 0.09, 0.10, 0.11, 0.12][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `shadowed_by_night_spd_buff_${unit.id}`,
                    name: '夜は影のように付き纏う（速度）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    modifiers: [
                        {
                            target: 'spd_pct',
                            source: '夜は影のように付き纏う',
                            type: 'add',
                            value: spdVal
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
