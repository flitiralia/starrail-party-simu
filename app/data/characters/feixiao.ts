import { Character, StatKey } from '../../types';
import {
    IEventHandlerFactory,
    GameState,
    IEvent,
    Unit,
    GeneralEvent,
    ActionEvent,
    FollowUpAttackAction
} from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';
import { advanceAction } from '../../simulator/engine/utils';
import { calculateAbilityLevel, getLeveledValue } from '../../simulator/utils/abilityLevel';
import { addAccumulatedValue, getAccumulatedValue, consumeAccumulatedValue } from '../../simulator/engine/accumulator';

// =============================================================================
// 定数定義
// =============================================================================

const CHARACTER_ID = 'feixiao';

// 飛黄 (Feihang) システム
const FEIHANG_KEY = 'feixiao-feihang'; // 蓄積キー
const MAX_FEIHANG_STACKS = 12;         // 飛黄最大層
const FEIHANG_THRESHOLD = 6;           // 必殺技発動に必要な層数
const ATTACK_COUNT_PER_STACK = 2;      // 飛黄１層に必要な攻撃回数

// 必殺技
const ULT_SUB_HIT_COUNT = 6;          // サブヒット回数

// 天賦
const TALENT_DMG_BOOST_DURATION = 2;  // 2ターン継続

// 追加能力
const A4_CRIT_RATE_BONUS = 0.15;      // 会心率+15%
const A4_CRIT_DMG_BONUS = 0.6;        // 必殺技発動時会心ダメ+60%
const A6_ADVANCE_PERCENT = 1.0;       // 行動順100%短縮

// 星魂
const E1_WIND_RES_DOWN = 0.15;        // 風属性耐性-15%
const E2_DMG_BONUS_PER_STACK = 0.1;   // 飛黄1層につきダメージ+10%
const E6_WIND_RES_IGNORE = 0.2;       // 風属性耐性20%無視

// エフェクトID
const EFFECT_IDS = {
    /** 飛黄スタック（epとして管理） */
    // FEIHANG_STACKS: (sourceId: string) => `feixiao-feihang-${sourceId}`,
    /** 攻撃カウンター（味方攻撃2回で飛黄+1） */
    ATTACK_COUNTER: (sourceId: string) => `feixiao-attack-counter-${sourceId}`,
    /** 天賦発動可能フラグ（ターン毎1回） */
    TALENT_AVAILABLE: (sourceId: string) => `feixiao-talent-available-${sourceId}`,
    /** 天賦のダメージブーストバフ */
    TALENT_DMG_BOOST: (sourceId: string) => `feixiao-talent-dmg-boost-${sourceId}`,
    /** A4: 会心率バフ */
    A4_CRIT_RATE: (sourceId: string) => `feixiao-a4-crit-rate-${sourceId}`,
    /** A4: 必殺技発動時会心ダメージバフ */
    A4_ULT_CRIT_DMG: (sourceId: string) => `feixiao-a4-ult-crit-dmg-${sourceId}`,
    /** E1: 風属性耐性ダウンオーラ */
    E1_WIND_RES_DOWN: (sourceId: string) => `feixiao-e1-wind-res-down-${sourceId}`,
    /** 必殺技実行中フラグ */
    ULT_IN_PROGRESS: (sourceId: string) => `feixiao-ult-in-progress-${sourceId}`,
} as const;

const TRACE_IDS = {
    /** 昇格2: 神助 */
    A2_SHINSUKE: 'feixiao-trace-a2',
    /** 昇格4: 滅却 */
    A4_MEKKAKU: 'feixiao-trace-a4',
    /** 昇格6: 掃討 */
    A6_SOUTOU: 'feixiao-trace-a6',
} as const;

