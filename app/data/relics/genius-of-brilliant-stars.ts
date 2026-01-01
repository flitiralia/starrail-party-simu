import { RelicSet } from '../../types';
import { createDefIgnoreHandler, createWeaknessCondition } from '../../simulator/effect/relicEffectHelpers';

export const GENIUS_OF_BRILLIANT_STARS: RelicSet = {
  id: 'genius-of-brilliant-stars',
  name: '星の如く輝く天才',
  setBonuses: [
    {
      pieces: 2,
      description: '量子属性ダメージ+10%。',
      passiveEffects: [
        {
          stat: 'quantum_dmg_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが敵にダメージを与えた時、敵の防御力を10%無視する。敵が量子属性弱点を持っている場合、さらに防御力を10%無視する。',
      eventHandlers: [
        {
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: createDefIgnoreHandler(
            0.1,  // 基本10%防御無視
            createWeaknessCondition('Quantum', 0.1)  // 量子弱点時+10%（合計20%）
          )
        }
      ],
    },
  ],
};
