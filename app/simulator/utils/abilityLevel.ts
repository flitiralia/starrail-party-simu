/**
 * 星魂(E3/E5)に応じたアビリティレベル計算ユーティリティ
 * 
 * E3/E5でレベルが上昇するアビリティのパターンはキャラクターによって異なりますが、
 * 一般的には以下の2パターンが多いです。
 * 
 * パターン1 (Standard):
 *   E3: 必殺技Lv+2, 天賦Lv+2
 *   E5: スキルLv+2, 通常Lv+1
 * 
 * パターン2 (Alternative):
 *   E3: スキルLv+2, 通常Lv+1
 *   E5: 必殺技Lv+2, 天賦Lv+2
 * 
 * このユーティリティは、eidolonLevelと上昇パターン(3 or 5)を指定することで
 * 実効レベルを計算します。
 */

/**
 * アビリティの種類
 */
export type AbilityType = 'Basic' | 'Skill' | 'Ultimate' | 'Talent';

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
 * 星魂レベルに応じたアビリティレベルを計算
 * @param eidolonLevel 現在の星魂レベル
 * @param boostAtEidolon そのアビリティがブーストされる星魂レベル (3 or 5)
 * @param abilityType アビリティの種類 (Basic, Skill, Ultimate, Talent)
 * @returns 実効レベル (通常攻撃はLv6/7, その他はLv10/12)
 */
export function calculateAbilityLevel(
    eidolonLevel: number,
    boostAtEidolon: 3 | 5,
    abilityType: AbilityType
): number {
    const isBoosted = eidolonLevel >= boostAtEidolon;

    if (abilityType === 'Basic') {
        // 通常攻撃: 基本Lv6 -> ブースト後Lv7
        return isBoosted ? 7 : 6;
    } else {
        // その他: 基本Lv10 -> ブースト後Lv12
        return isBoosted ? 12 : 10;
    }
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
