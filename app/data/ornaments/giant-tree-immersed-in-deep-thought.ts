import { OrnamentSet } from '../../types';

export const GIANT_TREE_IMMERSED_IN_DEEP_THOUGHT: OrnamentSet = {
  id: 'giant_tree_immersed_in_deep_thought',
  name: '深慮に浸る巨樹',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの速度+6%。装備キャラの速度が135/180以上の時、装備キャラ及びその記憶の精霊の治癒量+12%/20%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'spd_pct',
          value: 0.06,
          target: 'self'
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'outgoing_healing_boost',
          value: 0.12,
          target: 'self',
          condition: (stats) => stats.spd >= 135 && stats.spd < 180
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'outgoing_healing_boost',
          value: 0.20,
          target: 'self',
          condition: (stats) => stats.spd >= 180
        }
      ],
    },
  ],
};
