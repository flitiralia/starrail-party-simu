import { Character, Element, Path, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, DamageDealtEvent } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyHealing, cleanse, dispelBuffs } from '../../simulator/engine/utils';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { createUnitId } from '../../simulator/engine/unitId';
import { publishEvent } from '../../simulator/engine/dispatcher';

// --- Constants ---
const CHARACTER_ID = 'huohuo';

const EFFECT_IDS = {
    DIVINE_PROVISION: (sourceId: string) => `huohuo-divine-provision-${sourceId}`,
    ULT_ATK_BUFF: (sourceId: string, targetId: string) => `huohuo-ult-atk-buff-${sourceId}-${targetId}`,
    TECHNIQUE_DEBUFF: (sourceId: string, targetId: string) => `huohuo-technique-debuff-${sourceId}-${targetId}`,
    E1_SPEED_BUFF: (sourceId: string, targetId: string) => `huohuo-e1-speed-buff-${sourceId}-${targetId}`,
    E6_DMG_BUFF: (sourceId: string, targetId: string) => `huohuo-e6-dmg-buff-${sourceId}-${targetId}`,
} as const;

// --- Values ---
const ABILITY_VALUES = {
    skillHealMain: {
        10: { mult: 0.21, flat: 560 }, // Lv10
        12: { mult: 0.224, flat: 623 } // Lv12 (E5)
    },
    skillHealAdj: {
        10: { mult: 0.168, flat: 448 },
        12: { mult: 0.1792, flat: 498.4 }
    },
    ultAtkBuff: {
        10: { mult: 0.40, flat: 0 },
        12: { mult: 0.432, flat: 0 } // Lv12 (E3)
    },
    talentHeal: {
        10: { mult: 0.045, flat: 120 },
        12: { mult: 0.048, flat: 133.5 }
    }
};

const ULT_ENERGY_REGEN_PCT = {
    10: 0.20,
    12: 0.21
};

export const Huohuo: Character = {
    id: CHARACTER_ID,
    name: "フォフォ",
    path: 'Abundance',
    element: 'Wind',
    rarity: 5,
    maxEnergy: 140,
    baseStats: {
        hp: 1358,
        atk: 601,
        def: 509,
        spd: 98,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'huohuo-basic',
            name: "令旗・風雨招来",
            type: 'Basic ATK',
            description: "指定した敵単体にフォフォの最大HPの一部分の風属性ダメージを与える。",
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'hp',
                hits: [{ multiplier: 0.50, toughnessReduction: 10 }] // Lv6
            },
            energyGain: 20
        },
        skill: {
            id: 'huohuo-skill',
            name: "霊符・護身",
            type: 'Skill',
            description: "味方単体のデバフを解除し回復、隣接する味方も回復。「厄払い」を獲得。",
            targetType: 'ally',
            energyGain: 30
        },
        ultimate: {
            id: 'huohuo-ult',
            name: "シッポ・神鬼使役",
            type: 'Ultimate',
            description: "自身以外の味方のEPを回復し、攻撃力アップ。",
            targetType: 'all_allies',
            energyGain: 5
        },
        talent: {
            id: 'huohuo-talent',
            name: "憑依・真気通天",
            type: 'Talent',
            description: "「厄払い」により、味方ターン開始時や必殺技発動時に回復とデバフ解除を行う。",
            targetType: 'self',
            energyGain: 0
        },
        technique: {
            id: 'huohuo-technique',
            name: "凶相・鬼物圧伏",
            type: 'Technique',
            description: "敵を「魂魄飛散」状態にし、攻撃力ダウン。",
            targetType: 'all_enemies',
            energyGain: 0
        }
    },
    traces: [
        { id: 'huohuo-trace-a2', name: "一存では動けない", type: 'Bonus Ability', description: "戦闘開始時、「厄払い」を獲得(1ターン)。" },
        { id: 'huohuo-trace-a4', name: "貞凶の命", type: 'Bonus Ability', description: "行動制限系デバフ抵抗確率+35%。", stat: 'crowd_control_res', value: 0.35 },
        { id: 'huohuo-trace-a6', name: "臆病者のストレス反応", type: 'Bonus Ability', description: "天賦発動時、EPを1回復。" },
        { id: 'stat-hp', name: 'HP', type: 'Stat Bonus', description: 'HP+28.0%', stat: 'hp_pct', value: 0.28 },
        { id: 'stat-res', name: '効果抵抗', type: 'Stat Bonus', description: '効果抵抗+18.0%', stat: 'effect_res', value: 0.18 },
        { id: 'stat-spd', name: '速度', type: 'Stat Bonus', description: '速度+5', stat: 'spd', value: 5 },
    ],
    eidolons: {
        e1: { level: 1, name: "歳陽の拠り所", description: "「厄払い」継続時間+1ターン。味方全体の速度+12%。" },
        e2: { level: 2, name: "邪霊を宿した尻尾", description: "「厄払い」中、味方の戦闘不能を防ぎ回復(2回)。" },
        e3: { level: 3, name: "貞凶の燭火", description: "必殺技Lv+2, 天賦Lv+2" },
        e4: { level: 4, name: "離れぬ悪鬼、絶えぬ揉め事", description: "HPが低いほど治癒量アップ。" },
        e5: { level: 5, name: "勅令のままに妖魔退治", description: "スキルLv+2, 通常Lv+1" },
        e6: { level: 6, name: "苦楽を共にする仲間", description: "治癒時、与ダメージ+50%(2ターン)。" }
    },
    defaultConfig: {
        lightConeId: 'night-of-fright',
        superimposition: 1,
        relicSetId: 'passerby_of_wandering_cloud',
        ornamentSetId: 'broken_keel',
        mainStats: {
            body: 'outgoing_healing_boost',
            feet: 'spd',
            sphere: 'hp_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'hp_pct', value: 0.20 },
            { stat: 'effect_res', value: 0.10 },
            { stat: 'spd', value: 5 },
        ]
    }
};

