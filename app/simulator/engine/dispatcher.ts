import { GameState, Unit, IEventHandlerLogic, IEventHandler, ActionContext, Action, BasicAttackAction, SkillAction, UltimateAction, BattleStartAction, RegisterHandlersAction, ActionAdvanceAction, FollowUpAttackAction, IEvent, IHit, DamageOptions, DamageResult, CombatAction, EnhancedBasicAttackAction, CurrentActionLog } from './types';
import { UnitId, createUnitId } from './unitId';
import { SimulationLogEntry, IAbility, HitDetail, AdditionalDamageEntry, DamageTakenEntry, HealingEntry, ShieldEntry, DotDetonationEntry, EquipmentEffectEntry, EffectSummary, Modifier } from '../../types/index';
import { calculateDamage, calculateDamageWithCritInfo, DamageCalculationModifiers, calculateBreakDamage, calculateSuperBreakDamage, calculateBreakDamageWithBreakdown } from '../damage';
import { createBreakEffect } from '../effect/breakEffects';
import { BreakStatusEffect, IEffect, ShieldEffect } from '../effect/types';
import { isBreakStatusEffect, isShieldEffect } from '../effect/utils';
import { addEffect, removeEffect } from './effectManager';

import { updatePassiveBuffs, registerRelicEventHandlers } from '../effect/relicHandler';
import { addEnergy } from './energy';
import { addSkillPoints } from '../effect/relicEffectHelpers';
import { updateActionQueue, calculateBaseAV, advanceUnitAction, delayUnitAction } from './actionValue';
import { ENEMY_DEFEAT_ENERGY_REWARD } from './constants';
import { cleanse, applyShield } from './utils';
import { getAccumulatedValue } from './accumulator';
import { recalculateUnitStats } from '../statBuilder';
import { removeAurasBySource, getAurasForLog } from './auraManager';
import { getEquipmentNameById } from '../../data/equipment-names';

// === ログ蓄積ヘルパー関数 ===

/**
 * 新しいアクションログを初期化
 */
export function initializeCurrentActionLog(
  state: GameState,
  sourceId: string,
  sourceName: string,
  actionType: string
): GameState {
  const currentActionLog: CurrentActionLog = {
    actionId: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    primarySourceId: sourceId,
    primarySourceName: sourceName,
    primaryActionType: actionType,
    startTime: state.time,
    primaryDamage: {
      hitDetails: [],
      totalDamage: 0
    },
    additionalDamage: [],
    damageTaken: [],
    healing: [],
    shields: [],
    dotDetonations: [],
    equipmentEffects: []
  };

  return { ...state, currentActionLog };
}

/**
 * 敵のターン用のログ最終化
 * DoT被ダメージがある場合のみログを生成
 */
export function finalizeEnemyTurnLog(state: GameState): GameState {
  const currentActionLog = state.currentActionLog;

  if (!currentActionLog) {
    return state;
  }

  // 被ダメージがない場合はログを生成しない
  const totalDamageTaken = currentActionLog.damageTaken.reduce((sum, e) => sum + e.damage, 0);
  if (totalDamageTaken === 0 && currentActionLog.additionalDamage.length === 0) {
    return { ...state, currentActionLog: undefined };
  }

  const logEntry: SimulationLogEntry = {
    characterName: currentActionLog.primarySourceName,
    actionTime: currentActionLog.startTime,
    actionType: currentActionLog.primaryActionType,
    skillPointsAfterAction: state.skillPoints,

    // 集計値
    totalDamageDealt: 0,
    totalDamageTaken,
    totalHealing: 0,
    totalShieldGiven: 0,

    // 詳細情報（トグル内）
    logDetails: {
      damageTaken: currentActionLog.damageTaken.length > 0 ? currentActionLog.damageTaken : undefined,
    },

    // 後方互換性
    damageDealt: 0,
    healingDone: 0,
    shieldApplied: 0,
  };

  return {
    ...state,
    log: [...state.log, logEntry],
    currentActionLog: undefined
  };
}


/**
 * 付加ダメージをログに追加
 */
export function appendAdditionalDamage(
  state: GameState,
  entry: AdditionalDamageEntry
): GameState {
  if (!state.currentActionLog) return state;

  return {
    ...state,
    currentActionLog: {
      ...state.currentActionLog,
      additionalDamage: [...state.currentActionLog.additionalDamage, entry]
    }
  };
}

/**
 * 回復をログに追加
 */
export function appendHealing(
  state: GameState,
  entry: HealingEntry
): GameState {
  if (!state.currentActionLog) return state;

  return {
    ...state,
    currentActionLog: {
      ...state.currentActionLog,
      healing: [...state.currentActionLog.healing, entry]
    }
  };
}

/**
 * シールドをログに追加
 */
export function appendShield(
  state: GameState,
  entry: ShieldEntry
): GameState {
  if (!state.currentActionLog) return state;

  return {
    ...state,
    currentActionLog: {
      ...state.currentActionLog,
      shields: [...state.currentActionLog.shields, entry]
    }
  };
}

/**
 * 被ダメージをログに追加
 */
export function appendDamageTaken(
  state: GameState,
  entry: DamageTakenEntry
): GameState {
  if (!state.currentActionLog) return state;

  return {
    ...state,
    currentActionLog: {
      ...state.currentActionLog,
      damageTaken: [...state.currentActionLog.damageTaken, entry]
    }
  };
}

/**
 * DoT起爆をログに追加
 */
export function appendDotDetonation(
  state: GameState,
  entry: DotDetonationEntry
): GameState {
  if (!state.currentActionLog) return state;

  return {
    ...state,
    currentActionLog: {
      ...state.currentActionLog,
      dotDetonations: [...state.currentActionLog.dotDetonations, entry]
    }
  };
}

/**
 * 装備効果をログに追加（光円錐、遺物、オーナメント）
 */
export function appendEquipmentEffect(
  state: GameState,
  entry: EquipmentEffectEntry
): GameState {
  if (!state.currentActionLog) return state;

  return {
    ...state,
    currentActionLog: {
      ...state.currentActionLog,
      equipmentEffects: [...state.currentActionLog.equipmentEffects, entry]
    }
  };
}

function extractBuffsForLog(unit: Unit, ownerName: string, allUnits?: Unit[]): EffectSummary[] {
  // 1. unit.effectsからの抽出
  const effectSummaries = unit.effects.map(effect => {
    const stackCount = (effect as any).stackCount;
    const name = stackCount && stackCount > 0 ? `${effect.name} (${stackCount})` : effect.name;

    // modifiersの抽出
    let modifiers: { stat: string; value: number }[] = [];
    if (effect.modifiers) {
      const multiplier = stackCount || 1;
      if (Array.isArray(effect.modifiers)) {
        modifiers = effect.modifiers.map((m: Modifier) => {
          // dynamicValueの評価
          let baseValue = typeof m.value === 'number' ? m.value : (m.value as any)?.value || 0;
          if (m.dynamicValue && allUnits) {
            try {
              baseValue = m.dynamicValue(unit, allUnits);
            } catch (e) {
              // フォールバック
            }
          }
          return {
            stat: m.target || 'unknown',
            value: baseValue * multiplier
          };
        });
      } else {
        modifiers = Object.entries(effect.modifiers).map(([stat, value]) => {
          const numericValue = typeof value === 'number' ? value : (value as any).value || 0;
          return { stat, value: numericValue * multiplier };
        });
      }
    }

    return {
      name: name,
      duration: effect.durationType === 'PERMANENT' ? '∞' as const : effect.duration,
      stackCount: stackCount,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      owner: ownerName,
    };
  });

  // 2. unit.modifiersからの抽出（遺物・オーナメントのパッシブ効果）
  // ソースIDでグループ化して表示
  const modifiersBySource = new Map<string, { stat: string; value: number; isOrnament: boolean }[]>();

  for (const m of unit.modifiers) {
    // 遺物・オーナメントのパッシブ効果のみ抽出
    if (m.source.startsWith('relic-passive-') || m.source.startsWith('ornament-passive-')) {
      const isOrnament = m.source.startsWith('ornament-passive-');
      // ソース名から表示名を生成（例: relic-passive-poet_who_...-4pc-passive-0-unit1-crit_rate → 亡国の悲哀を詠う詩人）
      const sourceParts = m.source.split('-');
      // セットIDを抽出（例: poet_who_sings_of...）
      const setIdIndex = sourceParts.findIndex(p => p === 'passive') + 1;
      const setId = sourceParts.slice(setIdIndex, sourceParts.findIndex(p => p.endsWith('pc'))).join('_');
      // セットIDとオーナメントフラグを組み合わせたキー
      const displayKey = `${isOrnament ? 'ornament:' : 'relic:'}${setId || m.source}`;

      if (!modifiersBySource.has(displayKey)) {
        modifiersBySource.set(displayKey, []);
      }
      modifiersBySource.get(displayKey)!.push({
        stat: m.target as string,
        value: m.value,
        isOrnament
      });
    }
  }

  // modifiersをEffectSummary形式に変換（同じstatは合算）
  const modifierSummaries: EffectSummary[] = [];
  modifiersBySource.forEach((mods, key) => {
    const isOrnament = key.startsWith('ornament:');
    const setId = key.replace(/^(ornament|relic):/, '');
    const label = isOrnament ? '[オーナメント]' : '[遺物]';

    // 同じstatの値を合算
    const aggregatedMods = new Map<string, number>();
    for (const m of mods) {
      aggregatedMods.set(m.stat, (aggregatedMods.get(m.stat) || 0) + m.value);
    }

    modifierSummaries.push({
      name: `${label} ${getEquipmentNameById(setId)}`,
      duration: '∞' as const,
      modifiers: Array.from(aggregatedMods.entries()).map(([stat, value]) => ({ stat, value })),
      owner: ownerName,
    });
  });

  return [...effectSummaries, ...modifierSummaries];
}

