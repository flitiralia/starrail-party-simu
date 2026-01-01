import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const forTomorrowsJourney: ILightConeData = {
    id: 'for-tomorrows-journey',
    name: '明日のための旅路',
    description: '装備キャラの攻撃力+16%。装備キャラが必殺技を発動した後、与ダメージ+18%、1ターン継続。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。装備キャラが必殺技を発動した後、与ダメージ+{1}%、1ターン継続。',
    descriptionValues: [
        ['16', '18'],
        ['20', '21'],
        ['24', '24'],
        ['28', '27'],
        ['32', '30']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'for-tomorrows-journey-atk',
            name: '明日のための旅路（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'for-tomorrows-journey-ult-dmg',
            name: '明日のための旅路（与ダメ）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const val = [0.18, 0.21, 0.24, 0.27, 0.30][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `for_tomorrows_journey_buff_${unit.id}`,
                    name: '連結（与ダメ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 1,
                    stackCount: 1,
                    modifiers: [{ target: 'all_type_dmg_boost', value: val, type: 'add', source: '明日のための旅路' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
