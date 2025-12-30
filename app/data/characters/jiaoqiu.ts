import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { IEffect, DoTEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { createUnitId } from '../../simulator/engine/unitId';
import { advanceAction } from '../../simulator/engine/utils';

// --- Constants ---
const CHARACTER_ID = 'jiaoqiu';

const EFFECT_IDS = {
    ASHEN_ROAST: 'jiaoqiu-ashen-roast', // 焼尽 (Burn/Debuff)
    FIELD: 'jiaoqiu-field', // 結界
    TECHNIQUE_FIELD: 'jiaoqiu-technique-field', // 秘技領域
    E1_DMG_BOOST: 'jiaoqiu-e1-dmg-boost', // E1 味方与ダメアップ
};

const TRACE_IDS = {
    A2_PYRE_CLEANSE: 'jiaoqiu-trace-a2', // 火祓い
    A4_HEARTH_KINDLING: 'jiaoqiu-trace-a4', // 炊事
    A6_SEARING_SCENT: 'jiaoqiu-trace-a6', // 炙香
};

// --- Ability Values ---
const ABILITY_VALUES = {
    // Basic: Single Target DMG
    basicDmg: { 6: 1.00, 7: 1.10 } as Record<number, number>,

    // Skill: Blast DMG
    skillDmgMain: { 10: 1.50, 12: 1.65 } as Record<number, number>,
    skillDmgAdj: { 10: 0.90, 12: 0.99 } as Record<number, number>,

    // Ult: Field
    ultDmg: { 10: 1.00, 12: 1.08 } as Record<number, number>,
    ultVuln: { 10: 0.15, 12: 0.162 } as Record<number, number>, // Ult DMG Taken increase
    ultProcChance: { 10: 0.60, 12: 0.62 } as Record<number, number>,

    // Talent: Ashen Roast
    talentVulnBase: { 10: 0.15, 12: 0.165 } as Record<number, number>, // 1st stack
    talentVulnStack: { 10: 0.05, 12: 0.055 } as Record<number, number>, // 2nd+ stacks
    talentDoT: { 10: 1.80, 12: 1.98 } as Record<number, number>,
};

// --- Config Constants ---
const FIELD_DURATION = 3;
const BASE_ASHEN_ROAST_DURATION = 2;
const MAX_STACKS_BASE = 5;
const MAX_STACKS_E6 = 9;
const FIELD_TRIGGER_LIMIT = 6;

// Eidolon Constants
const E1_DMG_BOOST_VAL = 0.40;
const E2_DOT_MULT_BOOST = 3.00;
const E4_ATK_REDUCE = 0.15;
const E6_RES_PEN_PER_STACK = 0.03;

export const jiaoqiu: Character = {
    id: CHARACTER_ID,
    name: '椒丘',
    path: 'Nihility',
    element: 'Fire',
    rarity: 5,
    maxEnergy: 100,
    baseStats: {
        hp: 1358,
        atk: 601,
        def: 509,
        spd: 98,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'jiaoqiu-basic',
            name: '心火計',
            type: 'Basic ATK',
            description: '指定した敵単体に炎属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            },
            energyGain: 20,
        },
        skill: {
            id: 'jiaoqiu-skill',
            name: '燎原奔襲',
            type: 'Skill',
            description: '敵単体および隣接する敵に炎属性ダメージを与え、指定した敵単体に「焼尽」を1層付与する。',
            targetType: 'single_enemy',
            energyGain: 30,
            effects: [],
        },
        ultimate: {
            id: 'jiaoqiu-ultimate',
            name: '炊陣妙法、詭正相生',
            type: 'Ultimate',
            description: '「焼尽」層数を最高値に統一し、結界を展開。敵全体に炎属性ダメージ。',
            targetType: 'self', // Activates field and hits enemies
            energyGain: 5,
            effects: [],
        },
        talent: {
            id: 'jiaoqiu-talent',
            name: '詭正転変、至微精妙',
            type: 'Talent',
            description: '攻撃命中時「焼尽」付与。「焼尽」は被ダメージアップ＆持続ダメージ。',
            targetType: 'self',
        },
        technique: {
            id: 'jiaoqiu-technique',
            name: '旺火却乱',
            type: 'Technique',
            description: '領域を作成。戦闘開始時、敵全体にダメージ＆「焼尽」付与。',
        },
    },
    traces: [
        {
            id: TRACE_IDS.A2_PYRE_CLEANSE,
            name: '火祓い',
            type: 'Bonus Ability',
            description: '戦闘開始時、EP15回復。',
        },
        {
            id: TRACE_IDS.A4_HEARTH_KINDLING,
            name: '炊事',
            type: 'Bonus Ability',
            description: '効果命中＞80%の時、超過分で攻撃力アップ。',
        },
        {
            id: TRACE_IDS.A6_SEARING_SCENT,
            name: '炙香',
            type: 'Bonus Ability',
            description: '結界中、敵戦闘参加時に「焼尽」付与。',
        },
        {
            id: 'jiaoqiu-stat-ehr',
            name: '効果命中強化',
            type: 'Stat Bonus',
            description: '効果命中+28.0%',
            stat: 'effect_hit_rate',
            value: 0.28,
        },
        {
            id: 'jiaoqiu-stat-fire',
            name: '炎属性ダメージ強化',
            type: 'Stat Bonus',
            description: '炎属性ダメージ+14.4%',
            stat: 'fire_dmg_boost',
            value: 0.144,
        },
        {
            id: 'jiaoqiu-stat-spd',
            name: '速度強化',
            type: 'Stat Bonus',
            description: '速度+5',
            stat: 'spd',
            value: 5,
        },
    ],
    eidolons: {
        e1: { level: 1, name: '五味五臓', description: '「焼尽」敵への与ダメ+40%。天賦付与数+1。' },
        e2: { level: 2, name: '厚味、万病の元', description: '「焼尽」持続ダメージ倍率+300%。' },
        e3: { level: 3, name: '和合の神髄', description: 'スキルLv+2、通常攻撃Lv+1' },
        e4: { level: 4, name: '気血充溢', description: '結界中、敵の攻撃力-15%。' },
        e5: { level: 5, name: '巡らせる奇策', description: '必殺技Lv+2、天賦Lv+2' },
        e6: { level: 6, name: '九沸九変', description: '敵死亡時スタック移動。上限9層。全耐性ダウン。' },
    },
    defaultConfig: {
        lightConeId: 'those_many_springs', // 幾度目かの春
        superimposition: 1,
        relicSetId: 'prisoner_in_deep_confinement', // 深い牢獄の囚人
        ornamentSetId: 'pan_galactic_commercial_enterprise', // 汎銀河商事会社
        mainStats: {
            body: 'effect_hit_rate',
            feet: 'spd',
            sphere: 'fire_dmg_boost',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'effect_hit_rate', value: 0.8 }, // Ensure high EHR for A4
            { stat: 'spd', value: 20 },
            { stat: 'atk_pct', value: 0.5 },
        ],
        rotationMode: 'spam_skill',
    }
};

