import { StatKey } from '../types/index';

/**
 * ステータスキーの日本語表示名マッピング
 */
export const STAT_DISPLAY_NAMES: Record<StatKey, string> = {
    // 基礎ステータス
    'hp': 'HP',
    'atk': '攻撃力',
    'def': '防御力',
    'spd': '速度',
    'aggro': 'ヘイト',

    // パーセンテージ
    'hp_pct': 'HP(%)',
    'atk_pct': '攻撃力(%)',
    'def_pct': '防御力(%)',
    'spd_pct': '速度(%)',

    // 会心系
    'crit_rate': '会心率',
    'crit_dmg': '会心ダメージ',

    // 効果系
    'effect_hit_rate': '効果命中',
    'effect_res': '効果抵抗',

    // ダメージバフ系
    'physical_dmg_boost': '物理属性与ダメージ',
    'fire_dmg_boost': '火属性与ダメージ',
    'ice_dmg_boost': '氷属性与ダメージ',
    'lightning_dmg_boost': '雷属性与ダメージ',
    'wind_dmg_boost': '風属性与ダメージ',
    'quantum_dmg_boost': '量子属性与ダメージ',
    'imaginary_dmg_boost': '虚数属性与ダメージ',
    'all_type_dmg_boost': '全属性与ダメージ',

    // アクション別バフ
    'basic_atk_dmg_boost': '通常攻撃与ダメージ',
    'skill_dmg_boost': '戦闘スキル与ダメージ',
    'ult_dmg_boost': '必殺技与ダメージ',
    'fua_dmg_boost': '追加攻撃与ダメージ',
    'dot_dmg_boost': '持続ダメージ与ダメージ',
    'break_dmg_boost': '撃破ダメージ',
    'super_break_dmg_boost': '超撃破ダメージ',

    // その他特殊
    'break_effect': '撃破特効',
    'break_efficiency_boost': '弱点撃破効率',
    'energy_regen_rate': 'EP回復効率',
    'max_ep': '最大EP',
    'outgoing_healing_boost': '治癒量',
    'incoming_heal_boost': '被回復量',
    'shield_strength_boost': 'シールド耐久値',
    'def_ignore': '防御無視',
    'def_reduction': '防御力ダウン', // Debuff
    'fua_crit_dmg': '追加攻撃会心ダメージ',
    'dot_def_ignore': '持続ダメージ防御無視',

    // 耐性・貫通系
    'physical_res': '物理属性耐性',
    'fire_res': '火属性耐性',
    'ice_res': '氷属性耐性',
    'lightning_res': '雷属性耐性',
    'wind_res': '風属性耐性',
    'quantum_res': '量子属性耐性',
    'imaginary_res': '虚数属性耐性',
    'physical_res_pen': '物理属性耐性貫通',
    'fire_res_pen': '火属性耐性貫通',
    'ice_res_pen': '氷属性耐性貫通',
    'lightning_res_pen': '雷属性耐性貫通',
    'wind_res_pen': '風属性耐性貫通',
    'quantum_res_pen': '量子属性耐性貫通',
    'imaginary_res_pen': '虚数属性耐性貫通',
    'all_type_res_pen': '全属性耐性貫通',

    // 特殊耐性
    'crowd_control_res': '行動制限系デバフ抵抗',
    'bleed_res': '裂創抵抗',
    'burn_res': '燃焼抵抗',
    'frozen_res': '凍結抵抗',
    'shock_res': '感電抵抗',
    'wind_shear_res': '風化抵抗',
    'entanglement_res': 'もつれ抵抗',
    'imprisonment_res': '禁錮抵抗',

    // 被ダメージ系 (Debuff)
    'all_dmg_taken_boost': '被ダメージ',
    'physical_dmg_taken_boost': '物理属性被ダメージ',
    'fire_dmg_taken_boost': '火属性被ダメージ',
    'ice_dmg_taken_boost': '氷属性被ダメージ',
    'lightning_dmg_taken_boost': '雷属性被ダメージ',
    'wind_dmg_taken_boost': '風属性被ダメージ',
    'quantum_dmg_taken_boost': '量子属性被ダメージ',
    'imaginary_dmg_taken_boost': '虚数属性被ダメージ',
    'break_dmg_taken_boost': '撃破被ダメージ',
    'dot_dmg_taken_boost': '持続被ダメージ',
    'fua_dmg_taken_boost': '追加攻撃被ダメージ',
    'ult_dmg_taken_boost': '必殺技被ダメージ',
    'skill_dmg_taken_boost': '戦闘スキル被ダメージ',
    'basic_dmg_taken_boost': '通常攻撃被ダメージ',

    // ダメージ軽減
    'all_dmg_dealt_reduction': '与ダメージダウン',
    'dmg_taken_reduction': '被ダメージダウン',
};

/**
 * ステータスキーの表示名を取得する
 * @param key ステータスキー
 * @returns 日本語表示名
 */
export function getStatDisplayName(key: string): string {
    return STAT_DISPLAY_NAMES[key as StatKey] || key;
}
