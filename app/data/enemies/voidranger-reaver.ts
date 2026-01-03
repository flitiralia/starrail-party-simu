/**
 * 虚空浪人・略奪 (Voidranger: Reaver)
 *
 * Tier: Normal
 * Damage Type: Imaginary
 * Weaknesses: Physical, Lightning
 */

import { EnemyData } from '../../types/enemy';

export const VOIDRANGER_REAVER: EnemyData = {
    id: 'voidranger-reaver',
    name: 'ヴォイドレンジャー・略奪',
    rank: 'Normal',

    // ステータス (Level 95 基準)
    // HP: 41,072 (Base Lv.95: 16,429) -> Multiplier: 41072 / 16429 ≈ 2.50
    // ATK: 718 (Base Lv.95: 718) -> Multiplier: 1.0
    hpMultiplier: 2.5,
    atkMultiplier: 1.0,

    // 速度: 132 (Lv.95での実測値)
    // Lv.86+の1.32倍補正を考慮: 132 / 1.32 = 100
    baseSpd: 100,

    // 靭性: 20 (雑魚敵の標準値)
    toughness: 20,

    // 属性と弱点
    element: 'Imaginary',
    weaknesses: ['Physical', 'Lightning'],

    // 属性耐性
    // Physical: 0% (弱点)
    // Fire: 20%
    // Ice: 20%
    // Lightning: 0% (弱点)
    // Wind: 20%
    // Quantum: 20%
    // Imaginary: 20% (自属性だが仕様書では20%)
    elementalRes: {
        Fire: 0.2,
        Ice: 0.2,
        Wind: 0.2,
        Quantum: 0.2,
        Imaginary: 0.2,
    },

    // 効果抵抗
    // Level 95の基礎効果抵抗は10%。
    // 仕様書では20%と記載。
    // よってbaseEffectRes（追加値）は10%。
    baseEffectRes: 0.1,

    // スキル定義
    abilities: {
        basic: {
            id: 'voidranger_reaver_hunting_blade',
            name: 'Hunting Blade', // 「狩猟の刃」
            type: 'Basic ATK',
            description: '単体の敵に虚数属性ダメージ（攻撃力250%）を与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 2.5, toughnessReduction: 10 }] // 250% ATK
            },
            targetType: 'single_enemy',
            energyGain: 10,
        },
        skill: {
            id: 'voidranger_reaver_vortex_leap',
            name: 'Vortex Leap', // 「渦跳躍」
            type: 'Skill',
            description: '単体の敵とその周囲に虚数属性ダメージ（攻撃力150%）を与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.5, toughnessReduction: 5 }] // 150% ATK
            },
            targetType: 'blast',
            energyGain: 5,
        },
        // Normal敵なので必殺技・天賦・秘技は持たない
        ultimate: {
            id: 'voidranger_reaver_ult',
            name: 'None',
            type: 'Ultimate',
            description: ''
        },
        talent: {
            id: 'voidranger_reaver_talent',
            name: 'None',
            type: 'Talent',
            description: ''
        },
        technique: {
            id: 'voidranger_reaver_tech',
            name: 'None',
            type: 'Technique',
            description: ''
        }
    },

    // ★新しい敵スキルシステム★
    // 敵専用のスキル定義
    enemySkills: {
        'hunting_blade': {
            id: 'hunting_blade',
            name: 'Hunting Blade',
            targetType: 'single',
            damage: { multiplier: 2.5, toughnessReduction: 10 },
            energyGain: 10
        },
        'vortex_leap': {
            id: 'vortex_leap',
            name: 'Vortex Leap',
            targetType: 'blast',
            damage: { multiplier: 1.5, toughnessReduction: 5 },
            energyGain: 5
        }
    },

    // ★ターンごとの行動パターン★
    // Normal敵の標準的な行動パターン
    // 単純にスキルをランダムまたは交互に使用
    turnPatterns: [
        { primary: 'hunting_blade' },
        { primary: 'vortex_leap' }
    ],

    // 弱点撃破からの復帰後、1ターン目の行動に戻る
    resetPatternOnBreakRecovery: true,

    // 行動パターン（旧システム、後方互換性）
    actionPattern: undefined,

    // 被弾時EP回復量（雑魚敵の標準値）
    damageReceivedEnergyReward: 3,

    // デバフ抵抗（仕様書より）
    // すべて0%のため明示的な記述は不要だが、分かりやすさのため記載
    debuffRes: {
        // 全てのデバフに対して0%抵抗
    },
};