/**
 * extractBuffsForLogのオーラ対応版
 * オーラ効果もログに含める
 */
export function extractBuffsForLogWithAuras(
  unit: Unit,
  ownerName: string,
  state: GameState,
  allUnits?: Unit[]
): EffectSummary[] {
  // 通常のエフェクトとmodifiersを抽出
  const baseSummaries = extractBuffsForLog(unit, ownerName, allUnits);

  // オーラ効果を抽出
  const auraSummaries = getAurasForLog(state, unit.id).map(aura => ({
    name: aura.name,
    duration: '∞' as const,
    modifiers: aura.modifiers,
    owner: ownerName,
  }));

  return [...baseSummaries, ...auraSummaries];
}

/**
 * ログ表示用に遺物・オーナメントのステータス情報を抽出する
 */
function extractRelicStatsForLog(unit: Unit): EffectSummary[] {
  const result: EffectSummary[] = [];

  // 部位名の日本語マッピング
  const relicSlotNames: Record<string, string> = {
    'Head': '頭部メイン',
    'Hands': '手部メイン',
    'Body': '胴体メイン',
    'Feet': '脚部メイン',
    'Planar Sphere': '次元球メイン',
    'Link Rope': '連結縄メイン',
  };

  const allRelics = [...(unit.relics || []), ...(unit.ornaments || [])];

  // 1. メインステータス（部位ごと）
  for (const relic of allRelics) {
    if (!relic.mainStat) continue;

    result.push({
      name: relicSlotNames[relic.type] || relic.type, // フォールバックで英語名
      duration: '∞' as const,
      modifiers: [{
        stat: relic.mainStat.stat,
        value: relic.mainStat.value,
      }],
      owner: unit.name,
      sourceType: 'self'
    });
  }

  // 2. サブステータス（合計）
  const subStatTotals: Record<string, number> = {};
  let hasSubStats = false;

  for (const relic of allRelics) {
    if (!relic.subStats) continue;
    for (const sub of relic.subStats) {
      subStatTotals[sub.stat] = (subStatTotals[sub.stat] || 0) + sub.value;
      hasSubStats = true;
    }
  }

  if (hasSubStats) {
    result.push({
      name: 'サブステ合計',
      duration: '∞' as const,
      modifiers: Object.entries(subStatTotals).map(([stat, value]) => ({
        stat,
        value,
      })),
      owner: unit.name,
      sourceType: 'self'
    });
  }

  return result;
}

export function publishEvent(state: GameState, event: IEvent): GameState {
  let newState = state;
  for (const handler of state.eventHandlers) {
    if (handler.subscribesTo && handler.subscribesTo.includes(event.type)) {
      const logic = newState.eventHandlerLogics[handler.id];
      if (logic) {
        newState = logic(event, newState, handler.id);
      }
    }
  }
  return newState;
}

export function applyDamage(target: Unit, damage: number): Unit {
  let remainingDamage = damage;
  let newEffects = [...target.effects];

  // 1. Consume Shields
  // We should consume shields. Order matters if they have different durations.
  // Ideally, consume from the one expiring soonest.
  // For now, simple iteration.
  newEffects = newEffects.map(effect => {
    if (remainingDamage <= 0) return effect;
    if (isShieldEffect(effect)) {
      const shieldEffect = effect;
      const absorbed = Math.min(shieldEffect.value, remainingDamage);
      remainingDamage -= absorbed;
      return { ...shieldEffect, value: shieldEffect.value - absorbed };
    }
    return effect;
  }).filter(effect => {
    // Remove shields that are depleted
    if (isShieldEffect(effect)) {
      return effect.value > 0;
    }
    return true;
  });

  // 2. HP Damage
  let newHp = target.hp;
  if (remainingDamage > 0) {
    newHp -= remainingDamage;
  }

  // 3. Recalculate Total Shield
  const newTotalShield = newEffects.reduce((sum, e) => isShieldEffect(e) ? sum + e.value : sum, 0);

  return {
    ...target,
    hp: newHp,
    shield: newTotalShield,
    effects: newEffects
  };
}

/**
 * Applies damage to a target unit, handling stats updates, logging, events, and kill effects.
 * This function unifies damage application logic across actions and periodic effects.
 */
export function applyUnifiedDamage(
  state: GameState,
  source: Unit,
  target: Unit,
  damage: number,
  options: DamageOptions
): DamageResult {
  // ★ 最新のターゲット状態を取得（actionValue等の更新を保持するため）
  // ただし、targetに含まれるtoughness等の更新は尊重する
  const stateTarget = state.registry.get(target.id as UnitId);
  const freshTarget = stateTarget ? {
    ...stateTarget,
    // targetから渡されたtoughnessとeffectsを優先（外部で更新されている場合があるため）
    toughness: target.toughness,
    hp: target.hp,
    shield: target.shield,
    effects: target.effects
  } : target;

  // 1. Apply Damage
  const targetAfterDamage = applyDamage(freshTarget, damage);
  let killed = false;
  let newState = {
    ...state,
    registry: state.registry.update(target.id as UnitId, u => targetAfterDamage)
  };

  // 2. Kill Logic (EP Recovery)
  if (targetAfterDamage.hp <= 0 && target.hp > 0) { // Newly killed
    killed = true;

    // 敵撃破イベント発火（効果削除前、EP回復前）
    if (target.isEnemy) {
      const enemyDefeatedEvent: IEvent = {
        type: 'ON_ENEMY_DEFEATED',
        sourceId: source.id,
        targetId: target.id,
        defeatedEnemy: targetAfterDamage  // 効果が残っている状態
      };

      const relevantHandlers = newState.eventHandlers.filter(h =>
        h.subscribesTo.includes('ON_ENEMY_DEFEATED')
      );
      for (const handler of relevantHandlers) {
        const logic = newState.eventHandlerLogics[handler.id];
        if (logic) {
          newState = logic(enemyDefeatedEvent, newState, handler.id);
        }
      }
    }

    // ON_UNIT_DEATH event (For Ikarun dismissal etc.)
    const unitDeathEvent: IEvent = {
      type: 'ON_UNIT_DEATH',
      sourceId: source.id, // Killer
      targetId: target.id, // Victim
    };

    const deathHandlers = newState.eventHandlers.filter(h =>
      h.subscribesTo.includes('ON_UNIT_DEATH')
    );
    for (const handler of deathHandlers) {
      const logic = newState.eventHandlerLogics[handler.id];
      if (logic) {
        newState = logic(unitDeathEvent, newState, handler.id);
      }
    }

    // ★ オーラ削除: 死亡したユニットがソースのオーラをすべて削除
    newState = removeAurasBySource(newState, target.id);

    if (options.isKillRecoverEp) {
      const killer = newState.registry.get(source.id as UnitId);
      if (killer) {
        const oldEp = killer.ep;
        const updatedKiller = addEnergy(killer, ENEMY_DEFEAT_ENERGY_REWARD);
        const actualGain = updatedKiller.ep - oldEp;
        newState = {
          ...newState,
          registry: newState.registry.update(killer.id as UnitId, u => updatedKiller)
        };

        // Publish ON_EP_GAINED event for kill EP recovery
        if (actualGain > 0) {
          newState = publishEvent(newState, {
            type: 'ON_EP_GAINED',
            sourceId: killer.id,
            targetId: killer.id,
            value: actualGain,
            epGained: actualGain
          });
        }
      }
    }
  }

  // 3. Update Stats (Optional)
  if (!options.skipStats) {
    const currentStats = newState.result.characterStats[source.id] || {
      damageDealt: 0,
      healingDealt: 0,
      shieldProvided: 0
    };
    newState = {
      ...newState,
      result: {
        ...newState.result,
        totalDamageDealt: newState.result.totalDamageDealt + damage,
        characterStats: {
          ...newState.result.characterStats,
          [source.id]: {
            ...currentStats,
            damageDealt: currentStats.damageDealt + damage
          }
        }
      }
    };
  }

  // 4. Log (Optional)
  if (!options.skipLog) {
    newState.log.push({
      characterName: source.name,
      actionTime: newState.time,
      actionType: options.damageType,
      skillPointsAfterAction: newState.skillPoints,
      damageDealt: damage,
      healingDone: 0,
      shieldApplied: 0,
      sourceHpState: `${source.hp.toFixed(0)}/${source.stats.hp.toFixed(0)}`,
      targetHpState: `${targetAfterDamage.hp.toFixed(0)}/${target.stats.hp.toFixed(0)}`,
      targetToughness: '',
      currentEp: source.ep,
      activeEffects: [],
      details: options.details || ''
    } as any);
  }

  // 5. Publish Events
  if (options.events) {
    for (const event of options.events) {
      const payloadObj = typeof event.payload === 'object' && event.payload !== null ? event.payload as Record<string, unknown> : {};
      newState = publishEvent(newState, {
        ...payloadObj,
        type: event.type,
        sourceId: source.id,
        targetId: target.id,
        value: damage
      } as any);
    }
  }

  // 6. 付加ダメージエントリの自動追加
  if (options.additionalDamageEntry) {
    newState = appendAdditionalDamage(newState, {
      source: options.additionalDamageEntry.source,
      name: options.additionalDamageEntry.name,
      damage: damage,
      target: target.name,
      damageType: options.additionalDamageEntry.damageType,
      isCrit: options.additionalDamageEntry.isCrit,
      breakdownMultipliers: options.additionalDamageEntry.breakdownMultipliers
    });
  }

  return {
    state: newState,
    totalDamage: damage,
    killed,
    isCrit: options.isCrit,
    breakdownMultipliers: options.breakdownMultipliers
  };
}




