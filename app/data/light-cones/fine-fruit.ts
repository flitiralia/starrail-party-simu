import { ILightConeData } from '../../types';
import { addEnergyToUnit } from '../../simulator/engine/energy';

export const fineFruit: ILightConeData = {
    id: 'fine-fruit',
    name: '嘉果',
    description: '戦闘開始時、味方全体のEPを6回復する。',
    descriptionTemplate: '戦闘開始時、味方全体のEPを{0}回復する。',
    descriptionValues: [
        ['6'],
        ['7'],
        ['9'],
        ['10'],
        ['12']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 952,
        atk: 317,
        def: 198,
    },

    eventHandlers: [
        {
            id: 'fine-fruit-start',
            name: '甘美（開幕EP）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const ep = [6, 7, 9, 10, 12][superimposition - 1];

                let newState = state;
                const allies = newState.registry.getAliveAllies();
                for (const ally of allies) {
                    newState = addEnergyToUnit(newState, ally.id, ep);
                }
                return newState;
            }
        }
    ]
};