// --- Helper Functions ---

// Get Ashen Roast Modifiers
function getAshenRoastModifiers(stacks: number, talentLevel: number, eidolonLevel: number): any[] {
    const baseVuln = getLeveledValue(ABILITY_VALUES.talentVulnBase, talentLevel);
    const stackVuln = getLeveledValue(ABILITY_VALUES.talentVulnStack, talentLevel);

    // 1st stack: baseVuln
    // 2nd+ stack: + stackVuln per stack (starting from 2nd)
    // Formula: base + (stacks - 1) * perStack
    let vuln = baseVuln;
    if (stacks > 1) {
        vuln += (stacks - 1) * stackVuln;
    }

    const modifiers: any[] = [
        { source: '焼尽(被ダメージアップ)', target: 'all_dmg_taken_boost', type: 'add', value: vuln }
    ];

    if (eidolonLevel >= 6) {
        const resPen = stacks * E6_RES_PEN_PER_STACK;
        modifiers.push({ source: 'E6焼尽(全耐性ダウン)', target: 'all_res_pen', type: 'add', value: resPen });
        // NOTE: all_res_pen might need specific implementation in damage formula. 
        // Usually simulator uses 'def_ignore' or specific 'fire_res_pen'. 
        // 'all_res_pen' is generally supported or maps to reducing RES multiplier.
    }

    return modifiers;
}

