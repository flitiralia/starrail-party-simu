import { IEventHandlerFactory, GameState, IEvent, Unit } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { calculateHeal } from '../../simulator/damage';
import { StatKey } from '../../types/stats';
import { applyHealing, cleanse, applyShield } from '../../simulator/engine/utils';

// Constants
const ABYSS_FLOWER_STACK_ID = 'luocha-abyss-flower-stack';
const FIELD_BUFF_ID = 'luocha-field-buff';
const AUTO_SKILL_COOLDOWN_ID = 'luocha-auto-skill-cooldown';

// Helper: Apply Luocha's Skill Effect (Shared by Manual and Auto)
function applyLuochaSkill(state: GameState, source: Unit, target: Unit): GameState {
    let newState = state;

    // 1. Calculate Heal
    // E2: Skill healing +30% if target HP < 50%
    let healBoost = 0;
    if (source.eidolonLevel! >= 2 && (target.hp / target.stats.hp) < 0.5) {
        healBoost = 0.30;
    }

    let effectiveSource = source;
    if (healBoost > 0) {
        effectiveSource = {
            ...source,
            stats: {
                ...source.stats,
                outgoing_healing_boost: (source.stats.outgoing_healing_boost || 0) + healBoost
            }
        };
    }

    // E5: Skill healing 60%+800 -> 64%+890
    const skillMultiplier = source.eidolonLevel! >= 5 ? 0.64 : 0.60;
    const skillFlat = source.eidolonLevel! >= 5 ? 890 : 800;

    const finalHeal = calculateHeal(effectiveSource, target, {
        scaling: 'atk',
        multiplier: skillMultiplier,
        flat: skillFlat
    });

    // Apply Heal (Skip log)
    newState = applyHealing(newState, source.id, target.id, finalHeal, 'Luocha Skill Heal', true);

    // 2. E2 Shield (if HP >= 50% BEFORE healing)
    // Fetch fresh target from newState (after healing)
    const freshTarget = newState.units.find(u => u.id === target.id)!;
    let appliedShieldValue = 0;

    if (source.eidolonLevel! >= 2 && (target.hp / target.stats.hp) >= 0.5) {
        const shieldValue = source.stats.atk * 0.18 + 240;
        appliedShieldValue = shieldValue;

        // Apply Shield using utility function (Skip log, as we unify it later)
        newState = applyShield(
            newState,
            source.id,
            target.id,
            shieldValue,
            2,
            'TURN_START_BASED',
            'Luocha E2 Shield',
            `luocha-e2-shield`,
            true
        );
    }

    // 3. Cleanse (Trace A2)
    newState = cleanse(newState, target.id, 1);

    // 4. Add Stack (if Field not active)
    newState = addAbyssFlowerStack(newState, source.id);

    // Unified Log
    newState = {
        ...newState,
        log: [...newState.log, {
            actionType: 'Skill',
            sourceId: source.id,
            targetId: target.id,
            healingDone: finalHeal,
            shieldApplied: appliedShieldValue > 0 ? appliedShieldValue : undefined,
            details: appliedShieldValue > 0 ? 'Luocha Skill (Heal + E2 Shield)' : 'Luocha Skill (Heal)'
        }]
    };

    return newState;
}

// Helper: Add Abyss Flower Stack
function addAbyssFlowerStack(state: GameState, sourceId: string): GameState {
    const source = state.units.find(u => u.id === sourceId);
    if (!source) return state;

    // Check if Field is active
    const fieldActive = source.effects.some(e => e.id === FIELD_BUFF_ID);
    if (fieldActive) return state; // Do not add stack if field is active

    // Find existing stack
    const stackEffect = source.effects.find(e => e.id === ABYSS_FLOWER_STACK_ID);
    let currentStacks = stackEffect ? (stackEffect.stackCount || 0) : 0;

    currentStacks++;

    if (currentStacks >= 2) {
        // Deploy Field
        if (stackEffect) {
            state = removeEffect(state, sourceId, ABYSS_FLOWER_STACK_ID);
        }
        state = deployField(state, sourceId);
    } else {
        // Update stack effect
        if (stackEffect) {
            state = {
                ...state,
                units: state.units.map(u => {
                    if (u.id === sourceId) {
                        return {
                            ...u,
                            effects: u.effects.map(e => e.id === ABYSS_FLOWER_STACK_ID ? { ...e, stackCount: currentStacks } : e)
                        };
                    }
                    return u;
                })
            };
        } else {
            // Create new stack effect
            const newStackEffect: IEffect = {
                id: ABYSS_FLOWER_STACK_ID,
                name: '白花の刻',
                category: 'STATUS',
                sourceUnitId: sourceId,
                durationType: 'PERMANENT',
                duration: -1,
                stackCount: currentStacks,
                apply: (t, s) => s,
                remove: (t, s) => s,
            };
            state = addEffect(state, sourceId, newStackEffect);
        }
    }
    return state;
}