// アビリティ値（レベル別）
const ABILITY_VALUES = {
    // 通常攻撃
    basicDmg: {
        6: 1.0,
        7: 1.1
    } as Record<number, number>,

    // 戦闘スキル
    skillDmg: {
        10: 2.0,
        12: 2.2
    } as Record<number, number>,

    // 必殺技
    ultDmg: {
        10: {
            total: 7.0,           // 総ダメージ倍率
            finalHit: 1.6,        // 最終ヒット倍率
            subHit: 0.6,          // サブヒット倍率
            subHitBonus: 0.3      // 条件付きボーナス
        },
        12: {
            total: 7.596,
            finalHit: 1.728,
            subHit: 0.648,
            subHitBonus: 0.33
        }
    } as Record<number, {
        total: number;
        finalHit: number;
        subHit: number;
        subHitBonus: number;
    }>,

    // 天賦
    talentDmg: {
        10: { mult: 1.1, dmgBoost: 0.6 },
        12: { mult: 1.21, dmgBoost: 0.66 }
    } as Record<number, { mult: number; dmgBoost: number }>,
};

// =============================================================================
// キャラクター定義
// =============================================================================

export const feixiao: Character = {
    id: CHARACTER_ID,
    name: '飛霄',
    path: 'The Hunt',
    element: 'Wind',
    rarity: 5,
    maxEnergy: 0, // 飛黄は蓄積システムで管理

    baseStats: {
        hp: 1047,
        atk: 601,
        def: 388,
        spd: 112,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75  // 巡狩標準
    },

    abilities: {
        basic: {
            id: 'feixiao-basic',
            name: '閃裂',
            type: 'Basic ATK',
            description: '指定した敵単体に飛霄の攻撃力100%分の風属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.33, toughnessReduction: 3.3 },
                    { multiplier: 0.33, toughnessReduction: 3.3 },
                    { multiplier: 0.34, toughnessReduction: 3.4 }
                ]
            },
            energyGain: 0,  // 飛黄は別途管理
            targetType: 'single_enemy',
        },

        skill: {
            id: 'feixiao-skill',
            name: '斧貫',
            type: 'Skill',
            description: '指定した敵単体に飛霄の攻撃力200%分の風属性ダメージを与え、その後、その敵に天賦による追加攻撃を即座に1回発動する。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.67, toughnessReduction: 6.7 },
                    { multiplier: 0.67, toughnessReduction: 6.7 },
                    { multiplier: 0.66, toughnessReduction: 6.6 }
                ]
            },
            energyGain: 0,
            targetType: 'single_enemy',
            spCost: 1,
        },

        ultimate: {
            id: 'feixiao-ultimate',
            name: '大荒滅破砕',
            type: 'Ultimate',
            description: '指定した敵単体に最大で飛霄の攻撃力700%分の風属性ダメージを与える。必殺技発動中は弱点属性を無視して敵の靭性を削る。「閃裂刃舞」または「斧貫衝天」を合計で6回発動し、最後に攻撃力160%分の風属性ダメージを与える。',
            // ダメージはハンドラーで手動処理
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: []  // dispatcher自動処理を無効化
            },
            energyGain: 0,
            targetType: 'single_enemy',
        },

        talent: {
            id: 'feixiao-talent',
            name: '雷狩',
            type: 'Talent',
            description: '「飛黄」が6層に達すると必殺技が発動可能になる。味方が2回攻撃を行うたびに、飛霄は「飛黄」を1層獲得する。飛霄以外の味方が敵に攻撃を行った後、追加攻撃を行い、飛霄の攻撃力110%分の風属性ダメージを与える。この効果はターンが回ってくるたびに1回まで発動でき、自身の与ダメージ+60%、2ターン継続。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.1, toughnessReduction: 5 }]
            },
            energyGain: 0,
            targetType: 'single_enemy',
        },

        technique: {
            id: 'feixiao-technique',
            name: '嵐身',
            type: 'Technique',
            description: '秘技を使用した後、20秒間継続する「陥陣」状態に入る。戦闘開始後、各ウェーブ開始時に敵全体に飛霄の攻撃力200%分の風属性ダメージを与える。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 2.0, toughnessReduction: 20 }]
            },
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_SHINSUKE,
            name: '神助',
            type: 'Bonus Ability',
            description: '天賦による追加攻撃は、靭性を削る際に弱点属性を無視する。敵を弱点撃破した時、風属性の弱点撃破効果を触発する。'
        },
        {
            id: TRACE_IDS.A4_MEKKAKU,
            name: '滅却',
            type: 'Bonus Ability',
            description: '自身の会心率+15%。必殺技を発動する時、会心ダメージ+60%。'
        },
        {
            id: TRACE_IDS.A6_SOUTOU,
            name: '掃討',
            type: 'Bonus Ability',
            description: '敵を弱点撃破した後、飛霄の行動順が100%早まる。'
        },
        {
            id: 'feixiao-stat-atk',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct',
            value: 0.28
        },
        {
            id: 'feixiao-stat-wind',
            name: '風属性ダメージ',
            type: 'Stat Bonus',
            description: '風属性ダメージ+14.4%',
            stat: 'wind_dmg_boost',
            value: 0.144
        },
        {
            id: 'feixiao-stat-crit',
            name: '会心率',
            type: 'Stat Bonus',
            description: '会心率+6.7%',
            stat: 'crit_rate',
            value: 0.067
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '剣を掲げ、風雲を切り裂く',
            description: '飛霄がフィールド上にいる時、敵全体の風属性耐性-15%。'
        },
        e2: {
            level: 2,
            name: '雨を呼び、天地を覆う',
            description: '必殺技を発動する時、「飛黄」1層につき、今回の攻撃のダメージ倍率+10%。'
        },
        e3: {
            level: 3,
            name: '天を覆い、万象を覆す',
            description: '必殺技のLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.363 },
                { abilityName: 'basic', param: 'damage.hits.1.multiplier', value: 0.363 },
                { abilityName: 'basic', param: 'damage.hits.2.multiplier', value: 0.374 }
            ]
        },
        e4: {
            level: 4,
            name: '陣を敷き、雷霆を走らす',
            description: '飛霄が天賦で追加攻撃を発動する時、追加で「飛黄」を1層獲得する。'
        },
        e5: {
            level: 5,
            name: '星々を繋ぎ、銀河を渡る',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                { abilityName: 'skill', param: 'damage.hits.0.multiplier', value: 0.737 },
                { abilityName: 'skill', param: 'damage.hits.1.multiplier', value: 0.737 },
                { abilityName: 'skill', param: 'damage.hits.2.multiplier', value: 0.726 },
                { abilityName: 'talent', param: 'damage.hits.0.multiplier', value: 1.21 }
            ]
        },
        e6: {
            level: 6,
            name: '雲を裂き、日月を散らす',
            description: '飛霄が必殺技を発動する時、ターゲットの風属性耐性を20%無視する。'
        }
    },

    defaultConfig: {
        lightConeId: 'weighing-the-hundred-million-stars',  // 重なる万象（仮）
        superimposition: 1,
        relicSetId: 'eagle_of_twilight_line',  // 風を弄ぶ、荒野の客
        ornamentSetId: 'rutilant_arena',  // 星々の競技場
        mainStats: {
            body: 'crit_rate',
            feet: 'spd',
            sphere: 'wind_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.30 },
            { stat: 'crit_dmg', value: 0.50 },
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'spd', value: 8 }
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 飛黄スタックを取得（蓄積システムで管理）
 */
const getFeihangStacks = (state: GameState, sourceUnitId: string): number => {
    return getAccumulatedValue(state, sourceUnitId, FEIHANG_KEY);
};

/**
 * 飛黄スタックを設定/更新
 * 注: 蓄積システムでは「設定」ではなく差分で操作するため、
 * 完全リセットしてから目標値を加算する形で実装
 */
const setFeihangStacks = (state: GameState, sourceUnitId: string, stacks: number): GameState => {
    const clampedStacks = Math.min(Math.max(0, stacks), MAX_FEIHANG_STACKS);
    // 現在値を全消費してから目標値を追加
    let newState = consumeAccumulatedValue(state, sourceUnitId, FEIHANG_KEY, 1.0, 'percent');
    if (clampedStacks > 0) {
        newState = addAccumulatedValue(newState, sourceUnitId, FEIHANG_KEY, clampedStacks, MAX_FEIHANG_STACKS);
    }
    return newState;
};

/**
 * 飛黄スタックを加算
 */
const addFeihangStacks = (state: GameState, sourceUnitId: string, amount: number): GameState => {
    return addAccumulatedValue(state, sourceUnitId, FEIHANG_KEY, amount, MAX_FEIHANG_STACKS);
};

/**
 * 攻撃カウンターを取得/更新
 * 味方の攻撃2回で飛黄+1
 */
const getAttackCounter = (state: GameState, sourceUnitId: string): number => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.ATTACK_COUNTER(sourceUnitId));
    return effect?.stackCount || 0;
};

