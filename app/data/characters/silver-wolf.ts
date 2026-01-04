
import { Character, StatKey, IAbility, Element, Modifier, ELEMENTS } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit } from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateDamageWithCritInfo } from '../../simulator/damage';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';

// --- Constants ---
const CHARACTER_ID = 'silver-wolf';

const EFFECT_IDS = {
    WEAKNESS_IMPLANT: (targetId: string, element: string) => `sw-weakness-${targetId}-${element}`,
    RES_DOWN_ELEMENTAL: (targetId: string, element: string) => `sw-res-down-elem-${targetId}-${element}`,
    RES_DOWN_ALL: (targetId: string) => `sw-res-down-all-${targetId}`,
    DEF_DOWN_ULT: (targetId: string) => `sw-def-down-ult-${targetId}`,
    BUG_ATK: (targetId: string) => `sw-bug-atk-${targetId}`,
    BUG_DEF: (targetId: string) => `sw-bug-def-${targetId}`,
    BUG_SPD: (targetId: string) => `sw-bug-spd-${targetId}`,
    E2_VULNERABILITY: (targetId: string) => `sw-e2-vuln-${targetId}`,
    A6_BUFF: (sourceId: string) => `sw-a6-atk-buff-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2_CREATE: 'sw-trace-a2',
    A4_INJECT: 'sw-trace-a4',
    A6_ANNOTATE: 'sw-trace-a6',
} as const;

// --- Ability Values ---
const ABILITY_VALUES = {
    basicDmg: { 6: 1.00, 7: 1.10 } as Record<number, number>,
    skillChance: { 10: 1.20, 12: 1.28 } as Record<number, number>,
    skillAllResDown: { 10: 0.13, 12: 0.135 } as Record<number, number>,
    skillDmg: { 10: 1.96, 12: 2.156 } as Record<number, number>,
    ultDefDownChance: { 10: 1.20, 12: 1.28 } as Record<number, number>,
    ultDefDownVal: { 10: 0.45, 12: 0.468 } as Record<number, number>,
    ultDmg: { 10: 3.80, 12: 4.104 } as Record<number, number>,
    talentAtkDown: { 10: 0.10, 12: 0.11 } as Record<number, number>,
    talentDefDown: { 10: 0.12, 12: 0.132 } as Record<number, number>,
    talentSpdDown: { 10: 0.06, 12: 0.066 } as Record<number, number>,
    talentChance: { 10: 1.00, 12: 1.08 } as Record<number, number>,
};

// --- Values ---
const BASIC_EP = 20;
const SKILL_EP = 30;
const ULT_EP = 5;

const SKILL_ELEM_RES_PEN_VAL = 0.20; // Fixed
const SKILL_IMPLANT_DURATION = 3; // Weakness Implant
const SKILL_ALL_RES_DURATION = 2; // All RES Down

const ULT_DEF_DOWN_DURATION = 3;

const TALENT_DURATION_BASE = 3; // Base duration

// --- Helper Functions ---

function removePreviousWeaknessImplants(state: GameState, targetId: string): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    let newState = state;
    const implants = target.effects.filter(e => e.id.match(/^sw-weakness-/));

    implants.forEach(e => {
        newState = removeEffect(newState, targetId, e.id);
    });

    const resDowns = target.effects.filter(e => e.id.match(/^sw-res-down-elem-/));
    resDowns.forEach(e => {
        newState = removeEffect(newState, targetId, e.id);
    });

    return newState;
}

function selectImplantElement(state: GameState, targetId: string, sourceUnitId: string): Element {
    // Determine active allies from registry (preserving insertion order usually)
    const activeMembers = state.registry.toArray().filter(u => !u.isEnemy && u.hp > 0);

    if (activeMembers.length === 0) return 'Quantum';

    const slot1Unit = activeMembers[0];

    if (slot1Unit && slot1Unit.hp > 0) {
        return slot1Unit.element;
    }

    const elements = Array.from(new Set(activeMembers.map(u => u.element)));

    const seed = state.time + targetId.length;
    return elements[seed % elements.length];
}

function createWeaknessImplantEffect(sourceId: string, targetId: string, element: Element): IEffect {
    // Closure state to track if we actually added the weakness (meaning it wasn't there before)
    let added = false;

    return {
        id: EFFECT_IDS.WEAKNESS_IMPLANT(targetId, element),
        name: `弱点埋め込み: ${element}`,
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: SKILL_IMPLANT_DURATION,
        skipFirstTurnDecrement: true,
        onApply: (t, s) => {
            // Check if weakness exists
            if (!t.weaknesses.has(element)) {
                added = true;
                // Immutable interaction with Set: create new Set
                const newWeaknesses = new Set(t.weaknesses);
                newWeaknesses.add(element);

                return {
                    ...s,
                    registry: s.registry.update(createUnitId(t.id), u => ({
                        ...u,
                        weaknesses: newWeaknesses
                    }))
                };
            }
            added = false;
            return s;
        },
        onRemove: (t, s) => {
            if (added) {
                const newWeaknesses = new Set(t.weaknesses);
                newWeaknesses.delete(element);
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(t.id), u => ({
                        ...u,
                        weaknesses: newWeaknesses
                    }))
                };
            }
            return s;
        }
    };
}

// --- Character Definition ---

export const silverWolf: Character = {
    id: CHARACTER_ID,
    name: '銀狼',
    path: 'Nihility',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 110,
    baseStats: {
        hp: 1047,
        atk: 640,
        def: 460,
        spd: 107,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100
    },
    abilities: {
        basic: {
            id: 'sw-basic',
            name: 'システム警告',
            type: 'Basic ATK',
            description: '指定した敵単体にダメージ。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.25, toughnessReduction: 3 },
                    { multiplier: 0.25, toughnessReduction: 3 },
                    { multiplier: 0.50, toughnessReduction: 4 },
                ],
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'sw-skill',
            name: '変更を許可しますか？',
            type: 'Skill',
            description: '敵単体に弱点埋め込み + 全耐性ダウン + ダメージ。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.96, toughnessReduction: 20 }],
            },
            energyGain: SKILL_EP,
            spCost: 1,
            targetType: 'single_enemy',
        },

        ultimate: {
            id: 'sw-ult',
            name: 'アカウントがBANされた',
            type: 'Ultimate',
            description: '敵全体の防御力ダウン + 全体ダメージ。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 3.8, toughnessReduction: 30 }],
            },
            energyGain: ULT_EP,
            targetType: 'all_enemies',
        },

        talent: {
            id: 'sw-talent',
            name: 'プログラム応答なし…',
            type: 'Talent',
            description: '攻撃時、確率で欠陥（ATK/DEF/SPDダウン）を埋め込む。',
            energyGain: 0,
        },

        technique: {
            id: 'sw-technique',
            name: 'プロセス強制終了',
            type: 'Technique',
            description: '戦闘開始時、敵全体にダメージと弱点無視削靭。',
        },
    },

    traces: [
        { id: TRACE_IDS.A2_CREATE, name: '作成', type: 'Bonus Ability', description: '欠陥継続+1T。撃破時欠陥付与。' },
        { id: TRACE_IDS.A4_INJECT, name: '注入', type: 'Bonus Ability', description: '開幕EP+20、ターン開始EP+5。' },
        { id: TRACE_IDS.A6_ANNOTATE, name: 'アノテーション', type: 'Bonus Ability', description: '効果命中により攻撃力アップ。' },
        { id: 'sw-stat-atk', name: '攻撃力', type: 'Stat Bonus', stat: 'atk_pct', value: 0.28, description: '攻撃力+28%' },
        { id: 'sw-stat-ehr', name: '効果命中', type: 'Stat Bonus', stat: 'effect_hit_rate', value: 0.18, description: '効果命中+18%' },
        { id: 'sw-stat-q-dmg', name: '量子属性ダメージ', type: 'Stat Bonus', stat: 'quantum_dmg_boost', value: 0.08, description: '量子属性ダメージ+8%' }
    ],

    eidolons: {
        e1: { level: 1, name: '社会工学', description: '必殺技後、敵デバフ数x7EP回復(Max 5回)。' },
        e2: { level: 2, name: 'ボットネット', description: '敵入城時被ダメ+20%。味方被弾時SWが欠陥付与。' },
        e3: {
            level: 3,
            name: 'ペイロード',
            description: 'Skill+2, Talent+2',
            abilityModifiers: [
                // スキル Lv10 (196%) -> Lv12 (215.6%)
                { abilityName: 'skill', param: 'damage.hits.0.multiplier', value: 2.156 },
            ]
        },
        e4: { level: 4, name: 'バウンス攻撃', description: '必殺技追撃(デバフ数x20%)。' },
        e5: {
            level: 5,
            name: '総当たり攻撃',
            description: 'Ult+2, Basic+1',
            abilityModifiers: [
                // 必殺技 Lv10 (380%) -> Lv12 (410.4%)
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 4.104 },
                // 通常攻撃 Lv6 (100%) -> Lv7 (110%)
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.275 }, // 0.25 * 1.1
                { abilityName: 'basic', param: 'damage.hits.1.multiplier', value: 0.275 },
                { abilityName: 'basic', param: 'damage.hits.2.multiplier', value: 0.55 },
            ]
        },
        e6: { level: 6, name: 'オーバーレイ ネットワーク', description: 'デバフ数x20%与ダメ増(Max 100%)。' },
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'before-the-tutorial-mission-starts',
        superimposition: 1,
        relicSetId: 'messenger-traversing-hackerspace',
        ornamentSetId: 'lushaka-the-sunken-seas',
        mainStats: {
            body: 'effect_hit_rate',
            feet: 'spd',
            sphere: 'quantum_dmg_boost',
            rope: 'energy_regen_rate'
        },
        subStats: [
            { stat: 'effect_hit_rate', value: 0.50 },
            { stat: 'spd', value: 10 },
            { stat: 'crit_rate', value: 0.15 },
            { stat: 'crit_dmg', value: 0.30 }
        ],
        rotationMode: 'sequence',
        rotation: ['skill', 'basic', 'basic'],
        ultStrategy: 'immediate',
    }
};

// --- Handlers ---

const onBattleStart: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `sw-battle-start-${sourceUnitId}`,
            subscribesTo: ['ON_BATTLE_START', 'ON_ENEMY_SPAWNED'],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;
            let newState = state;

            if (event.type === 'ON_BATTLE_START') {
                const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_INJECT);
                if (hasA4) {
                    newState = addEnergyToUnit(newState, sourceUnitId, 20, 0, false, { sourceId: sourceUnitId, publishEventFn: publishEvent });
                }
            }

            if (event.type === 'ON_ENEMY_SPAWNED' && (param || 0) >= 2) {
                if ('targetId' in event && event.targetId) {
                    const vulnEffect: IEffect = {
                        id: EFFECT_IDS.E2_VULNERABILITY(event.targetId),
                        name: 'ボットネット (被ダメUP)',
                        category: 'DEBUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,
                        modifiers: [{
                            source: 'ボットネット',
                            target: 'all_dmg_taken_boost',
                            type: 'add',
                            value: 0.20
                        }],

                        /* remove removed */
                    };
                    newState = addEffect(newState, event.targetId, vulnEffect);
                }
            }

            return newState;
        }
    };
};

const onTurnStart: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `sw-turn-start-${sourceUnitId}`,
            subscribesTo: ['ON_TURN_START'],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            if ('targetId' in event && event.targetId !== sourceUnitId) return state;

            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            let newState = state;

            const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_INJECT);
            if (hasA4) {
                newState = addEnergyToUnit(newState, sourceUnitId, 5, 0, false, { sourceId: sourceUnitId, publishEventFn: publishEvent });
            }

            return newState;
        }
    };
};

function applyRandomBug(state: GameState, sourceId: string, targetId: string, level: number, traces: any[]): GameState {
    const hasA2 = traces.some(t => t.id === TRACE_IDS.A2_CREATE);
    const bonusDuration = hasA2 ? 1 : 0;
    const duration = TALENT_DURATION_BASE + bonusDuration;

    const bugs = ['ATK', 'DEF', 'SPD'];
    const type = bugs[Math.floor(Math.random() * bugs.length)];

    const talentLevel = calculateAbilityLevel(level, 3, 'Talent');

    let effectId = '';
    let name = '';
    let modifiers: Modifier[] = [];

    if (type === 'ATK') {
        const val = getLeveledValue(ABILITY_VALUES.talentAtkDown, talentLevel);
        effectId = EFFECT_IDS.BUG_ATK(targetId);
        name = '欠陥: 攻撃力ダウン';
        modifiers = [{ source: name, target: 'atk_pct', type: 'add', value: -val }];
    } else if (type === 'DEF') {
        const val = getLeveledValue(ABILITY_VALUES.talentDefDown, talentLevel);
        effectId = EFFECT_IDS.BUG_DEF(targetId);
        name = '欠陥: 防御力ダウン';
        modifiers = [{ source: name, target: 'def_pct', type: 'add', value: -val }];
    } else {
        const val = getLeveledValue(ABILITY_VALUES.talentSpdDown, talentLevel);
        effectId = EFFECT_IDS.BUG_SPD(targetId);
        name = '欠陥: 速度ダウン';
        modifiers = [{ source: name, target: 'spd_pct', type: 'add', value: -val }];
    }

    const bugEffect: IEffect = {
        id: effectId,
        name: name,
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: modifiers,

        /* remove removed */
    };

    return addEffect(state, targetId, bugEffect);
}


const onAction: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `sw-action-${sourceUnitId}`,
            subscribesTo: ['ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_ATTACK', 'ON_ENEMY_DEFEATED', 'ON_BREAK'],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            const eidolonLevel = param || 0;
            let newState = state;

            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId && 'targetId' in event && event.targetId) {
                const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');

                const target = state.registry.get(createUnitId(event.targetId));
                if (target) {
                    const implantElement = selectImplantElement(newState, event.targetId, sourceUnitId);

                    newState = removePreviousWeaknessImplants(newState, event.targetId);

                    const wasAlreadyWeak = target.weaknesses.has(implantElement);

                    const wEffect = createWeaknessImplantEffect(sourceUnitId, event.targetId, implantElement);
                    newState = addEffect(newState, event.targetId, wEffect);

                    if (!wasAlreadyWeak) {
                        const resEffect: IEffect = {
                            id: EFFECT_IDS.RES_DOWN_ELEMENTAL(event.targetId, implantElement),
                            name: `耐性ダウン: ${implantElement}`,
                            category: 'DEBUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            duration: SKILL_IMPLANT_DURATION,
                            skipFirstTurnDecrement: true,
                            modifiers: [{
                                source: '弱点属性耐性ダウン',
                                target: `${implantElement.toLowerCase()}_res` as StatKey,
                                type: 'add',
                                value: -0.20
                            }],

                            /* remove removed */
                        };
                        newState = addEffect(newState, event.targetId, resEffect);
                    }

                    const allResVal = getLeveledValue(ABILITY_VALUES.skillAllResDown, skillLevel);

                    // Create modifiers for each element to simulate "All Type RES Down"
                    const allResModifiers: Modifier[] = ELEMENTS.map(elem => ({
                        source: '全属性耐性ダウン',
                        target: `${elem.toLowerCase()}_res` as StatKey,
                        type: 'add',
                        value: -allResVal
                    }));

                    const allResEffect: IEffect = {
                        id: EFFECT_IDS.RES_DOWN_ALL(event.targetId),
                        name: '全耐性ダウン',
                        category: 'DEBUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_END_BASED',
                        duration: SKILL_ALL_RES_DURATION,
                        skipFirstTurnDecrement: true,
                        modifiers: allResModifiers,

                        /* remove removed */
                    };
                    newState = addEffect(newState, event.targetId, allResEffect);
                }
            }

            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
                const defVal = getLeveledValue(ABILITY_VALUES.ultDefDownVal, ultLevel);

                state.registry.toArray().forEach(u => {
                    if (u.isEnemy && u.hp > 0) {
                        const defEffect: IEffect = {
                            id: EFFECT_IDS.DEF_DOWN_ULT(u.id),
                            name: '防御力ダウン',
                            category: 'DEBUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            duration: ULT_DEF_DOWN_DURATION,
                            skipFirstTurnDecrement: true,
                            modifiers: [{
                                source: '防御力ダウン',
                                target: 'def_pct',
                                type: 'add',
                                value: -defVal
                            }],

                            /* remove removed */
                        };
                        newState = addEffect(newState, u.id, defEffect);
                    }
                });

                if (eidolonLevel >= 1) {
                    let totalTriggers = 0;
                    const MAX_TRIGGERS = 5;

                    state.registry.toArray().forEach(u => {
                        if (u.isEnemy && u.hp > 0 && totalTriggers < MAX_TRIGGERS) {
                            const debuffCount = u.effects.filter(e => e.category === 'DEBUFF').length;
                            const triggers = Math.min(debuffCount, MAX_TRIGGERS - totalTriggers);
                            totalTriggers += triggers;
                        }
                    });

                    if (totalTriggers > 0) {
                        const epAmount = totalTriggers * 7;
                        newState = addEnergyToUnit(newState, sourceUnitId, epAmount, 0, false, { sourceId: sourceUnitId, publishEventFn: publishEvent });
                    }
                }
            }

            if (event.type === 'ON_ATTACK' && event.sourceId === sourceUnitId && 'targetId' in event && event.targetId) {
                newState = applyRandomBug(newState, sourceUnitId, event.targetId, eidolonLevel, unit.traces || []);
            }

            if (event.type === 'ON_ATTACK' && event.sourceId !== sourceUnitId && eidolonLevel >= 2 && 'targetId' in event && event.targetId) {
                const att = state.registry.get(createUnitId(event.sourceId));
                if (att && !att.isEnemy) {
                    newState = applyRandomBug(newState, sourceUnitId, event.targetId, eidolonLevel, unit.traces || []);
                }
            }

            if (event.type === 'ON_WEAKNESS_BREAK' && event.sourceId === sourceUnitId && 'targetId' in event && event.targetId) {
                const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_CREATE);
                if (hasA2) {
                    newState = applyRandomBug(newState, sourceUnitId, event.targetId, eidolonLevel, unit.traces || []);
                }
            }

            if (event.type === 'ON_ENEMY_DEFEATED') {
                const victimId = (event as any).targetId;

                if (victimId) {
                    const victim = state.registry.get(createUnitId(victimId));
                    if (victim) {
                        const implant = victim.effects.find(e => e.id.match(/^sw-weakness-/));

                        if (implant) {
                            const element = implant.id.split('-').pop();

                            if (element) {
                                const candidates = state.registry.toArray().filter(u =>
                                    u.isEnemy && u.hp > 0 && u.id !== victimId &&
                                    !u.effects.some(e => e.id.match(/^sw-weakness-/))
                                );

                                if (candidates.length > 0) {
                                    candidates.sort((a, b) => b.stats.hp - a.stats.hp);
                                    const newTarget = candidates[0];

                                    const wEffect = createWeaknessImplantEffect(sourceUnitId, newTarget.id, element as Element);
                                    newState = addEffect(newState, newTarget.id, wEffect);
                                }
                            }
                        }
                    }
                }
            }

            return newState;
        }
    };
};

const e4e6Handler: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `sw-e4e6-${sourceUnitId}`,
            subscribesTo: ['ON_ULTIMATE_USED', 'ON_BEFORE_DAMAGE_CALCULATION'],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;
            const eidolonLevel = param || 0;
            let newState = state;

            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId && eidolonLevel >= 4) {
                state.registry.toArray().forEach(target => {
                    if (target.isEnemy && target.hp > 0) {
                        const debuffCount = target.effects.filter(e => e.category === 'DEBUFF').length;
                        const triggers = Math.min(debuffCount, 5);

                        if (triggers > 0) {
                            const dmgMult = 0.20 * triggers;

                            const e4Ability: IAbility = {
                                id: 'sw-e4-proc',
                                name: 'バウンス攻撃 (追撃)',
                                type: 'Talent',
                                description: 'E4 Bonus Damage',
                                damage: {
                                    type: 'simple',
                                    scaling: 'atk',
                                    hits: [{ multiplier: dmgMult, toughnessReduction: 0 }]
                                }
                            };

                            const mockAction: any = { type: 'ULTIMATE', sourceId: sourceUnitId, targetId: target.id };
                            const dmgResult = calculateDamageWithCritInfo(unit, target, e4Ability, mockAction);

                            const applyResult = applyUnifiedDamage(newState, unit, target, dmgResult.damage, {
                                damageType: 'ADDITIONAL_DAMAGE',
                                details: 'E4 Bonus Damage',
                                isCrit: dmgResult.isCrit,
                                breakdownMultipliers: dmgResult.breakdownMultipliers,
                                skipLog: true,
                                additionalDamageEntry: {
                                    source: '銀狼',
                                    name: 'E4: 縛りの結び目',
                                    damageType: 'additional',
                                    isCrit: dmgResult.isCrit,
                                    breakdownMultipliers: dmgResult.breakdownMultipliers
                                }
                            });
                            newState = applyResult.state;
                        }
                    }
                });
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceUnitId && eidolonLevel >= 6) {
                const targetId = event.targetId;
                if (targetId) {
                    const target = newState.registry.get(createUnitId(targetId));
                    if (target) {
                        const debuffCount = target.effects.filter(e => e.category === 'DEBUFF').length;
                        const boost = Math.min(debuffCount * 0.20, 1.00);

                        if (boost > 0) {
                            newState = {
                                ...newState,
                                damageModifiers: {
                                    ...newState.damageModifiers,
                                    allTypeDmg: (newState.damageModifiers.allTypeDmg || 0) + boost
                                }
                            };
                        }
                    }
                }
            }

            return newState;
        }
    };
};

export const silverWolfHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, param) => {
    const battle = onBattleStart(sourceUnitId, level, param);
    const turn = onTurnStart(sourceUnitId, level, param);
    const action = onAction(sourceUnitId, level, param);
    const e4e6 = e4e6Handler(sourceUnitId, level, param);

    return {
        handlerMetadata: {
            id: `sw-handler-${sourceUnitId}`,
            subscribesTo: [
                ...battle.handlerMetadata.subscribesTo,
                ...turn.handlerMetadata.subscribesTo,
                ...action.handlerMetadata.subscribesTo,
                ...e4e6.handlerMetadata.subscribesTo,
            ]
        },
        handlerLogic: (event, state, handlerId) => {
            let newState = state;
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            newState = battle.handlerLogic(event, newState, handlerId);
            newState = turn.handlerLogic(event, newState, handlerId);
            newState = action.handlerLogic(event, newState, handlerId);
            // Apply E4/E6
            newState = e4e6.handlerLogic(event, newState, handlerId);

            // A6: Shatter (EHR -> ATK)
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceUnitId) {
                const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6_ANNOTATE);
                if (hasA6) {
                    const ehr = unit.stats.effect_hit_rate || 0;
                    // "Increases ATK by 10% for every 10% EHR, max 50%"
                    const steps = Math.min(5, Math.floor(ehr * 100 / 10));
                    const boost = steps * 0.10;

                    if (boost > 0) {
                        const currentBoost = newState.damageModifiers.atkBoost || 0;
                        newState = {
                            ...newState,
                            damageModifiers: {
                                ...newState.damageModifiers,
                                atkBoost: currentBoost + boost
                            }
                        };
                    }
                }
            }

            // Technique: Force Quit Program
            if (event.type === 'ON_BATTLE_START' && event.sourceId === sourceUnitId) {
                // Reduce Toughness (Standard 60)
                let newRegistry = newState.registry;
                newState.registry.toArray().forEach(u => {
                    if (u.isEnemy && u.hp > 0) {
                        const reduceAmount = 60;
                        newRegistry = newRegistry.update(u.id, char => ({
                            ...char,
                            toughness: Math.max(0, char.toughness - reduceAmount)
                        }));
                    }
                });

                newState = {
                    ...newState,
                    registry: newRegistry
                };
            }

            return newState;
        }
    };
};

