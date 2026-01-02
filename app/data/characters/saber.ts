import { Character, Element, Path, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, ActionEvent } from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyHealing, applyShield, advanceAction } from '../../simulator/engine/utils';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateAbilityLevel, getLeveledValue } from '../../simulator/utils/abilityLevel';

// --- 定数定義 ---
const CHARACTER_ID = 'saber';

const ABILITY_VALUES = {
    basic: { 6: 1.00, 7: 1.10 },
    enhancedBasic: { 6: 2.00, 7: 2.20 },
    skillMain: { 10: 1.50, 12: 1.65, 15: 1.80 },
    skillAdj: { 10: 0.75, 12: 0.825, 15: 0.90 },
    ultAll: { 10: 2.80, 12: 3.08, 15: 3.36 },
    ultRandom: { 10: 0.30, 12: 0.33, 15: 0.36 },
    talentDmg: { 10: 0.60, 12: 0.66, 15: 0.72 },
};

const EFFECT_IDS = {
    REACTOR_CORE: (unitId: string) => `saber-reactor-core-${unitId}`,
    MANA_BURST: (unitId: string) => `saber-mana-burst-${unitId}`,
    ENHANCED_BASIC: (unitId: string) => `saber-enhanced-basic-${unitId}`,
    TALENT_DMG_BUFF: (unitId: string) => `saber-talent-dmg-buff-${unitId}`,
    TECHNIQUE_ATK_BUFF: (unitId: string) => `saber-technique-atk-buff-${unitId}`,
    E2_DEF_IGNORE: (unitId: string) => `saber-e2-def-ignore-${unitId}`,
    E4_RES_PEN: (unitId: string) => `saber-e4-res-pen-${unitId}`,
    TRACE_A6_CRIT_DMG: (unitId: string) => `saber-a6-crit-dmg-${unitId}`,
    TRACE_A6_STACK: (unitId: string) => `saber-a6-stack-${unitId}`,
    E6_ULT_COUNTER: (unitId: string) => `saber-e6-ult-counter-${unitId}`,
    E6_FIRST_ULT: (unitId: string) => `saber-e6-first-ult-${unitId}`,
} as const;

const MAX_REACTOR_CORE = 99;
const TALENT_EP_RECOVERY = 8.0;

