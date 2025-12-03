import { ILightConeData } from '@/app/types';

export const weAreTheWildfire: ILightConeData = {
  id: 'we-are-the-wildfire',
  name: '我ら地炎',
  path: 'Preservation',
  baseStats: {
    hp: 740,
    atk: 476,
    def: 463,
  },
  effects: [
    {
      id: 'dmg_reduction_on_start',
      name: '袖時雨 (被ダメージ減少)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.08, 0.1, 0.12, 0.14, 0.16],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'heal_on_start_lost_hp',
      name: '袖時雨 (HP回復)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.3, 0.35, 0.4, 0.45, 0.5],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