/**
 * Applies a break effect to the target and applies delay if the effect has one.
 * @param state Current game state
 * @param target Target unit
 * @param effect Break effect to apply
 * @returns Updated game state
 */
function applyBreakEffectWithDelay(
  state: GameState,
  target: Unit,
  effect: BreakStatusEffect
): GameState {
  // 1. Add effect to target
  let targetWithEffect = {
    ...target,
    effects: [...target.effects, effect]
  };

  // 2. Recalculate stats to apply effect modifiers (e.g., speed reduction from Imprisonment)
  const newStats = recalculateUnitStats(targetWithEffect, state.registry.toArray());
  targetWithEffect = {
    ...targetWithEffect,
    stats: newStats
  };

  // 3. Apply delay if effect has delayAmount
  // 敵のターン開始時にAVリセットが行われるため、遅延ではなく
  // (1 - delayAmount) 分の短縮を適用して正しい遅延効果を再現
  if (effect.delayAmount) {
    const baseAV = calculateBaseAV(targetWithEffect.stats.spd);
    // AVリセット後: AV = baseAV
    // 期待する結果: AV = baseAV × delayAmount
    // 短縮量: (1 - delayAmount) × baseAV
    const advanceAmount = (1 - effect.delayAmount) * baseAV;
    targetWithEffect = {
      ...targetWithEffect,
      actionValue: Math.max(0, targetWithEffect.actionValue - advanceAmount)
    };
  }

  // 4. Update state
  // return updateUnit(state, target.id as UnitId, targetWithEffect);
  return {
    ...state,
    registry: state.registry.update(target.id as UnitId, u => targetWithEffect)
  };
}

/**
 * Handles Quantum element weakness break (Entanglement stack management).
 * @param state Current game state
 * @param source Source unit
 * @param target Target unit
 * @returns Updated game state
 */
function handleQuantumBreak(
  state: GameState,
  source: Unit,
  target: Unit
): GameState {
  const existingEntanglement = target.effects.find(
    e => isBreakStatusEffect(e) && e.statusType === 'Entanglement'
  ) as BreakStatusEffect | undefined;

  // Increase stack count (no delay applied)
  if (existingEntanglement && existingEntanglement.stackCount! < (existingEntanglement.maxStacks || 5)) {
    existingEntanglement.stackCount = (existingEntanglement.stackCount || 1) + 1;
    existingEntanglement.duration = 1;

    return {
      ...state,
      registry: state.registry.update(target.id as UnitId, u => target)
    };
  }

  // Apply new effect with delay
  if (!existingEntanglement) {
    const effect = createBreakEffect(source, target);
    if (effect) {
      return applyBreakEffectWithDelay(state, target, effect as BreakStatusEffect);
    }
  }

  return state;
}

// --- Action Pipeline Steps ---


function stepPayCost(context: ActionContext): ActionContext {
  const { action, source, state } = context;
  let newState = state;
  let updatedSource = state.registry.get(source.id) || source;

  // 召喚ユニットはコストを支払わない
  if (source.isSummon) return context;

  if (action.type === 'BASIC_ATTACK') {
    // 通常攻撃: 味方のみSP+1
    const spGain = source.isEnemy ? 0 : 1;
    newState = addSkillPoints(newState, spGain, source.id);
  } else if (action.type === 'ENHANCED_BASIC_ATTACK') {
    // 強化通常攻撃: SP回復なし（キャラクターによってはハンドラで個別管理）
    // デフォルトではSP回復なし
  } else if (action.type === 'SKILL') {
    // スキル: SP消費
    const skillAbility = source.abilities.skill;
    const cost = skillAbility?.spCost ?? 1;
    newState = addSkillPoints(newState, -cost, source.id);
  } else if (action.type === 'ULTIMATE') {
    // 必殺技: EP消費
    const epOption = updatedSource.config?.ultEpOption;
    if (epOption === 'argenti_90') {
      // アルジェンティ90EP版: 90EP消費
      updatedSource = { ...updatedSource, ep: Math.max(0, updatedSource.ep - 90) };
    } else if (epOption === 'argenti_180') {
      // アルジェンティ180EP版: 180EP消費
      updatedSource = { ...updatedSource, ep: Math.max(0, updatedSource.ep - 180) };
    } else {
      // 通常: 全消費
      updatedSource = { ...updatedSource, ep: 0 };
    }
  }

  newState = {
    ...newState,
    registry: newState.registry.update(source.id, u => updatedSource)
  };

  return {
    ...context,
    state: newState
  };
}

