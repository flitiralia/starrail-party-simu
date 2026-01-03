import { Character, Element, StatKey, ELEMENTS } from '../../types';
import { IEventHandlerFactory, GameState, IEvent, Unit, ActionEvent, BeforeDamageCalcEvent, BeforeActionEvent } from '../../simulator/engine/types';
import { publishEvent } from '../../simulator/engine/dispatcher';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect, CrowdControlEffect } from '../../simulator/effect/types';
import { getLeveledValue } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { createUnitId } from '../../simulator/engine/unitId';

// --- 定数定義 ---
const CHARACTER_ID = 'anaxa';

// --- エフェクトID ---
const EFFECT_IDS = {
    WEAKNESS: (sourceId: string, targetId: string, element: Element) =>
        `anaxa-weakness-${sourceId}-${targetId}-${element}`,
    SUBLIMATION: (sourceId: string, targetId: string) =>
        `anaxa-sublimation-${sourceId}-${targetId}`,
    FOLLOW_UP_BLOCK: (sourceId: string) =>
        `anaxa-follow-up-block-${sourceId}`,
    A4_SOLO_BUFF: (sourceId: string) =>
        `anaxa-a4-solo-${sourceId}`,
    A4_PARTY_BUFF: (sourceId: string, allyId: string) =>
        `anaxa-a4-party-${sourceId}-${allyId}`,
    E1_DEF_DOWN: (sourceId: string, targetId: string) =>
        `anaxa-e1-def-down-${sourceId}-${targetId}`,
    E2_ALL_RES_DOWN: (sourceId: string, targetId: string) =>
        `anaxa-e2-all-res-down-${sourceId}-${targetId}`,
    E4_ATK_BUFF: (sourceId: string) =>
        `anaxa-e4-atk-buff-${sourceId}`,
} as const;

// --- 軌跡ID ---
const TRACE_IDS = {
    A2: 'anaxa-trace-a2', // 流浪の記号
    A4: 'anaxa-trace-a4', // 必要な空白
    A6: 'anaxa-trace-a6', // 定性の変遷
} as const;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    basic: {
        6: { mult: 1.00 },
        7: { mult: 1.10 }
    } as Record<number, { mult: number }>,
    skill: {
        10: { singleMult: 0.70, bounceMult: 0.70 },
        12: { singleMult: 0.77, bounceMult: 0.77 }
    } as Record<number, { singleMult: number; bounceMult: number }>,
    ultimate: {
        10: { mult: 1.60 },
        12: { mult: 1.76 }
    } as Record<number, { mult: number }>,
    talent: {
        10: { dmgBoost: 0.30 },
        12: { dmgBoost: 0.324 }
    } as Record<number, { dmgBoost: number }>
};

// 天賦
const WEAKNESS_DURATION = 3;            // 弱点付与持続ターン
const ESSENCE_EXPOSURE_THRESHOLD = 5;   // 本質暴露必要弱点数

// 追加能力
const A2_EP_RECOVERY_BASIC = 10;
const A2_EP_RECOVERY_NO_EXPOSURE = 30;
const A4_SOLO_CRIT_DMG = 1.40;          // 知恵1名: 会心ダメ+140%
const A4_PARTY_DMG_BOOST = 0.50;        // 知恵2名以上: 全体与ダメ+50%
const A6_DEF_IGNORE_PER_WEAKNESS = 0.04; // 弱点1つにつき防御無視4%
const A6_MAX_WEAKNESS_COUNT = 7;

// 星魂
const E1_SP_RECOVERY = 1;
const E1_DEF_DOWN = 0.16;
const E1_DEF_DOWN_DURATION = 2;
const E2_ALL_RES_DOWN = 0.20;
const E4_ATK_BUFF = 0.30;
const E4_ATK_BUFF_DURATION = 2;
const E4_MAX_STACKS = 2;
const E6_DMG_MULTIPLIER = 0.30; // ダメージ+30%

