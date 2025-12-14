import { Character, Enemy, Element, SimulationLogEntry } from '../../types';
import { createInitialGameState } from './gameState';
import { dispatch, publishEvent, applyDamage, applyUnifiedDamage } from './dispatcher';
import { GameState, Unit, CharacterConfig, IEventHandler, IEventHandlerLogic, SimulationConfig, IEventHandlerFactory, Action, RegisterHandlersAction, EventType, IEvent, DoTDamageEvent } from './types';
import { initializeActionQueue, updateActionQueue, advanceTimeline, calculateActionValue, addActionValue } from './actionValue';
import { advanceAction } from './utils';
import { LightConeRegistry, RelicRegistry } from './handlers/registry';
import { createGenericLightConeHandlerFactory } from './handlers/generic';
import { march7thHandlerFactory } from '../../data/characters/march-7th';
import { tribbieHandlerFactory } from '../../data/characters/tribbie';
import { DoTEffect, BreakStatusEffect, IEffect } from '../effect/types';
import { isDoTEffect, isBreakStatusEffect, isCrowdControlEffect } from '../effect/utils';
import { calculateBreakDoTDamage, calculateNormalDoTDamage, calculateBreakAdditionalDamage } from '../damage';
import { LEVEL_CONSTANT_80, FREEZE_REMOVAL_AV_ADVANCE } from './constants';
import * as relicData from '../../data/relics';
import * as ornamentData from '../../data/ornaments';
import { registry } from '../registry';
import { removeEffect, addEffect } from './effectManager';

// Create a lookup map for all relic/ornament sets
const allRelicSets = new Map<string, any>();
Object.values(relicData).forEach((set: any) => allRelicSets.set(set.id, set));
Object.values(ornamentData).forEach((set: any) => allRelicSets.set(set.id, set));

const MAX_TURNS = 500;

// Helper to select target based on Aggro
function selectTarget(units: Unit[]): string {
    if (units.length === 0) return '';

    // Sort logic (optional, but good for deterministic fallback if needed)
    // Calculate total aggro
    const totalAggro = units.reduce((sum, u) => sum + (u.stats.aggro || u.baseStats.aggro || 100), 0);

    // Random value
    const rand = Math.random() * totalAggro;

    let currentSum = 0;
    for (const unit of units) {
        // Use current calculated aggro if available, valid fallback to base or default
        // Note: unit.stats.aggro should be populated by calculateFinalStats
        const unitAggro = unit.stats.aggro || unit.baseStats.aggro || 100;
        currentSum += unitAggro;
        if (rand < currentSum) {
            return unit.id;
        }
    }

    // Fallback (should not reach here unless rounding errors)
    return units[0]?.id || '';
}

