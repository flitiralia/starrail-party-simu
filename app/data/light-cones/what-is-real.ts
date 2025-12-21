import { ILightConeData } from '../../types';
import { applyHealing } from '../../simulator/engine/utils';

export const whatIsReal: ILightConeData = {
  id: 'what-is-real',
  name: '何が真か',
  description: '装備キャラの撃破特効+24%。通常攻撃を行った後、装備キャラのHPを最大HP2.0%+800回復する。',
  descriptionTemplate: '装備キャラの撃破特効+{0}%。通常攻撃を行った後、装備キャラのHPを最大HP{1}%+800回復する。',
  descriptionValues: [
    ['24', '2.0'],
    ['30', '2.5'],
    ['36', '3.0'],
    ['42', '3.5'],
    ['48', '4.0']
  ],
  path: 'Abundance',
  baseStats: {
    hp: 1058,
    atk: 423,
    def: 330,
  },

  passiveEffects: [
    {
      id: 'what-is-real-be',
      name: '仮説（撃破特効）',
      category: 'BUFF',
      targetStat: 'break_effect',
      effectValue: [0.24, 0.30, 0.36, 0.42, 0.48]
    }
  ],

  eventHandlers: [
    {
      id: 'what-is-real-heal',
      name: '仮説（回復）',
      events: ['ON_BASIC_ATTACK'],
      handler: (event, state, unit, superimposition) => {
        if (event.sourceId !== unit.id) return state;

        const healPct = [0.02, 0.025, 0.03, 0.035, 0.04][superimposition - 1];

        return applyHealing(state, unit.id, unit.id, {
          scaling: 'hp',
          multiplier: healPct,
          flat: 800
        }, '何が真か');
      }
    }
  ]
};
