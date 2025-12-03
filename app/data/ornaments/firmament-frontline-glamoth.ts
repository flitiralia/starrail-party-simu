import { OrnamentSet } from '../../types';

export const FIRMAMENT_FRONTLINE_GLAMOTH: OrnamentSet = {
  id: 'firmament_frontline_glamoth',
  name: '蒼穹戦線グラモス',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの攻撃力+12%。装備キャラの速度が135/160以上の時、装備キャラの与ダメージ+12%/18%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'atk_pct',
          value: 0.12,
          target: 'self'
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'all_type_dmg_boost',
          value: 0.12,
          target: 'self',
          condition: (stats) => stats.spd >= 135 && stats.spd < 160
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'all_type_dmg_boost',
          value: 0.18,
          target: 'self',
          condition: (stats) => stats.spd >= 160
        }
      ],
    },
  ],
};
