import { RelicSet } from '../../types';

export const PRISONER_IN_DEEP_CONFINEMENT: RelicSet = {
  id: 'prisoner_in_deep_confinement',
  name: '深い牢獄の囚人',
  setBonuses: [
    {
      pieces: 2,
      description: '攻撃力+12%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'atk_pct',
          value: 0.12,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '敵に付与された持続ダメージ系デバフが1つにつき、装備キャラがその敵にダメージを与える時に防御力を6%無視する。持続ダメージ系デバフは最大で3つまでカウントされる。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (!event.targetId) return state;

            const target = state.units.find(u => u.id === event.targetId);
            if (!target) return state;

            // Count DoTs
            // Assuming DoTs have category 'DEBUFF' and type/name indicating DoT
            // Common DoTs: Burn, Shock, Bleed, Wind Shear
            const dotTypes = ['Burn', 'Shock', 'Bleed', 'Wind Shear'];
            const dotCount = target.effects.filter(e =>
              e.category === 'DEBUFF' &&
              (dotTypes.includes((e as any).statusType) || dotTypes.some(dt => e.name.includes(dt)))
            ).length;

            const stacks = Math.min(3, dotCount);
            if (stacks > 0) {
              const defIgnore = 0.06 * stacks;
              return {
                ...state,
                damageModifiers: {
                  ...state.damageModifiers,
                  defIgnore: (state.damageModifiers.defIgnore || 0) + defIgnore
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