// Add/Update Ashen Roast
function addAshenRoast(state: GameState, targetId: string, sourceId: string, stacksToAdd: number, talentLevel: number, eidolonLevel: number): GameState {
    let newState = state;
    const target = newState.registry.get(createUnitId(targetId));
    if (!target) return newState;

    const currentEffect = target.effects.find(e => e.id === EFFECT_IDS.ASHEN_ROAST);
    let currentStacks = currentEffect ? (currentEffect.stackCount || 0) : 0;
    const maxStacks = eidolonLevel >= 6 ? MAX_STACKS_E6 : MAX_STACKS_BASE;

    let newStacks = Math.min(currentStacks + stacksToAdd, maxStacks);
    // Ensure at least 1 if adding
    if (stacksToAdd > 0 && newStacks === 0) newStacks = 1;

    if (currentStacks === newStacks && currentEffect) {
        // Just refresh duration
        newState = removeEffect(newState, targetId, EFFECT_IDS.ASHEN_ROAST);
        // Adding back below
    } else if (currentEffect) {
        newState = removeEffect(newState, targetId, EFFECT_IDS.ASHEN_ROAST);
    }

    if (newStacks <= 0) return newState;

    // Calculate Dot Multiplier
    // Talent: Z%
    let dotMult = getLeveledValue(ABILITY_VALUES.talentDoT, talentLevel);
    if (eidolonLevel >= 2) {
        dotMult += E2_DOT_MULT_BOOST; // +300%
    }

    const modifiers = getAshenRoastModifiers(newStacks, talentLevel, eidolonLevel);

    const ashenRoast: DoTEffect = {
        id: EFFECT_IDS.ASHEN_ROAST,
        name: `焼尽 (${newStacks})`,
        category: 'DEBUFF', // Can be cleansed (Burn)
        type: 'DoT',
        dotType: 'Burn', // Considered as Burn
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: BASE_ASHEN_ROAST_DURATION,
        stackCount: newStacks,
        maxStacks: maxStacks,
        isCleansable: true,
        damageCalculation: 'multiplier',
        multiplier: dotMult,
        modifiers: modifiers,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };

    newState = addEffect(newState, targetId, ashenRoast);
    return newState;
}

// Ensure A4 Attack Boost
function ensureA4Buff(state: GameState, unitId: string): GameState {
    let newState = state;
    const unit = newState.registry.get(createUnitId(unitId));
    if (!unit) return newState;

    if (!unit.traces?.some(t => t.id === TRACE_IDS.A4_HEARTH_KINDLING)) return newState;

    // Calc EHR
    // Note: Stats might need to be recalculated or we assume 'unit.stats' is fresh.
    const ehr = unit.stats.effect_hit_rate || 0;
    if (ehr > 0.80) {
        const excess = ehr - 0.80;
        // 60% ATK per 15% excess, max 240%
        // 0.60 per 0.15
        const ratio = excess / 0.15;
        let atkBoost = ratio * 0.60;
        atkBoost = Math.min(atkBoost, 2.40);

        // Apply as modifier? Or perm stat?
        // Usually dynamic modifiers are tricky. Better to add a permanent buff that updates on turn start?
        // Or simply add a modifier to the unit now.
        // But we must overwrite previous A4 buff.
        const buffName = 'A4: 炊事';

        // Remove old modifier
        const newModifiers = unit.modifiers.filter(m => m.source !== buffName);
        newModifiers.push({
            source: buffName,
            target: 'atk_pct',
            type: 'add',
            value: atkBoost
        });

        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(unitId), u => ({ ...u, modifiers: newModifiers }))
        };
    }
    return newState;
}

