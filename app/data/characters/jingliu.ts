
import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, ActionAdvanceAction, IEventHandlerLogic } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';

import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { consumeHp } from '../../simulator/engine/utils';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { checkDebuffSuccess } from '../../simulator/engine/dispatcher';

// --- Constants ---
const CHARACTER_ID = 'jingliu';

const EFFECT_IDS = {
    SYZYGY: 'jingliu-syzygy', // 朔望
    TRANSMIGRATION: 'jingliu-transmigration', // 転魄状態
    MOONLIGHT: 'jingliu-moonlight', // 月光
    E1_BUFF: 'jingliu-e1-buff',
    E2_NEXT_ENHANCED_SKILL_BOOST: 'jingliu-e2-boost',
    TECHNIQUE_FREEZE: 'jingliu-technique-freeze',
};

const TRACE_IDS = {
    A2_DEATH_REALM: 'jingliu-trace-a2', // 死境
    A4_SWORD_HEAD: 'jingliu-trace-a4', // 剣首
    A6_FROST_SOUL: 'jingliu-trace-a6', // 霜魄
};

// --- Ability Values ---
const ABILITY_VALUES = {
    // Talent: CritRate
    talentCritRate: {
        10: 0.50,
        12: 0.52
    } as Record<number, number>,

    talentCritDmgPerStack: {
        10: 0.44, // 44%
        12: 0.484
    } as Record<number, number>,
};

// Constants
const ALLY_HP_CONSUME_PCT = 0.05; // 5%
const SYZYGY_CAP_DEFAULT = 4;
const SYZYGY_CAP_E6 = 5;
const MOONLIGHT_CAP = 5;
const TECHNIQUE_FREEZE_CHANCE = 1.0; // 基礎確率100%

// Additional Abilities
const A2_RES_BOOST = 0.35; // 35%
const A2_ULT_DMG_BOOST = 0.20; // 20%
const A6_DEF_IGNORE = 0.25; // 25%

// Eidolons
const E2_NEXT_ENHANCED_DMG = 0.80; // 80%
const E4_CRIT_DMG_PER_STACK = 0.20; // +20% per moonlight stack
const E6_RES_PEN = 0.30; // 30%

// EP
const SKILL_NORMAL_EP = 20;
const ULT_EP = 5;


// --- Helper Functions ---

function getSyzygy(unit: Unit): number {
    const effect = unit.effects.find(e => e.id === `${EFFECT_IDS.SYZYGY}-${unit.id}`);
    return effect?.stackCount || 0;
}

function updateSyzygy(state: GameState, unitId: string, delta: number, eidolonLevel: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const maxSyzygy = eidolonLevel >= 6 ? SYZYGY_CAP_E6 : SYZYGY_CAP_DEFAULT;
    const effectId = `${EFFECT_IDS.SYZYGY}-${unitId}`;
    const existing = unit.effects.find(e => e.id === effectId);
    let current = existing?.stackCount || 0;

    let nextStack = Math.min(Math.max(current + delta, 0), maxSyzygy);

    let newState = state;
    const inTransmigration = unit.effects.some(e => e.id === `${EFFECT_IDS.TRANSMIGRATION}-${unitId}`);

    if (existing) {
        const newEffects = unit.effects.map(e => e.id === effectId ? { ...e, stackCount: nextStack, name: `朔望 (${nextStack})` } : e);
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(unitId), u => ({ ...u, effects: newEffects }))
        };
    } else {
        if (nextStack > 0) {
            const effect: IEffect = {
                id: effectId,
                name: `朔望 (${nextStack})`,
                category: 'BUFF',
                sourceUnitId: unitId,
                durationType: 'PERMANENT',
                duration: -1,
                stackCount: nextStack,
                maxStacks: maxSyzygy,


            };
            newState = addEffect(newState, unitId, effect);
        }
    }

    const updatedUnit = newState.registry.get(createUnitId(unitId))!;
    const updatedSyzygy = getSyzygy(updatedUnit);

    // Enter Transmigration Trigger
    if (!inTransmigration && updatedSyzygy >= 2) {
        newState = enterTransmigration(newState, unitId, eidolonLevel);
        // Gain 1 (Standard) or 2 (E6) extra Syzygy
        const extraGain = eidolonLevel >= 6 ? 2 : 1;
        newState = updateSyzygy(newState, unitId, extraGain, eidolonLevel);
    }

    // Exit Transmigration Trigger
    if (inTransmigration && updatedSyzygy === 0) {
        newState = exitTransmigration(newState, unitId);
    }

    return newState;
}