// --- キャラクター定義 ---
export const saber: Character = {
    id: CHARACTER_ID,
    name: 'セイバー',
    path: 'Destruction',
    element: 'Wind',
    rarity: 5,
    maxEnergy: 360,
    ultCost: 360,
    baseStats: {
        hp: 1241,
        atk: 601,
        def: 654,
        spd: 101,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 125
    },
    abilities: {
        basic: {
            id: 'invisible-air',
            name: '風王結界',
            type: 'Basic ATK',
            description: '敵単体に風属性ダメージ。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.00, toughnessReduction: 10 }]
            },
            energyGain: 20,
        },
        skill: {
            id: 'strike-air',
            name: '風王鉄槌',
            type: 'Skill',
            description: '拡散攻撃。条件付きでEP大量回復。',
            targetType: 'single_enemy',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 1.50, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: 0.75, toughnessReduction: 10 }]
            },
            energyGain: 30,
        },
        ultimate: {
            id: 'excalibur',
            name: '約束された勝利の剣',
            type: 'Ultimate',
            description: '全体攻撃+ランダム10ヒット。',
            targetType: 'all_enemies',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 2.80, toughnessReduction: 30 }]
            },
            energyGain: 5,
        },
        talent: {
            id: 'dragon-heart',
            name: '竜の炉心',
            type: 'Talent',
            description: '「炉心共鳴」スタック管理。',
        },
        technique: {
            id: 'knights-outing',
            name: '騎士王の出陣',
            type: 'Technique',
            description: '攻撃力UP。',
        }
    },
    traces: [
        {
            id: 'trace-a2',
            name: '竜の騎士',
            type: 'Bonus Ability',
            description: '会心率+20%。魔力放出。',
            stat: 'crit_rate',
            value: 0.20
        },
        {
            id: 'trace-a4',
            name: '湖の祝福',
            type: 'Bonus Ability',
            description: 'EP上限突破。',
        },
        {
            id: 'trace-a6',
            name: '星の冠',
            type: 'Bonus Ability',
            description: 'スキル発動時会心ダメUP。炉心共鳴獲得で会心ダメ累積。',
        }
    ],
    eidolons: {
        e1: { level: 1, name: '星魂1', description: '必殺技ダメUP' },
        e2: { level: 2, name: '星魂2', description: '防御無視累積' },
        e3: { level: 3, name: '星魂3', description: 'LvUP' },
        e4: { level: 4, name: '星魂4', description: '風貫通UP' },
        e5: { level: 5, name: '星魂5', description: 'LvUP' },
        e6: { level: 6, name: '星魂6', description: 'EP回復強化' },
    },
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'a-thankless-coronation',
        superimposition: 1,
        relicSetId: 'wavestrider-captain',
        ornamentSetId: 'rutilant-arena',
        mainStats: {
            body: 'crit_dmg',
            feet: 'atk_pct',
            sphere: 'wind_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.12 },
            { stat: 'crit_dmg', value: 0.40 },
            { stat: 'atk_pct', value: 0.15 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// --- 共通ヘルパー ---

function GetMaxEnergyWithOverflow(unit: Unit): number {
    const isE6 = (unit.eidolonLevel || 0) >= 6;
    const isA4 = (unit.traces || []).some(t => t.id === 'trace-a4');

    let cap = saber.maxEnergy; // 360

    // E6: A4の「EP上限突破」の効果量が強化される（+120 -> +200）
    // つまり、最大EPは 360 + 200 = 560 となる（+120と重複しない）
    if (isE6) return cap + 200;

    // A4のみ: 最大EP +120
    if (isA4) return cap + 120;

    return cap;
}

// 炉心共鳴獲得処理を一元化（累積バフの処理のため）
function addReactorCoreWrapper(state: GameState, unit: Unit, amount: number): GameState {
    let newState = state;

    if (amount <= 0) return newState;

    // 1. 炉心共鳴スタックを追加（stackStrategy: 'add' を使用）
    newState = addEffect(newState, unit.id, {
        id: EFFECT_IDS.REACTOR_CORE(unit.id),
        name: '炉心共鳴',
        type: 'BUFF',
        category: 'BUFF',
        stackCount: amount,
        maxStacks: MAX_REACTOR_CORE,
        stackStrategy: 'add', // 追加時に現在値 + amount
        duration: -1,
        durationType: 'PERMANENT',
        sourceUnitId: unit.id,
        // 炉心共鳴自体はステータスを持たない（スタック数管理のみ）
    });

    // 2. A6 (昇格6: 星の冠): 炉心共鳴獲得ごとに会心ダメ+4%累積（独立永続バフ）
    if ((unit.traces || []).some(t => t.id === 'trace-a6')) {
        newState = addEffect(newState, unit.id, {
            id: EFFECT_IDS.TRACE_A6_STACK(unit.id),
            name: 'A6: 星の冠（累積）',
            type: 'BUFF',
            category: 'BUFF',
            stackCount: amount,
            maxStacks: MAX_REACTOR_CORE, // 炉心共鳴と同期
            stackStrategy: 'add',
            duration: -1,
            durationType: 'PERMANENT',
            sourceUnitId: unit.id,
            modifiers: [{
                target: 'crit_dmg',
                value: 0.04, // スタックあたり4%（自動乗算）
                type: 'add',
                source: 'A6: 星の冠（累積）'
            }],
        });
    }

    // 3. E2: 防御無視累積（独立永続バフ、Max 15層）
    if ((unit.eidolonLevel || 0) >= 2) {
        // 現在のE2スタック数を取得
        const currentE2Stacks = getE2DefIgnoreStacks(newState, unit.id);
        const newE2Stacks = Math.min(currentE2Stacks + amount, 15); // 15層キャップ
        const addAmount = newE2Stacks - currentE2Stacks;

        if (addAmount > 0) {
            newState = addEffect(newState, unit.id, {
                id: EFFECT_IDS.E2_DEF_IGNORE(unit.id),
                name: 'E2: 防御無視',
                type: 'BUFF',
                category: 'BUFF',
                stackCount: addAmount,
                maxStacks: 15, // 15層キャップ
                stackStrategy: 'add',
                duration: -1,
                durationType: 'PERMANENT',
                sourceUnitId: unit.id,
                modifiers: [{
                    target: 'def_ignore',
                    value: 0.01, // スタックあたり1%（自動乗算、Max15%）
                    type: 'add',
                    source: 'E2: 防御無視'
                }],
            });
        }
    }

    return newState;
}

// E2防御無視の現在スタック数を取得するヘルパー
function getE2DefIgnoreStacks(state: GameState, unitId: string): number {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.E2_DEF_IGNORE(unitId));
    return effect?.stackCount || 0;
}

function getStacks(unit: Unit, effectId: string): number {
    return unit.effects.find(e => e.id === effectId)?.stackCount || 0;
}

// --- ハンドラー ---

const onBattleStart = (event: IEvent, state: GameState, sourceId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const unit = newState.registry.get(createUnitId(sourceId));
    if (!unit) return newState;

    // 天賦: 1層獲得
    newState = addReactorCoreWrapper(newState, unit, 1);

    // 昇格2: 魔力放出
    if ((unit.traces || []).some(t => t.id === 'trace-a2')) {
        newState = addEffect(newState, unit.id, {
            id: EFFECT_IDS.MANA_BURST(sourceId),
            name: '魔力放出',
            type: 'BUFF',
            category: 'BUFF',
            duration: -1,
            durationType: 'TURN_START_BASED',
            sourceUnitId: unit.id,

            /* remove removed */
        });
    }

    // 昇格4: EP回復
    if ((unit.traces || []).some(t => t.id === 'trace-a4')) {
        const threshold = saber.maxEnergy * 0.60;
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(sourceId), u => {
                if (u.ep < threshold) {
                    return { ...u, ep: threshold };
                }
                return u;
            })
        };
    }

    return newState;
}

