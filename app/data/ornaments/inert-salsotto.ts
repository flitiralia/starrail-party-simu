import { OrnamentSet } from '../../types';

export const INERT_SALSOTTO: OrnamentSet = {
  id: 'inert_salsotto',
  name: '自転が止まったサルソット',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの会心率+8%。装備キャラの会心率が50%以上の場合、必殺技と追加攻撃の与ダメージ+15%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'crit_rate',
          value: 0.08,
          target: 'self'
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'ult_dmg_boost',
          value: 0.15,
          target: 'self',
          condition: (stats) => stats.crit_rate >= 0.5
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'fua_dmg_boost',
          value: 0.15,
          target: 'self',
          condition: (stats) => stats.crit_rate >= 0.5
        }
      ],
    },
  ],
};