// --- Logic Implementation ---

// Helper for Energy
/**
 * 対象のEPを回復する
 * 
 * @param state 現在のゲーム状態
 * @param targetId 対象のユニットID
 * @param amount 回復量（固定値）
 * @returns 更新されたゲーム状態
 */
function addEnergy(state: GameState, targetId: string, amount: number): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    // Check Max EP from stats
    const maxEp = target.stats.max_ep || 140;
    const newEp = Math.min(maxEp, target.ep + amount);

    let newState = {
        ...state,
        registry: state.registry.update(createUnitId(targetId), u => ({ ...u, ep: newEp }))
    };

    newState = publishEvent(newState, {
        type: 'ON_EP_GAINED',
        sourceId: targetId,
        targetId: targetId,
        epGained: amount,
        value: amount
    });

    return newState;
}

// Skill Logic
/**
 * フォフォの戦闘スキル効果を適用する
 * デバフ解除、ターゲットおよび隣接味方の回復、「厄払い」の付与を行う
 * 
 * @param state 現在のゲーム状態
 * @param source フォフォのユニットデータ
 * @param target スキル対象のユニットデータ
 * @returns 更新されたゲーム状態
 */
function applyHuohuoSkill(state: GameState, source: Unit, target: Unit): GameState {
    let newState = state;

    // E5: Skill Lv+2
    const skillLevel = calculateAbilityLevel(source.eidolonLevel || 0, 5, 'Skill');
    const mainHeal = getLeveledValue(ABILITY_VALUES.skillHealMain, skillLevel);
    const adjHeal = getLeveledValue(ABILITY_VALUES.skillHealAdj, skillLevel);

    // E4: Low HP Scaling (Max +80% heal)
    const getE4Boost = (u: Unit) => {
        if (source.eidolonLevel! >= 4) {
            const hpPct = u.hp / u.stats.hp;
            return 0.8 * (1 - hpPct);
        }
        return 0;
    };

    // 1. Cleanse Target
    newState = cleanse(newState, target.id, 1);

    // 2. Heal Target
    newState = applyHealing(newState, source.id, target.id, {
        scaling: 'hp',
        multiplier: mainHeal.mult,
        flat: mainHeal.flat,
        additionalOutgoingBoost: getE4Boost(target)
    }, 'フォフォスキル回復(主)', true);

    // E6 Check
    newState = applyE6Buff(newState, source, target);

    // 3. Heal Adjacent
    const allies = newState.registry.getAliveAllies();
    const targetIdx = allies.findIndex(u => u.id === target.id);
    if (targetIdx !== -1) {
        const adjacent = [];
        if (targetIdx > 0) adjacent.push(allies[targetIdx - 1]);
        if (targetIdx < allies.length - 1) adjacent.push(allies[targetIdx + 1]);

        adjacent.forEach(adj => {
            newState = applyHealing(newState, source.id, adj.id, {
                scaling: 'hp',
                multiplier: adjHeal.mult,
                flat: adjHeal.flat,
                additionalOutgoingBoost: getE4Boost(adj)
            }, 'フォフォスキル回復(副)', true);
            newState = applyE6Buff(newState, source, adj);
        });
    }

    // 4. Grant Divine Provision
    newState = grantDivineProvision(newState, source.id);

    return newState;
}

