/**
 * 虚空浪人・踏板 (Voidranger: Trampler)
 *
 * Tier: Elite
 * Damage Type: Quantum
 * Weaknesses: Physical, Wind, Imaginary
 */

import { EnemyData } from '../../types/enemy';

export const VOIDRANGER_TRAMPLER: EnemyData = {
    id: 'voidranger-trampler',
    name: 'ヴォイドレンジャー・蹂躙',
    rank: 'Elite',

    // ステータス (Level 95 基準)
    // HP: 301,193 (Base Lv.95: 16,429) -> Multiplier: 301193 / 16429 ≈ 18.33
    // ATK: 718 (Base Lv.95: 718) -> Multiplier: 1.0
    hpMultiplier: 18.33,
    atkMultiplier: 1.0,

    // 速度: 132 (Lv.95での実測値)
    // Lv.86+の1.32倍補正を考慮: 132 / 1.32 = 100
    baseSpd: 100,

    // 靭性: 100 (エリート敵の標準的な値)
    toughness: 100,

    // 属性と弱点
    element: 'Quantum',
    weaknesses: ['Physical', 'Wind', 'Imaginary'],

    // 属性耐性
    // Physical: 0% (弱点)
    // Fire: 20%
    // Ice: 20%
    // Lightning: 20%
    // Wind: 0% (弱点)
    // Quantum: 20% (自属性だが仕様書では20%)
    // Imaginary: 0% (弱点)
    elementalRes: {
        Fire: 0.2,
        Ice: 0.2,
        Lightning: 0.2,
        Quantum: 0.2,
    },

    // 効果抵抗
    // Level 95の基礎効果抵抗は10%。
    // 仕様書では30%と記載。
    // よってbaseEffectRes（追加値）は20%。
    baseEffectRes: 0.2,

    // スキル定義
    abilities: {
        basic: {
            id: 'voidranger_trampler_unreal_projection',
            name: 'Unreal Projection', // 「虚像投影」
            type: 'Basic ATK',
            description: '単体の敵に量子属性ダメージ（攻撃力300%）を与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 3.0, toughnessReduction: 10 }] // 300% ATK
            },
            targetType: 'single_enemy',
            energyGain: 10,
        },
        skill: {
            id: 'voidranger_trampler_rule_of_force',
            name: 'Rule of Force', // 「力の原則」
            type: 'Skill',
            description: '単体の敵に量子属性ダメージ（攻撃力400%）を与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 4.0, toughnessReduction: 15 }] // 400% ATK
            },
            targetType: 'single_enemy',
            energyGain: 15,
        },
        ultimate: {
            id: 'voidranger_trampler_end_of_bow',
            name: 'End of Bow', // 「弓の終焉」
            type: 'Ultimate',
            description: '単体の敵に量子属性ダメージ（攻撃力600%）を与え、高確率（基礎確率100%）でもつれを付与する（行動遅延50%、ATK80%の遅延ダメージ）。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 6.0, toughnessReduction: 30 }] // 600% ATK
            },
            targetType: 'single_enemy',
            energyGain: 25,
            // もつれ付与: 行動遅延50%、遅延ダメージATK80%
            // TODO: もつれ効果の実装
        },
        // 追加スキル: War Trample（範囲攻撃）
        // 敵のスキルは abilities に入らないため、特殊スキルとして定義
        talent: {
            id: 'voidranger_trampler_war_trample',
            name: 'War Trample', // 「戦争の踏みつけ」
            type: 'Talent',
            description: '単体の敵とその周囲に量子属性ダメージ（攻撃力250%）を与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 2.5, toughnessReduction: 10 }] // 250% ATK
            },
            targetType: 'blast',
        },
        technique: {
            id: 'voidranger_trampler_tech',
            name: 'None',
            type: 'Technique',
            description: ''
        }
    },

    // ★新しい敵スキルシステム★
    // 敵専用のスキル定義
    enemySkills: {
        'end_of_bow': {
            id: 'end_of_bow',
            name: 'End of Bow',
            targetType: 'single',
            damage: { multiplier: 6.0, toughnessReduction: 30 },
            energyGain: 25,
            baseChance: 1.0,
            debuffType: 'Entanglement',
            entanglementParams: {
                actionDelay: 0.5,           // 行動遅延50%
                delayedDmgMultiplier: 0.8   // 遅延ダメージATK80%
            }
        },
        'unreal_projection': {
            id: 'unreal_projection',
            name: 'Unreal Projection',
            targetType: 'single',
            damage: { multiplier: 3.0, toughnessReduction: 10 },
            energyGain: 10
        },
        'rule_of_force': {
            id: 'rule_of_force',
            name: 'Rule of Force',
            targetType: 'single',
            damage: { multiplier: 4.0, toughnessReduction: 15 },
            energyGain: 15
        },
        'war_trample': {
            id: 'war_trample',
            name: 'War Trample',
            targetType: 'blast',
            damage: { multiplier: 2.5, toughnessReduction: 10 },
            energyGain: 10
        },
        'spiral_arrow': {
            id: 'spiral_arrow',
            name: 'Spiral Arrow',
            targetType: 'lock_on',
            energyGain: 0
        }
    },

    // ★ターンごとの行動パターン★
    // 1ターン目: Rule of Force → Spiral Arrow（ロックオン）
    // 2ターン目: End of Bow（ロックオン先へ）→ War Trample
    // 3ターン目: Unreal Projection → War Trample
    turnPatterns: [
        { primary: 'rule_of_force', secondary: 'spiral_arrow' },
        { primary: 'end_of_bow', secondary: 'war_trample' },
        { primary: 'unreal_projection', secondary: 'war_trample' }
    ],

    // 弱点撃破からの復帰後、1ターン目の行動に戻る
    resetPatternOnBreakRecovery: true,

    // 行動パターン（旧システム、後方互換性）
    actionPattern: undefined,

    // 被弾時EP回復量（エリート敵の標準値）
    damageReceivedEnergyReward: 5,

    // デバフ抵抗（仕様書より）
    // すべて0%のため明示的な記述は不要だが、分かりやすさのため記載
    debuffRes: {
        // 全てのデバフに対して0%抵抗
    },
};
