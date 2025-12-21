import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

export const cruisingInTheStellarSea: ILightConeData = {
  id: 'cruising-in-the-stellar-sea',
  name: '星海巡航',
  description: '装備キャラの会心率+8%。装備キャラがHPが50%以下の敵を攻撃するとき、会心率+8%。装備キャラが敵を倒すと、攻撃力+20%、2ターン継続。',
  descriptionTemplate: '装備キャラの会心率+{0}%。装備キャラがHPが50%以下の敵を攻撃するとき、会心率+{1}%。装備キャラが敵を倒すと、攻撃力+{2}%、2ターン継続。',
  descriptionValues: [
    ['8', '8', '20'],
    ['10', '10', '25'],
    ['12', '12', '30'],
    ['14', '14', '35'],
    ['16', '16', '40']
  ],
  path: 'The Hunt',
  baseStats: {
    hp: 952,
    atk: 529,
    def: 330,
  },

  passiveEffects: [
    {
      id: 'crit_rate_boost',
      name: '猟逐（会心率）',
      category: 'BUFF',
      targetStat: 'crit_rate',
      effectValue: [0.08, 0.1, 0.12, 0.14, 0.16]
    }
    // NOTE: HP50%以下の敵への会心率+8%は動的評価が必要なため、
    // ダメージ計算時に実装する必要がある（ここでは省略）
  ],

  eventHandlers: [
    {
      id: 'crit_rate_low_hp_enemy',
      name: '猟逐（HP50%以下会心率）',
      events: ['ON_BEFORE_DAMAGE_CALCULATION'],
      handler: (event, state, unit, superimposition) => {
        // 攻撃者が自分かチェック
        if (event.sourceId !== unit.id) return state;
        if (!('targetId' in event) || !event.targetId) return state;

        // ターゲットを取得
        const target = state.registry.get(createUnitId(event.targetId));
        if (!target || target.hp <= 0) return state;

        // HP50%以下かチェック
        const hpPercent = target.hp / target.stats.hp;
        if (hpPercent > 0.5) return state;

        // 会心率をdamageModifiersで一時的にブースト（ダメージ計算時のみ適用）
        const critRateBoost = [0.08, 0.1, 0.12, 0.14, 0.16][superimposition - 1];

        return {
          ...state,
          damageModifiers: {
            ...state.damageModifiers,
            critRate: (state.damageModifiers.critRate || 0) + critRateBoost
          }
        };
      }
    },
    {
      id: 'atk_boost_on_kill',
      name: '猟逐（攻撃力バフ）',
      events: ['ON_ENEMY_DEFEATED'],
      handler: (event, state, unit, superimposition) => {
        if (event.sourceId !== unit.id) return state;

        const atkBoostValue = [0.2, 0.25, 0.3, 0.35, 0.4][superimposition - 1];

        return addEffect(state, unit.id, {
          id: `cruising_atk_boost_${unit.id}`,
          name: '星海巡航（攻撃力バフ）',
          category: 'BUFF',
          sourceUnitId: unit.id,
          durationType: 'TURN_END_BASED',
          skipFirstTurnDecrement: true,
          duration: 2,
          modifiers: [
            {
              target: 'atk_pct',
              source: '星海巡航',
              type: 'add',
              value: atkBoostValue
            }
          ],
          apply: (u, s) => s,
          remove: (u, s) => s
        });
      }
    }
  ]
};
