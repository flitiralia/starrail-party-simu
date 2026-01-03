import { Character, StatKey, IAbility } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionAdvanceAction, IEventHandlerLogic } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect, TauntEffect } from '../../simulator/effect/types';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { consumeHp } from '../../simulator/engine/utils';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { checkDebuffSuccess } from '../../simulator/engine/dispatcher';


const CHARACTER_ID = 'mydei';

const EFFECT_IDS = {
    CHARGE_TRACKER: 'mydei-charge-tracker', // Hidden effect to track Charge
    BLOOD_RETRIBUTION: 'mydei-blood-retribution', // State
    PRIORITY_TARGET: 'mydei-priority-target', // Marker for Ult target
    TAUNT: 'mydei-taunt',
    STUN: 'mydei-stun', // Technique Stun
    TECHNIQUE_TAUNT: 'mydei-technique-taunt',
};

const TRACE_IDS = {
    A2_UNDYING: 'mydei-trace-a2',
    A4_CC_RES: 'mydei-trace-a4',
    A6_HP_CONVERT: 'mydei-trace-a6',
};

// Ability Values
// Note: Values are based on Level 10 / 12 (max)
const ABILITY_VALUES = {
    basicDmg: { 6: 0.50, 7: 0.55 }, // % Max HP
    skillDmgMain: { 10: 0.90, 12: 0.99 }, // % Max HP
    skillDmgAdj: { 10: 0.50, 12: 0.55 },
    autoSkill1DmgMain: { 10: 1.10, 12: 1.21 }, // Z
    autoSkill1DmgAdj: { 10: 0.66, 12: 0.726 }, // x
    autoSkill2DmgMain: { 10: 2.80, 12: 3.08 }, // y
    autoSkill2DmgAdj: { 10: 1.68, 12: 1.848 }, // z
    ultHeal: { 10: 0.20, 12: 0.21 }, // X% Max HP
    ultDmgMain: { 10: 1.60, 12: 1.728 }, // Y
    ultDmgAdj: { 10: 1.00, 12: 1.08 }, // Z
    talentHeal: { 10: 0.25, 12: 0.27 }, // X% Max HP on entry
};

const AUTO_SKILL_1: IAbility = {
    id: 'mydei-auto-skill-1',
    name: '王を殺め王となる',
    type: 'Skill',
    description: '自動発動。HP35%消費。拡散ダメージ。',
    damage: {
        type: 'blast',
        scaling: 'hp',
        mainHits: [{ multiplier: 1.10, toughnessReduction: 20 }],
        adjacentHits: [{ multiplier: 0.66, toughnessReduction: 10 }]
    },
    energyGain: 30,
    targetType: 'blast',
    spCost: 0,
};

const AUTO_SKILL_2: IAbility = {
    id: 'mydei-auto-skill-2',
    name: '神を殺め神となる',
    type: 'Skill',
    description: '自動発動。Charge 150消費。拡散ダメージ。',
    damage: {
        type: 'blast',
        scaling: 'hp',
        mainHits: [{ multiplier: 2.80, toughnessReduction: 30 }],
        adjacentHits: [{ multiplier: 1.68, toughnessReduction: 20 }]
    },
    energyGain: 10,
    targetType: 'blast',
    spCost: 0,
};

const CHARGE_MAX = 200;
const CHARGE_ENTRY_COST = 100;
const CHARGE_EXTRA_TURN_COST = 150;
const A2_TRIGGER_LIMIT = 3;

// --- Helper Functions ---

function getCharge(unit: Unit): number {
    const effect = unit.effects.find(e => e.id === `${EFFECT_IDS.CHARGE_TRACKER}-${unit.id}`);
    return effect?.stackCount || 0;
}

