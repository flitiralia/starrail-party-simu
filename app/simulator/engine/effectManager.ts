import { GameState, Unit, IEventHandler } from './types';
import { adjustActionValueForSpeedChange } from './actionValue';
import { IEffect } from '../effect/types';
import { recalculateUnitStats } from '../statBuilder';

export function addEffect(state: GameState, targetId: string, effect: IEffect): GameState {
    const targetIndex = state.units.findIndex(u => u.id === targetId);
    if (targetIndex === -1) return state;

    let newState = { ...state };

    // 0. Check for duplicates (Same ID AND Same Source)
    // If found, remove the old effect first (Overwrite behavior)
    const existingUnit = state.units[targetIndex];
    const duplicateEffect = existingUnit.effects.find(e => e.id === effect.id && e.sourceUnitId === effect.sourceUnitId);
    if (duplicateEffect) {
        newState = removeEffect(newState, targetId, duplicateEffect.id);
    }

    // 1. Register Event Handler if applicable
    if (effect.subscribesTo && effect.onEvent) {
        const handlerId = effect.id; // Use effect ID as handler ID

        // Check if handler already exists (shouldn't happen for unique effect IDs but safety first)
        if (!newState.eventHandlerLogics[handlerId]) {
            const handler: IEventHandler = {
                id: handlerId,
                subscribesTo: effect.subscribesTo
            };

            newState.eventHandlers = [...newState.eventHandlers, handler];
            newState.eventHandlerLogics = {
                ...newState.eventHandlerLogics,
                [handlerId]: (event: import('./types').IEvent, s: GameState, hId: string) => {
                    const t = s.units.find(u => u.id === targetId);
                    if (!t) return s;
                    return effect.onEvent!(event, t, s);
                }
            };
        }
    }

    // 2. Apply effect logic (immediate changes like stats)
    // We pass the target from the current newState
    const currentTarget = newState.units[targetIndex];
    if (effect.onApply) {
        newState = effect.onApply(currentTarget, newState);
    } else if (effect.apply) {
        newState = effect.apply(currentTarget, newState);
    }

    // 3. Add effect to unit's list AND Recalculate Stats
    // Fetch fresh unit in case apply() modified it
    const freshTargetIndex = newState.units.findIndex(u => u.id === targetId);
    if (freshTargetIndex !== -1) {
        const freshTarget = newState.units[freshTargetIndex];
        let updatedTarget = {
            ...freshTarget,
            effects: [...freshTarget.effects, effect]
        };

        // Recalculate Stats
        console.log(`[EffectManager] Recalculating stats for ${updatedTarget.name} after adding effect ${effect.name}`);
        updatedTarget.stats = recalculateUnitStats(updatedTarget);
        // Note: We should NOT reset AV to initial value (10000/spd) when adding effects mid-turn.
        // Only adjust AV if SPD actually changed.
        // HSR Formula: NewAV = OldAV * (OldSpd / NewSpd)
        if (freshTarget.stats.spd !== updatedTarget.stats.spd) {
            updatedTarget = adjustActionValueForSpeedChange(updatedTarget, freshTarget.stats.spd, updatedTarget.stats.spd);
        }

        newState = {
            ...newState,
            units: newState.units.map((u, i) => i === freshTargetIndex ? updatedTarget : u)
        };
    }

    return newState;
}

export function removeEffect(state: GameState, targetId: string, effectId: string): GameState {
    const targetIndex = state.units.findIndex(u => u.id === targetId);
    if (targetIndex === -1) return state;

    let newState = { ...state };
    const target = newState.units[targetIndex];
    const effect = target.effects.find(e => e.id === effectId);

    if (!effect) return state;

    // 1. Unregister Event Handler
    if (effect.subscribesTo && effect.onEvent) {
        newState.eventHandlers = newState.eventHandlers.filter(h => h.id !== effectId);
        const { [effectId]: removed, ...remainingLogics } = newState.eventHandlerLogics;
        newState.eventHandlerLogics = remainingLogics;
    }

    // 2. Remove effect logic (revert changes)
    if (effect.onRemove) {
        newState = effect.onRemove(target, newState);
    } else if (effect.remove) {
        newState = effect.remove(target, newState);
    }

    // 3. Remove from unit's list AND Recalculate Stats
    const freshTargetIndex = newState.units.findIndex(u => u.id === targetId);
    if (freshTargetIndex !== -1) {
        const freshTarget = newState.units[freshTargetIndex];
        let updatedTarget = {
            ...freshTarget,
            effects: freshTarget.effects.filter(e => e.id !== effectId)
        };

        // Recalculate Stats
        updatedTarget.stats = recalculateUnitStats(updatedTarget);

        // Update AV if SPD changed
        if (freshTarget.stats.spd !== updatedTarget.stats.spd) {
            updatedTarget = adjustActionValueForSpeedChange(updatedTarget, freshTarget.stats.spd, updatedTarget.stats.spd);
        }

        newState = {
            ...newState,
            units: newState.units.map((u, i) => i === freshTargetIndex ? updatedTarget : u)
        };
    }

    return newState;
}
