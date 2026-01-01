import { RelicSet } from '../../types';

/**
 * 純庭教会の聖騎士
 * 2セット: 防御力+15%
 * 4セット: 装備キャラが付与するバリアの耐久値+20%
 */
export const KNIGHT_OF_PURITY_PALACE: RelicSet = {
  id: 'knight-of-purity-palace',
  name: '純庭教会の聖騎士',
  setBonuses: [
    {
      pieces: 2,
      description: '防御力+15%。',
      passiveEffects: [
        {
          stat: 'def_pct',
          value: 0.15,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが付与するバリアの耐久値+20%。',
      passiveEffects: [
        {
          stat: 'shield_strength_boost',
          value: 0.2,
          target: 'self'
        }
      ],
    },
  ],
};
