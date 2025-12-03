import { Character, Enemy, Element, SimulationLogEntry } from '../../types';
import { createInitialGameState } from './gameState';
import { dispatch, publishEvent, applyDamage, applyUnifiedDamage } from './dispatcher';
import { GameState, Unit, CharacterConfig, IEventHandler, IEventHandlerLogic, SimulationConfig, IEventHandlerFactory, Action, RegisterHandlersAction, EventType, IEvent, DoTDamageEvent } from './types';
import { initializeActionQueue, updateActionQueue, advanceTimeline, calculateActionValue, addActionValue, actionAdvance } from './actionValue';
import { LightConeRegistry, RelicRegistry } from './handlers/registry';
import { createGenericLightConeHandlerFactory } from './handlers/generic';
import { march7thHandlerFactory } from '../../data/characters/march-7th';
import { tribbieHandlerFactory } from '../../data/characters/tribbie';
import { DoTEffect, BreakStatusEffect } from '../effect/types';
import { isDoTEffect, isBreakStatusEffect, isCrowdControlEffect } from '../effect/utils';
import { calculateBreakDoTDamage, calculateNormalDoTDamage, calculateBreakAdditionalDamage } from '../damage';
import { LEVEL_CONSTANT_80, FREEZE_REMOVAL_AV_ADVANCE } from './constants';
import * as relicData from '../../data/relics';
import * as ornamentData from '../../data/ornaments';
import { registry } from '../registry';

// Create a lookup map for all relic/ornament sets
const allRelicSets = new Map<string, any>();
Object.values(relicData).forEach((set: any) => allRelicSets.set(set.id, set));
Object.values(ornamentData).forEach((set: any) => allRelicSets.set(set.id, set));

const MAX_TURNS = 500;

function determineNextAction(unit: Unit, state: GameState): Action {
    const { config } = unit;

    if (!config) { // It's an enemy or has no config
        const aliveAllies = state.units.filter(u => !u.isEnemy && u.hp > 0);
        return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: aliveAllies[0].id };
    }

    // 自分のターンで必殺技を使うかどうか（割り込みではない）
    if (unit.ep >= unit.stats.max_ep && unit.ultCooldown === 0 && config.ultStrategy !== 'immediate') {
        if (config.ultStrategy === 'cooldown') { // 'cooldown' 戦略などの場合
            return { type: 'ULTIMATE', sourceId: unit.id };
        }
    }

    // 2. Follow rotation
    const rotation = config.rotation;
    const actionChar = rotation[unit.rotationIndex % rotation.length];

    const aliveEnemies = state.units.filter(u => u.isEnemy && u.hp > 0);
    let targetId = aliveEnemies[0]?.id; // Default to enemy

    if (actionChar === 's' && state.skillPoints > 0) {
        const ability = unit.abilities.skill;
        if (ability.targetType === 'ally' || ability.targetType === 'self') {
            targetId = unit.id; // Target self for simplicity
        }

        // Check for PREVENT_TURN_END tag in buffs
        const preventTurnEnd = unit.effects.some(e => e.tags?.includes('PREVENT_TURN_END'));

        return {
            type: 'SKILL',
            sourceId: unit.id,
            targetId: targetId,
            flags: preventTurnEnd ? { skipTurnEnd: true } : undefined
        };
    }

    // Default to Basic Attack if rotation is 'b' or if 's' and no SP
    return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: aliveEnemies[0]?.id };
}

function checkAndExecuteInterruptingUltimates(state: GameState): GameState {
    let newState = state;
    const characters = newState.units.filter(u => !u.isEnemy && u.hp > 0);
    const epLog = characters.map(c => `${c.name}:${c.ep.toFixed(1)}/${c.stats.max_ep.toFixed(0)}`).join(', ');
    console.log(`ultimate check [${epLog}]`);

    // Limit recursion/loops to prevent infinite Ultimate chains if something is broken
    // In a real game, multiple Ultimates can happen. We'll allow a reasonable number per check.
    for (let i = 0; i < 10; i++) {
        const characters = newState.units.filter(u => !u.isEnemy && u.hp > 0);
        let ultTriggered = false;

        for (const char of characters) {
            if (char.config && char.ep >= char.stats.max_ep && char.ultCooldown === 0 && char.config.ultStrategy === 'immediate') {
                const ultAction: Action = { type: 'ULTIMATE', sourceId: char.id };
                newState = dispatch(newState, ultAction);

                // Reset cooldown (if any logic requires it, though usually handled by energy cost)
                // And we might want to re-evaluate state immediately (e.g. another Ult becomes ready due to kill)
                ultTriggered = true;
                break; // Restart loop to re-check all characters with fresh state
            }
        }

        if (!ultTriggered) break;
    }

    return newState;
}