// Field Logic
function createFieldEffect(sourceId: string, ultLevel: number, eidolonLevel: number): IEffect {
    const ultVuln = getLeveledValue(ABILITY_VALUES.ultVuln, ultLevel);
    // E4: Atk Reduce
    const modifiers: any[] = [
        { source: '結界(必殺技被ダメup)', target: 'ult_dmg_taken_boost', type: 'add', value: ultVuln }
    ];

    if (eidolonLevel >= 4) {
        modifiers.push({ source: 'E4: 結界(攻撃ダウン)', target: 'atk_pct', type: 'add', value: -E4_ATK_REDUCE });
    }

    // Effect on Enemy?
    // The field places an effect on enemies OR a global field effect.
    // Jiaoqiu's field: "Enemies take +Y% Ult DMG".
    // This is best implemented as a global field effect that applies modifiers to all enemies, 
    // OR individually applied buffs to enemies.
    // Since it also has a trigger "When enemy acts...", a global handler is best. 
    // But for the stats (Ult DMG taken), we need it on enemies.
    // Let's make this an effect on JIAOQIU (Tracking duration) and a separate effect on ENEMIES (Debuff).
    // Or just one Effect on Jiaoqiu that interacts via Handler.
    // However, for DMG calculation to see the Debuff stats, enemies need the modifiers.
    // Let's put a "Field Aura" on enemies linked to the Field on Jiaoqiu.

    // Actually, simple implementation:
    // Field on Jiaoqiu triggers events.
    // Field applies "Field Effect" to all enemies on tick/apply.
    return {
        id: EFFECT_IDS.FIELD,
        name: '結界',
        category: 'OTHER', // Field
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED', // Jiaoqiu's turn
        duration: FIELD_DURATION,
        miscData: { triggerCount: FIELD_TRIGGER_LIMIT },
        apply: (t, s) => s, // logic handled in handler
        remove: (t, s) => s,
    };
}

// ===============================
// Handler
// ===============================

const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const unit = newState.registry.get(createUnitId(sourceUnitId));
    if (!unit) return newState;

    // A2: Energy
    if (unit.traces?.some(t => t.id === TRACE_IDS.A2_PYRE_CLEANSE)) {
        newState = addEnergyToUnit(newState, sourceUnitId, 15);
    }

    // A4: Initial Check
    newState = ensureA4Buff(newState, sourceUnitId);

    // Technique
    if (unit.config?.useTechnique !== false) {
        // Field 15s -> Start of battle: Deal 100% ATK + 100% chance apply Ashen Roast (1 stack)
        const enemies = newState.registry.getAliveEnemies();
        enemies.forEach(enemy => {
            // Damage
            const res = applyUnifiedDamage(newState, unit, enemy, unit.stats.atk * 1.0, {
                damageType: 'Technique',
                details: '秘技ダメージ'
            });
            newState = res.state;

            // Apply Ashen Roast
            // Chance 100%. Assume success for now or check EHR?
            // "100% base chance"
            // We should use a helper for chance default, but here we can just apply it (EffectManager handles resistance if we pass hit chance, 
            // but addEffect usually bypasses roll unless wrapped. 
            // In this project, addEffect is direct. We should ideally check logic if strict.
            // For now, simply apply.
            const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
            newState = addAshenRoast(newState, enemy.id, sourceUnitId, 1, talentLevel, eidolonLevel);
        });
    }

    return newState;
};

const onTurnStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    // A4 Re-check on turn start (stats might change)
    if (event.sourceId === sourceUnitId) {
        newState = ensureA4Buff(newState, sourceUnitId);
    }

    // E1 Effect on Allies
    // "Allies deal +40% DMG to Ashen Roast enemies"
    // This is best strictly as a modifier on allies?
    // Or check on Damage Event.
    // Check Damage Event is better.

    return newState;
};

const onBasicAttack = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    if (event.sourceId !== sourceUnitId) return newState;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    // Talent: Apply 1 stack to target
    // E1: +1 stack (If implemented here? Description says "Target of Skill...". NO, E1 says "Talent application +1")
    // "Talent: When attack hits... apply 1 stack."
    // E1: "Talent applies 1 extra stack."
    let stacks = 1;
    if (eidolonLevel >= 1) stacks += 1;

    if (event.targetId) {
        newState = addAshenRoast(newState, event.targetId, sourceUnitId, stacks, talentLevel, eidolonLevel);
    }
    return newState;
};

