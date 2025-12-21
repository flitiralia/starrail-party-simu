import { Unit, ActionContext, Action } from './engine/types';
import { StatKey, Element, IAbility } from '../types'; // IAbilityをインポート

const elementToDmgBoostMap: Record<Element, StatKey> = {
  Physical: 'physical_dmg_boost',
  Fire: 'fire_dmg_boost',
  Ice: 'ice_dmg_boost',
  Lightning: 'lightning_dmg_boost',
  Wind: 'wind_dmg_boost',
  Quantum: 'quantum_dmg_boost',
  Imaginary: 'imaginary_dmg_boost',
};

const elementToResPenMap: Record<Element, StatKey> = {
  Physical: 'physical_res_pen',
  Fire: 'fire_res_pen',
  Ice: 'ice_res_pen',
  Lightning: 'lightning_res_pen',
  Wind: 'wind_res_pen',
  Quantum: 'quantum_res_pen',
  Imaginary: 'imaginary_res_pen',
};

const elementToResMap: Record<Element, StatKey> = {
  Physical: 'physical_res',
  Fire: 'fire_res',
  Ice: 'ice_res',
  Lightning: 'lightning_res',
  Wind: 'wind_res',
  Quantum: 'quantum_res',
  Imaginary: 'imaginary_res',
};

const elementToVulnMap: Record<Element, StatKey> = {
  Physical: 'physical_vuln',
  Fire: 'fire_vuln',
  Ice: 'ice_vuln',
  Lightning: 'lightning_vuln',
  Wind: 'wind_vuln',
  Quantum: 'quantum_vuln',
  Imaginary: 'imaginary_vuln',
};

function calculateBaseDmg(source: Unit, ability: IAbility, accumulatorValue?: number): number {
  if (!ability.damage) return 0;

  // accumulated_healingスケーリングの場合は渡された累計値を使用
  let scalingValue: number;
  if (ability.damage.scaling === 'accumulated_healing') {
    scalingValue = accumulatorValue || 0;
  } else {
    scalingValue = source.stats[ability.damage.scaling];
  }

  if (ability.damage.type === 'simple') {
    if (ability.damage.hits && ability.damage.hits.length > 0) {
      return scalingValue * ability.damage.hits[0].multiplier;
    }
  } else if (ability.damage.type === 'blast') {
    if (ability.damage.mainHits && ability.damage.mainHits.length > 0) {
      return scalingValue * ability.damage.mainHits[0].multiplier;
    }
  } else if (ability.damage.type === 'bounce') {
    if (ability.damage.hits && ability.damage.hits.length > 0) {
      return scalingValue * ability.damage.hits[0].multiplier;
    }
  } else if (ability.damage.type === 'aoe') {
    return scalingValue * (ability.damage.hits[0]?.multiplier || 0);
  }
  return 0;
}

function calculateDmgBoost(source: Unit, action: Action, modifiers: DamageCalculationModifiers = {}): number {
  const elementalDmgBoostKey = elementToDmgBoostMap[source.element];
  const elementalDmgBoost = source.stats[elementalDmgBoostKey] || 0;

  let typeSpecificDmgBoost = 0;
  if (action.type === 'BASIC_ATTACK') {
    typeSpecificDmgBoost = source.stats.basic_atk_dmg_boost || 0;
  }
  if (action.type === 'SKILL') {
    typeSpecificDmgBoost += source.stats.skill_dmg_boost || 0;
  }
  if (action.type === 'ULTIMATE') {
    typeSpecificDmgBoost += source.stats.ult_dmg_boost || 0;
  }
  if (action.type === 'FOLLOW_UP_ATTACK') {
    typeSpecificDmgBoost += source.stats.fua_dmg_boost || 0;
  }
  const allTypeDmgBoost = source.stats.all_type_dmg_boost || 0;
  const allDmgDealtReduction = source.stats.all_dmg_dealt_reduction || 0; // Debuff that reduces outgoing damage
  const dynamicDmgBoost = modifiers.allTypeDmg || 0;

  if (action.type === 'FOLLOW_UP_ATTACK' && modifiers.fuaDmg) {
    typeSpecificDmgBoost += modifiers.fuaDmg;
  }
  if (action.type === 'ULTIMATE' && modifiers.ultDmg) {
    typeSpecificDmgBoost += modifiers.ultDmg;
  }

  // 与ダメージバフ - 与ダメージ減少
  return 1 + elementalDmgBoost + typeSpecificDmgBoost + allTypeDmgBoost - allDmgDealtReduction + dynamicDmgBoost;
}