function processDoTDamage(state: GameState, actingUnitId: string): GameState {
    const actingUnit = state.units.find(u => u.id === actingUnitId);
    if (!actingUnit) return state;

    let newState = state;

    // TURN_START_BASEDかつtype='DoT'のエフェクトを処理
    const dotEffects = actingUnit.effects.filter(
        effect => effect.durationType === 'TURN_START_BASED' && isDoTEffect(effect)
    ) as DoTEffect[];

    for (const dotEffect of dotEffects) {
        // ソースユニットを取得
        const sourceUnit = newState.units.find(u => u.id === dotEffect.sourceUnitId);
        if (!sourceUnit) continue;

        const targetUnit = newState.units.find(u => u.id === actingUnitId);
        if (!targetUnit) continue;

        // ★DoTダメージ計算: キャラクター由来と弱点撃破で分岐
        // 計算タイプに応じて基礎ダメージを算出
        let baseDamage: number;
        let dotDamage: number;

        if (dotEffect.damageCalculation === 'multiplier') {
            // キャラクターDoT: 倍率 × 現在のATK
            baseDamage = sourceUnit.stats.atk * (dotEffect.multiplier || 0);
            console.log(`[DoT Damage] ${dotEffect.name} from ${sourceUnit.name}: baseDamage = ${sourceUnit.stats.atk} * ${dotEffect.multiplier} = ${baseDamage}`);

            // キャラクター由来DoTはcalculateNormalDoTDamageを使用
            dotDamage = calculateNormalDoTDamage(sourceUnit, targetUnit, baseDamage);
            console.log(`[DoT Damage] ${dotEffect.name}: calculateNormalDoTDamage result = ${dotDamage}`);
        } else {
            // 弱点撃破DoT: 固定ダメージ値
            baseDamage = dotEffect.baseDamage || 0;
            console.log(`[DoT Damage] ${dotEffect.name} from ${sourceUnit.name}: baseDamage (fixed) = ${baseDamage}`);

            // 弱点撃破DoTはcalculateBreakDoTDamageを使用
            dotDamage = calculateBreakDoTDamage(sourceUnit, targetUnit, baseDamage);
            console.log(`[DoT Damage] ${dotEffect.name}: calculateBreakDoTDamage result = ${dotDamage}`);
        }


        const result = applyUnifiedDamage(
            newState,
            sourceUnit,
            targetUnit,
            dotDamage,
            {
                damageType: 'DOT_DAMAGE',
                details: `${dotEffect.name}ダメージ`,
                events: [{
                    type: 'ON_DOT_DAMAGE',
                    payload: {
                        dotType: dotEffect.dotType,
                        effectId: dotEffect.id
                    }
                }]
            }
        );
        newState = result.state;
    }

    return newState;
}

/**
 * ターン開始時にバフ/デバフのターン数を減算する
 * TURN_START_BASEDのエフェクトのうち、DoTエフェクト（type='DoT'）のみ処理
 * 
 * IMPORTANT: この関数は ON_TURN_START イベント発火の「後」に呼ばれる。
 * DoTダメージは ON_TURN_START イベントハンドラ内で既に適用されている。
 * この関数ではターン数の減算と期限切れエフェクトの削除のみを行う。
 * 
 * 凍結（Freeze）、もつれ（Entanglement）、禁錮（Imprisonment）は
 * TURN_START_BASEDだが、type='BreakStatus'なので除外される。
 * これらは現在の特殊処理フロー（凍結チェック等）で管理される。
 * 
 * 処理順序:
 * 1. ON_TURN_START イベント発火 → DoTダメージ適用（イベントハンドラ内）
 * 2. processTurnStartDurations → DoTのターン数減算・期限切れ削除
 */
