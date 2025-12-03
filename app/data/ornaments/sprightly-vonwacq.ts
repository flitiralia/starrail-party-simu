import { OrnamentSet } from '../../types';

export const SPRIGHTLY_VONWACQ: OrnamentSet = {
  id: 'sprightly_vonwacq',
  name: '生命のウェンワーク',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラのEP回復効率+5%。装備キャラの速度が120以上の場合、戦闘に入る時、行動順が40%早まる。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'energy_regen_rate',
          value: 0.05,
          target: 'self'
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_BATTLE_START'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state; // Should be 'system' usually, but let's check unit stats

            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = state.units[unitIndex];

            // Check condition: SPD >= 120
            if (unit.stats.spd < 120) return state;

            // Action Advance 40%
            const advanceAmount = 0.40;
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