const setAttackCounter = (state: GameState, sourceUnitId: string, count: number): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const effectId = EFFECT_IDS.ATTACK_COUNTER(sourceUnitId);
    let newState = removeEffect(state, sourceUnitId, effectId);

    if (count > 0) {
        const counterEffect: IEffect = {
            id: effectId,
            name: `攻撃カウンター (${count}/${ATTACK_COUNT_PER_STACK})`,
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: count,
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, counterEffect);
    }

    return newState;
};

/**
 * 攻撃カウンターをインクリメント
 * 必殺技の攻撃はカウントしない
 */
const incrementAttackCounter = (state: GameState, sourceUnitId: string, isUltAttack: boolean): GameState => {
    if (isUltAttack) return state;  // 必殺技の攻撃はカウントしない

    let newState = state;
    let counter = getAttackCounter(state, sourceUnitId) + 1;

    if (counter >= ATTACK_COUNT_PER_STACK) {
        // 飛黄+1
        newState = addFeihangStacks(newState, sourceUnitId, 1);
        counter = 0;
    }

    newState = setAttackCounter(newState, sourceUnitId, counter);
    return newState;
};

/**
 * 天賦発動可能かチェック（ターン毎1回）
 */
const isTalentAvailable = (state: GameState, sourceUnitId: string): boolean => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return false;
    return unit.effects.some(e => e.id === EFFECT_IDS.TALENT_AVAILABLE(sourceUnitId));
};