// --- キャラクター定義 ---
export const anaxa: Character = {
    id: CHARACTER_ID,
    name: 'アナイクス',
    path: 'Erudition',
    element: 'Wind',
    rarity: 5,
    maxEnergy: 140,
    baseStats: {
        hp: 970,
        atk: 756,
        def: 557,
        spd: 97,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75  // 知恵
    },
    abilities: {
        basic: {
            id: 'anaxa-basic',
            name: '苦痛、認識の造成',
            type: 'Basic ATK',
            description: '指定した敵単体にアナイクスの攻撃力100%分の風属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.00, toughnessReduction: 10 }]
            },
            energyGain: 30
        },
        skill: {
            id: 'anaxa-skill',
            name: '分形、誤謬の駆駆',
            type: 'Skill',
            description: '指定した敵単体にアナイクスの攻撃力70%分の風属性ダメージを与え、さらに4ヒットする。',
            targetType: 'bounce',
            damage: {
                type: 'bounce',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.70, toughnessReduction: 10 },
                    { multiplier: 0.70, toughnessReduction: 5 },
                    { multiplier: 0.70, toughnessReduction: 5 },
                    { multiplier: 0.70, toughnessReduction: 5 },
                    { multiplier: 0.70, toughnessReduction: 5 }
                ]
            },
            energyGain: 30
        },
        ultimate: {
            id: 'anaxa-ultimate',
            name: '化育、世界の創造',
            type: 'Ultimate',
            description: '敵全体を「昇華」状態にした後、アナイクスの攻撃力160%分の風属性ダメージを与える。',
            targetType: 'all_enemies',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 1.60, toughnessReduction: 20 }]
            },
            energyGain: 5
        },
        talent: {
            id: 'anaxa-talent',
            name: '四智、三重の無上',
            type: 'Talent',
            description: 'アナイクスの攻撃が敵に命中するたびに弱点属性をランダムで1つ付与。異なる弱点属性を5つ以上持つ敵は「本質暴露」状態になる。'
        },
        technique: {
            id: 'anaxa-technique',
            name: '瞳の中の色彩',
            type: 'Technique',
            description: '戦闘に入った後、敵それぞれに攻撃者の属性を弱点属性として1つ付与する。3ターン継続。'
        }
    },
    traces: [
        {
            id: TRACE_IDS.A2,
            name: '流浪の記号',
            type: 'Bonus Ability',
            description: '通常攻撃を行う時、さらにEPを10回復する。ターンが回ってきた時、フィールド上に「本質暴露」状態の敵がいない場合、EPを30回復する。'
        },
        {
            id: TRACE_IDS.A4,
            name: '必要な空白',
            type: 'Bonus Ability',
            description: 'パーティー内の「知恵」の運命を歩むキャラクターの数に応じて効果発動。1名の場合、会心ダメージ+140%。2名以上の場合、味方全体の与ダメージ+50%。'
        },
        {
            id: TRACE_IDS.A6,
            name: '定性の変遷',
            type: 'Bonus Ability',
            description: '敵が持つ異なる弱点属性1つにつき、アナイクスが与えるダメージはその敵の防御力を4%無視する。最大7つまでカウント。'
        },
        {
            id: 'anaxa-stat-wind-dmg',
            name: '風属性ダメージ強化',
            type: 'Stat Bonus',
            description: '風属性ダメージ+22.4%',
            stat: 'wind_dmg_boost',
            value: 0.224
        },
        {
            id: 'anaxa-stat-crit-rate',
            name: '会心率強化',
            type: 'Stat Bonus',
            description: '会心率+12.0%',
            stat: 'crit_rate',
            value: 0.12
        },
        {
            id: 'anaxa-stat-hp',
            name: 'HP強化',
            type: 'Stat Bonus',
            description: '最大HP+10.0%',
            stat: 'hp_pct',
            value: 0.10
        }
    ],
    eidolons: {
        e1: {
            level: 1,
            name: '掩蔽の魔術師',
            description: '戦闘スキルを初めて発動した後、SPを1回復する。戦闘スキルが敵に命中する時、敵の防御力-16%、2ターン継続。'
        },
        e2: {
            level: 2,
            name: '史実の自然人',
            description: '敵が戦闘に入る時、天賦の弱点付与効果を1回発動し、その敵の全属性耐性を20%ダウンさせる。'
        },
        e3: {
            level: 3,
            name: '深宇宙に刻まれた瞳',
            description: '必殺技のLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 },
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 1.76 }
            ]
        },
        e4: {
            level: 4,
            name: '峡谷に落ちる灼熱',
            description: '戦闘スキルを発動する時、攻撃力+30%、2ターン継続。最大2層累積。'
        },
        e5: {
            level: 5,
            name: '渦状腕外の胚種',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                { abilityName: 'skill', param: 'damage.hits.0.multiplier', value: 0.77 },
                { abilityName: 'skill', param: 'damage.hits.1.multiplier', value: 0.77 },
                { abilityName: 'skill', param: 'damage.hits.2.multiplier', value: 0.77 },
                { abilityName: 'skill', param: 'damage.hits.3.multiplier', value: 0.77 },
                { abilityName: 'skill', param: 'damage.hits.4.multiplier', value: 0.77 }
            ]
        },
        e6: {
            level: 6,
            name: '万物は万物の中',
            description: 'アナイクスの与ダメージは本来の130%になる。A4の2つの効果は同時に発動するようになる。'
        }
    },
    defaultConfig: {
        lightConeId: 'life-should-be-cast-to-flames', // 生命、焼滅すべし
        superimposition: 1,
        relicSetId: 'genius-of-brilliant-stars',       // 星の如く輝く天才
        ornamentSetId: 'rutilant-arena',             // 星々の競技場
        mainStats: {
            body: 'crit_rate',
            feet: 'spd',
            sphere: 'atk_pct',
            rope: 'atk_pct'
        },
        subStats: [
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'crit_rate', value: 0.20 },
            { stat: 'crit_dmg', value: 0.40 },
            { stat: 'spd', value: 10 }
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate'
    }
};

