import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

export const LONGEVOUS_DISCIPLE: RelicSet = {
  id: 'longevous_disciple',
  name: '宝命長存の蒔者',
  setBonuses: [
    {
      pieces: 2,
      description: '最大HP+12%。',
      passiveEffects: [
        {
          stat: 'hp_pct',
          value: 0.12,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが攻撃を受ける、または味方によってHPを消費させられた時、会心率+8%、2ターン継続。最大2層累積できる。',
      eventHandlers: [
        {
          events: ['ON_DAMAGE_DEALT'],
          handler: (event, state, sourceUnitId) => {
            // 条件1: 被弾者が装備者であること
            if (event.targetId !== sourceUnitId) return state;

            // 条件2: 攻撃者が敵であること
            const attacker = state.units.find(u => u.id === event.sourceId);
            if (!attacker?.isEnemy) return state;

            // バフエフェクトを付与（addEffectが自動的にスタック管理）
            const effect: IEffect = {
              id: 'longevous-4pc-crit',
              name: '宝命長存の蒔者',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'TURN_END_BASED',
              skipFirstTurnDecrement: true,
              duration: 2,
              stackCount: 1,
              maxStacks: 2,
              modifiers: [
                {
                  target: 'crit_rate',
                  source: '宝命長存の蒔者',
                  type: 'add',
                  value: 0.08
                }
              ],
              apply: (t, s) => s,
              remove: (t, s) => s
            };

            return addEffect(state, sourceUnitId, effect);
          }
        }
      ],
    },
  ],
};