function stepGenerateHits(context: ActionContext): ActionContext {
  const { action, state } = context;
  let targets: Unit[] = [];
  let hits: IHit[] = [];

  // Helper to get ability based on action type
  const sourceId = (action as CombatAction).sourceId;
  const source = state.registry.get(createUnitId(sourceId));
  if (!source) return context;

  let ability: IAbility | undefined;
  if (action.type === 'BASIC_ATTACK') ability = source.abilities.basic;
  else if (action.type === 'ENHANCED_BASIC_ATTACK') ability = source.abilities.enhancedBasic; // 強化通常攻撃
  else if (action.type === 'SKILL') ability = source.abilities.skill;
  else if (action.type === 'ULTIMATE') ability = source.abilities.ultimate;
  else if (action.type === 'FOLLOW_UP_ATTACK') ability = source.abilities.talent;

  if (!ability) return context;

  const targetId = (action as CombatAction).targetId;
  const primaryTarget = targetId ? state.registry.get(createUnitId(targetId)) : undefined;

  // Default to primary target if available
  if (primaryTarget) {
    targets.push(primaryTarget);
  }

  // Handle Target Types
  if (ability.targetType === 'all_enemies') {
    targets = state.registry.getAliveEnemies();
  } else if (ability.targetType === 'blast') {
    const enemies = state.registry.getAliveEnemies();
    // primaryTargetがない場合は最初の敵を選択
    let blastPrimaryTarget = primaryTarget;
    if (!blastPrimaryTarget && enemies.length > 0) {
      blastPrimaryTarget = enemies[0];
      targets.push(blastPrimaryTarget);
    }
    if (blastPrimaryTarget) {
      const enemyIndex = enemies.findIndex(u => u.id === blastPrimaryTarget!.id);
      if (enemyIndex !== -1) {
        const adjacentIndices = [enemyIndex - 1, enemyIndex + 1];
        adjacentIndices.forEach(idx => {
          if (enemies[idx]) targets.push(enemies[idx]);
        });
      }
    }
    targets = Array.from(new Set(targets));
  } else if (ability.targetType === 'bounce') {
    const enemies = state.registry.getAliveEnemies();
    if (enemies.length > 0) {
      targets = []; // Reset targets for Bounce
    }
  } else if (ability.targetType === 'all_allies') {
    targets = state.registry.getAliveAllies();
  } else if (ability.targetType === 'ally' && primaryTarget) {
    targets = [primaryTarget];
  } else if (ability.targetType === 'self') {
    targets = [source];
  }

  // Generate Hits based on Damage Logic
  if (ability.damage) {
    const damageDef = ability.damage;

    // accumulated_healingスケーリングの場合、累計値を取得
    let accumulatorValue: number | undefined;
    if (damageDef.scaling === 'accumulated_healing') {
      // accumulatorOwnerIdから累計値を取得（設定されていない場合はソースのownerId）
      const ownerId = damageDef.accumulatorOwnerId || source.ownerId || source.id;
      accumulatorValue = getAccumulatedValue(state, ownerId, 'healing');
    }

    if (damageDef.type === 'simple') {
      // hits配列
      if (damageDef.hits && damageDef.hits.length > 0) {
        for (const target of targets) {
          damageDef.hits.forEach((hitDef, hitIdx) => {
            hits.push({
              targetId: target.id,
              scaling: damageDef.scaling,
              multiplier: hitDef.multiplier,
              toughnessReduction: hitDef.toughnessReduction,
              hitIndex: hitIdx,
              isMainTarget: target.id === primaryTarget?.id,
              hitType: target.id === primaryTarget?.id ? 'main' : 'aoe',
              accumulatorOwnerId: damageDef.accumulatorOwnerId,
              accumulatorValue: accumulatorValue
            });
          });
        }
      }
    } else if (damageDef.type === 'blast') {
      // mainHits + adjacentHits
      if (damageDef.mainHits && damageDef.adjacentHits) {
        for (const target of targets) {
          const isMain = target.id === primaryTarget?.id;
          const hitArray = isMain ? damageDef.mainHits : damageDef.adjacentHits;
          hitArray.forEach((hitDef, hitIdx) => {
            hits.push({
              targetId: target.id,
              scaling: damageDef.scaling,
              multiplier: hitDef.multiplier,
              toughnessReduction: hitDef.toughnessReduction,
              hitIndex: hitIdx,
              isMainTarget: isMain,
              hitType: isMain ? 'main' : 'adjacent',
              accumulatorOwnerId: damageDef.accumulatorOwnerId,
              accumulatorValue: accumulatorValue
            });
          });
        }
      }
    } else if (damageDef.type === 'bounce') {
      const enemies = state.registry.getAliveEnemies();
      if (enemies.length > 0) {
        // hits配列
        if (damageDef.hits && damageDef.hits.length > 0) {
          damageDef.hits.forEach((hitDef, index) => {
            const randomIndex = Math.floor(Math.random() * enemies.length);
            const target = enemies[randomIndex];
            if (!targets.find(t => t.id === target.id)) {
              targets.push(target);
            }
            hits.push({
              targetId: target.id,
              scaling: damageDef.scaling,
              multiplier: hitDef.multiplier,
              toughnessReduction: hitDef.toughnessReduction,
              hitIndex: index,
              isMainTarget: false,
              hitType: 'bounce',
              accumulatorOwnerId: damageDef.accumulatorOwnerId,
              accumulatorValue: accumulatorValue
            });
          });
        }
      }
    } else if (damageDef.type === 'aoe') {
      // AoE: 全ターゲットに同じhits配列を適用
      for (const target of targets) {
        damageDef.hits.forEach((hitDef, hitIdx) => {
          hits.push({
            targetId: target.id,
            scaling: damageDef.scaling,
            multiplier: hitDef.multiplier,
            toughnessReduction: hitDef.toughnessReduction,
            hitIndex: hitIdx,
            isMainTarget: target.id === primaryTarget?.id,
            hitType: 'aoe',
            accumulatorOwnerId: damageDef.accumulatorOwnerId,
            accumulatorValue: accumulatorValue
          });
        });
      }
    }
  }

  return { ...context, targets, hits };
}

