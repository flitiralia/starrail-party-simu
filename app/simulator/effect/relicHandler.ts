import { GameState, Unit, IEventHandler, IEventHandlerLogic } from '../engine/types';
import { RelicEffect, PassiveRelicEffect, EventRelicEffect, IRelicData, IOrnamentData } from '../../types/relic';
import { recalculateUnitStats } from '../statBuilder';
import { UnitRegistry } from '../engine/unitRegistry';

import { createUnitId } from '../engine/unitId';

/**
 * ユニットが装備しているすべての遺物・オーナメントの効果を収集する
 */
function getAllRelicEffects(unit: Unit): { effect: RelicEffect, sourceRelicId: string }[] {
    const effects: { effect: RelicEffect, sourceRelicId: string }[] = [];

    // Helper to process set bonuses
    const processSet = (set: IRelicData['set'] | IOrnamentData['set'], count: number, idPrefix: string) => {
        for (const bonus of set.setBonuses) {
            if (count >= bonus.pieces) {


                // 2. Passive Effects (New)
                if (bonus.passiveEffects) {
                    bonus.passiveEffects.forEach((effect, index) => {
                        // Compatibility: Inject type 'PASSIVE_STAT' if missing
                        const compatibleEffect = { ...effect, type: 'PASSIVE_STAT' } as RelicEffect;
                        effects.push({ effect: compatibleEffect, sourceRelicId: `${idPrefix}-${set.id}-${bonus.pieces}pc-passive-${index}` });
                    });
                }

                // 3. Event Handlers (New)
                if (bonus.eventHandlers) {
                    bonus.eventHandlers.forEach((effect, index) => {
                        // Compatibility: Inject type 'EVENT_TRIGGER' if missing
                        const compatibleEffect = { ...effect, type: 'EVENT_TRIGGER' } as RelicEffect;
                        effects.push({ effect: compatibleEffect, sourceRelicId: `${idPrefix}-${set.id}-${bonus.pieces}pc-event-${index}` });
                    });
                }
            }
        }
    };

    // Relics (Tunnel)
    if (unit.relics) {
        const setCounts: Record<string, number> = {};
        unit.relics.forEach(r => {
            setCounts[r.set.id] = (setCounts[r.set.id] || 0) + 1;
        });

        const processedSets = new Set<string>();
        unit.relics.forEach(r => {
            if (!processedSets.has(r.set.id)) {
                processSet(r.set, setCounts[r.set.id], 'relic');
                processedSets.add(r.set.id);
            }
        });
    }

    // Ornaments (Planar)
    if (unit.ornaments) {
        const setCounts: Record<string, number> = {};
        unit.ornaments.forEach(o => {
            setCounts[o.set.id] = (setCounts[o.set.id] || 0) + 1;
        });

        const processedSets = new Set<string>();
        unit.ornaments.forEach(o => {
            if (!processedSets.has(o.set.id)) {
                processSet(o.set, setCounts[o.set.id], 'ornament');
                processedSets.add(o.set.id);
            }
        });
    }

    return effects;
}

/**
 * パッシブ効果（ステータスバフ）を更新する
 * 条件(condition)を評価し、満たしていればModifierを追加、満たしていなければ削除する。
 * @param timing 'battle_start'の場合は全ての条件を評価、'turn_start'の場合はdynamic評価のみ
 */
