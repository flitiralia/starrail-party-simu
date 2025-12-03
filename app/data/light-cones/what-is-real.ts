import { ILightConeData } from '@/app/types';

export const whatIsReal: ILightConeData = {
  id: 'what-is-real',
  name: '何が真か',
  path: 'Abundance',
  baseStats: {
    hp: 1058,
    atk: 423,
    def: 330,
  },
  effects: [
    {
      id: 'break_effect_boost',
      name: '仮説 (撃破特効)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.24, 0.3, 0.36, 0.42, 0.48],
      targetStat: 'break_effect',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'heal_on_basic_hp_percent',
      name: '仮説 (通常攻撃回復)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.02, 0.025, 0.03, 0.035, 0.04],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    // Flat 800 HP heal is handled separately as it's constant regardless of SI
  ],
};
