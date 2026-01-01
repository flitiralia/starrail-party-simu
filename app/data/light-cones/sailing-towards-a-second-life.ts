import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const sailingTowardsASecondLife: ILightConeData = {
    id: 'sailing-towards-a-second-life',
    name: '二度目の生に向かって',
    description: '装備キャラの撃破特効+60%、与える弱点撃破ダメージが敵の防御力を20%無視する。戦闘中、装備キャラの撃破特効が150%以上の場合、速度+12%。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%、与える弱点撃破ダメージが敵の防御力を{1}%無視する。戦闘中、装備キャラの撃破特効が150%以上の場合、速度+{2}%。',
    descriptionValues: [
        ['60', '20', '12'],
        ['70', '23', '14'],
        ['80', '26', '16'],
        ['90', '29', '18'],
        ['100', '32', '20']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'sailing-be',
            name: '二度目の生に向かって（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.60, 0.70, 0.80, 0.90, 1.00]
        }
    ],
    eventHandlers: [
        {
            id: 'sailing-def-ignore',
            name: '二度目の生に向かって（防御無視）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 撃破ダメージか確認
                // 通常 damageType 'BREAK' が使用される。
                const damageType = (event as any).damageType;
                if (damageType !== 'BREAK' && damageType !== 'SUPER_BREAK') return state;

                const defIgnoreVal = [0.20, 0.23, 0.26, 0.29, 0.32][superimposition - 1];

                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        defIgnore: (state.damageModifiers.defIgnore || 0) + defIgnoreVal
                    }
                };
            }
        },
        {
            id: 'sailing-spd-check',
            name: '二度目の生に向かって（速度条件）',
            events: ['ON_TURN_START'], // 定期的にチェック
            handler: (event, state, unit, superimposition) => {
                const spdVal = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];
                const buffId = `sailing_spd_buff_${unit.id}`;

                // 撃破特効を確認
                if ((unit.stats.break_effect || 0) >= 1.50) {
                    // 未付与の場合バフを適用
                    if (!unit.effects.some(e => e.id === buffId)) {
                        return addEffect(state, unit.id, {
                            id: buffId,
                            name: '二度目の生に向かって（速度）',
                            category: 'BUFF',
                            sourceUnitId: unit.id,
                            durationType: 'PERMANENT',
                            duration: -1,
                            modifiers: [
                                { target: 'spd_pct', source: '二度目の生に向かって', type: 'add', value: spdVal }
                            ],
                            apply: (u, s) => s,
                            remove: (u, s) => s
                        });
                    }
                } else {
                    // 付与されている場合バフを削除
                    if (unit.effects.some(e => e.id === buffId)) {
                        return removeEffect(state, unit.id, buffId);
                    }
                }
                return state;
            }
        }
    ]
};