export function updatePassiveBuffs(state: GameState, timing: 'battle_start' | 'turn_start' = 'battle_start'): GameState {
    let newState = { ...state };
    let currentUnits = newState.registry.toArray();

    // DEBUG: Log effects for each unit at start
    console.log('[updatePassiveBuffs] Units at start:');
    currentUnits.forEach(u => {
        console.log(`  - ${u.name}: ${u.effects.length} effects`, u.effects.map(e => e.name));
    });

    // Step 1: Remove all existing passive relic modifiers to start fresh
    const unitsWithCleanModifiers = currentUnits.map(u => ({
        ...u,
        modifiers: u.modifiers.filter(m => !m.source.startsWith('relic-passive-') && !m.source.startsWith('ornament-passive-'))
    }));

    // Step 2: Apply active buffs
    // We need intermediate state to accumulate buffs
    let workingUnits = [...unitsWithCleanModifiers];

    // Pass 1: Unconditional Buffs
    workingUnits.forEach(sourceUnit => {
        const relicEffects = getAllRelicEffects(sourceUnit);
        for (const { effect, sourceRelicId } of relicEffects) {
            if (effect.type !== 'PASSIVE_STAT') continue;
            const passiveEffect = effect as PassiveRelicEffect;
            if (passiveEffect.condition) continue; // Skip conditional for now

            // Apply Unconditional Modifier
            let targetIds: string[] = [];
            if (passiveEffect.target === 'self') targetIds = [sourceUnit.id];
            else if (passiveEffect.target === 'all_allies') targetIds = workingUnits.filter(u => !u.isEnemy).map(u => u.id);
            else if (passiveEffect.target === 'other_allies') targetIds = workingUnits.filter(u => !u.isEnemy && u.id !== sourceUnit.id).map(u => u.id); // 自分以外の味方
            else if (passiveEffect.target === 'all_enemies') targetIds = workingUnits.filter(u => u.isEnemy).map(u => u.id);

            targetIds.forEach(tid => {
                const targetUnitIndex = workingUnits.findIndex(u => u.id === tid);
                if (targetUnitIndex !== -1) {
                    const targetUnit = workingUnits[targetUnitIndex];
                    const modifierId = `${sourceRelicId.replace('relic-', 'relic-passive-').replace('ornament-', 'ornament-passive-')}-${sourceUnit.id}-${passiveEffect.stat}`;

                    const newModifier = {
                        target: passiveEffect.stat,
                        source: modifierId,
                        type: 'pct' as const,
                        value: passiveEffect.value
                    };

                    if (passiveEffect.stat.endsWith('_pct') ||
                        passiveEffect.stat.endsWith('_boost') ||
                        passiveEffect.stat.endsWith('_res') ||
                        passiveEffect.stat.endsWith('_rate') ||
                        passiveEffect.stat === 'crit_dmg' ||
                        passiveEffect.stat === 'crit_rate'
                    ) {
                        newModifier.type = 'pct';
                    } else {
                        (newModifier as any).type = 'add';
                    }

                    workingUnits[targetUnitIndex] = {
                        ...targetUnit,
                        modifiers: [...targetUnit.modifiers, newModifier]
                    };
                }
            });
        }
    });

    // Recalculate stats after unconditional buffs
    const unitStatsMap = new Map<string, any>();
    workingUnits.forEach(u => {
        // Need to temporarily update unit in registry for recalculateUnitStats to work properly if it uses registry
        // But here we are just calculating stats for local unit object, assuming recalculateUnitStats supports it.
        // Actually recalculateUnitStats takes (Unit, units_array) usually.
        unitStatsMap.set(u.id, recalculateUnitStats(u, workingUnits));
    });

    // Pass 2: Conditional Buffs
    workingUnits.forEach(sourceUnit => {
        const relicEffects = getAllRelicEffects(sourceUnit);
        for (const { effect, sourceRelicId } of relicEffects) {
            if (effect.type !== 'PASSIVE_STAT') continue;
            const passiveEffect = effect as PassiveRelicEffect;
            if (!passiveEffect.condition) continue; // Skip unconditional (already done)

            // evaluationTimingに基づいてスキップ
            const evalTiming = passiveEffect.evaluationTiming || 'dynamic';
            if (timing === 'turn_start' && evalTiming === 'battle_start') {
                continue; // 戦闘開始時のみの効果はターン開始時にはスキップ
            }

            const stats = unitStatsMap.get(sourceUnit.id);
            if (passiveEffect.stat === 'crit_dmg') {
                console.log(`[RelicHandler] Checking condition for ${sourceRelicId} on ${sourceUnit.id}`);
                console.log(`[RelicHandler] Stats Effect Res: ${stats.effect_res}`);
            }

            // Note: condition function might expect state with correct units.
            // We should ideally construct a temporary state with workingUnits.
            const tempState = { ...newState, registry: UnitRegistry.fromArray(workingUnits) };
            const conditionMet = passiveEffect.condition(stats, tempState, sourceUnit.id);

            if (passiveEffect.stat === 'crit_dmg') {
                console.log(`[RelicHandler] Condition Met: ${conditionMet}`);
            }

            if (conditionMet) {
                // Apply Conditional Modifier (Same logic as above)
                let targetIds: string[] = [];
                if (passiveEffect.target === 'self') targetIds = [sourceUnit.id];
                else if (passiveEffect.target === 'all_allies') targetIds = workingUnits.filter(u => !u.isEnemy).map(u => u.id);
                else if (passiveEffect.target === 'other_allies') targetIds = workingUnits.filter(u => !u.isEnemy && u.id !== sourceUnit.id).map(u => u.id); // 自分以外の味方
                else if (passiveEffect.target === 'all_enemies') targetIds = workingUnits.filter(u => u.isEnemy).map(u => u.id);

                targetIds.forEach(tid => {
                    const targetUnitIndex = workingUnits.findIndex(u => u.id === tid);
                    if (targetUnitIndex !== -1) {
                        const targetUnit = workingUnits[targetUnitIndex];
                        const modifierId = `${sourceRelicId.replace('relic-', 'relic-passive-').replace('ornament-', 'ornament-passive-')}-${sourceUnit.id}-${passiveEffect.stat}`;

                        const newModifier = {
                            target: passiveEffect.stat,
                            source: modifierId,
                            type: 'pct' as const,
                            value: passiveEffect.value
                        };

                        if (passiveEffect.stat.endsWith('_pct') ||
                            passiveEffect.stat.endsWith('_boost') ||
                            passiveEffect.stat.endsWith('_res') ||
                            passiveEffect.stat.endsWith('_rate') ||
                            passiveEffect.stat === 'crit_dmg' ||
                            passiveEffect.stat === 'crit_rate'
                        ) {
                            newModifier.type = 'pct';
                        } else {
                            (newModifier as any).type = 'add';
                        }

                        workingUnits[targetUnitIndex] = {
                            ...targetUnit,
                            modifiers: [...targetUnit.modifiers, newModifier]
                        };
                    }
                });
            }
        }
    });

    // DEBUG: Log effects for each unit before returning
    console.log('[updatePassiveBuffs] Units before return:');
    workingUnits.forEach(u => {
        console.log(`  - ${u.name}: ${u.effects.length} effects`, u.effects.map(e => e.name));
    });

    return { ...newState, registry: UnitRegistry.fromArray(workingUnits) };
}