function enterTransmigration(state: GameState, unitId: string, eidolonLevel: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const critRate = getLeveledValue(ABILITY_VALUES.talentCritRate, talentLevel);

    const effect: IEffect = {
        id: `${EFFECT_IDS.TRANSMIGRATION}-${unitId}`,
        name: '転魄',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        modifiers: [
            { target: 'crit_rate' as StatKey, value: critRate, type: 'add' as const, source: '転魄' }
        ],
        tags: ['TRANSMIGRATION'],

        /* remove removed */
    };

    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_DEATH_REALM);
    if (hasA2) {
        effect.modifiers?.push({ target: 'effect_res' as StatKey, value: A2_RES_BOOST, type: 'add' as const, source: 'A2' });
        effect.modifiers?.push({ target: 'ult_dmg_boost' as StatKey, value: A2_ULT_DMG_BOOST, type: 'add' as const, source: 'A2' });
    }

    if (eidolonLevel >= 6) {
        effect.modifiers?.push({ target: 'res_pen' as StatKey, value: E6_RES_PEN, type: 'add' as const, source: 'E6' });
    }

    let newState = addEffect(state, unitId, effect);

    // Swap Skill to Enhanced Skill
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(unitId), u => ({
            ...u,
            abilities: {
                ...u.abilities,
                skill: jingliu.abilities.enhancedSkill!
            }
        }))
    };

    newState = {
        ...newState,
        pendingActions: [
            {
                type: 'ACTION_ADVANCE',
                targetId: unitId,
                percent: 1.0
            } as ActionAdvanceAction,
            ...newState.pendingActions
        ]
    };

    return newState;
}

function exitTransmigration(state: GameState, unitId: string): GameState {
    let newState = removeEffect(state, unitId, `${EFFECT_IDS.TRANSMIGRATION}-${unitId}`);
    newState = removeEffect(newState, unitId, `${EFFECT_IDS.MOONLIGHT}-${unitId}`);

    // Restore Normal Skill
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(unitId), u => ({
            ...u,
            abilities: {
                ...u.abilities,
                skill: jingliu.abilities.skill
            }
        }))
    };

    return newState;
}

function addMoonlight(state: GameState, unitId: string, amount: number, eidolonLevel: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const inTransmigration = unit.effects.some(e => e.id === `${EFFECT_IDS.TRANSMIGRATION}-${unitId}`);
    if (!inTransmigration) return state;

    const effectId = `${EFFECT_IDS.MOONLIGHT}-${unitId}`;
    const existing = unit.effects.find(e => e.id === effectId);
    let current = existing?.stackCount || 0;

    const newStack = Math.min(current + amount, MOONLIGHT_CAP);

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    let critDmgPerStack = getLeveledValue(ABILITY_VALUES.talentCritDmgPerStack, talentLevel);

    if (eidolonLevel >= 4) {
        critDmgPerStack += E4_CRIT_DMG_PER_STACK;
    }

    const totalCritDmg = newStack * critDmgPerStack;

    if (existing) {
        const newEffects = unit.effects.map(e => e.id === effectId ? {
            ...e,
            stackCount: newStack,
            name: `月光 (${newStack})`,
            modifiers: [{ target: 'crit_dmg' as StatKey, value: totalCritDmg, type: 'add' as const, source: '月光' }]
        } : e);
        return {
            ...state,
            registry: state.registry.update(createUnitId(unitId), u => ({ ...u, effects: newEffects }))
        };
    } else {
        const effect: IEffect = {
            id: effectId,
            name: `月光 (${newStack})`,
            category: 'BUFF',
            sourceUnitId: unitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: newStack,
            maxStacks: MOONLIGHT_CAP,
            modifiers: [{ target: 'crit_dmg' as StatKey, value: totalCritDmg, type: 'add' as const, source: '月光' }],
            tags: ['MOONLIGHT'],

            /* remove removed */
        };
        return addEffect(state, unitId, effect);
    }
}

function consumeAllyHpForAttack(state: GameState, jingliuId: string, eidolonLevel: number): GameState {
    const jingliu = state.registry.get(createUnitId(jingliuId));
    if (!jingliu) return state;

    const allies = state.registry.getAllies(createUnitId(jingliuId));
    let newState = state;

    allies.forEach(ally => {
        if (ally.id === jingliu.id) return;

        const consumeAmount = ally.stats.hp * ALLY_HP_CONSUME_PCT;

        const currentHp = ally.hp;
        let actualConsume = consumeAmount;
        if (currentHp - actualConsume < 1) {
            actualConsume = Math.max(0, currentHp - 1);
        }

        if (actualConsume > 0) {
            const ratio = actualConsume / ally.stats.hp;
            const { state: s, consumed } = consumeHp(newState, jingliuId, ally.id, ratio, '淡月転魄', { minHp: 1 });

            newState = s;
            newState = addMoonlight(newState, jingliuId, 1, eidolonLevel);
        }
    });

    return newState;
}