const onTurnStart = (event: IEvent, state: GameState, sourceId: string): GameState => {
    return state;
};

const onSkillUsed = (event: ActionEvent, state: GameState, sourceId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceId));
    const target = newState.registry.get(createUnitId(event.targetId!));
    if (!source || !target) return newState;

    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const reactorStacks = getStacks(source, EFFECT_IDS.REACTOR_CORE(sourceId));
    const missingEnergy = GetMaxEnergyWithOverflow(source) - source.ep;

    // EP回復判定
    const skillBaseGain = 30;
    const maxRecoverable = reactorStacks * TALENT_EP_RECOVERY;

    // 「EPを満タンまで回復できる場合」
    const canIsFull = (skillBaseGain + maxRecoverable) >= missingEnergy;

    // A2 再行動チェック
    const hasManaBurst = source.effects.some(e => e.id === EFFECT_IDS.MANA_BURST(sourceId));
    const isA2Unlocked = (source.traces || []).some(t => t.id === 'trace-a2');

    if (isA2Unlocked && hasManaBurst && reactorStacks > 0 && canIsFull) {
        newState.skillPoints = Math.min(newState.skillPoints + 1, newState.maxSkillPoints);
        newState = removeEffect(newState, source.id, EFFECT_IDS.MANA_BURST(sourceId));
        newState = advanceAction(newState, sourceId, 1.0, 'percent'); // 'pct' -> 'percent'
    }

    // A6: 会心ダメUP
    if ((source.traces || []).some(t => t.id === 'trace-a6')) {
        newState = addEffect(newState, source.id, {
            id: EFFECT_IDS.TRACE_A6_CRIT_DMG(sourceId),
            name: 'A6: 会心ダメUP',
            type: 'BUFF',
            category: 'BUFF',
            duration: 2,
            durationType: 'TURN_END_BASED',
            modifiers: [{ target: 'crit_dmg', value: 0.50, type: 'add', source: 'A6' }],
            sourceUnitId: source.id,

            /* remove removed */
        });
    }

    if (reactorStacks > 0 && canIsFull) {
        // 消費モード
        const stacksConsumed = reactorStacks; // 全消費
        // ダメージボーナス計算
        const baseBonus = 0.10; // 仮置きZ%
        const e2Bonus = eidolonLevel >= 2 ? 0.07 : 0;
        const dmgBonusPct = stacksConsumed * (baseBonus + e2Bonus);

        const mainMult = getLeveledValue(ABILITY_VALUES.skillMain, skillLevel) * (1 + dmgBonusPct);

        const dmgResult = applyUnifiedDamage(newState, source, target, source.stats.atk * mainMult, {
            damageType: 'SKILL_DAMAGE',
            details: `スキル(消費${stacksConsumed})`,
            skipLog: true // 統合ログに出力されるため個別のログ行をスキップ
        });
        newState = dmgResult.state;

        // 消費 & 回復
        newState = removeEffect(newState, source.id, EFFECT_IDS.REACTOR_CORE(sourceId));
        const recoverAmount = stacksConsumed * TALENT_EP_RECOVERY;

        // 最新のunitを取得してEP更新
        const currentSource = newState.registry.get(source.id);
        if (currentSource) {
            currentSource.ep = Math.min(GetMaxEnergyWithOverflow(currentSource), currentSource.ep + recoverAmount);
        }

    } else {
        // 通常 & 獲得モード
        const mainMult = getLeveledValue(ABILITY_VALUES.skillMain, skillLevel);
        const dmgResult = applyUnifiedDamage(newState, source, target, source.stats.atk * mainMult, {
            damageType: 'SKILL_DAMAGE',
            details: 'スキル',
            skipLog: true
        });
        newState = dmgResult.state;

        // スタック獲得: 基本3層 + E1で+1層 = 合計4層
        const currentSource = newState.registry.get(source.id);
        if (currentSource) {
            const gainAmount = eidolonLevel >= 1 ? 4 : 3;
            newState = addReactorCoreWrapper(newState, currentSource, gainAmount);
        }
    }

    return newState;
}
    ;

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceId));
    if (!source) return newState;

    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');

    // E4
    if (eidolonLevel >= 4) {
        newState = addEffect(newState, source.id, {
            id: EFFECT_IDS.E4_RES_PEN(sourceId),
            name: 'E4: 風貫通UP',
            type: 'BUFF',
            category: 'BUFF',
            stackCount: 1,
            maxStacks: 3,
            duration: -1,
            durationType: 'TURN_START_BASED',
            modifiers: [{ target: 'wind_res_pen', value: 0.04, type: 'add', source: 'E4' }],
            sourceUnitId: source.id,

            /* remove removed */
        });
    }

    // 全体ダメージ
    const allEnemies = newState.registry.getAliveEnemies();

    const allMult = getLeveledValue(ABILITY_VALUES.ultAll, ultLevel);

    allEnemies.forEach(tUnit => {
        const ur = applyUnifiedDamage(newState, source, tUnit, source.stats.atk * allMult, {
            damageType: 'ULTIMATE_DAMAGE',
            details: '必殺技(全体)',
            skipLog: true
        });
        newState = ur.state;
    });

    // ランダム10ヒット
    const randomMult = getLeveledValue(ABILITY_VALUES.ultRandom, ultLevel);
    if (allEnemies.length > 0) {
        for (let i = 0; i < 10; i++) {
            const currentSource = newState.registry.get(source.id) || source;
            const randIdx = Math.floor(Math.random() * allEnemies.length);
            const tUnit = allEnemies[randIdx];
            const ur = applyUnifiedDamage(newState, currentSource, tUnit, source.stats.atk * randomMult, {
                damageType: 'ULTIMATE_DAMAGE',
                details: '必殺技(追撃)',
                skipLog: true
            });
            newState = ur.state;
        }
    }

    // 強化通常フラグ
    newState = addEffect(newState, source.id, {
        id: EFFECT_IDS.ENHANCED_BASIC(sourceId),
        name: '解放されし黄金の王権',
        type: 'BUFF',
        category: 'BUFF',
        duration: -1,
        durationType: 'TURN_START_BASED',
        sourceUnitId: source.id,

        /* remove removed */
    });

    // E6: EP回復ロジック
    if (eidolonLevel >= 6) {
        // 初回フラグチェック
        const firstUlt = source.effects.some(e => e.id === EFFECT_IDS.E6_FIRST_ULT(sourceId));
        if (!firstUlt) {
            // 初回: 固定300回復
            source.ep = Math.min(GetMaxEnergyWithOverflow(source), source.ep + 300);
            newState = addEffect(newState, source.id, {
                id: EFFECT_IDS.E6_FIRST_ULT(sourceId),
                name: 'E6初回達成',
                type: 'BUFF',
                category: 'BUFF',
                duration: -1,
                durationType: 'TURN_START_BASED',
                sourceUnitId: source.id,

                /* remove removed */
            });
        } else {
            // 2回目以降: 3回ごとに回復
            const currentCount = getStacks(source, EFFECT_IDS.E6_ULT_COUNTER(sourceId));
            const newCount = currentCount + 1;

            if (newCount >= 3) {
                // 3回目達成 -> 回復
                source.ep = Math.min(GetMaxEnergyWithOverflow(source), source.ep + 300);
                // カウンターリセット (0に戻すためremove)
                newState = removeEffect(newState, source.id, EFFECT_IDS.E6_ULT_COUNTER(sourceId));
            } else {
                // カウンター更新 (addEffectでstack数指定)
                newState = addEffect(newState, source.id, {
                    id: EFFECT_IDS.E6_ULT_COUNTER(sourceId),
                    name: 'E6必殺技カウント',
                    type: 'BUFF',
                    category: 'BUFF',
                    stackCount: 1, // +1
                    maxStacks: 3,
                    duration: -1,
                    durationType: 'TURN_START_BASED',
                    sourceUnitId: source.id,

                    /* remove removed */
                });
            }
        }
    }

    return newState;
};