/**
 * 天賦発動可能フラグを設定
 */
const setTalentAvailable = (state: GameState, sourceUnitId: string, available: boolean): GameState => {
    const effectId = EFFECT_IDS.TALENT_AVAILABLE(sourceUnitId);

    if (available) {
        const effect: IEffect = {
            id: effectId,
            name: '天賦発動可能',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_END_BASED',
            duration: 1,
            skipFirstTurnDecrement: true,
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        return addEffect(state, sourceUnitId, effect);
    } else {
        return removeEffect(state, sourceUnitId, effectId);
    }
};


/**
 * 弱点無視で靭性を削り、必要に応じて弱点撃破効果を発動
 * 必殺技・天賦（A2）で使用
 * @param state ゲーム状態
 * @param source ソースユニット
 * @param target ターゲットユニット
 * @param toughnessReduction 削靭値
 * @param forceWindBreak 風属性で弱点撃破効果を発動するか（A2用）
 * @returns 更新後のゲーム状態とターゲット
 */
const reduceToughnessIgnoreWeakness = (
    state: GameState,
    source: Unit,
    target: Unit,
    toughnessReduction: number,
    forceWindBreak: boolean = false
): { state: GameState; target: Unit; wasBroken: boolean } => {
    // 既に撃破済みなら何もしない
    if (target.toughness <= 0) {
        return { state, target, wasBroken: false };
    }

    // 削靭値計算: 基礎 × (1 + break_efficiency)
    const breakEfficiency = source.stats.break_effect || 0;
    const actualReduction = toughnessReduction * (1 + breakEfficiency);
    const newToughness = Math.max(0, target.toughness - actualReduction);

    // ターゲット更新
    const updatedTarget = { ...target, toughness: newToughness };

    let newState = {
        ...state,
        registry: state.registry.update(createUnitId(target.id), () => updatedTarget)
    };

    // 弱点撃破発生
    const wasBroken = target.toughness > 0 && newToughness <= 0;

    // 弱点撃破イベントを発火（風属性強制の場合も考慮）
    // 注: 弱点撃破ダメージや効果は dispatcher の stepApplyDamage で処理されるため、
    // ここではイベント発火のみ行う。実際の撃破ダメージは別途計算が必要。

    return { state: newState, target: updatedTarget, wasBroken };
};
/**
 * 天賦の与ダメージブーストを適用
 */
const applyTalentDmgBoost = (state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const effectId = EFFECT_IDS.TALENT_DMG_BOOST(sourceUnitId);

    // 既存のバフを削除して新規作成（更新）
    let newState = removeEffect(state, sourceUnitId, effectId);

    // E5: 天賦Lv+2
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const talentValues = getLeveledValue(ABILITY_VALUES.talentDmg, talentLevel);
    const dmgBoost = talentValues.dmgBoost;

    const effect: IEffect = {
        id: effectId,
        name: `雷狩 (与ダメ+${Math.round(dmgBoost * 100)}%)`,
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_END_BASED',
        duration: TALENT_DMG_BOOST_DURATION,
        skipFirstTurnDecrement: true,
        modifiers: [{
            target: 'all_type_dmg_boost' as StatKey,
            value: dmgBoost,
            type: 'add',
            source: '雷狩'
        }],
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    return addEffect(newState, sourceUnitId, effect);
};

// =============================================================================
// イベントハンドラー
// =============================================================================

/**
 * 戦闘開始時
 */
const onBattleStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const feixiaoUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!feixiaoUnit) return state;

    let newState = state;

    // A4: 会心率+15%（永続バフ）
    if (feixiaoUnit.traces?.some(t => t.id === TRACE_IDS.A4_MEKKAKU)) {
        const a4CritBuff: IEffect = {
            id: EFFECT_IDS.A4_CRIT_RATE(sourceUnitId),
            name: '滅却 (会心率+15%)',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            modifiers: [{
                target: 'crit_rate' as StatKey,
                value: A4_CRIT_RATE_BONUS,
                type: 'add',
                source: '滅却'
            }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, a4CritBuff);
    }

    // E1: 敵全体の風属性耐性-15%（オーラとして実装）
    if (eidolonLevel >= 1) {
        const enemies = newState.registry.getAliveEnemies();
        enemies.forEach(enemy => {
            const e1Debuff: IEffect = {
                id: `${EFFECT_IDS.E1_WIND_RES_DOWN(sourceUnitId)}-${enemy.id}`,
                name: '風雲切り裂く (風耐性-15%)',
                category: 'DEBUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{
                    target: 'wind_res' as StatKey,
                    value: -E1_WIND_RES_DOWN,
                    type: 'add',
                    source: '飛霄E1'
                }],
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            newState = addEffect(newState, enemy.id, e1Debuff);
        });
    }

    // 秘技使用フラグを確認（デフォルト true）
    const useTechnique = feixiaoUnit.config?.useTechnique !== false;
    if (useTechnique && feixiaoUnit.abilities.technique) {
        // 秘技: 飛黄+1
        newState = addFeihangStacks(newState, sourceUnitId, 1);
    }

    return newState;
};

