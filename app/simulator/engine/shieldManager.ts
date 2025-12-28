import { GameState, Unit } from './types';
import { addEffect, removeEffect } from './effectManager';
import { UnitId, createUnitId } from './unitId';
import { appendShield } from './dispatcher';


/**
 * Parameters for applying a stackable shield.
 */
export interface StackableShieldParams {
    source: Unit;
    targetId: string;
    addedValue: number;
    cap: number;
    shieldName: string;
    duration?: number; // Default 3
}

/**
 * Applies a shield that stacks with existing shields of the same name and source,
 * up to a specified cap.
 * 
 * Logic:
 * - If shield exists: NewValue = Min(ExistingValue + AddedValue, Cap)
 * - If not exists: NewValue = Min(AddedValue, Cap)
 * - Refreshes duration on apply.
 */
export function applyStackableShield(state: GameState, params: StackableShieldParams): GameState {
    const { source, targetId, addedValue, cap, shieldName } = params;
    const duration = params.duration || 3;

    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    let newState = state;
    const existing = target.effects.find(e => e.name === shieldName && e.sourceUnitId === source.id);

    let finalValue = 0;
    if (existing) {
        // Safe access to 'value' property requires casting if IEffect is strict (handled via 'any' inside generic logic or type extension)
        // Here we assume cleaner abstraction or cast. 
        // We can inspect the effect more safely if we knew it was a Shield effect made by this manager.
        const currentVal = (existing as any).value || 0;
        finalValue = Math.min(currentVal + addedValue, cap);
        newState = removeEffect(newState, targetId, existing.id);
    } else {
        finalValue = Math.min(addedValue, cap);
    }

    // Construct the shield effect with the specific 'value' property for tracking.
    const shieldEffect = {
        id: `gen-shield-${targetId}-${Date.now()}`,
        name: shieldName,
        category: 'BUFF',
        type: 'Shield',
        sourceUnitId: source.id,
        duration: duration,
        durationType: 'TURN_END_BASED',
        skipFirstTurnDecrement: true,
        value: finalValue, // Custom property for stacking
        onApply: (t: Unit, s: GameState) => {
            const u = s.registry.get(createUnitId(t.id));
            if (u) {
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(u.id), unit => ({ ...unit, shield: (unit.shield || 0) + finalValue }))
                };
            }
            return s;
        },
        onRemove: (t: Unit, s: GameState) => {
            const u = s.registry.get(createUnitId(t.id));
            if (u) {
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(u.id), unit => ({ ...unit, shield: Math.max(0, (unit.shield || 0) - finalValue) }))
                };
            }
            return s;
        },
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s,
    } as any;

    newState = addEffect(newState, targetId, shieldEffect);

    // Logging
    const currentStats = newState.result.characterStats[source.id] || { damageDealt: 0, healingDealt: 0, shieldProvided: 0 };
    newState = {
        ...newState,
        result: {
            ...newState.result,
            characterStats: {
                ...newState.result.characterStats,
                [source.id]: { ...currentStats, shieldProvided: currentStats.shieldProvided + finalValue }
            }
        }
    };

    // 統合ログにシールドを追記（個別ログは削除）
    const targetUnit = newState.registry.get(createUnitId(targetId));
    newState = appendShield(newState, {
        source: source.name,
        name: `${shieldName} (累積)`,
        amount: finalValue,
        target: targetUnit?.name || targetId,
        breakdownMultipliers: {
            baseShield: finalValue,
            scalingStat: 'custom',
            multiplier: 1,
            flat: 0,
            cap: cap
        }
    });

    return newState;
}
