import { ILightConeData } from '../../types';

export const sweatOverTears: ILightConeData = {
    id: 'sweat-over-tears',
    name: '流すなら涙より汗',
    description: '装備キャラの最大HP+16%。装備キャラの記憶の精霊がフィールドに存在する時、装備キャラの与ダメージ+20%。装備キャラの会心率と会心ダメージの合計が80%以上の時、さらに与ダメージ+16%。',
    descriptionTemplate: '装備キャラの最大HP+{0}%。装備キャラの記憶の精霊がフィールドに存在する時、装備キャラの与ダメージ+{1}%。装備キャラの会心率と会心ダメージの合計が80%以上の時、さらに与ダメージ+{2}%。',
    descriptionValues: [
        ['16', '20', '16'],
        ['20', '25', '20'],
        ['24', '30', '24'],
        ['28', '35', '28'],
        ['32', '40', '32']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 846,
        atk: 476,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'sweat-hp',
            name: '薫陶（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    // リセットアプローチ：開始時にイベントハンドラを使用してバフを適用。
    eventHandlers: [
        {
            id: 'sweat-apply-buff',
            name: '流すなら涙より汗（バフ適用）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const baseBoost = [0.20, 0.25, 0.30, 0.35, 0.40][superimposition - 1];
                const extraBoost = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];

                const { addEffect } = require('../../simulator/engine/effectManager');
                return addEffect(state, unit.id, {
                    id: `sweat-buff-${unit.id}`,
                    name: '薫陶',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    duration: -1,
                    type: 'BUFF',
                    modifiers: [{
                        target: 'all_type_dmg_boost',
                        type: 'add',
                        value: 0,
                        source: '流すなら涙より汗',
                        dynamicValue: (target: any, allUnits: any[]) => {
                            const hasSpirit = allUnits.some((u: any) => u.isSummon && u.ownerId === target.id && u.hp > 0);
                            if (!hasSpirit) return 0;

                            let total = baseBoost;

                            // ステータスを確認
                            // target.stats は最終ステータス。
                            const cr = target.stats.crit_rate || 0;
                            const cd = target.stats.crit_dmg || 0;
                            if ((cr + cd) >= 0.80) {
                                total += extraBoost;
                            }
                            return total;
                        }
                    }],
                    apply: (u: any, s: any) => s,
                    remove: (u: any, s: any) => s
                });
            }
        }
    ]
};
