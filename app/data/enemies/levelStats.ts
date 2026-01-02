/**
 * 敵ユニットのレベル別基準ステータステーブル。
 * HP/ATKは基準値（hpMultiplier=1.0の敵の値）。
 * 敵ごとのHP/ATKは、この基準値に敵の倍率を掛けて算出する。
 *
 * @see app/system_infomation/status-level.txt
 */

// =============================================================================
// レベル別基準テーブル（Lv.1〜95）
// =============================================================================

export interface LevelStats {
    hp: number;
    atk: number;
    def: number;
    spd: number;
    effectHitRate: number;
    effectRes: number;
}

/**
 * レベル別基準ステータス（status-level.txt から生成）
 */
export const ENEMY_LEVEL_STATS: Record<number, LevelStats> = {
    1: { hp: 45, atk: 12, def: 210, spd: 83, effectHitRate: 0, effectRes: 0 },
    2: { hp: 59, atk: 14, def: 220, spd: 83, effectHitRate: 0, effectRes: 0 },
    3: { hp: 61, atk: 15, def: 230, spd: 83, effectHitRate: 0, effectRes: 0 },
    4: { hp: 76, atk: 20, def: 240, spd: 83, effectHitRate: 0, effectRes: 0 },
    5: { hp: 80, atk: 21, def: 250, spd: 83, effectHitRate: 0, effectRes: 0 },
    6: { hp: 83, atk: 22, def: 260, spd: 83, effectHitRate: 0, effectRes: 0 },
    7: { hp: 87, atk: 23, def: 270, spd: 83, effectHitRate: 0, effectRes: 0 },
    8: { hp: 91, atk: 25, def: 280, spd: 83, effectHitRate: 0, effectRes: 0 },
    9: { hp: 95, atk: 26, def: 290, spd: 83, effectHitRate: 0, effectRes: 0 },
    10: { hp: 99, atk: 26, def: 300, spd: 83, effectHitRate: 0, effectRes: 0 },
    11: { hp: 106, atk: 29, def: 310, spd: 83, effectHitRate: 0, effectRes: 0 },
    12: { hp: 113, atk: 32, def: 320, spd: 83, effectHitRate: 0, effectRes: 0 },
    13: { hp: 120, atk: 34, def: 330, spd: 83, effectHitRate: 0, effectRes: 0 },
    14: { hp: 127, atk: 37, def: 340, spd: 83, effectHitRate: 0, effectRes: 0 },
    15: { hp: 134, atk: 40, def: 350, spd: 83, effectHitRate: 0, effectRes: 0 },
    16: { hp: 141, atk: 42, def: 360, spd: 83, effectHitRate: 0, effectRes: 0 },
    17: { hp: 148, atk: 45, def: 370, spd: 83, effectHitRate: 0, effectRes: 0 },
    18: { hp: 155, atk: 48, def: 380, spd: 83, effectHitRate: 0, effectRes: 0 },
    19: { hp: 162, atk: 50, def: 390, spd: 83, effectHitRate: 0, effectRes: 0 },
    20: { hp: 169, atk: 53, def: 400, spd: 83, effectHitRate: 0, effectRes: 0 },
    21: { hp: 181, atk: 57, def: 410, spd: 83, effectHitRate: 0, effectRes: 0 },
    22: { hp: 194, atk: 62, def: 420, spd: 83, effectHitRate: 0, effectRes: 0 },
    23: { hp: 206, atk: 66, def: 430, spd: 83, effectHitRate: 0, effectRes: 0 },
    24: { hp: 218, atk: 71, def: 440, spd: 83, effectHitRate: 0, effectRes: 0 },
    25: { hp: 231, atk: 75, def: 450, spd: 83, effectHitRate: 0, effectRes: 0 },
    26: { hp: 243, atk: 80, def: 460, spd: 83, effectHitRate: 0, effectRes: 0 },
    27: { hp: 255, atk: 84, def: 470, spd: 83, effectHitRate: 0, effectRes: 0 },
    28: { hp: 268, atk: 89, def: 480, spd: 83, effectHitRate: 0, effectRes: 0 },
    29: { hp: 280, atk: 93, def: 490, spd: 83, effectHitRate: 0, effectRes: 0 },
    30: { hp: 293, atk: 98, def: 500, spd: 83, effectHitRate: 0, effectRes: 0 },
    31: { hp: 316, atk: 104, def: 510, spd: 83, effectHitRate: 0, effectRes: 0 },
    32: { hp: 340, atk: 109, def: 520, spd: 83, effectHitRate: 0, effectRes: 0 },
    33: { hp: 364, atk: 115, def: 530, spd: 83, effectHitRate: 0, effectRes: 0 },
    34: { hp: 388, atk: 121, def: 540, spd: 83, effectHitRate: 0, effectRes: 0 },
    35: { hp: 412, atk: 127, def: 550, spd: 83, effectHitRate: 0, effectRes: 0 },
    36: { hp: 436, atk: 132, def: 560, spd: 83, effectHitRate: 0, effectRes: 0 },
    37: { hp: 460, atk: 138, def: 570, spd: 83, effectHitRate: 0, effectRes: 0 },
    38: { hp: 484, atk: 144, def: 580, spd: 83, effectHitRate: 0, effectRes: 0 },
    39: { hp: 508, atk: 150, def: 590, spd: 83, effectHitRate: 0, effectRes: 0 },
    40: { hp: 531, atk: 155, def: 600, spd: 83, effectHitRate: 0, effectRes: 0 },
    41: { hp: 602, atk: 163, def: 610, spd: 83, effectHitRate: 0, effectRes: 0 },
    42: { hp: 672, atk: 171, def: 620, spd: 83, effectHitRate: 0, effectRes: 0 },
    43: { hp: 743, atk: 179, def: 630, spd: 83, effectHitRate: 0, effectRes: 0 },
    44: { hp: 813, atk: 187, def: 640, spd: 83, effectHitRate: 0, effectRes: 0 },
    45: { hp: 883, atk: 195, def: 650, spd: 83, effectHitRate: 0, effectRes: 0 },
    46: { hp: 954, atk: 203, def: 660, spd: 83, effectHitRate: 0, effectRes: 0 },
    47: { hp: 1024, atk: 210, def: 670, spd: 83, effectHitRate: 0, effectRes: 0 },
    48: { hp: 1095, atk: 218, def: 680, spd: 83, effectHitRate: 0, effectRes: 0 },
    49: { hp: 1165, atk: 226, def: 690, spd: 83, effectHitRate: 0, effectRes: 0 },
    50: { hp: 1235, atk: 234, def: 700, spd: 83, effectHitRate: 0, effectRes: 0 },
    51: { hp: 1406, atk: 244, def: 710, spd: 83, effectHitRate: 0.008, effectRes: 0.004 },
    52: { hp: 1577, atk: 255, def: 720, spd: 83, effectHitRate: 0.016, effectRes: 0.008 },
    53: { hp: 1747, atk: 265, def: 730, spd: 83, effectHitRate: 0.024, effectRes: 0.012 },
    54: { hp: 1918, atk: 276, def: 740, spd: 83, effectHitRate: 0.032, effectRes: 0.016 },
    55: { hp: 2089, atk: 286, def: 750, spd: 83, effectHitRate: 0.04, effectRes: 0.02 },
    56: { hp: 2259, atk: 297, def: 760, spd: 83, effectHitRate: 0.048, effectRes: 0.024 },
    57: { hp: 2430, atk: 307, def: 770, spd: 83, effectHitRate: 0.056, effectRes: 0.028 },
    58: { hp: 2601, atk: 317, def: 780, spd: 83, effectHitRate: 0.064, effectRes: 0.032 },
    59: { hp: 2771, atk: 328, def: 790, spd: 83, effectHitRate: 0.072, effectRes: 0.036 },
    60: { hp: 2942, atk: 338, def: 800, spd: 83, effectHitRate: 0.08, effectRes: 0.04 },
    61: { hp: 3178, atk: 348, def: 810, spd: 83, effectHitRate: 0.088, effectRes: 0.044 },
    62: { hp: 3414, atk: 358, def: 820, spd: 83, effectHitRate: 0.096, effectRes: 0.048 },
    63: { hp: 3649, atk: 368, def: 830, spd: 83, effectHitRate: 0.104, effectRes: 0.052 },
    64: { hp: 3885, atk: 377, def: 840, spd: 83, effectHitRate: 0.112, effectRes: 0.056 },
    65: { hp: 4121, atk: 387, def: 850, spd: 91.3, effectHitRate: 0.12, effectRes: 0.06 },
    66: { hp: 4357, atk: 397, def: 860, spd: 91.3, effectHitRate: 0.128, effectRes: 0.064 },
    67: { hp: 4593, atk: 407, def: 870, spd: 91.3, effectHitRate: 0.136, effectRes: 0.068 },
    68: { hp: 4829, atk: 416, def: 880, spd: 91.3, effectHitRate: 0.144, effectRes: 0.072 },
    69: { hp: 5064, atk: 426, def: 890, spd: 91.3, effectHitRate: 0.152, effectRes: 0.076 },
    70: { hp: 5300, atk: 436, def: 900, spd: 91.3, effectHitRate: 0.16, effectRes: 0.08 },
    71: { hp: 5596, atk: 447, def: 910, spd: 91.3, effectHitRate: 0.168, effectRes: 0.084 },
    72: { hp: 5892, atk: 459, def: 920, spd: 91.3, effectHitRate: 0.176, effectRes: 0.088 },
    73: { hp: 6188, atk: 471, def: 930, spd: 91.3, effectHitRate: 0.184, effectRes: 0.092 },
    74: { hp: 6484, atk: 482, def: 940, spd: 91.3, effectHitRate: 0.192, effectRes: 0.096 },
    75: { hp: 6780, atk: 494, def: 950, spd: 91.3, effectHitRate: 0.20, effectRes: 0.10 },
    76: { hp: 7076, atk: 506, def: 960, spd: 91.3, effectHitRate: 0.208, effectRes: 0.10 },
    77: { hp: 7371, atk: 517, def: 970, spd: 91.3, effectHitRate: 0.216, effectRes: 0.10 },
    78: { hp: 7667, atk: 529, def: 980, spd: 99.6, effectHitRate: 0.224, effectRes: 0.10 },
    79: { hp: 7963, atk: 541, def: 990, spd: 99.6, effectHitRate: 0.232, effectRes: 0.10 },
    80: { hp: 8259, atk: 552, def: 1000, spd: 99.6, effectHitRate: 0.24, effectRes: 0.10 },
    81: { hp: 8676, atk: 563, def: 1010, spd: 99.6, effectHitRate: 0.248, effectRes: 0.10 },
    82: { hp: 9109, atk: 574, def: 1020, spd: 99.6, effectHitRate: 0.256, effectRes: 0.10 },
    83: { hp: 9557, atk: 585, def: 1030, spd: 99.6, effectHitRate: 0.264, effectRes: 0.10 },
    84: { hp: 10023, atk: 597, def: 1040, spd: 99.6, effectHitRate: 0.272, effectRes: 0.10 },
    85: { hp: 10505, atk: 608, def: 1050, spd: 99.6, effectHitRate: 0.28, effectRes: 0.10 },
    86: { hp: 11005, atk: 619, def: 1060, spd: 109.56, effectHitRate: 0.288, effectRes: 0.10 },
    87: { hp: 11524, atk: 630, def: 1070, spd: 109.56, effectHitRate: 0.296, effectRes: 0.10 },
    88: { hp: 12062, atk: 641, def: 1080, spd: 109.56, effectHitRate: 0.304, effectRes: 0.10 },
    89: { hp: 12620, atk: 652, def: 1090, spd: 109.56, effectHitRate: 0.312, effectRes: 0.10 },
    90: { hp: 13199, atk: 663, def: 1100, spd: 109.56, effectHitRate: 0.32, effectRes: 0.10 },
    91: { hp: 13799, atk: 674, def: 1110, spd: 109.56, effectHitRate: 0.328, effectRes: 0.10 },
    92: { hp: 14421, atk: 685, def: 1120, spd: 109.56, effectHitRate: 0.336, effectRes: 0.10 },
    93: { hp: 15066, atk: 696, def: 1130, spd: 109.56, effectHitRate: 0.344, effectRes: 0.10 },
    94: { hp: 15735, atk: 707, def: 1140, spd: 109.56, effectHitRate: 0.352, effectRes: 0.10 },
    95: { hp: 16429, atk: 718, def: 1150, spd: 109.56, effectHitRate: 0.36, effectRes: 0.10 },
};