/**
 * ターン開始時
 */
const onTurnStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;

    // 天賦発動可能フラグをリセット
    newState = setTalentAvailable(newState, sourceUnitId, true);

    return newState;
};

/**
 * スキル使用時
 * スキル後に天賦追撃を即座に発動
 */
const onSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;

    // スキル後に天賦追撃を即座に発動（pendingActionsに追加）
    const targetId = event.targetId;
    if (targetId) {
        const followUpAction = {
            type: 'FOLLOW_UP_ATTACK' as const,
            sourceId: sourceUnitId,
            targetId: targetId,
            isSkillTriggered: true  // スキルからの発動フラグ
        };
        newState = {
            ...newState,
            pendingActions: [...newState.pendingActions, followUpAction as FollowUpAttackAction]
        };
    }

    return newState;
};

/**
 * 必殺技使用時
 */
const onUltimateUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    if (!event.targetId) return state;

    const feixiaoUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!feixiaoUnit) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    if (!target) return state;

    let newState = state;

    // 必殺技実行中フラグを設定
    const ultInProgressEffect: IEffect = {
        id: EFFECT_IDS.ULT_IN_PROGRESS(sourceUnitId),
        name: '必殺技実行中',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_END_BASED',
        duration: 1,
        skipFirstTurnDecrement: true,
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, sourceUnitId, ultInProgressEffect);

    // A4: 必殺技発動時会心ダメージ+60%
    if (feixiaoUnit.traces?.some(t => t.id === TRACE_IDS.A4_MEKKAKU)) {
        const a4CritDmgBuff: IEffect = {
            id: EFFECT_IDS.A4_ULT_CRIT_DMG(sourceUnitId),
            name: '滅却 (会心ダメ+60%)',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_END_BASED',
            duration: 1,
            skipFirstTurnDecrement: true,
            modifiers: [{
                target: 'crit_dmg' as StatKey,
                value: A4_CRIT_DMG_BONUS,
                type: 'add',
                source: '滅却'
            }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, a4CritDmgBuff);
    }

    // E2: 飛黄1層につきダメージ+10%
    const feihangStacks = getFeihangStacks(newState, sourceUnitId);
    let e2DmgBonus = 0;
    if (eidolonLevel >= 2) {
        e2DmgBonus = feihangStacks * E2_DMG_BONUS_PER_STACK;
    }

    // 飛黄を消費（6層消費）
    newState = setFeihangStacks(newState, sourceUnitId, feihangStacks - FEIHANG_THRESHOLD);

    // 最新のユニット状態を取得
    const freshFeixiao = newState.registry.get(createUnitId(sourceUnitId))!;
    const freshTarget = newState.registry.get(createUnitId(event.targetId));
    if (!freshTarget) return newState;

    // 必殺技ダメージ計算
    const isBroken = freshTarget.toughness <= 0;
    // E3: 必殺技Lv+2
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const ultValues = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);

    // 6回のサブヒット（閃裂刃舞 or 斧貫衝天）
    for (let i = 0; i < ULT_SUB_HIT_COUNT; i++) {
        const latestTarget = newState.registry.get(createUnitId(event.targetId));
        if (!latestTarget || latestTarget.hp <= 0) break;

        // 各ヒットごとに撃破状態を確認
        const currentlyBroken = latestTarget.toughness <= 0;

        let subMult = ultValues.subHit;
        // 閃裂刃舞: 撃破状態時にボーナス
        // 斧貫衝天: 非撃破状態時にボーナス
        // どちらかがランダムに選ばれるが、条件付きボーナスは常に適用される
        subMult += ultValues.subHitBonus;

        // E2ボーナスを加算
        const totalMult = subMult * (1 + e2DmgBonus);
        const baseDamage = freshFeixiao.stats.atk * totalMult;

        const dmgResult = calculateNormalAdditionalDamageWithCritInfo(
            freshFeixiao,
            latestTarget,
            baseDamage
        );

        // E6: 風属性耐性+20%無視
        const attackName = currentlyBroken ? '閃裂刃舞' : '斧貫衝天';
        let options: any = {
            damageType: 'ULTIMATE_DAMAGE',
            details: `必殺技: ${attackName} (${i + 1}/${ULT_SUB_HIT_COUNT})`,
            skipLog: true,
            isCrit: dmgResult.isCrit,
            breakdownMultipliers: dmgResult.breakdownMultipliers
        };

        if (eidolonLevel >= 6) {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: (newState.damageModifiers.resReduction || 0) + E6_WIND_RES_IGNORE
                }
            };
        }

        const result = applyUnifiedDamage(
            newState,
            freshFeixiao,
            latestTarget,
            dmgResult.damage,
            options
        );
        newState = result.state;

        // 耐性無視をリセット
        if (eidolonLevel >= 6) {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: (newState.damageModifiers.resReduction || 0) - E6_WIND_RES_IGNORE
                }
            };
        }

        // 必殺技: 弱点無視で靭性を削る（ヒットあたり削靭値 = 30 / 7 ≈ 4.3）
        const ultToughnessPerHit = 30 / 7;
        const toughnessResult = reduceToughnessIgnoreWeakness(
            newState,
            freshFeixiao,
            result.state.registry.get(createUnitId(event.targetId))!,
            ultToughnessPerHit,
            false
        );
        newState = toughnessResult.state;
    }

    // 最終ヒット
    const finalTarget = newState.registry.get(createUnitId(event.targetId));
    if (finalTarget && finalTarget.hp > 0) {
        const finalMult = ultValues.finalHit * (1 + e2DmgBonus);
        const finalBaseDamage = freshFeixiao.stats.atk * finalMult;

        const finalDmgResult = calculateNormalAdditionalDamageWithCritInfo(
            freshFeixiao,
            finalTarget,
            finalBaseDamage
        );

        let finalOptions: any = {
            damageType: 'ULTIMATE_DAMAGE',
            details: '必殺技: 最終ヒット',
            skipLog: true,
            isCrit: finalDmgResult.isCrit,
            breakdownMultipliers: finalDmgResult.breakdownMultipliers
        };

        if (eidolonLevel >= 6) {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: (newState.damageModifiers.resReduction || 0) + E6_WIND_RES_IGNORE
                }
            };
        }

        const finalResult = applyUnifiedDamage(
            newState,
            freshFeixiao,
            finalTarget,
            finalDmgResult.damage,
            finalOptions
        );
        newState = finalResult.state;

        if (eidolonLevel >= 6) {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: (newState.damageModifiers.resReduction || 0) - E6_WIND_RES_IGNORE
                }
            };
        }

        // 最終ヒットの靭性削り（ヒットあたり削靭値 = 30 / 7 ≈ 4.3）
        const finalToughnessPerHit = 30 / 7;
        const finalToughnessResult = reduceToughnessIgnoreWeakness(
            newState,
            freshFeixiao,
            finalResult.state.registry.get(createUnitId(event.targetId))!,
            finalToughnessPerHit,
            false
        );
        newState = finalToughnessResult.state;
    }

    // 必殺技実行中フラグを削除
    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.ULT_IN_PROGRESS(sourceUnitId));

    return newState;
};

