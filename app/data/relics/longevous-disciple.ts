import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';

export const LONGEVOUS_DISCIPLE: RelicSet = {
  id: 'longevous-disciple',
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
          events: ['ON_BEFORE_HIT', 'ON_HP_CONSUMED'],
          handler: (event, state, sourceUnitId) => {
            let shouldTrigger = false;

            // 攻撃を受ける時
            if (event.type === 'ON_BEFORE_HIT') {
              // 条件: 被弾者が装備者で、攻撃者が敵
              if (event.targetId === sourceUnitId) {
                const attacker = state.registry.get(createUnitId(event.sourceId));
                if (attacker?.isEnemy) {
                  shouldTrigger = true;
                }
              }
            }
            // HP消費時（自身または味方による）
            else if (event.type === 'ON_HP_CONSUMED') {
              // 条件: HP消費者が装備者
              if (event.targetId === sourceUnitId) {
                // 味方による消費か？ (敵によるドットやダメージはここに来ないはずだが念のため)
                // ON_HP_CONSUMEDは基本的に味方/自身起因だが、sourceIdを確認
                const consumer = state.registry.get(createUnitId(event.sourceId));
                if (consumer && !consumer.isEnemy) {
                  shouldTrigger = true;
                }
              }
            }

            if (!shouldTrigger) return state;

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
