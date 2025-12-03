import { ILightConeData } from '@/app/types';

export const preysGaze: ILightConeData = {
  id: 'preys-gaze',
  name: '獲物の視線',
  path: 'Nihility',
  baseStats: {
    hp: 952,
    atk: 476,
    def: 330,
  },
  effects: [
    {
      id: 'effect_hit_rate_boost',
      name: '自信 (効果命中)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.2, 0.25, 0.3, 0.35, 0.4],
      targetStat: 'effect_hit_rate',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'dot_dmg_increase',
      name: '自信 (持続与ダメージ)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.24, 0.3, 0.36, 0.42, 0.48],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