/**
 * 攻撃イベント（味方の攻撃を検知して飛黄カウントと天賦追撃）
 */
const onAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const feixiaoUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!feixiaoUnit) return state;

    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker || attacker.isEnemy) return state;

    // 自身の必殺技攻撃はカウントしない
    const isUltAttack = feixiaoUnit.effects.some(
        e => e.id === EFFECT_IDS.ULT_IN_PROGRESS(sourceUnitId)
    ) && event.sourceId === sourceUnitId;

    let newState = state;

    // 攻撃カウンターをインクリメント
    newState = incrementAttackCounter(newState, sourceUnitId, isUltAttack);

    // 飛霄以外の味方が敵に攻撃した場合、天賦追撃
    if (event.sourceId !== sourceUnitId && event.targetId) {
        const targetUnit = newState.registry.get(createUnitId(event.targetId));
        if (targetUnit?.isEnemy && isTalentAvailable(newState, sourceUnitId)) {
            // 天賦追撃をpendingActionsに追加
            const followUpAction = {
                type: 'FOLLOW_UP_ATTACK' as const,
                sourceId: sourceUnitId,
                targetId: event.targetId
            };
            newState = {
                ...newState,
                pendingActions: [...newState.pendingActions, followUpAction as FollowUpAttackAction]
            };
        }
    }

    return newState;
};