const onBasicAtkUsed = (event: ActionEvent, state: GameState, sourceId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceId));
    const target = newState.registry.get(createUnitId(event.targetId!));
    if (!source || !target) return newState;

    const isEnhanced = source.effects.some(e => e.id === EFFECT_IDS.ENHANCED_BASIC(sourceId));

    let mult = 1.0;

    if (isEnhanced) {
        // 強化通常攻撃
        const basicLevel = calculateAbilityLevel(eidolonLevel, 3, 'Basic');
        mult = getLeveledValue(ABILITY_VALUES.enhancedBasic, basicLevel);

        const ur = applyUnifiedDamage(newState, source, target, source.stats.atk * mult, {
            damageType: 'BASIC_DAMAGE',
            details: '強化通常攻撃',
            skipLog: true
        });
        newState = ur.state;

        // 強化解除
        newState = removeEffect(newState, source.id, EFFECT_IDS.ENHANCED_BASIC(sourceId));

        // 昇格2
        if ((source.traces || []).some(t => t.id === 'trace-a2')) {
            newState = addEffect(newState, source.id, {
                id: EFFECT_IDS.MANA_BURST(sourceId),
                name: '魔力放出',
                type: 'BUFF',
                category: 'BUFF',
                duration: -1,
                durationType: 'TURN_START_BASED',
                sourceUnitId: source.id,

                /* remove removed */
            });
        }
    } else {
        // 通常攻撃
        const basicLevel = calculateAbilityLevel(eidolonLevel, 3, 'Basic');
        mult = getLeveledValue(ABILITY_VALUES.basic, basicLevel);

        const ur = applyUnifiedDamage(newState, source, target, source.stats.atk * mult, {
            damageType: 'BASIC_DAMAGE',
            details: '通常攻撃',
            skipLog: true
        });
        newState = ur.state;
    }

    // E1: 通常後も「炉心共鳴」1層獲得
    if (eidolonLevel >= 1) {
        const currentSource = newState.registry.get(source.id);
        if (currentSource) {
            newState = addReactorCoreWrapper(newState, currentSource, 1);
        }
    }

    return newState;
};

