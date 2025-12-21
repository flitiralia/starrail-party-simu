import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const perfectTiming: ILightConeData = {
  id: 'perfect-timing',
  name: '今が丁度',
  description: '装備キャラの効果抵抗+16%。装備キャラの治癒量が、効果抵抗の33%分アップする、最大で15%アップできる。',
  descriptionTemplate: '装備キャラの効果抵抗+{0}%。装備キャラの治癒量が、効果抵抗の{1}%分アップする、最大で{2}%アップできる。',
  descriptionValues: [
    ['16', '33', '15'],
    ['20', '36', '18'],
    ['24', '39', '21'],
    ['28', '42', '24'],
    ['32', '45', '27']
  ],
  path: 'Abundance',
  baseStats: {
    hp: 952,
    atk: 423,
    def: 396,
  },

  passiveEffects: [
    {
      id: 'perfect-res',
      name: '屈折する視線（効果抵抗）',
      category: 'BUFF',
      targetStat: 'effect_res',
      effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
    }
  ],

  eventHandlers: [
    {
      id: 'perfect-dynamic-heal',
      name: '屈折する視線（動的治癒量）',
      events: ['ON_BATTLE_START'],
      handler: (event, state, unit, superimposition) => {
        const ratio = [0.33, 0.36, 0.39, 0.42, 0.45][superimposition - 1];
        const maxVal = [0.15, 0.18, 0.21, 0.24, 0.27][superimposition - 1];

        return addEffect(state, unit.id, {
          id: `perfect-timing-buff-${unit.id}`,
          name: '屈折する視線（治癒量）',
          category: 'BUFF',
          sourceUnitId: unit.id,
          durationType: 'PERMANENT',
          duration: -1,
          modifiers: [{
            target: 'outgoing_healing_boost',
            source: '今が丁度',
            type: 'add',
            value: 0,
            dynamicValue: (u) => {
              const res = u.stats.effect_res || 0;
              return Math.min(maxVal, res * ratio);
            }
          }],
          apply: (u, s) => s,
          remove: (u, s) => s
        });
      }
    }
  ]
};