function calculateDefMultiplier(source: Unit, target: Unit, dynamicDefIgnore: number = 0): number {
  const sourceLevel = source.level || 80; // Assume level 80 if not specified
  const targetLevel = target.level || 80;

  // 1. Target's Defense Reduction (DEF Shred, e.g., Pela's Ultimate)
  // Unit.stats.def_reduction を使用（静的バフ/デバフがstatBuilderで計算済みと仮定）
  const defReductionStat = target.stats.def_reduction || 0;

  // 2. Source's Defense Ignore (e.g., Genius set, Seele's trace)
  const defIgnoreStat = source.stats.def_ignore || 0;

  // 3. Dynamic Defense Ignore (Event Handlers, e.g., Genius 4pc trigger)
  // dynamicDefIgnore はイベントハンドラから一時的に注入される値

  // 防御無視と防御デバフは加算される
  const totalDefIgnore = defIgnoreStat + dynamicDefIgnore;

  // 最終的な防御乗数計算
  return (sourceLevel + 20) / ((targetLevel + 20) * (1 - defReductionStat) * (1 - totalDefIgnore) + (sourceLevel + 20));
}

export interface CritResult {
  multiplier: number;
  isCrit: boolean;
}

export function calculateCritMultiplierWithInfo(source: Unit, modifiers: DamageCalculationModifiers = {}): CritResult {
  const dynamicCritRate = modifiers.critRate || 0;
  const dynamicCritDmg = modifiers.critDmg || 0;

  const critRate = Math.min((source.stats.crit_rate || 0) + dynamicCritRate, 1); // Cap crit rate at 100%
  const critDmg = (source.stats.crit_dmg || 0) + dynamicCritDmg;

  // 乱数で会心を判定（毎ヒットごとにロール）
  const isCrit = Math.random() < critRate;
  return { multiplier: isCrit ? (1 + critDmg) : 1, isCrit };
}

export function calculateToughnessBrokenMultiplier(target: Unit): number {
  return target.toughness > 0 ? 0.9 : 1.0;
}

function calculateResMultiplier(source: Unit, target: Unit): number {
  const resKey = elementToResMap[source.element];
  const baseRes = target.stats[resKey] || 0;

  const resPenKey = elementToResPenMap[source.element];
  const elementalResPen = source.stats[resPenKey] || 0;
  const allTypeResPen = source.stats.all_type_res_pen || 0;
  const totalResPen = elementalResPen + allTypeResPen;

  return 1.0 - (baseRes - totalResPen);
}

function calculateVulnerabilityMultiplier(source: Unit, target: Unit): number {
  // All-type vulnerability
  const allTypeVuln = target.stats.all_type_vuln || 0;

  // Element-specific vulnerability
  const vulnKey = elementToVulnMap[source.element];
  const elementVuln = target.stats[vulnKey] || 0;

  // Damage taken reduction (buff on target that reduces incoming damage)
  const dmgTakenReduction = target.stats.dmg_taken_reduction || 0;

  // Total vulnerability (additive) - damage reduction (subtractive)
  const totalVulnerability = allTypeVuln + elementVuln - dmgTakenReduction;

  return 1 + totalVulnerability;
}

/**
 * Calculates the final damage of an action.
 * @param source The unit performing the action.
 * @param target The unit receiving the action.
 * @param ability The ability data used for this damage calculation.
 * @param action The action being performed.
 * @returns The final calculated damage number.
 */
/**
 * Calculates the final damage of an action.
 * @param source The unit performing the action.
 * @param target The unit receiving the action.
 * @param ability The ability data used for this damage calculation.
 * @param action The action being performed.
 * @returns The final calculated damage number.
 */
export interface DamageCalculationModifiers {
  defIgnore?: number; // 遺物セット効果などの動的防御無視
  breakEfficiencyBoost?: number; // 撃破効率バフ
  critRate?: number; // 動的会心率
  critDmg?: number; // 動的会心ダメージ
  allTypeDmg?: number; // 動的与ダメージバフ
  atkBoost?: number; // 動的攻撃力バフ（ルアン・メェイE2等）
  baseDmgAdd?: number; // 基礎ダメージ加算（「これがウチだよ！」等）
  fuaDmg?: number; // 動的追加攻撃ダメバフ
  ultDmg?: number; // 動的必殺技ダメバフ
}

export interface DamageResultWithCritInfo {
  damage: number;
  isCrit: boolean;
  // ダメージ計算係数
  breakdownMultipliers?: {
    baseDmg: number;       // 基礎ダメージ
    critMult: number;      // 会心系数
    dmgBoostMult: number;  // 与ダメージ係数
    defMult: number;       // 防御係数
    resMult: number;       // 属性耐性係数
    vulnMult: number;      // 被ダメージ係数
    brokenMult: number;    // 撃破係数
  };
}

