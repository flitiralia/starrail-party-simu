import { GameState } from './types';

/**
 * Adds (or removes) Skill Points to the game state.
 * Respects min (0) and max (default 5, configurable in state) limits.
 * 
 * @param state Current GameState
 * @param amount Amount to add (can be negative)
 * @returns { state: GameState, added: number }
 */
export function addSkillPoints(state: GameState, amount: number): { state: GameState, added: number } {
    const minSP = 0;
    const maxSP = state.maxSkillPoints || 5;

    // Ensure we don't exceed limits
    const current = state.skillPoints;
    const next = Math.max(minSP, Math.min(maxSP, current + amount));
    const actualAdded = next - current;

    const newState = {
        ...state,
        skillPoints: next
    };

    // Optionally fire ON_SP_CHANGE event if needed here
    // But usually events are fired by the dispatcher or higher level logic
    // For now, simple state update.

    return {
        state: newState,
        added: actualAdded
    };
}
