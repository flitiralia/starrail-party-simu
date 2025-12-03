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

function calculateBaseDmg(source: Unit, ability: IAbility): number {
  if (!ability.damage) return 0;
  const scalingValue = source.stats[ability.damage.scaling];

  if (ability.damage.type === 'simple') {
    return scalingValue * ability.damage.multiplier;
  } else if (ability.damage.type === 'blast') {
    // For base damage calculation, we might need context (main target vs adjacent).
    // But this function seems to calculate "potential" base damage or main target damage?
    // Looking at usage might be needed, but for now let's return mainMultiplier.
    return scalingValue * ability.damage.mainMultiplier;
  } else if (ability.damage.type === 'bounce') {
    // Return first hit multiplier? Or sum?
    // Usually base damage is per hit.
    // Let's return the first multiplier for now or 0 if empty.
    return scalingValue * (ability.damage.multipliers[0] || 0);
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

function calculateCritMultiplier(source: Unit, modifiers: DamageCalculationModifiers = {}): number {
  const dynamicCritRate = modifiers.critRate || 0;
  const dynamicCritDmg = modifiers.critDmg || 0;

  const critRate = Math.min((source.stats.crit_rate || 0) + dynamicCritRate, 1); // Cap crit rate at 100%
  const critDmg = (source.stats.crit_dmg || 0) + dynamicCritDmg;

  // Calculate expected damage multiplier from crits
  return 1 + (critRate * critDmg);
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

  // Total vulnerability (additive)
  const totalVulnerability = allTypeVuln + elementVuln;

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
}

export function calculateDamage(
  source: Unit,
  target: Unit,
  ability: IAbility,
  action: Action,
  modifiers: DamageCalculationModifiers = {}, // 動的修飾子を追加
): number {
  // abilityにダメージ情報がない場合、計算をスキップ
  if (!ability.damage) return 0;

  const baseDmg = calculateBaseDmg(source, ability);
  const critMultiplier = calculateCritMultiplier(source, modifiers);
  const dmgBoostMultiplier = calculateDmgBoost(source, action, modifiers);
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0); // dynamicDefIgnoreを渡す
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);
  // TODO: abilityのElementに基づいてResMultiplierを計算できるように修正が必要
  const resMultiplier = calculateResMultiplier(source, target);
  const vulnerabilityMultiplier = calculateVulnerabilityMultiplier(source, target);

  let finalDamage = baseDmg * critMultiplier * dmgBoostMultiplier * defMultiplier * resMultiplier * vulnerabilityMultiplier * toughnessBrokenMultiplier;

  // Calculate Additional Damage
  if (ability.additionalDamage && ability.additionalDamage.length > 0) {
    for (const addDmgLogic of ability.additionalDamage) {
      // Create a temporary ability context for the additional damage
      // We reuse the same ability metadata but swap the damage logic
      const tempAbility: IAbility = { ...ability, damage: addDmgLogic };

      // Recursively calculate damage for this component
      // Note: Additional damage might have different scaling or multipliers
      // But it usually shares the same crit/dmgBoost/def/res/vuln unless specified otherwise.
      // However, some additional damage (like Break) doesn't crit or use dmg boost.
      // But E4 says "deals Ice DMG equal to 30% of DEF". This usually implies standard damage formula
      // but with different base. It CAN crit and uses DMG boost.
      // So calling calculateDamage recursively is correct IF we want standard formula.
      // BUT we need to avoid infinite recursion if we pass the same ability.
      // We passed a NEW ability object with `damage` set to `addDmgLogic` and `additionalDamage` undefined (implicitly from spread? No, spread copies it).
      // We must ensure `additionalDamage` is removed from tempAbility to avoid recursion.

      const { additionalDamage, ...rest } = tempAbility;
      const safeAbility = { ...rest, additionalDamage: undefined }; // Explicitly remove

      finalDamage += calculateDamage(source, target, safeAbility, action, modifiers);
    }
  }

  return finalDamage;
}

/**
 * Calculates the toughness reduction of an action.
 * @param source The unit performing the action.
 * @param ability The ability data used.
 * @param modifiers Dynamic modifiers including break efficiency.
 * @returns The amount of toughness to reduce.
 */
