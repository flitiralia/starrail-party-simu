import { Character, StatKey, IAbility, Element } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, GeneralEvent, BeforeDamageCalcEvent, DamageDealtEvent } from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { advanceAction } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent, applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateDamageWithCritInfo } from '../../simulator/damage';

// --- Constants ---
const CHARACTER_ID = 'seele';

const EFFECT_IDS = {
    BUFFED_STATE: (sourceId: string) => `seele-buffed-state-${sourceId}`,
    SKILL_SPD_BOOST: (sourceId: string, instanceId: number = 0) => `seele-skill-spd-boost-${sourceId}-${instanceId}`, // Accommodate stacking
    ULT_BUTTERFLY: (sourceId: string, targetId: string) => `seele-ult-butterfly-${sourceId}-${targetId}`,
    RESURGENCE_INDICATOR: (sourceId: string) => `seele-resurgence-indicator-${sourceId}`,
    TECHNIQUE_STEALTH: (sourceId: string) => `seele-technique-stealth-${sourceId}`,
    A2_AGGRO_DOWN: (sourceId: string) => `seele-a2-aggro-down-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2_NIGHTSHADE: 'seele-trace-a2',
    A4_LACERATE: 'seele-trace-a4',
    A6_RIPPLES: 'seele-trace-a6',
} as const;

// --- Ability Values ---
const ABILITY_VALUES = {
    basicMult: { 6: 1.00, 7: 1.10 } as Record<number, number>,
    skillMult: { 10: 2.20, 12: 2.42 } as Record<number, number>,
    ultMult: { 10: 4.25, 12: 4.59 } as Record<number, number>,
    talentDmgBoost: { 10: 0.80, 12: 0.88 } as Record<number, number>,
};

// --- Basic Stats ---
const BASIC_TOUGHNESS = 10;
const BASIC_EP = 20;

const SKILL_TOUGHNESS = 20;
const SKILL_EP = 30;
const SKILL_SPD_BOOST_PCT = 0.25;
const SKILL_SPD_DURATION = 2;

const ULT_TOUGHNESS = 30;
const ULT_EP = 5; // Refund on cast

// E4: EP Restore
const E4_EP_RESTORE = 15;

// E6: Additional Butterfly Damage
const E6_DMG_PERCENT = 0.15; // 15% of Ultimate Damage (Scaling)

export const seele: Character = {
    id: CHARACTER_ID,
    name: 'ゼーレ',
    path: 'The Hunt',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 931,
        atk: 640,
        def: 363,
        spd: 115,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75 // Hunt Standard
    },

    abilities: {
        basic: {
            id: 'seele-basic',
            name: '強襲',
            type: 'Basic ATK',
            description: '指定した敵単体にゼーレの攻撃力100%分の量子属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.3, toughnessReduction: 3 },
                    { multiplier: 0.7, toughnessReduction: 7 },
                ], // 2 hits (30/70 split usually)
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'seele-skill',
            name: '還刃',
            type: 'Skill',
            description: 'ゼーレの速度+25%、2ターン継続。指定した敵単体にゼーレの攻撃力220%分の量子属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.2, toughnessReduction: 4 },
                    { multiplier: 0.1, toughnessReduction: 2 },
                    { multiplier: 0.1, toughnessReduction: 2 },
                    { multiplier: 0.6, toughnessReduction: 12 },
                ], // 4 hits (20/10/10/60 approx)
            },
            energyGain: SKILL_EP,
            spCost: 1,
            targetType: 'single_enemy',
        },

        ultimate: {
            id: 'seele-ultimate',
            name: '乱れ蝶',
            type: 'Ultimate',
            description: '増幅状態に入り、指定した敵単体にゼーレの攻撃力425%分の量子属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 1.0, toughnessReduction: ULT_TOUGHNESS }
                ],
            },
            energyGain: ULT_EP,
            targetType: 'single_enemy',
        },

        talent: {
            id: 'seele-talent',
            name: '再現',
            type: 'Talent',
            description: '通常攻撃、戦闘スキル、必殺技で敵を倒すと追加ターンを1獲得し、増幅状態に入る。',
            energyGain: 0,
        },

        technique: {
            id: 'seele-technique',
            name: '幻身',
            type: 'Technique',
            description: '秘技を使用した後、20秒のステルス状態になる。攻撃して戦闘に入ると増幅状態になる。',
        },
    },

    traces: [
        {
            id: TRACE_IDS.A2_NIGHTSHADE,
            name: '夜行',
            type: 'Bonus Ability',
            description: '残りHPが50%以下の時、敵に攻撃される確率ダウン。',
        },
        {
            id: TRACE_IDS.A4_LACERATE,
            name: '斬裂',
            type: 'Bonus Ability',
            description: '増幅状態の時、ゼーレの量子属性耐性貫通+20%。',
        },
        {
            id: TRACE_IDS.A6_RIPPLES,
            name: 'さざ波',
            type: 'Bonus Ability',
            description: '通常攻撃を行った後、ゼーレの次の行動順が20%早まる。',
        },
        {
            id: 'seele-stat-crit-dmg',
            name: '会心ダメージ',
            type: 'Stat Bonus',
            description: '会心ダメージ+24.0%',
            stat: 'crit_dmg' as StatKey,
            value: 0.24
        },
        {
            id: 'seele-stat-atk',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct' as StatKey,
            value: 0.28
        },
        {
            id: 'seele-stat-def',
            name: '防御力',
            type: 'Stat Bonus',
            description: '防御力+12.5%',
            stat: 'def_pct' as StatKey,
            value: 0.125
        }
    ],

    eidolons: {
        e1: { level: 1, name: '斬尽', description: '残りHPが80%以下の敵にダメージを与える時、会心率+15%。' },
        e2: { level: 2, name: '蝶舞', description: '戦闘スキルの加速効果が累積できるようになる、最大で2層累積できる。' },
        e3: { level: 3, name: '繚乱', description: '戦闘スキルのLv.+2、天賦のLv.+2' },
        e4: { level: 4, name: '掠影', description: 'ゼーレが敵を倒した時、EPを15回復する。' },
        e5: { level: 5, name: '鋒鋭', description: '必殺技のLv.+2、通常攻撃のLv.+1' },
        e6: { level: 6, name: '離析', description: '必殺技を発動した後、敵を「乱れ蝶」状態にする。' },
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'in-the-night',
        superimposition: 1,
        relicSetId: 'genius_of_brilliant_stars',
        ornamentSetId: 'firmament_frontline_glamoth',
        mainStats: {
            body: 'crit_dmg',
            feet: 'atk_pct', // Commonly played with ATK boots if she has standard Speed + Skill Speed
            sphere: 'quantum_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.10 },
            { stat: 'crit_dmg', value: 0.50 },
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'spd', value: 5 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    },
};

// --- Helper Functions ---

/**
 * Creates the "Buffed State" effect.
 * Granting +XY% Dmg Boost.
 * Supports A4 (Penetration).
 */
function createBuffedStateEffect(
    sourceId: string,
    eidolonLevel: number,
    hasA4: boolean,
    isExtraTurn: boolean
): IEffect {
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const dmgBoost = getLeveledValue(ABILITY_VALUES.talentDmgBoost, talentLevel);

    const modifiers: { target: StatKey; value: number; type: 'add' | 'pct'; source: string }[] = [{
        source: '増幅状態',
        target: 'all_type_dmg_boost',
        type: 'add',
        value: dmgBoost
    }];

    if (hasA4) {
        modifiers.push({
            source: '斬裂',
            target: 'quantum_res_pen',
            type: 'add',
            value: 0.20
        });
    }

    return {
        id: EFFECT_IDS.BUFFED_STATE(sourceId),
        name: '増幅状態',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: 1,
        modifiers: modifiers,
        skipFirstTurnDecrement: true, // Persist through the end of the current turn (trigger turn), used in next turn (standard or resurgence)


    };
}

/**
 * Creates/Refreshes the Skill Speed Boost.
 * Handles E2 Stacking.
 */
function applySkillSpeedBoost(state: GameState, sourceId: string, eidolonLevel: number): GameState {
    const isE2 = eidolonLevel >= 2;
    const maxStacks = isE2 ? 2 : 1;

    // Check existing stacks - Removed manual lookup as EffectManager handles stacking if maxStacks is provided.

    const effect: IEffect = {
        id: EFFECT_IDS.SKILL_SPD_BOOST(sourceId),
        name: '加速',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: SKILL_SPD_DURATION,
        skipFirstTurnDecrement: true,
        stackCount: 1, // Start with 1 stack; Manager will increment if duplicate exists
        maxStacks: maxStacks, // Critical for EffectManager to allow stacking
        modifiers: [{
            source: '還刃',
            target: 'spd_pct',
            type: 'add',
            value: SKILL_SPD_BOOST_PCT // StatBuilder multiplies by stack count automatically
        }],

        /* remove removed */
    };

    return addEffect(state, sourceId, effect);
}

/**
 * Updates A2 Aggro Buff based on current HP ratio.
 */
function updateA2AggroState(state: GameState, sourceId: string): GameState {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return state;

    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_NIGHTSHADE);
    if (!hasA2) return state;

    const hpRatio = unit.hp / unit.stats.hp;
    const existingBuff = unit.effects.find(e => e.id === EFFECT_IDS.A2_AGGRO_DOWN(sourceId));

    if (hpRatio <= 0.50) {
        if (!existingBuff) {
            // Apply Buff
            const aggroEffect: IEffect = {
                id: EFFECT_IDS.A2_AGGRO_DOWN(sourceId),
                name: '夜行 (Aggro Down)',
                category: 'BUFF',
                sourceUnitId: sourceId,
                durationType: 'PERMANENT', // Persists while condition matches
                duration: -1,
                modifiers: [{
                    source: '夜行',
                    target: 'aggro', // assuming aggro is available as simplified statkey or handled by system
                    type: 'pct',
                    value: -0.50 // Aggro drop
                }],

                /* remove removed */
            };
            return addEffect(state, sourceId, aggroEffect);
        }
    } else {
        // Remove Buff if exists
        if (existingBuff) {
            return removeEffect(state, sourceId, existingBuff.id);
        }
    }
    return state;
}

// --- Handlers ---

const onBattleStart: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `seele-battle-start-${sourceUnitId}`,
            subscribesTo: ['ON_BATTLE_START'],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            if (event.type !== 'ON_BATTLE_START') return state;

            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            // Initialize A2 Check
            let newState = updateA2AggroState(state, sourceUnitId);

            // Technique Logic
            const useTechnique = unit.config?.useTechnique !== false;

            if (useTechnique) {
                const eidolonLevel = unit.eidolonLevel || 0;
                const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_LACERATE) ?? false;
                // Grant Buffed State
                const buff = createBuffedStateEffect(sourceUnitId, eidolonLevel, hasA4, false);
                newState = addEffect(newState, sourceUnitId, buff);
            }

            return newState;
        }
    };
};

const onActionHandlers: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `seele-action-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_BASIC_ATTACK',
                'ON_ENEMY_DEFEATED',
                'ON_ACTION_COMPLETE',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_HP_CONSUMED', 'ON_UNIT_HEALED', // For A2
                'ON_UNIT_DEATH'
            ],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const eidolonLevel = param || 0;
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            let newState = state;

            // --- A2 Monitor ---
            if ((event.type === 'ON_HP_CONSUMED' && event.targetId === sourceUnitId) ||
                (event.type === 'ON_UNIT_HEALED' && event.targetId === sourceUnitId)) {
                newState = updateA2AggroState(newState, sourceUnitId);
            }

            // --- E6 Butterfly Cleanup on Seele Death ---
            if (event.type === 'ON_UNIT_DEATH' && event.targetId === sourceUnitId) {
                if (eidolonLevel >= 6) {
                    newState.registry.forEach(u => {
                        if (u.isEnemy) {
                            const bfly = u.effects.find(e => e.id.startsWith(`seele-ult-butterfly-${sourceUnitId}`));
                            if (bfly) {
                                newState = removeEffect(newState, u.id, bfly.id);
                            }
                        }
                    });
                }
            }

            // --- Skill Used ---
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                // Apply Speed Boost
                newState = applySkillSpeedBoost(newState, sourceUnitId, eidolonLevel);
            }

            // --- Ultimate Used ---
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                // Enter Buffed State
                const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_LACERATE) ?? false;
                const buff = createBuffedStateEffect(sourceUnitId, eidolonLevel, hasA4, false);
                newState = addEffect(newState, sourceUnitId, buff);

                // E6: Apply Butterfly Flurry to Target
                if (eidolonLevel >= 6 && event.targetId) {
                    const butterflyEffect: IEffect = {
                        id: EFFECT_IDS.ULT_BUTTERFLY(sourceUnitId, event.targetId),
                        name: '乱れ蝶',
                        category: 'DEBUFF', // It's a debuff on enemy
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_END_BASED',
                        duration: 1,
                        skipFirstTurnDecrement: true, // Lasts 1 turn.
                        modifiers: [], // Logic handled separately

                        /* remove removed */
                    };
                    newState = addEffect(newState, event.targetId, butterflyEffect);
                }
            }

            // --- E1: Crit Rate Condition ---
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceUnitId) {
                if (eidolonLevel >= 1 && event.targetId) {
                    const target = newState.registry.get(createUnitId(event.targetId));
                    if (target) {
                        const hpRatio = target.hp / target.stats.hp;
                        if (hpRatio <= 0.80) {
                            // Add crit rate modifier
                            newState = {
                                ...newState,
                                damageModifiers: {
                                    ...newState.damageModifiers,
                                    critRate: (newState.damageModifiers.critRate || 0) + 0.15
                                }
                            };
                        }
                    }
                }
            }

            // --- A6: Advance Action after Basic ---
            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6_RIPPLES);
                if (hasA6) {
                    newState = advanceAction(newState, sourceUnitId, 0.20, 'percent');
                }
            }

            // --- Resurgence & E4 Logic ---
            if (event.type === 'ON_ENEMY_DEFEATED' && (event as any).targetId) {
                if (event.sourceId === sourceUnitId) {
                    // E4: Recover EP
                    if (eidolonLevel >= 4) {
                        const epEvent = { sourceId: sourceUnitId, publishEventFn: publishEvent };
                        newState = addEnergyToUnit(newState, sourceUnitId, E4_EP_RESTORE, 0, false, epEvent);
                    }

                    // Resurgence Trigger
                    const isResurgence = unit.effects.some(e => e.id === EFFECT_IDS.RESURGENCE_INDICATOR(sourceUnitId));
                    if (!isResurgence) {
                        // Resurgence Condition:
                        // 1. Killer is Seele
                        // 2. Action Type is Basic, Skill, or Ultimate
                        // 3. Executor is Seele (Not ally triggering E6)

                        const actionLog = state.currentActionLog;
                        const validActionTypes = ['BASIC_ATTACK', 'SKILL', 'ULTIMATE', 'ENHANCED_BASIC_ATTACK'];

                        // Check if valid trigger
                        // Note: actionLog might be undefined in edge cases (e.g. death by pure event).
                        // If log exists, we enforce the check.

                        let isValidTrigger = false;
                        if (actionLog && actionLog.primarySourceId === sourceUnitId) {
                            if (validActionTypes.includes(actionLog.primaryActionType)) {
                                isValidTrigger = true;
                            }
                        }

                        if (isValidTrigger) {
                            // Activate Resurgence

                            // 1. Enter Buffed State
                            const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_LACERATE) ?? false;
                            const buff = createBuffedStateEffect(sourceUnitId, eidolonLevel, hasA4, true);
                            newState = addEffect(newState, sourceUnitId, buff);

                            // 2. Extra Turn Logic
                            newState = advanceAction(newState, sourceUnitId, 1.0, 'percent'); // 100% AA

                            // 3. Mark as Resurgence
                            const resurgenceMarker: IEffect = {
                                id: EFFECT_IDS.RESURGENCE_INDICATOR(sourceUnitId),
                                name: '再現 (Resurgence)',
                                category: 'STATUS',
                                sourceUnitId: sourceUnitId,
                                durationType: 'TURN_END_BASED',
                                duration: 1, // Will be removed manually anyway

                                /* remove removed */
                            };
                            newState = addEffect(newState, sourceUnitId, resurgenceMarker);

                            // Log
                            newState = {
                                ...newState,
                                log: [...newState.log, {
                                    characterName: unit.name,
                                    actionTime: newState.time,
                                    actionType: '天賦',
                                    details: '再現発動 (追加ターン)',
                                    skillPointsAfterAction: newState.skillPoints,
                                    damageDealt: 0, healingDone: 0, shieldApplied: 0, currentEp: unit.ep
                                }]
                            };
                        }
                    }
                }
            }

            // --- Clean Up Resurgence / Buffer logic after Action ---
            if (event.type === 'ON_ACTION_COMPLETE' && event.sourceId === sourceUnitId) {
                // Check if we just finished a Resurgence turn
                const resurgenceMarker = unit.effects.find(e => e.id === EFFECT_IDS.RESURGENCE_INDICATOR(sourceUnitId));
                if (resurgenceMarker) {
                    // Manually Extend Buffs to prevent decrement in upcoming TurnEnd
                    const updatedEffects = unit.effects.map(e => {
                        if (e.durationType === 'TURN_END_BASED') {
                            return { ...e, duration: e.duration + 1 };
                        }
                        return e;
                    });

                    // Update registry
                    newState = {
                        ...newState,
                        registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                            ...u,
                            effects: updatedEffects
                        }))
                    };

                    // Remove Marker
                    newState = removeEffect(newState, sourceUnitId, resurgenceMarker.id);
                }
            }

            return newState;
        }
    };
};