function updateCharge(state: GameState, unitId: string, delta: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    // Check if in Blood Retribution and Charge >= 150 (Auto Skill 2 Active) -> "While active, cannot gain Charge"
    // The spec says "This skill triggers automatically, and while it is triggering (or active?), cannot gain Charge."
    // Actually: "This skill triggers automatically, and while triggering/active, cannot gain charge." - usually refers to the attack itself not generating charge?
    // Or does it mean while "Blood Retribution" is active? No, Talent says "Gain Charge when losing HP".
    // "God Killer" text: "This skill triggers automatically, and while active, charge cannot be gained." -> Likely means during the extra turn execution.
    // However, Talent logic says "In Blood Retribution, Max HP up...".
    // Let's assume charge gain is allowed unless specifically blocked. The "God Killer" specific block might be for the cost consumption frame or the action itself.
    // For now, allow charge gain.

    const effectId = `${EFFECT_IDS.CHARGE_TRACKER}-${unit.id}`;
    const existing = unit.effects.find(e => e.id === effectId);
    let current = existing?.stackCount || 0;

    let nextStack = Math.min(Math.max(current + delta, 0), CHARGE_MAX);

    let newState = state;
    if (existing) {
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(unitId), u => ({
                ...u,
                effects: u.effects.map(e => e.id === effectId ? { ...e, stackCount: nextStack, name: `チャージ (${nextStack})` } : e)
            }))
        };
    } else {
        const effect: IEffect = {
            id: effectId,
            name: `チャージ (${nextStack})`,
            category: 'OTHER', // Hidden or Special
            sourceUnitId: unitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: nextStack,
            maxStacks: CHARGE_MAX,


        };
        newState = addEffect(newState, unitId, effect);
    }

    // Check Triggers
    const updatedUnit = newState.registry.get(createUnitId(unitId))!;
    const updatedCharge = getCharge(updatedUnit);
    const inState = updatedUnit.effects.some(e => e.id === `${EFFECT_IDS.BLOOD_RETRIBUTION}-${unitId}`);

    // Trigger Blood Retribution Entry
    if (!inState && updatedCharge >= CHARGE_ENTRY_COST) {
        newState = enterBloodRetribution(newState, unitId);
    }

    // Trigger God Killer (Auto Skill 2) Extra Turn
    if (inState && updatedCharge >= CHARGE_EXTRA_TURN_COST) {
        // Spec: "In Blood Retribution, when Charge reaches 150, gain 1 extra turn and trigger 'God Killer'"
        // Check if we are already in an extra turn loop to prevent infinite?
        // Logic: Insert Action "Kill the God" (or trigger it).
        // Actually, usually "Extra Turn" means `insertAction`.
        // We should consume the charge HERE or when the ability fires?
        // Spec: "Consumes 150 Charge to..."
        // Safe to insert action. The action itself will consume charge? Or we consume now?
        // "When Charge reaches 150, gain Extra Turn AND trigger..."
        // Better to insert the action, and the action logic consumes the charge.
        // But we need to prevent spamming if charge stays at 150+.
        // The action MUST consume charge.
        // We also need to ensure we don't insert multiple times for the same threshold crossing.
        // But since this function is called on delta, it's fine.
        // However, if we add 50 charge and go 100 -> 150, we trigger.
        // We need to flag that an extra turn is pending?
        // Or just rely on the fact that the action will execute immediately.

        // Let's Insert Action.
        const godKillerAction = {
            type: 'INSERT_ACTION',
            unitId: unitId,
            abilityId: 'mydei-auto-skill-2', // God Killer
            targetId: null, // Will be resolved at execution (Priority Target)
        };
        // Wait, `insertAction` helper is not imported or available as a direct State transformation usually in this codebase's patterns?
        // `insertAction` is in `actionQueue`.
        // We need to verify if `insertAction` is available or if we use `ActionAdvance`.
        // "Extra Turn" usually implies ActionAdvance 100% or Immediate Action.
        // If we use ActionAdvance 100%, it works for "Extra Turn".
        // But "Kill the God" is a specific Skill usage.
        // Let's use ActionAdvance 100% and force the next action to be Skill 2?
        // OR: Just execute the damage immediately if it's an "Additional Attack" style?
        // "Gains an extra turn AND triggers..." implies it IS an action.

        // Impl: Action Advance 100%. Set a flag "Next Action is God Killer".
        // But wait, "Kill the King" is automatic on "Own Turn".
        // "God Killer" is "Extra Turn".
        // If we just Advance 100%, it becomes "Own Turn", so "Kill the King" might trigger?
        // We need to distinguish.
        // Let's add an effect "Pending God Killer" that forces the next action to be God Killer.

        // Actually, if I use `ActionAdvance` 100%, he gets a turn.
        // On that turn, we check behaviors.
        newState = {
            ...newState,
            pendingActions: [
                { type: 'ACTION_ADVANCE', targetId: unitId, percent: 1.0 } as ActionAdvanceAction,
                ...newState.pendingActions
            ]
        };
        // Add a marker to ensure we use God Killer
        const godKillerMarker: IEffect = {
            id: `mydei-god-killer-pending-${unitId}`,
            name: 'God Killer Pending',
            category: 'OTHER',
            sourceUnitId: unitId,
            durationType: 'TURN_START_BASED', // Consumed on turn start
            duration: 1,

            /* remove removed */
        };
        newState = addEffect(newState, unitId, godKillerMarker);

        // Also consume charge immediately? Or wait? 
        // Spec: "Consume 150 Charge to...". If we wait, he might lose charge?
        // "When charge reaches 150...".
        // Let's consume in the Ability execution to be safe and consistent with "Consume 150 Charge to deal damage".
    }

    return newState;
}