function processTurnStartDurations(state: GameState, actingUnitId: string): GameState {
    const actingUnit = state.units.find(u => u.id === actingUnitId);
    if (!actingUnit) return state;

    let updatedUnit = { ...actingUnit };
    let newState = state;

    // TURN_START_BASEDかつtype='DoT'のエフェクトのみ処理
    updatedUnit.effects = updatedUnit.effects
        .map(effect => {
            // DoTエフェクトのみターン数減算
            // DoTエフェクトおよびTURN_START_BASEDのバフのターン数減算
            if (effect.durationType === 'TURN_START_BASED' && (isDoTEffect(effect) || effect.category === 'BUFF')) {
                return { ...effect, duration: effect.duration - 1 };
            }
            return effect;
        })
        .filter(effect => {
            // DoTエフェクトで期限切れのものを削除
            // DoTエフェクトおよびTURN_START_BASEDのバフで期限切れのものを削除
            if (effect.durationType === 'TURN_START_BASED' && (isDoTEffect(effect) || effect.category === 'BUFF')) {
                if (effect.duration <= 0) {
                    // 期限切れ: removeコールバックを呼ぶ
                    if (effect.remove) {
                        newState = effect.remove(updatedUnit, newState);
                    }
                    return false; // エフェクトを削除
                }
            }
            return true; // エフェクトを保持
        });

    return {
        ...newState,
        units: newState.units.map(u => u.id === actingUnitId ? updatedUnit : u)
    };
}

function updateTurnEndState(state: GameState, actingUnit: Unit, action: Action): GameState {
    const unitInNewState = state.units.find(u => u.id === actingUnit.id);
    if (!unitInNewState) return state;

    let newRotationIndex = unitInNewState.rotationIndex;
    let newUltCooldown = Math.max(0, unitInNewState.ultCooldown - 1); // Decrement cooldown each turn

    if (action.type === 'ULTIMATE') {
        // unitInNewState.ep = 0; // Removed: Handled in dispatch (stepPayCost)
        newUltCooldown = unitInNewState.config?.ultCooldown ?? 0; // ターン中の必殺技にもクールダウンを適用
    } else if (unitInNewState.config) { // Ultimateではないアクションの場合、ローテーションを進める
        // Only advance rotation on non-ultimate turns for characters with a config
        newRotationIndex = (unitInNewState.rotationIndex + 1) % unitInNewState.config.rotation.length;
    }

    unitInNewState.rotationIndex = newRotationIndex;
    unitInNewState.ultCooldown = newUltCooldown;

    // Reset Action Value for the next turn (AV model)
    const baseAV = calculateActionValue(unitInNewState.stats.spd);
    console.log(`[Debug] updateTurnEndState: Unit ${unitInNewState.name}, Action ${action.type}, OldAV ${unitInNewState.actionValue}, NewAV ${(unitInNewState.actionValue || 0) + baseAV}`);
    // AV increase is handled by addActionValue at the end of the function

    // ★ Buff Duration Management (Turn End) ★
    // Only process TURN_END_BASED and DURATION_BASED (backward compatibility)
    // TURN_START_BASED effects (DoTs) are already processed in Phase 3
    unitInNewState.effects = unitInNewState.effects
        .map(effect => {
            if (effect.durationType === 'TURN_END_BASED' || effect.durationType === 'DURATION_BASED') {
                return { ...effect, duration: effect.duration - 1 };
            }
            return effect; // PERMANENT and TURN_START_BASED are kept unchanged
        })
        .filter(effect => {
            if (effect.durationType === 'TURN_END_BASED' || effect.durationType === 'DURATION_BASED') {
                if (effect.duration <= 0) {
                    // Expired: call remove callback
                    if (effect.remove) {
                        state = effect.remove(unitInNewState, state);
                    }
                    return false; // Remove effect
                }
            }
            return true; // Keep effect (PERMANENT, TURN_START_BASED, or not expired)
        });

    // ★ Handler Cooldown Management ★
    const newCooldowns: Record<string, number> = {};
    for (const [handlerId, cd] of Object.entries(state.cooldowns)) {
        if (cd > 0) {
            newCooldowns[handlerId] = cd - 1;
        }
    }

    // Update state with modified unit
    const nextState = {
        ...state,
        units: state.units.map(u => u.id === unitInNewState.id ? unitInNewState : u),
        cooldowns: newCooldowns,
    };

    // Add BaseAV and Re-sort Action Queue
    const nextBaseAV = calculateActionValue(unitInNewState.stats.spd);
    return addActionValue(nextState, unitInNewState.id, nextBaseAV);
}

