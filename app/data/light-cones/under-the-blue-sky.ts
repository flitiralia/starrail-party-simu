import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const underTheBlueSky: ILightConeData = {
    id: 'under-the-blue-sky',
    name: '青空の下で',
    description: '装備キャラの攻撃力+16%。装備キャラが敵を倒した後、会心率+12%。3ターン継続。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。装備キャラが敵を倒した後、会心率+{1}%。3ターン継続。',
    descriptionValues: [
        ['16', '12'],
        ['20', '15'],
        ['24', '18'],
        ['28', '21'],
        ['32', '24']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'under_the_blue_sky_atk',
            name: '青空の下で（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'under_the_blue_sky_proc',
            name: '青空の下で（会心率）',
            events: ['ON_ENEMY_DEFEATED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const critVal = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `under_the_blue_sky_buff_${unit.id}`,
                    name: '青空の下で（会心率）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 3,
                    skipFirstTurnDecrement: true,
                    modifiers: [
                        {
                            target: 'crit_rate',
                            source: '青空の下で',
                            type: 'add',
                            value: critVal
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
