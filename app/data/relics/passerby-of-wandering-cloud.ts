import { RelicSet } from '../../types';

export const PASSERBY_OF_WANDERING_CLOUD: RelicSet = {
  id: 'passerby_of_wandering_cloud',
  name: '流雲無痕の過客',
  setBonuses: [
    {
      pieces: 2,
      description: '治癒量+10%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'outgoing_healing_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '戦闘開始時、SPを1回復する。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_BATTLE_START'],
          handler: (event, state, sourceUnitId) => {
            // Ensure only one unit triggers this per team
            const unitsWithSet = state.units.filter(u =>
              u.relics?.some(r => r.set?.id === 'passerby_of_wandering_cloud') &&
              (u.relics?.filter(r => r.set?.id === 'passerby_of_wandering_cloud').length || 0) >= 4
            );

            // Sort by ID to be deterministic (so only the first one triggers)
            unitsWithSet.sort((a, b) => a.id.localeCompare(b.id));

            if (unitsWithSet.length > 0 && unitsWithSet[0].id === sourceUnitId) {
              return {
                ...state,
                skillPoints: Math.min(state.skillPoints + 1, state.maxSkillPoints)
              };
            }

            return state;
          }
        }
      ],
    },
  ],
};
