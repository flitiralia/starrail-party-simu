import { ILightConeData } from '@/app/types';

export const preysGaze: ILightConeData = {
  id: 'eyes-of-the-prey',
  name: '獲物の視線',
  description: '装備キャラの効果命中+20%、持続与ダメージ+24%。',
  descriptionTemplate: '装備キャラの効果命中+{0}%、持続与ダメージ+{1}%。',
  descriptionValues: [['20', '24'], ['25', '30'], ['30', '36'], ['35', '42'], ['40', '48']],
  path: 'Nihility',
  baseStats: {
    hp: 952,
    atk: 476,
    def: 330,
  },

  passiveEffects: [
    {
      id: 'effect_hit_rate_boost',
      name: '自信（効果命中）',
      category: 'BUFF',
      targetStat: 'effect_hit_rate',
      effectValue: [0.2, 0.25, 0.3, 0.35, 0.4]
    },
    {
      id: 'dot_dmg_boost',
      name: '自信（持続与ダメージ）',
      category: 'BUFF',
      targetStat: 'dot_dmg_boost',
      effectValue: [0.24, 0.3, 0.36, 0.42, 0.48]
    }
  ]
};