export function calculateDamageWithCritInfo(
  source: Unit,
  target: Unit,
  ability: IAbility,
  action: Action,
  modifiers: DamageCalculationModifiers = {},
  accumulatorValue?: number, // 累計値（accumulated_healingスケーリング用）
): DamageResultWithCritInfo {
  // abilityにダメージ情報がない場合、計算をスキップ
  if (!ability.damage) return { damage: 0, isCrit: false };

  let baseDmg = calculateBaseDmg(source, ability, accumulatorValue);

  // ATKブースト適用（ルアン・メェイE2等）
  if (modifiers.atkBoost && ability.damage.scaling === 'atk') {
    baseDmg *= (1 + modifiers.atkBoost);
  }

  // 基礎ダメージ加算（「これがウチだよ！」等）
  if (modifiers.baseDmgAdd) {
    baseDmg += modifiers.baseDmgAdd;
  }

  const critResult = calculateCritMultiplierWithInfo(source, modifiers);
  const dmgBoostMultiplier = calculateDmgBoost(source, action, modifiers);
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);
  const resMultiplier = calculateResMultiplier(source, target);
  const vulnerabilityMultiplier = calculateVulnerabilityMultiplier(source, target);

  let finalDamage = baseDmg * critResult.multiplier * dmgBoostMultiplier * defMultiplier * resMultiplier * vulnerabilityMultiplier * toughnessBrokenMultiplier;

  // Calculate Additional Damage
  if (ability.additionalDamage && ability.additionalDamage.length > 0) {
    for (const addDmgLogic of ability.additionalDamage) {
      const tempAbility: IAbility = { ...ability, damage: addDmgLogic };
      const { additionalDamage, ...rest } = tempAbility;
      const safeAbility = { ...rest, additionalDamage: undefined };
      const additionalResult = calculateDamageWithCritInfo(source, target, safeAbility, action, modifiers);
      finalDamage += additionalResult.damage;
    }
  }

  return {
    damage: finalDamage,
    isCrit: critResult.isCrit,
    breakdownMultipliers: {
      baseDmg,
      critMult: critResult.multiplier,
      dmgBoostMult: dmgBoostMultiplier,
      defMult: defMultiplier,
      resMult: resMultiplier,
      vulnMult: vulnerabilityMultiplier,
      brokenMult: toughnessBrokenMultiplier
    }
  };
}

export function calculateDamage(
  source: Unit,
  target: Unit,
  ability: IAbility,
  action: Action,
  modifiers: DamageCalculationModifiers = {},
  accumulatorValue?: number,
): number {
  return calculateDamageWithCritInfo(source, target, ability, action, modifiers, accumulatorValue).damage;
}

/**
 * Calculates the Break Damage when a weakness break occurs.
 * Formula: BaseBreakDmg * ElementMultiplier * (1 + BreakEffect) * ToughnessMultiplier * DefMultiplier * ResMultiplier * VulnMultiplier
 * @param source The unit causing the break.
 * @param target The unit being broken.
 * @param modifiers Dynamic modifiers.
 * @returns The calculated break damage.
 */
// Level Multipliers for Break Damage (Milestones based on wiki data)
const LEVEL_MULTIPLIERS: Record<number, number> = {
  1: 54, // Extrapolated/Estimated
  20: 100, // Extrapolated
  30: 231,
  40: 502, // Interpolated
  50: 774,
  60: 1640,
  70: 2660,
  80: 3767.55,
};

function getLevelMultiplier(level: number): number {
  // If exact level exists, return it
  if (LEVEL_MULTIPLIERS[level]) return LEVEL_MULTIPLIERS[level];

  // Find lower and upper bounds
  const levels = Object.keys(LEVEL_MULTIPLIERS).map(Number).sort((a, b) => a - b);
  const lowerLevel = levels.reverse().find(l => l <= level) || 1;
  const upperLevel = levels.reverse().find(l => l >= level) || 80;

  if (lowerLevel === upperLevel) return LEVEL_MULTIPLIERS[lowerLevel];

  // Linear Interpolation
  const lowerValue = LEVEL_MULTIPLIERS[lowerLevel];
  const upperValue = LEVEL_MULTIPLIERS[upperLevel];
  const ratio = (level - lowerLevel) / (upperLevel - lowerLevel);

  return lowerValue + ratio * (upperValue - lowerValue);
}

/**
 * Calculates the Break Damage when a weakness break occurs.
 * Formula: BaseBreakDmg * ElementMultiplier * (1 + BreakEffect) * ToughnessMultiplier * DefMultiplier * ResMultiplier * VulnMultiplier
 * @param source The unit causing the break.
 * @param target The unit being broken.
 * @param modifiers Dynamic modifiers.
 * @returns The calculated break damage.
 */
