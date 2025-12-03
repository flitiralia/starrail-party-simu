import { RelicSet } from '../../types';

export const THIEF_OF_SHOOTING_METEOR: RelicSet = {
  id: 'thief_of_shooting_meteor',
  name: '流星の跡を追う怪盗',
  setBonuses: [
    {
      pieces: 2,
      description: '撃破特効+16%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'break_effect',
          value: 0.16,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラの撃破特効+16%。装備キャラが敵を弱点撃破した後、EPを3回復する。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'break_effect',
          value: 0.16,
          target: 'self'
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_WEAKNESS_BREAK'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // Recover 3 EP
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = state.units[unitIndex];
            const newEp = Math.min(unit.stats.max_ep, unit.ep + 3);

            const updatedUnit = {
              ...unit,
              ep: newEp
            };

            return {
              ...state,
              units: state.units.map((u, i) => i === unitIndex ? updatedUnit : u)
            };
          }
        }
      ],
    },
  ],
};
