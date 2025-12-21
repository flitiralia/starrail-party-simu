import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const momentOfVictory: ILightConeData = {
    id: 'moment-of-victory',
    name: '勝利の刹那',
    description: '装備キャラの防御力+24%、効果命中+24%。自身が攻撃を受ける確率がアップする。装備キャラが攻撃を受けた後、さらに防御力+24%、効果は自身のターンが終了するまで継続。',
    descriptionTemplate: '装備キャラの防御力+{0}%、効果命中+{1}%。自身が攻撃を受ける確率がアップする。装備キャラが攻撃を受けた後、さらに防御力+{2}%、効果は自身のターンが終了するまで継続。',
    descriptionValues: [
        ['24', '24', '24'],
        ['28', '28', '28'],
        ['32', '32', '32'],
        ['36', '36', '36'],
        ['40', '40', '40']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 1058,
        atk: 476,
        def: 595,
    },

    passiveEffects: [
        {
            id: 'moment-of-victory-passive',
            name: '決断（常時）',
            category: 'BUFF',
            targetStat: 'def_pct',
            effectValue: [0.24, 0.28, 0.32, 0.36, 0.40]
        },
        {
            id: 'moment-of-victory-ehr',
            name: '決断（効果命中）',
            category: 'BUFF',
            targetStat: 'effect_hit_rate',
            effectValue: [0.24, 0.28, 0.32, 0.36, 0.40]
        },
        {
            id: 'moment-of-victory-aggro',
            name: '決断（ヘイトアップ）',
            category: 'BUFF',
            targetStat: 'aggro',
            effectValue: [2.0, 2.0, 2.0, 2.0, 2.0] // プレースホルダー値、標準的なヘイトアップロジック
        }
    ],

    eventHandlers: [
        {
            id: 'moment-of-victory-on-hit',
            name: '決断（被弾時防御アップ）',
            events: ['ON_ATTACK', 'ON_DAMAGE_DEALT'],
            handler: (event, state, unit, superimposition) => {
                // ユニットがターゲットだったかチェック
                if (!('targetId' in event)) return state;
                if (event.targetId !== unit.id) return state;

                const defBoost = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `moment-of-victory-hit-def-${unit.id}`,
                    name: '決断（被弾後防御力UP）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 1,
                    modifiers: [
                        {
                            target: 'def_pct',
                            source: '勝利の刹那',
                            type: 'add',
                            value: defBoost
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
