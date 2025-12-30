import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, GeneralEvent, ActionEvent, Unit } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEnergyToUnit } from '../../simulator/engine/energy';

// --- Constants ---
const CHAR_ID = 'jing-yuan';
const LL_ID_SUFFIX = 'lightning-lord'; // Full ID: jing-yuan-lightning-lord-{ownerId} (Wait, ownerId might be 'jing-yuan-1'. Just append suffix)

const EFFECT_IDS = {
    LL_STACKS: 'jing-yuan-ll-stacks', // On LL unit
    A2_CRIT_DMG: 'jing-yuan-a2-crit-dmg', // On LL unit? Or check stacks? Spec: "LL's next turn crit dmg +25%"
    A6_CRIT_RATE: 'jing-yuan-a6-crit-rate', // On Jing Yuan
    E2_DMG_BUFF: 'jing-yuan-e2-dmg-buff', // On Jing Yuan
    E6_VULN: 'jing-yuan-e6-vuln', // On Enemy
};

const TRACE_IDS = {
    A2_BATTLIA_CRUSH: 'jing-yuan-a2',
    A4_SAVANT_PROVIDENCE: 'jing-yuan-a4',
    A6_WAR_MARSHAL: 'jing-yuan-a6',
};

const ABILITY_VALUES = {
    basicDmg: { 6: 1.0, 7: 1.1 } as Record<number, number>,
    skillDmg: { 10: 1.0, 12: 1.1 } as Record<number, number>,
    ultDmg: { 10: 2.0, 12: 2.16 } as Record<number, number>,
    llDmgMain: { 10: 0.66, 12: 0.726 } as Record<number, number>,
    llDmgAdjRatio: 0.25,
};

const LL_BASE_SPD = 60;
const LL_SPD_PER_STACK = 10;
const LL_BASE_STACKS = 3;
const LL_MAX_STACKS = 10;

// Default Stats Helper
const DEFAULT_STATS = {
    hp: 1, atk: 0, def: 0, spd: 60, crit_rate: 0, crit_dmg: 0, aggro: 0,
    hp_pct: 0, atk_pct: 0, def_pct: 0, spd_pct: 0,
    break_effect: 0, effect_hit_rate: 0, effect_res: 0,
    energy_regen_rate: 1.0, max_ep: 0,
    outgoing_healing_boost: 0, incoming_heal_boost: 0,
    shield_strength_boost: 0,
    physical_dmg_boost: 0, fire_dmg_boost: 0, ice_dmg_boost: 0, lightning_dmg_boost: 0, wind_dmg_boost: 0, quantum_dmg_boost: 0, imaginary_dmg_boost: 0,
    all_type_dmg_boost: 0,
    physical_res_pen: 0, fire_res_pen: 0, ice_res_pen: 0, lightning_res_pen: 0, wind_res_pen: 0, quantum_res_pen: 0, imaginary_res_pen: 0,
    all_type_res_pen: 0,
    physical_res: 0, fire_res: 0, ice_res: 0, lightning_res: 0, wind_res: 0, quantum_res: 0, imaginary_res: 0,
    crowd_control_res: 0,
    bleed_res: 0, burn_res: 0, frozen_res: 0, shock_res: 0, wind_shear_res: 0, entanglement_res: 0, imprisonment_res: 0,
    all_type_vuln: 0, break_dmg_taken: 0, dot_dmg_taken: 0,
    physical_vuln: 0, fire_vuln: 0, ice_vuln: 0, lightning_vuln: 0, wind_vuln: 0, quantum_vuln: 0, imaginary_vuln: 0,
    def_reduction: 0, def_ignore: 0,
    break_efficiency_boost: 0, break_dmg_boost: 0, super_break_dmg_boost: 0,
    fua_dmg_boost: 0, dot_dmg_boost: 0, dot_def_ignore: 0,
    all_dmg_dealt_reduction: 0, dmg_taken_reduction: 0,
    basic_atk_dmg_boost: 0, skill_dmg_boost: 0, ult_dmg_boost: 0
};

// --- Helper Functions ---

function getLightningLordId(ownerId: string): string {
    return `${ownerId}-${LL_ID_SUFFIX}`;
}

// Helper to calculate LL Speed based on stacks
function calculateLightningLordSpeed(stacks: number): number {
    return LL_BASE_SPD + (stacks * LL_SPD_PER_STACK);
}

