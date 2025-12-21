import { ILightConeData } from '../../types';
import { addEnergyToUnit } from '../../simulator/engine/energy';

export const sharedFeeling: ILightConeData = {
    id: 'shared-feeling',
    name: '同じ気持ち',
    description: '装備キャラの治癒量+10%。装備キャラが戦闘スキルを発動した時、味方全体のEPを2回復。',
    descriptionTemplate: '装備キャラの治癒量+{0}%。装備キャラが戦闘スキルを発動した時、味方全体のEPを{1}回復。',
    descriptionValues: [
        ['10', '2.0'],
        ['12', '2.5'],
        ['15', '3.0'],
        ['17', '3.5'],
        ['20', '4.0']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },

    passiveEffects: [
        {
            id: 'shared-healing',
            name: 'ケアとメンテ（治癒量）',
            category: 'BUFF',
            targetStat: 'outgoing_healing_boost',
            effectValue: [0.10, 0.12, 0.15, 0.17, 0.20]
        }
    ],

    eventHandlers: [
        {
            id: 'shared-ep',
            name: 'ケアとメンテ（EP回復）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const epAmount = [2.0, 2.5, 3.0, 3.5, 4.0][superimposition - 1];

                let newState = state;
                const allies = newState.registry.getAliveAllies();
                for (const ally of allies) {
                    newState = addEnergyToUnit(newState, ally.id, epAmount);
                }
                return newState;
            }
        }
    ]
};
