import { GameState, Unit, IEventHandler, IEffectEvent } from './types';
import { UnitId, createUnitId } from './unitId';

import { adjustActionValueForSpeedChange, updateActionQueue } from './actionValue';
import { IEffect } from '../effect/types';
import { recalculateUnitStats } from '../statBuilder';
import { publishEvent } from './dispatcher';
import { updatePassiveBuffs } from '../effect/relicHandler';

export function addEffect(state: GameState, targetId: string, effect: IEffect): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    // Debuff immunity check
    if (target.debuffImmune && effect.category === 'DEBUFF') {
        console.log(`[EffectManager] Debuff ${effect.name} blocked: ${target.name} is immune to debuffs`);
        return state;
    }

    let newState = { ...state };

    // 0. Check for duplicates (Same ID AND Same Source)
    const existingUnit = target;
    const duplicateEffect = existingUnit.effects.find(e => e.id === effect.id && e.sourceUnitId === effect.sourceUnitId);

    if (duplicateEffect) {
        // Update existing effect
        const currentStack = duplicateEffect.stackCount || 1;
        const maxStack = effect.maxStacks || duplicateEffect.maxStacks || 1;
        const newStack = Math.min(currentStack + 1, maxStack);

        console.log(`[EffectManager] Updating effect ${effect.name}: stack ${currentStack} -> ${newStack}, duration refreshed to ${effect.duration}`);

        duplicateEffect.stackCount = newStack;
        duplicateEffect.duration = effect.duration;

        const updatedEffects = existingUnit.effects.map(e =>
            (e.id === effect.id && e.sourceUnitId === effect.sourceUnitId) ? duplicateEffect : e
        );

        let updatedTarget = {
            ...existingUnit,
            effects: updatedEffects
        };

        updatedTarget.stats = recalculateUnitStats(updatedTarget, newState.registry.toArray());

        if (existingUnit.stats.spd !== updatedTarget.stats.spd) {
            updatedTarget = adjustActionValueForSpeedChange(updatedTarget, existingUnit.stats.spd, updatedTarget.stats.spd);
        }

        // updateUnitを使って更新
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(targetId), u => updatedTarget)
        };

        // Propagate to Summons
        newState = propagateStatsToSummons(newState, targetId);

        const effectAppliedEvent: IEffectEvent = {
            type: 'ON_EFFECT_APPLIED',
            sourceId: effect.sourceUnitId,
            targetId: targetId,
            effect: duplicateEffect
        };

        newState = publishEvent(newState, effectAppliedEvent);

        return newState;
    }

    // 1. Register Event Handler if applicable
    if (effect.subscribesTo && effect.onEvent) {
        const handlerId = effect.id;

        if (!newState.eventHandlerLogics[handlerId]) {
            const handler: IEventHandler = {
                id: handlerId,
                subscribesTo: effect.subscribesTo
            };

            newState.eventHandlers = [...newState.eventHandlers, handler];
            newState.eventHandlerLogics = {
                ...newState.eventHandlerLogics,
                [handlerId]: (event: import('./types').IEvent, s: GameState, hId: string) => {
                    const t = s.registry.get(createUnitId(targetId));
                    if (!t) return s;
                    return effect.onEvent!(event, t, s);
                }
            };
        }
    }

    // 2. Apply effect logic
    const currentTarget = newState.registry.get(createUnitId(targetId))!;
    if (effect.onApply) {
        newState = effect.onApply(currentTarget, newState);
    } else if (effect.apply) {
        newState = effect.apply(currentTarget, newState);
    }

    // ★ skipFirstTurnDecrementがtrueの場合、appliedDuringTurnOfを設定
    let effectToAdd = effect;
    if (effect.skipFirstTurnDecrement && newState.currentTurnOwnerId) {
        effectToAdd = {
            ...effect,
            appliedDuringTurnOf: newState.currentTurnOwnerId
        };
    }

    // 3. Add effect to unit's list AND Recalculate Stats
    const freshTarget = newState.registry.get(createUnitId(targetId));
    if (freshTarget) {
        // const freshTarget = newState.units[freshTargetIndex]; // 削除
        let updatedTarget = {
            ...freshTarget,
            effects: [...freshTarget.effects, effectToAdd]
        };

        updatedTarget.stats = recalculateUnitStats(updatedTarget, newState.registry.toArray());

        if (freshTarget.stats.spd !== updatedTarget.stats.spd) {
            updatedTarget = adjustActionValueForSpeedChange(updatedTarget, freshTarget.stats.spd, updatedTarget.stats.spd);
        }

        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(targetId), u => updatedTarget)
        };

        // ★ 速度が変わった場合は ActionQueue も同期
        if (freshTarget.stats.spd !== updatedTarget.stats.spd) {
            newState = updateActionQueue(newState);
        }

        // Propagate to Summons
        newState = propagateStatsToSummons(newState, targetId);
    }

    const effectAppliedEvent: IEffectEvent = {
        type: 'ON_EFFECT_APPLIED',
        sourceId: effect.sourceUnitId,
        targetId: targetId,
        effect: effect
    };

    newState = publishEvent(newState, effectAppliedEvent);

    // Update passive buffs (e.g. Relic effects that depend on active buffs)
    newState = updatePassiveBuffs(newState);

    return newState;
}