export function calculateBreakDamage(
  source: Unit,
  target: Unit,
  modifiers: DamageCalculationModifiers = {}
): number {
  // 1. Base Break Damage (Level based)
  const baseBreakDmg = getLevelMultiplier(source.level);

  // 2. Element Multiplier
  const elementMultipliers: Record<Element, number> = {
    Physical: 2.0,
    Fire: 2.0,
    Ice: 1.0,
    Lightning: 1.0,
    Wind: 1.5,
    Quantum: 0.5, // Note: Quantum/Imaginary have lower initial dmg but strong secondary effects
    Imaginary: 0.5,
  };
  const elementMultiplier = elementMultipliers[source.element] || 1.0;

  // 3. Break Effect (Source stats)
  const breakEffect = source.stats.break_effect || 0;

  // 4. Toughness Multiplier (0.5 + MaxToughness / 120) - Assuming standard formula scaling
  // User didn't specify this, using standard HSR formula.
  // Note: If maxToughness is on 10/20/30 scale, we need to adjust.
  // Standard: 30 units = 1 bar? No, standard is 30/60/90 raw.
  // If user scale is 1/3 of standard, then 120 standard = 40 user scale.
  // Let's assume standard formula uses the raw values.
  // If maxToughness is 180 (from dummy.ts), that's standard scale.
  // If we are reducing by 10/20/30, we are using 1/3 scale reduction on full scale toughness?
  // Wait, if dummy has 180 and we reduce by 10, it takes 18 hits.
  // If standard is 30 reduction, it takes 6 hits.
  // This means our reduction is 1/3 effective if we use 10 against 180.
  // UNLESS the user implies 10/20/30 IS the standard unit (1 unit = 10? No, 1 unit usually = 30 in internal data).
  // Let's stick to the user's values for reduction.
  // For Toughness Multiplier, the formula is (0.5 + MaxToughness / 120).
  // If MaxToughness is 180, multiplier is 0.5 + 1.5 = 2.0.
  const toughnessMultiplier = 0.5 + (target.maxToughness / 40);

  // 5. Defense Multiplier
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);

  // 6. Resistance Multiplier
  const resMultiplier = calculateResMultiplier(source, target);

  // 7. Vulnerability Multiplier
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);

  // 8. Toughness Broken Multiplier (User requested)
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  return baseBreakDmg * elementMultiplier * (1 + breakEffect) * toughnessMultiplier * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;
}

/**
 * Calculates Break Damage with breakdown multipliers.
 * Returns damage and breakdown for logging.
 */
export function calculateBreakDamageWithBreakdown(
  source: Unit,
  target: Unit,
  modifiers: DamageCalculationModifiers = {}
): DamageResultWithCritInfo {
  const baseBreakDmg = getLevelMultiplier(source.level);

  const elementMultipliers: Record<Element, number> = {
    Physical: 2.0,
    Fire: 2.0,
    Ice: 1.0,
    Lightning: 1.0,
    Wind: 1.5,
    Quantum: 0.5,
    Imaginary: 0.5,
  };
  const elementMultiplier = elementMultipliers[source.element] || 1.0;

  const breakEffect = source.stats.break_effect || 0;
  const toughnessMultiplier = 0.5 + (target.maxToughness / 40);
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);
  const resMultiplier = calculateResMultiplier(source, target);
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  const baseDmg = baseBreakDmg * elementMultiplier * toughnessMultiplier;
  const damage = baseDmg * (1 + breakEffect) * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;

  return {
    damage,
    isCrit: false, // 撃破ダメージは会心なし
    breakdownMultipliers: {
      baseDmg,
      critMult: 1.0,
      dmgBoostMult: 1 + breakEffect, // 撃破特効として表示
      defMult: defMultiplier,
      resMult: resMultiplier,
      vulnMult: vulnMultiplier,
      brokenMult: toughnessBrokenMultiplier
    }
  };
}

/**
 * Calculates Super Break Damage.
 * Formula: LevelMultiplier * (ToughnessReduction / 10) * SuperBreakMultiplier * (1 + BreakEffect) * DefMultiplier * ResMultiplier * VulnMultiplier
 */
export function calculateSuperBreakDamage(
  source: Unit,
  target: Unit,
  toughnessReduction: number,
  modifiers: DamageCalculationModifiers = {}
): number {
  // 0. Check if Super Break is enabled (usually via a buff providing super_break_dmg_boost)
  const superBreakMultiplier = source.stats.super_break_dmg_boost || 0;
  if (superBreakMultiplier <= 0) return 0;

  // 1. Level Multiplier
  const levelMultiplier = getLevelMultiplier(source.level);

  // 2. Toughness Reduction Factor (Reduction / 10)
  // Assuming 10 is the base unit for 1 bar? No, usually it's Reduction / 30 * ...
  // Wiki says: (Toughness Reduction / 10)
  // If our reduction is 10 for Basic, then factor is 1.
  const toughnessFactor = toughnessReduction / 10;

  // 3. Break Effect
  const breakEffect = source.stats.break_effect || 0;

  // 4. Def/Res/Vuln
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);
  const resMultiplier = calculateResMultiplier(source, target);
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);

  // 5. Toughness Broken Multiplier
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  return levelMultiplier * toughnessFactor * superBreakMultiplier * (1 + breakEffect) * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;
}

/**
 * Calculates Super Break Damage with breakdown multipliers.
 */
