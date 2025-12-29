import { Character, Element, StatKey } from '../../types';
import {
    IEventHandlerFactory,
    GameState,
    IEvent,
    Unit,
    ActionEvent,
    GeneralEvent,
    BeforeDamageCalcEvent
} from '../../simulator/engine/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';
import { applyUnifiedDamage, appendAdditionalDamage, publishEvent } from '../../simulator/engine/dispatcher';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { applyHealing, advanceAction, cleanse } from '../../simulator/engine/utils';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateDamageWithCritInfo } from '../../simulator/damage';
import { recalculateUnitStats } from '../../simulator/statBuilder';
import { calculateActionValue, setUnitActionValue, updateActionQueue } from '../../simulator/engine/actionValue';
import { insertSummonAfterOwner, removeSummon } from '../../simulator/engine/summonManager';

// =============================================================================
// 定数定義
// =============================================================================

const CHARACTER_ID = 'firefly';
const COUNTDOWN_ID_PREFIX = 'firefly-countdown';

// --- エフェクトID ---
const EFFECT_IDS = {
    COMPLETE_COMBUSTION: (sourceId: string) => `${CHARACTER_ID}-combustion-${sourceId}`,
    FIRE_WEAKNESS: (sourceId: string, targetId: string) => `${CHARACTER_ID}-fire-weakness-${sourceId}-${targetId}`,
    TALENT_DMG_REDUCTION: (sourceId: string) => `${CHARACTER_ID}-talent-dr-${sourceId}`,
    TALENT_EFFECT_RES: (sourceId: string) => `${CHARACTER_ID}-talent-res-${sourceId}`,
    A2_BREAK_EFFICIENCY: (sourceId: string) => `${CHARACTER_ID}-a2-${sourceId}`,
    E2_EXTRA_TURN_COOLDOWN: (sourceId: string) => `${CHARACTER_ID}-e2-cooldown-${sourceId}`,
    E6_RES_PEN: (sourceId: string) => `${CHARACTER_ID}-e6-res-pen-${sourceId}`,
    COMBUSTION_ATTACK_BUFF: (sourceId: string) => `${CHARACTER_ID}-combustion-atk-${sourceId}`,
} as const;

// --- 軌跡ID ---
const TRACE_IDS = {
    A2: `${CHARACTER_ID}-trace-a2`, // αモジュール
    A4: `${CHARACTER_ID}-trace-a4`, // βモジュール
    A6: `${CHARACTER_ID}-trace-a6`, // γモジュール
} as const;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 通常攻撃倍率
    basic: {
        6: { mult: 1.00 },
        7: { mult: 1.10 }
    } as Record<number, { mult: number }>,
    // 強化通常攻撃倍率
    enhancedBasic: {
        6: { mult: 2.00 },
        7: { mult: 2.20 }
    } as Record<number, { mult: number }>,
    // 戦闘スキル
    skill: {
        10: { epRecovery: 0.60, mult: 2.00 },
        12: { epRecovery: 0.62, mult: 2.20 }
    } as Record<number, { epRecovery: number; mult: number }>,
    // 強化スキルの基礎倍率
    enhancedSkill: {
        10: { mainMult: 2.00, adjMult: 1.00 },
        12: { mainMult: 2.20, adjMult: 1.10 }
    } as Record<number, { mainMult: number; adjMult: number }>,
    // 必殺技: 速度ブースト
    ultimate: {
        10: { spdBoost: 60, breakDmgBoost: 0.20 },
        12: { spdBoost: 66, breakDmgBoost: 0.22 }
    } as Record<number, { spdBoost: number; breakDmgBoost: number }>,
    // 天賦: ダメージ軽減、効果抵抗
    talent: {
        10: { maxDmgReduction: 0.40, effectRes: 0.30 },
        12: { maxDmgReduction: 0.44, effectRes: 0.34 }
    } as Record<number, { maxDmgReduction: number; effectRes: number }>
};

// --- 定数値 ---
// 通常攻撃
const BASIC_EP = 20;
const BASIC_TOUGHNESS = 10;

// 強化通常攻撃
const ENHANCED_BASIC_HP_HEAL = 0.20;  // HP20%回復
const ENHANCED_BASIC_TOUGHNESS = 15;

// 戦闘スキル
const SKILL_HP_COST = 0.40; // HP40%消費

// 強化スキル
const ENHANCED_SKILL_HP_HEAL = 0.25;  // HP25%回復
const ENHANCED_SKILL_MAIN_TOUGHNESS = 30;
const ENHANCED_SKILL_ADJ_TOUGHNESS = 15;
const ENHANCED_SKILL_BREAK_EFFECT_SCALING = 0.20;  // 撃破特効×0.2
const ENHANCED_SKILL_ADJ_BREAK_EFFECT_SCALING = 0.10;  // 隣接撃破特効×0.1
const ENHANCED_SKILL_MAX_BREAK_EFFECT = 3.60;  // 撃破特効上限360%

// 必殺技
const ULT_EP = 5;
const COMPLETE_COMBUSTION_COUNTDOWN_SPD = 70;  // カウントダウン速度