// =============================================================================
// ステータス計算関数
// =============================================================================

import { EnemyData } from '../../types/enemy';

/**
 * 敵の最終ステータスを計算する。
 * @param enemyData 敵の静的データ
 * @param level 敵のレベル
 * @returns 計算済みステータス
 */
export function calculateEnemyStats(
    enemyData: EnemyData,
    level: number
): {
    hp: number;
    atk: number;
    def: number;
    spd: number;
    effectHitRate: number;
    effectRes: number;
} {
    const baseStats = ENEMY_LEVEL_STATS[level] ?? ENEMY_LEVEL_STATS[80];

    // 速度倍率（レベル閾値でステップ変化）
    let spdMultiplier = 1.0;
    if (level >= 86) spdMultiplier = 1.32;
    else if (level >= 78) spdMultiplier = 1.20;
    else if (level >= 65) spdMultiplier = 1.10;

    return {
        hp: Math.floor(baseStats.hp * enemyData.hpMultiplier),
        atk: Math.floor(baseStats.atk * enemyData.atkMultiplier),
        def: baseStats.def,
        spd: enemyData.baseSpd * spdMultiplier,
        effectHitRate: baseStats.effectHitRate,
        effectRes: baseStats.effectRes + enemyData.baseEffectRes,
    };
}

/**
 * 敵の防御力を計算する（汎用）。
 * @param level 敵のレベル
 * @returns 防御力
 */
export function calculateEnemyDef(level: number): number {
    return 200 + 10 * level;
}
