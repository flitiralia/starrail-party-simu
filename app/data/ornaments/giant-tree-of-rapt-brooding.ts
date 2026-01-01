import { OrnamentSet } from '../../types';

export const GIANT_TREE_OF_RAPT_BROODING: OrnamentSet = {
  id: 'giant-tree-of-rapt-brooding',
  name: '深慮に浸る巨樹',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの速度+6%。装備キャラの速度が135/180以上の時、装備キャラ及びその記憶の精霊の治癒量+12%/20%。',
      passiveEffects: [
        {
          stat: 'spd_pct',
          value: 0.06,
          target: 'self'
        },
        {
          stat: 'outgoing_healing_boost',
          value: 0.12,
          target: 'self',
          condition: (stats) => stats.spd >= 135 && stats.spd < 180,
          evaluationTiming: 'dynamic'
        },
        {
          stat: 'outgoing_healing_boost',
          value: 0.20,
          target: 'self',
          condition: (stats) => stats.spd >= 180,
          evaluationTiming: 'dynamic'
        }
      ],
    },
  ],
};