function stepProcessHits(context: ActionContext): ActionContext {
  const { source, hits, action, state } = context;
  let newState = state;
  let totalDamage = 0;
  let isBroken = false;
  const hitDetails: HitDetail[] = [];

  // Determine Ability (Needed for toughness reduction calculation)
  let ability: IAbility | undefined;
  if (action.type === 'BASIC_ATTACK') ability = source.abilities.basic;
  else if (action.type === 'ENHANCED_BASIC_ATTACK') ability = source.abilities.enhancedBasic; // 強化通常攻撃
  else if (action.type === 'SKILL') ability = source.abilities.skill;
  else if (action.type === 'ULTIMATE') ability = source.abilities.ultimate;
  else if (action.type === 'FOLLOW_UP_ATTACK') ability = source.abilities.talent;

  if (!hits || hits.length === 0) return context;

  for (const hit of hits) {
    // Fetch fresh target from newState
    const currentTarget = newState.registry.get(createUnitId(hit.targetId));
    if (!currentTarget) continue;

    let currentDamageModifiers: DamageCalculationModifiers = {};

    // ★ ON_BEFORE_HIT: 各ヒットのダメージ計算前に発火
    newState = publishEvent(newState, {
      type: 'ON_BEFORE_HIT',
      sourceId: source.id,
      targetId: currentTarget.id,
      hitIndex: hit.hitIndex,
      actionType: action.type
    } as IEvent);

    // 1. Pre-Damage Event
    const beforeDmgEvent: IEvent = {
      type: 'ON_BEFORE_DAMAGE_CALCULATION',
      sourceId: source.id,
      targetId: currentTarget.id,
      value: 0,
      element: source.element,
      subType: action.type, // アクションタイプを含める（E6防御無視等で使用）
    };
    newState = publishEvent(newState, beforeDmgEvent);
    currentDamageModifiers = newState.damageModifiers;

    // 2. Calculate Damage (靭性減少前に計算 - 現在の靭性で撃破乗数を計算)
    const currentSource = newState.registry.get(createUnitId(source.id)) || source;

    const hitAbility: IAbility = {
      ...ability!,
      damage: {
        type: 'simple',
        scaling: hit.scaling,
        hits: [{ multiplier: hit.multiplier, toughnessReduction: hit.toughnessReduction }]
      }
    };

    // ダメージ計算（現在の靭性状態で撃破乗数を計算）+ 会心判定結果を取得
    const damageResult = calculateDamageWithCritInfo(currentSource, currentTarget, hitAbility, action, currentDamageModifiers, hit.accumulatorValue);
    const damage = damageResult.damage;
    totalDamage += damage;

    // ヒット詳細を記録
    hitDetails.push({
      hitIndex: hit.hitIndex,
      multiplier: hit.multiplier,
      damage: damage,
      isCrit: damageResult.isCrit,
      targetName: currentTarget.name,
      breakdownMultipliers: damageResult.breakdownMultipliers
    });

    // 3. 毎ヒット後にエフェクト付与を判定（ダメージ計算後、靭性減少前）
    if (ability?.effects) {
      for (const effectDef of ability.effects) {
        // ターゲット判定
        if (effectDef.target === 'target' && hit.targetId !== currentTarget.id) continue;
        if (effectDef.target === 'self') continue; // selfはアクション完了後

        // 1回の試行で判定（毎ヒットごと）
        if (calculateEffectSuccess(currentSource, currentTarget, effectDef, 1)) {
          const effectInstance = createEffectInstance(currentSource, currentTarget, effectDef);
          if (effectInstance) {
            newState = addEffect(newState, currentTarget.id, effectInstance);
          }
        }
      }
    }

    // 4. 靭性減少（ダメージ計算後）
    let newToughness = currentTarget.toughness;
    let targetIsBroken = false;
    let breakDamage = 0;
    let superBreakDamage = 0;
    let updatedTarget = currentTarget;
    let breakDamageResult: { damage: number; isCrit: boolean; breakdownMultipliers?: { baseDmg: number; critMult: number; dmgBoostMult: number; defMult: number; resMult: number; vulnMult: number; brokenMult: number } } | null = null;

    // E6キャストリス: 弱点チェック（弱点一致 または ignoreToughnessWeaknessフラグ）
    const canReduceToughness = currentTarget.weaknesses.has(currentSource.element) ||
      currentDamageModifiers.ignoreToughnessWeakness;

    if (canReduceToughness) {
      if (currentTarget.toughness > 0) {
        // 削靭値計算: (基礎 + toughnessFlat) × (1 + break_efficiency)
        const baseToughness = hit.toughnessReduction + (currentDamageModifiers.toughnessFlat || 0);
        const breakEfficiency = currentSource.stats.break_effect || 0;
        const toughnessReduction = baseToughness * (1 + breakEfficiency);
        newToughness = Math.max(0, currentTarget.toughness - toughnessReduction);
        if (newToughness <= 0) {
          targetIsBroken = true;
          isBroken = true;

          // E6キャストリス: 弱点撃破効果の属性決定（量子を強制）
          const breakElement = currentDamageModifiers.forceBreakElement || currentSource.element;
          const breakSource = breakElement !== currentSource.element
            ? { ...currentSource, element: breakElement }
            : currentSource;

          // 撃破ダメージは撃破時点の状態で計算
          breakDamageResult = calculateBreakDamageWithBreakdown(breakSource, currentTarget, currentDamageModifiers);
          breakDamage = breakDamageResult.damage;
        }
      }
    }


    updatedTarget = { ...updatedTarget, toughness: newToughness };

    // 5. Apply Damage
    const result = applyUnifiedDamage(
      newState,
      currentSource,
      updatedTarget,
      damage + breakDamage + superBreakDamage,
      {
        damageType: action.type,
        isKillRecoverEp: true,
        skipLog: true,
        skipStats: true,
        events: [{
          type: 'ON_DAMAGE_DEALT',
          payload: {
            subType: action.type,
            targetCount: context.targets.length
          }
        }]
      }
    );
    newState = result.state;
    updatedTarget = newState.registry.get(createUnitId(updatedTarget.id))!;

    if (targetIsBroken) {
      const breakEvent: IEvent = {
        type: 'ON_WEAKNESS_BREAK',
        sourceId: currentSource.id,
        targetId: currentTarget.id,
        value: breakDamage,
      };
      newState = publishEvent(newState, breakEvent);

      // ★弱点撃破ダメージを統合ログに追加
      if (breakDamage > 0 && breakDamageResult) {
        newState = appendAdditionalDamage(newState, {
          source: currentSource.name,
          name: '弱点撃破ダメージ',
          damage: breakDamage,
          target: currentTarget.name,
          damageType: 'break',
          isCrit: breakDamageResult.isCrit,
          breakdownMultipliers: breakDamageResult.breakdownMultipliers
        });
      }

      // Apply Break Effect (simplified with helper functions)
      const freshTarget = newState.registry.get(createUnitId(currentTarget.id));
      if (freshTarget) {
        // DEBUG: 弱点撃破前の状態
        console.log(`[DEBUG][WeaknessBreak] 弱点撃破前 - ${freshTarget.name}`);
        console.log(`  element: ${currentSource.element}`);
        console.log(`  AV: ${freshTarget.actionValue ?? 'undefined'}, SPD: ${freshTarget.stats?.spd ?? 'undefined'}`);
        console.log(`  Game Time: ${newState.time}`);

        if (currentSource.element === 'Quantum') {
          newState = handleQuantumBreak(newState, currentSource, freshTarget);
        } else {
          const effect = createBreakEffect(currentSource, freshTarget);
          if (effect) {
            console.log(`  禁錮効果: delayAmount=${(effect as BreakStatusEffect).delayAmount ?? 'undefined'}`);
            newState = applyBreakEffectWithDelay(newState, freshTarget, effect as BreakStatusEffect);
          }
        }

        // DEBUG: 弱点撃破後の状態
        const afterTarget = newState.registry.get(createUnitId(currentTarget.id));
        if (afterTarget) {
          console.log(`[DEBUG][WeaknessBreak] 弱点撃破後 - ${afterTarget.name}`);
          console.log(`  AV: ${afterTarget.actionValue ?? 'undefined'}, SPD: ${afterTarget.stats?.spd ?? 'undefined'}`);
        }

        // DEBUG: 全ユニットのAV出力
        const unitList = newState.registry.toArray();
        console.log(`[DEBUG][WeaknessBreak] 全ユニットAV (units.length=${unitList.length}):`);
        for (let i = 0; i < unitList.length; i++) {
          const u = unitList[i];
          if (u.hp > 0) {
            console.log(`  [${i}] ${u.name}: AV=${u.actionValue}, SPD=${u.stats?.spd}`);
          }
        }
      }
    }

    // ★ ON_AFTER_HIT: 各ヒットのダメージ計算後に発火
    const latestTarget = newState.registry.get(createUnitId(hit.targetId));
    newState = publishEvent(newState, {
      type: 'ON_AFTER_HIT',
      sourceId: source.id,
      targetId: hit.targetId,
      hitIndex: hit.hitIndex,
      damage: hitDetails[hitDetails.length - 1]?.damage || 0,
      isCrit: hitDetails[hitDetails.length - 1]?.isCrit || false,
      targetHp: latestTarget?.hp || 0,
      actionType: action.type
    } as IEvent);

    // Reset modifiers for next hit
    newState = { ...newState, damageModifiers: {} };
  }

  // Update Battle Result
  const currentStats = newState.result.characterStats[source.id] || { damageDealt: 0, healingDealt: 0, shieldProvided: 0 };
  newState = {
    ...newState,
    result: {
      ...newState.result,
      totalDamageDealt: newState.result.totalDamageDealt + totalDamage,
      characterStats: {
        ...newState.result.characterStats,
        [source.id]: {
          ...currentStats,
          damageDealt: currentStats.damageDealt + totalDamage
        }
      }
    }
  };

  return {
    ...context,
    state: newState,
    totalDamage,
    hitDetails,
    isBroken
  };
}

function stepApplyShield(context: ActionContext): ActionContext {
  const { source, action, state } = context;
  let ability: IAbility | undefined;
  if (action.type === 'SKILL') ability = source.abilities.skill;

  if (!ability || !ability.shield) return context;

  let totalShield = 0;
  let newState = state;

  let targets: Unit[] = [];
  if (action.type === 'SKILL' && (action as SkillAction).targetId) {
    const t = state.registry.get(createUnitId((action as SkillAction).targetId));
    if (t) targets = [t];
  }

  for (const target of targets) {
    const scalingStat = ability.shield.scaling;
    const scalingValue = source.stats[scalingStat] || 0;
    const multiplier = ability.shield.multiplier;
    const flat = ability.shield.flat;
    const shieldValue = scalingValue * multiplier + flat;
    totalShield += shieldValue;

    // Update Shield Value
    let targetInState = newState.registry.get(createUnitId(target.id));
    if (targetInState) {
      newState = applyShield(
        newState,
        source.id,
        target.id,
        { scaling: scalingStat as 'atk' | 'hp' | 'def', multiplier, flat },
        ability.shield.duration || 3,
        'TURN_END_BASED',
        'バリア',
        `shield-${source.id}-${target.id}`,
        true // skipLog: スキルログに統合されるため、ここでのログ出力はスキップ
      );
    }
  }

  // Event
  newState = publishEvent(newState, {
    type: 'ON_SKILL_USED',
    sourceId: source.id,
    targetId: targets[0]?.id,
    value: totalShield
  });

  return {
    ...context,
    state: newState,
    totalShield
  };
}

function stepEnergyGain(context: ActionContext): ActionContext {
  const { source, action, state } = context;
  let ability: IAbility | undefined;
  if (action.type === 'BASIC_ATTACK') ability = source.abilities.basic;
  else if (action.type === 'ENHANCED_BASIC_ATTACK') ability = source.abilities.enhancedBasic; // 強化通常攻撃
  else if (action.type === 'SKILL') ability = source.abilities.skill;
  else if (action.type === 'ULTIMATE') ability = source.abilities.ultimate;
  else if (action.type === 'FOLLOW_UP_ATTACK') ability = source.abilities.talent; // FuA support

  if (!ability) return context;

  const energyGain = ability.energyGain || 0;

  // Retrieve fresh unit state
  const unitInState = state.registry.get(createUnitId(source.id));
  if (!unitInState) return context;

  // 召喚ユニットはEPを得ない
  if (unitInState.isSummon) return context;

  // Calculate actual EP gain
  const oldEp = unitInState.ep;
  const updatedUnit = addEnergy(unitInState, energyGain);
  const actualGain = updatedUnit.ep - oldEp;

  // Use registry.update for consistency
  let newState = {
    ...state,
    registry: state.registry.update(createUnitId(source.id), u => ({ ...u, ep: updatedUnit.ep }))
  };

  // Publish ON_EP_GAINED event if EP was actually gained
  if (actualGain > 0) {
    newState = publishEvent(newState, {
      type: 'ON_EP_GAINED',
      sourceId: source.id,
      targetId: source.id,
      value: actualGain,
      epGained: actualGain
    });
  }

  return {
    ...context,
    state: newState
  };
}