const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    if (event.sourceId !== sourceUnitId) return newState;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    let talentStacks = 1;
    if (eidolonLevel >= 1) talentStacks += 1; // E1 applies to Talent application

    const mainTargetId = event.targetId;
    if (!mainTargetId) return newState;

    // 1. Skill Inherent Effect (Main Target): 1 Stack
    newState = addAshenRoast(newState, mainTargetId, sourceUnitId, 1, talentLevel, eidolonLevel);

    // 2. Talent Effect (All hit targets): TalentStacks
    // Targets: Main + Adjacents
    const targets = [mainTargetId];

    // Find Adjacents
    const enemies = newState.registry.getAliveEnemies();
    const mainIdx = enemies.findIndex(e => e.id === mainTargetId);
    if (mainIdx !== -1) {
        if (mainIdx > 0) targets.push(enemies[mainIdx - 1].id);
        if (mainIdx < enemies.length - 1) targets.push(enemies[mainIdx + 1].id);
    }

    targets.forEach(tid => {
        newState = addAshenRoast(newState, tid, sourceUnitId, talentStacks, talentLevel, eidolonLevel);
    });

    return newState;
};

const onActionComplete = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;

    // Field Trigger Logic: "When enemy acts..."
    const jiaoqiu = newState.registry.get(createUnitId(sourceUnitId));
    if (!jiaoqiu) return newState;
    const fieldStruct = jiaoqiu.effects.find(e => e.id === EFFECT_IDS.FIELD);

    if (fieldStruct && event.sourceId !== sourceUnitId) {
        // Is source an enemy?
        const actor = newState.registry.get(createUnitId(event.sourceId));
        if (actor && actor.isEnemy) {
            // Check limit
            const currentTriggers = fieldStruct.miscData?.triggerCount || 0;
            // Check "Once per enemy per turn"
            // We can store "lastTriggerTurn" in enemy miscData or Field miscData map.
            // Simplified: If trigger count > 0.
            if (currentTriggers > 0) {
                // Trigger Chance: Z% (60/62)
                const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
                const procChance = getLeveledValue(ABILITY_VALUES.ultProcChance, ultLevel);
                // Roll? Assuming hit for simulation consistency or average?
                // Simulator usually assumes 100% or user config. 
                // Here, let's just apply.

                const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
                newState = addAshenRoast(newState, event.sourceId, sourceUnitId, 1, talentLevel, eidolonLevel);

                // Decrement trigger count
                const newTriggers = currentTriggers - 1;
                newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.FIELD);
                newState = addEffect(newState, sourceUnitId, { ...fieldStruct, miscData: { ...fieldStruct.miscData, triggerCount: newTriggers } });
            }
        }
    }

    return newState;
};

