import { Character, Enemy, Element, SimulationLogEntry, EnemyData } from '../../types';
import { createInitialGameState } from './gameState';
import { dispatch, publishEvent, applyDamage, applyUnifiedDamage, appendDamageTaken, appendAdditionalDamage, initializeCurrentActionLog, finalizeEnemyTurnLog, finalizeSpiritTurnLog } from './dispatcher';
import { GameState, Unit, CharacterConfig, IEventHandler, IEventHandlerLogic, SimulationConfig, IEventHandlerFactory, Action, RegisterHandlersAction, EventType, IEvent, DoTDamageEvent, SkillAction } from './types';
import { UnitId, createUnitId } from './unitId';
import { initializeActionQueue, updateActionQueue, advanceTimeline, calculateActionValue, addActionValue, resetUnitActionValue, setUnitActionValue } from './actionValue';
import { advanceAction } from './utils';
import { LightConeRegistry, RelicRegistry } from './handlers/registry';
import { createGenericLightConeHandlerFactory } from './handlers/generic';
import { march7thHandlerFactory } from '../../data/characters/march-7th';
import { tribbieHandlerFactory } from '../../data/characters/tribbie';
import { DoTEffect, BreakStatusEffect, IEffect, CrowdControlEffect, TauntEffect } from '../effect/types';
import { isDoTEffect, isBreakStatusEffect, isCrowdControlEffect, isNewCrowdControlEffect, isTauntEffect } from '../effect/utils';
import { calculateBreakDoTDamage, calculateNormalDoTDamage, calculateBreakAdditionalDamage, calculateNormalDoTDamageWithBreakdown, calculateBreakDoTDamageWithBreakdown } from '../damage';
import { createEnemyEntanglementEffect } from '../effect/breakEffects';
import { LEVEL_CONSTANT_80, FREEZE_REMOVAL_AV_ADVANCE } from './constants';
import * as relicData from '../../data/relics';
import * as ornamentData from '../../data/ornaments';
import { registry } from '../registry';
import { removeEffect, addEffect } from './effectManager';
import { getAccumulatedValue } from './accumulator';
import { recalculateUnitStats } from '../statBuilder';

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


/**
 * 敵のターゲット選択（aggro重み付きランダム）
 * @param actingEnemy 行動中の敵ユニット
 * @param units ターゲット候補の味方ユニット群
 */
function selectTarget(actingEnemy: Unit, units: Unit[]): UnitId | '' {
    if (units.length === 0) return '';

    // ★挑発チェック: TauntEffectがあれば強制的にそのターゲットを攻撃
    const tauntEffect = actingEnemy.effects.find(e => isTauntEffect(e)) as TauntEffect | undefined;
    if (tauntEffect) {
        const forcedTarget = units.find(u => u.id === tauntEffect.targetAllyId);
        if (forcedTarget && forcedTarget.hp > 0) {
            console.log(`[selectTarget] ${actingEnemy.name} is taunted to attack ${forcedTarget.name}`);
            return forcedTarget.id;
        }
        // 挑発対象が死亡している場合は通常のaggro選択にフォールバック
        console.log(`[selectTarget] Taunt target not found or dead, falling back to aggro selection`);
    }

    // 通常のaggro重み付きランダム選択
    const totalAggro = units.reduce((sum, u) => sum + (u.stats.aggro || u.baseStats.aggro || 100), 0);
    const rand = Math.random() * totalAggro;

    let currentSum = 0;
    for (const unit of units) {
        const unitAggro = unit.stats.aggro || unit.baseStats.aggro || 100;
        currentSum += unitAggro;
        if (rand < currentSum) {
            return unit.id;
        }
    }

    // Fallback (should not reach here unless rounding errors)
    return units[0]?.id || '';
}

/**
 * 味方が敵をターゲットする際のデフォルト選択
 * 最も現在HPの高い敵を優先して狙う
 * @param enemies 生存中の敵ユニット群
 * @returns 最も体力の高い敵のID、敵がいない場合は空文字
 */
function selectEnemyTarget(enemies: Unit[]): UnitId | '' {
    if (enemies.length === 0) return '';

    // HPが最も高い敵を選択
    const sortedByHP = [...enemies].sort((a, b) => b.hp - a.hp);
    return sortedByHP[0].id;
}

/**
 * 敵スキル実行後の共通処理
 * - ロックオン設定/解除
 * - もつれ等デバフ付与
 * - 統合ログへの記録
 * 
 * @param state 現在のGameState
 * @param enemy 実行した敵ユニット
 * @param action 実行したアクション（abilityId から EnemySkill を特定）
 * @returns 更新された GameState
 */