// Helper: Deploy Field
function deployField(state: GameState, sourceId: string): GameState {
    const source = state.units.find(u => u.id === sourceId);
    if (!source) return state;

    const fieldEffect: IEffect = {
        id: FIELD_BUFF_ID,
        name: '白花の刻 (結界)',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: 2,
        tags: ['LUOCHA_FIELD'],
        onApply: (target, state) => {
            let newState = state;

            // E1: ATK +20% for all allies
            if (source.eidolonLevel! >= 1) {
                state.units.forEach(u => {
                    if (!u.isEnemy && u.hp > 0) {
                        const e1Buff: IEffect = {
                            id: `luocha-e1-atk-buff-${sourceId}-${u.id}`,
                            name: 'Luocha E1 ATK+20%',
                            category: 'BUFF',
                            sourceUnitId: sourceId,
                            durationType: 'PERMANENT',
                            duration: 0,
                            onApply: (t, s) => {
                                const newModifiers = [...t.modifiers, {
                                    source: 'Luocha E1',
                                    target: 'atk_pct' as StatKey,
                                    type: 'add' as const,
                                    value: 0.20
                                }];
                                return { ...s, units: s.units.map(unit => unit.id === t.id ? { ...unit, modifiers: newModifiers } : unit) };
                            },
                            onRemove: (t, s) => {
                                const newModifiers = t.modifiers.filter(m => m.source !== 'Luocha E1');
                                return { ...s, units: s.units.map(unit => unit.id === t.id ? { ...unit, modifiers: newModifiers } : unit) };
                            },
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };
                        newState = addEffect(newState, u.id, e1Buff);
                    }
                });
            }

            // E4: DMG Dealt -12% for all enemies (Debuff)
            if (source.eidolonLevel! >= 4) {
                state.units.forEach(u => {
                    if (u.isEnemy && u.hp > 0) {
                        const e4Debuff: IEffect = {
                            id: `luocha-e4-dmg-reduction-${sourceId}-${u.id}`,
                            name: 'Luocha E4 DMG Dealt -12%',
                            category: 'DEBUFF',
                            sourceUnitId: sourceId,
                            durationType: 'PERMANENT',
                            duration: 0,
                            onApply: (t, s) => {
                                const newModifiers = [...t.modifiers, {
                                    source: 'Luocha E4',
                                    target: 'all_dmg_dealt_reduction' as StatKey,
                                    type: 'add' as const,
                                    value: 0.12 // 12% reduction
                                }];
                                return { ...s, units: s.units.map(unit => unit.id === t.id ? { ...unit, modifiers: newModifiers } : unit) };
                            },
                            onRemove: (t, s) => {
                                const newModifiers = t.modifiers.filter(m => m.source !== 'Luocha E4');
                                return { ...s, units: s.units.map(unit => unit.id === t.id ? { ...unit, modifiers: newModifiers } : unit) };
                            },
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };
                        newState = addEffect(newState, u.id, e4Debuff);
                    }
                });
            }

            return newState;
        },
        onRemove: (target, state) => {
            let newState = state;

            // Remove E1 buffs from all allies
            if (source.eidolonLevel! >= 1) {
                state.units.forEach(u => {
                    if (!u.isEnemy) {
                        newState = removeEffect(newState, u.id, `luocha-e1-atk-buff-${sourceId}-${u.id}`);
                    }
                });
            }

            // Remove E4 debuffs from all enemies
            if (source.eidolonLevel! >= 4) {
                state.units.forEach(u => {
                    if (u.isEnemy) {
                        newState = removeEffect(newState, u.id, `luocha-e4-dmg-reduction-${sourceId}-${u.id}`);
                    }
                });
            }

            return newState;
        },
        apply: (t, s) => s,
        remove: (t, s) => s,
    };

    return addEffect(state, sourceId, fieldEffect);
}