export function removeEffect(state: GameState, targetId: string, effectId: string): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    let newState = { ...state };
    // const target = newState.units[targetIndex]; // 削除
    const effect = target.effects.find(e => e.id === effectId);

    if (!effect) return state;

    // 0. Recursive removal of linked effects (Global Scan)
    // Scan ALL units for effects linked to this one
    // Note: Creating a list of removals first to avoid modifying state while iterating units array logic
    const globalRemovals: { unitId: string; effectId: string }[] = [];

    newState.registry.toArray().forEach(u => {
        const linkedEffects = u.effects.filter(e =>
            e.durationType === 'LINKED' && e.linkedEffectId === effectId
        );
        linkedEffects.forEach(le => globalRemovals.push({ unitId: u.id, effectId: le.id }));
    });

    for (const removal of globalRemovals) {
        newState = removeEffect(newState, removal.unitId, removal.effectId);
    }

    // 1. Unregister Event Handler
    if (effect.subscribesTo && effect.onEvent) {
        newState.eventHandlers = newState.eventHandlers.filter(h => h.id !== effectId);
        const { [effectId]: removed, ...remainingLogics } = newState.eventHandlerLogics;
        newState.eventHandlerLogics = remainingLogics;
    }

    // 2. Remove effect logic
    if (effect.onRemove) {
        newState = effect.onRemove(target, newState);
    } else if (effect.remove) {
        newState = effect.remove(target, newState);
    }

    // 3. Remove from unit's list AND Recalculate Stats
    const freshTarget = newState.registry.get(createUnitId(targetId));
    if (freshTarget) {
        // const freshTarget = newState.units[freshTargetIndex]; // 削除
        let updatedTarget = {
            ...freshTarget,
            effects: freshTarget.effects.filter(e => e.id !== effectId)
        };

        updatedTarget.stats = recalculateUnitStats(updatedTarget, newState.registry.toArray());

        if (freshTarget.stats.spd !== updatedTarget.stats.spd) {
            updatedTarget = adjustActionValueForSpeedChange(updatedTarget, freshTarget.stats.spd, updatedTarget.stats.spd);
        }

        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(targetId), u => updatedTarget)
        };

        // Propagate to Summons
        newState = propagateStatsToSummons(newState, targetId);
    }

    const effectRemovedEvent: IEffectEvent = {
        type: 'ON_EFFECT_REMOVED',
        sourceId: effect.sourceUnitId,
        targetId: targetId,
        effect: effect
    };

    newState = publishEvent(newState, effectRemovedEvent);

    // Update passive buffs (e.g. Relic effects that depend on active buffs)
    newState = updatePassiveBuffs(newState);

    return newState;
}

// Helper to propagate stats to summons when owner updates
function propagateStatsToSummons(state: GameState, ownerId: string): GameState {
    let newState = state;
    const summons = state.registry.getSummons(createUnitId(ownerId));

    for (const summon of summons) {
        const currentSummon = newState.registry.get(summon.id as UnitId);
        if (!currentSummon) continue;

        let updatedSummon = { ...currentSummon };
        const oldSummonSpd = currentSummon.stats.spd;

        // This will access the *already updated* owner in newState.registry
        updatedSummon.stats = recalculateUnitStats(updatedSummon, newState.registry.toArray());

        if (oldSummonSpd !== updatedSummon.stats.spd) {
            updatedSummon = adjustActionValueForSpeedChange(updatedSummon, oldSummonSpd, updatedSummon.stats.spd);
        }

        newState = {
            ...newState,
            registry: newState.registry.update(summon.id as UnitId, u => updatedSummon)
        };
    }
    return newState;
}
