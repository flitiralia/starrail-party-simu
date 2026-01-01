import { Character, StatKey, IAbility } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, DamageDealtEvent } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateDamageWithCritInfo } from '../../simulator/damage';
import { applyUnifiedDamage, appendAdditionalDamage } from '../../simulator/engine/dispatcher';

// --- Constants ---
const CHARACTER_ID = 'yanqing';

const EFFECT_IDS = {
    SOULSTEEL_SYNC: (sourceId: string) => `yanqing-soulsteel-sync-${sourceId}`,
    ULT_BUFF_CRIT_RATE: (sourceId: string) => `yanqing-ult-crit-rate-${sourceId}`,
    ULT_BUFF_CRIT_DMG: (sourceId: string) => `yanqing-ult-crit-dmg-${sourceId}`,
    A4_SPD_BUFF: (sourceId: string) => `yanqing-a4-spd-${sourceId}`,
    E4_RES_PEN: (sourceId: string) => `yanqing-e4-res-pen-${sourceId}`,
    FROZEN: (sourceId: string, targetId: string) => `yanqing-frozen-${sourceId}-${targetId}`,
    TECHNIQUE_BUFF: (sourceId: string) => `yanqing-technique-buff-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2_FROST_THORN: 'yanqing-trace-a2', // 頒氷 (A2)
    A4_STEEL_MENTOR: 'yanqing-trace-a4', // 凌霜 (A4)
    A6_ROAMING_CLOUD: 'yanqing-trace-a6', // 軽呂 (A6)
} as const;

// --- Ability Values ---
const ABILITY_VALUES = {
    basicDmg: { 6: 1.00, 7: 1.10 } as Record<number, number>,
    skillDmg: { 10: 2.20, 12: 2.42 } as Record<number, number>,
    ultCritDmg: { 10: 0.50, 12: 0.54 } as Record<number, number>,
    ultDmg: { 10: 3.50, 12: 3.78 } as Record<number, number>,
    talentCritRate: { 10: 0.20, 12: 0.21 } as Record<number, number>,
    talentCritDmg: { 10: 0.30, 12: 0.33 } as Record<number, number>,
    talentFuaChance: { 10: 0.60, 12: 0.62 } as Record<number, number>,
    talentFuaDmg: { 10: 0.50, 12: 0.55 } as Record<number, number>,
    talentFreezeDmg: { 10: 0.50, 12: 0.55 } as Record<number, number>,
};

const BASIC_EP = 20;
const SKILL_EP = 30;
const ULT_EP = 5; // Refund

// --- Helper Functions ---
function checkChance(baseChance: number, sourceEhr: number = 0, targetEffectRes: number = 0, targetDebuffRes: number = 0): boolean {
    const chance = baseChance * (1 + sourceEhr) * (1 - targetEffectRes) * (1 - targetDebuffRes);
    return Math.random() < chance;
}

function getSoulsteelSyncEffect(sourceId: string, eidolonLevel: number, character: Character): IEffect {
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const critRate = getLeveledValue(ABILITY_VALUES.talentCritRate, talentLevel);
    const critDmg = getLeveledValue(ABILITY_VALUES.talentCritDmg, talentLevel);

    const modifiers = [
        { source: '智剣連心', target: 'crit_rate' as StatKey, type: 'add', value: critRate },
        { source: '智剣連心', target: 'crit_dmg' as StatKey, type: 'add', value: critDmg },
        { source: '智剣連心', target: 'aggro' as StatKey, type: 'add', value: -50 },
    ];

    if (eidolonLevel >= 2) {
        modifiers.push({ source: '智剣連心(星魂2)', target: 'err' as StatKey, type: 'add', value: 0.10 });
    }

    const hasA4 = character.traces?.some(t => t.id === TRACE_IDS.A4_STEEL_MENTOR);
    if (hasA4) {
        modifiers.push({ source: '凌霜', target: 'effect_res' as StatKey, type: 'add', value: 0.20 });
    }

    return {
        id: EFFECT_IDS.SOULSTEEL_SYNC(sourceId),
        name: '智剣連心',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: 1,
        modifiers: modifiers as any,
        apply: (t, s) => s,
        remove: (t, s) => s
    };
}

export const yanqing: Character = {
    id: CHARACTER_ID,
    name: '彦卿',
    path: 'The Hunt',
    element: 'Ice',
    rarity: 5,
    maxEnergy: 140,
    baseStats: {
        hp: 892,
        atk: 679,
        def: 412,
        spd: 109,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75
    },

    abilities: {
        basic: {
            id: 'yanqing-basic',
            name: '寒光刺す霜鋒',
            type: 'Basic ATK',
            description: '指定した敵単体に彦卿の攻撃力X%分の氷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }],
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'yanqing-skill',
            name: '三尺秋水',
            type: 'Skill',
            description: '指定した敵単体に彦卿の攻撃力X%分の氷属性ダメージを与え、彦卿に「智剣連心」を付与する、1ターン継続。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 2.20, toughnessReduction: 20 }],
            },
            energyGain: SKILL_EP,
            spCost: 1,
            targetType: 'single_enemy',
        },

        ultimate: {
            id: 'yanqing-ultimate',
            name: '快雨に戯れる燕',
            type: 'Ultimate',
            description: '自身の会心率+60%、彦卿に「智剣連心」がある場合、さらに会心ダメージ+X%、バフは1ターン継続。その後、指定した敵単体に彦卿の攻撃力Y%分の氷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 3.50, toughnessReduction: 30 }],
            },
            energyGain: ULT_EP,
            targetType: 'single_enemy',
        },

        talent: {
            id: 'yanqing-talent',
            name: '呼影剣',
            type: 'Talent',
            description: '彦卿に「智剣連心」がある場合、攻撃を受ける確率ダウン、自身の会心率+X%、会心ダメージ+Y%。敵に攻撃を行った後、P%の固定確率で追加攻撃を行い、敵に彦卿の攻撃力Q%分の氷属性ダメージを与え、65%の基礎確率で凍結状態にする、1ターン継続。凍結状態の敵は行動できず、ターンが回ってきるたびに彦卿の攻撃力R%分の氷属性付加ダメージを受ける。彦卿がダメージを受けると「智剣連心」が解除される。',
            energyGain: 10,
        },

        technique: {
            id: 'yanqing-technique',
            name: '御剣真訣',
            type: 'Technique',
            description: '秘技を使用した後、次の戦闘開始時、残りHPが50%以上の敵に対して、彦卿の与ダメージ+30%、2ターン継続。',
        },
    },

    traces: [
        {
            id: TRACE_IDS.A2_FROST_THORN,
            name: '頒氷',
            type: 'Bonus Ability',
            description: '攻撃を行った後、氷属性の弱点がある敵に、彦卿の攻撃力の30%の氷属性付加ダメージを与える。',
        },
        {
            id: TRACE_IDS.A4_STEEL_MENTOR,
            name: '凌霜',
            type: 'Bonus Ability',
            description: '「智剣連心」がある場合、効果抵抗+20%。',
        },
        {
            id: TRACE_IDS.A6_ROAMING_CLOUD,
            name: '軽呂',
            type: 'Bonus Ability',
            description: '会心が発生した時、速度+10%、2ターン継続。',
        },
        {
            id: 'yanqing-stat-atk-1',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct',
            value: 0.28
        },
        {
            id: 'yanqing-stat-ice-1',
            name: '氷属性ダメージ',
            type: 'Stat Bonus',
            description: '氷属性ダメージ+14.4%',
            stat: 'ice_dmg_boost',
            value: 0.144
        },
        {
            id: 'yanqing-stat-hp-1',
            name: '最大HP',
            type: 'Stat Bonus',
            description: '最大HP+10.0%',
            stat: 'hp_pct',
            value: 0.10
        }
    ],

    eidolons: {
        e1: { level: 1, name: '素刃', description: '彦卿が敵に攻撃を行う時、その敵が凍結状態の場合、敵に彦卿の攻撃力60%分の氷属性付加ダメージを与える。' },
        e2: { level: 2, name: '空明', description: '彦卿に「智剣連心」がある場合、さらにEP回復効率+10%。' },
        e3: { level: 3, name: '剣胎', description: '戦闘スキルのLv.+2、通常攻撃のLv.+1' },
        e4: { level: 4, name: '霜厲', description: '残りHPが80%以上の時、自身の氷属性耐性貫通+12%。' },
        e5: { level: 5, name: '武骨', description: '必殺技のLv.+2、天賦のLv.+2' },
        e6: { level: 6, name: '自在', description: '敵を倒した時、必殺技のバフがある場合、それらの継続時間+1ターン。' },
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'sleep-like-the-dead',
        superimposition: 1,
        relicSetId: 'hunter-of-glacial-forest',
        ornamentSetId: 'firmament-frontline-glamoth',
        mainStats: {
            body: 'crit_dmg',
            feet: 'spd',
            sphere: 'ice_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_dmg', value: 0.60 },
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'spd', value: 10 },
            { stat: 'crit_rate', value: 0.10 },
        ],
        rotationMode: 'sequence',
        ultStrategy: 'immediate',
    },
};

// --- Handler Factory ---
export const yanqingHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `yanqing-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_DAMAGE_DEALT',
                'ON_ACTION_COMPLETE',
                'ON_ULTIMATE_USED',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;
            const eidolonLevel = unit.eidolonLevel || 0;
            let newState = state;

            // --- ON_BATTLE_START ---
            if (event.type === 'ON_BATTLE_START') {
                const techBuff: IEffect = {
                    id: EFFECT_IDS.TECHNIQUE_BUFF(sourceUnitId),
                    name: '御剣真訣',
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    apply: (t, s) => s,
                    remove: (t, s) => s
                };
                newState = addEffect(newState, sourceUnitId, techBuff);
            }

            // --- ON_BEFORE_DAMAGE_CALCULATION ---
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceUnitId) {
                const actionLog = state.currentActionLog;
                const target = event.targetId ? state.registry.get(createUnitId(event.targetId)) : undefined;

                // 1. 基本ダメージ倍率の設定
                if (actionLog) {
                    if (actionLog.primaryActionType === 'BASIC') {
                        const level = calculateAbilityLevel(eidolonLevel, 5, 'Basic');
                        (event as any).multiplier = getLeveledValue(ABILITY_VALUES.basicDmg, level);
                        (event as any).toughnessReduction = 10;
                    } else if (actionLog.primaryActionType === 'SKILL') {
                        const level = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
                        (event as any).multiplier = getLeveledValue(ABILITY_VALUES.skillDmg, level);
                        (event as any).toughnessReduction = 20;
                    } else if (actionLog.primaryActionType === 'ULTIMATE') {
                        const level = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
                        (event as any).multiplier = getLeveledValue(ABILITY_VALUES.ultDmg, level);
                        (event as any).toughnessReduction = 30;
                    }
                }

                // 2. 秘技: 敵HP >= 50% なら与ダメ+30%
                if (target && unit.effects.some(e => e.id === EFFECT_IDS.TECHNIQUE_BUFF(sourceUnitId))) {
                    if ((target.stats.hp / target.stats.hp) >= 0.5) { // stats.hp is MAX HP. wait, need current HP ratio
                        const hpRatio = target.hp / target.stats.hp;
                        if (hpRatio >= 0.5) {
                            const currentDmgBoost = (newState.damageModifiers as any).all_type_dmg_boost || 0;
                            (newState.damageModifiers as any).all_type_dmg_boost = currentDmgBoost + 0.30;
                        }
                    }
                }

                // 3. E4: HP > 80% で氷貫通
                if (eidolonLevel >= 4) {
                    const hpRatio = unit.hp / unit.stats.hp;
                    if (hpRatio >= 0.8) {
                        const currentResPen = (newState.damageModifiers as any).resPen || 0;
                        if (typeof (newState.damageModifiers as any).resPen === 'undefined') {
                            (newState.damageModifiers as any).resPen = 0;
                        }
                        (newState.damageModifiers as any).resPen += 0.12;
                    }
                }
            }

            // --- ON_DAMAGE_DEALT (Attacking Side) ---
            if (event.type === 'ON_DAMAGE_DEALT' && event.sourceId === sourceUnitId) {
                // A6: 会心発生時、速度+10%
                if ((event as any).isCrit) {
                    const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6_ROAMING_CLOUD);
                    if (hasA6) {
                        const spdBuff: IEffect = {
                            id: EFFECT_IDS.A4_SPD_BUFF(sourceUnitId),
                            name: '軽呂',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            duration: 2,
                            modifiers: [{ source: '軽呂', target: 'spd_pct', type: 'add', value: 0.10 }],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };
                        newState = addEffect(newState, sourceUnitId, spdBuff);
                    }
                }
            }

            // --- Helper: Apply E1 and A2 ---
            const applyExtraEffects = (currentState: GameState, targetUnit: Unit | undefined) => {
                let s = currentState;
                if (!targetUnit) return s;

                // 3. A2: 氷弱点敵への付加ダメージ (30% ATK)
                const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_FROST_THORN);
                if (hasA2 && targetUnit.weaknesses.has('Ice')) {
                    const dmg = unit.stats.atk * 0.30;
                    const res = applyUnifiedDamage(s, unit, targetUnit, dmg, {
                        damageType: 'ADDITIONAL_DAMAGE',
                        details: '頒氷 (Additional DMG)',
                    });
                    s = res.state;
                }

                // 5. E1: 凍結敵への付加ダメージ
                // ターゲットが凍結状態かチェック
                const isFrozen = targetUnit.effects.some(e => e.id.includes('frozen') || e.id.includes('freeze') || e.type === 'Frozen');
                if (eidolonLevel >= 1 && isFrozen) {
                    const dmg = unit.stats.atk * 0.60;
                    const res = applyUnifiedDamage(s, unit, targetUnit, dmg, {
                        damageType: 'ADDITIONAL_DAMAGE',
                        details: '素刃 (E1)',
                    });
                    s = res.state;
                }
                return s;
            };

            // --- ON_DAMAGE_DEALT (Target Side / Taking Damage) ---
            // 智剣連心解除ロジック
            if (event.type === 'ON_DAMAGE_DEALT' && event.targetId === sourceUnitId) {
                const damageDealtEvent = event as DamageDealtEvent;
                // HPダメージが発生したか判定 (currentHpRatio < previousHpRatio)
                if (damageDealtEvent.previousHpRatio !== undefined && damageDealtEvent.currentHpRatio !== undefined) {
                    if (damageDealtEvent.currentHpRatio < damageDealtEvent.previousHpRatio) {
                        // HPが実際に減少した
                        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.SOULSTEEL_SYNC(sourceUnitId));
                    }
                } else if (damageDealtEvent.value > 0) {
                    // フォールバック: value > 0 だが ratio が不明な場合。
                    // シミュレーターの仕様上、value > 0 は「シールド減算前」の値であることが多いが、
                    // EventLogic発行時点では「実際に通ったダメージ」であるべき。
                    // しかし、確実性を期すため、ratioチェックを優先し、ここでの解除は慎重に行う（しない）。
                    // ユーザー指摘: "バリアではなく実際にHPが減少したとき"
                }
            }

            // --- ON_ACTION_COMPLETE ---
            if (event.type === 'ON_ACTION_COMPLETE' && event.sourceId === sourceUnitId) {
                const actionLog = state.currentActionLog;
                if (!actionLog) return state;

                const targetId = actionLog.primaryTargetId;
                const target = targetId ? state.registry.get(createUnitId(targetId)) : undefined;

                // 1. 戦闘スキルの智剣連心付与
                if (actionLog.primaryActionType === 'SKILL') {
                    const effect = getSoulsteelSyncEffect(sourceUnitId, eidolonLevel, yanqing);
                    newState = addEffect(newState, sourceUnitId, effect);
                }

                // 2. E6: 必殺技バフ延長
                if (eidolonLevel >= 6 && actionLog.primaryActionType === 'ULTIMATE' && target && target.hp <= 0) {
                    const buffs = [EFFECT_IDS.ULT_BUFF_CRIT_RATE(sourceUnitId), EFFECT_IDS.ULT_BUFF_CRIT_DMG(sourceUnitId)];
                    buffs.forEach(buffId => {
                        const existing = unit.effects.find(e => e.id === buffId);
                        if (existing) {
                            const newEffect = { ...existing, duration: existing.duration + 1 };
                            newState = addEffect(newState, sourceUnitId, newEffect);
                        }
                    });
                }

                // 3 & 5. Apply E1 and A2 for the Main Action
                // 仕様: "攻撃を行った後"
                // ターゲットが存在する場合のみ
                if (target) {
                    newState = applyExtraEffects(newState, target);
                }

                // 4. 天賦: 追加攻撃 (FUA)
                const updatedUnit = newState.registry.get(createUnitId(sourceUnitId))!;
                const soulsteel = updatedUnit.effects.find(e => e.id === EFFECT_IDS.SOULSTEEL_SYNC(sourceUnitId));

                if (soulsteel) {
                    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
                    const fuaChance = getLeveledValue(ABILITY_VALUES.talentFuaChance, talentLevel);

                    if (Math.random() < fuaChance) {
                        const fuaDmgMult = getLeveledValue(ABILITY_VALUES.talentFuaDmg, talentLevel);
                        const fuaAbility: IAbility = {
                            id: 'yanqing-talent-fua',
                            name: '呼影剣 (追加攻撃)',
                            type: 'Talent',
                            description: '天賦による追加攻撃',
                            damage: {
                                type: 'simple', scaling: 'atk',
                                hits: [{ multiplier: fuaDmgMult, toughnessReduction: 10 }]
                            }
                        };

                        if (target && target.hp > 0) {
                            const dmgRes = calculateDamageWithCritInfo(updatedUnit, target, fuaAbility, {
                                type: 'FOLLOW_UP_ATTACK', sourceId: sourceUnitId, targetId: target.id
                            } as any);

                            const unifiedRes = applyUnifiedDamage(newState, updatedUnit, target, dmgRes.damage, {
                                damageType: 'FOLLOW_UP_ATTACK',
                                details: '呼影剣',
                                isCrit: dmgRes.isCrit,
                                breakdownMultipliers: dmgRes.breakdownMultipliers,
                                additionalDamageEntry: {
                                    source: updatedUnit.name,
                                    name: '呼影剣',
                                    damageType: 'additional',
                                    isCrit: dmgRes.isCrit,
                                    breakdownMultipliers: dmgRes.breakdownMultipliers
                                }
                            });
                            newState = unifiedRes.state;

                            newState = addEnergyToUnit(newState, sourceUnitId, 10, 0, false, { sourceId: sourceUnitId });

                            // 凍結判定 
                            const targetsDebuffRes = (target.stats as any).crowd_control_res || 0;
                            const targetEffectRes = target.stats.effect_res || 0;
                            const hit = checkChance(0.65, updatedUnit.stats.effect_hit_rate, targetEffectRes, targetsDebuffRes);

                            if (hit) {
                                console.log('[Yanqing] Applied Frozen to:', target.id);
                                const freezeEffect: IEffect = {
                                    id: EFFECT_IDS.FROZEN(sourceUnitId, target.id),
                                    name: '凍結',
                                    category: 'DEBUFF',
                                    type: 'Frozen',
                                    sourceUnitId: sourceUnitId,
                                    durationType: 'TURN_START_BASED',
                                    duration: 1,
                                    isCleansable: true,
                                    modifiers: [],
                                    apply: (t, s) => s,
                                    remove: (t, s) => s
                                };
                                newState = addEffect(newState, target.id, freezeEffect);
                            }

                            // User Feedback: E1 and A2 apply to FUA as well.
                            // FUA is an attack.
                            newState = applyExtraEffects(newState, target);
                        }
                    }
                }
            }

            // --- ON_TURN_START (Handling Frozen DoT) ---
            if (event.type === 'ON_TURN_START') {
                // ターン開始者が凍結デバフを持っているか確認
                const targetId = event.sourceId; // Turn Owner
                const targetUnit = state.registry.get(createUnitId(targetId));
                if (targetUnit) {
                    // 自分が付与したFrozenを探す
                    const frozenDebuff = targetUnit.effects.find(e => e.id === EFFECT_IDS.FROZEN(sourceUnitId, targetId));
                    if (frozenDebuff) {
                        // Frozen DoT Damage
                        const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
                        const freezeDmgMult = getLeveledValue(ABILITY_VALUES.talentFreezeDmg, talentLevel);
                        const freezeDmg = freezeDmgMult * unit.stats.atk;

                        const res = applyUnifiedDamage(newState, unit, targetUnit, freezeDmg, {
                            damageType: 'DOT',
                            details: '凍結ダメージ（天賦）'
                        });
                        newState = res.state;
                    }
                }
            }

            // --- ON_ULTIMATE_USED (Before Damage Check) ---
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
                const crBuff: IEffect = {
                    id: EFFECT_IDS.ULT_BUFF_CRIT_RATE(sourceUnitId),
                    name: '快雨に戯れる燕 (会心率)',
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'TURN_END_BASED',
                    duration: 1,
                    modifiers: [{ source: '必殺技', target: 'crit_rate', type: 'add', value: 0.60 }],
                    apply: (t, s) => s,
                    remove: (t, s) => s
                };
                newState = addEffect(newState, sourceUnitId, crBuff);

                if (unit.effects.some(e => e.id === EFFECT_IDS.SOULSTEEL_SYNC(sourceUnitId))) {
                    const cdValue = getLeveledValue(ABILITY_VALUES.ultCritDmg, ultLevel);
                    const cdBuff: IEffect = {
                        id: EFFECT_IDS.ULT_BUFF_CRIT_DMG(sourceUnitId),
                        name: '快雨に戯れる燕 (会心ダメ)',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_END_BASED',
                        duration: 1,
                        modifiers: [{ source: '必殺技', target: 'crit_dmg', type: 'add', value: cdValue }],
                        apply: (t, s) => s,
                        remove: (t, s) => s
                    };
                    newState = addEffect(newState, sourceUnitId, cdBuff);
                }
            }

            return newState;
        }
    };
};