/**
 * 天賦追撃
 * 注: ダメージ処理はdispatchパイプラインで行われる（abilities.talent.damageが定義されているため）
 * このハンドラーでは発動条件チェック、バフ適用、E4飛黄獲得のみを行う
 */
const onFollowUpAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const feixiaoUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!feixiaoUnit) return state;

    let newState = state;
    const isSkillTriggered = (event as any).isSkillTriggered === true;

    // スキルからの発動でない場合、天賦発動可能フラグを確認
    // 注: この時点ではすでにdispatchでダメージが処理されているため、
    //     発動条件チェックはonAttackで行い、条件を満たす場合のみpendingActionsに追加している
    if (!isSkillTriggered && !isTalentAvailable(newState, sourceUnitId)) {
        return state;
    }

    // 天賦発動可能フラグを消費（スキルからの発動は消費しない）
    if (!isSkillTriggered) {
        newState = setTalentAvailable(newState, sourceUnitId, false);
    }

    // 天賦の与ダメージブーストを適用
    newState = applyTalentDmgBoost(newState, sourceUnitId, eidolonLevel);

    // E4: 追加で飛黄+1
    if (eidolonLevel >= 4) {
        newState = addFeihangStacks(newState, sourceUnitId, 1);
    }

    // A2（神助）: 天賦追撃で弱点無視靭性削り、風属性弱点撃破効果を発動
    const hasA2 = feixiaoUnit.traces?.some(t => t.id === TRACE_IDS.A2_SHINSUKE);
    if (hasA2 && event.targetId) {
        const targetUnit = newState.registry.get(createUnitId(event.targetId));
        const freshFeixiao = newState.registry.get(createUnitId(sourceUnitId))!;
        if (targetUnit && targetUnit.toughness > 0) {
            const talentToughness = 5;
            const toughnessResult = reduceToughnessIgnoreWeakness(
                newState,
                freshFeixiao,
                targetUnit,
                talentToughness,
                true
            );
            newState = toughnessResult.state;
        }
    }

    return newState;
};

