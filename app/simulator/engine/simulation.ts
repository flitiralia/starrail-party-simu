import { Character, Enemy, Element, SimulationLogEntry } from '../../types';
import { createInitialGameState } from './gameState';
import { dispatch, publishEvent, applyDamage, applyUnifiedDamage, appendDamageTaken, appendAdditionalDamage, initializeCurrentActionLog, finalizeEnemyTurnLog } from './dispatcher';
import { GameState, Unit, CharacterConfig, IEventHandler, IEventHandlerLogic, SimulationConfig, IEventHandlerFactory, Action, RegisterHandlersAction, EventType, IEvent, DoTDamageEvent } from './types';
import { UnitId, createUnitId } from './unitId';
import { initializeActionQueue, updateActionQueue, advanceTimeline, calculateActionValue, addActionValue, resetUnitActionValue, setUnitActionValue } from './actionValue';
import { advanceAction } from './utils';
import { LightConeRegistry, RelicRegistry } from './handlers/registry';
import { createGenericLightConeHandlerFactory } from './handlers/generic';
import { march7thHandlerFactory } from '../../data/characters/march-7th';
import { tribbieHandlerFactory } from '../../data/characters/tribbie';
import { DoTEffect, BreakStatusEffect, IEffect } from '../effect/types';
import { isDoTEffect, isBreakStatusEffect, isCrowdControlEffect } from '../effect/utils';
import { calculateBreakDoTDamage, calculateNormalDoTDamage, calculateBreakAdditionalDamage, calculateNormalDoTDamageWithBreakdown, calculateBreakDoTDamageWithBreakdown } from '../damage';
import { LEVEL_CONSTANT_80, FREEZE_REMOVAL_AV_ADVANCE } from './constants';
import * as relicData from '../../data/relics';
import * as ornamentData from '../../data/ornaments';
import { registry } from '../registry';
import { removeEffect, addEffect } from './effectManager';

// Create a lookup map for all relic/ornament sets
import { RelicSet, OrnamentSet } from '../../types/relic';
type AnyRelicSet = RelicSet | OrnamentSet;
const allRelicSets = new Map<string, AnyRelicSet>();
Object.values(relicData).forEach((set) => {
    if (typeof set === 'object' && set !== null && 'id' in set) {
        allRelicSets.set((set as AnyRelicSet).id, set as AnyRelicSet);
    }
});
Object.values(ornamentData).forEach((set) => {
    if (typeof set === 'object' && set !== null && 'id' in set) {
        allRelicSets.set((set as AnyRelicSet).id, set as AnyRelicSet);
    }
});

const MAX_TURNS = 500;

/**
 * ターン終了条件をチェックする
 * currentTurnStateの終了条件のいずれかを満たしたらターン終了
 * @returns shouldEndTurn: ターン終了すべきか, 更新後のstate
 */
function checkTurnEndConditions(state: GameState): { shouldEndTurn: boolean; state: GameState } {
    const turnState = state.currentTurnState;

    // currentTurnStateがない、またはskipTurnEndがfalseの場合はターン終了
    if (!turnState || !turnState.skipTurnEnd) {
        return { shouldEndTurn: true, state };
    }

    // アクションカウント更新
    const newActionCount = turnState.actionCount + 1;

    // いずれかの条件を満たしたらターン終了（OR条件）
    for (const cond of turnState.endConditions) {
        switch (cond.type) {
            case 'action_count':
                if (newActionCount >= (cond.actionCount || 1)) {
                    console.log(`[Simulation] Turn end: action_count condition met (${newActionCount}/${cond.actionCount})`);
                    return {
                        shouldEndTurn: true,
                        state: { ...state, currentTurnState: undefined }
                    };
                }
                break;
            case 'sp_threshold':
                if (state.skillPoints < (cond.spThreshold || 0)) {
                    console.log(`[Simulation] Turn end: sp_threshold condition met (SP: ${state.skillPoints} < ${cond.spThreshold})`);
                    return {
                        shouldEndTurn: true,
                        state: { ...state, currentTurnState: undefined }
                    };
                }
                break;
        }
    }

    // 条件未達成：ターン継続、アクションカウントを更新
    console.log(`[Simulation] Continue action: conditions not met (actionCount: ${newActionCount})`);
    return {
        shouldEndTurn: false,
        state: {
            ...state,
            currentTurnState: { ...turnState, actionCount: newActionCount }
        }
    };
}