export function calculateToughnessReduction(
  source: Unit,
  ability: IAbility,
  modifiers: DamageCalculationModifiers = {},
  baseReductionOverride?: number, // Optional override
  hitType?: 'main' | 'adjacent' | 'bounce' | 'other' // Added hitType
): number {
  // 1. Base Reduction from Ability or Override
  let baseReduction = baseReductionOverride ?? 0;

  if (baseReduction === 0 && ability.toughnessReduction !== undefined) {
    if (typeof ability.toughnessReduction === 'number') {
      baseReduction = ability.toughnessReduction;
    } else {
      // Object case: { main: number, adjacent: number }
      if (hitType === 'adjacent') {
        baseReduction = ability.toughnessReduction.adjacent;
      } else {
        baseReduction = ability.toughnessReduction.main;
      }
    }
  }

  // Fallback if not defined in data (based on user feedback: 10/20/30)
  if (baseReduction === 0 && ability.toughnessReduction === undefined) {
    if (ability.type === 'Basic ATK') baseReduction = 10;
    else if (ability.type === 'Skill') baseReduction = 20; // Assuming single target default
    else if (ability.type === 'Ultimate') baseReduction = 30; // Assuming single target default
  }

  // 2. Break Efficiency Boost (Source stats + Dynamic modifiers)
  const statEfficiency = source.stats.break_efficiency_boost || 0;
  const dynamicEfficiency = modifiers.breakEfficiencyBoost || 0;
  const totalEfficiency = 1 + statEfficiency + dynamicEfficiency;

  return baseReduction * totalEfficiency;
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
 * Calculates Break DoT Damage (Burn, Shock, Bleed, Wind Shear from Break).
 * Formula: BaseDmg * (1 + BreakEffect) * DefMultiplier * ResMultiplier * VulnMultiplier * (1 + DoTBoost) * ToughnessBrokenMultiplier
 */
export function calculateBreakDoTDamage(
  source: Unit,
  target: Unit,
  baseDamage: number,
  modifiers: DamageCalculationModifiers = {}
): number {
  // 1. Break Effect
  const breakEffect = source.stats.break_effect || 0;

  // 2. Defense Multiplier
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);

  // 3. Resistance Multiplier
  const resMultiplier = calculateResMultiplier(source, target);

  // 4. Vulnerability Multiplier
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);

  // 5. DoT Boost (Generic DoT boost from relics/LCs)
  const dotBoost = source.stats.dot_dmg_boost || 0;

  // 6. Toughness Broken Multiplier
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  const finalDamage = baseDamage * (1 + breakEffect) * defMultiplier * resMultiplier * vulnMultiplier * (1 + dotBoost) * toughnessBrokenMultiplier;

  console.log(`[calculateBreakDoTDamage] baseDamage=${baseDamage}, breakEffect=${breakEffect}, defMult=${defMultiplier.toFixed(3)}, resMult=${resMultiplier.toFixed(3)}, vulnMult=${vulnMultiplier.toFixed(3)}, dotBoost=${dotBoost}, toughnessMult=${toughnessBrokenMultiplier.toFixed(3)}, final=${finalDamage.toFixed(2)}`);

  return finalDamage;
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
  // 1. Damage Boost
  // We need to reconstruct a partial Action or just calculate boost manually here.
  // Since calculateDmgBoost requires an Action object, let's simplify or reuse logic.
  // For DoT, usually only Elemental DMG Boost and All Type DMG Boost apply.
  // Specific boosts like "Skill DMG Boost" do NOT apply to DoT unless specified.
  // "DoT DMG Boost" applies.

  const elementalDmgBoostKey = elementToDmgBoostMap[source.element];
  const elementalDmgBoost = source.stats[elementalDmgBoostKey] || 0;
  const allTypeDmgBoost = source.stats.all_type_dmg_boost || 0;
  const dotBoost = source.stats.dot_dmg_boost || 0;
  const dynamicDmgBoost = modifiers.allTypeDmg || 0;

  const dmgBoostMultiplier = 1 + elementalDmgBoost + allTypeDmgBoost + dotBoost + dynamicDmgBoost;

  // 2. Defense Multiplier
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);

  // 3. Resistance Multiplier
  const resMultiplier = calculateResMultiplier(source, target);

  // 4. Vulnerability Multiplier
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);

  // 5. Toughness Broken Multiplier
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  const finalDamage = baseDamage * dmgBoostMultiplier * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;

  console.log(`[calculateNormalDoTDamage] baseDamage=${baseDamage.toFixed(2)}, dmgBoost=${dmgBoostMultiplier.toFixed(3)} (elem=${elementalDmgBoost}, all=${allTypeDmgBoost}, dot=${dotBoost}), defMult=${defMultiplier.toFixed(3)}, resMult=${resMultiplier.toFixed(3)}, vulnMult=${vulnMultiplier.toFixed(3)}, toughnessMult=${toughnessBrokenMultiplier.toFixed(3)}, final=${finalDamage.toFixed(2)}`);
  console.trace('[calculateNormalDoTDamage] Call stack:');

  return finalDamage;
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
  // 1. Damage Boost
  const elementalDmgBoostKey = elementToDmgBoostMap[source.element];
  const elementalDmgBoost = source.stats[elementalDmgBoostKey] || 0;
  const allTypeDmgBoost = source.stats.all_type_dmg_boost || 0;
  const dynamicDmgBoost = modifiers.allTypeDmg || 0;

  const dmgBoostMultiplier = 1 + elementalDmgBoost + allTypeDmgBoost + dynamicDmgBoost;

  // 2. Crit Multiplier
  const critMultiplier = calculateCritMultiplier(source, modifiers);

  // 3. Defense Multiplier
  const defMultiplier = calculateDefMultiplier(source, target, modifiers.defIgnore || 0);

  // 4. Resistance Multiplier
  const resMultiplier = calculateResMultiplier(source, target);

  // 5. Vulnerability Multiplier
  const vulnMultiplier = calculateVulnerabilityMultiplier(source, target);

  // 6. Toughness Broken Multiplier
  const toughnessBrokenMultiplier = calculateToughnessBrokenMultiplier(target);

  return baseDamage * critMultiplier * dmgBoostMultiplier * defMultiplier * resMultiplier * vulnMultiplier * toughnessBrokenMultiplier;
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
  const scalingValue = source.stats[logic.scaling] || 0;
  const baseHeal = scalingValue * logic.multiplier + (logic.flat || 0);

  const outgoingHealBoost = source.stats.outgoing_healing_boost || 0;
  // Assuming incoming_heal_boost might exist in stats or modifiers, but for now just outgoing.
  // If target has incoming heal boost, it should be in stats.
  const incomingHealBoost = (target.stats as any).incoming_heal_boost || 0;

  return baseHeal * (1 + outgoingHealBoost + incomingHealBoost);
}