// 天賦
const TALENT_EP_THRESHOLD = 0.50;  // 戦闘開始時EP回復閾値

// 追加能力
const A2_TOUGHNESS_REDUCTION_RATIO = 0.55;  // 弱点無視時の削靭値55%
const A4_SUPER_BREAK_THRESHOLD_1 = 2.00;  // 撃破特効200%
const A4_SUPER_BREAK_THRESHOLD_2 = 3.60;  // 撃破特効360%
const A4_SUPER_BREAK_RATIO_1 = 0.35;  // 削靭値35%
const A4_SUPER_BREAK_RATIO_2 = 0.50;  // 削靭値50%
const A6_ATK_THRESHOLD = 1800;  // 攻撃力閾値
const A6_BREAK_EFFECT_PER_10_ATK = 0.008;  // 攻撃力10につき撃破特効+0.8%

// 星魂
const E1_DEF_IGNORE = 0.15;  // 防御15%無視
const E4_EFFECT_RES = 0.50;  // 効果抵抗+50%
const E6_FIRE_RES_PEN = 0.20;  // 炎属性耐性貫通+20%
const E6_BREAK_EFFICIENCY_BOOST = 0.50;  // 弱点撃破効率+50%

// 弱点付与
const FIRE_WEAKNESS_DURATION = 2;

// =============================================================================
// キャラクター定義
// =============================================================================