function stepGenerateLog(context: ActionContext): ActionContext {
  const { action, source, state, totalDamage, totalShield, targets } = context;

  // currentActionLogが存在する場合は、プライマリダメージを更新
  // ただし、既存のhitDetailsがある場合はそれを保持する（ハンドラーが追加した場合）
  let newState = state;
  if (newState.currentActionLog) {
    const existingHitDetails = newState.currentActionLog.primaryDamage.hitDetails;
    const existingTotalDamage = newState.currentActionLog.primaryDamage.totalDamage;

    // context.hitDetailsが空でない場合は追加、そうでなければ既存を保持
    const mergedHitDetails = context.hitDetails.length > 0
      ? [...existingHitDetails, ...context.hitDetails]
      : existingHitDetails;
    const mergedTotalDamage = context.hitDetails.length > 0
      ? existingTotalDamage + totalDamage
      : existingTotalDamage;

    newState = {
      ...newState,
      currentActionLog: {
        ...newState.currentActionLog,
        primaryDamage: {
          hitDetails: mergedHitDetails,
          totalDamage: mergedTotalDamage
        }
      }
    };
  }

  return {
    ...context,
    state: newState
  };
}

/**
 * フェーズ3: アクションログを統合して最終ログを生成
 */
function stepFinalizeActionLog(context: ActionContext): ActionContext {
  const { action, source, state, targets } = context;
  const currentActionLog = state.currentActionLog;

  if (!currentActionLog) {
    // フォールバック: 旧ロジック
    return context;
  }

  // デバッグログ
  console.log(`[stepFinalizeActionLog] action=${action.type}, hitDetails count=${currentActionLog.primaryDamage.hitDetails.length}, totalDamage=${currentActionLog.primaryDamage.totalDamage.toFixed(2)}`);
  currentActionLog.primaryDamage.hitDetails.forEach((hit, i) => {
    console.log(`  [hitDetail ${i}] index=${hit.hitIndex}, name=${hit.targetName}, damage=${hit.damage.toFixed(2)}`);
  });

  const primaryTarget = targets[0] || source;
  const updatedSource = state.registry.get(createUnitId(source.id)) || source;
  const updatedTarget = state.registry.get(createUnitId(primaryTarget.id)) || primaryTarget; // Get updated target state

  const activeEffects = [
    ...extractBuffsForLogWithAuras(updatedSource, updatedSource.name, state),
    ...(primaryTarget.id !== updatedSource.id ? extractBuffsForLogWithAuras(updatedTarget, primaryTarget.name, state) : [])
  ];

  // 新しい形式の効果収集
  const sourceEffects = [
    ...extractBuffsForLogWithAuras(updatedSource, updatedSource.name, state, state.registry.toArray()),
    ...extractRelicStatsForLog(updatedSource)
  ];
  const targetEffects = primaryTarget.id !== updatedSource.id ? [
    ...extractBuffsForLogWithAuras(updatedTarget, primaryTarget.name, state, state.registry.toArray()),
    ...extractRelicStatsForLog(updatedTarget)
  ] : [];

  // 統計の集計
  const calculateStatTotals = (effects: EffectSummary[]) => {
    const totals: { [key: string]: number } = {};
    effects.forEach(e => {
      if (e.modifiers) {
        e.modifiers.forEach(m => {
          totals[m.stat] = (totals[m.stat] || 0) + m.value;
        });
      }
    });
    return totals;
  };

  const statTotalsSource = calculateStatTotals(sourceEffects);
  const statTotalsTarget = calculateStatTotals(targetEffects);

  const statTotals = {
    source: statTotalsSource,
    target: statTotalsTarget
  };

  // Calculate Final Stats (New)
  const sourceFinalStats = recalculateUnitStats(updatedSource, state.registry.toArray());
  const targetFinalStats = recalculateUnitStats(updatedTarget, state.registry.toArray());

  // 集計
  const totalDamageDealt = currentActionLog.primaryDamage.totalDamage
    + currentActionLog.additionalDamage.reduce((sum, e) => sum + e.damage, 0)
    + currentActionLog.dotDetonations.reduce((sum, e) => sum + e.damage, 0);

  const totalDamageTaken = currentActionLog.damageTaken.reduce((sum, e) => sum + e.damage, 0);

  const totalHealing = currentActionLog.healing.reduce((sum, e) => sum + e.amount, 0);

  const totalShieldGiven = currentActionLog.shields.reduce((sum, e) => sum + e.amount, 0);

  const logEntry: SimulationLogEntry = {
    characterName: currentActionLog.primarySourceName,
    actionTime: currentActionLog.startTime,
    actionType: currentActionLog.primaryActionType,
    skillPointsAfterAction: state.skillPoints,

    // 集計値（簡易表示）
    totalDamageDealt,
    totalDamageTaken,
    totalHealing,
    totalShieldGiven,

    // 詳細情報（トグル内）
    logDetails: {
      primaryDamage: currentActionLog.primaryDamage.totalDamage > 0 ? currentActionLog.primaryDamage : undefined,
      additionalDamage: currentActionLog.additionalDamage.length > 0 ? currentActionLog.additionalDamage : undefined,
      damageTaken: currentActionLog.damageTaken.length > 0 ? currentActionLog.damageTaken : undefined,
      healing: currentActionLog.healing.length > 0 ? currentActionLog.healing : undefined,
      shields: currentActionLog.shields.length > 0 ? currentActionLog.shields : undefined,
      dotDetonations: currentActionLog.dotDetonations.length > 0 ? currentActionLog.dotDetonations : undefined,
      equipmentEffects: currentActionLog.equipmentEffects.length > 0 ? currentActionLog.equipmentEffects : undefined,
    },

    // 後方互換性
    damageDealt: totalDamageDealt,
    healingDone: totalHealing,
    shieldApplied: totalShieldGiven,
    sourceHpState: `${updatedSource.hp.toFixed(0)}+${updatedSource.shield.toFixed(0)}/${updatedSource.stats.hp.toFixed(0)}`,
    targetHpState: `${primaryTarget.hp.toFixed(0)}+${primaryTarget.shield.toFixed(0)}/${primaryTarget.stats.hp.toFixed(0)}`,
    targetToughness: `${primaryTarget.toughness}/${primaryTarget.maxToughness}`,
    currentEp: updatedSource.ep,
    activeEffects: activeEffects,
    sourceEffects,
    targetEffects,
    statTotals: {
      source: statTotalsSource,
      target: statTotalsTarget
    },
    sourceFinalStats: sourceFinalStats,
    targetFinalStats: targetFinalStats,
    sourceId: updatedSource.id,
    targetId: primaryTarget.id,
    hitDetails: currentActionLog.primaryDamage.hitDetails,
  };

  // ログに追加し、currentActionLogをリセット
  const newState: GameState = {
    ...state,
    log: [...state.log, logEntry],
    currentActionLog: undefined
  };

  return {
    ...context,
    state: newState
  };
}

type IEffectDef = NonNullable<IAbility['effects']>[number];

