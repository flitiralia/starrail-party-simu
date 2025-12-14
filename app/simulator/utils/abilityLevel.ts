/**
 * 星魂(E3/E5)に応じたアビリティレベル計算ユーティリティ
 * 
 * 注意: E3/E5でレベルが上昇するアビリティはキャラクターによって異なるため、
 * 実効レベルの計算は各キャラクターファイル内で直接行う。
 * 
 * 例:
 *   const skillLevel = eidolonLevel >= 3 ? 12 : 10;  // E3でスキル上昇
 *   const ultLevel = eidolonLevel >= 5 ? 12 : 10;    // E5で必殺技上昇
 *   const skillHeal = getLeveledValue(ABILITY_VALUES.skillHeal, skillLevel);
 */

/**
 * レベルに応じた値を取得
 * @param values レベル別の値マップ { 10: 値, 12: 値 }
 * @param level 実効レベル (10 or 12)
 * @returns 対応する値 (なければLv10の値)
 */
export function getLeveledValue<T>(
    values: Record<number, T>,
    level: number
): T {
    return values[level] ?? values[10];
}

/**
 * バリア値の型定義
 */
export interface BarrierValues {
    pct: number;
    flat: number;
}

/**
 * 回復値の型定義
 */
export interface HealValues {
    pct: number;
    flat: number;
}

/**
 * 強化攻撃倍率の型定義
 */
export interface EnhancedAttackValues {
    dh: number;       // 丹恒・騰荒本人の攻撃力参照倍率
    comrade: number;  // 同袍の攻撃力参照倍率
}

