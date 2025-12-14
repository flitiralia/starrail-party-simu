import { RelicSet } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

export const THE_ASHBLAZING_GRAND_DUKE: RelicSet = {
  id: 'the_ashblazing_grand_duke',
  name: '灰燼を燃やし尽くす大公',
  setBonuses: [
    {
      pieces: 2,
      description: '追加攻撃の与ダメージ+20%。',
      passiveEffects: [
        {
          stat: 'fua_dmg_boost',
          value: 0.2,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが追加攻撃を行った時、追加攻撃のヒット数に応じて、ダメージを与えるたびに装備者の攻撃力+6%、最大8回まで累積でき、3ターン継続。この効果は、装備キャラが次の追加攻撃を行った時に解除される。',
      eventHandlers: [
        {
          events: ['ON_FOLLOW_UP_ATTACK'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // 追加攻撃開始時にスタックをリセット
            return removeEffect(state, sourceUnitId, 'grand-duke-stack');
          }
        },
        {
          events: ['ON_DAMAGE_DEALT'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (event.subType !== 'FOLLOW_UP_ATTACK') return state;

            // 追加攻撃のヒットごとにスタック追加
            const buff: IEffect = {
              id: 'grand-duke-stack',
              name: '灰燼を燃やし尽くす大公',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'TURN_END_BASED',
              skipFirstTurnDecrement: true,
              duration: 3,
              stackCount: 1,
              maxStacks: 8,
              modifiers: [
                {
                  target: 'atk_pct',
                  source: '灰燼を燃やし尽くす大公',
                  type: 'add',
                  value: 0.06
                }
              ],
              apply: (t, s) => s,
              remove: (t, s) => s
            };

            return addEffect(state, sourceUnitId, buff);
          }
        }
      ],
    },
  ],
};
