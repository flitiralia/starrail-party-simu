import { OrnamentSet } from '../../types';

export const UNFORESEEN_VANADISE: OrnamentSet = {
  id: 'unforeseen_vanadise',
  name: '奇想天外のバナダイス',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの会心ダメージ+16%。装備キャラが召喚したターゲットがフィールド上にいる場合、さらに会心ダメージ+32%。',
      passiveEffects: [
        {
          stat: 'crit_dmg',
          value: 0.16,
          target: 'self'
        },
        {
          stat: 'crit_dmg',
          value: 0.32,
          target: 'self',
          condition: (stats, state, unitId) => {
            if (!state) return false;
            // 召喚ユニット（isSummon: true, ownerId: unitId）が存在するかチェック
            const hasSummon = state.units.some(u =>
              u.isSummon &&
              u.ownerId === unitId &&
              u.hp > 0
            );
            return hasSummon;
          }
        }
      ],
    },
  ],
};
