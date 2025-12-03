import { GameState, Unit, IEventHandlerLogic, IEventHandler, ActionContext, Action, BasicAttackAction, SkillAction, UltimateAction, BattleStartAction, RegisterHandlersAction, ActionAdvanceAction, FollowUpAttackAction, IEvent, IHit, DamageOptions, DamageResult, CombatAction } from './types';
import { SimulationLogEntry, IAbility } from '../../types/index';
import { calculateDamage, DamageCalculationModifiers, calculateToughnessReduction, calculateBreakDamage, calculateSuperBreakDamage } from '../damage';
import { createBreakEffect } from '../effect/breakEffects';
import { BreakStatusEffect, IEffect, ShieldEffect } from '../effect/types';
import { isBreakStatusEffect, isShieldEffect } from '../effect/utils';
import { addEffect, removeEffect } from './effectManager';
import { updateUnit } from './gameState';
import { updatePassiveBuffs, registerRelicEventHandlers } from '../effect/relicHandler';
import { addEnergy } from './energy';
import { recalculateActionValueFromActionPoint } from './actionValue';
import { ENEMY_DEFEAT_ENERGY_REWARD } from './constants';
import { cleanse, applyShield } from './utils';

// --- Helper Functions ---

function extractBuffsForLog(unit: Unit, ownerName: string): { name: string; duration: number | '∞'; stackCount?: number; owner?: string }[] {
  return unit.effects.map(effect => ({
    name: effect.name,
    duration: effect.durationType === 'PERMANENT' ? '∞' : effect.duration,
    stackCount: (effect as any).stackCount,
    owner: ownerName,
  }));
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

  // DEBUG: Log effects after ON_BATTLE_START
  if (event.type === 'ON_BATTLE_START') {
    console.log('[publishEvent] Units after ON_BATTLE_START:');
    newState.units.forEach(u => {
      console.log(`  - ${u.name}: ${u.effects.length} effects`, u.effects.map(e => e.name));
    });
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
  // 1. Apply Damage
  const targetAfterDamage = applyDamage(target, damage);
  let killed = false;
  let newState = {
    ...state,
    units: state.units.map(u => u.id === target.id ? targetAfterDamage : u)
  };

  // 2. Kill Logic (EP Recovery)
  if (targetAfterDamage.hp <= 0 && target.hp > 0) { // Newly killed
    killed = true;
    if (options.isKillRecoverEp) {
      const killer = newState.units.find(u => u.id === source.id);
      if (killer) {
        const updatedKiller = addEnergy(killer, ENEMY_DEFEAT_ENERGY_REWARD);
        newState = { ...newState, units: newState.units.map(u => u.id === killer.id ? updatedKiller : u) };
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
      newState = publishEvent(newState, {
        ...event.payload,
        type: event.type,
        sourceId: source.id,
        targetId: target.id,
        value: damage
      });
    }
  }

  return { state: newState, totalDamage: damage, killed };
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

  // 2. Apply delay if effect has delayAmount
  if (effect.delayAmount) {
    const delayAdvance = -10000 * effect.delayAmount;
    targetWithEffect.actionPoint += delayAdvance;
    targetWithEffect = recalculateActionValueFromActionPoint(targetWithEffect);
  }

  // 3. Update state
  return {
    ...state,
    units: state.units.map(u => u.id === target.id ? targetWithEffect : u)
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
      units: state.units.map(u => u.id === target.id ? target : u)
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
  let newSkillPoints = state.skillPoints;
  let updatedSource = state.units.find(u => u.id === source.id) || source;

  if (action.type === 'BASIC_ATTACK') {
    const spGain = source.isEnemy ? 0 : 1;
    newSkillPoints = Math.min(state.maxSkillPoints, state.skillPoints + spGain);
  } else if (action.type === 'SKILL') {
    const skillAbility = source.abilities.skill;
    const cost = skillAbility?.spCost ?? 1; // Use spCost from ability definition, default to 1
    console.log(`[Archer] Paying SP cost: ${cost}/${state.skillPoints}`);
    newSkillPoints = state.skillPoints - cost;
  } else if (action.type === 'ULTIMATE') {
    // Consume EP
    updatedSource = { ...updatedSource, ep: 0 };
  }

  const updatedUnits = state.units.map(u => u.id === source.id ? updatedSource : u);

  return {
    ...context,
    state: { ...state, skillPoints: newSkillPoints, units: updatedUnits }
  };
}

function stepGenerateHits(context: ActionContext): ActionContext {
  const { action, state } = context;
  let targets: Unit[] = [];
  let hits: IHit[] = [];

  // Helper to get ability based on action type
  const sourceId = (action as CombatAction).sourceId;
  const source = state.units.find(u => u.id === sourceId);
  if (!source) return context;

  let ability: IAbility | undefined;
  if (action.type === 'BASIC_ATTACK') ability = source.abilities.basic;
  else if (action.type === 'SKILL') ability = source.abilities.skill;
  else if (action.type === 'ULTIMATE') ability = source.abilities.ultimate;
  else if (action.type === 'FOLLOW_UP_ATTACK') ability = source.abilities.talent;

  if (!ability) return context;

  const targetId = (action as CombatAction).targetId;
  const primaryTarget = state.units.find(u => u.id === targetId);

  // Default to primary target if available
  if (primaryTarget) {
    targets.push(primaryTarget);
  }

  // Handle Target Types
  if (ability.targetType === 'all_enemies') {
    targets = state.units.filter(u => u.isEnemy && u.hp > 0);
  } else if (ability.targetType === 'blast' && primaryTarget) {
    const enemies = state.units.filter(u => u.isEnemy && u.hp > 0);
    const enemyIndex = enemies.findIndex(u => u.id === primaryTarget.id);
    if (enemyIndex !== -1) {
      const adjacentIndices = [enemyIndex - 1, enemyIndex + 1];
      adjacentIndices.forEach(idx => {
        if (enemies[idx]) targets.push(enemies[idx]);
      });
    }
    targets = Array.from(new Set(targets));
  } else if (ability.targetType === 'bounce') {
    const enemies = state.units.filter(u => u.isEnemy && u.hp > 0);
    if (enemies.length > 0) {
      targets = []; // Reset targets for Bounce
      // For Bounce, we don't just populate 'targets', we need to generate hits directly.
      // But for compatibility with other steps (like effects), we might want to populate unique targets too.
    }
  } else if (ability.targetType === 'all_allies') {
    targets = state.units.filter(u => !u.isEnemy && u.hp > 0);
  } else if (ability.targetType === 'ally' && primaryTarget) {
    targets = [primaryTarget];
  } else if (ability.targetType === 'self') {
    targets = [source];
  }

  // Generate Hits based on Damage Logic
  if (ability.damage) {
    const damageDef = ability.damage;

    if (damageDef.type === 'simple') {
      // Apply to all identified targets
      hits = targets.map((t, index) => ({
        targetId: t.id,
        scaling: damageDef.scaling,
        multiplier: damageDef.multiplier,
        hitIndex: index,
        isMainTarget: t.id === primaryTarget?.id,
        hitType: t.id === primaryTarget?.id ? 'main' : 'other'
      }));
    } else if (damageDef.type === 'blast') {
      // Main Target gets mainMultiplier, others get adjacentMultiplier
      hits = targets.map((t, index) => {
        const isMain = t.id === primaryTarget?.id;
        return {
          targetId: t.id,
          scaling: damageDef.scaling,
          multiplier: isMain ? damageDef.mainMultiplier : damageDef.adjacentMultiplier,
          hitIndex: index,
          isMainTarget: isMain,
          hitType: isMain ? 'main' : 'adjacent'
        };
      });
    } else if (damageDef.type === 'bounce') {
      const enemies = state.units.filter(u => u.isEnemy && u.hp > 0);
      if (enemies.length > 0) {
        const multipliers = damageDef.multipliers;
        hits = multipliers.map((multiplier, index) => {
          const randomIndex = Math.floor(Math.random() * enemies.length);
          const target = enemies[randomIndex];
          // Add to targets list if unique (for other steps)
          if (!targets.find(t => t.id === target.id)) {
            targets.push(target);
          }
          return {
            targetId: target.id,
            scaling: damageDef.scaling,
            multiplier: multiplier,
            hitIndex: index,
            isMainTarget: false, // Bounce usually doesn't have a "main" target in the traditional sense
            hitType: 'bounce'
          };
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

  // Determine Ability (Needed for toughness reduction calculation)
  let ability: IAbility | undefined;
  if (action.type === 'BASIC_ATTACK') ability = source.abilities.basic;
  else if (action.type === 'SKILL') ability = source.abilities.skill;
  else if (action.type === 'ULTIMATE') ability = source.abilities.ultimate;
  else if (action.type === 'FOLLOW_UP_ATTACK') ability = source.abilities.talent;

  if (!hits || hits.length === 0) return context;

  for (const hit of hits) {
    // Fetch fresh target from newState
    const currentTarget = newState.units.find(u => u.id === hit.targetId);
    if (!currentTarget) continue;

    let currentDamageModifiers: DamageCalculationModifiers = {};

    // 1. Pre-Damage Event
    const beforeDmgEvent: IEvent = {
      type: 'ON_BEFORE_DAMAGE_CALCULATION',
      sourceId: source.id,
      targetId: currentTarget.id,
      value: 0,
    };
    newState = publishEvent(newState, beforeDmgEvent);
    currentDamageModifiers = newState.damageModifiers;

    // 2. Calculate Damage
    const currentSource = newState.units.find(u => u.id === source.id) || source;

    const hitAbility: IAbility = {
      ...ability!,
      damage: {
        type: 'simple',
        scaling: hit.scaling,
        multiplier: hit.multiplier
      }
    };

    let toughnessReduction = 0;
    let newToughness = currentTarget.toughness;
    let targetIsBroken = false;
    let breakDamage = 0;
    let superBreakDamage = 0;
    let updatedTarget = currentTarget;

    if (currentTarget.weaknesses.has(currentSource.element)) {
      toughnessReduction = calculateToughnessReduction(currentSource, ability!, currentDamageModifiers, undefined, hit.hitType);

      // Legacy behavior: If toughnessReduction is a simple number and hit is adjacent, halve it.
      // If it's an object, calculateToughnessReduction already returned the correct adjacent value.
      if (typeof ability!.toughnessReduction === 'number' && hit.hitType === 'adjacent') {
        toughnessReduction = Math.floor(toughnessReduction / 2);
      }

      if (currentTarget.toughness > 0) {
        newToughness = Math.max(0, currentTarget.toughness - toughnessReduction);
        if (newToughness <= 0) {
          targetIsBroken = true;
          isBroken = true;
          breakDamage = calculateBreakDamage(currentSource, currentTarget, currentDamageModifiers);
        }
      }
    }

    updatedTarget = { ...updatedTarget, toughness: newToughness };

    // 3. Apply Damage
    const damage = calculateDamage(currentSource, updatedTarget, hitAbility, action, currentDamageModifiers);
    totalDamage += damage;

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
    updatedTarget = newState.units.find(u => u.id === updatedTarget.id)!;

    if (targetIsBroken) {
      const breakEvent: IEvent = {
        type: 'ON_WEAKNESS_BREAK',
        sourceId: currentSource.id,
        targetId: currentTarget.id,
        value: breakDamage,
      };
      newState = publishEvent(newState, breakEvent);

      // Apply Break Effect (simplified with helper functions)
      const freshTarget = newState.units.find(u => u.id === currentTarget.id);
      if (freshTarget) {
        if (currentSource.element === 'Quantum') {
          newState = handleQuantumBreak(newState, currentSource, freshTarget);
        } else {
          const effect = createBreakEffect(currentSource, freshTarget);
          if (effect) {
            newState = applyBreakEffectWithDelay(newState, freshTarget, effect as BreakStatusEffect);
          }
        }
      }
    }

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
    const t = state.units.find(u => u.id === (action as SkillAction).targetId);
    if (t) targets = [t];
  }

  for (const target of targets) {
    const scalingStat = ability.shield.scaling;
    const shieldValue = source.stats[scalingStat] * ability.shield.multiplier + ability.shield.flat;
    totalShield += shieldValue;

    // Update Shield Value
    let targetInState = newState.units.find(u => u.id === target.id);
    if (targetInState) {
      newState = applyShield(
        newState,
        source.id,
        target.id,
        shieldValue,
        ability.shield.duration || 3,
        'DURATION_BASED',
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
  else if (action.type === 'SKILL') ability = source.abilities.skill;
  else if (action.type === 'ULTIMATE') ability = source.abilities.ultimate;
  else if (action.type === 'FOLLOW_UP_ATTACK') ability = source.abilities.talent; // FuA support

  if (!ability) return context;

  const energyGain = ability.energyGain || 0;

  // Retrieve fresh unit state
  const unitInState = state.units.find(u => u.id === source.id);
  if (!unitInState) return context;

  let updatedUnit = unitInState;

  // Apply Energy Gain with ERR
  updatedUnit = addEnergy(updatedUnit, energyGain);

  const updatedUnits = state.units.map(u => u.id === source.id ? updatedUnit : u);

  return {
    ...context,
    state: { ...state, units: updatedUnits }
  };
}

function stepGenerateLog(context: ActionContext): ActionContext {
  const { action, source, state, totalDamage, totalShield, targets } = context;

  // Simplified log generation - taking first target for display if multiple
  const primaryTarget = targets[0] || source; // Fallback to source if no target (e.g. self buff)
  const updatedSource = state.units.find(u => u.id === source.id) || source;

  const activeEffects = [
    ...extractBuffsForLog(updatedSource, updatedSource.name),
    ...(primaryTarget.id !== updatedSource.id ? extractBuffsForLog(primaryTarget, primaryTarget.name) : [])
  ];

  console.log(`[SimulationLog] Action: ${action.type}, Source: ${updatedSource.name}, Active Effects:`, activeEffects);

  const logEntry: SimulationLogEntry = {
    characterName: updatedSource.name,
    actionTime: state.time,
    actionType: action.type === 'BASIC_ATTACK' ? '通常攻撃' : action.type === 'SKILL' ? 'スキル' : action.type === 'ULTIMATE' ? '必殺技' : '追加攻撃',
    skillPointsAfterAction: state.skillPoints,
    damageDealt: totalDamage,
    healingDone: 0,
    shieldApplied: totalShield,
    sourceHpState: `${updatedSource.hp.toFixed(0)}+${updatedSource.shield.toFixed(0)}/${updatedSource.stats.hp.toFixed(0)}`,
    targetHpState: `${primaryTarget.hp.toFixed(0)}+${primaryTarget.shield.toFixed(0)}/${primaryTarget.stats.hp.toFixed(0)}`,
    targetToughness: `${primaryTarget.toughness}/${primaryTarget.maxToughness}`,
    currentEp: updatedSource.ep,
    activeEffects: activeEffects,
  };

  return {
    ...context,
    state: { ...state, log: [...state.log, logEntry] }
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
      durationType: 'DURATION_BASED',
      duration: effectDef.duration || 2,
      onApply: (t, s) => {
        if (effectDef.modifiers) {
          const newModifiers = [...t.modifiers, ...effectDef.modifiers.map(m => ({
            ...m,
            source: effectDef.name || 'Buff'
          }))];
          return updateUnit(s, t.id, { modifiers: newModifiers });
        }
        return s;
      },
      onRemove: (t, s) => {
        if (effectDef.modifiers) {
          const newModifiers = t.modifiers.filter(m => m.source !== (effectDef.name || 'Buff'));
          return updateUnit(s, t.id, { modifiers: newModifiers });
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
      durationType: 'DURATION_BASED',
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
    else if (effectDef.target === 'all_enemies') effectTargets = state.units.filter(u => u.isEnemy && u.hp > 0);
    else if (effectDef.target === 'all_allies') effectTargets = state.units.filter(u => !u.isEnemy && u.hp > 0);

    const hits = ability.hits || 1;

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
  const { action, source, state } = context;
  let newState = state;

  if (action.type === 'ULTIMATE') {
    newState = publishEvent(newState, {
      type: 'ON_ULTIMATE_USED',
      sourceId: source.id,
      targetId: (action as UltimateAction).targetId,
      value: 0
    });
  } else if (action.type === 'BASIC_ATTACK') {
    newState = publishEvent(newState, {
      type: 'ON_BASIC_ATTACK', // Need to add to EventType
      sourceId: source.id,
      targetId: (action as BasicAttackAction).targetId,
      value: 0
    });
  } else if (action.type === 'SKILL') {
    newState = publishEvent(newState, {
      type: 'ON_SKILL_USED',
      sourceId: source.id,
      targetId: (action as SkillAction).targetId,
      value: 0
    });
  } else if (action.type === 'FOLLOW_UP_ATTACK') {
    newState = publishEvent(newState, {
      type: 'ON_FOLLOW_UP_ATTACK',
      sourceId: source.id,
      targetId: (action as FollowUpAttackAction).targetId,
      value: 0
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

// --- Orchestrator ---

function resolveAction(state: GameState, action: Action): GameState {
  // We assume action is a CombatAction here because dispatchInternal only calls this for combat actions.
  // However, for type safety, we can check or cast.
  const combatAction = action as CombatAction;
  const source = state.units.find(u => u.id === combatAction.sourceId);
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
    isBroken: false
  };

  // Pipeline
  context = stepPayCost(context);
  context = stepGenerateHits(context);
  context = stepProcessHits(context);
  context = stepApplyShield(context);
  context = stepEnergyGain(context);
  context = stepGenerateLog(context);  // 移動: イベント発火の前にログを記録
  context = stepPublishActionEvents(context);
  context = stepApplyAbilityEffects(context);
  context = stepPublishActionCompleteEvent(context);  // Fire ON_ACTION_COMPLETE

  return context.state;
}

function handleActionAdvance(state: GameState, action: ActionAdvanceAction): GameState {
  const target = state.units.find(u => u.id === action.targetId);
  if (!target) return state;

  const advanceAmount = 10000 * action.percent;
  const newActionPoint = target.actionPoint + advanceAmount;

  const newUnits = state.units.map(u => {
    if (u.id === target.id) {
      return {
        ...u,
        actionPoint: newActionPoint,
        actionValue: Math.max(0, (10000 - newActionPoint) / u.stats.spd)
      };
    }
    return u;
  });

  return {
    ...state,
    units: newUnits,
  };
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
