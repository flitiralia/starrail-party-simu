import { ILightConeData } from '@/app/types';

export const somethingIrreplaceable: ILightConeData = {
  id: 'something-irreplaceable',
  name: '忍事録・音律狩猟',
  path: 'Destruction',
  baseStats: {
    hp: 1058,
    atk: 476,
    def: 264,
  },
  effects: [
    {
      id: 'max_hp_percent_boost',
      name: '開演 (最大HP)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.12, 0.15, 0.18, 0.21, 0.24],
      targetStat: 'hp_pct',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'crit_dmg_on_hp_change',
      name: '開演 (会心ダメージ)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.18, 0.22, 0.27, 0.31, 0.36],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