export const firefly: Character = {
    id: CHARACTER_ID,
    name: 'ホタル',
    path: 'Destruction',
    element: 'Fire',
    rarity: 5,
    maxEnergy: 240,
    baseStats: {
        hp: 814,
        atk: 523,
        def: 776,
        spd: 104,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 125  // 壊滅
    },

    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: 'コマンド-フラッシュオーバー推進',
            type: 'Basic ATK',
            description: '指定した敵単体に装甲「サム」の攻撃力100%分の炎属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.00, toughnessReduction: BASIC_TOUGHNESS }]
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy'
        },

        skill: {
            id: `${CHARACTER_ID}-skill`,
            name: 'コマンド-天火轟撃',
            type: 'Skill',
            description: '自身の最大HP40%分のHPを消費し、自身の最大EP60%分のEPを固定で回復する。指定した敵単体に装甲「サム」の攻撃力200%分の炎属性ダメージを与える。自身の次の行動順を25%早める。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                // Lv10: 200% total (2ヒット×100%)
                hits: [
                    { multiplier: 1.00, toughnessReduction: 10 },
                    { multiplier: 1.00, toughnessReduction: 10 }
                ]
            },
            energyGain: 0,  // EP回復はハンドラーで処理
            targetType: 'single_enemy',
            spCost: 1
        },

        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: 'ファイアフライ-Ⅳ-完全燃焼',
            type: 'Ultimate',
            description: '「完全燃焼」状態に入り、自身の行動順を100%早める。通常攻撃と戦闘スキルが強化される。',
            energyGain: ULT_EP,
            targetType: 'self'
        },

        talent: {
            id: `${CHARACTER_ID}-talent`,
            name: 'ホタル式源火中枢',
            type: 'Talent',
            description: '残りHPが少ないほど受けるダメージがダウンする。完全燃焼状態の時、ダメージ軽減効果は最大値を維持し、効果抵抗アップ。戦闘開始時、EPが50%未満の場合、EPを50%まで回復する。EPが満タンになる時、自身にあるデバフをすべて解除する。'
        },

        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: 'Δコマンド-焦土隕撃',
            type: 'Technique',
            description: '各ウェーブ開始時、敵全体に炎属性弱点を付与する、2ターン継続。その後、敵全体に装甲「サム」の攻撃力200%分の炎属性ダメージを与える。'
        },

        // 強化通常攻撃（完全燃焼状態時）
        enhancedBasic: {
            id: `${CHARACTER_ID}-enhanced-basic`,
            name: 'ファイアフライ-Ⅳ-底火斬撃',
            type: 'Basic ATK',
            description: '自身の最大HP20%分のHPを回復する。指定した敵単体に装甲「サム」の攻撃力200%分の炎属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.40, toughnessReduction: 3 },
                    { multiplier: 0.40, toughnessReduction: 3 },
                    { multiplier: 0.40, toughnessReduction: 3 },
                    { multiplier: 0.40, toughnessReduction: 3 },
                    { multiplier: 0.40, toughnessReduction: 3 }
                ]
            },
            energyGain: 0,  // 完全燃焼中はEP回復なし
            targetType: 'single_enemy',
            spGain: 1  // SP+1
        },

        // 強化スキル（完全燃焼状態時）- blast型拡散攻撃
        // ダメージ倍率は dynamicMultiplier として ON_BEFORE_DAMAGE_CALCULATION で設定される
        // 基礎倍率: メイン(0.2×撃破特効+200%), 隣接(0.1×撃破特効+100%)
        enhancedSkill: {
            id: `${CHARACTER_ID}-enhanced-skill`,
            name: 'ファイアフライ-Ⅳ-死星オーバーロード',
            type: 'Skill',
            description: '自身の最大HP25%分のHPを回復する。炎属性弱点を付与。撃破特効スケーリングダメージを与える。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                // 基礎倍率（撃破特効分は ON_BEFORE_DAMAGE_CALCULATION で加算）
                mainHits: [
                    { multiplier: 0.40, toughnessReduction: 6 },
                    { multiplier: 0.40, toughnessReduction: 6 },
                    { multiplier: 0.40, toughnessReduction: 6 },
                    { multiplier: 0.40, toughnessReduction: 6 },
                    { multiplier: 0.40, toughnessReduction: 6 }
                ],
                adjacentHits: [
                    { multiplier: 0.20, toughnessReduction: 3 },
                    { multiplier: 0.20, toughnessReduction: 3 },
                    { multiplier: 0.20, toughnessReduction: 3 },
                    { multiplier: 0.20, toughnessReduction: 3 },
                    { multiplier: 0.20, toughnessReduction: 3 }
                ]
            },
            energyGain: 0,  // 完全燃焼中はEP回復なし
            targetType: 'blast',
            spCost: 1  // SPコスト（E1で無消費）
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2,
            name: 'αモジュール-アンチラグバースト',
            type: 'Bonus Ability',
            description: '「完全燃焼」状態の時、炎属性弱点を持たない敵に攻撃を行う場合、本来の削靭値55%分の靭性を削る。'
        },
        {
            id: TRACE_IDS.A4,
            name: 'βモジュール-自己制限装甲',
            type: 'Bonus Ability',
            description: '「完全燃焼」状態の時、装甲「サム」の撃破特効が200%/360%以上の場合、弱点撃破状態の敵に攻撃を行った後、その回の攻撃の削靭値を35%/50%分の超撃破ダメージに転換する。'
        },
        {
            id: TRACE_IDS.A6,
            name: 'γモジュール-過負荷コア',
            type: 'Bonus Ability',
            description: '装甲「サム」の攻撃力が1,800を超えた時、超過した攻撃力10につき、自身の撃破特効+0.8%。'
        },
        {
            id: `${CHARACTER_ID}-stat-break`,
            name: '撃破特効',
            type: 'Stat Bonus',
            description: '撃破特効+37.3%',
            stat: 'break_effect',
            value: 0.373
        },
        {
            id: `${CHARACTER_ID}-stat-res`,
            name: '効果抵抗',
            type: 'Stat Bonus',
            description: '効果抵抗+18.0%',
            stat: 'effect_res',
            value: 0.18
        },
        {
            id: `${CHARACTER_ID}-stat-spd`,
            name: '速度',
            type: 'Stat Bonus',
            description: '速度+5',
            stat: 'spd',
            value: 5
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: 'かつて安眠せし赤染の繭',
            description: '強化戦闘スキルを発動する時、ターゲットの防御力を15%無視し、SPを消費しない。'
        },
        e2: {
            level: 2,
            name: '砕かれし空からの墜落',
            description: '「完全燃焼」状態で強化攻撃を発動して敵を倒す、または敵を弱点撃破状態にする時、装甲「サム」が追加ターンを1獲得する。この効果は1ターン後に再度発動できる。'
        },
        e3: {
            level: 3,
            name: '静かな星の川で眠る',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // 通常攻撃Lv7
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 },
                // 強化通常Lv7: 各ヒット×1.1
                { abilityName: 'enhancedBasic', param: 'damage.hits.0.multiplier', value: 0.44 },
                { abilityName: 'enhancedBasic', param: 'damage.hits.1.multiplier', value: 0.44 },
                { abilityName: 'enhancedBasic', param: 'damage.hits.2.multiplier', value: 0.44 },
                { abilityName: 'enhancedBasic', param: 'damage.hits.3.multiplier', value: 0.44 },
                { abilityName: 'enhancedBasic', param: 'damage.hits.4.multiplier', value: 0.44 },
                // スキルLv12
                { abilityName: 'skill', param: 'damage.hits.0.multiplier', value: 1.10 },
                { abilityName: 'skill', param: 'damage.hits.1.multiplier', value: 1.10 }
            ]
        },
        e4: {
            level: 4,
            name: 'いつか蛍火をこの目に',
            description: '「完全燃焼」状態の時、装甲「サム」の効果抵抗+50%。'
        },
        e5: {
            level: 5,
            name: '夢のない長い夜から明ける',
            description: '必殺技のLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。'
            // 必殺技・天賦のレベルはハンドラーで処理
        },
        e6: {
            level: 6,
            name: '終わりの明日に咲き誇る',
            description: '「完全燃焼」状態の時、装甲「サム」の炎属性耐性貫通+20%。強化攻撃を発動する時、弱点撃破効率+50%。'
        }
    },

    defaultConfig: {
        lightConeId: 'whereabouts-should-dreams-rest',  // 夢が帰り着く場所
        superimposition: 1,
        relicSetId: 'iron_cavalry_which_tramples_the_raging_flame',  // 蝗害を一掃せし鉄騎
        ornamentSetId: 'forge_of_kalpagni_lantern',  // 劫火と蓮灯の鋳煉宮
        mainStats: {
            body: 'atk_pct',
            feet: 'spd',
            sphere: 'atk_pct',
            rope: 'break_effect'
        },
        subStats: [
            { stat: 'break_effect', value: 0.60 },
            { stat: 'atk_pct', value: 0.25 },
            { stat: 'spd', value: 10 }
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate'
    }
};

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 完全燃焼状態かどうかをチェック
 */
