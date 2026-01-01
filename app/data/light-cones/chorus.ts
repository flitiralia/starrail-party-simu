import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const chorus: ILightConeData = {
    id: 'chorus',
    name: '斉頌',
    description: '戦闘に入った後、味方全体の攻撃力+8%。同系統のスキルは重ね掛け不可。',
    descriptionTemplate: '戦闘に入った後、味方全体の攻撃力+{0}%。',
    descriptionValues: [
        ['8'],
        ['9'],
        ['10'],
        ['11'],
        ['12']
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
            id: 'chorus-aura',
            name: '斉頌（攻撃力）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const val = [0.08, 0.09, 0.10, 0.11, 0.12][superimposition - 1];
                const allies = state.registry.getAliveAllies();
                let newState = state;
                allies.forEach(ally => {
                    newState = addEffect(newState, ally.id, {
                        id: `chorus_atk_${ally.id}`,
                        name: '協力（攻撃力）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: 1,
                        modifiers: [{ target: 'atk_pct', value: val, type: 'add', source: '斉頌' }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                });
                return newState;
            }
        }
    ]
};