function calculateEffectSuccess(source: Unit, target: Unit, effectDef: IEffectDef, hits: number = 1): boolean {
  // ★ NEW: 固定確率フラグチェック
  // ignoreResistanceがtrueの場合、効果命中と効果抵抗を無視し、基礎確率のみで判定
  if ((effectDef as any).ignoreResistance === true) {
    const baseChance = effectDef.baseChance ?? 1.0;
    // 基礎確率のみで判定
    const realChance = baseChance;

    // Roll
    for (let i = 0; i < hits; i++) {
      if (Math.random() < realChance) {
        return true;
      }
    }
    return false;
  }

  // 1. Calculate Real Chance
  const baseChance = effectDef.baseChance ?? 1.0;
  const ehr = source.stats.effect_hit_rate || 0;
  const res = target.stats.effect_res || 0;
  const crowdControlRes = target.stats.crowd_control_res || 0;

  // Specific RES check
  let specificRes = 0;
  if (effectDef.type === 'Freeze') specificRes = target.stats.frozen_res || 0;
  else if (effectDef.type === 'Burn') specificRes = target.stats.burn_res || 0;
  else if (effectDef.type === 'Shock') specificRes = target.stats.shock_res || 0;
  else if (effectDef.type === 'WindShear') specificRes = target.stats.wind_shear_res || 0;
  else if (effectDef.type === 'Bleed') specificRes = target.stats.bleed_res || 0;
  else if (effectDef.type === 'Entanglement') specificRes = target.stats.entanglement_res || 0;
  else if (effectDef.type === 'Imprisonment') specificRes = target.stats.imprisonment_res || 0;

  let realChance = 0;
  if (effectDef.type === 'Buff') {
    realChance = baseChance;
  } else {
    // Note: Crowd Control RES is separate from Effect RES
    // Assuming Crowd Control RES applies to all debuffs for now, or we need to distinguish CC from DoT
    // Usually CC RES applies to Freeze, Imprisonment, Entanglement, Domination, Outrage.
    // DoT RES is usually just Effect RES + Specific RES.

    let ccResMultiplier = 1.0;
    if (['Freeze', 'Imprisonment', 'Entanglement'].includes(effectDef.type || '')) {
      ccResMultiplier = (1 - crowdControlRes);
    }

    realChance = baseChance * (1 + ehr) * (1 - res) * ccResMultiplier * (1 - specificRes);
  }

  // 2. Roll
  // If any hit succeeds, the effect is applied.
  for (let i = 0; i < hits; i++) {
    if (Math.random() < realChance) {
      return true;
    }
  }
  return false;
}

function createEffectInstance(source: Unit, target: Unit, effectDef: IEffectDef): IEffect | null {
  if (effectDef.type === 'Buff') {
    return {
      id: `buff-${source.id}-${target.id}-${Date.now()}`,
      name: effectDef.name || 'Buff',
      category: 'BUFF',
      sourceUnitId: source.id,
      durationType: 'TURN_END_BASED',
      skipFirstTurnDecrement: true,
      duration: effectDef.duration || 2,
      onApply: (t, s) => {
        if (effectDef.modifiers) {
          const newModifiers = [...t.modifiers, ...effectDef.modifiers.map(m => ({
            ...m,
            source: effectDef.name || 'Buff'
          }))];
          return {
            ...s,
            registry: s.registry.update(t.id, unit => ({ ...unit, modifiers: newModifiers }))
          };
        }
        return s;
      },
      onRemove: (t, s) => {
        if (effectDef.modifiers) {
          const newModifiers = t.modifiers.filter(m => m.source !== (effectDef.name || 'Buff'));
          return {
            ...s,
            registry: s.registry.update(t.id, unit => ({ ...unit, modifiers: newModifiers }))
          };
        }
        return s;
      },
      apply: (t, s) => s,
      remove: (t, s) => s
    };
  } else if (effectDef.type === 'Freeze') {
    return {
      id: `freeze-${target.id}`,
      name: '凍結',
      category: 'STATUS',
      type: 'BreakStatus',
      statusType: 'Freeze',
      sourceUnitId: source.id,
      durationType: 'TURN_END_BASED',
      skipFirstTurnDecrement: true,
      duration: 1,
      frozen: true,
      onApply: (t, s) => s,
      onRemove: (t, s) => s,
      onTick: (t, s) => s,
      apply: (t, s) => s,
      remove: (t, s) => s
    } as import('../effect/types').BreakStatusEffect;
  }
  return null;
}

function applySingleEffect(state: GameState, source: Unit, target: Unit, effectDef: IEffectDef, hits: number): GameState {
  // 1. Check Success
  if (!calculateEffectSuccess(source, target, effectDef, hits)) {
    return state;
  }

  // 2. Apply
  let newState = state;

  if (effectDef.type === 'Cleanse') {
    newState = cleanse(newState, target.id);
  } else {
    const effectInstance = createEffectInstance(source, target, effectDef);
    if (effectInstance) {
      newState = addEffect(newState, target.id, effectInstance);
    }
  }

  return newState;
}

function stepApplyAbilityEffects(context: ActionContext): ActionContext {
  const { action, source, targets, state } = context;
  let ability: IAbility | undefined;
  if (action.type === 'BASIC_ATTACK') ability = source.abilities.basic;
  else if (action.type === 'SKILL') ability = source.abilities.skill;
  else if (action.type === 'ULTIMATE') ability = source.abilities.ultimate;
  else if (action.type === 'FOLLOW_UP_ATTACK') ability = source.abilities.talent;

  if (!ability || !ability.effects || ability.effects.length === 0) return context;

  let newState = state;

  for (const effectDef of ability.effects) {
    // Determine targets for this effect
    let effectTargets: Unit[] = [];
    if (effectDef.target === 'target') effectTargets = targets;
    else if (effectDef.target === 'self') effectTargets = [source];
    else if (effectDef.target === 'all_enemies') effectTargets = state.registry.getAliveEnemies();
    else if (effectDef.target === 'all_allies') effectTargets = state.registry.getAliveAllies();

    // Get hit count from damage definition
    let hits = 1;
    if (ability.damage) {
      if (ability.damage.type === 'simple' || ability.damage.type === 'bounce' || ability.damage.type === 'aoe') {
        hits = ability.damage.hits?.length || 1;
      } else if (ability.damage.type === 'blast') {
        // For blast, use mainHits length
        hits = ability.damage.mainHits?.length || 1;
      }
    }

    for (const target of effectTargets) {
      newState = applySingleEffect(newState, source, target, effectDef, hits);
    }
  }
  return {
    ...context,
    state: newState
  };
}

function stepPublishActionEvents(context: ActionContext): ActionContext {
  const { action, source, state, targets } = context;
  let newState = state;

  // 攻撃かどうかを判定
  let isAttackAction = false;
  let targetId: string | undefined;

  if (action.type === 'ULTIMATE') {
    targetId = (action as UltimateAction).targetId;
    newState = publishEvent(newState, {
      type: 'ON_ULTIMATE_USED',
      sourceId: source.id,
      targetId: targetId,
      targetType: source.abilities.ultimate?.targetType,
      value: 0
    });
    // 必殺技がダメージを持つ場合のみ攻撃扱い
    if (source.abilities.ultimate?.damage) {
      isAttackAction = true;
    }
  } else if (action.type === 'BASIC_ATTACK') {
    targetId = (action as BasicAttackAction).targetId;
    newState = publishEvent(newState, {
      type: 'ON_BASIC_ATTACK',
      sourceId: source.id,
      targetId: targetId,
      targetType: source.abilities.basic?.targetType,
      value: 0
    });
    isAttackAction = true; // 通常攻撃は常に攻撃
  } else if (action.type === 'ENHANCED_BASIC_ATTACK') {
    targetId = (action as EnhancedBasicAttackAction).targetId;
    newState = publishEvent(newState, {
      type: 'ON_ENHANCED_BASIC_ATTACK',
      sourceId: source.id,
      targetId: targetId,
      targetType: source.abilities.enhancedBasic?.targetType,
      value: 0
    });
    isAttackAction = true; // 強化通常攻撃も攻撃
  } else if (action.type === 'SKILL') {
    targetId = (action as SkillAction).targetId;
    newState = publishEvent(newState, {
      type: 'ON_SKILL_USED',
      sourceId: source.id,
      targetId: targetId,
      targetType: source.abilities.skill?.targetType,
      value: 0
    });
    // スキルがダメージを持つ場合のみ攻撃扱い
    if (source.abilities.skill?.damage) {
      isAttackAction = true;
    }
  } else if (action.type === 'FOLLOW_UP_ATTACK') {
    targetId = (action as FollowUpAttackAction).targetId;
    newState = publishEvent(newState, {
      type: 'ON_FOLLOW_UP_ATTACK',
      sourceId: source.id,
      targetId: targetId,
      targetType: source.abilities.talent?.targetType,
      value: 0
    });
    isAttackAction = true; // 追加攻撃は常に攻撃
  }

  // ★ 統合的なON_ATTACKイベント発火（攻撃アクションの場合）
  if (isAttackAction) {
    newState = publishEvent(newState, {
      type: 'ON_ATTACK',
      sourceId: source.id,
      targetId: targetId,
      value: 0,
      subType: action.type, // どの攻撃タイプかを含める
      targetCount: targets.length
    });
  }

  return {
    ...context,
    state: newState
  };
}

