import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const MEDIATION: ILightConeData = {
    id: 'mediation',
    name: '同調',
    description: '戦闘に入る時、味方全体の速度+12、1ターン継続。',
    descriptionTemplate: '戦闘に入る時、味方全体の速度+{0}、1ターン継続。',
    descriptionValues: [
        ['12'],
        ['14'],
        ['16'],
        ['18'],
        ['20']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 846,
        atk: 317,
        def: 264,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'tuning-spd',
            name: '同調（速度）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const val = [12, 14, 16, 18, 20][superimposition - 1];
                const allies = state.registry.getAliveAllies();
                let newState = state;
                allies.forEach(ally => {
                    newState = addEffect(newState, ally.id, {
                        id: `tuning_spd_${ally.id}`,
                        name: 'ファミリー（速度）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 1,
                        stackCount: 1,
                        modifiers: [{ target: 'spd', value: val, type: 'add', source: '同調' }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                });
                return newState;
            }
        }
    ]
};