export function calculateSuperBreakDamageWithBreakdown(
  source: Unit,
  target: Unit,
  toughnessReduction: number,
  modifiers: DamageCalculationModifiers = {}
): DamageResultWithCritInfo {
  const superBreakMultiplier = source.stats.super_break_dmg_boost || 0;
  if (superBreakMultiplier <= 0) {
    return {
      damage: 0,
      isCrit: false,
      breakdownMultipliers: {
        baseDmg: 0,
        critMult: 1.0,
        dmgBoostMult: 1.0,
        defMult: 1.0,
        resMult: 1.0,
        vulnMult: 1.0,
        brokenMult: 1.0
      }
    };
  }

  const levelMultiplier = getLevelMultiplier(source.level);
  const toughnessFactor = toughnessReduction / 10;
  const breakEffect = source.stats.break_effect || 0;
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);
  const resMultiplier = calculateResMultiplier(source, target);
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  const baseDmg = levelMultiplier * toughnessFactor * superBreakMultiplier;
  const damage = baseDmg * (1 + breakEffect) * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;

  return {
    damage,
    isCrit: false,
    breakdownMultipliers: {
      baseDmg,
      critMult: 1.0,
      dmgBoostMult: 1 + breakEffect,
      defMult: defMultiplier,
      resMult: resMultiplier,
      vulnMult: vulnMultiplier,
      brokenMult: toughnessBrokenMultiplier
    }
  };
}

/**
 * Calculates Break DoT Damage (Burn, Shock, Bleed, Wind Shear from Break).
 * Formula: BaseDmg * (1 + BreakEffect) * DefMultiplier * ResMultiplier * VulnMultiplier * (1 + DoTBoost) * ToughnessBrokenMultiplier
 */
export function calculateBreakDoTDamage(
  source: Unit,
  target: Unit,
  baseDamage: number,
  modifiers: DamageCalculationModifiers = {}
): number {
  return calculateBreakDoTDamageWithBreakdown(source, target, baseDamage, modifiers).damage;
}

/**
 * Calculates Break DoT Damage with breakdown multipliers.
 */
export function calculateBreakDoTDamageWithBreakdown(
  source: Unit,
  target: Unit,
  baseDamage: number,
  modifiers: DamageCalculationModifiers = {}
): DamageResultWithCritInfo {
  const breakEffect = source.stats.break_effect || 0;
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);
  const resMultiplier = calculateResMultiplier(source, target);
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);
  const dotBoost = source.stats.dot_dmg_boost || 0;
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  const dmgBoostMult = (1 + breakEffect) * (1 + dotBoost);
  const finalDamage = baseDamage * dmgBoostMult * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;

  console.log(`[calculateBreakDoTDamage] baseDamage=${baseDamage}, breakEffect=${breakEffect}, defMult=${defMultiplier.toFixed(3)}, resMult=${resMultiplier.toFixed(3)}, vulnMult=${vulnMultiplier.toFixed(3)}, dotBoost=${dotBoost}, toughnessMult=${toughnessBrokenMultiplier.toFixed(3)}, final=${finalDamage.toFixed(2)}`);

  return {
    damage: finalDamage,
    isCrit: false, // DoTは会心しない
    breakdownMultipliers: {
      baseDmg: baseDamage,
      critMult: 1.0,
      dmgBoostMult: dmgBoostMult,
      defMult: defMultiplier,
      resMult: resMultiplier,
      vulnMult: vulnMultiplier,
      brokenMult: toughnessBrokenMultiplier
    }
  };
}


/**
 * Calculates Normal DoT Damage (Character ability based DoT).
 * Formula: BaseDmg * (1 + DmgBoost) * DefMultiplier * ResMultiplier * VulnMultiplier * (1 + DoTBoost) * ToughnessBrokenMultiplier
 * Note: Normal DoT does NOT scale with Break Effect, but uses normal DMG Boost logic (usually).
 * However, usually DoT damage is specified as "X% of ATK".
 * So BaseDmg here is already "ATK * Multiplier".
 * We need to apply DMG Boosts.
 */
export function calculateNormalDoTDamage(
  source: Unit,
  target: Unit,
  baseDamage: number,
  modifiers: DamageCalculationModifiers = {},
  actionType: 'BASIC_ATTACK' | 'SKILL' | 'ULTIMATE' | 'FOLLOW_UP_ATTACK' | 'DOT' = 'DOT' // Context for DMG boost
): number {
  return calculateNormalDoTDamageWithBreakdown(source, target, baseDamage, modifiers, actionType).damage;
}

/**
 * Calculates Normal DoT Damage with breakdown multipliers.
 */