// --- ヘルパー関数 ---

/**
 * 敵が持つ全ての弱点属性を取得（既存弱点 + 付与された弱点）
 */
function getEnemyWeaknesses(enemy: Unit): Set<Element> {
    const weaknesses = new Set<Element>(enemy.weaknesses || []);

    // 付与された弱点エフェクトを追加
    enemy.effects.forEach(effect => {
        if (effect.id.startsWith('anaxa-weakness-') && effect.miscData?.element) {
            weaknesses.add(effect.miscData.element as Element);
        }
        // 昇華状態（全属性弱点）
        if (effect.id.startsWith('anaxa-sublimation-')) {
            ELEMENTS.forEach(e => weaknesses.add(e));
        }
    });

    return weaknesses;
}

/**
 * 敵が本質暴露状態かどうかを判定
 */
function isEssenceExposed(enemy: Unit): boolean {
    return getEnemyWeaknesses(enemy).size >= ESSENCE_EXPOSURE_THRESHOLD;
}

/**
 * 敵に持っていない弱点属性をランダムで取得
 */
function getRandomMissingWeakness(enemy: Unit): Element | null {
    const existingWeaknesses = getEnemyWeaknesses(enemy);
    const missingElements = ELEMENTS.filter(e => !existingWeaknesses.has(e));

    if (missingElements.length === 0) return null;

    // ランダムに選択
    const randomIndex = Math.floor(Math.random() * missingElements.length);
    return missingElements[randomIndex];
}

/**
 * 弱点属性を敵に付与
 */
function addWeaknessToEnemy(
    state: GameState,
    sourceId: string,
    targetId: string,
    element: Element
): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target || !target.isEnemy) return state;

    const effectId = EFFECT_IDS.WEAKNESS(sourceId, targetId, element);

    // 既に同じ弱点が付与されている場合は期間をリセット
    let newState = removeEffect(state, targetId, effectId);

    // クロージャで「このエフェクトが弱点を追加したか」を追跡
    let addedByThisEffect = false;

    const weaknessEffect: IEffect = {
        id: effectId,
        name: `弱点付与: ${element}`,
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: WEAKNESS_DURATION,
        ignoreResistance: true,
        miscData: { element },
        onApply: (t, s) => {
            // Unit.weaknesses を直接更新（ダメージエンジンとの互換性確保）
            if (!t.weaknesses.has(element)) {
                addedByThisEffect = true;
                const updatedWeaknesses = new Set(t.weaknesses);
                updatedWeaknesses.add(element);
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(t.id), u => ({ ...u, weaknesses: updatedWeaknesses }))
                };
            }
            addedByThisEffect = false;
            return s;
        },
        onRemove: (t, s) => {
            // 自分が追加した場合のみ削除
            if (addedByThisEffect) {
                const updatedWeaknesses = new Set(t.weaknesses);
                updatedWeaknesses.delete(element);
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(t.id), u => ({ ...u, weaknesses: updatedWeaknesses }))
                };
            }
            return s;
        },

        /* remove removed */
    };

    return addEffect(newState, targetId, weaknessEffect);
}

