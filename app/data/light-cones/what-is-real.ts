import { ILightConeData } from '@/app/types';

export const whatIsReal: ILightConeData = {
  id: 'what-is-real',
  name: '何が真か',
  description: '装備キャラの撃破特効+24%。通常攻撃を行った後、装備キャラのHPを最大HP2.0%+800回復する。',
  descriptionTemplate: '装備キャラの撃破特効+{0}%。通常攻撃を行った後、装備キャラのHPを最大HP{1}%+{2}回復する。',
  descriptionValues: [
    ['24', '2.0', '800'],
    ['30', '2.5', '900'],
    ['36', '3.0', '1000'],
    ['42', '3.5', '1100'],
    ['48', '4.0', '1200']
  ],
  path: 'Abundance',
  baseStats: {
    hp: 1058,
    atk: 423,
    def: 330,
  },

  passiveEffects: [
    {
      id: 'break_effect_boost',
      name: '仮説（撃破特効）',
      category: 'BUFF',
      targetStat: 'break_effect',
      effectValue: [0.24, 0.3, 0.36, 0.42, 0.48]
    }
  ],

  eventHandlers: [
    {
      id: 'heal_on_basic',
      name: '仮説（HP回復）',
      events: ['ON_BASIC_ATTACK'],
      handler: (event, state, unit, superimposition) => {
        if (event.sourceId !== unit.id) return state;

        const hpPercent = [0.02, 0.025, 0.03, 0.035, 0.04][superimposition - 1];
        const flatHeal = [800, 900, 1000, 1100, 1200][superimposition - 1];

        // HP回復
        const unitIndex = state.units.findIndex(u => u.id === unit.id);
        if (unitIndex === -1) return state;

        const currentUnit = state.units[unitIndex];
        const healAmount = currentUnit.stats.hp * hpPercent + flatHeal;
        const newHp = Math.min(currentUnit.stats.hp, currentUnit.hp + healAmount);

        const newUnits = [...state.units];
        newUnits[unitIndex] = { ...currentUnit, hp: newHp };

        return {
          ...state,
          units: newUnits,
          log: [...state.log, {
            actionType: '回復',
            sourceId: unit.id,
            characterName: unit.name,
            targetId: unit.id,
            details: `何が真か発動: HP +${Math.floor(healAmount)}`
          }]
        };
      }
    }
  ]
};