function handleEnemySkillPostEffects(
    state: GameState,
    enemy: Unit,
    action: Action
): GameState {
    let newState = state;

    // SKILLアクション以外は処理しない
    if (action.type !== 'SKILL') return newState;

    const skillAction = action as SkillAction;
    const abilityId = skillAction.abilityId;

    // abilityId が無い、または enemySkills が無い場合はスキップ
    if (!abilityId || !enemy.enemySkills) return newState;

    const skill = enemy.enemySkills[abilityId];
    if (!skill) return newState;

    const targetId = skillAction.targetId;
    if (!targetId) return newState;

    const targetUnit = newState.registry.get(targetId as UnitId);
    if (!targetUnit) return newState;

    // ★ロックオン処理
    if (skill.targetType === 'lock_on') {
        // ロックオンを設定
        newState = {
            ...newState,
            registry: newState.registry.update(enemy.id as UnitId, u => ({
                ...u,
                lockedTargetId: targetId as UnitId
            }))
        };
        // ログに記録
        const detailMsg = `${skill.name}でロックオン: ${targetUnit.name}`;
        if (newState.currentActionLog) {
            const prevDetails = newState.currentActionLog.details || '';
            newState = {
                ...newState,
                currentActionLog: {
                    ...newState.currentActionLog,
                    details: (prevDetails ? prevDetails + ' ' : '') + detailMsg
                }
            };
        } else if (newState.log.length > 0) {
            // dispatch完了後は最後のエントリに追記
            const lastLog = { ...newState.log[newState.log.length - 1] };
            if (lastLog.sourceId === enemy.id) {
                lastLog.details = (lastLog.details ? lastLog.details + ' ' : '') + detailMsg;
                // イミュータブルに更新
                newState = {
                    ...newState,
                    log: [...newState.log.slice(0, -1), lastLog]
                };
            }
        }
        console.log(`[handleEnemySkillPostEffects] ${enemy.name} locked on to ${targetUnit.name}`);
    } else {
        // ロックオン以外のスキル使用時：ロックオンをクリア（攻撃を実行したため）
        const currentEnemy = newState.registry.get(enemy.id as UnitId);
        if (currentEnemy?.lockedTargetId) {
            newState = {
                ...newState,
                registry: newState.registry.update(enemy.id as UnitId, u => ({
                    ...u,
                    lockedTargetId: undefined
                }))
            };
            console.log(`[handleEnemySkillPostEffects] ${enemy.name} cleared lock-on after attacking`);
        }
    }

    // ★もつれ付与処理
    if (skill.debuffType === 'Entanglement' && skill.entanglementParams && !targetUnit.isEnemy) {
        const baseChance = skill.baseChance ?? 1.0;
        const effectRes = targetUnit.stats.effect_res ?? 0;
        const sourceEffectHit = enemy.stats.effect_hit_rate ?? 0;
        const successChance = baseChance * (1 + sourceEffectHit) * (1 - effectRes);

        if (Math.random() < successChance) {
            const entanglementEffect = createEnemyEntanglementEffect(
                enemy,
                targetUnit,
                skill.entanglementParams.actionDelay,
                skill.entanglementParams.delayedDmgMultiplier
            );
            newState = addEffect(newState, targetId, entanglementEffect);
            console.log(`[handleEnemySkillPostEffects] Applied Entanglement to ${targetUnit.name}`);

            // ログに記録
            const detailMsg = `もつれ付与: ${targetUnit.name}`;
            if (newState.currentActionLog) {
                const prevDetails = newState.currentActionLog.details || '';
                newState = {
                    ...newState,
                    currentActionLog: {
                        ...newState.currentActionLog,
                        details: (prevDetails ? prevDetails + ' ' : '') + detailMsg
                    }
                };
            } else if (newState.log.length > 0) {
                // dispatch完了後は最後のエントリに追記
                const lastLog = { ...newState.log[newState.log.length - 1] };
                if (lastLog.sourceId === enemy.id) {
                    lastLog.details = (lastLog.details ? lastLog.details + ' ' : '') + detailMsg;
                    // イミュータブルに更新
                    newState = {
                        ...newState,
                        log: [...newState.log.slice(0, -1), lastLog]
                    };
                }
            }
        } else {
            console.log(`[handleEnemySkillPostEffects] Entanglement resisted by ${targetUnit.name}`);
        }
    }

    return newState;
}