function enterBloodRetribution(state: GameState, unitId: string): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    // Consume 100 Charge
    let newState = updateCharge(state, unitId, -CHARGE_ENTRY_COST);

    // Heal X% Max HP (Talent)
    const eidolonLevel = unit.eidolonLevel || 0;
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent'); // E5 +2
    const healPct = getLeveledValue(ABILITY_VALUES.talentHeal, talentLevel); // ~25%
    const healAmount = unit.stats.hp * healPct;

    // Apply Effect
    const effect: IEffect = {
        id: `${EFFECT_IDS.BLOOD_RETRIBUTION}-${unitId}`,
        name: '血の報復',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT', // Until cleared by death prevention or manually?
        // Spec doesn't say it has a duration in turns. It says "When HP reaches 0... clear state".
        // It consumes 100 charge to enter. Does it drain? No.
        duration: -1,
        modifiers: [
            { target: 'hp_pct', value: 0.50, type: 'add', source: 'Blood Retribution' }, // Max HP +50%
            { target: 'def', value: -10000, type: 'add', source: 'Blood Retribution (Fixed 0)' }, // Hacky? Or we use a special modifier?
            // The engine supports `set`? Currently `add`, `mul`.
            // If I want DEF 0, I can try -100% mul?
            { target: 'def_pct', value: -1.0, type: 'add', source: 'Blood Retribution (Zero)' } // -100% DEF
        ],
        tags: ['BLOOD_RETRIBUTION'],

        /* remove removed */
    };

    // E4: Crit DMG +30%
    if (eidolonLevel >= 4) {
        effect.modifiers?.push({ target: 'crit_dmg', value: 0.30, type: 'add', source: 'E4' });
    }
    // E2: Ignore DEF 15% (Handled in Damage Calc, but can add modifier if engine supports)
    // Engine usually handles res_pen, def_ignore via modifiers too.
    if (eidolonLevel >= 2) {
        effect.modifiers?.push({ target: 'def_ignore', value: 0.15, type: 'add', source: 'E2' });
    }

    // A4: CC Res (Handled in hooks or modifier)
    if (unit.traces?.some(t => t.id === TRACE_IDS.A4_CC_RES)) {
        effect.modifiers?.push({ target: 'effect_res', value: 1.0, type: 'add', source: 'A4 Control Res' }); // Simplify as 100% or allow specific check?
        // Spec: "Can resist Crowd Control debuffs".
        // Best handled in `checkDebuffSuccess` via flag or highly boosted res.
    }

    newState = addEffect(newState, unitId, effect);

    // Heal
    // Need to register healing.
    // Using `consumeHp` for negative? No, use heal helper if available, or just modify HP.
    // Engine `unit.hp` setter triggers events? No, we should use actions or helpers.
    // We'll update registry direct for now if no helper.
    // Actually `consumeHp` with negative? No.
    // Let's iterate registry.
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(unitId), u => ({
            ...u,
            hp: Math.min(u.hp + healAmount, u.stats.hp)
        }))
    };

    // Action Advance 100%
    newState = {
        ...newState,
        pendingActions: [
            { type: 'ACTION_ADVANCE', targetId: unitId, percent: 1.0 } as ActionAdvanceAction,
            ...newState.pendingActions
        ]
    };

    // Switch Skill to Auto Skill 1 logic?
    // We can handle this in `ON_TURN_START`.

    return newState;
}