export function calculateNormalDoTDamageWithBreakdown(
  source: Unit,
  target: Unit,
  baseDamage: number,
  modifiers: DamageCalculationModifiers = {},
  actionType: 'BASIC_ATTACK' | 'SKILL' | 'ULTIMATE' | 'FOLLOW_UP_ATTACK' | 'DOT' = 'DOT'
): DamageResultWithCritInfo {
  const elementalDmgBoostKey = elementToDmgBoostMap[source.element];
  const elementalDmgBoost = source.stats[elementalDmgBoostKey] || 0;
  const allTypeDmgBoost = source.stats.all_type_dmg_boost || 0;
  const dotBoost = source.stats.dot_dmg_boost || 0;
  const dynamicDmgBoost = modifiers.allTypeDmg || 0;

  const dmgBoostMultiplier = 1 + elementalDmgBoost + allTypeDmgBoost + dotBoost + dynamicDmgBoost;
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);
  const resMultiplier = calculateResMultiplier(source, target);
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  const finalDamage = baseDamage * dmgBoostMultiplier * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;

  console.log(`[calculateNormalDoTDamage] baseDamage=${baseDamage.toFixed(2)}, dmgBoost=${dmgBoostMultiplier.toFixed(3)} (elem=${elementalDmgBoost}, all=${allTypeDmgBoost}, dot=${dotBoost}), defMult=${defMultiplier.toFixed(3)}, resMult=${resMultiplier.toFixed(3)}, vulnMult=${vulnMultiplier.toFixed(3)}, toughnessMult=${toughnessBrokenMultiplier.toFixed(3)}, final=${finalDamage.toFixed(2)}`);

  return {
    damage: finalDamage,
    isCrit: false, // DoTは会心しない
    breakdownMultipliers: {
      baseDmg: baseDamage,
      critMult: 1.0,
      dmgBoostMult: dmgBoostMultiplier,
      defMult: defMultiplier,
      resMult: resMultiplier,
      vulnMult: vulnMultiplier,
      brokenMult: toughnessBrokenMultiplier
    }
  };
}


/**
 * Calculates Break Additional Damage (e.g. Entanglement, Ice Break).
 * Formula: BaseDmg * (1 + BreakEffect) * DefMultiplier * ResMultiplier * VulnMultiplier * ToughnessBrokenMultiplier
 */
export function calculateBreakAdditionalDamage(
  source: Unit,
  target: Unit,
  baseDamage: number,
  modifiers: DamageCalculationModifiers = {}
): number {
  const breakEffect = source.stats.break_effect || 0;
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);
  const resMultiplier = calculateResMultiplier(source, target);
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  return baseDamage * (1 + breakEffect) * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;
}

/**
 * Calculates Break Additional Damage with breakdown multipliers.
 */
export function calculateBreakAdditionalDamageWithBreakdown(
  source: Unit,
  target: Unit,
  baseDamage: number,
  modifiers: DamageCalculationModifiers = {}
): DamageResultWithCritInfo {
  const breakEffect = source.stats.break_effect || 0;
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);
  const resMultiplier = calculateResMultiplier(source, target);
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  const damage = baseDamage * (1 + breakEffect) * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;

  return {
    damage,
    isCrit: false,
    breakdownMultipliers: {
      baseDmg: baseDamage,
      critMult: 1.0,
      dmgBoostMult: 1 + breakEffect,
      defMult: defMultiplier,
      resMult: resMultiplier,
      vulnMult: vulnMultiplier,
      brokenMult: toughnessBrokenMultiplier
    }
  };
}

/**
 * Calculates Normal Additional Damage (e.g. March 7th Technique, Tribbie Field).
 * Formula: BaseDmg * CritMultiplier * DmgBoostMultiplier * DefMultiplier * ResMultiplier * VulnMultiplier * ToughnessBrokenMultiplier
 */
export function calculateNormalAdditionalDamage(
  source: Unit,
  target: Unit,
  baseDamage: number,
  modifiers: DamageCalculationModifiers = {},
  // Additional damage usually inherits the source action's type for DMG boost?
  // Or is it just generic? Usually "Additional DMG" is considered a separate hit.
  // It benefits from Elemental/AllType boosts.
  // Does it benefit from "Skill DMG Boost" if triggered by Skill? Usually yes if "Additional DMG".
  // But here we take baseDamage as input.
  // Let's assume generic boosts for now unless context provided.
): number {
  return calculateNormalAdditionalDamageWithCritInfo(source, target, baseDamage, modifiers).damage;
}

/**
 * Calculates Normal Additional Damage with crit info and breakdown multipliers.
 */
