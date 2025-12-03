import { RelicSet } from '../../types';

export const HERMIT_WHO_HID_THE_LIGHT_OF_THE_STARS: RelicSet = {
  id: 'hermit_who_hid_the_light_of_the_stars',
  name: '星の光を隠した隠者',
  setBonuses: [
    {
      pieces: 2,
      description: '付与するバリアの耐久値+10%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'shield_strength_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが付与するバリアの耐久値+12%。装備キャラが付与したバリアを持つ味方の会心ダメージ+15%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'shield_strength_boost',
          value: 0.12,
          target: 'self'
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: (event, state, sourceUnitId) => {
            // This handler runs for every damage event.
            // We need to check if the attacker (event.sourceId) has a shield from the wearer (sourceUnitId).

            const attacker = state.units.find(u => u.id === event.sourceId);
            if (!attacker) return state;

            // Check for shield from wearer
            // Assuming shield effects have sourceUnitId set correctly
            const hasShieldFromWearer = attacker.effects.some(e =>
              (e.category === 'BUFF' && e.name.includes('バリア')) && // Or check type/id convention
              e.sourceUnitId === sourceUnitId
            );

            if (hasShieldFromWearer) {
              return {
                ...state,
                damageModifiers: {
                  ...state.damageModifiers,
                  critDmg: (state.damageModifiers.critDmg || 0) + 0.15
                }
              };
            }

            return state;
          }
        }
      ],
    },
  ],
};
