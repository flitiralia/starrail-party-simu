import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const arrows: ILightConeData = {
    id: 'arrows',
    name: '矢じり',
    description: '戦闘開始時、装備キャラの会心率+12%、3ターン継続。',
    descriptionTemplate: '戦闘開始時、装備キャラの会心率+{0}%、3ターン継続。',
    descriptionValues: [
        ['12'],
        ['15'],
        ['18'],
        ['21'],
        ['24']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 846,
        atk: 317,
        def: 264,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'arrows-crit-buff',
            name: '矢じり（会心率）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const critRateVal = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `arrows_buff_${unit.id}`,
                    name: '矢じり（会心率）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 3,
                    modifiers: [
                        {
                            target: 'crit_rate',
                            source: '矢じり',
                            type: 'add',
                            value: critRateVal
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