export function stepSimulation(state: GameState): GameState {
    // 1. Advance Timeline
    // Find the unit with the lowest Action Value
    if (state.actionQueue.length === 0) {
        state = { ...state, actionQueue: initializeActionQueue(state.units) };
    }

    const nextEntry = state.actionQueue[0];
    if (!nextEntry) return state;

    const avDelta = nextEntry.actionValue;

    // Advance timeline
    let newState = advanceTimeline(state, avDelta);

    // ★ 割り込みチェックフェーズ (Start of Turn) ★
    // Check for Immediate Ultimates (e.g. at start of battle or ready since last turn)
    newState = checkAndExecuteInterruptingUltimates(newState);

    // Get the acting unit
    let currentActingUnit = newState.units.find(u => u.id === nextEntry.unitId);
    if (!currentActingUnit || currentActingUnit.hp <= 0) {
        // Skip dead units
        return {
            ...newState,
            actionQueue: newState.actionQueue.filter(e => e.unitId !== nextEntry.unitId)
        };
    }

    // 1. Trigger ON_TURN_START (DoTs trigger here)
    // IMPORTANT: This must fire for ALL units, not just frozen ones
    newState = publishEvent(newState, { type: 'ON_TURN_START', sourceId: currentActingUnit.id, value: 0 });

    // ★DoT処理
    newState = processDoTDamage(newState, currentActingUnit.id);

    // ★ターン開始時の持続時間減少処理
    // DoTやTribbieのバフなど、TURN_START_BASEDのエフェクトのターン数を減少させる
    newState = processTurnStartDurations(newState, currentActingUnit.id);

    // ★もつれの付加ダメージ処理
    // もつれはターン開始時にスタック数に応じたダメージを与える
    const entanglementEffect = currentActingUnit.effects.find(e =>
        isBreakStatusEffect(e) && e.statusType === 'Entanglement'
    ) as BreakStatusEffect | undefined;

    if (entanglementEffect && entanglementEffect.baseDamagePerStack) {
        const sourceUnit = newState.units.find(u => u.id === entanglementEffect.sourceUnitId);
        if (sourceUnit) {
            const targetUnit = newState.units.find(u => u.id === currentActingUnit!.id);
            if (targetUnit) {
                // ダメージ計算: baseDamagePerStack × stackCount
                const baseDamage = entanglementEffect.baseDamagePerStack * (entanglementEffect.stackCount || 1);
                const entanglementDamage = calculateBreakAdditionalDamage(sourceUnit, targetUnit, baseDamage);

                const result = applyUnifiedDamage(
                    newState,
                    sourceUnit,
                    targetUnit,
                    entanglementDamage,
                    {
                        damageType: 'ENTANGLEMENT_DAMAGE',
                        details: `もつれダメージ (スタック: ${entanglementEffect.stackCount})`
                    }
                );
                newState = result.state;
            }
        }
    }

    // ★行動制限デバフ（Crowd Control）処理
    // 凍結、もつれ、禁錮などの行動制限デバフがある場合、ターンをスキップする
    // 優先度: 凍結 > もつれ > 禁錮 (配列順序に依存するため、findで最初に見つかったものを優先とする)
    // ※厳密な優先順位が必要な場合はソートが必要だが、現状は付与順または検索順
    const ccEffect = currentActingUnit!.effects.find(e => isCrowdControlEffect(e)) as BreakStatusEffect | undefined;

    if (ccEffect) {
        // Get the latest state of the acting unit
        let affectedUnit = newState.units.find(u => u.id === currentActingUnit!.id)!;

        // 1. ダメージ処理 (凍結のみここで処理、もつれは別途処理済み)
        if (ccEffect.statusType === 'Freeze') {
            const source = newState.units.find(u => u.id === ccEffect.sourceUnitId);
            if (source) {
                const freezeDamage = calculateBreakAdditionalDamage(source, affectedUnit, 1 * LEVEL_CONSTANT_80);

                const result = applyUnifiedDamage(
                    newState,
                    source,
                    affectedUnit,
                    freezeDamage,
                    {
                        damageType: 'FREEZE_DAMAGE',
                        details: '凍結ダメージ'
                    }
                );
                newState = result.state;

                // Re-fetch affectedUnit as it was modified
                affectedUnit = newState.units.find(u => u.id === affectedUnit.id)!;
            }
        }

        // 2. 持続時間減少
        const updatedCC = { ...ccEffect, duration: ccEffect.duration - 1 };

        // 3. 解除判定 & 解除時効果
        let shouldAdvanceAV = false;
        if (updatedCC.duration <= 0) {
            // Remove effect
            affectedUnit = {
                ...affectedUnit,
                effects: affectedUnit.effects.filter(e => e.id !== ccEffect!.id)
            };

            // 凍結解除時のAV加速
            if (ccEffect.statusType === 'Freeze') {
                shouldAdvanceAV = true;
            }
        } else {
            // Update duration
            affectedUnit = {
                ...affectedUnit,
                effects: affectedUnit.effects.map(e => e.id === ccEffect!.id ? updatedCC : e)
            };
        }

        // Update state with modified unit
        newState = {
            ...newState,
            units: newState.units.map(u => u.id === affectedUnit.id ? affectedUnit : u)
        };

        // 4. Log Turn Skip
        newState = {
            ...newState,
            log: [...newState.log, {
                characterName: affectedUnit.name,
                actionTime: newState.time,
                actionType: 'TurnSkipped',
                details: `${ccEffect.statusType} (Turn Skipped)`,
                sourceId: affectedUnit.id,
                skillPointsAfterAction: newState.skillPoints,
                damageDealt: 0,
                healingDone: 0,
                shieldApplied: 0,
                sourceHpState: `${affectedUnit.hp.toFixed(0)}+${affectedUnit.shield.toFixed(0)}/${affectedUnit.stats.hp.toFixed(0)}`,
                targetHpState: '',
                targetToughness: '',
                currentEp: affectedUnit.ep,
                activeEffects: affectedUnit.effects.map(e => ({
                    name: e.name,
                    duration: e.durationType === 'PERMANENT' ? '∞' : e.duration,
                    stackCount: e.stackCount,
                    owner: e.sourceUnitId
                }))
            } as SimulationLogEntry]
        };

        // 5. Update Turn End State (Duration tick down for other effects, AV reset)
        newState = updateTurnEndState(newState, affectedUnit, { type: 'TURN_SKIP', sourceId: affectedUnit.id, reason: ccEffect.statusType });

        // 6. Advance AV (Freeze only)
        if (shouldAdvanceAV) {
            const updatedUnit = newState.units.find(u => u.id === affectedUnit.id)!;
            // 50% AV Advance
            newState = actionAdvance(newState, updatedUnit.id, FREEZE_REMOVAL_AV_ADVANCE);
        }

        newState = updateActionQueue(newState);

        // ★ 割り込みチェックフェーズ (End of Turn Skip) ★
        newState = checkAndExecuteInterruptingUltimates(newState);

        // Skip normal action determination and dispatch
        return newState;
    }

    // ★ Enemy Turn Start: Recover Toughness ★
    // Moved after DoT/Freeze processing based on user feedback
    if (currentActingUnit!.isEnemy) {
        if (currentActingUnit!.toughness <= 0) {
            // 弱点撃破状態を延長する効果（靭性回復をスキップさせる効果）があるかチェック
            // 例: ルアン・メェの残梅など
            const skipRecovery = currentActingUnit!.effects.some(e => e.tags?.includes('SKIP_TOUGHNESS_RECOVERY'));

            if (!skipRecovery) {
                currentActingUnit = {
                    ...currentActingUnit!,
                    toughness: currentActingUnit!.maxToughness,
                };
                newState = {
                    ...newState,
                    units: newState.units.map(u => u.id === currentActingUnit!.id ? currentActingUnit! : u),
                };
            }
        }
    }

    // 3. Determine Action
    const action = determineNextAction(currentActingUnit!, newState);

    // 4. Dispatch Action
    newState = dispatch(newState, action);

    // ★ 割り込みチェックフェーズ (Post-Action) ★
    // Action execution (including energy gain) may have filled EP to max
    // Check for interrupting ultimates before processing pending actions
    newState = checkAndExecuteInterruptingUltimates(newState);

    // 5. Post-Action Updates
    if (action.type !== 'ULTIMATE' && action.type !== 'FOLLOW_UP_ATTACK') {
        let skipTurnEnd = (action as any).flags?.skipTurnEnd;

        // Check if the unit has PREVENT_TURN_END tag in the NEW state (e.g. applied during action)
        if (!skipTurnEnd && action.type === 'SKILL') {
            const actingUnitInNewState = newState.units.find(u => u.id === currentActingUnit!.id);
            if (actingUnitInNewState) {
                console.log(`[Simulation] Checking Turn End for ${actingUnitInNewState.name}. Effects: ${actingUnitInNewState.effects.map(e => `${e.name}(tags:${e.tags})`).join(', ')}`);
                if (actingUnitInNewState.effects.some(e => e.tags?.includes('PREVENT_TURN_END'))) {
                    skipTurnEnd = true;
                }
            }
        }

        if (!skipTurnEnd) {
            newState = updateTurnEndState(newState, currentActingUnit!, action);
        } else {
            console.log(`[Simulation] Skipping Turn End for ${currentActingUnit!.name} due to skipTurnEnd flag/tag.`);
        }
    }

    // ★ 割り込みチェックフェーズ (End of Turn) ★
    newState = checkAndExecuteInterruptingUltimates(newState);

    // 6. Process Pending Actions
    while (newState.pendingActions.length > 0) {
        const pendingAction = newState.pendingActions.shift();
        if (pendingAction) {
            newState = dispatch(newState, pendingAction);
        }
    }

    return newState;
}

