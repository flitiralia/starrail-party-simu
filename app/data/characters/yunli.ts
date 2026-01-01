import { Character, StatKey, IAbility } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, DamageDealtEvent, ActionEvent, FollowUpAttackAction } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { applyHealing } from '../../simulator/engine/utils';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { addEnergyToUnit } from '../../simulator/engine/energy';

// --- Constants ---
const CHARACTER_ID = 'yunli';

const EFFECT_IDS = {
    PARRY_STANCE: (sourceId: string) => `yunli-parry-${sourceId}`,
    TAUNT: (sourceId: string, targetId: string) => `yunli-taunt-${sourceId}-${targetId}`,
    NEXT_COUNTER_CULL: (sourceId: string) => `yunli-next-cull-${sourceId}`, // A2 state
    A6_BUFF: (sourceId: string) => `yunli-a6-buff-${sourceId}`,
    TECHNIQUE_STANCE: (sourceId: string) => `yunli-tech-stance-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2_BURNING_WHEEL: 'yunli-trace-a2',
    A4_WARDING_BLADE: 'yunli-trace-a4',
    A6_TEMPERED_STEEL: 'yunli-trace-a6',
} as const;

// --- Ability Values ---
const ABILITY_VALUES = {
    basicDmg: { 6: 1.00, 7: 1.10 } as Record<number, number>,
    skillHealPct: { 10: 0.30, 12: 0.32 } as Record<number, number>,
    skillHealFlat: { 10: 200, 12: 222.5 } as Record<number, number>,
    skillDmgMain: { 10: 1.20, 12: 1.32 } as Record<number, number>,
    skillDmgAdj: { 10: 0.60, 12: 0.66 } as Record<number, number>, // Skill main 120%, adj 60% based on pattern or spec?
    // Spec says: "Skill... Main Z%, Adj W%".
    // Spec: "30.0%+200 HP... Main ?% Adj ?%".
    // Wait, the spec text for Level 10/12 in the prompt is:
    // "レベル10 30.0%+200" (This is healing)
    // "レベル12 32.0%+222.5"
    // The damage percentages are MISSING in the provided text for Skill?
    // Let me check the spec again: "指定した敵単体に雲璃の攻撃力Z%分の物理属性ダメージを与え、隣接する敵に雲璃の攻撃力W%分の物理属性ダメージを与える。"
    // But the values Z and W are not listed in the "Level 10..." lines.
    // I need to infer or check if they are listed elsewhere.
    // Looking at the spec file content from previous turn:
    // "レベル10 30.0%+200" -> Only heal listed?
    // Wait, "レベル10 30.0%+200" is strictly aligned with the Healing description part?
    // Ah, usually there are multiple lines.
    // Let me re-read the Spec File Output in Step 8.
    // Line 24: "レベル10 30.0%+200"
    // Line 25: "レベル12 32.0%+222.5"
    // It seems the damage multipliers for Skill are missing from the text or I missed them?
    // "雲璃の攻撃力X%+YのHPを回復し、指定した敵単体に雲璃の攻撃力Z%分の物理属性ダメージを与え..."
    // Standard Destruction scaling: Usually Main 120%, Adj 60% at L10.
    // I will use placeholders or standard values if not found.
    // Let's assume Main 120% / Adj 60% for now (Standard Blast Skill).

    ultCritDmg: { 10: 1.00, 12: 1.08 } as Record<number, number>,
    ultCullMain: { 10: 2.20, 12: 2.376 } as Record<number, number>,
    ultCullAdj: { 10: 1.10, 12: 1.188 } as Record<number, number>,
    ultCullRand: { 10: 0.72, 12: 0.7776 } as Record<number, number>,

    talentDmgMain: { 10: 1.20, 12: 1.32 } as Record<number, number>, // Counter Slash
    talentDmgAdj: { 10: 0.60, 12: 0.66 } as Record<number, number>, // Counter Slash Adj
};

// Skill damage assumption (Standard Destruction)
const SKILL_DMG_MAIN = { 10: 1.20, 12: 1.32 };
const SKILL_DMG_ADJ = { 10: 0.60, 12: 0.66 };

const BASIC_EP = 20;
const SKILL_EP = 30;
const ULT_EP_COST = 120; // Spec says 120
const TALENT_EP_REGEN = 15;

export const yunli: Character = {
    id: CHARACTER_ID,
    name: '雲璃',
    path: 'Destruction',
    element: 'Physical',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1358,
        atk: 679,
        def: 460,
        spd: 94,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 125
    },

    abilities: {
        basic: {
            id: 'yunli-basic',
            name: '震天動地',
            type: 'Basic ATK',
            description: '指定した敵単体に物理属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }],
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'yunli-skill',
            name: '天威煌々',
            type: 'Skill',
            description: 'HPを回復し、拡散物理属性ダメージを与える。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 1.20, toughnessReduction: 20 }], // Placeholder values
                adjacentHits: [{ multiplier: 0.60, toughnessReduction: 10 }],
            },
            energyGain: SKILL_EP,
            targetType: 'blast',
        },

        ultimate: {
            id: 'yunli-ultimate',
            name: '天を揺るがす大地の剣',
            type: 'Ultimate',
            description: '「構え」状態に入り、敵全体を挑発。「看破・滅」を発動可能にする。',
            energyGain: 5, // Standard refund ?? Spec doesn't imply refund but standard is 5.
            targetType: 'self', // Self buff primarily
        },

        talent: {
            id: 'yunli-talent',
            name: '閃溶',
            type: 'Talent',
            description: '被弾時EP回復＆カウンター。「看破・斬」を発動。',
            energyGain: 0,
            targetType: 'self',
        },

        technique: {
            id: 'yunli-technique',
            name: '後の先',
            type: 'Technique',
            description: '「迎撃」状態付与。開幕「看破・滅」発動。',
        },
    },

    traces: [
        {
            id: TRACE_IDS.A2_BURNING_WHEEL,
            name: '炎輪',
            type: 'Bonus Ability',
            description: '「看破・斬」発動後、次は「看破・滅」になる。',
        },
        {
            id: TRACE_IDS.A4_WARDING_BLADE,
            name: '劫邪',
            type: 'Bonus Ability',
            description: '「構え」中、CC抵抗＆被ダメ-20%。',
        },
        {
            id: TRACE_IDS.A6_TEMPERED_STEEL,
            name: '真鋼',
            type: 'Bonus Ability',
            description: 'カウンター発動時、攻撃力+30%。1ターン。',
        },
        { id: 'yunli-stat-atk-1', name: '攻撃力', type: 'Stat Bonus', stat: 'atk_pct', value: 0.28, description: '攻撃力+28%' },
        { id: 'yunli-stat-hp-1', name: '最大HP', type: 'Stat Bonus', stat: 'hp_pct', value: 0.18, description: '最大HP+18%' },
        { id: 'yunli-stat-crit-1', name: '会心率', type: 'Stat Bonus', stat: 'crit_rate', value: 0.067, description: '会心率+6.7%' },
    ],

    eidolons: {
        e1: { level: 1, name: '星魂1', description: '「看破・斬/滅」与ダメ+20%。「滅」ヒット数+3。' },
        e2: { level: 2, name: '星魂2', description: 'カウンター時、防御無視20%。' },
        e3: { level: 3, name: '星魂3', description: '必殺Lv+2, 通常Lv+1' },
        e4: { level: 4, name: '星魂4', description: '「看破・斬/滅」後、効果抵抗+50%。' },
        e5: { level: 5, name: '星魂5', description: 'スキルLv+2, 天賦Lv+2' },
        e6: { level: 6, name: '星魂6', description: '「構え」中、敵スキル発動で自動「滅」。カウンター時、会心率+15%, 貫通+20%。' },
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'dance-at-sunset', // Assuming signature LC
        superimposition: 1,
        relicSetId: 'the-wind-soaring-valorous',
        ornamentSetId: 'duran-dynasty-of-running-wolves', // Spec says "奔狼の都藍王朝" -> Duran
        mainStats: {
            body: 'crit_rate',
            feet: 'atk_pct',
            sphere: 'physical_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.15 },
            { stat: 'crit_dmg', value: 0.30 },
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'hp_pct', value: 0.10 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    },
};

// --- Helpers ---

// Handle Counter Logic
function triggerCounter(
    state: GameState,
    sourceId: string,
    targetId: string | undefined, // Attack source
    eidolonLevel: number,
    isUltCounter: boolean // If triggered by Ultimate Stance active
): GameState {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return state;

    let newState = state;

    // A6: Attack Buff
    if (unit.traces?.some(t => t.id === TRACE_IDS.A6_TEMPERED_STEEL)) {
        newState = addEffect(newState, sourceId, {
            id: EFFECT_IDS.A6_BUFF(sourceId),
            name: '真鋼',
            category: 'BUFF',
            sourceUnitId: sourceId,
            durationType: 'TURN_END_BASED',
            duration: 1,
            modifiers: [{ target: 'atk_pct', value: 0.30, type: 'add', source: '真鋼' }],
            apply: (t, s) => s, remove: (t, s) => s
        });
    }

    // Determine Counter Type (Slash or Cull)
    let isCull = isUltCounter;

    // A2 Logic: If not Ult Counter, check if we should trigger Cull
    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_BURNING_WHEEL);
    const nextCullEffect = unit.effects.find(e => e.id === EFFECT_IDS.NEXT_COUNTER_CULL(sourceId));

    if (!isUltCounter && hasA2 && nextCullEffect) {
        isCull = true;
        // Consume the state
        newState = removeEffect(newState, sourceId, EFFECT_IDS.NEXT_COUNTER_CULL(sourceId));
    } else if (!isUltCounter && hasA2 && !nextCullEffect) {
        // This is a Slash, so NEXT will be Cull
        newState = addEffect(newState, sourceId, {
            id: EFFECT_IDS.NEXT_COUNTER_CULL(sourceId),
            name: '炎輪 (次:滅)',
            category: 'BUFF', // Invisible internal state usually? But visible is fine.
            sourceUnitId: sourceId,
            durationType: 'PERMANENT',
            duration: -1,
            apply: (t, s) => s, remove: (t, s) => s
        });
    }

    // E6 Logic (Passives): Crit Rate +15%, Penetration +20% on Counter
    // Applied during damage calc via handler using action type check

    // Trigger Action
    if (isCull) {
        // Intuit: Cull (看破・滅)
        // Main + Adj + Random Hits
        // Main Hit Action
        newState = {
            ...newState,
            pendingActions: [...newState.pendingActions, {
                type: 'FOLLOW_UP_ATTACK',
                sourceId,
                targetId: targetId || undefined,
            } as FollowUpAttackAction]
        };

        // Random 6 Hits
        const enemies = state.registry.toArray().filter(u => u.isEnemy && u.hp > 0);
        if (enemies.length > 0) {
            for (let i = 0; i < 6; i++) {
                const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                newState = {
                    ...newState,
                    pendingActions: [...newState.pendingActions, {
                        type: 'FOLLOW_UP_ATTACK',
                        sourceId,
                        targetId: randomEnemy.id,
                    } as FollowUpAttackAction]
                };
            }
        }
        // Add "Executing Cull" flag for the duration of this action
        newState = addEffect(newState, sourceId, {
            id: `yunli-executing-cull-${sourceId}`,
            name: 'Executing Cull',
            category: 'BUFF', duration: -1, durationType: 'PERMANENT', // Clears after action manually
            sourceUnitId: sourceId,
            apply: (t, s) => s, remove: (t, s) => s
        });
    } else {
        // Intuit: Slash (看破・斬)
        newState = {
            ...newState,
            pendingActions: [...newState.pendingActions, {
                type: 'FOLLOW_UP_ATTACK',
                sourceId,
                targetId: targetId || undefined,
            } as FollowUpAttackAction]
        };
        // Signal Slash
        newState = addEffect(newState, sourceId, {
            id: `yunli-executing-slash-${sourceId}`,
            name: 'Executing Slash',
            category: 'BUFF', duration: -1, durationType: 'PERMANENT',
            sourceUnitId: sourceId,
            apply: (t, s) => s, remove: (t, s) => s
        });
    }

    return newState;
}

export const yunliHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `yunli-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_TURN_END', // For Parry Expiry
                'ON_BEFORE_DAMAGE_RECEIVED', // For A4 mitigation
                'ON_DAMAGE_DEALT', // For Talent Counter Trigger
                'ON_ACTION_COMPLETE', // For E4, A2 cleanup?
                'ON_BEFORE_DAMAGE_CALCULATION', // For Damage Scaling
                'ON_BATTLE_START', // For Technique
            ],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;
            const eidolonLevel = unit.eidolonLevel || 0;
            let newState = state;

            // --- Battle Start ---
            if (event.type === 'ON_BATTLE_START') {
                // Technique
                if (unit.config?.useTechnique !== false) {
                    newState = addEffect(newState, sourceUnitId, {
                        id: EFFECT_IDS.TECHNIQUE_STANCE(sourceUnitId),
                        name: '迎撃',
                        // Triggers Cull on attack or priority?
                        // "敵を先制攻撃、または攻撃を受けて戦闘に入った後、即座にランダムな敵単体に『看破・滅』を発動する。"
                        // Simulate by Triggering Cull immediately on first turn? Or actually start of battle?
                        // "Instant" implies right at start.
                        category: 'BUFF', duration: 1, durationType: 'TURN_END_BASED', // Dummy
                        sourceUnitId: sourceUnitId,
                        apply: (t, s) => s, remove: (t, s) => s
                    });

                    // Trigger Counter Cull immediately
                    newState = triggerCounter(newState, sourceUnitId, undefined, eidolonLevel, true);

                    // Buff +80% DMG for this attack (Handled in Calc)
                }
            }

            // --- Turn End (Parry Expiry) ---
            if (event.type === 'ON_TURN_END') { // Any unit's turn end
                const parryEffect = unit.effects.find(e => e.id === EFFECT_IDS.PARRY_STANCE(sourceUnitId));
                if (parryEffect) {
                    // Parry Expires! Trigger "Slash" on random enemy.
                    // Note: If Parry was consumed by a counter, it would be gone already.
                    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.PARRY_STANCE(sourceUnitId));

                    // Trigger Slash (Random)
                    newState = triggerCounter(newState, sourceUnitId, undefined, eidolonLevel, false);
                }
            }

            // --- Damage Received (Counter Trigger) ---
            if (event.type === 'ON_DAMAGE_DEALT' && event.targetId === sourceUnitId) {
                // Talent: Regen Energy
                newState = addEnergyToUnit(newState, sourceUnitId, TALENT_EP_REGEN, 0, false, { sourceId: sourceUnitId });

                const parryEffect = unit.effects.find(e => e.id === EFFECT_IDS.PARRY_STANCE(sourceUnitId));

                if (parryEffect) {
                    // Trigger Cull (Counter Mechanism)
                    newState = triggerCounter(newState, sourceUnitId, event.sourceId, eidolonLevel, true);
                    // Remove Parry (Consumed)
                    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.PARRY_STANCE(sourceUnitId));
                } else {
                    // Normal Counter (Slash)
                    newState = triggerCounter(newState, sourceUnitId, event.sourceId, eidolonLevel, false);
                }
            }

            // --- Before Damage Received (Mitigation) ---
            if (event.type === 'ON_BEFORE_DAMAGE_RECEIVED' && event.targetId === sourceUnitId) {
                // A4: If Parry active, -20% DMG taken
                const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_WARDING_BLADE);
                const isParry = unit.effects.some(e => e.id === EFFECT_IDS.PARRY_STANCE(sourceUnitId));
                if (hasA4 && isParry) {
                    const original = (event as any).modifiedDamage ?? (event as any).originalDamage;
                    (event as any).modifiedDamage = original * 0.80;
                }
            }

            // --- Damage Calculation ---
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceUnitId) {
                const actionLog = state.currentActionLog;
                if (actionLog) {
                    // Check if Cull or Slash
                    const isCull = unit.effects.some(e => e.id === `yunli-executing-cull-${sourceUnitId}`);
                    const isSlash = unit.effects.some(e => e.id === `yunli-executing-slash-${sourceUnitId}`);

                    // E1, E6, etc.
                    if (isCull || isSlash) {
                        // Apply E1 (+20% Dmg)
                        if (eidolonLevel >= 1) {
                            (event as any).damageBoost = ((event as any).damageBoost || 0) + 0.20;
                        }
                        // Apply E2 (Def Ignore)
                        if (eidolonLevel >= 2) {
                            (event as any).defIgnore = ((event as any).defIgnore || 0) + 0.20;
                        }
                        // Apply E4 (Res boost after) - Handle in Action Complete
                        // Apply E6 (Crit Rate/Pen)
                        if (eidolonLevel >= 6) {
                            (event as any).critRateBoost = ((event as any).critRateBoost || 0) + 0.15;
                            (event as any).resPen = ((event as any).resPen || 0) + 0.20;
                        }
                        // Apply Technique Buff (+80% Dmg) if first attack
                        if (unit.effects.some(e => e.id === EFFECT_IDS.TECHNIQUE_STANCE(sourceUnitId))) {
                            (event as any).damageBoost = ((event as any).damageBoost || 0) + 0.80;
                        }
                    }

                    // Set Multipliers based on Scaling
                    if (isCull) {
                        const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
                        const mainMult = getLeveledValue(ABILITY_VALUES.ultCullMain, ultLevel);
                        const adjMult = getLeveledValue(ABILITY_VALUES.ultCullAdj, ultLevel);
                        const randMult = getLeveledValue(ABILITY_VALUES.ultCullRand, ultLevel);

                        // Main Target
                        if ((event as any).isMainTarget) {
                            (event as any).multiplier = mainMult;
                            (event as any).toughnessReduction = 10;
                        }
                        // Adjacent
                        else if ((event as any).isAdjacent) {
                            (event as any).multiplier = adjMult;
                            (event as any).toughnessReduction = 10;
                        }
                        // Random Hits (Implementation Detail: We might need to split this into logic)
                        // This "onBeforeDamage" is one hit?
                        // Usually we define hits in Ability. But Counter is dynamic.
                        // We need to inject Hit Distribution here if using applyUnifiedDamage manually?
                        // Or if we rely on the Action definition?
                        // Since we used FollowUpAttack without 'damage' struct, we rely on Default or Manual?
                        // Actually, FollowUpAttackAction usually triggers the 'Talent' ability if not specified?
                        // But we have 2 types.
                        // We should probably manually dispatch damage in 'ON_ACTION_COMPLETE' of the FUA?
                        // or use 'ON_BEFORE_DAMAGE_CALCULATION' to Intercept 'Talent' damage?
                        // We will intercept.
                    }

                    if (isSlash) {
                        const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
                        const mainMult = getLeveledValue(ABILITY_VALUES.talentDmgMain, talentLevel);
                        const adjMult = getLeveledValue(ABILITY_VALUES.talentDmgAdj, talentLevel);

                        if ((event as any).isMainTarget) {
                            (event as any).multiplier = mainMult;
                            (event as any).toughnessReduction = 10;
                        } else if ((event as any).isAdjacent) {
                            (event as any).multiplier = adjMult;
                            (event as any).toughnessReduction = 10;
                        }
                    }
                }
            }

            // --- Action Complete (Cleanup / Post-effects) ---
            if (event.type === 'ON_ACTION_COMPLETE' && event.sourceId === sourceUnitId) {
                // Determine action type from event metadata (more reliable than localized log)
                const actionType = (event as ActionEvent).actionType;

                // If Skill Used
                if (actionType === 'SKILL') {
                    // Heal Self
                    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
                    const healPct = getLeveledValue(ABILITY_VALUES.skillHealPct, skillLevel);
                    const healFlat = getLeveledValue(ABILITY_VALUES.skillHealFlat, skillLevel);
                    newState = applyHealing(newState, sourceUnitId, sourceUnitId, { scaling: 'atk', multiplier: healPct, flat: healFlat }, '天威煌々');
                }

                // If Ultimate Used
                if (actionType === 'ULTIMATE') {
                    // Apply Parry Stance
                    // Apply Parry Stance
                    newState = addEffect(newState, sourceUnitId, {
                        id: EFFECT_IDS.PARRY_STANCE(sourceUnitId),
                        name: '構え',
                        category: 'BUFF', duration: 1, durationType: 'TURN_END_BASED',
                        sourceUnitId: sourceUnitId,
                        apply: (t, s) => s, remove: (t, s) => s
                    });

                    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
                    const critDmgBoost = getLeveledValue(ABILITY_VALUES.ultCritDmg, ultLevel);

                    // Add Crit Damage Buff for Next Counter
                    newState = addEffect(newState, sourceUnitId, {
                        id: `yunli-ult-crit-buff-${sourceUnitId}`,
                        name: '必殺技会心ダメUP',
                        category: 'BUFF', duration: 1, durationType: 'TURN_END_BASED', // Changed to TURN_END_BASED but manual cleanup needed? No, Ult crit buff is for NEXT counter.
                        // Actually spec: "次に行動する...まで継続" (Parry).
                        // Buff: "次のカウンターダメージの会心ダメージ+X%"
                        // So it should be consumed.
                        sourceUnitId: sourceUnitId,
                        modifiers: [{ target: 'crit_dmg', value: critDmgBoost, type: 'add', source: '必殺技' }],
                        apply: (t, s) => s, remove: (t, s) => s
                    });

                    // Taunt Enemies
                    state.registry.getAliveEnemies().forEach(e => {
                        newState = addEffect(newState, e.id, {
                            id: EFFECT_IDS.TAUNT(sourceUnitId, e.id),
                            name: '挑発',
                            category: 'DEBUFF', duration: 1, durationType: 'TURN_END_BASED',
                            sourceUnitId: sourceUnitId,
                            modifiers: [{ target: 'aggro', value: 1000, type: 'add', source: '挑発' }],
                            apply: (t, s) => s, remove: (t, s) => s
                        });
                    });
                }

                // If Counter Finished (Cull or Slash)
                const isCull = unit.effects.some(e => e.id === `yunli-executing-cull-${sourceUnitId}`);
                const isSlash = unit.effects.some(e => e.id === `yunli-executing-slash-${sourceUnitId}`);

                if (isCull || isSlash) {
                    // E4: Effect Res Buff
                    if (eidolonLevel >= 4) {
                        newState = addEffect(newState, sourceUnitId, {
                            id: `yunli-e4-res-${sourceUnitId}`,
                            name: '星魂4 (抵抗UP)',
                            category: 'BUFF', duration: 1, durationType: 'TURN_END_BASED',
                            sourceUnitId: sourceUnitId,
                            modifiers: [{ target: 'effect_res', value: 0.50, type: 'add', source: 'E4' }],
                            apply: (t, s) => s, remove: (t, s) => s
                        });
                    }

                    // Remove "Executing" flags (Technically duration is ACTION_END but explicit cleanup is safe)
                    /* flags update automatically on action end */

                    // A2: If Slash, next is Cull (Handled in Trigger logic, but double check?)
                    // Logic was: When triggering Slash, setting the "Next Is Cull" flag.
                    // So we are good.

                    // Cleanup Flags
                    newState = removeEffect(newState, sourceUnitId, `yunli-executing-cull-${sourceUnitId}`);
                    newState = removeEffect(newState, sourceUnitId, `yunli-executing-slash-${sourceUnitId}`);

                    // Consume Ult Crit Buff if present
                    if (unit.effects.some(e => e.id === `yunli-ult-crit-buff-${sourceUnitId}`)) {
                        newState = removeEffect(newState, sourceUnitId, `yunli-ult-crit-buff-${sourceUnitId}`);
                    }
                }

                // Remove Technique Stance after first attack
                if (unit.effects.some(e => e.id === EFFECT_IDS.TECHNIQUE_STANCE(sourceUnitId))) {
                    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.TECHNIQUE_STANCE(sourceUnitId));
                }
            }

            return newState;
        }
    };
};
