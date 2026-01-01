import { OrnamentSet } from '../../types';

export const BROKEN_KEEL: OrnamentSet = {
  id: 'broken-keel',
  name: '折れた竜骨',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの効果抵抗+10%。装備キャラの効果抵抗が30%以上の時、味方全体の会心ダメージ+10%。',
      passiveEffects: [
        {
          stat: 'effect_res',
          value: 0.1,
          target: 'self',
        },
        {
          stat: 'crit_dmg',
          value: 0.1,
          target: 'all_allies',
          condition: (stats) => (stats.effect_res ?? 0) >= 0.3,
          evaluationTiming: 'dynamic'
        },
      ],
    },
  ],
};