/**
 * 昇華状態を敵に付与（全属性弱点 + 敵ターンまで継続）
 */
function addSublimationToEnemy(
    state: GameState,
    sourceId: string,
    targetId: string
): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target || !target.isEnemy) return state;

    const effectId = EFFECT_IDS.SUBLIMATION(sourceId, targetId);

    // 既存の昇華状態を削除
    let newState = removeEffect(state, targetId, effectId);

    // クロージャで追加した弱点を追跡
    const addedElements = new Set<Element>();

    const sublimationEffect: CrowdControlEffect = {
        id: effectId,
        name: '昇華',
        category: 'DEBUFF',
        type: 'CrowdControl',
        ccType: 'Sublimation',
        damageCalculation: 'none',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: 1, // 敵のターン終了時に削除
        ignoreResistance: true,
        tags: ['SUBLIMATION'],
        onApply: (t: Unit, s: GameState) => {
            // Unit.weaknesses に全属性を追加（ダメージエンジンとの互換性確保）
            const updatedWeaknesses = new Set(t.weaknesses);
            ELEMENTS.forEach(element => {
                if (!t.weaknesses.has(element)) {
                    addedElements.add(element);
                    updatedWeaknesses.add(element);
                }
            });
            if (addedElements.size > 0) {
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(t.id), (u: Unit) => ({ ...u, weaknesses: updatedWeaknesses }))
                };
            }
            return s;
        },
        onRemove: (t: Unit, s: GameState) => {
            // 自分が追加した弱点のみ削除
            if (addedElements.size > 0) {
                const updatedWeaknesses = new Set(t.weaknesses);
                addedElements.forEach(element => {
                    updatedWeaknesses.delete(element);
                });
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(t.id), (u: Unit) => ({ ...u, weaknesses: updatedWeaknesses }))
                };
            }
            return s;
        },
    };

    return addEffect(newState, targetId, sublimationEffect);
}

// --- イベントハンドラー関数 ---

/**
 * 戦闘開始時: A4初期化、秘技による弱点付与
 */
function onBattleStart(
    _event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState {
    let newState = state;
    const unit = newState.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // 秘技: 戦闘開始時、敵それぞれにパーティ内のキャラの属性を弱点として付与
    const useTechnique = unit.config?.useTechnique !== false;
    if (useTechnique) {
        const allies = newState.registry.getAliveAllies();
        const enemies = newState.registry.getAliveEnemies();

        // パーティ内のキャラクターの属性を収集
        const partyElements = new Set<Element>();
        allies.forEach(ally => {
            if (ally.element) {
                partyElements.add(ally.element);
            }
        });

        enemies.forEach(enemy => {
            // 各敵に対して、パーティ内の属性からランダムに1つ選んで付与
            const elementsArray = Array.from(partyElements);
            if (elementsArray.length > 0) {
                const randomElement = elementsArray[Math.floor(Math.random() * elementsArray.length)];
                newState = addWeaknessToEnemy(newState, sourceUnitId, enemy.id, randomElement);
            }
        });

        // ログ追加
        newState = {
            ...newState,
            log: [...newState.log, {
                characterName: unit.name,
                actionTime: newState.time,
                actionType: '秘技',
                skillPointsAfterAction: newState.skillPoints,
                details: '秘技: 敵に弱点属性を付与'
            } as any]
        };
    }

    // A4: 知恵キャラ数をカウントしてバフ付与
    const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4);
    if (hasA4) {
        const allies = newState.registry.getAliveAllies();
        const eruditionCount = allies.filter(a => a.path === 'Erudition').length;

        // E6: 両方の効果が発動
        const applyBoth = eidolonLevel >= 6;

        if (applyBoth || eruditionCount === 1) {
            // 知恵1名 or E6: 会心ダメージ+140%
            const soloBuff: IEffect = {
                id: EFFECT_IDS.A4_SOLO_BUFF(sourceUnitId),
                name: '必要な空白: 会心ダメージ',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{
                    source: '必要な空白',
                    target: 'crit_dmg' as StatKey,
                    type: 'add' as const,
                    value: A4_SOLO_CRIT_DMG
                }],

                /* remove removed */
            };
            newState = addEffect(newState, sourceUnitId, soloBuff);
        }

        if (applyBoth || eruditionCount >= 2) {
            // 知恵2名以上 or E6: 味方全体の与ダメージ+50%
            allies.forEach(ally => {
                const partyBuff: IEffect = {
                    id: EFFECT_IDS.A4_PARTY_BUFF(sourceUnitId, ally.id),
                    name: '必要な空白: 与ダメージ',
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'PERMANENT',
                    duration: -1,
                    modifiers: [{
                        source: '必要な空白 (パーティ)',
                        target: 'all_type_dmg_boost' as StatKey,
                        type: 'add' as const,
                        value: A4_PARTY_DMG_BOOST
                    }],

                    /* remove removed */
                };
                newState = addEffect(newState, ally.id, partyBuff);
            });
        }
    }

    // E2: 戦闘開始時に敵全体に弱点付与 + 全属性耐性ダウン
    if (eidolonLevel >= 2) {
        const enemies = newState.registry.getAliveEnemies();
        enemies.forEach(enemy => {
            // 弱点付与（天賦効果）
            const missingWeakness = getRandomMissingWeakness(enemy);
            if (missingWeakness) {
                newState = addWeaknessToEnemy(newState, sourceUnitId, enemy.id, missingWeakness);
            }

            // 全属性耐性ダウン
            const resDownEffect: IEffect = {
                id: EFFECT_IDS.E2_ALL_RES_DOWN(sourceUnitId, enemy.id),
                name: 'E2: 全属性耐性ダウン',
                category: 'DEBUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                ignoreResistance: true,
                modifiers: [{
                    source: 'E2: 全属性耐性ダウン',
                    target: 'all_type_res' as StatKey,
                    type: 'add' as const,
                    value: -E2_ALL_RES_DOWN
                }],

                /* remove removed */
            };
            newState = addEffect(newState, enemy.id, resDownEffect);
        });
    }

    return newState;
}

