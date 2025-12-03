import { z } from 'zod';

export const StatKeySchema = z.enum([
  'hp', 'atk', 'def',                           // Flat stats that also serve as base stats
  'hp_pct', 'atk_pct', 'def_pct', 'spd_pct',      // Percentage-based stats
  'spd',                                         // Flat stat
  'crit_rate', 'crit_dmg',                       // Crit-related stats
  'effect_hit_rate', 'effect_res',               // Effect-related stats
  'crowd_control_res',                           // Crowd Control Resistance (Debuff RES)
  'bleed_res', 'burn_res', 'frozen_res', 'shock_res', 'wind_shear_res', 'entanglement_res', 'imprisonment_res', // Specific Status Resistances
  'physical_res', 'fire_res', 'ice_res', 'lightning_res', 'wind_res', 'quantum_res', 'imaginary_res', // Elemental resistances
  'physical_res_pen', 'fire_res_pen', 'ice_res_pen', 'lightning_res_pen', 'wind_res_pen', 'quantum_res_pen', 'imaginary_res_pen', 'all_type_res_pen', // RES penetration
  'all_type_vuln', // Vulnerability (All Types)
  'physical_vuln', 'fire_vuln', 'ice_vuln', 'lightning_vuln', 'wind_vuln', 'quantum_vuln', 'imaginary_vuln', // Element-specific vulnerabilities
  'break_effect',                                // Break effect
  'energy_regen_rate', 'max_ep',                 // Energy-related stats
  'outgoing_healing_boost',                      // Healing boost
  'physical_dmg_boost', 'fire_dmg_boost', 'ice_dmg_boost', 'lightning_dmg_boost', 'wind_dmg_boost', 'quantum_dmg_boost', 'imaginary_dmg_boost', // Elemental damage boosts
  'basic_atk_dmg_boost',
  'skill_dmg_boost',
  'ult_dmg_boost',
  'def_reduction', // Defense reduction (Target debuff)
  'def_ignore', // Defense ignore (Source buff)
  'break_efficiency_boost', // Break efficiency boost
  'super_break_dmg_boost', // Super Break damage boost
  'fua_dmg_boost', // Follow-up attack damage boost
  'dot_dmg_boost', // DoT damage boost
  'all_type_dmg_boost', // All type damage boost
  'all_dmg_dealt_reduction', // All damage dealt reduction (Debuff applied to enemies, reduces their outgoing damage)
  'shield_strength_boost' // Shield strength boost
]);

export type StatKey = z.infer<typeof StatKeySchema>;

export const STAT_KEYS = StatKeySchema.options;

/**
 * Defines how a stat is modified. This is a generic structure for buffs,
 * debuffs, set effects, etc., promoting extensibility.
 */
export interface Modifier { // NOTE: This interface might be deprecated in favor of IEffect
  target: StatKey; // The stat to be modified
  source: string; // e.g., 'Longevous Disciple 2-pc'
  type: 'add' | 'pct'; // 'add' for flat additions, 'pct' for percentage increases
  value: number;
}

/**
 * A record to hold the value for each stat.
 * This ensures type safety as all `StatKey` must be present.
 */
type StatRecord = Record<StatKey, number>;

/**
 * A comprehensive structure to hold all character stats, separating
 * base values, flat additions (`add`), and percentage increases (`pct`).
 * This structure improves maintainability and clarity by making stat
 * calculations transparent.
 *
 * The final stat is calculated as:
 * `final[stat] = base[stat] * (1 + pct[stat]) + add[stat]`
 */
export interface CharacterStats {
  base: StatRecord; // Base stats from character + light cone
  add: StatRecord; // Flat stat additions from relics, effects
  pct: StatRecord; // Percentage stat increases from relics, effects
}

/**
 * Represents the final, calculated stats of a character after all
 * modifiers and calculations have been applied.
 */
export type FinalStats = StatRecord;
