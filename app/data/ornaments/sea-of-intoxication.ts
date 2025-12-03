import { OrnamentSet } from '../../types';

export const SEA_OF_INTOXICATION: OrnamentSet = {
  id: 'sea_of_intoxication',
  name: '酩酊の海域',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの攻撃力+12%。装備キャラの攻撃力が2,400/3,600以上の場合、与える持続ダメージ+12%/24%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'atk_pct',
          value: 0.12,
          target: 'self'
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'dot_dmg_boost',
          value: 0.12,
          target: 'self',
          condition: (stats) => stats.atk >= 2400 && stats.atk < 3600
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'dot_dmg_boost',
          value: 0.24,
          target: 'self',
          condition: (stats) => stats.atk >= 3600
        }
      ],
    },
  ],
};
