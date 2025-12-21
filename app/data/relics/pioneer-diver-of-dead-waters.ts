import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { Unit } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';

/**
 * ターゲットのデバフ数を取得
 */
function getDebuffCount(target: Unit): number {
  return target.effects.filter(e => e.category === 'DEBUFF').length;
}


export const PIONEER_DIVER_OF_DEAD_WATERS: RelicSet = {
  id: 'pioneer_diver_of_dead_waters',
  name: '死水に潜る先駆者',
  setBonuses: [
    {
      pieces: 2,
      description: 'デバフ状態の敵への与ダメージ+12%。',
      eventHandlers: [
        {
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (!event.targetId) return state;

            const target = state.registry.get(createUnitId(event.targetId));
            if (!target) return state;

            // デバフ数をチェック
            const debuffCount = getDebuffCount(target);
            if (debuffCount > 0) {
              return {
                ...state,
                damageModifiers: {
                  ...state.damageModifiers,
                  allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + 0.12
                }
              };
            }
            return state;
          }
        }
      ],
    },
    {
      pieces: 4,
      description:
        '会心率+4%。デバフが2/3つ以上ある敵に対する会心ダメージ+8%/12%。装備キャラが敵にデバフを付与した後、上記の効果は2倍になる、1ターン継続。',
      passiveEffects: [
        {
          stat: 'crit_rate',
          value: 0.04,
          target: 'self'
        },
      ],
      eventHandlers: [
        {
          events: ['ON_DEBUFF_APPLIED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // 倍化バフを付与
            const buff: IEffect = {
              id: 'pioneer-doubler',
              name: '死水に潜る先駆者・倍化',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'TURN_END_BASED',
              skipFirstTurnDecrement: true,
              duration: 1,
              apply: (t, s) => s,
              remove: (t, s) => s
            };

            return addEffect(state, sourceUnitId, buff);
          }
        },
        {
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (!event.targetId) return state;

            const target = state.registry.get(createUnitId(event.targetId));
            const source = state.registry.get(createUnitId(sourceUnitId));
            if (!target || !source) return state;

            const debuffCount = getDebuffCount(target);
            const isDoubled = source.effects.some(e => e.id === 'pioneer-doubler');
            const multiplier = isDoubled ? 2 : 1;

            // デバフ付与後、会心率と会心ダメージのボーナスが2倍になる
            // （4セット効果の会心率+4%、会心ダメージ+8%/12%のみ対象）

            // 会心ダメージブースト
            let cdBoost = 0;
            if (debuffCount >= 3) cdBoost = 0.12;
            else if (debuffCount >= 2) cdBoost = 0.08;

            cdBoost *= multiplier;

            // 会心率ブースト（倍化時のみ+4%）
            let crBoost = 0;
            if (isDoubled) crBoost = 0.04;



            return {
              ...state,
              damageModifiers: {
                ...state.damageModifiers,
                critDmg: (state.damageModifiers.critDmg || 0) + cdBoost,
                critRate: (state.damageModifiers.critRate || 0) + crBoost
              }
            };
          }
        }
      ],
    },
  ],
};
