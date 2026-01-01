import { OrnamentSet } from '../../types';

export const FLEET_OF_THE_AGELESS: OrnamentSet = {
  id: 'fleet-of-the-ageless',
  name: '老いぬ者の仙舟',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの最大HP+12%。装備キャラの速度が120以上の場合、味方全体の攻撃力+8%',
      passiveEffects: [
        {
          stat: 'hp_pct',
          value: 0.12,
          target: 'self'
        },
        {
          stat: 'atk_pct',
          value: 0.08,
          target: 'all_allies',
          condition: (stats) => stats.spd >= 120,
          evaluationTiming: 'dynamic'
        }
      ],
    },
  ],
};
