import { RelicSet } from '../../types';

export const WATCHMAKER_MASTER_OF_DREAM_MACHINATIONS: RelicSet = {
  id: 'watchmaker_master_of_dream_machinations',
  name: '夢を弄ぶ時計屋',
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
      description:
        '装備キャラが味方に対して必殺技を発動した時、味方全体の撃破特効+30%、2ターン継続。この効果は累積できない。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // Check if Ultimate targets allies
            const sourceUnit = state.units.find(u => u.id === sourceUnitId);
            if (!sourceUnit) return state;

            const ult = sourceUnit.abilities.ultimate;
            if (!ult) return state;

            // Check target type
            const isAllyTarget = ult.targetType === 'ally' || ult.targetType === 'all_allies';
            if (!isAllyTarget) return state;

            // Apply buff to all allies
            const buffId = 'watchmaker-4pc-be';
            const allies = state.units.filter(u => !u.isEnemy);

            let newState = state;
            allies.forEach(ally => {
              const buff = {
                id: buffId, // Fixed ID to prevent stacking
                name: 'Watchmaker BE Buff',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_BASED', // 2 turns
                duration: 2,
                targetStat: 'break_effect',
                effectValue: 0.3,
                apply: (u: any, s: any) => s, // Handled by passive update
                remove: (u: any, s: any) => s
              };

              // Add or Refresh buff
              // Since it's a "modifier" in the new system (via updatePassiveBuffs), we usually add it as an effect to the unit?
              // Wait, updatePassiveBuffs handles Relic PASSIVE_STAT.
              // This is a temporary buff applied by an event. It should be added to unit.effects or unit.modifiers.
              // Since it has a duration, it should be in unit.effects (or similar list that is processed).
              // But my current engine separates "Modifiers" (calculated stats) from "Effects" (status effects).
              // I should add it to `unit.effects` if I have a system to convert Effects to Modifiers.
              // `recalculateUnitStats` (step 5) processes `unit.effects` if they implement `IStatEffect`.

              // Let's create an IStatEffect
              const statEffect = {
                ...buff,
                stat: 'break_effect',
                value: 0.3,
                isPercentage: true // Break Effect is percentage
              };

              // Add to ally effects
              // Check if already exists to refresh duration
              const existingIdx = ally.effects.findIndex(e => e.id === buffId);
              let newEffects = [...ally.effects];
              if (existingIdx !== -1) {
                newEffects[existingIdx] = { ...newEffects[existingIdx], duration: 2 };
              } else {
                newEffects.push(statEffect as any);
              }

              const updatedAlly = { ...ally, effects: newEffects };
              newState = {
                ...newState,
                units: newState.units.map(u => u.id === ally.id ? updatedAlly : u)
              };
            });

            return newState;
          }
        }
      ],
    },
  ],
};
