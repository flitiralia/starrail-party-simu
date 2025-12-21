import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

export const trendOfTheUniversalMarket: ILightConeData = {
    id: 'trend-of-the-universal-market',
    name: '星間市場のトレンド',
    description: '装備キャラの防御力+16%。装備キャラが攻撃を受けた後、100%の基礎確率で攻撃した敵を燃焼状態にする。燃焼状態の敵はターンが回ってくるたびに、装備キャラの防御力40%分の炎属性持続ダメージを受ける、2ターン継続。',
    descriptionTemplate: '装備キャラの防御力+{0}%。装備キャラが攻撃を受けた後、{1}%の基礎確率で攻撃した敵を燃焼状態にする。燃焼状態の敵はターンが回ってくるたびに、装備キャラの防御力{2}%分の炎属性持続ダメージを受ける、2ターン継続。',
    descriptionValues: [
        ['16', '100', '40'],
        ['20', '105', '50'], // スケーリングの推定はおそらく100-120の範囲。
        // 標準的な★4は通常: 100/105/110/115/120 または 100/100/100...
        // 公式: 100/105/110/115/120。防御力ダメ: 40/50/60/70/80。
        ['24', '110', '60'],
        ['28', '115', '70'],
        ['32', '120', '80']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 1058,
        atk: 370,
        def: 396,
    },

    passiveEffects: [
        {
            id: 'trend-def',
            name: '新・商機（防御力）',
            category: 'BUFF',
            targetStat: 'def_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],

    eventHandlers: [
        {
            id: 'trend-burn',
            name: '新・商機（燃焼付与）',
            events: ['ON_ATTACK'], // 攻撃を受けた時
            handler: (event, state, unit, superimposition) => {
                if (!('targetId' in event)) return state;
                if (event.targetId !== unit.id) return state; // 装備者が攻撃を受けた場合のみ。通常は「攻撃がターゲットにヒットした時」のロジック

                if (!event.sourceId) return state;
                const attacker = state.registry.get(createUnitId(event.sourceId));
                if (!attacker) return state;

                const baseChance = [1.0, 1.05, 1.10, 1.15, 1.20][superimposition - 1];
                const dotScaling = [0.40, 0.50, 0.60, 0.70, 0.80][superimposition - 1];

                // 命中確率計算
                const ehr = unit.stats.effect_hit_rate || 0;
                const res = attacker.stats.effect_res || 0;
                const burnRes = attacker.stats.burn_res || 0;
                const realChance = baseChance * (1 + ehr) * (1 - res) * (1 - burnRes);

                if (Math.random() < realChance) {
                    return addEffect(state, attacker.id, {
                        id: `trend-burn-${unit.id}-${attacker.id}-${Date.now()}`,
                        name: '燃焼（星間市場）',
                        category: 'DEBUFF',
                        type: 'Burn',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 2,
                        damageCalculation: {
                            scaling: 'def',
                            multiplier: dotScaling,
                            type: 'DOT',
                            element: 'Fire'
                        },
                        modifiers: [],
                        apply: (u: import('../../simulator/engine/types').Unit, s: import('../../simulator/engine/types').GameState) => s,
                        remove: (u: import('../../simulator/engine/types').Unit, s: import('../../simulator/engine/types').GameState) => s
                    } as any);
                }

                return state;
            }
        }
    ]
};
