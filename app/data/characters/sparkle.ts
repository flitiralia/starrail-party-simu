import { Character, StatKey, IAbility, Element } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, GeneralEvent } from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { advanceAction } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { addSkillPoints } from '../../simulator/effect/relicEffectHelpers';

// --- Constants ---
const CHARACTER_ID = 'sparkle';

const EFFECT_IDS = {
    SKILL_CDMG_BOOST: (sourceId: string) => `sparkle-skill-cdmg-${sourceId}`,
    CIPHER_BUFF: (sourceId: string) => `sparkle-cipher-${sourceId}`,
    TALENT_DMG_BOOST: (sourceId: string) => `sparkle-talent-dmg-${sourceId}`,
    TECHNIQUE_STEALTH: (sourceId: string) => `sparkle-technique-stealth-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2_ALMANAC: 'sparkle-trace-a2',
    A4_ARTIFICIAL_FLOWER: 'sparkle-trace-a4',
    A6_NOCTURNE: 'sparkle-trace-a6',
} as const;

// --- Ability Values ---
const ABILITY_VALUES = {
    basicMult: { 6: 1.00, 7: 1.10 } as Record<number, number>,
    skillCdmBase: { 10: 0.45, 12: 0.486 } as Record<number, number>,
    skillCdmRatio: { 10: 0.24, 12: 0.264 } as Record<number, number>,
    ultCipherBoost: { 10: 0.10, 12: 0.108 } as Record<number, number>, // Per stack contribution
    talentDmgBase: { 10: 0.06, 12: 0.066 } as Record<number, number>,
};

// --- Base Stats ---
const BASIC_EP = 20;
const BASIC_EP_A2_BONUS = 10;
const SKILL_EP = 30;
const ULT_EP = 5;
const ULT_SP_RECOVERY = 4;
const ULT_SP_RECOVERY_E4 = 5;

// --- Helper Functions ---


/**
 * Creates the Skill CDMG Buff
 */
function createSkillBuff(
    sourceId: string,
    sourceUnit: Unit,
    targetId: string,
    skillLevel: number,
    hasA4: boolean,
    eidolonLevel: number
): IEffect {
    const baseCdm = getLeveledValue(ABILITY_VALUES.skillCdmBase, skillLevel);
    const ratioCdm = getLeveledValue(ABILITY_VALUES.skillCdmRatio, skillLevel);

    // E6 Boost
    const e6RatioBoost = eidolonLevel >= 6 ? 0.30 : 0;

    const sourceCdmg = sourceUnit.stats.crit_dmg ?? 0;
    const buffValue = baseCdm + (sourceCdmg * (ratioCdm + e6RatioBoost));

    // A4: Lasts until start of next turn. 
    // We simulate this by using TURN_START_BASED with duration 2.
    // 1st tick: Current turn start (or immediate if mid-turn, effectively consuming 1 tick at the next start)
    // 2nd tick: Next turn start.
    // If hasA4 is false (unlikely at lvl 80 usage but possible), lasts 1 turn (TURN_END_BASED).

    return {
        id: EFFECT_IDS.SKILL_CDMG_BOOST(sourceId), // Unique per source, but only 1 active usually. Spec implies overwrite or refresh.
        name: '夢を泳ぐ魚',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: hasA4 ? 'TURN_START_BASED' : 'TURN_END_BASED',
        duration: hasA4 ? 2 : 1,
        skipFirstTurnDecrement: true, // For TURN_END typical usage. For TURN_START, ensures it survives the immediate current turn start if applicable.
        modifiers: [{
            source: '夢を泳ぐ魚',
            target: 'crit_dmg',
            type: 'add',
            value: buffValue
        }],
        apply: (t, s) => s,
        remove: (t, s) => s
    };
}

/**
 * Creates the Cipher Buff from Ultimate
 */
function createCipherBuff(sourceId: string, eidolonLevel: number): IEffect {
    const duration = eidolonLevel >= 1 ? 3 : 2; // E1 increases duration by 1
    const modifiers: { target: StatKey; value: number; type: 'add' | 'pct'; source: string }[] = [];

    if (eidolonLevel >= 1) {
        modifiers.push({
            source: '捨て置かれた疑念 (E1)',
            target: 'atk_pct',
            type: 'add',
            value: 0.40
        });
    }

    return {
        id: EFFECT_IDS.CIPHER_BUFF(sourceId),
        name: '奇怪な謎',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED', // Spec says "2 turns". Usually TURN_BASED (start or end). Let's use TURN_START to match typical "lasts for X turns" flow.
        duration: duration,
        modifiers: modifiers,
        // Cipher logic for dmg boost is handled in Talent's dynamic value, or we assume Talent checks for this buff.
        apply: (t, s) => s,
        remove: (t, s) => s
    };
}

/**
 * Creates/Updates the Talent DMG Boost Buff
 * Max 3 stacks.
 */
function updateTalentBuff(state: GameState, sourceId: string, eidolonLevel: number, stacksToAdd: number = 1): GameState {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return state;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const baseBoost = getLeveledValue(ABILITY_VALUES.talentDmgBase, talentLevel);

    // Apply to ALL allies
    let newState = state;

    state.registry.forEach(ally => {
        if (ally.isEnemy) return;

        // Find existing buff
        const existing = ally.effects.find(e => e.id === EFFECT_IDS.TALENT_DMG_BOOST(sourceId));
        const currentStacks = existing ? (existing.stackCount || 0) : 0;
        const newStacks = Math.min(currentStacks + stacksToAdd, 3);

        // Check for Cipher on this ally
        const hasCipher = ally.effects.some(e => e.id === EFFECT_IDS.CIPHER_BUFF(sourceId));

        // Calculate Boost Value
        // Base: X% per stack
        // With Cipher: X% + CipherBoost% per stack?
        // Spec: "Cipher... Talent's DMG Boost contribution increases by X% per stack"
        // Leveled Cipher Boost: 10% (Lv10)
        // Wait, spec says: "Talent's DMG Boost effect increases by X% *per stack*"?
        // Text: "Each stack of Talent's DMG Boost effect increases by X%."
        // So total boost = (Base + (Cipher ? CipherValue : 0)) * Stacks.

        const cipherBoost = hasCipher ? getLeveledValue(ABILITY_VALUES.ultCipherBoost, calculateAbilityLevel(eidolonLevel, 5, 'Ultimate')) : 0;
        const perStackValue = baseBoost + cipherBoost;
        const totalValue = perStackValue * newStacks;

        const effect: IEffect = {
            id: EFFECT_IDS.TALENT_DMG_BOOST(sourceId),
            name: '叙述トリック',
            category: 'BUFF',
            sourceUnitId: sourceId,
            durationType: 'TURN_END_BASED',
            duration: 2,
            stackCount: newStacks,
            maxStacks: 3,
            skipFirstTurnDecrement: true, // Refresh duration
            modifiers: [{
                source: '叙述トリック',
                target: 'all_type_dmg_boost',
                type: 'add',
                value: totalValue
            }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };

        // E2: Ignore Defense
        if (eidolonLevel >= 2) {
            effect.modifiers!.push({
                source: '謂れなき虚構 (E2)',
                target: 'def_ignore',
                type: 'add',
                value: 0.08 * newStacks // 8% per stack
            });
        }

        // Valid workaround for effectManager's auto-increment logic:
        // Remove existing effect first so we can set the exact calculated stack count.
        newState = removeEffect(newState, ally.id, EFFECT_IDS.TALENT_DMG_BOOST(sourceId));
        newState = addEffect(newState, ally.id, effect);
    });

    return newState;
}

// --- Handlers ---

const onBattleStart: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `sparkle-battle-start-${sourceUnitId}`,
            subscribesTo: ['ON_BATTLE_START'],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            if (event.type !== 'ON_BATTLE_START') return state;

            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            // Update Max SP
            // Base 5 + Talent 2 = 7.
            // E4 + 1 = 8.
            let maxSP = 7;
            const eidolonLevel = unit.eidolonLevel || 0;
            if (eidolonLevel >= 4) {
                maxSP = 8;
            }

            // Apply Max SP change
            state = { ...state, maxSkillPoints: maxSP };

            // Technique Logic
            const useTechnique = unit.config?.useTechnique !== false;
            if (useTechnique) {
                // Recover 3 SP (Use addSkillPoints helper which respects maxSP)
                return addSkillPoints(state, 3, sourceUnitId);
            }

            return state;
        }
    };
};

const onActionHandlers: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `sparkle-action-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_BASIC_ATTACK',
                'ON_SP_CONSUMED',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const eidolonLevel = param || 0;
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            let newState = state;

            // --- Basic ATK ---
            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                // A2: Extra Energy
                const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_ALMANAC);
                if (hasA2) {
                    const epEvent = { sourceId: sourceUnitId }; // Simplified event context
                    // 10 extra energy
                    newState = addEnergyToUnit(newState, sourceUnitId, BASIC_EP_A2_BONUS, 0, false, epEvent as any);
                }
            }

            // --- Skill Used ---
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                const targetId = event.targetId;
                if (targetId) {
                    const target = newState.registry.get(createUnitId(targetId));
                    if (target) {
                        const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_ARTIFICIAL_FLOWER) ?? false;
                        const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');

                        // Apply Buff
                        // E6: Apply to all allies with Cipher logic
                        // If E6, check if user has E6.
                        if (eidolonLevel >= 6) {
                            // Primary target always gets it
                            const buff = createSkillBuff(sourceUnitId, unit, targetId, skillLevel, hasA4, eidolonLevel);
                            newState = addEffect(newState, targetId, buff);

                            // Allies with Cipher also get it
                            newState.registry.forEach(u => {
                                if (u.id !== targetId && !u.isEnemy) {
                                    const hasCipher = u.effects.some(e => e.id === EFFECT_IDS.CIPHER_BUFF(sourceUnitId));
                                    if (hasCipher) {
                                        const spreadBuff = createSkillBuff(sourceUnitId, unit, u.id, skillLevel, hasA4, eidolonLevel);
                                        newState = addEffect(newState, u.id, spreadBuff);
                                    }
                                }
                            });
                        } else {
                            // Standard Single Target
                            const buff = createSkillBuff(sourceUnitId, unit, targetId, skillLevel, hasA4, eidolonLevel);
                            newState = addEffect(newState, targetId, buff);
                        }

                        // Action Advance 50% (If not self)
                        if (targetId !== sourceUnitId) {
                            newState = advanceAction(newState, targetId, 0.50, 'percent');
                        }
                    }
                }
            }

            // --- Ultimate Used ---
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                // Recover SP
                const spRecov = eidolonLevel >= 4 ? ULT_SP_RECOVERY_E4 : ULT_SP_RECOVERY;
                newState = addSkillPoints(newState, spRecov, sourceUnitId);

                // Apply Cipher to All Allies
                newState.registry.forEach(u => {
                    if (!u.isEnemy) {
                        const cipher = createCipherBuff(sourceUnitId, eidolonLevel);
                        newState = addEffect(newState, u.id, cipher);
                    }
                });

                // E6: Spread Skill Effect
                if (eidolonLevel >= 6) {
                    // Check if an ally has the skill buff
                    const skillBuffIdPrefix = EFFECT_IDS.SKILL_CDMG_BOOST(sourceUnitId);
                    let activeSkillBuff: IEffect | undefined;

                    // Find the buff instance to copy/recreate
                    // Iterate manually as .values() might not be available or typed
                    newState.registry.forEach((u) => {
                        if (!activeSkillBuff && !u.isEnemy) {
                            const buff = u.effects.find(e => e.id === skillBuffIdPrefix);
                            if (buff) {
                                activeSkillBuff = buff;
                            }
                        }
                    });

                    if (activeSkillBuff) {
                        const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_ARTIFICIAL_FLOWER) ?? false;
                        const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');

                        newState.registry.forEach(dest => {
                            if (!dest.isEnemy && !dest.effects.some(e => e.id === skillBuffIdPrefix)) {
                                // Apply if they have Cipher (which we just applied to everyone)
                                // So basically everyone gets it?
                                // "When Sparkle uses Ult... if a target has Skill Buff... spread to allies with Cipher"
                                // Since we just applied Cipher to everyone, everyone gets it.
                                const spreadBuff = createSkillBuff(sourceUnitId, unit, dest.id, skillLevel, hasA4, eidolonLevel);
                                newState = addEffect(newState, dest.id, spreadBuff);
                            }
                        });
                    }
                }
            }

            // --- Talent SP Consumption Monitor ---
            if (event.type === 'ON_SP_CONSUMED') {
                // Determine if source is an ally
                // The event payload has sourceId.
                const consumer = state.registry.get(createUnitId(event.sourceId));
                if (consumer && !consumer.isEnemy) {
                    const amount = event.value || 0;
                    if (amount > 0) {
                        newState = updateTalentBuff(newState, sourceUnitId, eidolonLevel, amount);
                    }
                }
            }

            return newState;
        }
    };
};

