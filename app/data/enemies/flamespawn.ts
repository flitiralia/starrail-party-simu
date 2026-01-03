/**
 * 炎の造物 (Flamespawn)
 *
 * Tier: Normal
 * Weaknesses: Physical, Ice
 */

import { EnemyData } from '../../types/enemy';

export const FLAMESPAWN: EnemyData = {
    id: 'flamespawn',
    name: '炎の造物',
    rank: 'Normal',

    // Stats (Level 95 reference from user markdown matches base stats exactly)
    // HP: 16,429 (Base Lv.95: 16,429) -> Multiplier: 1.0
    // ATK: 718 (Base Lv.95: 718) -> Multiplier: 1.0
    hpMultiplier: 1.0,
    atkMultiplier: 1.0,

    // Speed: 109.56 (Base Lv.95: 109.56 = 83 * 1.32) -> Base SPD: 83
    baseSpd: 83,

    // Toughness: 10 (Note: standard toughness scale is usually 30/60/90. User specified 10.)
    // If user means 10 in standard scale, it's very fragile.
    // If user means 1 bar = 10, then we might need to adjust, but based on "Normal" rank, 30-60 is common.
    // Given it's a "spawn", 10 might be correct for a minion.
    toughness: 10,

    // Element & Weaknesses
    element: 'Fire',
    weaknesses: ['Physical', 'Ice'],

    // Resistances
    // Physical: 0% (Weakness)
    // Fire: 40% (Specified)
    // Ice: 0% (Weakness)
    // Others: 20% (Default)
    elementalRes: {
        Fire: 0.4,
    },

    // Effect RES
    // Level 95 Base Effect RES is 10%.
    // User specified 10%.
    // So baseEffectRes (added value) should be 0.
    baseEffectRes: 0,

    // Skills
    abilities: {
        basic: {
            id: 'flamespawn_basic',
            name: 'Distract', // "注意を引きつける" / "Distract"
            type: 'Basic ATK',
            description: 'Deals minor Fire DMG to a single target.',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 2.5, toughnessReduction: 10 }] // 250% ATK
            },
            targetType: 'single_enemy',
            energyGain: 10,
        },
        skill: { // Fallback/Placeholder if needed, but this enemy only has basic
            id: 'flamespawn_skill',
            name: 'None',
            type: 'Skill',
            description: '',
            targetType: 'single_enemy'
        },
        ultimate: {
            id: 'flamespawn_ult',
            name: 'None',
            type: 'Ultimate',
            description: '',
            targetType: 'single_enemy'
        },
        talent: {
            id: 'flamespawn_talent',
            name: 'None',
            type: 'Talent',
            description: ''
        },
        technique: {
            id: 'flamespawn_tech',
            name: 'None',
            type: 'Technique',
            description: ''
        }
    },

    // Action Pattern
    // Only has one skill: Distract
    actionPattern: ['Basic ATK'],

    // 被弾時EP回復量（通常敵より高め）
    damageReceivedEnergyReward: 10,

    // デバフ抵抗（仕様書より）
    debuffRes: {
        burn: 1.0,  // 燃焼抵抗 100%（自属性のため）
    },
};