export function calculateNormalAdditionalDamageWithCritInfo(
  source: Unit,
  target: Unit,
  baseDamage: number,
  modifiers: DamageCalculationModifiers = {},
): DamageResultWithCritInfo {
  // 1. Damage Boost
  const elementalDmgBoostKey = elementToDmgBoostMap[source.element];
  const elementalDmgBoost = source.stats[elementalDmgBoostKey] || 0;
  const allTypeDmgBoost = source.stats.all_type_dmg_boost || 0;
  const dynamicDmgBoost = modifiers.allTypeDmg || 0;

  const dmgBoostMultiplier = 1 + elementalDmgBoost + allTypeDmgBoost + dynamicDmgBoost;

  // 2. Crit Multiplier
  const critResult = calculateCritMultiplierWithInfo(source, modifiers);
  const critMultiplier = critResult.multiplier;

  // 3. Defense Multiplier
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);

  // 4. Resistance Multiplier
  const resMultiplier = calculateResMultiplier(source, target);

  // 5. Vulnerability Multiplier
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);

  // 6. Toughness Broken Multiplier
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  const damage = baseDamage * critMultiplier * dmgBoostMultiplier * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;

  return {
    damage,
    isCrit: critResult.isCrit,
    breakdownMultipliers: {
      baseDmg: baseDamage,
      critMult: critMultiplier,
      dmgBoostMult: dmgBoostMultiplier,
      defMult: defMultiplier,
      resMult: resMultiplier,
      vulnMult: vulnMultiplier,
      brokenMult: toughnessBrokenMultiplier
    }
  };
}

/**
 * Calculates Healing Amount.
 * Formula: (ScalingStat * Multiplier + Flat) * (1 + OutgoingHealBoost + IncomingHealBoost)
 */
export interface HealLogic {
  scaling: 'atk' | 'hp' | 'def';
  multiplier: number;
  flat?: number;
}

export function calculateHeal(
  source: Unit,
  target: Unit,
  logic: HealLogic
): number {
  return calculateHealWithBreakdown(source, target, logic).amount;
}

/**
 * 回復計算（内訳情報付き）
 */
export interface HealResultWithBreakdown {
  amount: number;
  breakdownMultipliers: {
    baseHeal: number;
    outgoingHealBoost: number;
    incomingHealBoost: number;
    healBoostMult: number;
    scalingStat: string;
    multiplier: number;
    flat: number;
  };
}

export function calculateHealWithBreakdown(
  source: Unit,
  target: Unit,
  logic: HealLogic
): HealResultWithBreakdown {
  const scalingValue = source.stats[logic.scaling] || 0;
  const baseHeal = scalingValue * logic.multiplier + (logic.flat || 0);

  const outgoingHealBoost = source.stats.outgoing_healing_boost || 0;
  const incomingHealBoost = target.stats.incoming_heal_boost || 0;
  const healBoostMult = 1 + outgoingHealBoost + incomingHealBoost;

  const amount = baseHeal * healBoostMult;

  return {
    amount,
    breakdownMultipliers: {
      baseHeal,
      outgoingHealBoost,
      incomingHealBoost,
      healBoostMult,
      scalingStat: logic.scaling,
      multiplier: logic.multiplier,
      flat: logic.flat || 0,
    }
  };
}

/**
 * シールド計算ロジック
 */
export interface ShieldLogic {
  scaling: 'atk' | 'hp' | 'def';
  multiplier: number;
  flat?: number;
  cap?: number;  // 上限値（累積シールドの場合）
}

/**
 * シールド計算（内訳情報付き）
 */
export interface ShieldResultWithBreakdown {
  amount: number;
  breakdownMultipliers: {
    baseShield: number;
    scalingStat: string;
    multiplier: number;
    flat: number;
    cap?: number;
  };
}

export function calculateShield(
  source: Unit,
  logic: ShieldLogic
): number {
  return calculateShieldWithBreakdown(source, logic).amount;
}

export function calculateShieldWithBreakdown(
  source: Unit,
  logic: ShieldLogic
): ShieldResultWithBreakdown {
  const scalingValue = source.stats[logic.scaling] || 0;
  let amount = scalingValue * logic.multiplier + (logic.flat || 0);

  // 上限適用
  if (logic.cap !== undefined) {
    amount = Math.min(amount, logic.cap);
  }

  return {
    amount,
    breakdownMultipliers: {
      baseShield: amount,
      scalingStat: logic.scaling,
      multiplier: logic.multiplier,
      flat: logic.flat || 0,
      cap: logic.cap,
    }
  };
}

/**
 * Calculates True Damage (確定ダメージ).
 * True Damage ignores:
 * - Crit multiplier
 * - Defense multiplier
 * - Resistance multiplier
 * - Vulnerability/DMG Taken multiplier
 * - Toughness Broken multiplier
 * 
 * It deals the base damage directly to HP.
 * The baseDamage should be calculated as: (referenceActualDamage * multiplier)
 * 
 * @param baseDamage The base damage amount (reference damage * percentage)
 * @returns The true damage amount
 */
export function calculateTrueDamage(baseDamage: number): number {
  return baseDamage;
}

/**
 * Calculates True Damage with breakdown multipliers.
 * All multipliers are 1.0 (ignored).
 */
export function calculateTrueDamageWithBreakdown(baseDamage: number): DamageResultWithCritInfo {
  return {
    damage: baseDamage,
    isCrit: false,
    breakdownMultipliers: {
      baseDmg: baseDamage,
      critMult: 1.0,
      dmgBoostMult: 1.0,
      defMult: 1.0,
      resMult: 1.0,
      vulnMult: 1.0,
      brokenMult: 1.0
    }
  };
}