// Helper to select target based on Aggro
function selectTarget(units: Unit[]): UnitId | '' {
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
            const aliveEnemies = state.registry.getAliveEnemies();
            return { type: 'SKILL', sourceId: unit.id, targetId: aliveEnemies[0]?.id };
        }

        // 敵の場合は通常攻撃
        // untargetableフラグがtrueのユニット（龍霊など）はターゲットにならない
        // 記憶の精霊（untargetable: false）はターゲット可能
        const aliveAllies = state.registry.getAliveAllies().filter(u => !u.untargetable);
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


    const aliveEnemies = state.registry.getAliveEnemies();

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
                const manualTarget = state.registry.get(createUnitId(config.skillTargetId));
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
    // キャラクターのみ（召喚物除く）を対象にするのが安全だが、元のロジックに合わせてAliveAlliesを使用
    // filter(u => !u.isSummon) を追加して明示的にキャラクターのみにする
    const characters = newState.registry.getAliveAllies().filter(u => !u.isSummon);
    const epLog = characters.map(c => `${c.name}:${c.ep.toFixed(1)}/${c.stats.max_ep.toFixed(0)}`).join(', ');
    console.log(`ultimate check [${epLog}]`);

    // Limit recursion/loops to prevent infinite Ultimate chains if something is broken
    // In a real game, multiple Ultimates can happen. We'll allow a reasonable number per check.
    for (let i = 0; i < 10; i++) {
        const characters = newState.registry.getAliveAllies().filter(u => !u.isSummon);
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



function processDoTDamage(state: GameState, actingUnitId: UnitId): GameState {
    const actingUnit = state.registry.get(actingUnitId);
    if (!actingUnit) return state;

    let newState = state;

    // TURN_START_BASEDかつtype='DoT'のエフェクトを処理
    const dotEffects = actingUnit.effects.filter(
        effect => effect.durationType === 'TURN_START_BASED' && isDoTEffect(effect)
    ) as DoTEffect[];

    for (const dotEffect of dotEffects) {
        // ソースユニットを取得
        const sourceUnit = state.registry.get(createUnitId(dotEffect.sourceUnitId));
        if (!sourceUnit) continue;

        // ターゲットの状態を再取得（前のDoTで死んでいる等の可能性があるため）
        const targetUnit = state.registry.get(actingUnitId);
        if (!targetUnit) continue;

        // ★DoTダメージ計算: キャラクター由来と弱点撃破で分岐
        let baseDamage: number;
        let dotResult: { damage: number; isCrit: boolean; breakdownMultipliers?: any };

        if (dotEffect.damageCalculation === 'multiplier') {
            // キャラクターDoT: 倍率 × 現在のATK
            baseDamage = sourceUnit.stats.atk * (dotEffect.multiplier || 0);
            console.log(`[DoT Damage] ${dotEffect.name} from ${sourceUnit.name}: baseDamage = ${sourceUnit.stats.atk} * ${dotEffect.multiplier} = ${baseDamage}`);

            // キャラクター由来DoTはcalculateNormalDoTDamageWithBreakdownを使用
            dotResult = calculateNormalDoTDamageWithBreakdown(sourceUnit, targetUnit, baseDamage);
            console.log(`[DoT Damage] ${dotEffect.name}: calculateNormalDoTDamage result = ${dotResult.damage}`);
        } else {
            // 弱点撃破DoT: 固定ダメージ値
            baseDamage = dotEffect.baseDamage || 0;
            console.log(`[DoT Damage] ${dotEffect.name} from ${sourceUnit.name}: baseDamage (fixed) = ${baseDamage}`);

            // 弱点撃破DoTはcalculateBreakDoTDamageWithBreakdownを使用
            dotResult = calculateBreakDoTDamageWithBreakdown(sourceUnit, targetUnit, baseDamage);
            console.log(`[DoT Damage] ${dotEffect.name}: calculateBreakDoTDamage result = ${dotResult.damage}`);
        }

        const result = applyUnifiedDamage(
            newState,
            sourceUnit,
            targetUnit,
            dotResult.damage,
            {
                damageType: 'DOT_DAMAGE',
                details: `${dotEffect.name}ダメージ`,
                skipLog: true,   // ★敵ターンのログにまとめるため独立ログは出さない
                skipStats: false,
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

        // ★ ログへの追加: 敵のターンなら「被ダメージ」、味方のターンなら「付加ダメージ」
        // 敵視点: DoTは敵が「受けた」ダメージ
        // 味方視点: DoTは味方が敵に「与えた」ダメージ
        if (targetUnit.isEnemy) {
            // 敵のターン開始時: 敵の被ダメージとして記録
            newState = appendDamageTaken(newState, {
                source: sourceUnit.name,
                type: 'dot',
                damage: dotResult.damage,
                dotType: dotEffect.name,
                breakdownMultipliers: dotResult.breakdownMultipliers
            });
        } else {
            // 味方のターン開始時（味方がDoTを受ける場合）: 味方の被ダメージとして記録
            newState = appendDamageTaken(newState, {
                source: sourceUnit.name,
                type: 'dot',
                damage: dotResult.damage,
                dotType: dotEffect.name,
                breakdownMultipliers: dotResult.breakdownMultipliers
            });
        }
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
    const actingUnit = state.registry.get(createUnitId(actingUnitId));
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
        registry: newState.registry.update(createUnitId(actingUnitId), u => ({ ...u, effects: updatedUnit.effects }))
    };
}

function updateTurnEndState(state: GameState, actingUnit: Unit, action: Action): GameState {
    const unitInNewState = state.registry.get(createUnitId(actingUnit.id));
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
                    const freshUnit = currentState.registry.get(createUnitId(actingUnit.id))!;
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
    // Update state with modified unit
    const nextState = {
        ...state,
        registry: state.registry.update(createUnitId(unitInNewState.id), u => ({
            ...u,
            rotationIndex: unitInNewState.rotationIndex,
            ultCooldown: unitInNewState.ultCooldown,
            effects: unitInNewState.effects
        }))
    };

    // Update cooldowns (need to do this separately as updateUnit doesn't handle cooldowns)
    const finalState = {
        ...nextState,
        cooldowns: newCooldowns
    };

    // ★ターン開始時にAVを設定する方式に変更したため、ここでのAV加算は不要
    // 行動順短縮効果がターン中に適用されるため、ターン終了時にAV加算すると二重加算になる
    return updateActionQueue(nextState);
}

export function stepSimulation(state: GameState): GameState {
    // 1. Advance Timeline
    // Find the unit with the lowest Action Value
    if (state.actionQueue.length === 0) {
        state = { ...state, actionQueue: initializeActionQueue(state.registry.toArray()) };
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
    let currentActingUnit = newState.registry.get(createUnitId(nextEntry.unitId));
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
    newState = resetUnitActionValue(newState, currentActingUnit.id);
    // リセット後のユニットを再取得
    currentActingUnit = newState.registry.get(currentActingUnit.id as UnitId)!;

    // 1. Trigger ON_TURN_START (DoTs trigger here)
    // IMPORTANT: This must fire for ALL units, not just frozen ones
    newState = publishEvent(newState, { type: 'ON_TURN_START', sourceId: currentActingUnit.id, value: 0 });

    // ★敵のターンの場合、アクションログを初期化（DoT被ダメージを記録するため）
    if (currentActingUnit.isEnemy) {
        newState = initializeCurrentActionLog(newState, currentActingUnit.id, currentActingUnit.name, 'ターン開始');
    }

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
        const sourceUnit = newState.registry.get(createUnitId(entanglementEffect.sourceUnitId));
        if (sourceUnit) {
            const targetUnit = newState.registry.get(createUnitId(currentActingUnit!.id));
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
                        details: `もつれダメージ (スタック: ${entanglementEffect.stackCount})`,
                        skipLog: true  // 独立ログなし
                    }
                );
                newState = result.state;
            }
        }
    }

    // ★敵のターンの場合、DoT被ダメージを含んだcurrentActionLogは維持
    // アクション処理（dispatch）後にログが最終化されるため、ここでは最終化しない

    // ★行動制限デバフ（Crowd Control）処理
    // 凍結、もつれ、禁錮などの行動制限デバフがある場合、処理順序：
    // 1. 付加ダメージ処理
    // 2. 効果時間減少
    // 3. duration > 0 ならターンスキップ、0以下なら効果解除して通常行動
    const ccEffect = currentActingUnit!.effects.find(e => isCrowdControlEffect(e)) as BreakStatusEffect | undefined;

    if (ccEffect) {
        // Get the latest state of the acting unit
        let affectedUnit = newState.registry.get(createUnitId(currentActingUnit!.id))!;

        // 1. ダメージ処理 (凍結のみここで処理、もつれは別途処理済み)
        if (ccEffect.statusType === 'Freeze') {
            const source = newState.registry.get(createUnitId(ccEffect.sourceUnitId));
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
                affectedUnit = newState.registry.get(createUnitId(affectedUnit.id))!;
            }
        }

        // 2. 持続時間減少
        const newDuration = ccEffect.duration - 1;
        const updatedCC = { ...ccEffect, duration: newDuration };

        // 3. 解除判定（duration <= 0 なら解除、それ以外は更新）
        let shouldAdvanceAV = false;
        if (newDuration <= 0) {
            // 効果解除
            affectedUnit = {
                ...affectedUnit,
                effects: affectedUnit.effects.filter(e => e.id !== ccEffect!.id)
            };

            // 凍結解除時のAV加速フラグ
            if (ccEffect.statusType === 'Freeze') {
                shouldAdvanceAV = true;
            }

            // Update state with modified unit
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(affectedUnit.id), u => affectedUnit)
            };

            // AV加速（凍結解除時のみ）
            if (shouldAdvanceAV) {
                const updatedUnit = newState.registry.get(createUnitId(affectedUnit.id))!;
                newState = advanceAction(newState, updatedUnit.id, FREEZE_REMOVAL_AV_ADVANCE);
            }

            // ★ 効果解除後は通常行動に進む（return しない）
            // 以降の通常行動処理へ続く
        } else {
            // 効果継続：duration を更新
            affectedUnit = {
                ...affectedUnit,
                effects: affectedUnit.effects.map(e => e.id === ccEffect!.id ? updatedCC : e)
            };

            // Update state with modified unit
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(affectedUnit.id), u => affectedUnit)
            };

            // ターンスキップログ
            newState = {
                ...newState,
                log: [...newState.log, {
                    characterName: affectedUnit.name,
                    actionTime: newState.time,
                    actionType: 'ターンスキップ',
                    details: `${ccEffect.statusType} (ターンスキップ、残り${newDuration}ターン)`,
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

            // ターン終了処理（他のエフェクトの時間減少、AV リセット）
            newState = updateTurnEndState(newState, affectedUnit, { type: 'TURN_SKIP', sourceId: affectedUnit.id, reason: ccEffect.statusType });

            newState = updateActionQueue(newState);

            // ★ 割り込みチェックフェーズ (End of Turn Skip) ★
            newState = checkAndExecuteInterruptingUltimates(newState);

            // ターンスキップ：通常行動をスキップして終了
            return newState;
        }
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
            currentActingUnit = newState.registry.get(currentActingUnit!.id)!;

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
                    currentActingUnit = newState.registry.get(currentActingUnit!.id)!;
                }

                newState = {
                    ...newState,
                    registry: newState.registry.update(createUnitId(currentActingUnit!.id), u => currentActingUnit!)
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
                currentActingUnit = newState.registry.get(createUnitId(currentActingUnit!.id))!;

                // ターン終了処理（Action Queueの更新）
                newState = updateTurnEndState(newState, currentActingUnit, { type: 'TURN_SKIP', sourceId: currentActingUnit.id, reason: '残梅' });
                newState = updateActionQueue(newState);

                // 割り込みチェック
                newState = checkAndExecuteInterruptingUltimates(newState);

                return newState;
            }
        }
    }

    // ★ アクション実行ループ ★
    // PREVENT_TURN_END タグがある限り、同一ターン内で連続行動
    let continueAction = true;
    let actionIterations = 0;
    const MAX_ACTION_ITERATIONS = 20; // 無限ループ防止（アーチャーは最大5回）
    let lastAction: Action | null = null;

    while (continueAction && actionIterations < MAX_ACTION_ITERATIONS) {
        actionIterations++;

        // 最新のユニット状態を取得
        currentActingUnit = newState.registry.get(currentActingUnit!.id)!;

        // 3. Determine Action
        const action = determineNextAction(currentActingUnit!, newState);
        lastAction = action;

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
            // ★ 新しいcurrentTurnStateベースのチェック
            const turnEndCheck = checkTurnEndConditions(newState);
            newState = turnEndCheck.state;

            if (turnEndCheck.shouldEndTurn) {
                // 後方互換性: PREVENT_TURN_ENDタグもチェック
                const actingUnitInNewState = newState.registry.get(currentActingUnit!.id);
                const hasPREVENT_TURN_END = actingUnitInNewState?.effects.some(e => e.tags?.includes('PREVENT_TURN_END'));

                if (hasPREVENT_TURN_END) {
                    // 旧方式のPREVENT_TURN_ENDタグがある場合は継続
                    console.log(`[Simulation] ${currentActingUnit!.name} continues action (legacy PREVENT_TURN_END tag)...`);
                    continueAction = true;
                } else {
                    // ターン終了: ループを抜ける
                    continueAction = false;
                }
            } else {
                // 連続行動: ループを継続
                console.log(`[Simulation] ${currentActingUnit!.name} continues action (iteration ${actionIterations})...`);
                continueAction = true;
            }
        } else {
            // ULTIMATE や FOLLOW_UP_ATTACK の場合はループを抜けない（次のアクションを待つ）
            // ただし、メインアクションが完了している場合は抜ける
            continueAction = false;
        }
    }

    // ★ ターン終了処理 ★
    if (lastAction && lastAction.type !== 'ULTIMATE' && lastAction.type !== 'FOLLOW_UP_ATTACK') {
        // ★ ON_TURN_END イベント発行（ターン終了時のハンドラトリガー）
        newState = publishEvent(newState, { type: 'ON_TURN_END', sourceId: currentActingUnit!.id, value: 0 });
        newState = updateTurnEndState(newState, currentActingUnit!, lastAction);
    }

    // ★ 割り込みチェックフェーズ (ターン終了後) ★
    newState = checkAndExecuteInterruptingUltimates(newState);

    return newState;
}


export function runSimulation(config: SimulationConfig): GameState {
    // 1. Initialize State
    let state = createInitialGameState(config);
    const maxActionTime = config.rounds * 100 + 50;

    state.registry.toArray().forEach(unit => {
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
        const aliveAllies = state.registry.getAliveAllies();
        const aliveEnemies = state.registry.getAliveEnemies();

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
