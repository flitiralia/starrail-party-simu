import { ILightConeData } from '@/app/types';

export const endlessReminiscence: ILightConeData = {
  id: 'endless-reminiscence',
  name: '尽きぬ追憶',
  path: 'Memory',
  baseStats: {
    hp: 1058,
    atk: 529,
    def: 396,
  },
  effects: [
    {
      id: 'spd_percent_boost',
      name: '徴収 (速度)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.06, 0.075, 0.09, 0.105, 0.12],
      targetStat: 'spd_pct',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'all_dmg_boost_on_skill',
      name: '徴収 (与ダメージ増加)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.08, 0.1, 0.12, 0.14, 0.16],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