export const jingliu: Character = {
    id: CHARACTER_ID,
    name: '鏡流',
    path: 'Destruction',
    element: 'Ice',
    rarity: 5,
    maxEnergy: 140,
    baseStats: {
        hp: 1435,
        atk: 679,
        def: 485,
        spd: 96,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 125
    },
    abilities: {
        basic: {
            id: 'jingliu-basic',
            name: '流影穿',
            type: 'Basic ATK',
            description: '指定した敵単体に鏡流の最大HP50%分の氷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'hp',
                hits: [{ multiplier: 0.50, toughnessReduction: 10 }]
            },
            energyGain: 20,
            targetType: 'single_enemy'
        },
        skill: {
            id: 'jingliu-skill',
            name: '無罅の飛光', // Normal
            type: 'Skill',
            description: '敵単体にダメージ、朔望1層獲得。',
            energyGain: SKILL_NORMAL_EP,
            targetType: 'single_enemy',
            spCost: 1
        },
        enhancedSkill: {
            id: 'jingliu-enhanced-skill',
            name: '寒川映月', // Enhanced
            type: 'Skill',
            description: '指定した敵単体とその隣接する敵に氷属性ダメージを与える。「朔望」を1層消費する。SPを消費しない。',
            energyGain: 30, // トレースで+20/30? 要確認: Enhanced Skill通常30、Normal 20
            targetType: 'blast', // 拡散
            spCost: 0,
            damage: {
                type: 'blast',
                scaling: 'atk',
                // ダメージ倍率はレベル10基準で仮置き (Lv10: 250% main, 125% adj)
                mainHits: [{ multiplier: 2.50, toughnessReduction: 20 }], // 強化スキル削靭値20
                adjacentHits: [{ multiplier: 1.25, toughnessReduction: 10 }] // 隣接10
            }
        },
        ultimate: {
            id: 'jingliu-ultimate',
            name: '曇華生滅、夢瀉す天河',
            type: 'Ultimate',
            description: '拡散ダメージ、朔望1層獲得。',
            energyGain: ULT_EP,
            targetType: 'blast',
            damage: {
                type: 'blast',
                scaling: 'atk',
                // Lv10: 300% main, 150% adj
                mainHits: [{ multiplier: 3.00, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: 1.50, toughnessReduction: 20 }]
            }
        },
        talent: {
            id: 'jingliu-talent',
            name: '淡月転魄',
            type: 'Talent',
            description: '朔望2層で転魄状態へ。',
            targetType: 'self'
        },
        technique: {
            id: 'jingliu-technique',
            name: '神識照らす月影',
            type: 'Technique',
            description: '凍結領域生成。戦闘開始時EP15回復、朔望1層獲得、敵凍結。',
            targetType: 'self'
        }
    },
    traces: [
        {
            id: TRACE_IDS.A2_DEATH_REALM,
            name: '死境',
            type: 'Bonus Ability',
            description: '転魄中、効果抵抗+35%、必殺技ダメ+20%。'
        },
        {
            id: TRACE_IDS.A4_SWORD_HEAD,
            name: '剣首',
            type: 'Bonus Ability',
            description: '無罅の飛光後EP15、寒川映月後EP8追加回復。'
        },
        {
            id: TRACE_IDS.A6_FROST_SOUL,
            name: '霜魄',
            type: 'Bonus Ability',
            description: '朔望獲得時上限なら防御無視25%(次の一撃)。'
        },
        {
            id: 'jingliu-stat-crit-dmg',
            name: '会心ダメージ',
            type: 'Stat Bonus',
            description: '会心ダメージ+37.3%',
            stat: 'crit_dmg',
            value: 0.373
        },
        {
            id: 'jingliu-stat-spd',
            name: '速度',
            type: 'Stat Bonus',
            description: '速度+9',
            stat: 'spd',
            value: 9
        },
        {
            id: 'jingliu-stat-hp',
            name: 'HP',
            type: 'Stat Bonus',
            description: 'HP+10.0%',
            stat: 'hp_pct',
            value: 0.10
        }
    ],
    eidolons: {
        e1: { level: 1, name: '天関を犯す月', description: '必殺技/強化スキル時会心ダメ+24%、単体時追加ダメージ。' },
        e2: { level: 2, name: '月暈に七星', description: '必殺技後、次強化スキル+80%。' },
        e3: { level: 3, name: '望月に迫る半璧', description: '必殺技+2, 天賦+2。' },
        e4: { level: 4, name: '掌の月光', description: '月光1層につき会心ダメ+さらに20%。' },
        e5: { level: 5, name: '三台を蝕む玉鏡', description: 'スキル+2, 通常+1。' },
        e6: { level: 6, name: '婁宿を蝕む氷輪', description: '転魄時朔望上限+1、突入時+2層、貫通30%。' }
    },
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'i-shall-be-my-own-sword',
        superimposition: 1,
        relicSetId: 'hunter-of-glacial-forest',
        ornamentSetId: 'rutilant-arena',
        mainStats: {
            body: 'crit_dmg',
            feet: 'spd',
            sphere: 'ice_dmg_boost',
            rope: 'atk_pct'
        },
        subStats: [
            { stat: 'crit_rate', value: 0.10 },
            { stat: 'crit_dmg', value: 0.50 },
            { stat: 'atk_pct', value: 0.15 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// --- Logic Factory ---

export const jingliuHandlerFactory: IEventHandlerFactory = (sourceUnitId, eidolonLevel, parameter) => {
    return {
        handlerMetadata: {
            id: `jingliu-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_DAMAGE_DEALT'
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string) => {
            if (event.type !== 'ON_BATTLE_START' && event.sourceId !== sourceUnitId) return state;

            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            let newState = state;

            // Battle Start: Technique
            if (event.type === 'ON_BATTLE_START') {
                if (unit.config?.useTechnique !== false) {
                    newState = addEnergyToUnit(newState, sourceUnitId, 15);
                    newState = updateSyzygy(newState, sourceUnitId, 1, eidolonLevel);

                    // Technique Freeze
                    const enemies = newState.registry.getAliveEnemies();
                    for (const enemy of enemies) {
                        if (checkDebuffSuccess(unit, enemy, TECHNIQUE_FREEZE_CHANCE, 'Freeze')) {
                            const freezeEffect: IEffect = {
                                id: `${EFFECT_IDS.TECHNIQUE_FREEZE}-${enemy.id}`,
                                name: '凍結',
                                category: 'DEBUFF',
                                sourceUnitId: sourceUnitId,
                                durationType: 'TURN_START_BASED',
                                duration: 1, // 1 turn
                                tags: ['FREEZE', 'CROWD_CONTROL'],
                                // logic handled by engine
                                /* remove removed */
                            };
                            newState = addEffect(newState, enemy.id, freezeEffect);
                        }
                    }
                }
            }


            // Skill Used
            if (event.type === 'ON_SKILL_USED') {
                const inTransmigration = unit.effects.some(e => e.id === `${EFFECT_IDS.TRANSMIGRATION}-${sourceUnitId}`);

                if (inTransmigration) {
                    newState = updateSyzygy(newState, sourceUnitId, -1, eidolonLevel);

                    if (unit.traces?.some(t => t.id === TRACE_IDS.A4_SWORD_HEAD)) {
                        newState = addEnergyToUnit(newState, sourceUnitId, 8);
                    }

                    newState = consumeAllyHpForAttack(newState, sourceUnitId, eidolonLevel);

                    newState = removeEffect(newState, sourceUnitId, `${EFFECT_IDS.E2_NEXT_ENHANCED_SKILL_BOOST}-${sourceUnitId}`);

                } else {
                    newState = updateSyzygy(newState, sourceUnitId, 1, eidolonLevel);

                    if (unit.traces?.some(t => t.id === TRACE_IDS.A4_SWORD_HEAD)) {
                        newState = addEnergyToUnit(newState, sourceUnitId, 15);
                    }
                }
            }

            // Ultimate Used
            if (event.type === 'ON_ULTIMATE_USED') {
                newState = updateSyzygy(newState, sourceUnitId, 1, eidolonLevel);

                const inTransmigration = unit.effects.some(e => e.id === `${EFFECT_IDS.TRANSMIGRATION}-${sourceUnitId}`);
                if (inTransmigration) {
                    newState = consumeAllyHpForAttack(newState, sourceUnitId, eidolonLevel);
                }

                if (eidolonLevel >= 2) {
                    const e2Effect: IEffect = {
                        id: `${EFFECT_IDS.E2_NEXT_ENHANCED_SKILL_BOOST}-${sourceUnitId}`,
                        name: 'E2 強化スキルBuff',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,
                        modifiers: [{ target: 'dmg_boost' as StatKey, value: E2_NEXT_ENHANCED_DMG, type: 'add' as const, source: 'E2' }],

                        /* remove removed */
                    };
                    newState = addEffect(newState, sourceUnitId, e2Effect);
                }
            }

            return newState;
        }
    };
};

export const jingliuActionHandler: IEventHandlerLogic = (event, state, handlerId) => {
    return state;
}
