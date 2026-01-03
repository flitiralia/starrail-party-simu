// StatKey: 全てのステータスキーのリテラル型ユニオン
export const STAT_KEYS = [
  'hp', 'atk', 'def',                           // HP, 攻撃力, 防御力
  'hp_pct', 'atk_pct', 'def_pct', 'spd_pct',      // HP%, 攻撃力%, 防御力%, 速度%
  'spd', 'aggro',                                // 速度, ヘイト
  'crit_rate', 'crit_dmg',                       // 会心率, 会心ダメージ
  'effect_hit_rate', 'effect_res',               // 効果命中, 効果抵抗
  'crowd_control_res',                           // 行動制限抵抗
  'bleed_res', 'burn_res', 'frozen_res', 'shock_res', 'wind_shear_res', 'entanglement_res', 'imprisonment_res', // 裂創/燃焼/凍結/感電/風化/もつれ/禁錮 抵抗
  'physical_res', 'fire_res', 'ice_res', 'lightning_res', 'wind_res', 'quantum_res', 'imaginary_res', // 属性耐性 (物理/炎/氷/雷/風/量子/虚数)
  'physical_res_pen', 'fire_res_pen', 'ice_res_pen', 'lightning_res_pen', 'wind_res_pen', 'quantum_res_pen', 'imaginary_res_pen', 'all_type_res_pen', // 属性耐性貫通
  'all_dmg_taken_boost', // 被ダメージ上昇 (全属性)
  'break_dmg_taken_boost', // 撃破被ダメージ上昇
  'dot_dmg_taken_boost', // 持続被ダメージ上昇
  'physical_dmg_taken_boost', 'fire_dmg_taken_boost', 'ice_dmg_taken_boost', 'lightning_dmg_taken_boost', 'wind_dmg_taken_boost', 'quantum_dmg_taken_boost', 'imaginary_dmg_taken_boost', // 属性別被ダメージ上昇
  'ult_dmg_taken_boost', // 必殺技被ダメージ上昇
  'skill_dmg_taken_boost', // 戦闘スキル被ダメージ上昇
  'basic_dmg_taken_boost', // 通常攻撃被ダメージ上昇
  'break_effect',                                // 撃破特効
  'energy_regen_rate', 'max_ep',                 // EP回復効率, 最大EP
  'outgoing_healing_boost',                      // 治癒量バフ（発動側）
  'incoming_heal_boost',                         // 被治癒量バフ（受ける側）
  'physical_dmg_boost', 'fire_dmg_boost', 'ice_dmg_boost', 'lightning_dmg_boost', 'wind_dmg_boost', 'quantum_dmg_boost', 'imaginary_dmg_boost', // 属性与ダメージバフ
  'basic_atk_dmg_boost',                         // 通常攻撃与ダメージバフ
  'skill_dmg_boost',                             // 戦闘スキル与ダメージバフ
  'ult_dmg_boost',                               // 必殺技与ダメージバフ
  'def_reduction',                               // 防御力ダウン (デバフ)
  'def_ignore',                                  // 防御力無視 (バフ)
  'break_efficiency_boost',                      // 弱点撃破効率バフ
  'break_dmg_boost',                             // 弱点撃破ダメージバフ
  'super_break_dmg_boost',                       // 超撃破ダメージバフ
  'fua_dmg_boost',                               // 追加攻撃与ダメージバフ
  'fua_crit_dmg',                                // 追加攻撃会心ダメージ
  'fua_dmg_taken_boost',                         // 追加攻撃被ダメージ上昇
  'dot_dmg_boost',                               // 持続ダメージ与ダメージバフ
  'dot_def_ignore',                              // 持続ダメージ防御力無視
  'all_type_dmg_boost',                          // 全属性与ダメージバフ
  'all_dmg_dealt_reduction',                     // 与ダメージダウン (敵に付与)
  'dmg_taken_reduction',                         // 被ダメージ軽減
  'shield_strength_boost'                        // バリア耐久値バフ
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/**
 * Defines how a stat is modified. This is a generic structure for buffs,
 * debuffs, set effects, etc., promoting extensibility.
 */
export interface Modifier { // NOTE: This interface might be deprecated in favor of IEffect
  target: StatKey; // The stat to be modified
  source: string; // e.g., 'Longevous Disciple 2-pc'
  type: 'add' | 'pct' | 'base'; // 'add' for flat, 'pct' for %, 'base' for modifying base stats directly
  value: number;
  // NEW: 動的計算用（他ユニットのステータス参照）
  // dynamicValueが定義されている場合、valueは無視され、この関数の戻り値が使用される
  dynamicValue?: (target: import('../simulator/engine/types').Unit, allUnits: import('../simulator/engine/types').Unit[]) => number;
  // 参照元ユニットID（動的計算で使用）
  sourceUnitId?: string;
  // スケーリング戦略（デフォルトは 'stack'）
  // 'stack': stackCount 倍する
  // 'fixed': stackCount に関わらず固定値（1倍）
  scalingStrategy?: 'fixed' | 'stack';
}

/**
 * A record to hold the value for each stat.
 * Using Partial to allow characters to omit specific stats,
 * but core stats remain theoretically required for consistency.
 */
type StatRecord = Partial<Record<StatKey, number>> & Pick<Record<StatKey, number>, 'hp' | 'atk' | 'def' | 'spd'>;

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