function determineNextAction(unit: Unit, state: GameState): Action {
    const { config } = unit;

    console.log(`[determineNextAction Debug] unit=${unit.name}, isSummon=${unit.isSummon}, hasConfig=${!!config}`);

    if (!config) { // It's an enemy or has no config
        // 召喚物（記憶の精霊など）の処理
        if (unit.isSummon) {
            // ★ ENHANCED_SKILL チェック ★
            // エフェクトに 'ENHANCED_SKILL' タグがある場合、強化スキル（味方対象）を発動
            const enhancedSkillEffect = unit.effects.find(e => e.tags?.includes('ENHANCED_SKILL'));
            if (enhancedSkillEffect) {
                // 味方対象の強化スキルを発動
                const aliveAllies = state.registry.getAliveAllies().filter(u => u.id !== unit.id && !u.isEnemy);
                let allyTargetId = aliveAllies[0]?.id || unit.ownerId || unit.id;

                // オーナーのconfig.skillTargetIdを参照
                console.log(`[Simulation Debug] unit.ownerId=${unit.ownerId}`);
                const owner = unit.ownerId ? state.registry.get(createUnitId(unit.ownerId)) : null;
                console.log(`[Simulation Debug] owner=${owner?.name}, owner.config=${JSON.stringify(owner?.config)}`);
                const ownerSkillTargetId = owner?.config?.skillTargetId;
                console.log(`[Simulation Debug] ownerSkillTargetId=${ownerSkillTargetId}`);

                if (ownerSkillTargetId) {
                    // ユーザー指定のターゲットを使用
                    const manualTarget = state.registry.get(createUnitId(ownerSkillTargetId));
                    if (manualTarget && manualTarget.hp > 0 && !manualTarget.isEnemy) {
                        allyTargetId = manualTarget.id;
                        console.log(`[Simulation] ${unit.name} (Summon) using ENHANCED_SKILL targeting user-specified ${allyTargetId}`);
                    } else {
                        // 指定ターゲットが無効な場合、最もATKが高い味方をフォールバック
                        const sortedAllies = [...aliveAllies].sort((a, b) => b.stats.atk - a.stats.atk);
                        if (sortedAllies.length > 0) {
                            allyTargetId = sortedAllies[0].id;
                        }
                        console.log(`[Simulation] ${unit.name} (Summon) using ENHANCED_SKILL targeting highest ATK ${allyTargetId} (manual target invalid)`);
                    }
                } else {
                    // 指定なし：最もATKが高い味方をターゲット
                    const sortedAllies = [...aliveAllies].sort((a, b) => b.stats.atk - a.stats.atk);
                    if (sortedAllies.length > 0) {
                        allyTargetId = sortedAllies[0].id;
                    }
                    console.log(`[Simulation] ${unit.name} (Summon) using ENHANCED_SKILL targeting highest ATK ${allyTargetId} (no manual target)`);
                }

                return {
                    type: 'SKILL',
                    sourceId: unit.id,
                    targetId: allyTargetId,
                    abilityId: 'murion-support-skill',
                    isAdditional: true,
                    skipTalentTrigger: true
                };
            }

            // 通常の精霊スキル（敵対象）
            const aliveEnemies = state.registry.getAliveEnemies();
            console.log(`[Simulation] ${unit.name} (Summon) using normal SKILL targeting enemy`);
            return { type: 'SKILL', sourceId: unit.id, targetId: selectEnemyTarget(aliveEnemies) };
        }

        // 敵の行動ロジック
        // untargetableフラグがtrueのユニット（龍霊など）はターゲットにならない
        // 記憶の精霊（untargetable: false）はターゲット可能
        const aliveAllies = state.registry.getAliveAllies().filter(u => !u.untargetable);
        let targetId = selectTarget(unit, aliveAllies); // デフォルトターゲット

        // ★ロックオン中のターゲットがいれば優先
        if (unit.lockedTargetId) {
            const lockedTarget = state.registry.get(unit.lockedTargetId);
            if (lockedTarget && lockedTarget.hp > 0) {
                targetId = unit.lockedTargetId;
                console.log(`[determineNextAction] Enemy ${unit.name} targeting locked target: ${lockedTarget.name}`);
            }
        }

        // EnemyData型にキャストしてactionPatternにアクセスする
        const enemyData = unit as unknown as Partial<EnemyData>;

        // ★新しいturnPatternsシステム
        if (enemyData.turnPatterns && enemyData.turnPatterns.length > 0 && enemyData.enemySkills) {
            const patternIndex = (unit.rotationIndex || 0) % enemyData.turnPatterns.length;
            const pattern = enemyData.turnPatterns[patternIndex];
            const primarySkill = enemyData.enemySkills[pattern.primary];

            console.log(`[determineNextAction] Enemy ${unit.name} using turnPattern[${patternIndex}]: primary=${pattern.primary}, secondary=${pattern.secondary || 'none'}`);

            if (!primarySkill) {
                console.log(`[determineNextAction] Warning: primarySkill '${pattern.primary}' not found`);
                return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: targetId };
            }

            // ★2ndアクション（secondary）をpendingActionsに追加
            if (pattern.secondary && enemyData.enemySkills[pattern.secondary]) {
                const secondarySkill = enemyData.enemySkills[pattern.secondary];
                // 2ndアクションをpendingActionsに追加（state更新は後でdispatch後に行う）
                // ここではaction.flagsに情報を付加してdispatcher側で処理する
                // Note: GameState更新はdetermineNextAction内では行えないため、
                // 呼び出し元(stepSimulation)で処理する必要がある
                console.log(`[determineNextAction] Secondary skill '${secondarySkill.name}' will be queued`);
            }

            // プライマリースキルのターゲットタイプに応じてアクションを返す
            if (primarySkill.targetType === 'lock_on') {
                // ロックオンスキル: ターゲットをロックし、スキルアクションとして扱う
                console.log(`[determineNextAction] LockOn skill: ${primarySkill.name} targeting ${targetId}`);
                return {
                    type: 'SKILL',
                    sourceId: unit.id,
                    targetId: targetId,
                    abilityId: primarySkill.id
                };
            } else {
                // 通常のダメージスキル
                return {
                    type: 'SKILL',
                    sourceId: unit.id,
                    targetId: targetId,
                    abilityId: primarySkill.id
                };
            }
        }

        // 1. 旧システム: 行動パターン（actionPattern）がある場合
        if (enemyData.actionPattern && enemyData.actionPattern.length > 0) {
            // 現在のターン数（またはrotationIndex）に基づいて行動を決定
            // 敵もrotationIndexを持っているのでそれを使用する
            const patternIndex = (unit.rotationIndex || 0) % enemyData.actionPattern.length;
            const actionType = enemyData.actionPattern[patternIndex];

            console.log(`[determineNextAction] Enemy ${unit.name} using pattern[${patternIndex}]: ${actionType}`);

            if (actionType === 'Skill') {
                return { type: 'SKILL', sourceId: unit.id, targetId: targetId };
            } else if (actionType === 'Ultimate') {
                // 必殺技（敵の必殺技も通常ターン消費型として扱う場合）
                return { type: 'ULTIMATE', sourceId: unit.id, targetId: targetId };
            } else {
                // デフォルトまたは 'Basic ATK'
                return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: targetId };
            }
        }

        // 2. 行動パターンがない場合（ランダム or デフォルト）
        // 現状はすべて 'BASIC_ATTACK' とするが、将来的には abilities から選択可能にする
        // サンプルボスなどはスキルを持っているため、ランダム使用ロジックなどをここに追加可能

        // 簡易AI: 30%の確率でスキルを使用（スキルがある場合）
        if (unit.abilities.skill && Math.random() < 0.3) {
            console.log(`[determineNextAction] Enemy ${unit.name} randomly selected SKILL`);
            return { type: 'SKILL', sourceId: unit.id, targetId: targetId };
        }

        return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: targetId };
    }

    // 自分のターンで必殺技を使うかどうか（割り込みではない）
    if (unit.id.includes('toukou')) {
        // console.log(`[Debug] determineNextAction for ${unit.name} (${unit.id})`);
    }

    if (unit.ep >= (unit.stats.max_ep ?? 0) && unit.ultCooldown === 0 && config.ultStrategy !== 'immediate') {
        if (config.ultStrategy === 'cooldown') { // 'cooldown' 戦略などの場合
            return { type: 'ULTIMATE', sourceId: unit.id };
        }
    }


    const aliveEnemies = state.registry.getAliveEnemies();

    // 2. Custom Logic Override (e.g. Archer Continuous Skill)
    if (unit.id.startsWith('archar') && config.rotationMode === 'spam_skill') {
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
                targetId: selectEnemyTarget(aliveEnemies), // 最もHPの高い敵を狙う
                flags: preventTurnEnd ? { skipTurnEnd: true } : undefined
            };
        } else {
            // If condition not met in spam_skill mode, default to Basic Attack immediately
            return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: selectEnemyTarget(aliveEnemies) };
        }
    }

    // 3. Once Skill Mode: Skill only on first turn (rotationIndex 0) if SP available, then Basic Attack
    if (config.rotationMode === 'once_skill') {
        const ability = unit.abilities.skill;
        if (unit.rotationIndex === 0 && (state.skillPoints > 0 || unit.isSummon)) {
            let targetId = selectEnemyTarget(aliveEnemies);
            if (ability.targetType === 'ally' || ability.targetType === 'self' || ability.targetType === 'all_allies') {
                targetId = unit.id;
                if (config.skillTargetId) {
                    const manualTarget = state.registry.get(createUnitId(config.skillTargetId));
                    if (manualTarget && manualTarget.hp > 0 && !manualTarget.isEnemy) {
                        targetId = manualTarget.id;
                    }
                }
            }
            console.log(`[Simulation] ${unit.name} using ONCE_SKILL: rotationIndex is 0, using Skill`);
            return { type: 'SKILL', sourceId: unit.id, targetId: targetId };
        } else {
            console.log(`[Simulation] ${unit.name} using ONCE_SKILL: rotationIndex is ${unit.rotationIndex}, using Basic Attack`);
            return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: selectEnemyTarget(aliveEnemies) };
        }
    }

    // 4. Spirit-based Mode: Skill if no spirit, Basic Attack if spirit exists
    // 記憶キャラクター（アグライア、開拓者-記憶、ヒアンシー）用ローテーション
    if (config.rotationMode === 'spirit_based') {
        // 精霊ID命名規則に基づいてオーナーの精霊を検索
        // raftra-{ownerId}, murion-{ownerId}, ikarun-{ownerId}
        const spiritPrefixes = ['raftra', 'murion', 'ikarun'];

        const hasSpirit = state.registry.toArray().some(u =>
            u.isSummon &&
            spiritPrefixes.some(prefix => u.id.startsWith(prefix)) &&
            u.ownerId === unit.id
        );

        if (hasSpirit) {
            // 精霊あり → 通常攻撃（SP温存）
            console.log(`[Simulation] ${unit.name} using SPIRIT_BASED: Spirit exists, using Basic Attack`);
            return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: selectEnemyTarget(aliveEnemies) };
        } else {
            // 精霊なし → スキル使用（精霊召喚）
            if (state.skillPoints > 0) {
                const ability = unit.abilities.skill;
                let targetId = selectEnemyTarget(aliveEnemies);
                if (ability.targetType === 'ally' || ability.targetType === 'self' || ability.targetType === 'all_allies') {
                    targetId = unit.id;
                    if (config.skillTargetId) {
                        const manualTarget = state.registry.get(createUnitId(config.skillTargetId));
                        if (manualTarget && manualTarget.hp > 0 && !manualTarget.isEnemy) {
                            targetId = manualTarget.id;
                        }
                    }
                }
                console.log(`[Simulation] ${unit.name} using SPIRIT_BASED: No spirit, using Skill`);
                return { type: 'SKILL', sourceId: unit.id, targetId };
            }
            // SPがない場合は通常攻撃にフォールバック
            console.log(`[Simulation] ${unit.name} using SPIRIT_BASED: No spirit but no SP, falling back to Basic Attack`);
            return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: selectEnemyTarget(aliveEnemies) };
        }
    }

    const rotation = config.rotation;
    const actionChar = rotation[unit.rotationIndex % rotation.length];



    let targetId = selectEnemyTarget(aliveEnemies); // 最もHPの高い敵を狙う

    // ★ SKILL_SILENCE チェック ★
    // エフェクトに 'SKILL_SILENCE' タグがある場合、スキルを使用できない（強制的に通常攻撃へ）
    const isSkillSilenced = unit.effects.some(e => e.tags?.includes('SKILL_SILENCE'));

    // ★ ENHANCED_BASIC チェック ★
    // エフェクトに 'ENHANCED_BASIC' タグがある場合、通常攻撃が強化通常攻撃に置き換わる
    const hasEnhancedBasic = unit.effects.some(e => e.tags?.includes('ENHANCED_BASIC'));

    // ★ ENHANCED_SKILL チェック ★
    // エフェクトに 'ENHANCED_SKILL' タグがある場合、スキルが強化スキル（support-skill等）に切り替わる
    const enhancedSkillEffect = unit.effects.find(e => e.tags?.includes('ENHANCED_SKILL'));

    if (isSkillSilenced) {
        console.log(`[Simulation] ${unit.name} is silenced (SKILL_SILENCE). Forcing ${hasEnhancedBasic ? 'Enhanced ' : ''}Basic Attack.`);
        // ENHANCED_BASICタグがあればdispatcher側でenhancedBasicアビリティが使用される
        return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: targetId };
    }

    // ENHANCED_SKILL がある場合、強化スキルを発動（味方対象）
    if (enhancedSkillEffect && (state.skillPoints > 0 || unit.isSummon)) {
        // 強化スキルのターゲット（味方）を決定
        const aliveAllies = state.registry.getAliveAllies().filter(u => u.id !== unit.id);
        let allyTargetId = aliveAllies[0]?.id || unit.id;

        // ★召喚物の場合はオーナーのskillTargetIdを参照
        let effectiveSkillTargetId: string | undefined = config?.skillTargetId;
        if (unit.isSummon && unit.ownerId) {
            const owner = state.registry.get(createUnitId(unit.ownerId));
            effectiveSkillTargetId = owner?.config?.skillTargetId;
            console.log(`[Simulation Debug] Summon ${unit.name} owner=${owner?.name}, ownerSkillTargetId=${effectiveSkillTargetId}`);
        }

        // skillTargetId が設定されていればそれを使用
        if (effectiveSkillTargetId) {
            const manualTarget = state.registry.get(createUnitId(effectiveSkillTargetId));
            if (manualTarget && manualTarget.hp > 0 && !manualTarget.isEnemy) {
                allyTargetId = manualTarget.id;
                console.log(`[Simulation] ${unit.name} using ENHANCED_SKILL targeting user-specified ${allyTargetId}`);
            } else {
                // フォールバック: 最もATKが高い味方
                const sortedAllies = [...aliveAllies].sort((a, b) => b.stats.atk - a.stats.atk);
                if (sortedAllies.length > 0) {
                    allyTargetId = sortedAllies[0].id;
                }
                console.log(`[Simulation] ${unit.name} using ENHANCED_SKILL targeting highest ATK ${allyTargetId} (manual target invalid)`);
            }
        } else {
            // フォールバック: 最もATKが高い味方
            const sortedAllies = [...aliveAllies].sort((a, b) => b.stats.atk - a.stats.atk);
            if (sortedAllies.length > 0) {
                allyTargetId = sortedAllies[0].id;
            }
            console.log(`[Simulation] ${unit.name} using ENHANCED_SKILL targeting highest ATK ${allyTargetId} (no manual target)`);
        }

        return {
            type: 'SKILL',
            sourceId: unit.id,
            targetId: allyTargetId,
            abilityId: 'murion-support-skill', // カスタムスキルID
            isAdditional: true,
            skipTalentTrigger: true
        };
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

    // Default to Basic Attack (ENHANCED_BASICタグがあればdispatcher側でenhancedBasicアビリティが使用される)
    return { type: 'BASIC_ATTACK', sourceId: unit.id, targetId: selectEnemyTarget(aliveEnemies) };
}

