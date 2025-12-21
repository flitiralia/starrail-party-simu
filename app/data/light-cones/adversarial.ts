import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const adversarial: ILightConeData = {
    id: 'adversarial',
    name: '相抗',
    description: '装備キャラが敵を倒した後、速度+10%、2ターン持続。',
    descriptionTemplate: '装備キャラが敵を倒した後、速度+{0}%、2ターン持続。',
    descriptionValues: [
        ['10'],
        ['12'],
        ['14'],
        ['16'],
        ['18']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 740,
        atk: 370,
        def: 264,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'adversarial_spd_buff',
            name: '相抗（速度）',
            events: ['ON_ENEMY_DEFEATED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const spdVal = [0.10, 0.12, 0.14, 0.16, 0.18][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `adversarial_buff_${unit.id}`,
                    name: '相抗（速度）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    modifiers: [
                        {
                            target: 'spd_pct', // メモ：速度バフは通常、基礎速度に対する割合
                            source: '相抗',
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
