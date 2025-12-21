import { ILightConeData } from '../../types';
import { applyHealing } from '../../simulator/engine/utils';

export const pioneering: ILightConeData = {
    id: 'pioneering',
    name: '新天地',
    description: '装備キャラが敵を弱点撃破した時、HPを最大HP12%分回復する。',
    descriptionTemplate: '装備キャラが敵を弱点撃破した時、HPを最大HP{0}%分回復する。',
    descriptionValues: [
        ['12'],
        ['14'],
        ['16'],
        ['18'],
        ['20']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 952,
        atk: 264,
        def: 264,
    },

    eventHandlers: [
        {
            id: 'pioneering-heal',
            name: 'カンパニー（撃破回復）',
            events: ['ON_WEAKNESS_BREAK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const healPct = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                return applyHealing(state, unit.id, unit.id, {
                    scaling: 'hp',
                    multiplier: healPct
                }, '新天地（撃破回復）');
            }
        }
    ]
};