export function runSimulation(config: SimulationConfig): GameState {
    // 1. Initialize State
    let state = createInitialGameState(config);
    const maxActionTime = config.rounds * 100 + 50;

    state.units.forEach(unit => {
        const factory = registry.getCharacterFactory(unit.id);
        if (factory) {
            const { handlerMetadata, handlerLogic } = factory(unit.id, unit.level, unit.eidolonLevel || 0);
            const action: RegisterHandlersAction = {
                type: 'REGISTER_HANDLERS',
                handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
            };
            state = dispatch(state, action);
        }
    });

    // --- Battle Start ---
    const initialHandlers: RegisterHandlersAction['handlers'] = [];
    // (Light Cone / Relic registration omitted for brevity in this fix, can be added back)

    state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: initialHandlers });
    state = dispatch(state, { type: 'BATTLE_START' });

    for (let i = 0; i < MAX_TURNS; i++) {
        const aliveAllies = state.units.filter(u => !u.isEnemy && u.hp > 0);
        const aliveEnemies = state.units.filter(u => u.isEnemy && u.hp > 0);

        // Victory condition: All enemies defeated
        if (aliveEnemies.length === 0) {
            state = {
                ...state,
                result: {
                    ...state.result,
                    outcome: 'victory'
                }
            };
            break;
        }

        // Defeat condition: All allies defeated
        if (aliveAllies.length === 0) {
            state = {
                ...state,
                result: {
                    ...state.result,
                    outcome: 'defeat'
                }
            };
            break;
        }

        // Timeout condition: Reached max action time
        if (state.time >= maxActionTime) {
            state = {
                ...state,
                result: {
                    ...state.result,
                    outcome: 'timeout'
                }
            };
            break;
        }

        state = stepSimulation(state);
    }

    return state;
}
