import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const dayOneOfMyNewLife: ILightConeData = {
    id: 'day-one-of-my-new-life',
    name: '余生の初日',
    description: '装備キャラの防御力+16%。戦闘に入った後、味方全体の全属性耐性+8%。',
    descriptionTemplate: '装備キャラの防御力+{0}%。戦闘に入った後、味方全体の全属性耐性+{1}%。',
    descriptionValues: [
        ['16', '8'],
        ['18', '9'],
        ['20', '10'],
        ['22', '11'],
        ['24', '12']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 952,
        atk: 370,
        def: 463,
    },

    passiveEffects: [
        {
            id: 'day-one-def',
            name: '余生の初日（防御力）',
            category: 'BUFF',
            targetStat: 'def_pct',
            effectValue: [0.16, 0.18, 0.20, 0.22, 0.24]
        }
    ],

    eventHandlers: [
        {
            id: 'day-one-aura',
            name: '余生の初日（オーラ）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const resBoost = [0.08, 0.09, 0.10, 0.11, 0.12][superimposition - 1];

                // 味方全体に永続的なバフを適用
                let newState = state;
                const allies = newState.registry.getAliveAllies();
                for (const ally of allies) {
                    newState = addEffect(newState, ally.id, {
                        id: `day-one-res-${unit.id}-${ally.id}`,
                        name: '余生の初日（耐性UP）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1, // 実質的に永続
                        modifiers: [
                            { target: 'physical_res', value: resBoost, type: 'add', source: '余生の初日' },
                            { target: 'fire_res', value: resBoost, type: 'add', source: '余生の初日' },
                            { target: 'ice_res', value: resBoost, type: 'add', source: '余生の初日' },
                            { target: 'lightning_res', value: resBoost, type: 'add', source: '余生の初日' },
                            { target: 'wind_res', value: resBoost, type: 'add', source: '余生の初日' },
                            { target: 'quantum_res', value: resBoost, type: 'add', source: '余生の初日' },
                            { target: 'imaginary_res', value: resBoost, type: 'add', source: '余生の初日' }
                        ],
                        apply: (u: import('../../simulator/engine/types').Unit, s: import('../../simulator/engine/types').GameState) => s,
                        remove: (u: import('../../simulator/engine/types').Unit, s: import('../../simulator/engine/types').GameState) => s
                    });
                }
                return newState;
            }
        }
    ]
};