export const luochaHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, eidolonLevel = 0) => {
    return {
        handlerMetadata: {
            id: `luocha-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_ULTIMATE_USED',
                // 'ON_ATTACK', // Removed: Not a valid event type. Merged into ON_DAMAGE_DEALT
                'ON_DAMAGE_DEALT', // For Auto Skill AND Field Heal
                'ON_TURN_START', // For Auto Skill check on CD reset
            ]
        },
        handlerLogic: (event, state, handlerId) => {
            const source = state.units.find(u => u.id === sourceUnitId);
            if (!source) return state;

            // --- Auto Skill Logic ---
            if (event.type === 'ON_DAMAGE_DEALT' || event.type === 'ON_TURN_START') {
                // Check Cooldown
                const onCooldown = source.effects.some(e => e.id === AUTO_SKILL_COOLDOWN_ID);
                if (!onCooldown) {
                    // Check for ally with HP <= 50%
                    const lowHpAlly = state.units.find(u => !u.isEnemy && u.hp > 0 && (u.hp / u.stats.hp) <= 0.5);
                    if (lowHpAlly) {
                        // Trigger Auto Skill
                        state = applyLuochaSkill(state, source, lowHpAlly);

                        // Set Cooldown
                        const cooldownEffect: IEffect = {
                            id: AUTO_SKILL_COOLDOWN_ID,
                            name: 'Auto Skill Cooldown',
                            category: 'DEBUFF', // Internal status
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            duration: 2,
                            apply: (t, s) => s,
                            remove: (t, s) => s,
                        };
                        state = addEffect(state, sourceUnitId, cooldownEffect);

                        // Log
                        state = {
                            ...state,
                            log: [...state.log, {
                                actionType: 'AutoSkill',
                                sourceId: sourceUnitId,
                                targetId: lowHpAlly.id,
                                details: 'Luocha Auto Skill Triggered'
                            }]
                        };
                    }
                }
            }

            // --- Battle Start (Technique) ---
            if (event.type === 'ON_BATTLE_START') {
                // 秘技: 戦闘開始時、天賦の結界を即座に発動する
                state = deployField(state, sourceUnitId);

                // Log Technique Activation
                state.log.push({
                    characterName: source.name,
                    actionTime: state.time,
                    actionType: 'Technique',
                    skillPointsAfterAction: state.skillPoints,
                    damageDealt: 0,
                    healingDone: 0,
                    shieldApplied: 0,
                    sourceHpState: `${source.hp.toFixed(0)}/${source.stats.hp.toFixed(0)}`,
                    targetHpState: '',
                    targetToughness: '',
                    currentEp: source.ep,
                    activeEffects: [],
                    details: '秘技: 結界を展開'
                } as any);
            }

            // --- Skill Used ---
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                // Manual Skill Logic
                if (event.targetId) {
                    const target = state.units.find(u => u.id === event.targetId);
                    if (target) {
                        state = applyLuochaSkill(state, source, target);
                    }
                }
            }

            // --- Ultimate Used ---
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                // Stack Add
                state = addAbyssFlowerStack(state, sourceUnitId);

                // E6: Res Down (Fixed Chance)
                if (source.eidolonLevel! >= 6) {
                    // Note: E6 では全属性耐性ダウンを付与するが、'all_res' というステータスキーは存在しない
                    // 各属性の耐性を個別に減算する必要がある
                    // または、damage.ts で all_res を個別に展開する処理が必要
                    // 今回は simplify のため、modifiers で各属性耐性を減らす実装とする
                    const resElements: StatKey[] = [
                        'physical_res', 'fire_res', 'ice_res', 'lightning_res', 'wind_res', 'quantum_res', 'imaginary_res'
                    ];

                    state.units.filter(u => u.isEnemy && u.hp > 0).forEach(enemy => {
                        const resDownEffect: IEffect = {
                            id: `luocha-e6-res-down-${enemy.id}-${Date.now()}`,
                            name: 'Res Down (E6)',
                            category: 'DEBUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            duration: 2,
                            ignoreResistance: true, // ★ 固定確率（効果命中と効果抵抗を無視）
                            modifiers: resElements.map(key => ({
                                target: key,
                                type: 'add' as const,
                                value: -0.20,
                                source: 'Luocha E6'
                            })),
                            apply: (t, s) => s,
                            remove: (t, s) => s,
                        };
                        state = addEffect(state, enemy.id, resDownEffect);
                    });
                }
            }

            // --- Field Logic (On Attack -> On Damage Dealt) ---
            // Note: Using ON_DAMAGE_DEALT to cover "all attacks". 
            // This might trigger multiple times for multi-hit attacks depending on dispatcher implementation.
            // Ideally should check for "Action End" or ensure once per action.
            if (event.type === 'ON_DAMAGE_DEALT' && !state.units.find(u => u.id === event.sourceId)?.isEnemy) {
                // Ally attacked
                const fieldActive = source.effects.some(e => e.id === FIELD_BUFF_ID);
                if (fieldActive) {
                    const attacker = state.units.find(u => u.id === event.sourceId)!;

                    // Heal Attacker
                    // E5: Talent (Field) healing 18.0%+240 -> 19.2%+267
                    const fieldMultiplier = source.eidolonLevel! >= 5 ? 0.192 : 0.18;
                    const fieldFlat = source.eidolonLevel! >= 5 ? 267 : 240;

                    const healAmount = calculateHeal(source, attacker, {
                        scaling: 'atk',
                        multiplier: fieldMultiplier,
                        flat: fieldFlat
                    });

                    state = {
                        ...state,
                        units: state.units.map(u => {
                            if (u.id === attacker.id) {
                                return { ...u, hp: Math.min(u.stats.hp, u.hp + healAmount) };
                            }
                            return u;
                        }),
                        log: [...state.log, {
                            actionType: 'Heal',
                            sourceId: sourceUnitId,
                            targetId: attacker.id,
                            healingDone: healAmount,
                            details: 'Luocha Field Heal'
                        }]
                    };

                    // Trace A4: Heal all other allies
                    const a4HealAmount = calculateHeal(source, attacker, {
                        scaling: 'atk',
                        multiplier: 0.07,
                        flat: 93
                    });

                    state = {
                        ...state,
                        units: state.units.map(u => {
                            if (!u.isEnemy && u.id !== attacker.id && u.hp > 0) {
                                return { ...u, hp: Math.min(u.stats.hp, u.hp + a4HealAmount) };
                            }
                            return u;
                        })
                    };
                }
            }

            return state;
        }
    };
};
