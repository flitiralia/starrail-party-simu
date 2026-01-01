import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const danceAtSunset: ILightConeData = {
    id: 'dance-at-sunset',
    name: '夕日に舞う',
    description: '装備キャラの攻撃を受ける確率が大アップし、会心ダメージ+36%。装備キャラが必殺技を発動した後、「炎舞」を1層獲得する、2ターン継続、最大で2層累積できる。「炎舞」1層につき、装備キャラの追加攻撃ダメージ+36%。',
    descriptionTemplate: '装備キャラの攻撃を受ける確率が大アップし、会心ダメージ+{0}%。装備キャラが必殺技を発動した後、「炎舞」を1層獲得する、2ターン継続、最大で2層累積できる。「炎舞」1層につき、装備キャラの追加攻撃ダメージ+{1}%。',
    descriptionValues: [
        ['36', '36'],
        ['42', '42'],
        ['48', '48'],
        ['54', '54'],
        ['60', '60']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'dance-at-sunset-stats',
            name: '夕日に舞う（常時）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.36, 0.42, 0.48, 0.54, 0.60]
        },
        {
            id: 'dance-at-sunset-aggro',
            name: '夕日に舞う（ヘイト）',
            category: 'BUFF',
            targetStat: 'aggro',
            effectValue: [3.0, 3.0, 3.0, 3.0, 3.0]
        }
    ],
    eventHandlers: [
        {
            id: 'dance-at-sunset-proc',
            name: '炎舞獲得',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const fuaDmg = [0.36, 0.42, 0.48, 0.54, 0.60][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `dance_at_sunset_buff_${unit.id}`,
                    name: '炎舞',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    stackCount: 1,
                    maxStacks: 2,
                    skipFirstTurnDecrement: true,
                    modifiers: [
                        {
                            target: 'fua_dmg_boost',
                            source: '夕日に舞う',
                            type: 'add',
                            value: fuaDmg
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
