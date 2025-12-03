import { ILightConeData } from '@/app/types';

export const postOpConversation: ILightConeData = {
  id: 'post-op-conversation',
  name: '手術後の会話',
  path: 'Abundance',
  baseStats: {
    hp: 1058,
    atk: 423,
    def: 330,
  },
  effects: [
    {
      id: 'energy_regen_rate_boost',
      name: '相互回復 (EP回復効率)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.08, 0.1, 0.12, 0.14, 0.16],
      targetStat: 'energy_regen_rate',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'healing_boost_on_ultimate',
      name: '相互回復 (治癒量)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.12, 0.15, 0.18, 0.21, 0.24],
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
