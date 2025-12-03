import { ILightConeData } from '@/app/types';

export const theSeriousnessOfBreakfast: ILightConeData = {
  id: 'the-seriousness-of-breakfast',
  name: '絶え間ない演算',
  path: 'Erudition',
  baseStats: {
    hp: 1058,
    atk: 529,
    def: 396,
  },
  effects: [
    {
      id: 'atk_percent_boost',
      name: '境界なき思考 (攻撃力)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.08, 0.09, 0.1, 0.11, 0.12],
      targetStat: 'atk_pct',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'atk_percent_per_enemy_hit',
      name: '境界なき思考 (攻撃力/敵命中)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.04, 0.05, 0.06, 0.07, 0.08],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'spd_percent_on_3_enemies',
      name: '境界なき思考 (速度)',
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