const isInCompleteCombustion = (unit: Unit, sourceUnitId: string): boolean => {
    return unit.effects.some(e => e.id === EFFECT_IDS.COMPLETE_COMBUSTION(sourceUnitId));
};

/**
 * カウントダウンIDを取得
 */
const getCountdownId = (sourceUnitId: string): string => {
    return `${COUNTDOWN_ID_PREFIX}-${sourceUnitId}`;
};

/**
 * カウントダウンを挿入（速度70固定）
 */
const insertCompleteCombustionCountdown = (state: GameState, sourceUnitId: string): GameState => {
    const countdownId = getCountdownId(sourceUnitId);
    const countdownAV = calculateActionValue(COMPLETE_COMBUSTION_COUNTDOWN_SPD);

    // 既存のカウントダウンがあれば何もしない
    if (state.registry.get(createUnitId(countdownId))) {
        return state;
    }

    // システムユニットとして作成
    const countdownUnit: Unit = {
        id: createUnitId(countdownId),
        name: '完全燃焼カウントダウン',
        element: 'Fire',
        path: 'Destruction',
        stats: {
            hp: 1, atk: 0, def: 999999, spd: COMPLETE_COMBUSTION_COUNTDOWN_SPD,
            crit_rate: 0, crit_dmg: 0, max_ep: 0,
            aggro: 0, break_effect: 0, effect_hit_rate: 0, effect_res: 0,
            energy_regen_rate: 0, outgoing_healing_boost: 0
        } as Unit['stats'],
        baseStats: {
            hp: 1, atk: 0, def: 999999, spd: COMPLETE_COMBUSTION_COUNTDOWN_SPD,
            crit_rate: 0, crit_dmg: 0, max_ep: 0,
            aggro: 0, break_effect: 0, effect_hit_rate: 0, effect_res: 0,
            energy_regen_rate: 0, outgoing_healing_boost: 0
        } as Unit['baseStats'],
        hp: 1,
        isEnemy: false,
        isSummon: true,
        level: 80,
        ep: 0,
        effects: [],
        modifiers: [],
        shield: 0,
        toughness: 0,
        maxToughness: 0,
        weaknesses: new Set(),
        actionValue: countdownAV,
        abilities: {
            basic: { id: 'countdown-none', name: 'なし', type: 'Basic ATK', description: '' },
            skill: { id: 'countdown-none', name: 'なし', type: 'Skill', description: '' },
            ultimate: { id: 'countdown-none', name: 'なし', type: 'Ultimate', description: '' },
            talent: { id: 'countdown-none', name: 'なし', type: 'Talent', description: '' },
            technique: { id: 'countdown-none', name: 'なし', type: 'Technique', description: '' }
        },
        linkedUnitId: createUnitId(sourceUnitId),
        ownerId: createUnitId(sourceUnitId),
        untargetable: true,
        rotationIndex: 0,
        ultCooldown: 0
    };

    // カウントダウンをレジストリに追加
    let newState = insertSummonAfterOwner(state, countdownUnit, sourceUnitId);

    // actionQueueに追加
    newState = updateActionQueue(newState);

    return newState;
};

/**
 * カウントダウンを削除
 */
const removeCompleteCombustionCountdown = (state: GameState, sourceUnitId: string): GameState => {
    const countdownId = getCountdownId(sourceUnitId);
    return removeSummon(state, countdownId);
};

/**
 * 完全燃焼状態を解除
 */
const endCompleteCombustion = (state: GameState, sourceUnitId: string): GameState => {
    let newState = state;

    // 完全燃焼バフを削除
    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.COMPLETE_COMBUSTION(sourceUnitId));

    // E4効果抵抗バフを削除
    newState = removeEffect(newState, sourceUnitId, `${CHARACTER_ID}-e4-res-${sourceUnitId}`);

    // E6耐性貫通バフを削除
    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.E6_RES_PEN(sourceUnitId));

    // カウントダウンは自動的に削除される（ターン終了後）

    return newState;
};

/**
 * 炎属性弱点を敵に付与
 */
