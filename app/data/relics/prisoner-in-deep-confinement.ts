import { RelicSet } from '../../types';
import { createDefIgnoreHandler, createDotCountCondition } from '../../simulator/effect/relicEffectHelpers';

export const PRISONER_IN_DEEP_CONFINEMENT: RelicSet = {
  id: 'prisoner-in-deep-confinement',
  name: '深い牢獄の囚人',
  setBonuses: [
    {
      pieces: 2,
      description: '攻撃力+12%。',
      passiveEffects: [
        {
          stat: 'atk_pct',
          value: 0.12,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '敵に付与された持続ダメージ系デバフが1つにつき、装備キャラがその敵にダメージを与える時に防御力を6%無視する。持続ダメージ系デバフは最大で3つまでカウントされる。',
      eventHandlers: [
        {
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: createDefIgnoreHandler(
            0,  // 基本なし
            createDotCountCondition(0.06, 3)  // DoT1つにつき6%、最大3個（合計最大18%）
          )
        }
      ],
    },
  ],
};
