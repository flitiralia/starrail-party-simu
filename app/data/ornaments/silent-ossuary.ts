import { OrnamentSet } from '../../types';

export const SILENT_OSSUARY: OrnamentSet = {
  id: 'silent_ossuary',
  name: '静謐な拾骨地',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの最大HP+12%。装備キャラの最大HPが5,000以上の時、装備キャラおよびその記憶の精霊の会心ダメージ+28%。',
      passiveEffects: [
        {
          stat: 'hp_pct',
          value: 0.12,
          target: 'self'
        },
        {
          stat: 'crit_dmg',
          value: 0.28,
          target: 'self',
          condition: (stats) => stats.hp >= 5000,
          evaluationTiming: 'dynamic'
        }
      ],
    },
  ],
};
