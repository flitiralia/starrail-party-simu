import { ILightConeData } from '../../types';
import { addEnergyToUnit } from '../../simulator/engine/energy';

export const quidProQuo: ILightConeData = {
    id: 'quid-pro-quo',
    name: '等価交換',
    description: '装備キャラのターンが回って来た時、自身以外のEPが50%未満の味方からランダムに1人選択し、EPを8回復させる。',
    descriptionTemplate: '装備キャラのターンが回って来た時、自身以外のEPが50%未満の味方からランダムに1人選択し、EPを{0}回復させる。',
    descriptionValues: [
        ['8'],
        ['10'],
        ['12'],
        ['14'],
        ['16']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },

    eventHandlers: [
        {
            id: 'quid-pro-quo-trigger',
            name: '心地よい（EP回復）',
            events: ['ON_TURN_START'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const epAmount = [8, 10, 12, 14, 16][superimposition - 1];

                const candidates = state.registry.getAliveAllies().filter(a =>
                    a.id !== unit.id &&
                    (a.ep / a.stats.max_ep) < 0.5
                );

                if (candidates.length === 0) return state;

                // ランダム選択
                const target = candidates[Math.floor(Math.random() * candidates.length)];

                return addEnergyToUnit(state, target.id, epAmount);
            }
        }
    ]
};
