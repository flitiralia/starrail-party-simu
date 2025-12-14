import { ILightConeData } from '@/app/types';

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
      id: 'effect_res_boost',
      name: '屈折する視線（効果抵抗）',
      category: 'BUFF',
      targetStat: 'effect_res',
      effectValue: [0.16, 0.2, 0.24, 0.28, 0.32]
    },
    {
      id: 'healing_boost_from_effect_res',
      name: '屈折する視線（治癒量）',
      category: 'BUFF',
      targetStat: 'outgoing_healing_boost',
      effectValue: [0.15, 0.18, 0.21, 0.24, 0.27], // 最大値（参考値）
      calculateValue: (stats, superimposition) => {
        // 変換率テーブル
        const conversionRates = [0.33, 0.36, 0.39, 0.42, 0.45];
        const conversionRate = conversionRates[superimposition - 1];

        // 最大値テーブル
        const maxValues = [0.15, 0.18, 0.21, 0.24, 0.27];
        const maxValue = maxValues[superimposition - 1];

        // 効果抵抗から計算（stats.effect_resには第1パスの+16%が既に適用済み）
        const effectRes = stats.effect_res || 0;
        const calculatedValue = effectRes * conversionRate;

        // 最大値でキャップ
        return Math.min(calculatedValue, maxValue);
      }
    }
  ]
};
