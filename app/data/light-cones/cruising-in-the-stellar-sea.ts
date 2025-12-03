import { ILightConeData } from '@/app/types';

export const cruisingInTheStellarSea: ILightConeData = {
  id: 'cruising-in-the-stellar-sea',
  name: '星海巡航',
  path: 'The Hunt',
  baseStats: {
    hp: 952,
    atk: 529,
    def: 463,
  },
  effects: [
    {
      id: 'crit_rate_boost',
      name: '猟逐',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.08, 0.1, 0.12, 0.14, 0.16],
      targetStat: 'crit_rate',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