// ============================================================
// 味方への被ダメージ計算（敵から味方への攻撃）
// ============================================================

/**
 * 味方への被ダメージ計算結果
 */
export interface DamageToAllyResult {
  damage: number;
  breakdownMultipliers: {
    baseDmg: number;           // 敵の基礎ダメージ（ATK × 倍率）
    dmgBoostMult: number;      // 敵の与ダメージ係数
    defMult: number;           // 味方の防御係数
    resMult: number;           // 属性耐性係数
    dmgReductionMult: number;  // 被ダメージ軽減係数
  };
}

/**
 * 味方の防御係数を計算
 * 公式: 1 - DEF / (DEF + 10 × 敵Lv + 200)
 */
function calculateAllyDefMultiplier(target: Unit, sourceLevel: number): number {
  const targetDef = target.stats.def || 0;
  const denominator = targetDef + (10 * sourceLevel) + 200;

  // 防御力が負でも係数は0～1の範囲に収める
  if (denominator <= 0) return 1.0;

  return 1 - (targetDef / denominator);
}

/**
 * 味方の属性耐性係数を計算
 * 公式: 1 - (耐性 - 耐性貫通)
 */
function calculateAllyResMultiplier(source: Unit, target: Unit): number {
  const resKey = elementToResMap[source.element];
  const baseRes = target.stats[resKey] || 0;

  // 敵の耐性貫通（通常は敵には設定されないが念のため）
  const resPenKey = elementToResPenMap[source.element];
  const resPen = source.stats[resPenKey] || 0;
  const allTypeResPen = source.stats.all_type_res_pen || 0;

  return 1 - (baseRes - resPen - allTypeResPen);
}

/**
 * 味方の被ダメージ軽減係数を計算
 * 公式: (1 - dmg_taken_reduction)
 * 注意: 各効果は独立して乗算されるべきだが、現状は加算値として管理
 */
function calculateAllyDmgReductionMultiplier(target: Unit): number {
  const dmgTakenReduction = target.stats.dmg_taken_reduction || 0;

  // 係数が0以下にならないよう保護（最低でも1%のダメージを受ける）
  return Math.max(0.01, 1 - dmgTakenReduction);
}

/**
 * 味方への被ダメージを計算する
 * 
 * 計算式: 基礎ダメージ × 与ダメージ係数 × 防御係数 × 属性耐性係数 × 被ダメージ軽減係数
 * 
 * @param source 敵ユニット（攻撃者）
 * @param target 味方ユニット（被ダメージ対象）
 * @param baseDamage 敵の基礎ダメージ（ATK × 倍率）
 * @returns 最終ダメージと内訳
 */
export function calculateDamageToAlly(
  source: Unit,
  target: Unit,
  baseDamage: number
): DamageToAllyResult {
  // 1. 敵の与ダメージ係数
  // all_type_dmg_boost から all_dmg_dealt_reduction を引く
  const allTypeDmgBoost = source.stats.all_type_dmg_boost || 0;
  const allDmgDealtReduction = source.stats.all_dmg_dealt_reduction || 0;
  const dmgBoostMult = 1 + allTypeDmgBoost - allDmgDealtReduction;

  // 2. 味方の防御係数
  const defMult = calculateAllyDefMultiplier(target, source.level);

  // 3. 属性耐性係数
  const resMult = calculateAllyResMultiplier(source, target);

  // 4. 被ダメージ軽減係数
  const dmgReductionMult = calculateAllyDmgReductionMultiplier(target);

  // 最終ダメージ計算
  const damage = baseDamage * dmgBoostMult * defMult * resMult * dmgReductionMult;

  return {
    damage: Math.max(0, damage), // マイナスダメージ防止
    breakdownMultipliers: {
      baseDmg: baseDamage,
      dmgBoostMult,
      defMult,
      resMult,
      dmgReductionMult
    }
  };
}

/**
 * 味方への被ダメージを計算する（DamageResultWithCritInfo形式）
 * 既存のログ出力との互換性のため
 */
export function calculateDamageToAllyWithCritInfo(
  source: Unit,
  target: Unit,
  baseDamage: number
): DamageResultWithCritInfo {
  const result = calculateDamageToAlly(source, target, baseDamage);

  return {
    damage: result.damage,
    isCrit: false, // 敵の攻撃は会心判定なし（簡略化）
    breakdownMultipliers: {
      baseDmg: result.breakdownMultipliers.baseDmg,
      critMult: 1.0,
      dmgBoostMult: result.breakdownMultipliers.dmgBoostMult,
      defMult: result.breakdownMultipliers.defMult,
      resMult: result.breakdownMultipliers.resMult,
      vulnMult: result.breakdownMultipliers.dmgReductionMult, // 被ダメ軽減をvulnMult欄に表示
      brokenMult: 1.0 // 味方は靭性がないため常に1.0
    }
  };
}
