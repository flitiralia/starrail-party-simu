/**
 * 霜の造物 (Frostspawn)
 *
 * Tier: Normal
 * Damage Type: Ice
 * Weaknesses: Fire, Wind
 */

import { EnemyData } from '../../types/enemy';

export const FROSTSPAWN: EnemyData = {
    id: 'frostspawn',
    name: '霜の造物',
    rank: 'Normal',

    // ステータス (Level 95 基準)
    // HP: 16,429 (Base Lv.95: 16,429) -> Multiplier: 1.0
    // ATK: 718 (Base Lv.95: 718) -> Multiplier: 1.0
    hpMultiplier: 1.0,
    atkMultiplier: 1.0,

    // 速度: 109.56 (Base Lv.95: 109.56 = 83 * 1.32) -> Base SPD: 83
    baseSpd: 83,

    // 靭性: 10 (仕様書通り、ミニオン級の脆い敵)
    toughness: 10,

    // 属性と弱点
    element: 'Ice',
    weaknesses: ['Fire', 'Wind'],

    // 属性耐性
    // Physical: 20%
    // Fire: 0% (弱点)
    // Ice: 40% (自属性で高耐性)
    // Lightning: 20%
    // Wind: 0% (弱点)
    // Quantum: 20%
    // Imaginary: 20%
    elementalRes: {
        Physical: 0.2,
        Ice: 0.4,
        Lightning: 0.2,
        Quantum: 0.2,
        Imaginary: 0.2,
    },

    // 効果抵抗
    // Level 95の基礎効果抵抗は10%。
    // 仕様書でも10%と記載。
    // よってbaseEffectRes（追加値）は0。
    baseEffectRes: 0,

    // スキル定義
    abilities: {
        basic: {
            id: 'frostspawn_basic',
            name: 'Distract', // 「注意を引きつける」
            type: 'Basic ATK',
            description: '単体の敵に氷属性ダメージ（攻撃力250%）を与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 2.5, toughnessReduction: 10 }] // 250% ATK
            },
            targetType: 'single_enemy',
            energyGain: 10,
        },
        // 以下はこの敵が持たないスキルのプレースホルダー
        skill: {
            id: 'frostspawn_skill',
            name: 'None',
            type: 'Skill',
            description: '',
            targetType: 'single_enemy'
        },
        ultimate: {
            id: 'frostspawn_ult',
            name: 'None',
            type: 'Ultimate',
            description: '',
            targetType: 'single_enemy'
        },
        talent: {
            id: 'frostspawn_talent',
            name: 'None',
            type: 'Talent',
            description: ''
        },
        technique: {
            id: 'frostspawn_tech',
            name: 'None',
            type: 'Technique',
            description: ''
        }
    },

    // 行動パターン
    // Distractスキルのみ持つ
    actionPattern: ['Basic ATK'],

    // 被弾時EP回復量（通常敵より高め）
    damageReceivedEnergyReward: 10,

    // デバフ抵抗（仕様書より）
    debuffRes: {
        freeze: 1.0,  // 凍結抵抗 100%（自属性のため）
    },
};