/**
 * ターン開始時: A2のEP回復（本質暴露敵がいない場合）
 */
function onTurnStart(
    event: IEvent,
    state: GameState,
    sourceUnitId: string
): GameState {
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;
    const unit = newState.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // A2: 本質暴露敵がいない場合、EP+30
    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2);
    if (hasA2) {
        const enemies = newState.registry.getAliveEnemies();
        const hasExposedEnemy = enemies.some(e => isEssenceExposed(e));

        if (!hasExposedEnemy) {
            newState = addEnergyToUnit(newState, sourceUnitId, A2_EP_RECOVERY_NO_EXPOSURE, 0, false, {
                sourceId: sourceUnitId,
                publishEventFn: publishEvent
            });
        }
    }

    // 追加スキル発動ブロックをリセット（新しいターンの開始）
    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.FOLLOW_UP_BLOCK(sourceUnitId));

    return newState;
}

/**
 * ダメージ計算前: 本質暴露ダメージバフ、A6防御無視、E6ダメージ倍率
 */
function onBeforeDamageCalculation(
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState {
    if (event.sourceId !== sourceUnitId) return state;

    const targetId = event.targetId;
    if (!targetId) return state;

    const target = state.registry.get(createUnitId(targetId));
    if (!target || !target.isEnemy) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;
    let dmgBoost = 0;
    let defIgnore = 0;

    // 天賦: 本質暴露時の与ダメージアップ
    if (isEssenceExposed(target)) {
        const talentLevel = eidolonLevel >= 5 ? 12 : 10;
        const talentValues = getLeveledValue(ABILITY_VALUES.talent, talentLevel);
        dmgBoost += talentValues.dmgBoost;
    }

    // A6: 敵の弱点数に応じた防御無視
    const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6);
    if (hasA6) {
        const weaknessCount = Math.min(getEnemyWeaknesses(target).size, A6_MAX_WEAKNESS_COUNT);
        defIgnore += weaknessCount * A6_DEF_IGNORE_PER_WEAKNESS;
    }

    // E6: ダメージ+30%
    if (eidolonLevel >= 6) {
        dmgBoost += E6_DMG_MULTIPLIER;
    }

    // ダメージモディファイアを適用
    if (dmgBoost > 0 || defIgnore > 0) {
        newState = {
            ...newState,
            damageModifiers: {
                ...newState.damageModifiers,
                allTypeDmg: (newState.damageModifiers?.allTypeDmg || 0) + dmgBoost,
                defIgnore: (newState.damageModifiers?.defIgnore || 0) + defIgnore
            }
        };
    }

    return newState;
}

/**
 * 攻撃命中時: 弱点付与
 */
