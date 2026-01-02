import { Character, StatKey, IAbility, IHitDefinition } from '../../types/index';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, DamageDealtEvent } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect, CrowdControlEffect } from '../../simulator/effect/types';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { calculateDamageWithCritInfo } from '../../simulator/damage';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { delayUnitAction } from '../../simulator/engine/actionValue';



// ... (Constants, welt object same as before) ...
// skipping lines for brevity if possible, but replace_file_content replaces the BLOCK.
// I will only replace the HANDLER part and import part if I can.
// But imports are at top. Handlers are at bottom.
// I will use `multi_replace_file_content` to fix both areas.



// --- Constants ---
const CHARACTER_ID = 'welt';

const EFFECT_IDS = {
    IMPRISONMENT: (sourceId: string, targetId: string) => `welt-imprisonment-${sourceId}-${targetId}`,
    SPD_DOWN_SKILL: (sourceId: string, targetId: string) => `welt-skill-spd-down-${sourceId}-${targetId}`,
    VULNERABILITY_A2: (sourceId: string, targetId: string) => `welt-a2-vulnerability-${sourceId}-${targetId}`,
    E1_BUFF: (sourceId: string) => `welt-e1-buff-${sourceId}`,
    TECHNIQUE_ZONE: (sourceId: string) => `welt-technique-zone-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2_PUNISHMENT: 'welt-trace-a2',
    A4_JUDGMENT: 'welt-trace-a4',
    A6_RETRIBUTION: 'welt-trace-a6',
} as const;

// --- Ability Values ---
const ABILITY_VALUES = {
    basicMult: { 6: 1.00, 7: 1.10 } as Record<number, number>,
    skillMult: { 10: 0.72, 12: 0.792 } as Record<number, number>,
    skillSlowChance: { 10: 0.75, 12: 0.77 } as Record<number, number>,
    ultMult: { 10: 1.50, 12: 1.62 } as Record<number, number>,
    ultDelay: { 10: 0.40, 12: 0.416 } as Record<number, number>, // 32% + 8%? No, text says 40% at Lv10. Base is ? Trace says 32% base?
    // welt.txt: Lv10 -> 40%, Lv12 -> 41.6%
    // welt.txt doesn't specify base explicitly but providing leveled values is safer.
    talentMult: { 10: 0.60, 12: 0.66 } as Record<number, number>,
};

// Based on HoneyHunter/Wiki for scaling verification if text is ambiguous:
// Ult: Base 32%, +2% per level? Lv10 = 32 + 2*? Actually let's assume the provided text values are correct.
// Lv10: 40% delay.

const BASIC_EP = 20;
const SKILL_EP = 30;
const ULT_EP = 5; // Refund

export const welt: Character = {
    id: CHARACTER_ID,
    name: 'ヴェルト',
    path: 'Nihility',
    element: 'Imaginary',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1125,
        atk: 620,
        def: 509,
        spd: 102,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100 // Nihility standard
    },

    abilities: {
        basic: {
            id: 'welt-basic',
            name: '重力制圧',
            type: 'Basic ATK',
            description: '指定した敵単体にヴェルトの攻撃力100%分の虚数属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }],
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'welt-skill',
            name: '虚空断界',
            type: 'Skill',
            description: '指定した敵単体にダメージを与え、さらに2ヒットする。ヒットごとに確率で減速付与。',
            damage: {
                type: 'bounce',
                scaling: 'atk',
                hits: [ // Default 3 hits
                    { multiplier: 0.72, toughnessReduction: 10 },
                    { multiplier: 0.72, toughnessReduction: 10 },
                    { multiplier: 0.72, toughnessReduction: 10 },
                ]
            },
            energyGain: SKILL_EP,
            spCost: 1,
            targetType: 'bounce',
            // Note: Handler will ensure side effects. Engine handles bounce targeting.
        },

        ultimate: {
            id: 'welt-ultimate',
            name: '疑似ブラックホール',
            type: 'Ultimate',
            description: '敵全体にダメージを与え、禁錮状態にする。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 1.50, toughnessReduction: 20 }],
            },
            energyGain: ULT_EP,
            targetType: 'all_enemies',
        },

        talent: {
            id: 'welt-talent',
            name: '時空の歪み',
            type: 'Talent',
            description: '攻撃が減速状態の敵に命中した時、付加ダメージを与える。',
            energyGain: 0,
            // Handler implemented
        },

        technique: {
            id: 'welt-technique',
            name: '画地為牢',
            type: 'Technique',
            description: '領域を作り、戦闘開始時に敵を禁錮状態にする。',
        },
    },

    traces: [
        {
            id: TRACE_IDS.A2_PUNISHMENT,
            name: '懲戒',
            type: 'Bonus Ability',
            description: '必殺技を発動した時、100%の基礎確率で敵の被ダメージ+12%、2ターン継続。',
        },
        {
            id: TRACE_IDS.A4_JUDGMENT,
            name: '審判',
            type: 'Bonus Ability',
            description: '必殺技を発動した時、さらにEPを10回復する。',
        },
        {
            id: TRACE_IDS.A6_RETRIBUTION,
            name: '裁決',
            type: 'Bonus Ability',
            description: '弱点撃破された敵に対しての与ダメージ＋20%。',
        },
        {
            id: 'welt-stat-atk-1',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct',
            value: 0.28
        },
        {
            id: 'welt-stat-img-1',
            name: '虚数属性ダメージ',
            type: 'Stat Bonus',
            description: '虚数属性ダメージ+14.4%',
            stat: 'imaginary_dmg_boost',
            value: 0.144
        },
        {
            id: 'welt-stat-res-1',
            name: '効果抵抗',
            type: 'Stat Bonus',
            description: '効果抵抗+10.0%',
            stat: 'effect_res',
            value: 0.10
        }
    ],

    eidolons: {
        e1: { level: 1, name: '名の継承', description: '必殺技発動後、通常攻撃/戦闘スキルに追加ダメージ。' },
        e2: { level: 2, name: '星の凝集', description: '天賦発動時、EPを3回復。' },
        e3: { level: 3, name: '平和の願い', description: '戦闘スキルのLv.+2、通常攻撃のLv.+1' },
        e4: { level: 4, name: '義の旗標', description: '戦闘スキルの速度ダウン基礎確率+35%。' },
        e5: { level: 5, name: '善の力', description: '必殺技のLv.+2、天賦のLv.+2' },
        e6: { level: 6, name: '光ある未来', description: '戦闘スキル発動時、さらにランダムな敵単体にダメージを1回与える。' },
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'in-the-name-of-the-world',
        superimposition: 1,
        relicSetId: 'wastelander-of-banditry-desert',
        ornamentSetId: 'firmament-frontline-glamoth',
        mainStats: {
            body: 'crit_rate',
            feet: 'spd',
            sphere: 'imaginary_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'spd', value: 20 },
            { stat: 'crit_rate', value: 0.10 },
            { stat: 'crit_dmg', value: 0.20 },
            { stat: 'effect_hit_rate', value: 0.20 },
        ],
        rotationMode: 'sequence',
        ultStrategy: 'immediate',
    },
};

// --- Helper Functions ---

/**
 * 敵が減速状態（速度デバフを持っている）か判定
 * ここでは「速度ステータスに対する負のModifierを持つ」または「禁錮などの特定のデバフ」で判定
 * 簡易的に、spd_pct < 0 または spd < 0 のmodifierがあるかチェック
 */
function isSlowed(unit: Unit): boolean {
    // 禁錮や速度ダウン系エフェクトを探す
    // modifiersを走査して spd系がマイナスになっているか見るのが確実だが、
    // Effectベースで見るのが一般的。

    // Check effects for modifiers specifically targeting speed with negative value
    for (const effect of unit.effects) {
        if (!effect.modifiers) continue;
        const mods = Array.isArray(effect.modifiers) ? effect.modifiers : Object.entries(effect.modifiers).map(([k, v]) => ({ target: k, value: (v as any).value || v }));

        for (const mod of mods) {
            if ((mod.target === 'spd' || mod.target === 'spd_pct') && (mod.value as number) < 0) {
                return true;
            }
        }
        // 禁錮 (CrowdControl) 自体に speedReduction プロパティがある場合
        if (effect.type === 'CrowdControl' && (effect as any).speedReduction > 0) {
            return true;
        }
    }
    return false;
}

/**
 * ヴェルトの禁錮エフェクト作成
 */
function createWeltImprisonmentEffect(sourceId: string, targetId: string, delayPct: number, duration: number = 1): CrowdControlEffect {
    return {
        id: EFFECT_IDS.IMPRISONMENT(sourceId, targetId),
        name: '禁錮（ヴェルト）',
        category: 'DEBUFF',
        type: 'CrowdControl',
        ccType: 'Imprisonment',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: duration,
        damageCalculation: 'none',
        delayAmount: 0, // delayAmount usually fixed av. Welt delays by %.
        // Engine's CrowdControl type might rely on delayAmount (flat) or modifiers.
        // If delayAmount is flat AV, we can't easily express %.
        // However, breakEffects uses `delayAmount: IMPRISONMENT_BASE_DELAY * (1+BE)`. That is a fixed delay value (AV).
        // Welt's delay is % action delay. "action delay 40%" means `delayUnitAction` by 40% of their AV?
        // Actually `CrowdControlEffect` might not support % delay natively in `delayAmount`.
        // We usually handle immediate Action Delay in `apply` or via a separate mechanism.
        // But Imprisonment *is* the state that causes the delay upon application/turn skip.
        // For Welt, the delay happens *when applied* or *when turn is skipped*? The text says "Imprisoned enemies have their action delayed by X%". This usually means a pushback.
        // Standard Imprisonment behavior: Push back AV when applied? Or when the turn comes and they are imprisoned?
        // Game Logic: Imprisonment pushes back Action *immediately* upon application (or Break).
        // And it skips the turn? No, Imprisonment is a turn skip (CC) AND a delay.
        // Wait, regular Imprisonment skips the turn and delays the *next* turn.
        // Welt's Ult says "Imprison stats".
        // Let's assume standard CC handling: If `ccType` is Imprisonment, it skips turn.
        // The `avAdvanceOnRemoval` or similar might handle delay?
        // Standard `Imprisonment` effect in breakEffects has `delayAmount`.
        // Logic in `actionValue.ts` usually handles CC effects.
        // For now, I'll set `delayAmount` to 0 here and apply the Pushback manually in the Handler upon application if needed, 
        // OR rely on the engine if it supports % delay.
        // Looking at `breakEffects.ts`, `delayAmount` seems to be the pushback value.
        // But Welt's delay is %, so it depends on the unit's Base AV or current AV? 
        // "Action Delayed by 40%" usually means +40% of Base AV (10000/SPD).

        // Let's use `onApply` to push back? The `IEffect` apply is `(t,s) => s`.
        // I'll implement the delay logic in ON_EFFECT_APPLIED? Or ON_ULTIMATE_USED (application time).
        // The Imprisonment EFFECT itself mainly serves to Disable the unit (Skip Turn) and provide Spd Down.

        speedReduction: 0.10,
        modifiers: [{
            target: 'spd_pct',
            source: '禁錮',
            type: 'pct',
            value: -0.10
        }],
        isCleansable: true,

        /* remove removed */
    };
}

// --- Handler Factory ---
export const weltHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `welt-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_ACTION_COMPLETE',
                'ON_DAMAGE_DEALT',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_ULTIMATE_USED', // Hook for Ult specific timing if needed
            ],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            const eidolonLevel = unit.eidolonLevel || 0;
            let newState = state;

            // --- ON_BATTLE_START ---
            if (event.type === 'ON_BATTLE_START') {
                // E6: Add extra hit to Skill
                if (eidolonLevel >= 6) {
                    const skill = unit.abilities.skill;
                    if (skill.damage && 'hits' in skill.damage) {
                        // Add 4th hit
                        // Note: We need to clone to avoid mutating the constant definition if we shared it (though here it's per unit usually)
                        // But `welt` object is constant. We should modify the unit's copy.
                        // The unit instance has its own abilities copy? 
                        // No, usually it references the constant unless we cloned it deep.
                        // But `state.registry` units should be independent.
                        // Let's assume we can modify `unit.abilities.skill.damage.hits`.
                        // We need to be careful not to keep adding if we restart battle?
                        // Unit initialization usually calls `ON_BATTLE_START`.
                        // We should check if it already has 4 hits.
                        if (skill.damage.hits.length === 3) {
                            // Deep clone to avoid mutating shared constant 'welt'
                            const newHits = [...skill.damage.hits, { multiplier: 0.792, toughnessReduction: 10 }];
                            const newDamage = { ...skill.damage, hits: newHits };
                            const newSkill = { ...skill, damage: newDamage };

                            // Assign to unit instance (shallow copy abilities map)
                            unit.abilities = { ...unit.abilities, skill: newSkill };
                        }
                    }
                }

                // 秘技: 15秒領域 -> 戦闘開始時 100%基礎確率で禁錮
                const enemies = newState.registry.getAliveEnemies();
                for (const enemy of enemies) {
                    const enemySpd = Math.max(1, enemy.stats.spd);
                    const impEffect = createWeltImprisonmentEffect(sourceUnitId, enemy.id, 0.20, 1);
                    // Calculate delay: 20% of Base AV? or Current? 
                    // "Action delayed by 20%". Standard: +20% of Base AV (10000/SPD).
                    const delayValue = 0.20;

                    // Apply Effect
                    newState = addEffect(newState, enemy.id, impEffect);

                    // Apply Action Delay explicitly
                    newState = delayUnitAction(newState, enemy.id, delayValue, 'percent');
                }
            }

            // --- ON_DAMAGE_DEALT: Skill Slow, Bounce Logic, Talent & E1 Additional Damage ---
            if (event.type === 'ON_DAMAGE_DEALT' && event.sourceId === sourceUnitId) {
                const actionLog = state.currentActionLog;
                if (!actionLog) return newState;

                // Prevent recursion: Don't trigger on Additional Damage itself
                if (event.damageType === 'Additional Damage' || event.damageType === 'Talent' || event.damageType === 'E1') return newState;

                // 1. Skill Slow Application
                if (actionLog.primaryActionType === 'SKILL') {
                    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
                    let baseChance = getLeveledValue(ABILITY_VALUES.skillSlowChance, skillLevel);
                    if (eidolonLevel >= 4) baseChance += 0.35;

                    const targetId = event.targetId;
                    const roll = Math.random();
                    if (roll < baseChance) {
                        const spdDownEffect: IEffect = {
                            id: EFFECT_IDS.SPD_DOWN_SKILL(sourceUnitId, targetId),
                            name: '虚空断界（速度低下）',
                            category: 'DEBUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            duration: 2,
                            modifiers: [{
                                target: 'spd_pct',
                                source: '虚空断界',
                                type: 'add',
                                value: -0.10
                            }],
                            isCleansable: true,

                            /* remove removed */
                        };
                        newState = addEffect(newState, targetId, spdDownEffect);
                    }
                }

                // 2. Talent: Additional Damage against Slowed enemies
                // Trigger: "When hitting..." (applies per hit)
                if (['BASIC', 'SKILL', 'ULTIMATE'].includes(actionLog.primaryActionType)) {
                    const target = state.registry.get(createUnitId(event.targetId));
                    if (target && isSlowed(target)) {
                        const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
                        const talentMult = getLeveledValue(ABILITY_VALUES.talentMult, talentLevel);

                        // Create temporary ability definition for calculation
                        const talentAbility: IAbility = {
                            id: 'welt-talent-proc',
                            name: '時空の歪み',
                            type: 'Talent',
                            description: '',
                            damage: {
                                type: 'simple',
                                scaling: 'atk',
                                hits: [{ multiplier: talentMult, toughnessReduction: 0 }]
                            }
                        };

                        // Dummy Action for Calculation
                        const dummyAction: any = {
                            sourceUnitId: sourceUnitId,
                            targetUnitIds: [target.id],
                            abilityId: talentAbility.id,
                            actionType: 'Talent'
                        };

                        // Calculate Damage
                        const dmgResult = calculateDamageWithCritInfo(unit, target, talentAbility, dummyAction, newState.damageModifiers);

                        // Apply Damage
                        const applyResult = applyUnifiedDamage(newState, unit, target, dmgResult.damage, {
                            damageType: 'Additional Damage',
                            additionalDamageEntry: {
                                source: unit.name,
                                name: '時空の歪み',
                                damageType: 'additional',
                                isCrit: dmgResult.isCrit,
                                breakdownMultipliers: dmgResult.breakdownMultipliers
                            },
                            skipStats: false
                        });
                        newState = applyResult.state;

                        // E2: Restore Energy (Talent Trigger)
                        if (eidolonLevel >= 2) {
                            newState = addEnergyToUnit(newState, sourceUnitId, 3, 0, false, { sourceId: sourceUnitId });
                        }
                    }
                }

                // 3. E1: Bonus Damage
                // Trigger: Next Basic/Skill after Ult.
                // Interpretation: "Deals Additional Damage" -> Usually 1 instance per Action.
                // To safely trigger once, we check if we have already triggered it for this action log?
                // Or checking a specific flag.
                // Or simply trigger on the FIRST hit.
                // Issue: If it's the first hit, what if it misses or is blocked? 
                // "After using... next use of...". It attaches to the action.
                // Let's use `!hasTriggeredE1` check.
                if (['BASIC', 'SKILL'].includes(actionLog.primaryActionType)) {
                    const e1Buff = unit.effects.find(e => e.id === EFFECT_IDS.E1_BUFF(sourceUnitId));
                    if (e1Buff) {
                        // Check if we already added E1 damage to this log
                        const alreadyTriggered = actionLog.additionalDamage.some(ad => ad.name === '名の継承');
                        if (!alreadyTriggered) {
                            // Calculate E1 Damage
                            // Basic: 50%, Skill: 80%
                            let e1Mult = 0;
                            if (actionLog.primaryActionType === 'BASIC') e1Mult = 0.50;
                            if (actionLog.primaryActionType === 'SKILL') e1Mult = 0.80;

                            const e1Ability: IAbility = {
                                id: 'welt-e1-proc',
                                name: '名の継承',
                                type: 'Talent',
                                description: '',
                                damage: {
                                    type: 'simple',
                                    scaling: 'atk',
                                    hits: [{ multiplier: e1Mult, toughnessReduction: 0 }]
                                }
                            };

                            const dummyAction: any = {
                                sourceUnitId: sourceUnitId,
                                targetUnitIds: [event.targetId],
                                abilityId: e1Ability.id,
                                actionType: 'Talent'
                            };

                            const target = state.registry.get(createUnitId(event.targetId));
                            if (target) {
                                const dmgResult = calculateDamageWithCritInfo(unit, target, e1Ability, dummyAction, newState.damageModifiers);

                                const applyResult = applyUnifiedDamage(newState, unit, target, dmgResult.damage, {
                                    damageType: 'Additional Damage',
                                    additionalDamageEntry: {
                                        source: unit.name,
                                        name: '名の継承',
                                        damageType: 'additional',
                                        isCrit: dmgResult.isCrit,
                                        breakdownMultipliers: dmgResult.breakdownMultipliers
                                    }
                                });
                                newState = applyResult.state;
                            }
                        }
                    }
                }
            }

            // --- ON_BEFORE_DAMAGE_CALCULATION: A6 only ---
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceUnitId) {
                const actionLog = state.currentActionLog;
                if (!event.targetId) return newState;
                const target = state.registry.get(createUnitId(event.targetId));

                if (target && actionLog) {
                    // A6: Damage vs Broken
                    if (eidolonLevel >= 0) {
                        const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6_RETRIBUTION);
                        if (hasA6 && target.toughness <= 0) {
                            newState = {
                                ...newState,
                                damageModifiers: {
                                    ...newState.damageModifiers,
                                    allTypeDmg: (newState.damageModifiers.allTypeDmg || 0) + 0.20
                                }
                            };
                        }
                    }
                    // Talent & E1 removed (handled in ON_DAMAGE_DEALT)
                }
            }

            // --- ON_ULTIMATE_USED ---
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
                const delayPct = getLeveledValue(ABILITY_VALUES.ultDelay, ultLevel);

                const enemies = newState.registry.getAliveEnemies();
                for (const enemy of enemies) {
                    const impEffect = createWeltImprisonmentEffect(sourceUnitId, enemy.id, delayPct, 1);

                    // Apply Effect
                    newState = addEffect(newState, enemy.id, impEffect);

                    // Apply Action Delay explicitly
                    newState = delayUnitAction(newState, enemy.id, delayPct, 'percent');

                    // A2
                    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_PUNISHMENT);
                    if (hasA2) {
                        const vulnEffect: IEffect = {
                            id: EFFECT_IDS.VULNERABILITY_A2(sourceUnitId, enemy.id),
                            name: '懲戒（被ダメージアップ）',
                            category: 'DEBUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            duration: 2,
                            modifiers: [{
                                target: 'all_type_vuln',
                                source: '懲戒',
                                type: 'add',
                                value: 0.12
                            }],

                            /* remove removed */
                        };
                        newState = addEffect(newState, enemy.id, vulnEffect);
                    }
                }

                // A4
                const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_JUDGMENT);
                if (hasA4) {
                    newState = addEnergyToUnit(newState, sourceUnitId, 10, 0, false, { sourceId: sourceUnitId });
                }

                // E1
                if (eidolonLevel >= 1) {
                    const e1Buff: IEffect = {
                        id: EFFECT_IDS.E1_BUFF(sourceUnitId),
                        name: '名の継承（強化）',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: 2,
                        maxStacks: 2,

                        /* remove removed */
                    };
                    newState = addEffect(newState, sourceUnitId, e1Buff);
                }
            }

            // --- ON_ACTION_COMPLETE: Consume E1 ---
            if (event.type === 'ON_ACTION_COMPLETE' && event.sourceId === sourceUnitId) {
                const log = state.currentActionLog;
                if (log && (log.primaryActionType === 'BASIC' || log.primaryActionType === 'SKILL')) {
                    const e1Buff = unit.effects.find(e => e.id === EFFECT_IDS.E1_BUFF(sourceUnitId));
                    if (e1Buff) {
                        // Consume 1 stack
                        const newStack = (e1Buff.stackCount || 1) - 1;
                        // Remove current effect first to ensure stack count is reset/set correctly
                        // (addEffect usually accumulates stacks, so we can't just add with lower count)
                        newState = removeEffect(newState, sourceUnitId, e1Buff.id);

                        if (newStack > 0) {
                            newState = addEffect(newState, sourceUnitId, { ...e1Buff, stackCount: newStack });
                        }
                    }
                }
            }

            return newState;
        }
    };
};
