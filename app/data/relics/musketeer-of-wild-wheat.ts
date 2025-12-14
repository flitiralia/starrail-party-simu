import { RelicSet } from '../../types';

export const MUSKETEER_OF_WILD_WHEAT: RelicSet = {
  id: 'musketeer_of_wild_wheat',
  name: '草の穂ガンマン',
  setBonuses: [
    {
      pieces: 2,
      description: '攻撃力+12%。',
      passiveEffects: [
        {
          stat: 'atk_pct',
          value: 0.12,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラの速度+6%、通常攻撃の与ダメージ+10%。',
      passiveEffects: [
        {
          stat: 'spd_pct',
          value: 0.06,
          target: 'self'
        },
        {
          stat: 'basic_atk_dmg_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
  ],
};
