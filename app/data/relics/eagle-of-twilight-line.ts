import { RelicSet } from '../../types';

export const EAGLE_OF_TWILIGHT_LINE: RelicSet = {
  id: 'eagle_of_twilight_line',
  name: '昼夜の狭間を翔ける鷹',
  setBonuses: [
    {
      pieces: 2,
      description: '風属性ダメージ+10%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'wind_dmg_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが必殺技を発動した後、行動順が25%早まる。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // Action Advance 25%
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = state.units[unitIndex];
            const advanceAmount = 0.25;
            const newActionPoint = Math.min(10000, unit.actionPoint + (10000 * advanceAmount));
            const newActionValue = Math.max(0, (10000 - newActionPoint) / unit.stats.spd);

            const updatedUnit = {
              ...unit,
              actionPoint: newActionPoint,
              actionValue: newActionValue
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