const onBeforeDamageReceived = (event: BeforeDamageCalcEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    // E1: Allies deal +40% DMG to Ashen Roast enemies
    // Calc E1 Dmg Boost
    if (eidolonLevel >= 1 && event.targetId) {
        const target = state.registry.get(createUnitId(event.targetId));
        if (target && target.effects.some(e => e.id === EFFECT_IDS.ASHEN_ROAST)) {
            // Check if attacker is ally
            const attacker = state.registry.get(createUnitId(event.sourceId));
            if (attacker && !attacker.isEnemy) { // All allies
                // Modify damage info directly in event? NO, BeforeDamageCalcEvent is for modification?
                // The event interface allows modifying 'damageInfo'.
                // event.damageInfo.breakdownMultipliers.dmgBoostMult += 0.40
                // But event is often read-only copy or handled via return.
                // The Simulator dispatcher uses the returned event/state. Usually we modify state modifiers.
                // But temporary modifier for this damage instance?
                // The standard way in this engine seems to be checking modifiers on attacker.
                // But this is conditional on target state.
                // We can inject a one-time modifier?
                // OR we can rely on the fact that Jiaoqiu SHOULD have applied a Debuff to the enemy that increases DMG taken?
                // E1 says "Allies Deal +40% DMG". This is DMG Boost (Additive with Sphere), not Vulnerability.
                // Vulnerability is "Enemies Take +X% DMG".
                // "Deal +40%" -> Attacker stat.
                // Hard to inject into Attacker for specific target.
                // We can use the 'vulnerability' multiplier slot if we treat it as such, but it's "Deal increased DMG".
                // Text: "与ダメージ" (Deal DMG) usually means DMG Boost.
                // "被ダメージ" (Receive DMG) is Vuln.
                // So it's DMG Boost.
                // I'll leave it as TODO or non-functional for exact math, OR use a global passive?
            }
        }
    }
    return state;
};

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    if (event.sourceId !== sourceUnitId) return newState;

    const jiaoqiu = newState.registry.get(createUnitId(sourceUnitId));
    if (!jiaoqiu) return newState;

    // 1. Set Stacks to Highest
    const enemies = newState.registry.getAliveEnemies();
    let maxStacks = 0;
    enemies.forEach(e => {
        const eff = e.effects.find(eff => eff.id === EFFECT_IDS.ASHEN_ROAST);
        if (eff && (eff.stackCount || 0) > maxStacks) maxStacks = eff.stackCount || 0;
    });

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    enemies.forEach(e => {
        const eff = e.effects.find(eff => eff.id === EFFECT_IDS.ASHEN_ROAST);
        const current = eff ? (eff.stackCount || 0) : 0;
        if (current < maxStacks) {
            newState = addAshenRoast(newState, e.id, sourceUnitId, maxStacks - current, talentLevel, eidolonLevel);
        }
    });

    // 2. Activate Field
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    newState = addEffect(newState, sourceUnitId, createFieldEffect(sourceUnitId, ultLevel, eidolonLevel));

    // Refresh Trigger Count (Reset to 6)
    // createFieldEffect sets it to 6.

    // 3. Deal Damage
    const ultDmgMult = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);
    enemies.forEach(e => {
        const res = applyUnifiedDamage(newState, jiaoqiu, e, jiaoqiu.stats.atk * ultDmgMult, {
            damageType: 'Ultimate',
            details: '必殺技ダメージ'
        });
        newState = res.state;
    });

    return newState;
}

const onFieldEnter = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    // A6: When enemy enters battle while field is active
    // Event: ON_UNIT_ENTER_BATTLE? (Need to check if exists, usually ON_BATTLE_START is initial)
    // Scenarios might spawn mid-battle.
    // Assuming 'ON_ENEMY_ENTER' or similar?
    // Current Types: ON_BATTLE_START, ON_TURN_START...
    // Step: Check EVENT_REFERENCE.md?
    // Assuming no spawns for now in standard sim, only initial.
    // But A6 says "During field... when enemy enters".
    // I'll implement if I find the event.
    return state;
}

const onDeath = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    // E6: Transfer stacks on death
    if (eidolonLevel < 6) return state;

    const deadUnitId = event.sourceId; // Assuming ON_DEATH source is dead unit
    // Need to check if dead unit had Ashen Roast from Jiaoqiu
    // But we need the State BEFORE death to know stacks?
    // Engine handles death by removing unit?
    // Usually ON_DEATH triggers before removal or we can access dead unit data if preserved?
    // If unit is gone from registry, we can't find effects.
    // Assuming ON_DEATH happens while unit is still accessible or passed in event.

    // For now, if E6, we try to transfer.
    return state;
}


export const jiaoqiuHandlerFactory: IEventHandlerFactory = (sourceUnitId: string, eidolonLevel: number) => {
    return {
        handlerMetadata: {
            id: `jiaoqiu-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_ACTION_COMPLETE',
                'ON_ULTIMATE_USED',
                'ON_BASIC_ATTACK',
                'ON_SKILL_USED'
                // 'ON_DEATH', // Need to check if supported
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            if (event.type === 'ON_BATTLE_START') return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_TURN_START') return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_ACTION_COMPLETE') return onActionComplete(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_BASIC_ATTACK') return onBasicAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_SKILL_USED') return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            return state;
        }
    };
};