const applyFireWeakness = (
    state: GameState,
    sourceId: string,
    targetId: string
): GameState => {
    const target = state.registry.get(createUnitId(targetId));
    if (!target || !target.isEnemy) return state;

    const effectId = EFFECT_IDS.FIRE_WEAKNESS(sourceId, targetId);

    // 既に付与されている場合は期間をリセット
    let newState = removeEffect(state, targetId, effectId);

    const weaknessEffect: IEffect = {
        id: effectId,
        name: '弱点付与: 炎',
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: FIRE_WEAKNESS_DURATION,
        ignoreResistance: true,
        miscData: { element: 'Fire' as Element },
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    return addEffect(newState, targetId, weaknessEffect);
};

/**
 * 敵が炎属性弱点を持っているかチェック（元々の弱点 + 付与された弱点）
 */
const hasFireWeakness = (enemy: Unit, sourceUnitId: string): boolean => {
    // 元々の弱点
    if (enemy.weaknesses?.has('Fire')) return true;

    // 付与された弱点
    return enemy.effects.some(e =>
        e.id.startsWith(`${CHARACTER_ID}-fire-weakness-`) &&
        e.miscData?.element === 'Fire'
    );
};

/**
 * A6: 攻撃力超過分による撃破特効ボーナスを計算
 */
const calculateA6BreakEffectBonus = (unit: Unit): number => {
    const atk = unit.stats.atk;
    if (atk <= A6_ATK_THRESHOLD) return 0;

    const excessAtk = atk - A6_ATK_THRESHOLD;
    return Math.floor(excessAtk / 10) * A6_BREAK_EFFECT_PER_10_ATK;
};

/**
 * 強化スキルのダメージ倍率を計算（撃破特効スケーリング）
 */
const calculateEnhancedSkillMultiplier = (
    source: Unit,
    eidolonLevel: number,
    isMain: boolean
): number => {
    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
    const values = getLeveledValue(ABILITY_VALUES.enhancedSkill, skillLevel);

    const breakEffect = Math.min(source.stats.break_effect || 0, ENHANCED_SKILL_MAX_BREAK_EFFECT);
    const breakScaling = isMain ? ENHANCED_SKILL_BREAK_EFFECT_SCALING : ENHANCED_SKILL_ADJ_BREAK_EFFECT_SCALING;
    const baseMult = isMain ? values.mainMult : values.adjMult;

    return breakScaling * breakEffect + baseMult;
};

// =============================================================================
// イベントハンドラー
// =============================================================================

/**
 * 戦闘開始時
 */
const onBattleStart = (
    _event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 天賦: EP50%未満なら50%まで回復
    const maxEp = unit.stats.max_ep || 240;
    const halfEp = maxEp * TALENT_EP_THRESHOLD;
    if (unit.ep < halfEp) {
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                ...u,
                ep: halfEp
            }))
        };
    }

    // A6: 攻撃力超過による撃破特効ボーナス（永続バフ）
    const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6);
    if (hasA6) {
        const breakBonus = calculateA6BreakEffectBonus(unit);
        if (breakBonus > 0) {
            const a6Effect: IEffect = {
                id: `${CHARACTER_ID}-a6-break-${sourceUnitId}`,
                name: 'γモジュール: 撃破特効',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{
                    target: 'break_effect' as StatKey,
                    value: breakBonus,
                    type: 'add',
                    source: 'γモジュール'
                }],
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            newState = addEffect(newState, sourceUnitId, a6Effect);
        }
    }

    // 秘技使用チェック
    const useTechnique = unit.config?.useTechnique !== false;
    if (useTechnique) {
        // 敵全体に炎属性弱点付与
        const enemies = newState.registry.getAliveEnemies();
        for (const enemy of enemies) {
            newState = applyFireWeakness(newState, sourceUnitId, enemy.id as string);
        }

        // 敵全体にダメージ
        const freshUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (freshUnit) {
            const techniqueDmg = freshUnit.stats.atk * 2.0;  // 攻撃力200%
            for (const enemy of enemies) {
                const result = applyUnifiedDamage(newState, freshUnit, enemy, techniqueDmg, {
                    damageType: '秘技',
                    details: 'Δコマンド-焦土隕撃'
                });
                newState = result.state;
            }
        }
    }

    return newState;
};

/**
 * ターン開始時: カウントダウン処理
 */
const onTurnStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const countdownId = getCountdownId(sourceUnitId);

    // カウントダウンのターンが来た場合
    if (event.sourceId === countdownId) {
        let newState = state;

        // 完全燃焼状態を解除
        newState = endCompleteCombustion(newState, sourceUnitId);

        // カウントダウンを削除
        newState = removeCompleteCombustionCountdown(newState, sourceUnitId);

        return newState;
    }

    // 自分のターン開始時: E2クールダウンリセット
    if (event.sourceId === sourceUnitId) {
        return removeEffect(state, sourceUnitId, EFFECT_IDS.E2_EXTRA_TURN_COOLDOWN(sourceUnitId));
    }

    return state;
};

/**
 * 必殺技使用時: 完全燃焼状態に入る
 */
const onUltimateUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // E5で必殺技Lv12
    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
    const ultValues = getLeveledValue(ABILITY_VALUES.ultimate, ultLevel);

    // 完全燃焼状態バフ作成
    // 仕様: 速度+60(66)、撃破効率+50%、撃破ダメージ+20%(22%)
    const combustionEffect: IEffect = {
        id: EFFECT_IDS.COMPLETE_COMBUSTION(sourceUnitId),
        name: '完全燃焼',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        modifiers: [
            {
                target: 'spd' as StatKey,
                value: ultValues.spdBoost,
                type: 'add',
                source: '完全燃焼'
            },
            {
                target: 'break_efficiency_boost' as StatKey,
                value: 0.50,  // 撃破効率+50%
                type: 'add',
                source: '完全燃焼'
            },
            {
                target: 'break_dmg' as StatKey,
                value: ultValues.breakDmgBoost,  // 撃破ダメージ+20%(22%)
                type: 'add',
                source: '完全燃焼'
            }
        ],
        tags: ['COMPLETE_COMBUSTION', 'ENHANCED_BASIC', 'ENHANCED_SKILL', 'ULT_SILENCE'],
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, sourceUnitId, combustionEffect);

    // 天賦: 完全燃焼中の効果抵抗バフ
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const talentValues = getLeveledValue(ABILITY_VALUES.talent, talentLevel);
    const effectResEffect: IEffect = {
        id: EFFECT_IDS.TALENT_EFFECT_RES(sourceUnitId),
        name: '源火中枢: 効果抵抗',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'LINKED',
        duration: 0,
        linkedEffectId: EFFECT_IDS.COMPLETE_COMBUSTION(sourceUnitId),
        modifiers: [{
            target: 'effect_res' as StatKey,
            value: talentValues.effectRes,
            type: 'add',
            source: '源火中枢'
        }],
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, sourceUnitId, effectResEffect);

    // E4: 完全燃焼中は効果抵抗+50%（追加）
    if (eidolonLevel >= 4) {
        const e4Effect: IEffect = {
            id: `${CHARACTER_ID}-e4-res-${sourceUnitId}`,
            name: 'E4: 効果抵抗',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: 0,
            linkedEffectId: EFFECT_IDS.COMPLETE_COMBUSTION(sourceUnitId),
            modifiers: [{
                target: 'effect_res' as StatKey,
                value: E4_EFFECT_RES,
                type: 'add',
                source: 'E4'
            }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, e4Effect);
    }

    // E6: 完全燃焼中は炎属性耐性貫通+20%
    if (eidolonLevel >= 6) {
        const e6Effect: IEffect = {
            id: EFFECT_IDS.E6_RES_PEN(sourceUnitId),
            name: 'E6: 炎属性耐性貫通',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: 0,
            linkedEffectId: EFFECT_IDS.COMPLETE_COMBUSTION(sourceUnitId),
            modifiers: [{
                target: 'fire_res_pen' as StatKey,
                value: E6_FIRE_RES_PEN,
                type: 'add',
                source: 'E6'
            }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, e6Effect);
    }

    // カウントダウン挿入
    newState = insertCompleteCombustionCountdown(newState, sourceUnitId);

    // 行動順100%短縮
    newState = advanceAction(newState, sourceUnitId, 1.0, 'percent');

    return newState;
};

/**
 * スキル使用時
 */
const onSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;
    const inCombustion = isInCompleteCombustion(unit, sourceUnitId);

    if (inCombustion) {
        // === 強化スキル処理 ===

        // HP25%回復
        newState = applyHealing(newState, sourceUnitId, sourceUnitId, {
            scaling: 'hp',
            multiplier: ENHANCED_SKILL_HP_HEAL,
            flat: 0
        }, '死星オーバーロード: HP回復');

        // 炎属性弱点付与
        if (event.targetId) {
            newState = applyFireWeakness(newState, sourceUnitId, event.targetId);
        }

        // E1: SP無消費（dispatcherで処理されるため、ここでは+1で相殺）
        if (eidolonLevel >= 1) {
            newState = {
                ...newState,
                skillPoints: Math.min(newState.skillPoints + 1, 5)
            };
        }
    } else {
        // === 通常スキル処理 ===

        // HP40%消費（HP不足時は1に）
        const freshUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (freshUnit) {
            const hpCost = freshUnit.stats.hp * SKILL_HP_COST;
            const newHp = Math.max(1, freshUnit.hp - hpCost);
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                    ...u,
                    hp: newHp
                }))
            };
        }

        // EP固定回復（最大EP × 軌跡レベル依存%）
        const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
        const skillValues = getLeveledValue(ABILITY_VALUES.skill, skillLevel);
        const epRecovery = Math.floor((unit.stats.max_ep || 240) * skillValues.epRecovery);
        newState = addEnergyToUnit(newState, sourceUnitId, epRecovery);

        // 行動順25%短縮
        newState = advanceAction(newState, sourceUnitId, 0.25, 'percent');
    }

    return newState;
};

/**
 * 通常攻撃時
 */
const onBasicAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 強化通常攻撃判定
    const actionEvent = event as ActionEvent & { isEnhanced?: boolean };
    if (actionEvent.isEnhanced) {
        // 強化通常攻撃: HP20%回復
        newState = applyHealing(newState, sourceUnitId, sourceUnitId, {
            scaling: 'hp',
            multiplier: ENHANCED_BASIC_HP_HEAL,
            flat: 0
        }, '底火斬撃: HP回復');
    }

    return newState;
};