export const sparkle: Character = {
    id: CHARACTER_ID,
    name: '花火',
    path: 'Harmony',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 110,
    baseStats: {
        hp: 1397,
        atk: 523,
        def: 485,
        spd: 101,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100 // Harmony Standard
    },

    abilities: {
        basic: {
            id: 'sparkle-basic',
            name: '独り芝居',
            type: 'Basic ATK',
            description: '指定した敵単体に花火の攻撃力100%分の量子属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            },
            energyGain: BASIC_EP, // +10 from A2 handled in logic
            targetType: 'single_enemy',
        },
        skill: {
            id: 'sparkle-skill',
            name: '夢を泳ぐ魚',
            type: 'Skill',
            description: '指定した味方の会心ダメージをアップし、行動順を50%早める。',
            damage: undefined, // Pure Support
            energyGain: SKILL_EP,
            spCost: 1,
            targetType: 'ally',
        },
        ultimate: {
            id: 'sparkle-ultimate',
            name: '一人千役',
            type: 'Ultimate',
            description: 'SPを4回復し、味方全体に「奇怪な謎」を付与する。',
            damage: undefined,
            energyGain: ULT_EP,
            targetType: 'all_allies', // Self/Party
        },
        talent: {
            id: 'sparkle-talent',
            name: '叙述トリック',
            type: 'Talent',
            description: 'SP最大値増加。味方がSP消費時、与ダメージアップ。',
            energyGain: 0
        },
        technique: {
            id: 'sparkle-technique',
            name: '信用できない語り手',
            type: 'Technique',
            description: 'ステルス状態。戦闘開始時SP回復。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_ALMANAC,
            name: '歳時記',
            type: 'Bonus Ability',
            description: '通常攻撃EP回復+10。'
        },
        {
            id: TRACE_IDS.A4_ARTIFICIAL_FLOWER,
            name: '人造の花',
            type: 'Bonus Ability',
            description: 'スキル効果延長。'
        },
        {
            id: TRACE_IDS.A6_NOCTURNE,
            name: '夜想曲',
            type: 'Bonus Ability',
            description: '攻撃力アップ。量子キャラ数でさらにアップ。'
        },
        // Stat Bonuses (Simplified placeholders)
        { id: 'sparkle-stat-hp', name: 'HP', type: 'Stat Bonus', stat: 'hp_pct', value: 0.28, description: 'HP+28%' },
        { id: 'sparkle-stat-cdmg', name: 'Crit DMG', type: 'Stat Bonus', stat: 'crit_dmg', value: 0.24, description: 'CDMG+24%' },
        { id: 'sparkle-stat-res', name: 'Effect Res', type: 'Stat Bonus', stat: 'effect_res', value: 0.10, description: 'RES+10%' },
    ],

    eidolons: {
        e1: { level: 1, name: '捨て置かれた疑念', description: '奇怪な謎継続+1T、攻撃力+40%。' },
        e2: { level: 2, name: '謂れなき虚構', description: '天賦効果無視防御無視付与。' },
        e3: { level: 3, name: '夢幻泡影', description: 'スキルLv+2。' },
        e4: { level: 4, name: '俗世遊興', description: '必殺技SP+1、最大SP+1。' },
        e5: { level: 5, name: '裏表の真相', description: '必殺技Lv+2。' },
        e6: { level: 6, name: '重なる解答', description: 'スキルCDMG効果上昇。' },
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'earthly-escapade', // Her signature
        relicSetId: 'messenger_traversing_hackerspace',
        ornamentSetId: 'broken_keel',
        mainStats: {
            body: 'crit_dmg',
            feet: 'spd',
            sphere: 'hp_pct',
            rope: 'energy_regen_rate'
        },
        subStats: [
            { stat: 'crit_dmg', value: 1.0 }, // Heavy focus
            { stat: 'spd', value: 20 },
            { stat: 'hp_pct', value: 0.2 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate'
    }
};

export const sparkleHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, param) => {
    const battleStart = onBattleStart(sourceUnitId, level, param);
    const action = onActionHandlers(sourceUnitId, level, param);

    // A6 Constant Passive: Added via static check or global effect?
    // Usually static passives like "All allies ATK +15%" are handled by a permanent aura effect applied at start.
    // I missed implementing A6 Aura. I'll add a separate handler/effect for it now?
    // Implementation: Add Effect at Battle Start.

    // Refactoring to include A6 Aura in Battle Start...
    // To avoid rewriting `onBattleStart` entirely in this text block, I'll rely on a dynamic check or effect injection.
    // Let's add the A6 logic to `onBattleStart` logic below by wrapping.

    const combinedBattleStart: IEventHandlerFactory = (uid, lvl, p) => {
        const base = battleStart.handlerLogic;
        return {
            handlerMetadata: battleStart.handlerMetadata,
            handlerLogic: (e, s, h) => {
                let ns = base(e, s, h);
                if (e.type === 'ON_BATTLE_START') {
                    // A6 Aura
                    const u = ns.registry.get(createUnitId(uid));
                    if (u && u.traces?.some(t => t.id === TRACE_IDS.A6_NOCTURNE)) {
                        // Calculate Quantum Count
                        let quantumCount = 0;
                        ns.registry.forEach(x => {
                            if (!x.isEnemy && x.element === 'Quantum') {
                                quantumCount++;
                            }
                        });

                        const quantumBonus = [0, 0.05, 0.15, 0.30][Math.min(quantumCount, 3)];

                        // Apply Aura Effect to Allies
                        ns.registry.forEach(ally => {
                            if (ally.isEnemy) return;
                            const effects = [{
                                source: '夜想曲 (Base)',
                                target: 'atk_pct' as StatKey,
                                type: 'add' as const,
                                value: 0.15
                            }];

                            if (ally.element === 'Quantum' && quantumBonus > 0) {
                                effects.push({
                                    source: '夜想曲 (Quantum)',
                                    target: 'atk_pct' as StatKey,
                                    type: 'add' as const,
                                    value: quantumBonus
                                });
                            }

                            const aura: IEffect = {
                                id: `sparkle-a6-aura-${ally.id}`,
                                name: '夜想曲',
                                category: 'BUFF',
                                sourceUnitId: uid,
                                durationType: 'PERMANENT',
                                duration: -1,
                                modifiers: effects,
                                apply: (t, s) => s,
                                remove: (t, s) => s
                            };
                            ns = addEffect(ns, ally.id, aura);
                        });
                    }
                }
                return ns;
            }
        };
    };

    return {
        handlerMetadata: {
            id: `sparkle-handler-${sourceUnitId}`,
            subscribesTo: [
                ...battleStart.handlerMetadata.subscribesTo,
                ...action.handlerMetadata.subscribesTo,
            ]
        },
        handlerLogic: (event, state, handlerId) => {
            let newState = state;
            newState = combinedBattleStart(sourceUnitId, level, param).handlerLogic(event, newState, handlerId);
            newState = action.handlerLogic(event, newState, handlerId);
            return newState;
        }
    };
};
