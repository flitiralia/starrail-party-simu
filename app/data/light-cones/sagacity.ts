import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const sagacity: ILightConeData = {
    id: 'sagacity',
    name: '見識',
    description: '装備キャラが必殺技を発動した時、攻撃力+24%、2ターン継続。',
    descriptionTemplate: '装備キャラが必殺技を発動した時、攻撃力+{0}%、2ターン継続。',
    descriptionValues: [
        ['24'],
        ['30'],
        ['36'],
        ['42'],
        ['48']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 740,
        atk: 370,
        def: 264,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'sagacity-atk-buff',
            name: '見識（攻撃力UP）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const atkBuff = [0.24, 0.30, 0.36, 0.42, 0.48][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `sagacity_atk_${unit.id}`,
                    name: '見識（攻撃力）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 2,
                    stackCount: 1,
                    modifiers: [{ target: 'atk_pct', value: atkBuff, type: 'add', source: '見識' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
