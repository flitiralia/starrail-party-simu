import { IEventHandlerFactory, IEventHandler, IEventHandlerLogic, GameState, Unit } from '../types';
import { RelicSet, OrnamentSet, ILightConeData, StatKey, STAT_KEYS, IEffect } from '@/app/types';

type IRelicSet = ILightConeData; // Adjusted to remove RelicSet/OrnamentSet dependency if possible, or just keep ILightConeData usage

/**
 * Updates the unit's stats based on the modifier change.
 * @param unit The unit to update.
 * @param stat The stat key being modified.
 * @param value The value of the modification.
 * @param isPercentage Whether the modification is a percentage of base stats.
 * @param isAddition True if adding the buff, False if removing.
 */
function updateUnitStats(unit: Unit, stat: StatKey, value: number, isPercentage: boolean, isAddition: boolean) {
    const multiplier = isAddition ? 1 : -1;
    const change = value * multiplier;

    // Update the specific stat key (e.g., 'atk_pct' or 'spd')
    // Initialize if undefined (though FinalStats should have all keys initialized to 0)
    if (unit.stats[stat] === undefined) unit.stats[stat] = 0;
    unit.stats[stat] += change;

    // If it's a percentage buff, we also need to update the derived flat stat
    if (isPercentage) {
        let baseStatValue = 0;
        let flatKey: StatKey | null = null;

        if (stat.startsWith('atk')) { baseStatValue = unit.baseStats.atk; flatKey = 'atk'; }
        else if (stat.startsWith('def')) { baseStatValue = unit.baseStats.def; flatKey = 'def'; }
        else if (stat.startsWith('hp')) { baseStatValue = unit.baseStats.hp; flatKey = 'hp'; }
        else if (stat.startsWith('spd')) { baseStatValue = unit.baseStats.spd; flatKey = 'spd'; }

        if (flatKey) {
            unit.stats[flatKey] += baseStatValue * change;
        }
    }
}

// createGenericRelicHandlerFactory removed

export function createGenericLightConeHandlerFactory(lightCone: ILightConeData, superimposition: number): IEventHandlerFactory {
    return (sourceUnitId, level) => {
        const handlerId = `lc-${lightCone.id}-${sourceUnitId}`;

        const handlerMetadata: IEventHandler = {
            id: handlerId,
            subscribesTo: ['ON_BATTLE_START', 'ON_TURN_START', 'ON_UNIT_HEALED', 'ON_DAMAGE_DEALT', 'ON_ULTIMATE_USED', 'ON_BASIC_ATTACK', 'ON_SKILL_USED', 'ON_WEAKNESS_BREAK'],
        };

        const handlerLogic: IEventHandlerLogic = (event, state, handlerId) => {
            let newState = { ...state };
            const unitIndex = newState.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = { ...newState.units[unitIndex] };
            let statsChanged = false;

            for (const effect of lightCone.effects) {
                // If custom handler is present, delegate logic to it
                if (effect.customHandler) {
                    if (effect.condition) {
                        const conditionMet = effect.condition(unit.stats);
                        const modifierId = `${handlerId}-${effect.id || 'effect'}`;
                        const existingModifierIndex = unit.modifiers.findIndex(m => m.source === modifierId);

                        if (conditionMet && existingModifierIndex === -1) {
                            newState = effect.apply(unit, newState, event);
                            // Sync unit
                            const freshUnit = newState.units.find(u => u.id === sourceUnitId);
                            if (freshUnit) Object.assign(unit, freshUnit);
                            statsChanged = true;
                        } else if (!conditionMet && existingModifierIndex !== -1) {
                            newState = effect.remove(unit, newState, event);
                            // Sync unit
                            const freshUnit = newState.units.find(u => u.id === sourceUnitId);
                            if (freshUnit) Object.assign(unit, freshUnit);
                            statsChanged = true;
                        }
                    } else {
                        // If no condition, just call apply (e.g. permanent dynamic buff or event trigger)
                        newState = effect.apply(unit, newState, event);
                        const freshUnit = newState.units.find(u => u.id === sourceUnitId);
                        if (freshUnit) Object.assign(unit, freshUnit);
                        statsChanged = true;
                    }
                    continue;
                }

                if (!effect.condition) continue;

                const conditionMet = effect.condition(unit.stats);
                const modifierId = `${handlerId}-${effect.id || 'effect'}`;
                const existingModifierIndex = unit.modifiers.findIndex(m => m.source === modifierId);

                if (effect.targetStat && Array.isArray(effect.effectValue)) {
                    const value = effect.effectValue[superimposition - 1];
                    const isPercentage = effect.targetStat.endsWith('_pct');

                    if (conditionMet && existingModifierIndex === -1) {
                        console.log(`[GenericLightConeHandler] Applying buff: ${lightCone.name} to ${unit.name}`);
                        // Apply
                        updateUnitStats(unit, effect.targetStat, value, isPercentage, true);
                        // イミュータブルな配列操作（NEW）
                        unit.modifiers = [...unit.modifiers, {
                            target: effect.targetStat,
                            source: modifierId,
                            type: isPercentage ? 'pct' : 'add',
                            value: value,
                        }];

                        // Add Effect for display
                        unit.effects = [...unit.effects, {
                            id: `effect-${modifierId}`,
                            name: effect.name || lightCone.name,
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'PERMANENT',
                            duration: -1,
                            apply: (t: Unit, s: GameState) => s,
                            remove: (t: Unit, s: GameState) => s
                        }];

                        statsChanged = true;
                        newState.log.push({
                            actionType: 'Buff',
                            sourceId: sourceUnitId,
                            targetId: sourceUnitId,
                            details: `Applied ${lightCone.name} effect: ${effect.targetStat} +${value}`
                        });
                    } else if (!conditionMet && existingModifierIndex !== -1) {
                        console.log(`[GenericLightConeHandler] Removing buff: ${lightCone.name} from ${unit.name}`);
                        // Remove
                        updateUnitStats(unit, effect.targetStat, value, isPercentage, false);
                        // イミュータブルな配列操作（NEW）
                        unit.modifiers = unit.modifiers.filter((_, i) => i !== existingModifierIndex);

                        // Remove Effect
                        const effectIndex = unit.effects.findIndex(e => e.id === `effect-${modifierId}`);
                        if (effectIndex !== -1) {
                            unit.effects = unit.effects.filter((_, i) => i !== effectIndex);
                        }

                        statsChanged = true;
                        newState.log.push({
                            actionType: 'BuffRemoved',
                            sourceId: sourceUnitId,
                            targetId: sourceUnitId,
                            details: `Removed ${lightCone.name} effect`
                        });
                    }
                }
            }

            if (statsChanged) {
                newState.units[unitIndex] = unit;
            }

            return newState;
        };

        return { handlerMetadata, handlerLogic };
    };
}