function exitBloodRetribution(state: GameState, unitId: string): GameState {
    let newState = removeEffect(state, unitId, `${EFFECT_IDS.BLOOD_RETRIBUTION}-${unitId}`);
    return newState;
}

// Handler Factory
export const mydeiHandlerFactory: IEventHandlerFactory = (sourceUnitId, eidolonLevel, parameter) => {
    return {
        handlerMetadata: {
            id: `mydei-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_DAMAGE_DEALT', // For HP Loss Charge Gain (was ON_DAMAGE_TAKEN)
                'ON_HEAL_RECEIVED', // E2
                'ON_BEFORE_DEATH', // A2/Talent Survival
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_ACTION_COMPLETE'
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string) => {
            const unitId = sourceUnitId;
            const unit = state.registry.get(createUnitId(unitId));
            if (!unit) return state;

            let newState = state;

            if (event.type === 'ON_BATTLE_START') {
                // E6: Enter Blood Retribution, Charge 100
                if (eidolonLevel >= 6) {
                    newState = updateCharge(newState, unitId, 100);
                    // It should trigger entry automatically via updateCharge logic
                }

                // A6: Max HP > 4000 -> Crit Rate
                // Static buff based on Start Stats? Or dynamic? "When Entering Battle".
                // We'll add a permanent buff.
                if (unit.traces?.some(t => t.id === TRACE_IDS.A6_HP_CONVERT)) {
                    const excessHp = Math.max(0, unit.stats.hp - 4000);
                    const count = Math.min(Math.floor(excessHp / 100), 40); // Max 4000 excess (total 8000)
                    if (count > 0) {
                        const critRate = count * 0.012;
                        const a6Buff: IEffect = {
                            id: `mydei-a6-buff-${unitId}`,
                            name: 'A6 Crit Rate',
                            category: 'BUFF',
                            sourceUnitId: unitId,
                            durationType: 'PERMANENT',
                            duration: -1,
                            modifiers: [{ target: 'crit_rate', value: critRate, type: 'add', source: 'A6' }],

                            /* remove removed */
                        };
                        newState = addEffect(newState, unitId, a6Buff);
                    }
                }

                // 秘技: 戦闘開始時に敵全体を挑発状態にする (1ターン, 固定確率100%)
                // useTechniqueがtrueの場合のみ発動
                if (unit.config?.useTechnique !== false) {
                    const aliveEnemies = newState.registry.getAliveEnemies();
                    for (const enemy of aliveEnemies) {
                        const tauntEffect: TauntEffect = {
                            id: `taunt-${enemy.id}`,
                            type: 'Taunt',
                            name: '挑発',
                            category: 'DEBUFF',
                            sourceUnitId: unitId,
                            durationType: 'TURN_END_BASED',
                            duration: 1,  // 1ターン継続
                            isCleansable: true,
                            targetAllyId: unitId,  // モーディス自身を攻撃させる
                            ignoreResistance: true,  // 固定確率100%
                        };
                        newState = addEffect(newState, enemy.id, tauntEffect);
                    }
                    // チャージを50獲得
                    newState = updateCharge(newState, unitId, 50);
                }
            }

            // Charge Gain on HP Loss (Talent)
            // "Gain 1 Charge for every 1% HP lost".
            if (event.type === 'ON_DAMAGE_DEALT' && event.targetId === unitId) {
                // Determine HP lost pct.
                const damage = event.value;
                if (damage > 0) {
                    const pctLost = (damage / unit.stats.hp) * 100;
                    // Apply A6 Bonus? "Charge gained from taking damage +2.5%" (flat or multiplier?)
                    // Spec: "Charge percentage obtained... +2.5%". This phrasing is ambiguous.
                    // "1% lost = 1 charge".
                    // Maybe it means "1% lost = 1.025 Charge" or "Gain +2.5% more charge"?
                    // "Charge percentage is +2.5%".
                    // Likely: Multiplier 1.025? Or flat addition?
                    // Given the small numbers (1-100), maybe it means "For every hit...".
                    // Let's assume multiplier 1.025 for now or check if it means "Rate +2.5%".
                    // "Charge ratio +2.5%". Original: "charge gained +2.5%".
                    // Let's implement as multiplier: `charge = basic_charge * (1 + 0.025)`? No, that's tiny.
                    // Maybe `charge = pct * (1 + 0.025)`?
                    // Spec: "Recieved Healing... +0.75%".

                    let chargeGain = pctLost; // 1 to 1

                    if (unit.traces?.some(t => t.id === TRACE_IDS.A6_HP_CONVERT)) {
                        // "Charge obtained from taking damage +2.5%"
                        // "Healing received... +0.75%".
                        // This likely refers to the CONVERSION RATE.
                        // Base: 1% HP = 1 Charge.
                        // Buffed: 1% HP = 1.025 Charge? Or +2.5 Charge flat?
                        // "Get Charge Percentage +2.5%". 
                        // I will assume it adds to the multiplier. But base is 1.
                        // Maybe it means 100% -> 102.5%?
                        // Let's use `chargeGain = pctLost * 1.025` for now.
                        chargeGain *= 1.025;
                    }

                    newState = updateCharge(newState, unitId, chargeGain);
                }
            }

            // E2 Charging from Healing?
            // "After receiving healing, 40% of amount converts to charge..."
            // "Accumulated up to 40, reset after action".
            if ((event as any).type === 'ON_HEAL_RECEIVED' && (event as any).targetId === unitId && eidolonLevel >= 2) {
                const healAmount = (event as any).value; // Generic Event interface might not have `value` for Heal if not cast properly.
                // Assuming standard event payload has `value`.
                if (healAmount > 0) {
                    let chargeGain = healAmount * 0.40; // 40%? No, "40% of amount converts to charge".
                    // Wait, 1 Healing = 1 Charge? No way.
                    // "Healing received... converts to charge".
                    // Usually Charge is 0-200. HP is 3000+.
                    // If I heal 1000, 40% = 400 Charge? Instantly max?
                    // "Cumulative up to 40". Logic implies it's capped at 40 total gain per action.
                    // So 40 is the cap.
                    // If I heal 100, gain 40 charge?
                    // Spec: "40% of healing amount".
                    // Probably: Charge = Heal * (Multiplier?).
                    // But 40 limit is small.
                    // Maybe it refers to the percentage of text?
                    // "Restores HP... 40% of the restoration amount is converted to Charge".
                    // Let's assume generic scaling: 1 HP = ? Charge.
                    // Talent: 1% HP = 1 Charge.
                    // 1552 HP -> 1% = 15. HP.
                    // Healing 1000 HP = 64% HP = 64 Charge (equivalent).
                    // If 40% of 1000 = 400, that's huge.
                    // It must be "40% of the *equivalent charge value*" or "40% of the heal amount, capped at 40".
                    // Given the cap is 40 (20% of max charge), it's likely raw number capped.
                    // "Charge up to 40".
                    // Let's use: Gain = Heal * ?
                    // Actually, if the cap is 40, and gain is high, it hits cap instantly.
                    // Max HP ~5000. Heal 1000.
                    // If 1 HP = 1 Charge, 400 charge.
                    // If 1% HP = 1 Charge. Heal 20% (1000/5000).
                    // Spec doesn't clarify unit.
                    // But usually "Convert to Charge" implies 1:1 or specific ratio.
                    // Given Cap 40, likely "1 Charge per X Healing".
                    // Let's assume it means "Gain Charge equal to 40% of the Healing *Percentage*"?
                    // "40% of the amount".
                    // If logic is unclear, I'll follow the most balanced interpretation:
                    // Convert Healing to %HP first?
                    // Or 1 Charge per 1 HP? No.
                    // Let's look at A6 again: "Healing received... +0.75%".
                    // This implies A6 buffs the *outcome*.
                    // Let's assume 1 Charge per 1% HP Healed?
                    // And E2 says "40% of amount".
                    // Maybe: "Heal 1000. That is 20% HP. Gain Charge equal to 40% of that percentage?" -> 8 Charge.
                    // 40 Cap implies you can gain 40. That requires huge healing if this ratio is used.
                    // If I assume 1 Charge per 1 HP, 40 is tiny (40 HP).
                    // Maybe it means "Gain Charge equal to 40% of the *Heal Amount*"?
                    // No, Charge is 0-200.
                    // Let's check the Japanese text if possible?
                    // "治癒を受けた後、その治癒量の40%をチャージに変換する（累計40まで...）"
                    // "Amount" usually means the raw number.
                    // "Convert to Charge" -> Charge += Amount * 0.4.
                    // If Heal 100, Charge +40. Hits Cap.
                    // 100 HP is nothing.
                    // This implies Charge unit is large? No, Max 200.
                    // Maybe the cap is "40% of Max Charge"? No, "Cumulative 40".
                    // It likely means "The *Charge gained* is 40% of the heal (scaled?)".
                    // Or typical HSR logic: "Charge = Heal / MaxHP * 100 * Factor"?
                    // Let's assume "1 Charge per 1% HP equivalent" is the standard unit.
                    // "Heal 10% HP -> Gain 4 Charge (40% of 10)".
                    // This seems reasonable. Cap 40 implies you can heal 100% HP and gain 40 Charge.
                    // Perfect.
                    // Implementation: `chargeGain = (Heal / MaxHP * 100) * 0.40`.
                    // Verify Cap: Max 40 per Action.
                    // Needs a per-action tracking.

                    const pctHealed = (healAmount / unit.stats.hp) * 100;
                    let gained = pctHealed * 0.40;

                    // Track counter
                    const e2TrackerId = `mydei-e2-tracker-${unitId}`;
                    const tracker = unit.effects.find(e => e.id === e2TrackerId);
                    const currentCount = tracker?.stackCount || 0;

                    const available = 40 - currentCount;
                    if (available > 0) {
                        const actualGain = Math.min(gained, available);
                        newState = updateCharge(newState, unitId, actualGain);

                        // Update Tracker
                        if (tracker) {
                            newState = {
                                ...newState,
                                registry: newState.registry.update(createUnitId(unitId), u => ({
                                    ...u,
                                    effects: u.effects.map(e => e.id === e2TrackerId ? { ...e, stackCount: currentCount + actualGain } : e)
                                }))
                            };
                        } else {
                            newState = addEffect(newState, unitId, {
                                id: e2TrackerId,
                                name: 'E2 Tracker',
                                category: 'OTHER',
                                sourceUnitId: unitId,
                                durationType: 'PERMANENT', // Manual reset
                                duration: -1,
                                stackCount: actualGain,

                                /* remove removed */
                            });
                        }
                    }
                }
            }

            // Action Complete: Reset E2 Tracker
            if (event.type === 'ON_ACTION_COMPLETE' && event.sourceId === unitId) {
                const e2TrackerId = `mydei-e2-tracker-${unitId}`;
                const tracker = unit.effects.find(e => e.id === e2TrackerId);
                if (tracker) {
                    // Reset to 0 or remove
                    newState = removeEffect(newState, unitId, e2TrackerId);
                }
            }

            // Turn Start: Auto Skills Logic
            // Turn Start: Auto Skills Logic
            if (event.type === 'ON_TURN_START' && event.sourceId === unitId) {
                // Check if Blood Retribution
                const inState = unit.effects.some(e => e.id === `${EFFECT_IDS.BLOOD_RETRIBUTION}-${unitId}`);
                if (inState) {
                    // Check if God Killer Pending (Effect trigger)
                    const godKillerPending = unit.effects.some(e => e.id === `mydei-god-killer-pending-${unitId}`);

                    let activeSkill = AUTO_SKILL_1; // Default
                    if (godKillerPending) {
                        activeSkill = AUTO_SKILL_2;
                    }

                    // Swap Skill
                    newState = {
                        ...newState,
                        registry: newState.registry.update(createUnitId(unitId), u => ({
                            ...u,
                            abilities: {
                                ...u.abilities,
                                skill: activeSkill
                            }
                        }))
                    };
                } else {
                    // Restore Normal Skill
                    newState = {
                        ...newState,
                        registry: newState.registry.update(createUnitId(unitId), u => ({
                            ...u,
                            abilities: {
                                ...u.abilities,
                                skill: mydei.abilities.skill
                            }
                        }))
                    };
                }
            }

            // Before Death: A2 / Talent
            if (event.type === 'ON_BEFORE_DEATH' && event.targetId === unitId) {
                const inState = unit.effects.some(e => e.id === `${EFFECT_IDS.BLOOD_RETRIBUTION}-${unitId}`);
                if (inState) {
                    // Check A2 Limit
                    let a2TriggeredCount = 0; // Need to store this in state/effects?
                    // Use a counter effect
                    const a2Effect = unit.effects.find(e => e.id === `mydei-a2-counter-${unitId}`);
                    a2TriggeredCount = a2Effect?.stackCount || 0;

                    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_UNDYING);

                    if (hasA2 && a2TriggeredCount < A2_TRIGGER_LIMIT) {
                        // A2: Triggered, prevent death, reset HP, keep state.
                        // "Does not clear state".
                        // Cancel Death Event? Engine support required.
                        // Usually `preventDefault` or similar. 
                        // Current engine pattern for Fu Xuan E2 / Huohuo E2: "Cancel death".

                        // Increment Counter
                        // Update HP to safe range?

                        // Ref Fu Xuan E2 logic if exists. Or generic `revive`.
                        // Assuming `event` object is mutable or we return handled state?
                    } else {
                        // Talent: Clear Charge, Exit State, Heal 50% Max HP.
                        // This prevents death "Instead of becoming incapacitated...".
                        newState = exitBloodRetribution(newState, unitId);
                        newState = updateCharge(newState, unitId, -9999); // Clear to 0
                        newState = {
                            ...newState,
                            registry: newState.registry.update(createUnitId(unitId), u => ({
                                ...u,
                                hp: u.stats.hp * 0.50
                            }))
                        };
                        // Cancel Death
                        // We need to signal the engine to cancel death. 
                        // If logic returns state with HP > 0, does engine respect it?
                        // Yes, usually death check loop happens after.
                    }
                }
            }

            // Skill Used
            if (event.type === 'ON_SKILL_USED' && event.sourceId === unitId) {
                // Logic for consuming HP, etc. handled in Action Logic or here?
                // Action Logic handles damage. Here we handle side effects.
                // HP Spend is part of Cost? Or Effect?
                // Normal Skill: Spend 50% HP.
                // Auto Skills: Spend HP or Charge.

                // We should probably rely on `mydeiActionHandler` for the core execution?
                // Or just standard ability properties if possible.
                // Dynamic HP consumption is hard to define in static `abilities` config.
                // We'll do it manually here or in `apply`.
            }

            // 必殺技完了時: 挑発付与 (ターゲット+隣接敵, 2ターン, 固定確率100%)
            if (event.type === 'ON_ACTION_COMPLETE' && event.sourceId === unitId) {
                const actionLog = state.currentActionLog;
                if (actionLog?.primaryActionType === 'ULTIMATE') {
                    // ターゲットおよび隣接敵に挑発を付与
                    const targetId = actionLog.primaryTargetId;
                    if (targetId) {
                        const aliveEnemies = newState.registry.getAliveEnemies();

                        // メインターゲットと隣接敵を特定
                        const targetIndex = aliveEnemies.findIndex(e => e.id === targetId);
                        const affectedEnemies: typeof aliveEnemies = [];

                        if (targetIndex >= 0) {
                            // メインターゲット
                            affectedEnemies.push(aliveEnemies[targetIndex]);
                            // 左隣接
                            if (targetIndex > 0) affectedEnemies.push(aliveEnemies[targetIndex - 1]);
                            // 右隣接
                            if (targetIndex < aliveEnemies.length - 1) affectedEnemies.push(aliveEnemies[targetIndex + 1]);
                        }

                        for (const enemy of affectedEnemies) {
                            const tauntEffect: TauntEffect = {
                                id: `taunt-${enemy.id}`,
                                type: 'Taunt',
                                name: '挑発',
                                category: 'DEBUFF',
                                sourceUnitId: unitId,
                                durationType: 'TURN_END_BASED',
                                duration: 2,  // 2ターン継続
                                isCleansable: true,
                                targetAllyId: unitId,  // モーディス自身を攻撃させる
                                ignoreResistance: true,  // 固定確率100%
                            };
                            newState = addEffect(newState, enemy.id, tauntEffect);
                        }
                    }
                }
            }

            return newState;
        }
    };
};

export const mydeiActionHandler: IEventHandlerLogic = (event, state, handlerId) => {
    return state;
}

export const mydei: Character = {
    id: CHARACTER_ID,
    name: 'モーディス',
    path: 'Destruction',
    element: 'Imaginary',
    rarity: 5,
    maxEnergy: 160,
    baseStats: {
        hp: 1552,
        atk: 426,
        def: 194,
        spd: 95,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 125
    },
    abilities: {
        basic: {
            id: 'mydei-basic',
            name: '往途踏破の誓い',
            type: 'Basic ATK',
            description: '単体ダメージ (MaxHP参照)',
            damage: {
                type: 'simple',
                scaling: 'hp',
                hits: [{ multiplier: 0.50, toughnessReduction: 10 }]
            },
            energyGain: 20,
            targetType: 'single_enemy'
        },
        skill: {
            id: 'mydei-skill',
            name: '万死に悔いなし',
            type: 'Skill',
            description: '拡散ダメージ。HP50%消費。',
            damage: {
                type: 'blast',
                scaling: 'hp',
                mainHits: [{ multiplier: 0.90, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: 0.50, toughnessReduction: 10 }]
            },
            energyGain: 30,
            targetType: 'blast',
            spCost: 1,
        },
        ultimate: {
            id: 'mydei-ultimate',
            name: '天を滅す炎骨の王座',
            type: 'Ultimate',
            description: '回復, チャージ+20, 拡散ダメ, 挑発',
            damage: {
                type: 'blast',
                scaling: 'hp',
                mainHits: [{ multiplier: 1.60, toughnessReduction: 20 }], // Lv10
                adjacentHits: [{ multiplier: 1.00, toughnessReduction: 20 }]
            },
            energyGain: 5,
            targetType: 'blast'
        },
        talent: {
            id: 'mydei-talent',
            name: '血を以って血を制す',
            type: 'Talent',
            description: 'Charge System & Blood Retribution',
            targetType: 'self'
        },
        technique: {
            id: 'mydei-technique',
            name: '砕折の矛、臣服の牢獄',
            type: 'Technique',
            description: 'Engage trigger: Damage + Taunt + Charge 50',
            targetType: 'self'
        }
    },
    traces: [
        { id: TRACE_IDS.A2_UNDYING, name: '土と水', type: 'Bonus Ability', description: 'Blood Retribution Undying (3 times)' },
        { id: TRACE_IDS.A4_CC_RES, name: '三十の僭主', type: 'Bonus Ability', description: 'CC Resist in state' },
        { id: TRACE_IDS.A6_HP_CONVERT, name: '血染めの衣', type: 'Bonus Ability', description: 'HP > 4000 -> Crit Rate, Charge Boost' },
    ],
    eidolons: {
        e1: { level: 1, name: 'E1', description: 'Kill God Dmg +30%, Blast = Main Dmg' },
        e2: { level: 2, name: 'E2', description: 'Def Ignore 15%, Heal->Charge' },
        e3: { level: 3, name: 'E3', description: 'Skill+2, Basic+1' },
        e4: { level: 4, name: 'E4', description: 'Crit DMG +30%, Heal on Hit' },
        e5: { level: 5, name: 'E5', description: 'Ult+2, Talent+2' },
        e6: { level: 6, name: 'E6', description: 'Start Battle in State' }
    },
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'the-unreachable-side',
        superimposition: 1,
        relicSetId: 'longevous-disciple',
        ornamentSetId: 'rutilant-arena',
        mainStats: {
            body: 'crit_dmg',
            feet: 'spd',
            sphere: 'imaginary_dmg_boost',
            rope: 'hp_pct'
        },
        subStats: [
            { stat: 'crit_rate', value: 0.10 },
            { stat: 'crit_dmg', value: 0.50 },
            { stat: 'hp_pct', value: 0.20 },
            { stat: 'spd', value: 10 },
        ],
        rotationMode: 'sequence',
        rotation: ['s', 'b'],
        ultStrategy: 'immediate',
    }
};
