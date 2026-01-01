import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const dartingArrow: ILightConeData = {
    id: 'darting-arrow',
    name: '離弦',
    description: '装備キャラが敵を倒した後、攻撃力+24%、3ターン持続。',
    descriptionTemplate: '装備キャラが敵を倒した後、攻撃力+{0}%、3ターン持続。',
    descriptionValues: [
        ['24'],
        ['30'],
        ['36'],
        ['42'],
        ['48']
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
            id: 'darting-arrow-atk-buff',
            name: '離弦（攻撃力）',
            events: ['ON_ENEMY_DEFEATED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const atkVal = [0.24, 0.30, 0.36, 0.42, 0.48][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `darting_arrow_buff_${unit.id}`,
                    name: '離弦（攻撃力）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 3,
                    modifiers: [
                        {
                            target: 'atk_pct',
                            source: '離弦',
                            type: 'add',
                            value: atkVal
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