/**
 * Step: Publish ON_ACTION_COMPLETE event
 * This event fires after all hits are processed, damage is dealt, and energy is gained.
 * Used for effects that trigger after all damage calculation is done (e.g., Tribbie's field).
 */
function stepPublishActionCompleteEvent(context: ActionContext): ActionContext {
  const { action, source, state, totalDamage, targets } = context;

  const event: IEvent = {
    type: 'ON_ACTION_COMPLETE',
    sourceId: source.id,
    targetId: undefined, // No single target for this event
    value: totalDamage,  // Total damage dealt by the action
    subType: action.type,
    targetCount: targets.length
  };

  const newState = publishEvent(state, event);

  return {
    ...context,
    state: newState
  };
}

/**
 * Step: Check and publish ON_ENEMY_SPAWNED event for newly spawned enemies
 * This step fires after ON_ACTION_COMPLETE.
 * Currently, this is a placeholder for future enemy spawning logic.
 * When enemies are spawned, each new enemy will trigger an ON_ENEMY_SPAWNED event.
 */
function stepCheckEnemySpawn(context: ActionContext): ActionContext {
  const { state } = context;
  let newState = state;

  // 将来の敵スポーン処理用プレースホルダー
  // 現在は細かい敵のスポーンは未実装
  // 敵がスポーンした場合、以下のようにイベントを発火:
  // const spawnedEnemies = getNewlySpawnedEnemies(state);
  // for (const enemy of spawnedEnemies) {
  //   newState = publishEvent(newState, {
  //     type: 'ON_ENEMY_SPAWNED',
  //     sourceId: 'system',
  //     targetId: enemy.id
  //   });
  // }

  return {
    ...context,
    state: newState
  };
}

// --- Orchestrator ---

function resolveAction(state: GameState, action: Action): GameState {
  // We assume action is a CombatAction here because dispatchInternal only calls this for combat actions.
  // However, for type safety, we can check or cast.
  const combatAction = action as CombatAction;
  const source = state.registry.get(createUnitId(combatAction.sourceId));
  if (!source) return state;

  let context: ActionContext = {
    action,
    source,
    targets: [],
    hits: [],
    state,
    damageModifiers: {},
    totalDamage: 0,
    totalHealing: 0,
    totalShield: 0,
    hitDetails: [],
    isBroken: false
  };

  // Validation: Check Skill Points for Skill Actions
  if (action.type === 'SKILL') {
    const skillAbility = source.abilities.skill;
    const cost = skillAbility?.spCost ?? 1; // Default cost is 1
    if (state.skillPoints < cost) {
      console.warn(`[resolveAction] Skipped SKILL action due to insufficient SP. Required: ${cost}, Current: ${state.skillPoints}`);
      return state;
    }
  }

  // アクションログを初期化
  const actionTypeName = action.type === 'BASIC_ATTACK' ? '通常攻撃'
    : action.type === 'ENHANCED_BASIC_ATTACK' ? '強化通常攻撃'
      : action.type === 'SKILL' ? 'スキル'
        : action.type === 'ULTIMATE' ? '必殺技'
          : '追加攻撃';

  // ★敵のターン開始時に蓄積したDoTダメージ（additionalDamage）を保存
  const previousAdditionalDamage = context.state.currentActionLog?.additionalDamage || [];
  const previousDamageTaken = context.state.currentActionLog?.damageTaken || [];

  context.state = initializeCurrentActionLog(context.state, source.id, source.name, actionTypeName);

  // ★保存したDoTダメージを復元
  if ((previousAdditionalDamage.length > 0 || previousDamageTaken.length > 0) && context.state.currentActionLog) {
    context.state = {
      ...context.state,
      currentActionLog: {
        ...context.state.currentActionLog,
        additionalDamage: previousAdditionalDamage,
        damageTaken: previousDamageTaken
      }
    };
  }


  // ★ ON_BEFORE_ACTION: すべての行動前に発火
  context.state = publishEvent(context.state, {
    type: 'ON_BEFORE_ACTION',
    sourceId: source.id,
    actionType: action.type
  } as IEvent);

  // ★ ON_BEFORE_ATTACK: 攻撃行動（ダメージを与える行動）の前に発火
  const isAttackAction = ['BASIC_ATTACK', 'ENHANCED_BASIC_ATTACK', 'SKILL', 'ULTIMATE', 'FOLLOW_UP_ATTACK'].includes(action.type);
  if (isAttackAction) {
    const targetId = (action as CombatAction).targetId;
    context.state = publishEvent(context.state, {
      type: 'ON_BEFORE_ATTACK',
      sourceId: source.id,
      targetId: targetId,
      actionType: action.type
    } as IEvent);
  }

  // Pipeline
  context = stepPayCost(context);
  context = stepGenerateHits(context);
  context = stepProcessHits(context);
  context = stepApplyShield(context);
  context = stepEnergyGain(context);
  context = stepPublishActionEvents(context);  // ON_ULTIMATE_USEDなどのイベント発火
  context = stepGenerateLog(context);  // プライマリダメージをcurrentActionLogに記録（ハンドラーが追加した後）
  context = stepApplyAbilityEffects(context);
  context = stepPublishActionCompleteEvent(context);  // Fire ON_ACTION_COMPLETE
  context = stepCheckEnemySpawn(context);  // Check for newly spawned enemies
  context = stepFinalizeActionLog(context);  // 統合ログを生成

  return context.state;
}

function handleActionAdvance(state: GameState, action: ActionAdvanceAction): GameState {
  const target = state.registry.get(createUnitId(action.targetId));
  if (!target) return state;

  // 召喚ユニットは原則として行動順変化の影響を受けない（明示的な指定がない限り）
  if (target.isSummon) return state;

  // Use unified advanceUnitAction function
  return advanceUnitAction(state, createUnitId(action.targetId), action.percent, 'percent');
}

function handleBattleStart(state: GameState, action: BattleStartAction): GameState {
  // 1. Register Relic Handlers
  let newState = registerRelicEventHandlers(state);

  // 2. Initial Passive Buff Update
  newState = updatePassiveBuffs(newState);

  const event: IEvent = {
    type: 'ON_BATTLE_START',
    sourceId: 'system',
  };
  return publishEvent(newState, event);
}

function handleRegisterHandlers(state: GameState, action: RegisterHandlersAction): GameState {
  const newHandlers = [...state.eventHandlers];
  const newLogics = { ...state.eventHandlerLogics };

  for (const { metadata, logic } of action.handlers) {
    if (newLogics[metadata.id]) {
      console.warn(`Event handler ID conflict detected: ${metadata.id}. Skipping registration.`);
      continue;
    }
    newHandlers.push(metadata);
    newLogics[metadata.id] = logic;
  }

  return {
    ...state,
    eventHandlers: newHandlers,
    eventHandlerLogics: newLogics,
  };
}

export function dispatch(state: GameState, action: Action): GameState {
  let currentState = dispatchInternal(state, action);

  // Process Pending Actions (Action Stack/Queue)
  // We use a loop to process all pending actions that might be generated by triggers
  // Limit iterations to prevent infinite loops
  let iterations = 0;
  const MAX_ITERATIONS = 100;

  while (currentState.pendingActions && currentState.pendingActions.length > 0) {
    if (iterations > MAX_ITERATIONS) {
      console.error('Infinite loop detected in pending actions queue.');
      break;
    }

    const nextAction = currentState.pendingActions.shift()!;
    // We need to update the state to reflect the shifted action
    // But wait, shift() modifies the array in place. 
    // Since GameState should be immutable-ish, we should probably slice.
    // However, for performance in this loop, let's assume we are working on a mutable clone or handle it carefully.
    // Actually, let's do it properly:

    const remainingActions = [...currentState.pendingActions]; // Clone
    currentState = { ...currentState, pendingActions: remainingActions }; // Update state with removed action

    currentState = dispatchInternal(currentState, nextAction);
    iterations++;
  }

  return currentState;
}

function dispatchInternal(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'REGISTER_HANDLERS':
      return handleRegisterHandlers(state, action);
    case 'BATTLE_START':
      return handleBattleStart(state, action);
    case 'BASIC_ATTACK':
    case 'ENHANCED_BASIC_ATTACK': // 強化通常攻撃
    case 'SKILL':
    case 'ULTIMATE':
    case 'FOLLOW_UP_ATTACK':
      return resolveAction(state, action);
    case 'ACTION_ADVANCE':
      return handleActionAdvance(state, action);
    default:
      return state;
  }
}