const onAllyAbilityUsed = (event: ActionEvent, state: GameState, sourceId: string, eidolonLevel: number): GameState => {
    // 自分以外の必殺技またはスキル
    if ((event.type === 'ON_ULTIMATE_USED' || event.type === 'ON_SKILL_USED') && event.sourceId !== sourceId) {
        let newState = state;
        const source = newState.registry.get(createUnitId(sourceId));
        if (!source) return newState;

        // 与ダメアップ
        const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
        const dmgBuff = getLeveledValue(ABILITY_VALUES.talentDmg, talentLevel);

        newState = addEffect(newState, source.id, {
            id: EFFECT_IDS.TALENT_DMG_BUFF(sourceId),
            name: '竜の炉心: 与ダメUP',
            type: 'BUFF',
            category: 'BUFF',
            duration: 2,
            durationType: 'TURN_END_BASED',
            modifiers: [{ target: 'all_type_dmg_boost', value: dmgBuff, type: 'add', source: '天賦' }],
            sourceUnitId: source.id,

            /* remove removed */
        });

        // 炉心共鳴3層獲得
        newState = addReactorCoreWrapper(newState, source, 3);

        return newState;
    }
    return state;
};

// Factor作成
export const saberHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level,
    eidolonLevel = 0
) => {
    return {
        handlerMetadata: {
            id: `saber-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_BASIC_ATTACK',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            let newState = state;
            if (event.type === 'ON_BATTLE_START') return onBattleStart(event, newState, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_TURN_START') return onTurnStart(event, newState, sourceUnitId);

            if (event.type === 'ON_SKILL_USED') {
                const actEvent = event as ActionEvent;
                if (actEvent.sourceId === sourceUnitId) {
                    newState = onSkillUsed(actEvent, newState, sourceUnitId, eidolonLevel);
                } else {
                    newState = onAllyAbilityUsed(actEvent, newState, sourceUnitId, eidolonLevel);
                }
            }
            if (event.type === 'ON_ULTIMATE_USED') {
                const actEvent = event as ActionEvent;
                if (actEvent.sourceId === sourceUnitId) {
                    newState = onUltimateUsed(actEvent, newState, sourceUnitId, eidolonLevel);
                } else {
                    newState = onAllyAbilityUsed(actEvent, newState, sourceUnitId, eidolonLevel);
                }
            }
            if (event.type === 'ON_BASIC_ATTACK') {
                const actEvent = event as ActionEvent;
                if (actEvent.sourceId === sourceUnitId) return onBasicAtkUsed(actEvent, state, sourceUnitId, eidolonLevel);
            }

            return newState;
        }
    };
};