function determineNextAction(unit: Unit, state: GameState): Action {
    const { config } = unit;

    if (!config) { // It's an enemy or has no config
        // 召喚物（記憶の精霊など）はターン時に精霊スキルを発動
        if (unit.isSummon) {
            const aliveEnemies = state.units.filter(u => u.isEnemy && u.hp > 0);
            return { type: 'SKILL', sourceId: unit.id, targetId: aliveEnemies[0]?.id };
        }

        // 敵の場合は通常攻撃
        // untargetableフラグがtrueのユニット（龍霊など）はターゲットにならない
        // 記憶の精霊（untargetable: false）はターゲット可能
        const aliveAllies = state.units.filter(u => !u.isEnemy && u.hp > 0 && !u.untargetable);
        const targetId = selectTarget(aliveAllies);
        return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: targetId };
    }

    // 自分のターンで必殺技を使うかどうか（割り込みではない）
    if (unit.id.includes('toukou')) {
        // console.log(`[Debug] determineNextAction for ${unit.name} (${unit.id})`);
    }

    if (unit.ep >= unit.stats.max_ep && unit.ultCooldown === 0 && config.ultStrategy !== 'immediate') {
        if (config.ultStrategy === 'cooldown') { // 'cooldown' 戦略などの場合
            return { type: 'ULTIMATE', sourceId: unit.id };
        }
    }


    const aliveEnemies = state.units.filter(u => u.isEnemy && u.hp > 0);

    // 2. Custom Logic Override (e.g. Archer Continuous Skill)
    if (unit.id === 'archar' && config.rotationMode === 'spam_skill') {
        const circuitBuff = unit.effects.find(e => e.id === `archar-circuit-${unit.id}`);
        const triggerSp = config.spamSkillTriggerSp ?? 4;
        // If in Circuit Connection OR SP >= trigger, force Skill
        if ((circuitBuff || state.skillPoints >= triggerSp) && state.skillPoints >= 2) {
            const ability = unit.abilities.skill;
            // Check for PREVENT_TURN_END tag in buffs
            const preventTurnEnd = unit.effects.some(e => e.tags?.includes('PREVENT_TURN_END'));
            return {
                type: 'SKILL',
                sourceId: unit.id,
                targetId: aliveEnemies[0]?.id, // Default to enemy
                flags: preventTurnEnd ? { skipTurnEnd: true } : undefined
            };
        } else {
            // If condition not met in spam_skill mode, default to Basic Attack immediately
            return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: aliveEnemies[0]?.id };
        }
    }

    // 3. Follow rotation
    const rotation = config.rotation;
    const actionChar = rotation[unit.rotationIndex % rotation.length];

    let targetId = aliveEnemies[0]?.id; // Default to enemy

    // ★ SKILL_SILENCE チェック ★
    // エフェクトに 'SKILL_SILENCE' タグがある場合、スキルを使用できない（強制的に通常攻撃へ）
    const isSkillSilenced = unit.effects.some(e => e.tags?.includes('SKILL_SILENCE'));

    // ★ ENHANCED_BASIC チェック ★
    // エフェクトに 'ENHANCED_BASIC' タグがある場合、通常攻撃が強化通常攻撃に置き換わる
    const hasEnhancedBasic = unit.effects.some(e => e.tags?.includes('ENHANCED_BASIC'));

    if (isSkillSilenced) {
        console.log(`[Simulation] ${unit.name} is silenced (SKILL_SILENCE). Forcing ${hasEnhancedBasic ? 'Enhanced ' : ''}Basic Attack.`);
        if (hasEnhancedBasic && unit.abilities.enhancedBasic) {
            return { type: 'ENHANCED_BASIC_ATTACK', sourceId: unit.id, targetId: targetId };
        }
        return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: targetId };
    }

    if (actionChar === 's' && (state.skillPoints > 0 || unit.isSummon)) {
        const ability = unit.abilities.skill;
        if (ability.targetType === 'ally' || ability.targetType === 'self' || ability.targetType === 'all_allies') {
            targetId = unit.id; // Target self for simplicity by default

            // ★ Manual Target Selection Override ★
            if (config.skillTargetId) {
                const manualTarget = state.units.find(u => u.id === config.skillTargetId);
                // Can target if alive
                if (manualTarget && manualTarget.hp > 0 && !manualTarget.isEnemy) {
                    targetId = manualTarget.id;
                }
            }
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

    // Default to Basic Attack (or Enhanced Basic if tag is present)
    if (hasEnhancedBasic && unit.abilities.enhancedBasic) {
        return { type: 'ENHANCED_BASIC_ATTACK', sourceId: unit.id, targetId: aliveEnemies[0]?.id };
    }
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
            // DoTエフェクトおよびTURN_START_BASEDのバフ/デバフのターン数減算
            if (effect.durationType === 'TURN_START_BASED' && (isDoTEffect(effect) || effect.category === 'BUFF' || effect.category === 'DEBUFF')) {
                return { ...effect, duration: effect.duration - 1 };
            }
            return effect;
        })
        .filter(effect => {
            // DoTエフェクトで期限切れのものを削除
            // DoTエフェクトおよびTURN_START_BASEDのバフ/デバフで期限切れのものを削除
            if (effect.durationType === 'TURN_START_BASED' && (isDoTEffect(effect) || effect.category === 'BUFF' || effect.category === 'DEBUFF')) {
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

    // ★ Buff Duration Management (Turn End) ★
    // Only process TURN_END_BASED effects
    // TURN_START_BASED effects (DoTs) are already processed in Phase 3
    let currentState = state;
    const filteredEffects: typeof unitInNewState.effects = [];

    for (const effect of unitInNewState.effects) {
        if (effect.durationType === 'TURN_END_BASED') {
            // skipFirstTurnDecrementフラグがあり、かつ獲得ターン中の場合はスキップ
            if (effect.skipFirstTurnDecrement && effect.appliedDuringTurnOf === actingUnit.id) {
                // フラグをクリアして次回から減少
                filteredEffects.push({ ...effect, appliedDuringTurnOf: undefined });
                continue;
            }

            const updatedEffect = { ...effect, duration: effect.duration - 1 };

            if (updatedEffect.duration <= 0) {
                // Expired: call remove callback with latest state
                if (effect.remove) {
                    // 最新のユニットを取得してremoveを呼ぶ
                    const freshUnit = currentState.units.find(u => u.id === actingUnit.id)!;
                    currentState = effect.remove(freshUnit, currentState);
                }
                // エフェクトを削除（配列に追加しない）
                continue;
            }

            filteredEffects.push(updatedEffect);
        } else {
            // PERMANENT and TURN_START_BASED are kept unchanged
            filteredEffects.push(effect);
        }
    }

    unitInNewState.effects = filteredEffects;

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

    // ★ターン開始時にAVを設定する方式に変更したため、ここでのAV加算は不要
    // 行動順短縮効果がターン中に適用されるため、ターン終了時にAV加算すると二重加算になる
    return updateActionQueue(nextState);
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

    // ★現在ターン中のユニットIDを設定（バフ獲得ターン減少スキップ判定用）
    newState = {
        ...newState,
        currentTurnOwnerId: currentActingUnit.id
    };

    // ★ターン開始時に次のAVを設定（ゲーム仕様準拠）
    // これにより、行動中に発動する行動順短縮（ダンス・ダンス・ダンス等）が正しく反映される
    // 召喚物を含む全ユニットに適用（召喚物のAV管理バグ修正）
    {
        const baseAV = 10000 / currentActingUnit.stats.spd;
        currentActingUnit = { ...currentActingUnit, actionValue: baseAV };

        // actionQueueも更新
        const queueIdx = newState.actionQueue.findIndex(e => e.unitId === currentActingUnit!.id);
        if (queueIdx !== -1) {
            const newQueue = [...newState.actionQueue];
            newQueue[queueIdx] = { ...newQueue[queueIdx], actionValue: baseAV };
            newState = { ...newState, actionQueue: newQueue };
        }

        // unitsも更新
        newState = {
            ...newState,
            units: newState.units.map(u => u.id === currentActingUnit!.id ? currentActingUnit! : u)
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
                actionType: 'ターンスキップ',
                details: `${ccEffect.statusType} (ターンスキップ)`,
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
            newState = advanceAction(newState, updatedUnit.id, FREEZE_REMOVAL_AV_ADVANCE);
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
            // ★ 弱点撃破回復試行イベントを発火（残梅ハンドラー用）
            newState = publishEvent(newState, {
                type: 'ON_WEAKNESS_BREAK_RECOVERY_ATTEMPT',
                sourceId: currentActingUnit!.id,
                targetId: currentActingUnit!.id
            });

            // 最新状態を取得（ハンドラーで変更された可能性）
            currentActingUnit = newState.units.find(u => u.id === currentActingUnit!.id)!;

            // 残梅のSKIP_TOUGHNESS_RECOVERYタグで回復スキップ判定
            const skipRecovery = currentActingUnit.effects.some(
                e => e.tags?.includes('SKIP_TOUGHNESS_RECOVERY')
            );

            if (!skipRecovery) {
                // 靳性回復
                currentActingUnit = {
                    ...currentActingUnit,
                    toughness: currentActingUnit.maxToughness,
                };

                // 残梅再付与不可マーカーを削除
                const noReapplyEffect = currentActingUnit.effects.find(e => e.name === '残梅再付与不可');
                if (noReapplyEffect) {
                    newState = removeEffect(newState, currentActingUnit.id, noReapplyEffect.id);
                    currentActingUnit = newState.units.find(u => u.id === currentActingUnit!.id)!;
                }

                newState = {
                    ...newState,
                    units: newState.units.map(u => u.id === currentActingUnit!.id ? currentActingUnit! : u),
                };
            } else {
                // ★ 残梅発動時：敵のターンをスキップ
                // 靭性回復がスキップされた場合、敵は行動せずにターン終了
                newState.log.push({
                    actionType: 'ターンスキップ',
                    characterName: currentActingUnit.name,
                    details: '残梅: 弱点撃破状態を維持'
                } as any);

                // ★ 残梅を消費し、再付与不可マーカーを付与
                const zanBaiEffects = currentActingUnit.effects.filter(e =>
                    e.name === '残梅' && e.tags?.includes('SKIP_TOUGHNESS_RECOVERY')
                );
                for (const zanBai of zanBaiEffects) {
                    // 残梅を消費
                    newState = removeEffect(newState, currentActingUnit.id, zanBai.id);

                    // 再付与不可マーカーを付与
                    const noReapplyEffect: IEffect = {
                        id: `ruan-mei-zanbai-no-reapply-${zanBai.sourceUnitId}-${currentActingUnit.id}`,
                        name: '残梅再付与不可',
                        category: 'DEBUFF',
                        sourceUnitId: zanBai.sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,
                        ignoreResistance: true,
                        onApply: (t: Unit, s: GameState) => s,
                        onRemove: (t: Unit, s: GameState) => s,
                        apply: (t: Unit, s: GameState) => s,
                        remove: (t: Unit, s: GameState) => s,
                    };
                    newState = addEffect(newState, currentActingUnit.id, noReapplyEffect);
                }

                // 最新状態を取得
                currentActingUnit = newState.units.find(u => u.id === currentActingUnit!.id)!;

                // ターン終了処理（Action Queueの更新）
                newState = updateTurnEndState(newState, currentActingUnit, { type: 'TURN_SKIP', sourceId: currentActingUnit.id, reason: '残梅' });
                newState = updateActionQueue(newState);

                // 割り込みチェック
                newState = checkAndExecuteInterruptingUltimates(newState);

                return newState;
            }
        }
    }

    // 3. Determine Action
    const action = determineNextAction(currentActingUnit!, newState);

    // 4. Dispatch Action
    newState = dispatch(newState, action);

    // ★ 追加攻撃処理（ターン終了前に実行）★
    // pendingActionsをすべて処理してから必殺技チェックとターン終了処理に進む
    let pendingIterations = 0;
    const MAX_PENDING_ITERATIONS = 50; // 無限ループ防止
    while (newState.pendingActions.length > 0 && pendingIterations < MAX_PENDING_ITERATIONS) {
        const pendingAction = newState.pendingActions[0];
        newState = {
            ...newState,
            pendingActions: newState.pendingActions.slice(1) // イミュータブルに削除
        };
        if (pendingAction) {
            newState = dispatch(newState, pendingAction);
        }
        pendingIterations++;
    }

    // ★ 割り込みチェックフェーズ (全アクション完了後) ★
    // 全アクション（メイン＋追加攻撃）完了後に必殺技チェック
    newState = checkAndExecuteInterruptingUltimates(newState);

    // 5. Post-Action Updates
    if (action.type !== 'ULTIMATE' && action.type !== 'FOLLOW_UP_ATTACK') {
        let skipTurnEnd = (action as any).flags?.skipTurnEnd;

        // Check if the unit has PREVENT_TURN_END tag in the NEW state
        // IMPORTANT: このチェックはアクション完了後（エフェクト削除後）の状態で行う
        const actingUnitInNewState = newState.units.find(u => u.id === currentActingUnit!.id);
        if (actingUnitInNewState) {
            console.log(`[Simulation] Checking Turn End for ${actingUnitInNewState.name}. Effects: ${actingUnitInNewState.effects.map(e => `${e.name}(tags:${e.tags})`).join(', ')}`);

            // 最新のエフェクト状態に基づいて判断
            const hasPREVENT_TURN_END = actingUnitInNewState.effects.some(e => e.tags?.includes('PREVENT_TURN_END'));

            if (hasPREVENT_TURN_END) {
                // バフがまだ存在する場合のみターン終了をスキップ
                skipTurnEnd = true;
            } else if (skipTurnEnd) {
                // アクション中にPREVENT_TURN_ENDバフが削除された場合（回路接続終了など）
                // ターン終了を許可
                console.log(`[Simulation] PREVENT_TURN_END was removed during action for ${actingUnitInNewState.name}. Allowing Turn End.`);
                skipTurnEnd = false;
            }
        }

        if (!skipTurnEnd) {
            // ★ ON_TURN_END イベント発行（ターン終了時のハンドラトリガー）
            newState = publishEvent(newState, { type: 'ON_TURN_END', sourceId: currentActingUnit!.id, value: 0 });
            newState = updateTurnEndState(newState, currentActingUnit!, action);
        } else {
            console.log(`[Simulation] Skipping Turn End for ${currentActingUnit!.name} due to skipTurnEnd flag/tag.`);
        }
    }

    // ★ 割り込みチェックフェーズ (ターン終了後) ★
    newState = checkAndExecuteInterruptingUltimates(newState);

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
