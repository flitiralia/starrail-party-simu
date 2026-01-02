/**
 * サンプル敵データ（EnemyData型）
 * テストやシミュレーション用のサンプル敵定義。
 */

import { EnemyData } from '../../types/enemy';

// =============================================================================
// サンプル敵: テスト用ダミー（Normal）
// =============================================================================

/**
 * テスト用ダミー敵（Normal）
 * 倍率1.0の基準敵。シミュレーションテストに使用。
 */
export const SAMPLE_DUMMY: EnemyData = {
    id: 'sample_dummy_normal',
    name: 'テスト用ダミー',
    rank: 'Normal',

    // HP/ATK倍率（基準敵なので1.0）
    hpMultiplier: 1.0,
    atkMultiplier: 1.0,

    // 速度・靭性
    baseSpd: 83,
    toughness: 60,

    // 属性と弱点
    element: 'Physical',
    weaknesses: ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary'],

    // 属性耐性（弱点なので基本0%）
    elementalRes: {},

    // 効果抵抗基礎値（Normalなので0%）
    baseEffectRes: 0,

    // スキル定義
    abilities: {
        basic: {
            id: 'sample_dummy_basic',
            name: 'ダミー攻撃',
            type: 'Basic ATK',
            description: 'テスト用の基本攻撃。',
            damage: { type: 'simple', hits: [{ multiplier: 0.5, toughnessReduction: 10 }], scaling: 'atk' },
            targetType: 'single_enemy',
        },
        skill: {
            id: 'sample_dummy_skill',
            name: 'ダミースキル',
            type: 'Skill',
            description: 'テスト用のスキル攻撃。',
            damage: { type: 'simple', hits: [{ multiplier: 1.0, toughnessReduction: 20 }], scaling: 'atk' },
            targetType: 'single_enemy',
        },
        ultimate: {
            id: 'sample_dummy_ultimate',
            name: 'ダミー必殺技',
            type: 'Ultimate',
            description: 'テスト用の必殺技。',
            damage: { type: 'aoe', hits: [{ multiplier: 1.5, toughnessReduction: 20 }], scaling: 'atk' },
            targetType: 'all_enemies',
        },
        talent: {
            id: 'sample_dummy_talent',
            name: 'ダミー天賦',
            type: 'Talent',
            description: 'テスト用の天賦効果。',
        },
        technique: {
            id: 'sample_dummy_technique',
            name: 'ダミー秘技',
            type: 'Technique',
            description: 'テスト用の秘技効果。',
        },
    },
};

// =============================================================================
// サンプル敵: 精鋭敵（Elite）
// =============================================================================

/**
 * サンプル精鋭敵（Elite）
 * HPが基準の約3.67倍。
 */
export const SAMPLE_ELITE: EnemyData = {
    id: 'sample_elite_01',
    name: 'サンプル精鋭',
    rank: 'Elite',

    // HP/ATK倍率（精鋭なので高め）
    hpMultiplier: 3.6665,
    atkMultiplier: 2.0,

    // 速度・靭性
    baseSpd: 100,
    toughness: 360,

    // 属性と弱点
    element: 'Fire',
    weaknesses: ['Ice', 'Quantum'],

    // 属性耐性（弱点以外は20%）
    elementalRes: {
        Physical: 0.2,
        Fire: 0.2,
        Lightning: 0.2,
        Wind: 0.2,
        Imaginary: 0.2,
    },

    // 効果抵抗基礎値（Elite = 20%）
    baseEffectRes: 0.20,

    // スキル定義
    abilities: {
        basic: {
            id: 'sample_elite_basic',
            name: '精鋭の一撃',
            type: 'Basic ATK',
            description: '精鋭敵の基本攻撃。',
            damage: { type: 'simple', hits: [{ multiplier: 1.0, toughnessReduction: 15 }], scaling: 'atk' },
            targetType: 'single_enemy',
        },
        skill: {
            id: 'sample_elite_skill',
            name: '精鋭のスキル',
            type: 'Skill',
            description: '精鋭敵のスキル攻撃。',
            damage: { type: 'blast', mainHits: [{ multiplier: 1.5, toughnessReduction: 20 }], adjacentHits: [{ multiplier: 0.75, toughnessReduction: 10 }], scaling: 'atk' },
            targetType: 'blast',
        },
        ultimate: {
            id: 'sample_elite_ultimate',
            name: '精鋭の必殺技',
            type: 'Ultimate',
            description: '精鋭敵の必殺技。',
            damage: { type: 'aoe', hits: [{ multiplier: 2.0, toughnessReduction: 25 }], scaling: 'atk' },
            targetType: 'all_enemies',
        },
        talent: {
            id: 'sample_elite_talent',
            name: '精鋭の天賦',
            type: 'Talent',
            description: '精鋭敵の天賦効果。',
        },
        technique: {
            id: 'sample_elite_technique',
            name: '精鋭の秘技',
            type: 'Technique',
            description: '精鋭敵の秘技効果。',
        },
    },
};

// =============================================================================
// サンプル敵: ボス（Boss）
// =============================================================================

/**
 * サンプルボス敵
 * HPが基準の約100倍。
 */
export const SAMPLE_BOSS: EnemyData = {
    id: 'sample_boss_01',
    name: 'サンプルボス',
    rank: 'Boss',

    // HP/ATK倍率（ボスなので高い）
    hpMultiplier: 100.0,
    atkMultiplier: 5.0,

    // 速度・靭性
    baseSpd: 120,
    toughness: 720,

    // 属性と弱点
    element: 'Lightning',
    weaknesses: ['Wind', 'Imaginary'],

    // 属性耐性（弱点以外は20%）
    elementalRes: {
        Physical: 0.2,
        Fire: 0.2,
        Ice: 0.2,
        Lightning: 0.2,
        Quantum: 0.2,
    },

    // 効果抵抗基礎値（Boss = 30%）
    baseEffectRes: 0.30,

    // スキル定義
    abilities: {
        basic: {
            id: 'sample_boss_basic',
            name: 'ボスの一撃',
            type: 'Basic ATK',
            description: 'ボス敵の基本攻撃。',
            damage: { type: 'simple', hits: [{ multiplier: 1.5, toughnessReduction: 20 }], scaling: 'atk' },
            targetType: 'single_enemy',
        },
        skill: {
            id: 'sample_boss_skill',
            name: 'ボスのスキル',
            type: 'Skill',
            description: 'ボス敵のスキル攻撃。',
            damage: { type: 'aoe', hits: [{ multiplier: 2.0, toughnessReduction: 25 }], scaling: 'atk' },
            targetType: 'all_enemies',
        },
        ultimate: {
            id: 'sample_boss_ultimate',
            name: 'ボスの必殺技',
            type: 'Ultimate',
            description: 'ボス敵の必殺技。',
            damage: { type: 'aoe', hits: [{ multiplier: 3.0, toughnessReduction: 30 }], scaling: 'atk' },
            targetType: 'all_enemies',
        },
        talent: {
            id: 'sample_boss_talent',
            name: 'ボスの天賦',
            type: 'Talent',
            description: 'ボス敵の天賦効果。',
        },
        technique: {
            id: 'sample_boss_technique',
            name: 'ボスの秘技',
            type: 'Technique',
            description: 'ボス敵の秘技効果。',
        },
    },
};
