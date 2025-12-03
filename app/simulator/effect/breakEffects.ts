import {
    LEVEL_CONSTANT_80,
    IMPRISONMENT_BASE_DELAY,
    ENTANGLEMENT_BASE_DELAY
} from "../engine/constants";

import { GameState, Unit } from "../engine/types";
import { DoTEffect, BreakStatusEffect, DurationType, IEffect } from "./types";
import { Element } from "@/app/types";
import { calculateBreakDoTDamage, calculateBreakAdditionalDamage } from "../damage";



// --- Helper to create unique IDs ---
const generateEffectId = (type: string, sourceId: string, targetId: string) =>
    `${type}-${sourceId}-${targetId}`;

// --- DoT Factories ---

export function createBleedEffect(source: Unit, target: Unit): DoTEffect {
    // Bleed: 16% MaxHP (Normal) / 7% MaxHP (Elite)
    // Cap: 2 * LevelConst * ToughnessMult
    const maxHpFraction = target.isEnemy ? (target.maxToughness > 100 ? 0.07 : 0.16) : 0.16; // Simplified Elite check
    let baseDmg = target.hp * maxHpFraction; // Should be MaxHP, but Unit only has hp (current). Assuming hp is max for now or need maxHp in Unit.
    // Wait, Unit has hp (current). We need maxHp. 
    // Unit.stats.hp is max HP.
    baseDmg = target.stats.hp * maxHpFraction;

    const toughnessMult = 0.5 + (target.maxToughness / 40); // Consistent with damage.ts
    const cap = 2 * LEVEL_CONSTANT_80 * toughnessMult;

    return {
        id: generateEffectId('Bleed', source.id, target.id),
        name: '裂創',
        category: 'DEBUFF',
        type: 'DoT',
        dotType: 'Bleed',
        sourceUnitId: source.id,
        durationType: 'TURN_START_BASED',
        duration: 2,
        damageCalculation: 'fixed',
        baseDamage: Math.min(baseDmg, cap),
        stackCount: 1,
        maxStacks: 1,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

export function createBurnEffect(source: Unit, target: Unit): DoTEffect {
    // Burn: 1 * LevelConst
    return {
        id: generateEffectId('Burn', source.id, target.id),
        name: '燃焼',
        category: 'DEBUFF',
        type: 'DoT',
        dotType: 'Burn',
        sourceUnitId: source.id,
        durationType: 'TURN_START_BASED',
        duration: 2,
        damageCalculation: 'fixed',
        baseDamage: 1 * LEVEL_CONSTANT_80,
        stackCount: 1,
        maxStacks: 1,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

export function createShockEffect(source: Unit, target: Unit): DoTEffect {
    // Shock: 2 * LevelConst
    return {
        id: generateEffectId('Shock', source.id, target.id),
        name: '感電',
        category: 'DEBUFF',
        type: 'DoT',
        dotType: 'Shock',
        sourceUnitId: source.id,
        durationType: 'TURN_START_BASED',
        duration: 2,
        damageCalculation: 'fixed',
        baseDamage: 2 * LEVEL_CONSTANT_80,
        stackCount: 1,
        maxStacks: 1,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

/**
 * キャラクター固有のDoTエフェクト作成（汎用）
 * @param source ソースユニット
 * @param target ターゲットユニット
 * @param dotType DoTの種類
 * @param multiplier ダメージ倍率（ATK × multiplier）
 * @param duration 継続ターン数
 */
export function createCharacterDoTEffect(
    source: Unit,
    target: Unit,
    dotType: 'Bleed' | 'Burn' | 'Shock' | 'WindShear',
    multiplier: number,
    duration: number
): DoTEffect {
    const nameMap = {
        Bleed: '裂創',
        Burn: '燃焼',
        Shock: '感電',
        WindShear: '風化'
    };

    return {
        id: generateEffectId(dotType, source.id, target.id),
        name: nameMap[dotType],
        category: 'DEBUFF',
        type: 'DoT',
        dotType: dotType,
        sourceUnitId: source.id,
        durationType: 'TURN_START_BASED',
        duration: duration,
        damageCalculation: 'multiplier',
        multiplier: multiplier,
        stackCount: 1,
        maxStacks: 1,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

/**
 * キャラクター固有の感電エフェクト（後方互換性のためのラッパー）
 * @param source ソースユニット
 * @param target ターゲットユニット
 * @param multiplier ダメージ倍率
 * @param duration 継続ターン数
 */
export function createCharacterShockEffect(
    source: Unit,
    target: Unit,
    multiplier: number,
    duration: number
): DoTEffect {
    return createCharacterDoTEffect(source, target, 'Shock', multiplier, duration);
}

export function createWindShearEffect(source: Unit, target: Unit): DoTEffect {
    // Wind Shear: 1 * Stack * LevelConst
    // Normal: 1 stack, Elite: 3 stacks. Max 5.
    const initialStacks = target.maxToughness > 100 ? 3 : 1; // Simplified Elite check

    return {
        id: generateEffectId('WindShear', source.id, target.id),
        name: '風化',
        category: 'DEBUFF',
        type: 'DoT',
        dotType: 'WindShear',
        sourceUnitId: source.id,
        durationType: 'TURN_START_BASED',
        duration: 2,
        damageCalculation: 'fixed',
        baseDamage: 1 * LEVEL_CONSTANT_80, // Per stack
        stackCount: initialStacks,
        maxStacks: 5,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

// --- Status Factories ---

export function createFreezeEffect(source: Unit, target: Unit): BreakStatusEffect {
    // Freeze: 1 * LevelConst dmg on remove. Skip turn.
    return {
        id: `freeze-${target.id}`,
        name: '凍結',
        category: 'DEBUFF',
        type: 'BreakStatus',
        statusType: 'Freeze',
        sourceUnitId: source.id,
        durationType: 'TURN_START_BASED',
        duration: 1,
        frozen: true,
        apply: (t, s) => s, // Turn skip handled in simulation loop
        remove: (t, s) => {
            // Deal Ice Damage
            const dmg = calculateBreakAdditionalDamage(source, t, 1 * LEVEL_CONSTANT_80);
            // Log damage? We need a way to log from here or handle it in simulation loop.
            // Since remove returns GameState, we can't easily log unless we modify state.log.
            // For now, let's assume simulation loop handles the "On Remove" logic for Freeze specifically to capture damage.
            // Or we can just return state and let the loop calculate damage.
            return s;
        }
    };
}

export function createEntanglementEffect(source: Unit, target: Unit): BreakStatusEffect {
    // Entanglement: 0.6 * Stack * LevelConst * ToughnessMult
    // Delay 20% * (1+BE)
    const breakEffect = source.stats.break_effect || 0;
    const delay = ENTANGLEMENT_BASE_DELAY * (1 + breakEffect);
    const toughnessMult = 0.5 + (target.maxToughness / 40);
    const baseDmgPerStack = 0.6 * LEVEL_CONSTANT_80 * toughnessMult;

    return {
        id: generateEffectId('Entanglement', source.id, target.id),
        name: 'もつれ',
        category: 'DEBUFF',
        type: 'BreakStatus',
        statusType: 'Entanglement',
        sourceUnitId: source.id,
        durationType: 'TURN_START_BASED',
        duration: 1,
        stackCount: 1,
        maxStacks: 5,
        delayAmount: delay,
        baseDamagePerStack: baseDmgPerStack,
        apply: (t, s) => {
            // Apply Delay immediately? 
            // Usually delay happens ON BREAK, which is when this effect is created.
            // So the dispatcher should handle the delay application using the value from here.
            return s;
        },
        remove: (t, s) => s // Damage handled in loop
    };
}

export function createImprisonmentEffect(source: Unit, target: Unit): BreakStatusEffect {
    // Imprisonment: Delay 30% * (1+BE). Spd -10%.
    const breakEffect = source.stats.break_effect || 0;
    const delay = IMPRISONMENT_BASE_DELAY * (1 + breakEffect);

    return {
        id: generateEffectId('Imprisonment', source.id, target.id),
        name: '禁錮',
        category: 'DEBUFF',
        type: 'BreakStatus',
        statusType: 'Imprisonment',
        sourceUnitId: source.id,
        durationType: 'TURN_START_BASED',
        duration: 1,
        delayAmount: delay,

        // モディファイアで速度-10%を定義（NEW）
        modifiers: [{
            target: 'spd_pct',
            source: '禁錮',
            type: 'pct',
            value: -0.10
        }],

        // apply/removeは空関数に（statBuilderが自動処理）
        apply: (t, s) => s,
        remove: (t, s) => s
    };
}


export function createBreakEffect(source: Unit, target: Unit): IEffect | null {
    switch (source.element) {
        case 'Physical': return createBleedEffect(source, target);
        case 'Fire': return createBurnEffect(source, target);
        case 'Ice': return createFreezeEffect(source, target);
        case 'Lightning': return createShockEffect(source, target);
        case 'Wind': return createWindShearEffect(source, target);
        case 'Quantum': return createEntanglementEffect(source, target);
        case 'Imaginary': return createImprisonmentEffect(source, target);
        default: return null;
    }
}