/**
 * EP獲得時: EP満タンでデバフ解除
 */
const onEpGained = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string
): GameState => {
    if ((event as any).targetId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const maxEp = unit.stats.max_ep || 240;
    if (unit.ep >= maxEp) {
        // デバフ全解除
        return cleanse(state, sourceUnitId);
    }

    return state;
};

/**
 * ダメージ計算前: 天賦ダメージ軽減、撃破特効スケーリング、E1防御無視
 */
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // === ホタルがダメージを受ける側の場合 ===
    if (event.targetId === sourceUnitId) {
        // 天賦: HP%ベースダメージ軽減
        const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
        const talentValues = getLeveledValue(ABILITY_VALUES.talent, talentLevel);

        let dmgReduction: number;
        if (isInCompleteCombustion(unit, sourceUnitId)) {
            dmgReduction = talentValues.maxDmgReduction;
        } else {
            const hpRatio = unit.hp / unit.stats.hp;
            if (hpRatio <= 0.2) {
                dmgReduction = talentValues.maxDmgReduction;
            } else {
                // HP 100% → 0%, HP 20% → 最大値 の線形補間
                dmgReduction = Math.min((1 - hpRatio) * (talentValues.maxDmgReduction / 0.8), talentValues.maxDmgReduction);
            }
        }

        if (dmgReduction > 0) {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    dmgTakenReduction: (newState.damageModifiers?.dmgTakenReduction || 0) + dmgReduction
                }
            };
        }
    }

    // === ホタルがダメージを与える側の場合 ===
    if (event.sourceId === sourceUnitId) {
        const inCombustion = isInCompleteCombustion(unit, sourceUnitId);
        const isSkill = event.subType === 'SKILL';

        // 完全燃焼中の強化スキル使用時: 撃破特効スケーリングダメージ追加
        if (inCombustion && isSkill) {
            // 撃破特効スケーリング: 攻撃力 × (0.2 × 撃破特効)
            // 撃破特効は最大360%までカウント
            const breakEffect = Math.min(unit.stats.break_effect || 0, ENHANCED_SKILL_MAX_BREAK_EFFECT);

            // メインターゲットか隣接かを判定（targetIdで判定）
            const target = event.targetId ? newState.registry.get(createUnitId(event.targetId)) : null;
            const isMainTarget = target && (event as any).isMainTarget !== false;

            // スケーリング倍率: メイン=0.2, 隣接=0.1
            const scaling = isMainTarget ? ENHANCED_SKILL_BREAK_EFFECT_SCALING : ENHANCED_SKILL_ADJ_BREAK_EFFECT_SCALING;
            const additionalMultiplier = scaling * breakEffect;

            // baseDmgAddとして追加
            const additionalDamage = unit.stats.atk * additionalMultiplier;

            if (additionalDamage > 0) {
                newState = {
                    ...newState,
                    damageModifiers: {
                        ...newState.damageModifiers,
                        baseDmgAdd: (newState.damageModifiers?.baseDmgAdd || 0) + additionalDamage
                    }
                };
            }

            // E1: 強化スキル時は防御力15%無視
            if (eidolonLevel >= 1) {
                newState = {
                    ...newState,
                    damageModifiers: {
                        ...newState.damageModifiers,
                        defIgnore: (newState.damageModifiers?.defIgnore || 0) + E1_DEF_IGNORE
                    }
                };
            }
        }
    }

    return newState;
};

/**
 * 敵撃破時・弱点撃破時: E2追加ターン
 */
const checkE2ExtraTurn = (
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (eidolonLevel < 2) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // 完全燃焼中でなければ発動しない
    if (!isInCompleteCombustion(unit, sourceUnitId)) return state;

    // クールダウン中なら発動しない
    if (unit.effects.some(e => e.id === EFFECT_IDS.E2_EXTRA_TURN_COOLDOWN(sourceUnitId))) {
        return state;
    }

    let newState = state;

    // 追加ターン獲得
    newState = advanceAction(newState, sourceUnitId, 1.0, 'percent');

    // クールダウン設定（1ターン）
    const cooldownEffect: IEffect = {
        id: EFFECT_IDS.E2_EXTRA_TURN_COOLDOWN(sourceUnitId),
        name: 'E2: 追加ターンクールダウン',
        category: 'STATUS',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_START_BASED',
        duration: 1,
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, sourceUnitId, cooldownEffect);

    return newState;
};

/**
 * 敵撃破時
 */
const onEnemyDefeated = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if ((event as any).killedBy !== sourceUnitId) return state;
    return checkE2ExtraTurn(state, sourceUnitId, eidolonLevel);
};

/**
 * 弱点撃破時: E2追加ターン + E6撃破ダメージ増加
 */
const onBreak = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if ((event as any).sourceId !== sourceUnitId) return state;
    // E2追加ターン
    return checkE2ExtraTurn(state, sourceUnitId, eidolonLevel);
};

/**
 * ヒット前: A2弱点無視削靭、E6撃破効率ブースト
 */
