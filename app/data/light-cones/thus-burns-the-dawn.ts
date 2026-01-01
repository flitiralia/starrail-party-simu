import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const thusBurnsTheDawn: ILightConeData = {
    id: 'thus-burns-the-dawn',
    name: '燃え盛る黎明のように',
    description: '装備キャラの基礎速度+12、ダメージを与える時、敵の防御力を18%無視する。装備キャラが必殺技を発動した後、「烈日」を獲得する。この効果はターンが回ってきた時に解除される。「烈日」を所持している場合、装備キャラの与ダメージ+60%。',
    descriptionTemplate: '装備キャラの基礎速度+{0}、ダメージを与える時、敵の防御力を{1}%無視する。装備キャラが必殺技を発動した後、「烈日」を獲得する。この効果はターンが回ってきた時に解除される。「烈日」を所持している場合、装備キャラの与ダメージ+{2}%。',
    descriptionValues: [
        ['12', '18', '60'],
        ['14', '22', '78'],
        ['16', '27', '96'],
        ['18', '31', '114'],
        ['20', '36', '132']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 952,
        atk: 687,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'thus-burns-the-dawn-spd',
            name: '燃え盛る黎明のように（速度）',
            category: 'BUFF',
            targetStat: 'spd',
            effectValue: [12, 14, 16, 18, 20]
        }
    ],
    eventHandlers: [
        {
            id: 'thus-burns-the-dawn-def-ignore',
            name: '燃え盛る黎明のように（防御無視）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId === unit.id) {
                    const defIgnore = [0.18, 0.22, 0.27, 0.31, 0.36][superimposition - 1];
                    state.damageModifiers.defIgnore = (state.damageModifiers.defIgnore || 0) + defIgnore;
                }
                return state;
            }
        },
        {
            id: 'thus-burns-the-dawn-proc',
            name: '烈日獲得',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const dmgVal = [0.60, 0.78, 0.96, 1.14, 1.32][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `thus_burns_the_dawn_buff_${unit.id}`,
                    name: '烈日',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    modifiers: [
                        {
                            target: 'all_type_dmg_boost',
                            source: '燃え盛る黎明のように',
                            type: 'add',
                            value: dmgVal
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'thus-burns-the-dawn-remove',
            name: '烈日解除',
            events: ['ON_TURN_START'],
            handler: (event, state, unit, superimposition) => {
                // event has unitId? TurnStartEvent
                const turnUnitId = 'unitId' in event ? event.unitId : null;
                if (turnUnitId !== unit.id) return state;

                return removeEffect(state, unit.id, `thus_burns_the_dawn_buff_${unit.id}`);
            }
        }
    ]
};
