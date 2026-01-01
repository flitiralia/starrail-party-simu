import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const indeliblePromise: ILightConeData = {
    id: 'indelible-promise',
    name: '心に刻まれた約束',
    description: '装備キャラの撃破特効+28%。装備キャラが必殺技を発動する時、会心率+15%，2ターン継続。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%。装備キャラが必殺技を発動する時、会心率+{1}%，2ターン継続。',
    descriptionValues: [
        ['28', '15'],
        ['35', '18'],
        ['42', '22'],
        ['49', '26'],
        ['56', '30']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'indelible-promise-be',
            name: '心に刻まれた約束（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.28, 0.35, 0.42, 0.49, 0.56]
        }
    ],
    eventHandlers: [
        {
            id: 'indelible-promise-crit',
            name: '心に刻まれた約束（会心率）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const critVal = [0.15, 0.18, 0.22, 0.26, 0.30][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `indelible_promise_buff_${unit.id}`,
                    name: '心に刻まれた約束（会心率）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    skipFirstTurnDecrement: true,
                    modifiers: [
                        {
                            target: 'crit_rate',
                            source: '心に刻まれた約束',
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
