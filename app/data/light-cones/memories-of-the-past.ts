import { ILightConeData } from '@/app/types';

export const memoriesOfThePast: ILightConeData = {
  id: 'memories-of-the-past',
  name: '記憶の中の姿',
  path: 'Harmony',
  baseStats: {
    hp: 952,
    atk: 423,
    def: 396,
  },
  effects: [
    {
      id: 'break_effect_boost',
      name: '古い写真 (撃破特効)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.28, 0.35, 0.42, 0.49, 0.56],
      targetStat: 'break_effect',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'ep_regen_on_attack',
      name: '古い写真 (EP回復)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [4, 5, 6, 7, 8],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