function onBeforeHit(
    event: BeforeActionEvent,
    state: GameState,
    sourceUnitId: string
): GameState {
    if (event.sourceId !== sourceUnitId) return state;

    const targetId = event.targetId;
    if (!targetId) return state;

    const target = state.registry.get(createUnitId(targetId));
    if (!target || !target.isEnemy) return state;

    // 天賦: 持っていない弱点をランダム付与
    const missingWeakness = getRandomMissingWeakness(target);
    if (missingWeakness) {
        return addWeaknessToEnemy(state, sourceUnitId, targetId, missingWeakness);
    }

    return state;
}

/**
 * 通常攻撃後: A2のEP回復
 */
function onBasicAttack(
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string
): GameState {
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // A2: 通常攻撃時にEP+10
    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2);
    if (hasA2) {
        return addEnergyToUnit(state, sourceUnitId, A2_EP_RECOVERY_BASIC, 0, false, {
            sourceId: sourceUnitId,
            publishEventFn: publishEvent
        });
    }

    return state;
}

// E1: スキル初回使用フラグ
const e1SkillUsedMap = new Map<string, boolean>();

/**
 * スキル使用後: E1/E4処理、本質暴露時の追加スキル発動
 */
function onSkillUsed(
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState {
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;
    const unit = newState.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // E1: 初回スキルでSP+1
    if (eidolonLevel >= 1) {
        if (!e1SkillUsedMap.get(sourceUnitId)) {
            e1SkillUsedMap.set(sourceUnitId, true);
            newState = {
                ...newState,
                skillPoints: Math.min(newState.skillPoints + E1_SP_RECOVERY, 5)
            };
        }

        // E1: スキル命中で防御力-16%
        if (event.targetId) {
            applyE1DefDown(newState, sourceUnitId, event.targetId);
        }
    }

    // E4: 攻撃力+30% (最大2層)
    if (eidolonLevel >= 4) {
        newState = applyE4AtkBuff(newState, sourceUnitId);
    }

    // 天賦: 本質暴露状態の敵に対して追加スキル発動
    // 追加スキル発動中は再発動しない（無限ループ防止）
    const isBlocked = unit.effects.some(e => e.id === EFFECT_IDS.FOLLOW_UP_BLOCK(sourceUnitId));
    if (!isBlocked && event.targetId) {
        const target = newState.registry.get(createUnitId(event.targetId));
        if (target && isEssenceExposed(target)) {
            // ブロックフラグを立てる
            const blockEffect: IEffect = {
                id: EFFECT_IDS.FOLLOW_UP_BLOCK(sourceUnitId),
                name: '追加スキルブロック',
                category: 'STATUS',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_END_BASED',
                duration: 1,

                /* remove removed */
            };
            newState = addEffect(newState, sourceUnitId, blockEffect);

            // 追加スキルをpendingActionsに追加
            // ターゲットが死亡している場合はランダムな敵を選択
            let additionalSkillTargetId = event.targetId;
            const currentTarget = newState.registry.get(createUnitId(event.targetId));
            if (!currentTarget || currentTarget.hp <= 0) {
                const aliveEnemies = newState.registry.getAliveEnemies();
                if (aliveEnemies.length > 0) {
                    const randomIndex = Math.floor(Math.random() * aliveEnemies.length);
                    additionalSkillTargetId = aliveEnemies[randomIndex].id;
                }
            }

            const additionalSkillAction: any = {
                type: 'SKILL',
                sourceId: sourceUnitId,
                targetId: additionalSkillTargetId,
                isAdditional: true, // SP消費なし
                skipTalentTrigger: true // 再発動防止
            };

            newState = {
                ...newState,
                pendingActions: [...newState.pendingActions, additionalSkillAction]
            };
        }
    }

    return newState;
}

/**
 * E1: 防御力デバフ付与
 */
function applyE1DefDown(state: GameState, sourceUnitId: string, targetId: string): GameState {
    const effectId = EFFECT_IDS.E1_DEF_DOWN(sourceUnitId, targetId);

    const defDownEffect: IEffect = {
        id: effectId,
        name: 'E1: 防御力ダウン',
        category: 'DEBUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_START_BASED',
        duration: E1_DEF_DOWN_DURATION,
        modifiers: [{
            source: 'E1: 防御力ダウン',
            target: 'def_pct' as StatKey,
            type: 'add' as const,
            value: -E1_DEF_DOWN
        }],

        /* remove removed */
    };

    return addEffect(state, targetId, defDownEffect);
}

/**
 * E4: 攻撃力バフ付与/スタック
 */
function applyE4AtkBuff(state: GameState, sourceUnitId: string): GameState {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const effectId = EFFECT_IDS.E4_ATK_BUFF(sourceUnitId);
    const existingBuff = unit.effects.find(e => e.id === effectId);
    let stackCount = (existingBuff as any)?.stackCount || 0;
    if (stackCount < E4_MAX_STACKS) stackCount++;

    // 既存バフを削除
    let newState = removeEffect(state, sourceUnitId, effectId);

    const atkBuff: IEffect = {
        id: effectId,
        name: 'E4: 攻撃力アップ',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_END_BASED',
        skipFirstTurnDecrement: true,
        duration: E4_ATK_BUFF_DURATION,
        stackCount: stackCount,
        maxStacks: E4_MAX_STACKS,
        stackStrategy: 'replace',  // 明示的にスタック数を指定
        modifiers: [{
            source: 'E4: 攻撃力アップ',
            target: 'atk_pct' as StatKey,
            type: 'add' as const,
            value: E4_ATK_BUFF  // スタックあたりの値（stackCountによる自動乗算）
        }],
        // onApply/onRemove は不要（modifiersによる自動適用を使用）

        /* remove removed */
    };

    return addEffect(newState, sourceUnitId, atkBuff);
}

/**
 * 必殺技使用後: 昇華状態付与
 */
function onUltimateUsed(
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string
): GameState {
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;

    // 敵全体に昇華状態を付与
    const enemies = newState.registry.getAliveEnemies();
    enemies.forEach(enemy => {
        newState = addSublimationToEnemy(newState, sourceUnitId, enemy.id);
    });

    return newState;
}

// --- ハンドラーファクトリ ---
export const anaxaHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    // E1フラグをリセット
    e1SkillUsedMap.delete(sourceUnitId);

    return {
        handlerMetadata: {
            id: `anaxa-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_BEFORE_HIT',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_BASIC_ATTACK',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_ENEMY_SPAWNED'
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            switch (event.type) {
                case 'ON_BATTLE_START':
                    return onBattleStart(event, state, sourceUnitId, eidolonLevel);

                case 'ON_TURN_START':
                    return onTurnStart(event, state, sourceUnitId);

                case 'ON_BEFORE_HIT':
                    return onBeforeHit(event, state, sourceUnitId);

                case 'ON_BEFORE_DAMAGE_CALCULATION':
                    return onBeforeDamageCalculation(
                        event as BeforeDamageCalcEvent,
                        state,
                        sourceUnitId,
                        eidolonLevel
                    );

                case 'ON_BASIC_ATTACK':
                    return onBasicAttack(event as ActionEvent, state, sourceUnitId);

                case 'ON_SKILL_USED':
                    return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);

                case 'ON_ULTIMATE_USED':
                    return onUltimateUsed(event as ActionEvent, state, sourceUnitId);

                case 'ON_ENEMY_SPAWNED':
                    // E2: 新規敵に弱点付与 + 全属性耐性ダウン
                    if (eidolonLevel >= 2 && event.targetId) {
                        let newState = state;
                        const newEnemy = newState.registry.get(createUnitId(event.targetId));
                        if (newEnemy && newEnemy.isEnemy) {
                            const missingWeakness = getRandomMissingWeakness(newEnemy);
                            if (missingWeakness) {
                                newState = addWeaknessToEnemy(newState, sourceUnitId, event.targetId, missingWeakness);
                            }

                            const resDownEffect: IEffect = {
                                id: EFFECT_IDS.E2_ALL_RES_DOWN(sourceUnitId, event.targetId),
                                name: 'E2: 全属性耐性ダウン',
                                category: 'DEBUFF',
                                sourceUnitId: sourceUnitId,
                                durationType: 'PERMANENT',
                                duration: -1,
                                ignoreResistance: true,
                                modifiers: [{
                                    source: 'E2: 全属性耐性ダウン',
                                    target: 'all_type_res' as StatKey,
                                    type: 'add' as const,
                                    value: -E2_ALL_RES_DOWN
                                }],
                            };
                            newState = addEffect(newState, event.targetId, resDownEffect);
                        }
                        return newState;
                    }
                    return state;

                default:
                    return state;
            }
        }
    };
};
