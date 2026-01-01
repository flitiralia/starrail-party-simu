import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const afterTheCharmonyFall: ILightConeData = {
    id: 'after-the-charmony-fall',
    name: '調和が沈黙した後',
    description: '装備キャラの撃破特効+28%。装備キャラが必殺技を発動した後、速度+8%、2ターン継続。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%。装備キャラが必殺技を発動した後、速度+{1}%、2ターン継続。',
    descriptionValues: [
        ['28', '8'],
        ['35', '10'],
        ['42', '12'],
        ['49', '14'],
        ['56', '16']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 846,
        atk: 476,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'charmony-fall-be',
            name: '調和が沈黙した後（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.28, 0.35, 0.42, 0.49, 0.56]
        }
    ],
    eventHandlers: [
        {
            id: 'charmony-fall-spd-buff',
            name: '調和が沈黙した後（速度UP）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const spdBuff = [0.08, 0.10, 0.12, 0.14, 0.16][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `charmony_fall_spd_${unit.id}`,
                    name: '静寂（速度）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 2,
                    stackCount: 1,
                    modifiers: [{ target: 'spd', value: spdBuff, type: 'pct', source: '調和が沈黙した後' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
