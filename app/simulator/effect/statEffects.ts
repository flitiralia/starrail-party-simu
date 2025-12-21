import { GameState, Unit } from '../engine/types';
import { IStatEffect } from './types';

import { createUnitId } from '../engine/unitId';

/**
 * Creates a basic stat buff/debuff effect that can be applied to a unit.
 * This is a factory function to simplify the creation of stat effects.
 *
 * @param id - A unique identifier for the effect instance.
 * @param name - The display name of the effect.
 * @param sourceUnitId - The ID of the unit that applied the effect.
 * @param stat - The StatKey to be modified.
 * @param value - The value to add (can be negative for debuffs).
 * @param isPercentage - Whether the value is a percentage or a flat amount.
 * @param duration - The duration of the effect in turns.
 * @returns An IStatEffect object.
 */
export function createStatEffect({
  id,
  name,
  sourceUnitId,
  stat,
  value,
  isPercentage,
  duration,
}: Omit<IStatEffect, 'category' | 'durationType' | 'apply' | 'remove'>): IStatEffect {
  return {
    id,
    name,
    sourceUnitId,
    stat,
    value,
    isPercentage,
    duration,
    category: value > 0 ? 'BUFF' : 'DEBUFF',
    durationType: duration === Infinity ? 'PERMANENT' : 'TURN_END_BASED', // Explicitly use TURN_END_BASED for buffs

    apply(target: Unit, state: GameState): GameState {
      // The actual stat modification will be handled by a central system
      // that reads from a unit's `effects` array.
      // This method simply adds the effect to the target.
      const newTarget = {
        ...target,
        effects: [...target.effects, this],
      };
      return {
        ...state,
        registry: state.registry.update(createUnitId(newTarget.id), u => newTarget)
      };
    },

    remove(target: Unit, state: GameState): GameState {
      // This method removes the effect from the target.
      const newTarget = {
        ...target,
        effects: target.effects.filter(effect => effect.id !== this.id),
      };
      return {
        ...state,
        registry: state.registry.update(createUnitId(newTarget.id), u => newTarget)
      };
    },
  };
}
