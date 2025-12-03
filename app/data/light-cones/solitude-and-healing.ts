import { ILightConeData } from '@/app/types';

export const solitudeAndHealing: ILightConeData = {
  id: 'solitude-and-healing',
  name: '孤独の癒し',
  path: 'Nihility',
  baseStats: {
    hp: 1058,
    atk: 529,
    def: 396,
  },
  effects: [
    {
      id: 'break_effect_boost',
      name: '混沌の霊薬 (撃破特効)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.2, 0.25, 0.3, 0.35, 0.4],
      targetStat: 'break_effect',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'dot_dmg_on_ultimate',
      name: '混沌の霊薬 (持続与ダメージ)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.24, 0.3, 0.36, 0.42, 0.48],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'ep_regen_on_dot_kill',
      name: '混沌の霊薬 (EP回復)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [4, 4.5, 5, 5.5, 6],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
