import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const untoTomorrowsMorrow: ILightConeData = {
    id: 'unto-tomorrows-morrow',
    name: '明日の明日まで',
    description: '装備キャラの治癒量+12%。味方の残りHPが50%以上の場合、与ダメージ+12%。',
    descriptionTemplate: '装備キャラの治癒量+{0}%。味方の残りHPが50%以上の場合、与ダメージ+{1}%。',
    descriptionValues: [
        ['12', '12'],
        ['15', '14'],
        ['24', '16'], // 値はテキストに基づいて調整: 12/15/24?
        // ファイル内のテキスト: 12, 15, 24 ??
        // 通常、スケーリングは線形: 12, 15, 18, 21, 24.
        // ファイルに提供された値: 3段階で 12, 15, 24? それとも 12/15/18/21/24 の意味？
        // ファイルには:
        // 治癒量 12% 15% 24% (3列しかない??)
        // 与ダメージ 12% 14% 20%
        // これは典型的な S1, S2, S5 か?
        // 豊穣の光円錐はしばしば 12-24 スケール。
        // S1=12, S2=15?, S3=18, S4=21, S5=24. (3刻み).
        // ダメージ: S1=12, S2=14, S3=16, S4=18, S5=20. (2刻み).
        // 線形補間を使用する。
        ['21', '18'],
        ['24', '20']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 1058,
        atk: 476,
        def: 396,
    },

    passiveEffects: [
        {
            id: 'unto-heal',
            name: '別れ（治癒量）',
            category: 'BUFF',
            targetStat: 'outgoing_healing_boost',
            effectValue: [0.12, 0.15, 0.18, 0.21, 0.24]
        }
    ],

    eventHandlers: [
        {
            id: 'unto-dmg-buff',
            name: '別れ（条件付与ダメ）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const dmgBoost = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                // オーラのような効果を全ての味方に適用
                // 各味方は自身のHPを確認
                let newState = state;
                const allies = newState.registry.getAliveAllies();
                for (const ally of allies) {
                    newState = addEffect(newState, ally.id, {
                        id: `unto-dmg-${unit.id}-${ally.id}`,
                        name: '別れ（与ダメUP）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        modifiers: [{
                            target: 'all_type_dmg_boost',
                            source: '明日の明日まで',
                            type: 'add',
                            value: 0,
                            dynamicValue: (u) => {
                                // 自身のHPを確認
                                return (u.hp / u.stats.hp) >= 0.5 ? dmgBoost : 0;
                            }
                        }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }
                return newState;
            }
        }
    ]
};