/**
 * 弱点撃破時（A6: 行動順100%短縮）
 */
const onWeaknessBreak = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // @ts-ignore - イベントの拡張型
    if (event.breakerId !== sourceUnitId) return state;

    const feixiaoUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!feixiaoUnit) return state;

    // A6: 敵を弱点撃破した後、行動順が100%早まる
    if (feixiaoUnit.traces?.some(t => t.id === TRACE_IDS.A6_SOUTOU)) {
        return advanceAction(state, sourceUnitId, A6_ADVANCE_PERCENT, 'percent');
    }

    return state;
};

// =============================================================================
// ハンドラーファクトリ
// =============================================================================

export const feixiaoHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `feixiao-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_ATTACK',
                'ON_FOLLOW_UP_ATTACK',
                'ON_WEAKNESS_BREAK',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const feixiaoUnit = state.registry.get(createUnitId(sourceUnitId));
            if (!feixiaoUnit) return state;

            switch (event.type) {
                case 'ON_BATTLE_START':
                    return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);

                case 'ON_TURN_START':
                    return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);

                case 'ON_SKILL_USED':
                    return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);

                case 'ON_ULTIMATE_USED':
                    return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);

                case 'ON_ATTACK':
                    return onAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);

                case 'ON_FOLLOW_UP_ATTACK':
                    return onFollowUpAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);

                case 'ON_WEAKNESS_BREAK':
                    return onWeaknessBreak(event, state, sourceUnitId, eidolonLevel);

                default:
                    return state;
            }
        }
    };
};