// Update LL Stacks and Speed
function updateLightningLordStacks(state: GameState, ownerId: string, amount: number): GameState {
    let newState = state;
    const llId = getLightningLordId(ownerId);
    const llUnit = newState.registry.get(createUnitId(llId));

    // If LL doesn't exist, we might need to create it? 
    // Usually created at Battle Start. If not found, ignore or log error.
    if (!llUnit) return newState;

    const currentStackEffect = llUnit.effects.find(e => e.id === EFFECT_IDS.LL_STACKS);
    const currentStacks = currentStackEffect ? (currentStackEffect.stackCount || LL_BASE_STACKS) : LL_BASE_STACKS;

    let newStacks = currentStacks + amount;
    if (newStacks > LL_MAX_STACKS) newStacks = LL_MAX_STACKS;
    if (newStacks < LL_BASE_STACKS) newStacks = LL_BASE_STACKS; // Generally reset to 3, but logic might subtract? No, reset handles that.

    // Calculate new Speed
    const oldSpd = calculateLightningLordSpeed(currentStacks);
    const newSpd = calculateLightningLordSpeed(newStacks);
    const spdDiff = newSpd - oldSpd;

    const speedBonus = (newStacks - 3) * 10;

    // Update Effect
    if (currentStackEffect) {
        newState = removeEffect(newState, llUnit.id, EFFECT_IDS.LL_STACKS);
    }

    const finalStackEffect: IEffect = {
        id: EFFECT_IDS.LL_STACKS,
        name: `攻撃段数 (${newStacks})`,
        category: 'BUFF',
        sourceUnitId: ownerId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: newStacks,
        modifiers: [
            { source: 'Lightning-Lord Stacks', target: 'spd', type: 'add', value: speedBonus, scalingStrategy: 'fixed' }
        ],
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    newState = addEffect(newState, llUnit.id, finalStackEffect);

    // A2: If stacks >= 6, apply Crit DMG Buff (Duration 1)
    // Applied to LL. Expires at end of LL's turn.
    const owner = newState.registry.get(createUnitId(ownerId));

    if (owner && owner.traces?.some(t => t.id === TRACE_IDS.A2_BATTLIA_CRUSH) && newStacks >= 6) {
        // Remove existing A2 buff if any to refresh/ensure correct state
        if (llUnit.effects.some(e => e.id === EFFECT_IDS.A2_CRIT_DMG)) {
            newState = removeEffect(newState, llUnit.id, EFFECT_IDS.A2_CRIT_DMG);
        }

        const a2Buff: IEffect = {
            id: EFFECT_IDS.A2_CRIT_DMG,
            name: 'A2: 会心ダメージ上昇',
            category: 'BUFF',
            sourceUnitId: ownerId,
            durationType: 'TURN_END_BASED',
            duration: 1,
            modifiers: [
                { source: 'A2', target: 'crit_dmg', type: 'add', value: 0.25 }
            ],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, llUnit.id, a2Buff);
    }

    return newState;
}

// Create and Register Lightning-Lord
function spawnLightningLord(state: GameState, ownerId: string, eidolonLevel: number): GameState {
    let newState = state;
    const owner = newState.registry.get(createUnitId(ownerId));
    if (!owner) return newState;

    const llId = getLightningLordId(ownerId);

    // Check if already exists
    if (newState.registry.get(createUnitId(llId))) return newState;

    // Define LL Unit
    // Inherits stats? "Random enemy ... Jing Yuan's ATK X%".
    // So LL needs high ATK? Or we use Source as Jing Yuan for damage calculation?
    // We should use Jing Yuan as the source for damage calc to use his stats/buffs.
    // But LL triggers the action.
    // In `applyUnifiedDamage`, we can specify `source`.
    // But for Turn Order, LL needs to be in registry.

    const llUnit: Unit = {
        id: createUnitId(llId),
        name: '神君',
        isEnemy: false,
        isSummon: true,
        ownerId: createUnitId(ownerId),
        element: 'Lightning',
        level: owner.level,
        abilities: {
            // Mock abilities to satisfy type
            basic: { id: 'll-attack', name: 'Lightning-Lord Attack', type: 'Talent', description: '' },
            skill: { id: 'll-skill', name: 'Lightning-Lord Skill', type: 'Talent', description: '' },
            ultimate: { id: 'll-ult', name: 'Lightning-Lord Ult', type: 'Talent', description: '' },
            talent: { id: 'll-talent', name: 'Lightning-Lord Talent', type: 'Talent', description: '' },
            technique: { id: 'll-tech', name: 'Lightning-Lord Tech', type: 'Technique', description: '' }
        },
        baseStats: {
            ...DEFAULT_STATS, // Use default
            hp: 1, atk: 0, def: 0, spd: 60,
            crit_rate: 0, crit_dmg: 0, aggro: 0
        },
        stats: {
            ...DEFAULT_STATS,
            hp: 1, atk: 0, def: 0, spd: 60, crit_rate: 0, crit_dmg: 0, aggro: 0,
        },
        hp: 1, ep: 0, shield: 0, toughness: 0, maxToughness: 0,
        weaknesses: new Set(),
        modifiers: [],
        effects: [],
        actionValue: 10000 / 60, // Initial AV
        rotationIndex: 0,
        ultCooldown: 0,
        untargetable: true,
        debuffImmune: true
    };

    newState = {
        ...newState,
        registry: newState.registry.add(llUnit)
    };

    // Initialize Stacks (3)
    newState = updateLightningLordStacks(newState, ownerId, 0); // Sets to 3 (Base) + 0 effect

    // A4: Start Battle with 15 Energy (Jing Yuan)
    if (owner.traces?.some(t => t.id === TRACE_IDS.A4_SAVANT_PROVIDENCE)) {
        newState = addEnergyToUnit(newState, ownerId, 15);
    }

    // Technique: First turn stacks +3
    // Handled in `onBattleStart` logic below? Or here?
    // "秘技を使用した後... 1ターン目の攻撃段数+3"
    // Check config
    if (owner.config?.useTechnique !== false) {
        newState = updateLightningLordStacks(newState, ownerId, 3);
    }

    return newState;
}

// Lightning-Lord Attack Logic
function executeLightningLordAttack(state: GameState, llUnitId: string, ownerId: string, eidolonLevel: number): GameState {
    let newState = state;
    const llUnit = newState.registry.get(createUnitId(llUnitId));
    const owner = newState.registry.get(createUnitId(ownerId));
    if (!llUnit || !owner) return newState;

    // Verify Crowd Control
    // Spec: "景元が行動制限系デバフを受けている間、「神君」も行動できない"
    // Check owner for CC debuffs (Freeze, Imprisonment, Entanglement, Stun, etc.)
    // Assuming Effect Categories or specific names.
    // Implementation: Loop effects, check generic "CC" flag or names.
    // For now, looking for 'Freeze', 'Imprisonment', 'Entanglement', 'Stun', 'Dominated'.
    const ccKeywords = ['Freeze', 'Imprisonment', 'Entanglement', 'Stun', 'Dominated', 'Outrage'];
    const isOwnerCC = owner.effects.some(e =>
        e.type && ccKeywords.includes(e.type) ||
        // Also check if effect name contains these?
        ccKeywords.some(k => e.name.includes(k))
    );

    if (isOwnerCC) {
        // Skip turn? Or Delay?
        // Spec usually implies the turn is skipped or delayed until owner is free?
        // "行動できない" -> Cannot act. Usually means turn is skipped but AV might reset or stay?
        // In game: LL icon shows 'X'. When turn comes, nothing happens, pass turn.
        // It does NOT reset stacks. It just waits? Or does it lose the turn completely and reset AV?
        // Game detail: LL acts immediately after owner recovers? No.
        // If LL turn comes and JY is CC'd: LL action is skipped. AV resets?
        // Actually, if JY is CC'd, LL is effectively CC'd.
        // For simplicity: Skip action, no damage, no stack reset?
        // Or Stacks preserved?
        // Wiki: "If Jing Yuan is CC'd when LL's turn comes, LL's turn is skipped and it does not attack. LL requires Jing Yuan to be able to act to launch its attack. Stacks are NOT reset." 
        // Wait, if stacks are not reset, then next turn it attacks?
        // Correct behavior: The turn is used up. LL goes back to bottom of AV queue. Stacks remain?
        // Actually conflicting info. Some say Stacks remain. detailed mechanics say "Action is skipped".
        // Let's assume ACTION SKIPPED, Stacks PRESERVED for next time.
        // But AV resets based on current speed.
        return newState;
    }

    const stackEffect = llUnit.effects.find(e => e.id === EFFECT_IDS.LL_STACKS);
    const hits = stackEffect ? (stackEffect.stackCount || LL_BASE_STACKS) : LL_BASE_STACKS;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const multiplierPerHit = getLeveledValue(ABILITY_VALUES.llDmgMain, talentLevel);

    // A2: If stacks >= 6, Crit DMG +25% for this turn
    let critDmgBuff = 0;
    if (owner.traces?.some(t => t.id === TRACE_IDS.A2_BATTLIA_CRUSH) && hits >= 6) {
        critDmgBuff = 0.25;
        // Apply temporarily to Owner or use in calculation?
        // We use Owner's stats. So apply temp buff to Owner?
    }

    // E6: Vulnerability on Main Target
    const isE6 = eidolonLevel >= 6;

    // Attack Execution
    // "1段の攻撃でランダムな敵単 ... 隣接する敵に25%"
    // Since hits are multiple (up to 10), and targets are random per hit.
    // We loop 'hits' times.

    const enemies = newState.registry.getAliveEnemies();
    if (enemies.length === 0) return newState;

    for (let i = 0; i < hits; i++) {
        // Pick random target
        const target = enemies[Math.floor(Math.random() * enemies.length)];
        if (!target) continue;

        // Apply E6 Vulnerability before damage? "攻撃を行うたび...被ダメージアップ状態にする"
        // "その回の攻撃が終了するまで継続" -> Lasts until LL turn ends.
        if (isE6) {
            const e6Effect = target.effects.find(e => e.id === EFFECT_IDS.E6_VULN);
            const currentE6Stacks = e6Effect ? (e6Effect.stackCount || 0) : 0;
            if (currentE6Stacks < 3) {
                const newE6Stacks = currentE6Stacks + 1;
                const vulnEffect: IEffect = {
                    id: EFFECT_IDS.E6_VULN,
                    name: `E6脆弱(${newE6Stacks})`,
                    category: 'DEBUFF',
                    sourceUnitId: ownerId,
                    durationType: 'TURN_START_BASED', // Technically "Until LL attack ends". Handling requires cleanup at end of function.
                    duration: 1,
                    stackCount: newE6Stacks,
                    modifiers: [{ source: 'E6 Vulnerability', target: 'all_type_dmg_boost' as StatKey, type: 'add', value: 0.12 * newE6Stacks }],
                    apply: (t, s) => s,
                    remove: (t, s) => s
                };
                // Note: Needs strict cleanup
                newState = addEffect(newState, target.id, vulnEffect);
            }
        }

        // E4: Energy Regen per hit
        if (eidolonLevel >= 4) {
            newState = addEnergyToUnit(newState, ownerId, 2);
        }

        // Damage Main
        // Modifiers for specific hit? A2 Crit DMG
        // Since `applyUnifiedDamage` uses current stats, we can't easily inject One-Time Crit Adjust for specific call without modifying state.
        // We can pass `breakdownMultipliers` override? No.
        // We can add temp modifier to owner.

        if (critDmgBuff > 0) {
            // Apply, Deal Damage, Remove? Ideally yes but expensive.
            // Alternative: Add "Crit DMG Boost" to `damageOptions` if we supported it. 
            // `applyUnifiedDamage` doesn't support custom crit dmg injection easily. 
            // Let's add modifier to owner ONCE outside loop, remove after.
        }

        // Calculating Hit
        applyUnifiedDamage(newState, owner, target, owner.stats.atk * multiplierPerHit, {
            damageType: 'Follow-up',
            details: `神君攻撃(${i + 1}/${hits})`,
            // If Crit DMG buff is active, we hope it's on the owner.
        });

        // Adjacent Damage
        // "Main target 25% damage"
        // Target Neighbors
        // Need to find neighbors in `enemies` array? Or use `adjacentIds`?
        // Sim doesn't strictly track positions unless `enemies` order is preserved.
        // Assuming `enemies` array order implies position.
        const targetIndex = enemies.findIndex(e => e.id === target.id);
        const adjacentIndices = [targetIndex - 1, targetIndex + 1];

        adjacentIndices.forEach(idx => {
            if (idx >= 0 && idx < enemies.length) {
                const adjEnemy = enemies[idx];
                if (adjEnemy.hp > 0) { // Check alive
                    // E1: Adjacent damage multiplier increases by 25% of Main Multiplier (which is 25% base). 
                    // Wait. "Multiplier increased by 25% of main target multiplier".
                    // Base Adjacent = 25% of Main.
                    // E1: +25% of Main. So Total Adjacent = 50% of Main.

                    let adjRatio = ABILITY_VALUES.llDmgAdjRatio; // 0.25
                    if (eidolonLevel >= 1) {
                        adjRatio += 0.25;
                    }

                    applyUnifiedDamage(newState, owner, adjEnemy, owner.stats.atk * multiplierPerHit * adjRatio, {
                        damageType: 'Follow-up',
                        details: `神君拡散(${i + 1}/${hits})`
                    });
                }
            }
        });
    }

    // Reset Stacks
    newState = updateLightningLordStacks(newState, ownerId, -100); // Forces reset to base (3)

    // E2: After LL acts, Damage +20% for 2 turns
    if (eidolonLevel >= 2) {
        const e2Buff: IEffect = {
            id: EFFECT_IDS.E2_DMG_BUFF,
            name: 'E2: 与ダメージ上昇',
            category: 'BUFF',
            sourceUnitId: ownerId,
            durationType: 'TURN_START_BASED',
            duration: 2,
            modifiers: [
                { source: 'E2', target: 'basic_atk_dmg_boost', type: 'add', value: 0.20 },
                { source: 'E2', target: 'skill_dmg_boost', type: 'add', value: 0.20 },
                { source: 'E2', target: 'ult_dmg_boost', type: 'add', value: 0.20 }
            ],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, ownerId, e2Buff);
    }

    // Clean up E6 Vulnerability from enemies
    if (isE6) {
        newState.registry.getAliveEnemies().forEach(e => {
            newState = removeEffect(newState, e.id, EFFECT_IDS.E6_VULN);
        });
    }

    return newState;
}

// --- Handler Logic ---

const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    return spawnLightningLord(state, sourceUnitId, eidolonLevel);
};

const onTurnStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const llId = getLightningLordId(sourceUnitId);

    // If it is LL's turn
    if (event.sourceId === llId) {
        // Execute Attack
        let newState = executeLightningLordAttack(state, llId, sourceUnitId, eidolonLevel);
        return newState;
    }

    // If it is Jing Yuan's turn (A2 Logic could be handled here if it was simpler, but A2 is conditional on stacks at LL turn)
    return state;
};

const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;

    // Deal Damage
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill'); // Max 10? Spec says Max 15 for Skill E5
    const multiplier = getLeveledValue(ABILITY_VALUES.skillDmg, skillLevel);

    const targets = event.targetType === 'all_enemies' ? newState.registry.getAliveEnemies() :
        event.targetId ? [newState.registry.get(createUnitId(event.targetId))!] : [];

    targets.forEach(t => {
        const res = applyUnifiedDamage(newState, source, t, source.stats.atk * multiplier, {
            damageType: 'Skill',
            details: '紫霄の雷鳴'
        });
        newState = res.state;
    });

    // Stacks +2
    newState = updateLightningLordStacks(newState, sourceUnitId, 2);

    // A6: Crit Rate +10% for 2 turns
    if (source.traces?.some(t => t.id === TRACE_IDS.A6_WAR_MARSHAL)) {
        const a6Buff: IEffect = {
            id: EFFECT_IDS.A6_CRIT_RATE,
            name: 'A6: 会心率上昇',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: 2,
            modifiers: [{ source: 'A6', target: 'crit_rate', type: 'add', value: 0.10 }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, a6Buff);
    }

    return newState;
};

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const multiplier = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);

    const targets = newState.registry.getAliveEnemies();
    targets.forEach(t => {
        const res = applyUnifiedDamage(newState, source, t, source.stats.atk * multiplier, {
            damageType: 'Ultimate',
            details: '我が身の輝き'
        });
        newState = res.state;
    });

    // Stacks +3
    newState = updateLightningLordStacks(newState, sourceUnitId, 3);

    return newState;
};