function checkAndExecuteInterruptingUltimates(state: GameState): GameState {
    let newState = state;
    // キャラクターのみ（召喚物除く）を対象にするのが安全だが、元のロジックに合わせてAliveAlliesを使用
    // filter(u => !u.isSummon) を追加して明示的にキャラクターのみにする
    const characters = newState.registry.getAliveAllies().filter(u => !u.isSummon);
    const epLog = characters.map(c => `${c.name}:${c.ep.toFixed(1)}/${(c.stats.max_ep ?? 0).toFixed(0)}`).join(', ');
    console.log(`ultimate check [${epLog}]`);

    // Limit recursion/loops to prevent infinite Ultimate chains if something is broken
    // In a real game, multiple Ultimates can happen. We'll allow a reasonable number per check.
    for (let i = 0; i < 10; i++) {
        const characters = newState.registry.getAliveAllies().filter(u => !u.isSummon);
        let ultTriggered = false;

        for (const char of characters) {
            if (char.config && char.ultCooldown === 0) {
                const strategy = char.config.ultStrategy;
                let shouldTrigger = false;

                // max_ep が 0 のキャラクター（キャストリス等の新蕾システム使用者）
                // 独自のリソースシステムで必殺技を管理する
                if (char.stats.max_ep === 0) {
                    // キャストリス専用: 新蕾システムによる必殺技発動判定
                    const CASTORICE_CHARGE_KEY = 'castorice-charge';
                    const CASTORICE_MAX_CHARGE = 34000;
                    const chargeValue = getAccumulatedValue(newState, char.id, CASTORICE_CHARGE_KEY);

                    if (strategy === 'immediate' && chargeValue >= CASTORICE_MAX_CHARGE) {
                        const ultAction: Action = { type: 'ULTIMATE', sourceId: char.id };
                        newState = dispatch(newState, ultAction);
                        ultTriggered = true;
                        break;
                    }
                    continue;
                }

                if (strategy === 'immediate') {
                    const requiredEp = char.ultCost ?? (char.stats.max_ep ?? 0);
                    if (char.config.ultEpOption === 'argenti_90') {
                        if (char.ep >= 90) shouldTrigger = true;
                    } else if (char.config.ultEpOption === 'argenti_180') {
                        if (char.ep >= 180) shouldTrigger = true;
                    } else if (char.ep >= requiredEp) {
                        shouldTrigger = true;
                    }
                }
                // クールダウンモードでも同様にultEpOptionを考慮
                // （クールダウンはultCooldownで制御されるため、ここではimmediateのみ）

                if (shouldTrigger) {
                    const ultAction: Action = { type: 'ULTIMATE', sourceId: char.id };
                    newState = dispatch(newState, ultAction);

                    ultTriggered = true;
                    break;
                }
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
    } else if (unitInNewState.isEnemy) {
        // 敵ユニットの場合の行動パターン進行
        if (unitInNewState.turnPatterns && unitInNewState.turnPatterns.length > 0) {
            newRotationIndex = (unitInNewState.rotationIndex + 1) % unitInNewState.turnPatterns.length;
        } else if (unitInNewState.actionPattern && unitInNewState.actionPattern.length > 0) {
            newRotationIndex = (unitInNewState.rotationIndex + 1) % unitInNewState.actionPattern.length;
        }
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

    // ★ ターン終了時にステータスを再計算（エフェクト変更を反映）
    unitInNewState.stats = recalculateUnitStats(unitInNewState, state.registry.toArray());

    // Update state with modified unit
    // Update state with modified unit
    const nextState = {
        ...state,
        registry: state.registry.update(createUnitId(unitInNewState.id), u => ({
            ...u,
            rotationIndex: unitInNewState.rotationIndex,
            ultCooldown: unitInNewState.ultCooldown,
            effects: unitInNewState.effects,
            stats: unitInNewState.stats  // ★ statsも更新（速度バフ等の反映）
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
    console.log(`[stepSimulation] === START === actionQueue length: ${state.actionQueue.length}, time: ${state.time.toFixed(2)}`);

    // 1. Advance Timeline
    // Find the unit with the lowest Action Value
    if (state.actionQueue.length === 0) {
        console.log(`[stepSimulation] Initializing action queue`);
        state = { ...state, actionQueue: initializeActionQueue(state.registry.toArray()) };
    }

    const nextEntry = state.actionQueue[0];
    if (!nextEntry) {
        console.log(`[stepSimulation] No next entry, returning`);
        return state;
    }

    // ★デバッグ: actionQueue全体を表示
    const queueBefore = state.actionQueue.map(e => `${e.unitId}(${e.actionValue.toFixed(1)})`).join(', ');
    console.log(`[stepSimulation] ActionQueue BEFORE advance: ${queueBefore}`);

    console.log(`[stepSimulation] Next unit: ${nextEntry.unitId}, AV: ${nextEntry.actionValue.toFixed(2)}`);

    const avDelta = nextEntry.actionValue;

    // Advance timeline
    let newState = advanceTimeline(state, avDelta);
    console.log(`[stepSimulation] Advanced timeline by ${avDelta.toFixed(2)}, new time: ${newState.time.toFixed(2)}`);

    // ★デバッグ: advanceTimeline後のactionQueueを表示
    const queueAfter = newState.actionQueue.map(e => `${e.unitId}(${e.actionValue.toFixed(1)})`).join(', ');
    console.log(`[stepSimulation] ActionQueue AFTER advance: ${queueAfter}`);

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

    // ★デバッグ: ターン開始ログ
    console.log(`[stepSimulation] Turn start: ${currentActingUnit.name} (${currentActingUnit.id}), time=${newState.time.toFixed(2)}, AV=${currentActingUnit.actionValue.toFixed(2)}`);

    // ★精霊（召喚物）のターンの場合、アクションログを初期化（精霊スキルのダメージを記録するため）
    // 精霊のアクションはON_TURN_STARTイベントハンドラ内で実行されるため、
    // イベント発火前にログを初期化しておく必要がある
    const isSpiritTurn = currentActingUnit.isSummon && !currentActingUnit.isEnemy;
    if (isSpiritTurn) {
        newState = initializeCurrentActionLog(newState, currentActingUnit.id, currentActingUnit.name, '精霊スキル');
    }

    // 1. Trigger ON_TURN_START (DoTs trigger here)
    // IMPORTANT: This must fire for ALL units, not just frozen ones
    newState = publishEvent(newState, { type: 'ON_TURN_START', sourceId: currentActingUnit.id, value: 0 });

    // ★精霊のターン: ON_TURN_STARTで精霊スキルが実行されたので、ログを最終化
    if (isSpiritTurn) {
        newState = finalizeSpiritTurnLog(newState);
    }

    // ★ユニットが削除された場合のチェック（カウントダウン等のシステムユニット用）
    // ON_TURN_STARTイベントハンドラ内でユニットが削除される可能性がある
    const refreshedUnit = newState.registry.get(currentActingUnit.id as UnitId);
    if (!refreshedUnit) {
        // ユニットが削除された - ターン終了
        console.log(`[stepSimulation] Unit ${currentActingUnit.id} was deleted during ON_TURN_START. Adding log entry.`);

        // ★カウントダウン削除時のログを追加
        newState = {
            ...newState,
            log: [...newState.log, {
                characterName: currentActingUnit.name,
                actionTime: newState.time,
                actionType: 'システム',
                details: `${currentActingUnit.name}のターン終了 - ユニット削除`,
                skillPointsAfterAction: newState.skillPoints,
                damageDealt: 0,
                healingDone: 0,
                shieldApplied: 0,
                currentEp: 0
            } as SimulationLogEntry]
        };

        return updateActionQueue(newState);
    }
    currentActingUnit = refreshedUnit;

    // ★敵のターンの場合、アクションログを初期化（DoT被ダメージを記録するため）
    if (currentActingUnit.isEnemy) {
        newState = initializeCurrentActionLog(newState, currentActingUnit.id, currentActingUnit.name, 'ターン開始', currentActingUnit.id);
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

    // ★ SKIP_ACTIONタグによるターンスキップ処理（ロビンの協奏状態など）
    // 味方のエフェクトでターンをスキップさせる場合
    const skipActionEffect = currentActingUnit!.effects.find(e => e.tags?.includes('SKIP_ACTION'));
    if (skipActionEffect && !currentActingUnit!.isEnemy) {
        // ターンスキップログ
        newState = {
            ...newState,
            log: [...newState.log, {
                characterName: currentActingUnit!.name,
                actionTime: newState.time,
                actionType: 'ターンスキップ',
                details: `${skipActionEffect.name} (行動不可)`,
                sourceId: currentActingUnit!.id,
                skillPointsAfterAction: newState.skillPoints,
                damageDealt: 0,
                healingDone: 0,
                shieldApplied: 0,
                sourceHpState: `${currentActingUnit!.hp.toFixed(0)}+${currentActingUnit!.shield.toFixed(0)}/${currentActingUnit!.stats.hp.toFixed(0)}`,
                targetHpState: '',
                targetToughness: '',
                currentEp: currentActingUnit!.ep,
                activeEffects: currentActingUnit!.effects.map(e => ({
                    name: e.name,
                    duration: e.durationType === 'PERMANENT' ? '∞' : e.duration,
                    stackCount: e.stackCount,
                    owner: e.sourceUnitId
                }))
            } as SimulationLogEntry]
        };

        // ターン終了処理（他のエフェクトの時間減少、AV リセット）
        newState = updateTurnEndState(newState, currentActingUnit!, { type: 'TURN_SKIP', sourceId: currentActingUnit!.id, reason: skipActionEffect.name });

        newState = updateActionQueue(newState);

        // ★ 割り込みチェックフェーズ (End of Turn Skip) ★
        newState = checkAndExecuteInterruptingUltimates(newState);

        // ターンスキップ：通常行動をスキップして終了
        return newState;
    }

    // ★行動制限デバフ（Crowd Control）処理
    // 凍結、もつれ、禁錮などの行動制限デバフがある場合、処理順序：
    // 1. 付加ダメージ処理
    // 2. 効果時間減少
    // 3. duration > 0 ならターンスキップ、0以下なら効果解除して通常行動
    const ccEffectRaw = currentActingUnit!.effects.find(e => isCrowdControlEffect(e));

    // 新型または旧型のCCエフェクトを取得
    const ccEffect = ccEffectRaw as (CrowdControlEffect | BreakStatusEffect | undefined);

    if (ccEffect) {
        // Get the latest state of the acting unit
        let affectedUnit = newState.registry.get(createUnitId(currentActingUnit!.id))!;

        // CCタイプを取得（新型crowdControlEffectは ccType、旧型BreakStatusEffectは statusType）
        const ccType = isNewCrowdControlEffect(ccEffect)
            ? ccEffect.ccType
            : (ccEffect as BreakStatusEffect).statusType;

        // 1. ダメージ処理 (凍結のみここで処理、もつれは別途処理済み)
        if (ccType === 'Freeze') {
            const source = newState.registry.get(createUnitId(ccEffect.sourceUnitId));
            if (source) {
                // ダメージ計算: 新型は baseDamage / multiplier、旧型は固定値
                let baseDamage: number;
                if (isNewCrowdControlEffect(ccEffect)) {
                    if (ccEffect.damageCalculation === 'multiplier' && ccEffect.scaling && ccEffect.multiplier) {
                        // キャラクター由来: 参照ステータス × 倍率
                        const refStat = source.stats[ccEffect.scaling] || 0;
                        baseDamage = refStat * ccEffect.multiplier;
                    } else {
                        // 弱点撃破由来: 固定ダメージ
                        baseDamage = ccEffect.baseDamage || LEVEL_CONSTANT_80;
                    }
                } else {
                    // 旧型: 固定値
                    baseDamage = LEVEL_CONSTANT_80;
                }

                const freezeDamage = calculateBreakAdditionalDamage(source, affectedUnit, baseDamage);

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
        let avAdvanceAmount = FREEZE_REMOVAL_AV_ADVANCE;
        if (newDuration <= 0) {
            // 効果解除
            affectedUnit = {
                ...affectedUnit,
                effects: affectedUnit.effects.filter(e => e.id !== ccEffect!.id)
            };

            // 凍結解除時のAV加速フラグ
            if (ccType === 'Freeze') {
                shouldAdvanceAV = true;
                // 新型は avAdvanceOnRemoval を参照
                if (isNewCrowdControlEffect(ccEffect) && ccEffect.avAdvanceOnRemoval !== undefined) {
                    avAdvanceAmount = ccEffect.avAdvanceOnRemoval;
                }
            }

            // Update state with modified unit
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(affectedUnit.id), u => affectedUnit)
            };

            // AV加速（凍結解除時のみ）
            if (shouldAdvanceAV) {
                const updatedUnit = newState.registry.get(createUnitId(affectedUnit.id))!;
                newState = advanceAction(newState, updatedUnit.id, avAdvanceAmount);
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

            // ★ 昇華状態の特殊処理: 行動制限抵抗（100%）があればスキップしない
            if (isNewCrowdControlEffect(ccEffect) && ccEffect.ccType === 'Sublimation') {
                const ccRes = affectedUnit.stats.crowd_control_res || 0;
                if (ccRes >= 1.0) {
                    console.log(`[Simulation] ${affectedUnit.name} resisted Sublimation turn skip (CC RES: ${ccRes * 100}%)`);
                    // 抵抗がある場合は通常行動に進む（returnせずに抜ける）
                } else {
                    // 抵抗がない場合はターンスキップ
                    return recordCcTurnSkip(newState, affectedUnit, ccType, newDuration);
                }
            } else {
                // 通常のCC（凍結/禁錮/もつれ）は従来通りターンスキップ
                return recordCcTurnSkip(newState, affectedUnit, ccType, newDuration);
            }
        }
    }

    // CCによるターンスキップを記録し、ターン終了処理を行うヘルパー関数
    function recordCcTurnSkip(state: GameState, unit: Unit, ccType: string, newDuration: number): GameState {
        let s = state;
        s = {
            ...s,
            log: [...s.log, {
                characterName: unit.name,
                actionTime: s.time,
                actionType: 'ターンスキップ',
                details: `${ccType} (ターンスキップ、残り${newDuration}ターン)`,
                sourceId: unit.id,
                skillPointsAfterAction: s.skillPoints,
                damageDealt: 0,
                healingDone: 0,
                shieldApplied: 0,
                sourceHpState: `${unit.hp.toFixed(0)}+${unit.shield.toFixed(0)}/${unit.stats.hp.toFixed(0)}`,
                targetHpState: '',
                targetToughness: '',
                currentEp: unit.ep,
                activeEffects: unit.effects.map(e => ({
                    name: e.name,
                    duration: e.durationType === 'PERMANENT' ? '∞' : e.duration,
                    stackCount: e.stackCount,
                    owner: e.sourceUnitId
                }))
            } as SimulationLogEntry]
        };

        // ターン終了処理
        s = updateTurnEndState(s, unit, { type: 'TURN_SKIP', sourceId: unit.id, reason: ccType });
        s = updateActionQueue(s);
        s = checkAndExecuteInterruptingUltimates(s);
        return s;
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

                // ★ 弱点撃破からの復帰時パターンリセット ★
                // resetPatternOnBreakRecoveryがtrueの敵は1ターン目の行動に戻る
                const enemyData = currentActingUnit as unknown as Partial<EnemyData>;
                if (enemyData.resetPatternOnBreakRecovery) {
                    currentActingUnit = {
                        ...currentActingUnit,
                        rotationIndex: 0
                    };
                    console.log(`[Simulation] Enemy ${currentActingUnit.name} reset pattern to turn 1 after break recovery`);
                }

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
                const freshUnit = newState.registry.get(createUnitId(currentActingUnit!.id));
                if (!freshUnit) return newState; // ユニットが消失した場合は終了
                currentActingUnit = freshUnit;

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

    // ★ 精霊（召喚物）のターン処理
    // isSpiritTurnバイパスを削除し、すべての召喚物が標準のアクションループを使用するように変更
    // これにより、龍霊や長夜などの設定（config）を持つ召喚物が正しく行動決定（determineNextAction）を行えるようになる

    // (旧ロジック削除跡地)
    // if (isSpiritTurn && !currentActingUnit!.id.includes('dragon-spirit')) { ... }

    while (continueAction && actionIterations < MAX_ACTION_ITERATIONS) {
        actionIterations++;

        // 最新のユニット状態を取得
        const freshUnit = newState.registry.get(currentActingUnit!.id);
        if (!freshUnit) {
            // ユニットが存在しない（死亡または退場）場合はループ中断
            break;
        }
        currentActingUnit = freshUnit;

        // 3. Determine Action

        const action = determineNextAction(currentActingUnit, newState);
        lastAction = action;

        // 4. Dispatch Action
        newState = dispatch(newState, action);

        // ★ 敵の2ndアクション処理（turnPatternsシステム）★
        // プライマリアクション後に2ndアクション（secondary）をpendingActionsに追加
        const actingUnit = newState.registry.get(currentActingUnit.id as UnitId);
        if (actingUnit && actingUnit.isEnemy && actingUnit.turnPatterns && actingUnit.turnPatterns.length > 0 && actingUnit.enemySkills) {
            const patternIndex = (actingUnit.rotationIndex || 0) % actingUnit.turnPatterns.length;
            const pattern = actingUnit.turnPatterns[patternIndex];
            const primarySkill = actingUnit.enemySkills[pattern.primary];

            // ★ 敵スキル後処理（ロックオン・デバフ等）を実行
            newState = handleEnemySkillPostEffects(newState, actingUnit, action);

            // ★ 2ndアクションの追加
            if (pattern.secondary && actingUnit.enemySkills[pattern.secondary]) {
                const secondarySkill = actingUnit.enemySkills[pattern.secondary];
                let secondaryTargetId: string = '';
                if (secondarySkill.targetType === 'lock_on') {
                    const aliveAllies = newState.registry.getAliveAllies().filter(u => !u.untargetable);
                    secondaryTargetId = selectTarget(actingUnit, aliveAllies) as string;
                } else {
                    const updatedUnit = newState.registry.get(actingUnit.id as UnitId);
                    if (updatedUnit?.lockedTargetId) {
                        secondaryTargetId = updatedUnit.lockedTargetId;
                    } else {
                        const aliveAllies = newState.registry.getAliveAllies().filter(u => !u.untargetable);
                        secondaryTargetId = selectTarget(actingUnit, aliveAllies) as string;
                    }
                }

                const secondaryAction: SkillAction = {
                    type: 'SKILL',
                    sourceId: actingUnit.id,
                    targetId: secondaryTargetId,
                    abilityId: secondarySkill.id
                };
                newState = {
                    ...newState,
                    pendingActions: [...newState.pendingActions, secondaryAction]
                };
                console.log(`[stepSimulation] Added secondary action ${secondarySkill.name} to pendingActions`);
            }
        }

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

                // ★ 敵のpendingAction（2ndアクション等）後の共通処理
                const combatAction = pendingAction as import('./types').CombatAction;
                if (combatAction.sourceId) {
                    const actingEnemy = newState.registry.get(combatAction.sourceId as UnitId);
                    if (actingEnemy && actingEnemy.isEnemy) {
                        newState = handleEnemySkillPostEffects(newState, actingEnemy, pendingAction);
                    }
                }
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
        // キャラクター固有ハンドラの登録
        const factory = registry.getCharacterFactory(unit.id);
        if (factory) {
            const { handlerMetadata, handlerLogic } = factory(unit.id, unit.level, unit.eidolonLevel || 0);
            const action: RegisterHandlersAction = {
                type: 'REGISTER_HANDLERS',
                handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
            };
            state = dispatch(state, action);
        }

        // 光円錐ハンドラの登録（データ定義に基づく汎用登録）
        if (unit.equippedLightCone) {
            const lc = unit.equippedLightCone.lightCone;
            const s = unit.equippedLightCone.superimposition;
            const lcFactory = createGenericLightConeHandlerFactory(lc, s);
            const { handlerMetadata, handlerLogic } = lcFactory(unit.id, unit.level);
            const action: RegisterHandlersAction = {
                type: 'REGISTER_HANDLERS',
                handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
            };
            state = dispatch(state, action);
        }
    });

    // --- Battle Start ---
    const initialHandlers: RegisterHandlersAction['handlers'] = [];

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
