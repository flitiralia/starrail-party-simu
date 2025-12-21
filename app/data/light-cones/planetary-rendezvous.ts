import { ILightConeData } from '@/app/types';
import { createUnitId } from '../../simulator/engine/unitId';

export const planetaryRendezvous: ILightConeData = {
  id: 'planetary-rendezvous',
  name: '惑星との出会い',
  description: '戦闘に入った後、味方が装備キャラと同じ属性のダメージを与えた時、与ダメージ+12%。',
  descriptionTemplate: '戦闘に入った後、味方が装備キャラと同じ属性のダメージを与えた時、与ダメージ+{0}%。',
  descriptionValues: [['12'], ['15'], ['18'], ['21'], ['24']],
  path: 'Harmony',
  baseStats: {
    hp: 1058,
    atk: 423,
    def: 330,
  },

  passiveEffects: [],

  eventHandlers: [
    {
      id: 'dmg_boost_same_element',
      name: '惑星との出会い（与ダメージ増加）',
      events: ['ON_BEFORE_DAMAGE_CALCULATION'],
      handler: (event, state, unit, superimposition) => {
        // 攻撃者を取得
        const attacker = state.registry.get(createUnitId(event.sourceId));
        if (!attacker) return state;

        // 味方キャラかチェック
        if (attacker.isEnemy) return state;

        // 攻撃の属性を取得
        if (!('element' in event)) return state;
        const attackElement = event.element;
        if (!attackElement) return state;

        // 属性一致判定（攻撃の属性 === 光円錐装備者の属性）
        if (attackElement !== unit.element) return state;

        // 与ダメージ増加値をdamageModifiersで一時的に適用（ダメージ計算時のみ）
        const dmgBoost = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

        return {
          ...state,
          damageModifiers: {
            ...state.damageModifiers,
            allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + dmgBoost
          }
        };
      }
    }
  ]
};