const onUnitDeath = (event: GeneralEvent, state: GameState, sourceUnitId: string): GameState => {
    // If Jing Yuan dies, LL disappears
    if (event.targetId === sourceUnitId) { // event.targetId is the dying unit in ON_UNIT_DEATH?
        // Check event def. ON_UNIT_DEATH source is likely the dying unit?
        // Types: targetId? Check types.ts again.
        // `export interface GeneralEvent ...type: 'ON_UNIT_DEATH'; targetId ?: string; `
        // Usually sourceId is the event emitter, but for Death, who emits?

        // Assuming targetId is the dead unit.
        // Or check `sourceId` for consistency. 
        // Safer: check both.

        const isDead = event.targetId === sourceUnitId;
        if (isDead) {
            const llId = getLightningLordId(sourceUnitId);
            return {
                ...state,
                registry: state.registry.remove(createUnitId(llId))
            };
        }
    }
    return state;
}

export const jingYuanHandlerFactory: IEventHandlerFactory = (sourceUnitId: string, eidolonLevel: number) => {
    return {
        handlerMetadata: {
            id: `jing-yuan-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_UNIT_DEATH'
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            if (event.type === 'ON_BATTLE_START') return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_TURN_START') return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_UNIT_DEATH') return onUnitDeath(event as GeneralEvent, state, sourceUnitId);

            return state;
        }
    };
};

// --- Character Definition ---

export const jingYuan: Character = {
    id: CHAR_ID,
    name: '景元',
    path: 'Erudition',
    element: 'Lightning',
    rarity: 5,
    maxEnergy: 130,
    baseStats: {
        hp: 1164,
        atk: 698,
        def: 485,
        spd: 99,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75,
    },
    abilities: {
        basic: {
            id: 'e-basic',
            name: '電光石火',
            type: 'Basic ATK',
            description: '単体攻撃。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk', // Blast logic will use hits below
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }] // Scaling handled in handler if needed, but Basic is simple
            },
            energyGain: 20
        },
        skill: {
            id: 'e-skill',
            name: '紫霄の雷鳴',
            type: 'Skill',
            description: '全体攻撃。神君+2段。',
            targetType: 'all_enemies',
            energyGain: 30,
            effects: []
        },
        ultimate: {
            id: 'e-ultimate',
            name: '我が身の輝き',
            type: 'Ultimate',
            description: '全体攻撃。神君+3段。',
            targetType: 'all_enemies', // Self? No, hits enemies.
            energyGain: 5,
            effects: []
        },
        talent: {
            id: 'e-talent',
            name: '退魔の形神',
            type: 'Talent',
            description: '神君を召喚する。',
            targetType: 'self'
        },
        technique: {
            id: 'e-technique',
            name: '摂召威霊',
            type: 'Technique',
            description: '神君の初期段数+3。'
        }
    },
    traces: [
        { id: TRACE_IDS.A2_BATTLIA_CRUSH, name: '破陣', type: 'Bonus Ability', description: '神君段数6以上で会心ダメ+25%' },
        { id: TRACE_IDS.A4_SAVANT_PROVIDENCE, name: '先見', type: 'Bonus Ability', description: '戦闘開始時EP15回復' },
        { id: TRACE_IDS.A6_WAR_MARSHAL, name: '遣将', type: 'Bonus Ability', description: 'スキル後会心率+10%' },
        // Stat Bonuses omitted for brevity but standard layout
        { id: 'ji-stat-atk', name: '攻撃力', type: 'Stat Bonus', stat: 'atk_pct', value: 0.28, description: '攻撃力+28%' },
        { id: 'ji-stat-crit', name: '会心率', type: 'Stat Bonus', stat: 'crit_rate', value: 0.12, description: '会心率+12%' },
        { id: 'ji-stat-def', name: '防御力', type: 'Stat Bonus', stat: 'def_pct', value: 0.125, description: '防御力+12.5%' },
    ],
    eidolons: {
        e1: { level: 1, name: '流星雷霆 山をも砕く', description: '神君拡散ダメ倍率UP' },
        e2: { level: 2, name: '振るいし矛 地動かし天開く', description: '神君後、与ダメ+20%' },
        e3: { level: 3, name: '峰を移りし激雷 天穿つ', description: '必殺+2, 通常+1' },
        e4: { level: 4, name: '刃、雲を巻き 玉沙に落ちる', description: '神君攻撃毎にEP2回復' },
        e5: { level: 5, name: '百戦経て捨てし躯 生死軽んず', description: 'スキル+2, 天賦+2' },
        e6: { level: 6, name: '威光纏う神霊 敵屠る', description: '神君攻撃毎に敵へ被ダメデバフ' },
    },
    defaultConfig: {
        lightConeId: 'before-dawn', // Night Before
        relicSetIds: ['the_ashblazing_grand_duke', 'prisoner_in_deep_confinement'], // Grand Duke
        ornamentSetId: 'inert_salsotto',
        mainStats: {
            body: 'crit_rate',
            feet: 'atk_pct',
            sphere: 'lightning_dmg_boost',
            rope: 'atk_pct'
        },
        subStats: [
            { stat: 'crit_rate', value: 0.5 },
            { stat: 'crit_dmg', value: 1.0 }
        ]
    }
};