/**
 * イベントハンドラを持つ遺物効果を登録する
 * 戦闘開始時などに呼び出す
 */
export function registerRelicEventHandlers(state: GameState): GameState {
    let newState = { ...state };

    state.registry.toArray().forEach(unit => {
        const relicEffects = getAllRelicEffects(unit);

        // ★ DEBUG: 遺物効果のカウントをログ出力
        console.log(`[registerRelicEventHandlers] Unit: ${unit.name}, RelicEffects count: ${relicEffects.length}`);
        if (unit.relics) {
            const setCounts: Record<string, number> = {};
            unit.relics.forEach(r => {
                if (r.set) {
                    setCounts[r.set.id] = (setCounts[r.set.id] || 0) + 1;
                }
            });
            console.log(`[registerRelicEventHandlers]   Relic sets:`, setCounts);
        }

        for (const { effect, sourceRelicId } of relicEffects) {
            if (effect.type !== 'EVENT_TRIGGER') continue;
            const eventEffect = effect as EventRelicEffect;

            const handlerId = `${sourceRelicId}-${unit.id}-handler`;

            // ★ DEBUG: 登録されるハンドラーをログ出力
            console.log(`[registerRelicEventHandlers]   Registering handler: ${handlerId}, events: ${eventEffect.events.join(', ')}`);

            // Check if already registered
            if (newState.eventHandlerLogics[handlerId]) continue;

            const handler: IEventHandler = {
                id: handlerId,
                subscribesTo: eventEffect.events
            };

            const logic: IEventHandlerLogic = (event, s, hId) => {
                return eventEffect.handler(event, s, unit.id);
            };

            newState = {
                ...newState,
                eventHandlers: [...newState.eventHandlers, handler],
                eventHandlerLogics: {
                    ...newState.eventHandlerLogics,
                    [handlerId]: logic
                }
            };
        }
    });

    return newState;
}