const onE6AdditionalDmgHandler: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `seele-e6-butterfly-${sourceUnitId}`,
            subscribesTo: ['ON_ATTACK'],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            if (event.type !== 'ON_ATTACK') return state; // Type Check

            // Check if target has Butterfly usage
            if (!event.targetId) return state;
            const target = state.registry.get(createUnitId(event.targetId));
            if (!target) return state;

            const butterflyDebuff = target.effects.find(e => e.id.startsWith(`seele-ult-butterfly-`));
            if (!butterflyDebuff) return state;

            const seeleId = butterflyDebuff.sourceUnitId;
            const seele = state.registry.get(createUnitId(seeleId));
            if (!seele) return state;
            if (seele.hp <= 0) return state;

            const eidolonLevel = seele.eidolonLevel || 0;
            const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate'); // Standard Ult Level Max = 10 (trace) + 2 (eidolon) = 12? Assuming 10 for base.
            const ultMult = getLeveledValue(ABILITY_VALUES.ultMult, ultLevel);
            const dmgMult = ultMult * E6_DMG_PERCENT;

            const e6Ability: IAbility = {
                id: 'seele-e6-proc',
                name: '乱れ蝶・付加ダメージ',
                type: 'Talent',
                description: '乱れ蝶・付加ダメージ',
                damage: {
                    type: 'simple',
                    scaling: 'atk', // Seele's ATK
                    hits: [{ multiplier: dmgMult, toughnessReduction: 0 }]
                }
            };

            // We use standard action context "Action" object.
            const mockAction: any = { type: 'ULTIMATE', sourceId: seeleId, targetId: target.id };

            const dmgResult = calculateDamageWithCritInfo(
                seele,
                target,
                e6Ability,
                mockAction as any
            );

            const applyResult = applyUnifiedDamage(
                state, // Use current state (which is 'state' passed to handler)
                seele,
                target,
                dmgResult.damage,
                {
                    damageType: 'ADDITIONAL_DAMAGE',
                    details: '乱れ蝶・付加ダメージ',
                    isCrit: dmgResult.isCrit,
                    breakdownMultipliers: dmgResult.breakdownMultipliers,
                    skipLog: true,
                    additionalDamageEntry: {
                        source: seele.name,
                        name: '乱れ蝶・付加ダメージ',
                        damageType: 'additional',
                        isCrit: dmgResult.isCrit,
                        breakdownMultipliers: dmgResult.breakdownMultipliers
                    }
                }
            );

            let newState = applyResult.state;

            return newState;
        }
    };
};

export const seeleHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, param) => {
    // Combine handlers
    const battleStart = onBattleStart(sourceUnitId, level, param);
    const action = onActionHandlers(sourceUnitId, level, param);
    const e6 = onE6AdditionalDmgHandler(sourceUnitId, level, param);

    return {
        handlerMetadata: {
            id: `seele-handler-${sourceUnitId}`,
            subscribesTo: [
                ...battleStart.handlerMetadata.subscribesTo,
                ...action.handlerMetadata.subscribesTo,
                ...e6.handlerMetadata.subscribesTo,
            ]
        },
        handlerLogic: (event, state, handlerId) => {
            let newState = state;
            newState = battleStart.handlerLogic(event, newState, handlerId);
            newState = action.handlerLogic(event, newState, handlerId);

            if ((param || 0) >= 6) {
                newState = e6.handlerLogic(event, newState, handlerId);
            }
            return newState;
        }
    }
};