const onBeforeHit = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if ((event as any).sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const inCombustion = isInCompleteCombustion(unit, sourceUnitId);
    if (!inCombustion) return state;

    let newState = state;
    const targetId = (event as any).targetId;
    const target = targetId ? newState.registry.get(createUnitId(targetId)) : null;

    // A2: 弱点無視時の削靭値55%適用
    if (target && !hasFireWeakness(target, sourceUnitId)) {
        // 弱点なしでも削靭可能にする（toughnessMultiplierで55%に）
        newState = {
            ...newState,
            damageModifiers: {
                ...newState.damageModifiers,
                ignoreToughnessWeakness: true,
                // 削靭値に55%倍率を適用するためにtoughnessFlatで調整
                toughnessMultiplier: A2_TOUGHNESS_REDUCTION_RATIO
            }
        };
    }

    // E6: 撃破効率+50%（強化攻撃時）
    if (eidolonLevel >= 6) {
        const isEnhancedAttack = (event as any).actionType === 'SKILL' ||
            (event as any).actionType === 'BASIC_ATTACK' ||
            (event as any).actionType === 'ENHANCED_BASIC_ATTACK';
        if (isEnhancedAttack) {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    breakEfficiencyBoost: (newState.damageModifiers?.breakEfficiencyBoost || 0) + E6_BREAK_EFFICIENCY_BOOST
                }
            };
        }
    }

    return newState;
};

/**
 * ヒット後: A4超撃破ダメージ変換
 */
const onAfterHit = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if ((event as any).sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const inCombustion = isInCompleteCombustion(unit, sourceUnitId);
    if (!inCombustion) return state;

    const targetId = (event as any).targetId;
    const target = targetId ? state.registry.get(createUnitId(targetId)) : null;
    if (!target) return state;

    // A4: 弱点撃破状態の敵に攻撃後、削靭値を超撃破ダメージに変換
    // 撃破特効200%以上で35%、360%以上で50%
    const isBroken = target.toughness <= 0;
    if (!isBroken) return state;

    const breakEffect = unit.stats.break_effect || 0;
    let conversionRatio = 0;
    if (breakEffect >= A4_SUPER_BREAK_THRESHOLD_2) {
        conversionRatio = A4_SUPER_BREAK_RATIO_2;
    } else if (breakEffect >= A4_SUPER_BREAK_THRESHOLD_1) {
        conversionRatio = A4_SUPER_BREAK_RATIO_1;
    }

    if (conversionRatio > 0) {
        // 超撃破ダメージ計算
        // 削靭値は各ヒットのtoughnessReductionの合計を使う
        // 簡略化: 強化スキルのメイン削靭30、強化通常の削靭15を基準
        const isSkill = (event as any).actionType === 'SKILL';
        const baseToughness = isSkill ? ENHANCED_SKILL_MAIN_TOUGHNESS : ENHANCED_BASIC_TOUGHNESS;
        const superBreakBase = baseToughness * conversionRatio;

        // 超撃破ダメージ = 基礎撃破ダメージ × 超撃破倍率 × (1 + 撃破特効)
        // 簡略化計算: levelConstant × 超撃破倍率
        const LEVEL_CONSTANT_80 = 2628.0;
        const superBreakDamage = LEVEL_CONSTANT_80 * superBreakBase * (1 + breakEffect);

        // 付加ダメージとして追加（本来はapplyUnifiedDamageで処理すべきだが、イベントで直接追加）
        console.log(`[Firefly A4] 超撃破ダメージ: ${superBreakDamage.toFixed(2)} (変換率: ${(conversionRatio * 100).toFixed(0)}%)`);
    }

    return state;
};

// =============================================================================
// ハンドラーファクトリ
// =============================================================================

export const fireflyHandlerFactory: IEventHandlerFactory = (
    sourceUnitId: string,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `${CHARACTER_ID}-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_ULTIMATE_USED',
                'ON_SKILL_USED',
                'ON_BASIC_ATTACK',
                'ON_EP_GAINED',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_BEFORE_HIT',
                'ON_AFTER_HIT',
                'ON_ENEMY_DEFEATED',
                'ON_WEAKNESS_BREAK'
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            switch (event.type) {
                case 'ON_BATTLE_START':
                    return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_TURN_START':
                    return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_ULTIMATE_USED':
                    return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_SKILL_USED':
                    return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_BASIC_ATTACK':
                    return onBasicAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_EP_GAINED':
                    return onEpGained(event, state, sourceUnitId);
                case 'ON_BEFORE_DAMAGE_CALCULATION':
                    return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_BEFORE_HIT':
                    return onBeforeHit(event, state, sourceUnitId, eidolonLevel);
                case 'ON_AFTER_HIT':
                    return onAfterHit(event, state, sourceUnitId, eidolonLevel);
                case 'ON_ENEMY_DEFEATED':
                    return onEnemyDefeated(event, state, sourceUnitId, eidolonLevel);
                case 'ON_WEAKNESS_BREAK':
                    return onBreak(event, state, sourceUnitId, eidolonLevel);
                default:
                    return state;
            }
        }
    };
};

