import { Unit } from './types';

/**
 * Manages the turn order of units in the simulation.
 * The timeline is based on each unit's "Action Value" (AV), where the
 * unit with the lowest AV acts next.
 */
export class Timeline {
  private units: Unit[];

  /**
   * Initializes the timeline with a set of units.
   * The initial list of units is sorted by their action value.
   * @param units The initial list of units in combat.
   */
  constructor(units: Unit[]) {
    // Clone the array to avoid mutating the original GameState array directly
    this.units = [...units].sort((a, b) => a.actionValue - b.actionValue);
  }

  /**
   * Gets the next unit to act without advancing the timeline.
   * @returns The unit with the lowest current action value.
   */
  public getNext(): Unit {
    return this.units[0];
  }

  /**
   * Advances the simulation time to the next turn.
   * It subtracts the elapsed time from all units' action values,
   * resets the action value for the unit that just acted, and re-sorts the timeline.
   * @returns The unit that is now taking its turn.
   */
  public advance(): Unit {
    const actingUnit = this.units[0];
    const elapsedTime = actingUnit.actionValue;

    // Update action values for all units
    for (const unit of this.units) {
      unit.actionValue -= elapsedTime;
    }

    // Reset the acting unit's action value for their next turn
    actingUnit.actionValue = 10000 / actingUnit.stats.spd;

    // Re-sort the timeline to determine the new turn order
    this.units.sort((a, b) => a.actionValue - b.actionValue);
    
    return actingUnit;
  }
}