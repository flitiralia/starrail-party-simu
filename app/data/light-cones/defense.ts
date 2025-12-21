import { ILightConeData } from '../../types';
import { applyHealing } from '../../simulator/engine/utils';

export const defense: ILightConeData = {
    id: 'defense',
    name: '防衛',
    description: '装備キャラが必殺技を発動した時、HPを最大HP18%分回復する。',
    descriptionTemplate: '装備キャラが必殺技を発動した時、HPを最大HP{0}%分回復する。',
    descriptionValues: [
        ['18'],
        ['21'],
        ['24'],
        ['27'],
        ['30']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 952,
        atk: 264,
        def: 264,
    },

    eventHandlers: [
        {
            id: 'defense-heal',
            name: '復興（必殺技回復）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const healPct = [0.18, 0.21, 0.24, 0.27, 0.30][superimposition - 1];

                return applyHealing(state, unit.id, unit.id, {
                    scaling: 'hp',
                    multiplier: healPct
                }, '防衛（自己回復）');
            }
        }
    ]
};