// Grant 'Divine Provision' (Eyakubarai)
/**
 * 天賦効果「厄払い」を付与する
 * 
 * @param state 現在のゲーム状態
 * @param sourceId フォフォのユニットID
 * @param overrideDuration 持続時間の強制指定（A2などで使用）
 * @returns 更新されたゲーム状態
 */
function grantDivineProvision(state: GameState, sourceId: string, overrideDuration?: number): GameState {
    const source = state.registry.get(createUnitId(sourceId));
    if (!source) return state;

    let duration = overrideDuration ?? 2;
    if (source.eidolonLevel! >= 1 && overrideDuration === undefined) duration += 1; // E1: Duration +1 if standard cast

    // Determine current trigger count. If rebuffing, reset to 6.
    const triggerCount = 6;

    const effect: IEffect = {
        id: EFFECT_IDS.DIVINE_PROVISION(sourceId),
        name: "厄払い",
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED', // Decreases at start of Huohuo's turn
        duration: duration,
        tags: ['HUOHUO_TALENT'],
        stackCount: triggerCount,

        onApply: (t, s) => {
            // E1 Speed Buff Logic
            if (source.eidolonLevel! >= 1) {
                s.registry.getAliveAllies().forEach(ally => {
                    const speedBuff: IEffect = {
                        id: EFFECT_IDS.E1_SPEED_BUFF(sourceId, ally.id),
                        name: "歳陽の拠り所: 速度+12%",
                        category: 'BUFF',
                        sourceUnitId: sourceId,
                        durationType: 'LINKED',
                        duration: 0,
                        linkedEffectId: EFFECT_IDS.DIVINE_PROVISION(sourceId),
                        modifiers: [{ source: 'フォフォE1', target: 'spd_pct', type: 'add', value: 0.12 }],
                        apply: (nt, ns) => ns, remove: (nt, ns) => ns
                    };
                    s = addEffect(s, ally.id, speedBuff);
                });
            }
            return s;
        },
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    return addEffect(state, sourceId, effect);
}

// Trigger Divine Provision Healing/Cleanse
/**
 * 「厄払い」による回復とデバフ解除をトリガーする
 * 
 * @param state 現在のゲーム状態
 * @param sourceId フォフォのユニットID
 * @param triggerTargetId トリガーの起点となったユニットID（ターン開始者または必殺技発動者）
 * @param isUltTrigger 必殺技によるトリガーかどうか
 * @returns 更新されたゲーム状態
 */
function triggerDivineProvision(state: GameState, sourceId: string, triggerTargetId: string, isUltTrigger: boolean = false): GameState {
    const source = state.registry.get(createUnitId(sourceId));
    if (!source) return state;

    const buff = source.effects.find(e => e.id === EFFECT_IDS.DIVINE_PROVISION(sourceId));
    if (!buff) return state;

    // Check trigger count
    let currentTriggers = buff.stackCount || 0;
    if (currentTriggers <= 0) return state;

    // Talent Scaling
    // E3: Talent Lv+2
    const talentLevel = calculateAbilityLevel(source.eidolonLevel || 0, 3, 'Talent');
    const healValues = getLeveledValue(ABILITY_VALUES.talentHeal, talentLevel);

    // E4 Boost Helper
    const getE4Boost = (u: Unit) => {
        if (source.eidolonLevel! >= 4) {
            const hpPct = u.hp / u.stats.hp;
            return 0.8 * (1 - hpPct);
        }
        return 0;
    };

    // Targets: Trigger Target + Allies <= 50% HP
    const targetsToHeal = new Set<string>();
    targetsToHeal.add(triggerTargetId);

    state.registry.getAliveAllies().forEach(ally => {
        if (ally.hp / ally.stats.hp <= 0.50) {
            targetsToHeal.add(ally.id);
        }
    });

    // Execute Heal & Cleanse
    const targetIds = Array.from(targetsToHeal);
    let triggersConsumed = 0;

    for (const tid of targetIds) {
        // Healing happens as long as Divine Provision is active (checked by caller/duration)
        // Cleanse happens only if trigger count (stackCount) > 0

        const targetUnit = state.registry.get(createUnitId(tid));
        if (!targetUnit) continue;

        // Heal
        state = applyHealing(state, sourceId, tid, {
            scaling: 'hp',
            multiplier: healValues.mult,
            flat: healValues.flat,
            additionalOutgoingBoost: getE4Boost(targetUnit)
        }, '厄払い自動回復', true);

        // Cleanse Logic (Limited to 6 times)
        if (currentTriggers > 0) {
            // Check if there are cleansable debuffs? 
            // Usually "Triggered 6 times" means the *capacity* to cleanse is used up, 
            // usually regardless of whether a debuff was actually removed?
            // "When healed, dispel 1 debuff. This effect can be triggered 6 times."
            // If no debuff, does it consume? Usually yes in HSR (triggered effect).
            // But for "Cleanse X times", usually it consumes only on cleanse?
            // User said "The number of debuff removal effects".
            // I will assume it consumes 1 count per "Attempt to cleanse on a target".
            // Or strictly "Consume only if debuff removed"? 
            // Given "Triggered 6 times" applies to the clause "Dispel 1 debuff", I'll assume it consumes if it tries.
            // Let's rely on standard logic: Trigger happens -> Consume count.

            // Cleanse 1 debuff
            // Note: cleanse function in utils handles finding debuffs. 
            // Ideally we check if cleanse is needed if we want to save counts, but usually it's "First 6 triggers of Healing also Cleanse".

            state = cleanse(state, tid, 1);
            currentTriggers--;
            triggersConsumed++;
        }

        // A6: Recover 1 Energy
        if (source.traces?.some(t => t.id === 'huohuo-trace-a6')) {
            state = addEnergy(state, sourceId, 1);
        }

        // E6 Buff
        state = applyE6Buff(state, source, targetUnit);
    }

    // Update Trigger Count in Effect
    if (triggersConsumed > 0) {
        const updatedBuff = { ...buff, stackCount: currentTriggers };
        const updatedEffects = source.effects.map(e => e.id === buff.id ? updatedBuff : e);
        state = {
            ...state,
            registry: state.registry.update(createUnitId(sourceId), u => ({ ...u, effects: updatedEffects }))
        };
    }

    return state;
}

/**
 * E6効果：回復を受けた味方の与ダメージをアップする
 * 
 * @param state 現在のゲーム状態
 * @param source フォフォのユニットデータ
 * @param target 回復を受けたユニットデータ
 * @returns 更新されたゲーム状態
 */
function applyE6Buff(state: GameState, source: Unit, target: Unit): GameState {
    if (source.eidolonLevel! < 6) return state;

    const buff: IEffect = {
        id: EFFECT_IDS.E6_DMG_BUFF(source.id, target.id),
        name: "苦楽を共にする仲間: 与ダメ+50%",
        category: "BUFF",
        sourceUnitId: source.id,
        durationType: "TURN_END_BASED", // 2 turns
        duration: 2,
        skipFirstTurnDecrement: true, // Standard for "lasts 2 turns" applied on turn
        modifiers: [{ source: 'フォフォE6', target: 'all_type_dmg_boost', type: 'add', value: 0.50 }],
        apply: (t, s) => s, remove: (t, s) => s
    };

    return addEffect(state, target.id, buff);
}

// --- Handler Factory ---

export const huohuoHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, eidolonLevel = 0) => {
    return {
        handlerMetadata: {
            id: `huohuo-handler-${sourceUnitId}`,
            subscribesTo: ['ON_BATTLE_START', 'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_TURN_START', 'ON_BEFORE_DEATH']
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const source = state.registry.get(createUnitId(sourceUnitId));
            if (!source) return state;

            let newState = state;

            // Battle Start: A2 (Divine Provision for 1 turn)
            if (event.type === 'ON_BATTLE_START') {
                if (source.traces?.some(t => t.id === 'huohuo-trace-a2')) {
                    newState = grantDivineProvision(newState, sourceUnitId, 1); // Override duration to 1
                }

                // Technique: 
                const useTechnique = source.config?.useTechnique !== false;
                if (useTechnique) {
                    newState.registry.getAliveEnemies().forEach(enemy => {
                        const debuff: IEffect = {
                            id: EFFECT_IDS.TECHNIQUE_DEBUFF(sourceUnitId, enemy.id),
                            name: "魂魄飛散: 攻撃力-25%",
                            category: "DEBUFF",
                            sourceUnitId: sourceUnitId,
                            durationType: "TURN_END_BASED",
                            duration: 2,
                            skipFirstTurnDecrement: true,
                            modifiers: [{ source: 'フォフォ秘技', target: 'atk_pct', type: 'add', value: -0.25 }],
                            apply: (t, s) => s, remove: (t, s) => s
                        };
                        newState = addEffect(newState, enemy.id, debuff);
                    });
                }
            }

            // Skill Used
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                const action = event as ActionEvent;
                if (action.targetId) {
                    const target = newState.registry.get(createUnitId(action.targetId));
                    if (target) {
                        newState = applyHuohuoSkill(newState, source, target);
                    }
                }
            }

            // Ultimate Used
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');

                // Energy Regen Pct
                const energyPct = (ultLevel >= 12) ? 0.21 : 0.20;

                // Atk Buff Pct
                const atkPct = (ultLevel >= 12) ? 0.432 : 0.40;

                newState.registry.getAliveAllies().forEach(ally => {
                    // Energy (Exclude Huohuo)
                    if (ally.id !== sourceUnitId) {
                        const amount = (ally.stats.max_ep || 140) * energyPct;
                        newState = addEnergy(newState, ally.id, amount);
                    }

                    // ATK Buff
                    const buff: IEffect = {
                        id: EFFECT_IDS.ULT_ATK_BUFF(sourceUnitId, ally.id),
                        name: "フォフォ必殺: 攻撃力アップ",
                        category: "BUFF",
                        sourceUnitId: sourceUnitId,
                        durationType: "TURN_END_BASED",
                        duration: 2,
                        skipFirstTurnDecrement: true,
                        modifiers: [{ source: 'フォフォ必殺技', target: 'atk_pct', type: 'add', value: atkPct }],
                        apply: (t, s) => s, remove: (t, s) => s
                    };
                    newState = addEffect(newState, ally.id, buff);
                });

                // Trigger Divine Provision (if active)
                newState = triggerDivineProvision(newState, sourceUnitId, sourceUnitId, true);
            }

            // Talent Trigger (Ally Turn Start, Ally Ult)
            if (event.type === 'ON_TURN_START' || event.type === 'ON_ULTIMATE_USED') {
                let triggerUnitId: string | undefined;
                if (event.type === 'ON_TURN_START') {
                    triggerUnitId = (event as GeneralEvent).targetId;
                } else if (event.type === 'ON_ULTIMATE_USED') {
                    triggerUnitId = (event as ActionEvent).sourceId;
                }

                if (triggerUnitId) {
                    const triggerUnit = newState.registry.get(createUnitId(triggerUnitId));
                    if (triggerUnit && !triggerUnit.isEnemy) {
                        // Valid ally trigger
                        newState = triggerDivineProvision(newState, sourceUnitId, triggerUnit.id);
                    }
                }
            }

            // E2: Prevent Death
            if (event.type === 'ON_BEFORE_DEATH' && eidolonLevel >= 2) {
                // TypeScript should narrow this, but explicit cast for clarity/safety if union handling is tricky
                const deathEvent = event as import('../../simulator/engine/types').BeforeDeathEvent;
                const targetId = deathEvent.targetId;
                if (targetId) {
                    // Check Divine Provision
                    const hasDivineProvision = source.effects.some(e => e.id === EFFECT_IDS.DIVINE_PROVISION(sourceUnitId));
                    if (hasDivineProvision) {
                        const E2_COUNTER_ID = `huohuo-e2-counter-${sourceUnitId}`;
                        const counterEffect = source.effects.find(e => e.id === E2_COUNTER_ID);
                        const usageCount = counterEffect ? (counterEffect.stackCount || 0) : 0;

                        if (usageCount < 2) {
                            // Prevent Death
                            const target = newState.registry.get(createUnitId(targetId));
                            if (target) {
                                const restore = (target.stats.hp || target.baseStats.hp) * 0.50;

                                newState = applyHealing(newState, sourceUnitId, targetId, {
                                    multiplier: 0, flat: restore, scaling: 'hp'
                                }, 'フォフォE2蘇生', true);

                                // Reduce Divine Provision Duration by 1
                                const dpEffect = source.effects.find(e => e.id === EFFECT_IDS.DIVINE_PROVISION(sourceUnitId));
                                if (dpEffect) {
                                    const newDuration = (dpEffect.duration || 0) - 1;
                                    if (newDuration <= 0) {
                                        newState = removeEffect(newState, sourceUnitId, dpEffect.id);
                                    } else {
                                        const updated = { ...dpEffect, duration: newDuration };
                                        newState = {
                                            ...newState,
                                            registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                                                ...u,
                                                effects: u.effects.map(e => e.id === dpEffect.id ? updated : e)
                                            }))
                                        };
                                    }
                                }

                                // Update Usage Count
                                if (counterEffect) {
                                    const updatedCounter = { ...counterEffect, stackCount: usageCount + 1 };
                                    newState = {
                                        ...newState,
                                        registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                                            ...u,
                                            effects: u.effects.map(e => e.id === E2_COUNTER_ID ? updatedCounter : e)
                                        }))
                                    };
                                } else {
                                    const newCounter: IEffect = {
                                        id: E2_COUNTER_ID,
                                        name: "フォフォE2発動回数",
                                        category: "OTHER",
                                        sourceUnitId: sourceUnitId,
                                        durationType: "PERMANENT",
                                        duration: -1,
                                        stackCount: 1,
                                        apply: (t, s) => s, remove: (t, s) => s
                                    };
                                    newState = addEffect(newState, sourceUnitId, newCounter);
                                }

                                // Prevent death flag
                                deathEvent.preventDeath = true; // Modifying event object in place? 
                                // Usually handlers return state, but ON_BEFORE_DEATH implies controlling the outcome.
                                // If the engine respects the event object modification (by reference), this works.
                                // Otherwise, we need to return a modified state that the engine understands as checking prevention.
                                // Engine Types says: "Handler can set preventDeath to true".
                                // Since we assume event is mutable or passed by ref in the engine loop? 
                                // OR we need to return something? 
                                // Looking at engine types: `(event: IEvent, state: GameState, handlerId: string): GameState;`
                                // It returns GameState. It doesn't return the event. 
                                // So modifying the event object (which is passed by reference) is the standard patterns for observers.

                                newState = { ...newState, log: [...newState.log, { actionType: "復活", sourceId: sourceUnitId, targetId: targetId, details: "フォフォE2により戦闘不能回避" }] };
                            }
                        }
                    }
                }
            }

            return newState;
        }
    };
};
