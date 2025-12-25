import { Character, StatKey, Unit } from '../../types/index';
import {
    IEventHandlerFactory,
    GameState,
    IEvent,
    ActionEvent,
    GeneralEvent,
    BeforeDamageCalcEvent
} from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage, publishEvent, appendAdditionalDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { summonOrRefreshSpirit, getActiveSpirit, IMemorySpiritDefinition, dismissSpirit } from '../../simulator/engine/memorySpiritManager';
import { applyHealing, advanceAction } from '../../simulator/engine/utils';
import { addAccumulatedValue, getAccumulatedValue, consumeAccumulatedValue } from '../../simulator/engine/accumulator';
import { TargetSelector } from '../../simulator/engine/selector';
import { calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';

// =============================================================================
// 定数定義
// =============================================================================

const CHARACTER_ID = 'evernight';
const SUMMON_ID_PREFIX = 'choya'; // 長夜

// 憶質関連
const MEMORIA_KEY = 'evernight-memoria';
const MAX_MEMORIA = 40;
const MEMORIA_ULT_TRIGGER = 16; // 憶質16以上で夢発動可能

// エフェクトID
const EFFECT_IDS = {
    /** 戦闘スキル: 味方精霊会心ダメージアップ */
    SKILL_CRIT_DMG_BUFF: (sourceId: string) => `evernight-skill-crit-dmg-${sourceId}`,
    /** 天賦: HP減少時会心ダメージアップ */
    TALENT_CRIT_DMG_BUFF: (sourceId: string) => `evernight-talent-crit-dmg-${sourceId}`,
    /** 必殺技: 至暗の謎 */
    ULT_DARKEST_MYSTERY: (sourceId: string) => `evernight-darkest-mystery-${sourceId}`,
    /** 必殺技: 敵被ダメージアップ */
    ULT_VULN_DEBUFF: (sourceId: string) => `evernight-ult-vuln-${sourceId}`,
    /** 精霊天賦: 長夜与ダメージアップ */
    SPIRIT_DMG_BUFF: (sourceId: string) => `choya-dmg-buff-${sourceId}`,
    /** 退場時速度バフ */
    EXIT_SPD_BUFF: (sourceId: string) => `choya-exit-spd-${sourceId}`,
    /** A2: 会心率アップ */
    A2_CRIT_RATE: (sourceId: string) => `evernight-a2-crit-rate-${sourceId}`,
    /** A2: 会心ダメージアップ (スキル発動時) */
    A2_CRIT_DMG: (sourceId: string) => `evernight-a2-crit-dmg-${sourceId}`,
    /** 即座行動フラグ */
    INSTANT_ACTION_USED: (sourceId: string) => `evernight-instant-action-used-${sourceId}`,
    /** HP減少検知フラグ（攻撃ごとにリセット） */
    HP_CONSUMED_THIS_ATTACK: (sourceId: string, targetId: string) => `evernight-hp-consumed-${sourceId}-${targetId}`,
} as const;

const TRACE_IDS = {
    A2: 'evernight-trace-a2', // 暗い夜の孤独な月
    A4: 'evernight-trace-a4', // 蝋燭は灯り、そして消える
    A6: 'evernight-trace-a6', // 夜明けに降り出す雨
} as const;

// =============================================================================
// アビリティ値（レベル別）
// =============================================================================

const ABILITY_VALUES = {
    // 通常攻撃
    basicDmg: {
        6: 0.50,
        7: 0.55
    } as Record<number, number>,

    // 戦闘スキル: 味方精霊会心ダメージアップ
    skillCritDmgBuff: {
        10: 0.24,
        12: 0.264
    } as Record<number, number>,

    // 精霊スキル「雨のように降る記憶」
    spiritSkillRain: {
        10: { base: 0.50, perMemoria: 0.10 },
        12: { base: 0.55, perMemoria: 0.11 }
    } as Record<number, { base: number; perMemoria: number }>,

    // 精霊スキル「露のように儚い夢」
    spiritSkillDream: {
        10: { main: 0.12, adjacent: 0.06 },
        12: { main: 0.132, adjacent: 0.066 }
    } as Record<number, { main: number; adjacent: number }>,

    // 必殺技
    ultDmg: {
        10: { dmg: 2.00, vuln: 0.30, selfDmgBoost: 0.60 },
        12: { dmg: 2.20, vuln: 0.33, selfDmgBoost: 0.66 }
    } as Record<number, { dmg: number; vuln: number; selfDmgBoost: number }>,

    // 天賦: HP減少時会心ダメージアップ
    talentCritDmg: {
        10: 0.60,
        12: 0.66
    } as Record<number, number>,

    // 精霊天賦: 与ダメージアップ
    spiritTalentDmgBoost: {
        10: 0.50,
        12: 0.55
    } as Record<number, number>,
};

// HP消費
const SKILL_HP_COST_PCT = 0.10; // 戦闘スキル: 残りHP10%消費

// 長夜
const CHOYA_BASE_SPD = 160;
const CHOYA_HP_MULT = 0.50; // 長夜月の最大HP50%

// 星魂
const E1_DMG_MULT_4_PLUS = 1.20;
const E1_DMG_MULT_3 = 1.25;
const E1_DMG_MULT_2 = 1.30;
const E1_DMG_MULT_1 = 1.50;
const E2_CRIT_DMG_BUFF = 0.40;
const E2_MEMORIA_BONUS = 2;
const E2_ULT_CHARGE_BONUS = 2;
const E4_BREAK_EFFICIENCY = 0.25;
const E4_CHOYA_BREAK_EFFICIENCY = 0.50;
const E6_RES_PEN = 0.20;
const E6_MEMORIA_RETURN_PCT = 0.30;

// =============================================================================
// キャラクター定義
// =============================================================================

export const evernight: Character = {
    id: CHARACTER_ID,
    name: '長夜月',
    path: 'Remembrance',
    element: 'Ice',
    rarity: 5,
    maxEnergy: 240,

    baseStats: {
        hp: 1319,
        atk: 543,
        def: 582,
        spd: 99,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75
    },

    abilities: {
        basic: {
            id: 'evernight-basic',
            name: '歳月はここより霞む',
            type: 'Basic ATK',
            description: '指定した敵単体に長夜月の最大HP50%分の氷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'hp',
                hits: [{ multiplier: 0.50, toughnessReduction: 10 }]
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'evernight-skill',
            name: '白昼は静かに去る',
            type: 'Skill',
            description: '長夜月の残りHP10%分のHPを消費して、記憶の精霊「長夜」を召喚する。味方の記憶の精霊全体の会心ダメージ+24%、2ターン継続。',
            targetType: 'self',
            energyGain: 30,
            spCost: 0,
        },

        ultimate: {
            id: 'evernight-ultimate',
            name: '眠れぬ世界に永き眠りを',
            type: 'Ultimate',
            description: '記憶の精霊「長夜」を召喚し、敵全体に長夜の最大HP200%分の氷属性ダメージを与え、「至暗の謎」状態に入る。',
            energyGain: 5,
            targetType: 'all_enemies',
            damage: {
                type: 'aoe',
                scaling: 'hp',
                hits: [{ multiplier: 2.00, toughnessReduction: 30 }]
            }
        },

        talent: {
            id: 'evernight-talent',
            name: '今夜、アタシと共に',
            type: 'Talent',
            description: '戦闘に入るとき、記憶の精霊「長夜」を召喚する。HP減少時に会心ダメージ+60%。憶質16以上で行動制限解除・抵抗。',
        },

        technique: {
            id: 'evernight-technique',
            name: '冷たい雨を願って',
            type: 'Technique',
            description: '秘技使用後、次の戦闘開始時に戦闘スキルと同様の効果を獲得し、憶質を1獲得する。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2,
            name: '暗い夜の孤独な月',
            type: 'Bonus Ability',
            description: '長夜月と長夜の会心率+35%。スキル発動時HP5%消費、両者の会心ダメージ+15%。長夜が「夢」発動後SP1回復。'
        },
        {
            id: TRACE_IDS.A4,
            name: '蝋燭は灯り、そして消える',
            type: 'Bonus Ability',
            description: '戦闘開始時EP70回復、憶質1獲得。精霊スキル発動時EP5回復、憶質1獲得。'
        },
        {
            id: TRACE_IDS.A6,
            name: '夜明けに降り出す雨',
            type: 'Bonus Ability',
            description: '記憶キャラ数に応じて精霊の会心ダメージをさらにアップ。'
        },
        {
            id: 'evernight-stat-crit-rate',
            name: '会心率強化',
            type: 'Stat Bonus',
            description: '会心率+18.7%',
            stat: 'crit_rate',
            value: 0.187
        },
        {
            id: 'evernight-stat-hp',
            name: '最大HP強化',
            type: 'Stat Bonus',
            description: '最大HP+18.0%',
            stat: 'hp_pct',
            value: 0.18
        },
        {
            id: 'evernight-stat-crit-dmg',
            name: '会心ダメージ強化',
            type: 'Stat Bonus',
            description: '会心ダメージ+13.3%',
            stat: 'crit_dmg',
            value: 0.133
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '眠って、長い夜にはいい夢を',
            description: 'フィールド上の敵数に応じて精霊ダメージアップ（4体以上120%、3体125%、2体130%、1体150%）。'
        },
        e2: {
            level: 2,
            name: '耳を澄まして、眠りの中のささやき',
            description: '長夜月と長夜の会心ダメージ+40%。憶質獲得量+2。必殺技発動時チャージ+2。'
        },
        e3: {
            level: 3,
            name: '大丈夫、悪夢はもう過ぎ去った',
            description: '戦闘スキルLv+2、通常攻撃Lv+1、精霊天賦Lv+1。',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.55 }
            ]
        },
        e4: {
            level: 4,
            name: '起きて、アンタの明日が訪れる',
            description: '味方精霊の撃破効率+25%、長夜はさらに+25%。'
        },
        e5: {
            level: 5,
            name: '忘れて、記憶の中のアタシを',
            description: '必殺技Lv+2、天賦Lv+2、精霊スキルLv+1。',
            abilityModifiers: [
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 2.20 }
            ]
        },
        e6: {
            level: 6,
            name: 'このまま、ずっと',
            description: '味方全体の全属性耐性貫通+20%。長夜が「夢」発動後、消費憶質の30%を獲得。'
        }
    },

    defaultConfig: {
        lightConeId: 'long-night-shining-star',
        superimposition: 1,
        relicSetId: 'the_wondrous_poetaster',
        ornamentSetId: 'silent_ossuary',
        mainStats: {
            body: 'crit_dmg',
            feet: 'spd',
            sphere: 'ice_dmg_boost',
            rope: 'hp_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.30 },
            { stat: 'crit_dmg', value: 0.60 },
            { stat: 'hp_pct', value: 0.20 },
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
 * 長夜精霊定義を作成
 */
function createChoyaDefinition(owner: Unit, eidolonLevel: number): IMemorySpiritDefinition {
    return {
        idPrefix: SUMMON_ID_PREFIX,
        name: '長夜',
        element: 'Ice',
        hpMultiplier: CHOYA_HP_MULT,
        baseSpd: CHOYA_BASE_SPD,
        abilities: {
            basic: {
                id: 'choya-basic',
                name: 'なし',
                type: 'Basic ATK',
                description: 'なし',
                damage: { type: 'simple', scaling: 'hp', hits: [] }
            },
            skill: {
                id: 'choya-skill-rain',
                name: '雨のように降る記憶',
                type: 'Skill',
                description: '敵単体に長夜の最大HP50%分の氷属性ダメージ。憶質4につき追加ダメージ。',
                targetType: 'single_enemy',
                energyGain: 20,
                damage: {
                    type: 'simple',
                    scaling: 'hp',
                    hits: [
                        { multiplier: 0.10, toughnessReduction: 2 },
                        { multiplier: 0.10, toughnessReduction: 2 },
                        { multiplier: 0.10, toughnessReduction: 2 },
                        { multiplier: 0.10, toughnessReduction: 2 },
                        { multiplier: 0.10, toughnessReduction: 2 }
                    ]
                }
            },
            ultimate: { id: 'choya-ult', name: 'なし', type: 'Ultimate', description: 'なし' },
            talent: { id: 'choya-talent', name: 'なし', type: 'Talent', description: 'なし' },
            technique: { id: 'choya-tech', name: 'なし', type: 'Technique', description: 'なし' }
        },
        debuffImmune: true,
        untargetable: false,
        initialDuration: 999
    };
}

/**
 * 憶質を取得
 */
const getMemoria = (state: GameState, sourceUnitId: string): number => {
    return getAccumulatedValue(state, sourceUnitId, MEMORIA_KEY);
};

/**
 * 憶質を追加
 */
const addMemoria = (state: GameState, sourceUnitId: string, amount: number, eidolonLevel: number): GameState => {
    // E2: 獲得量+2
    const bonus = eidolonLevel >= 2 ? E2_MEMORIA_BONUS : 0;
    const totalAmount = amount + (amount > 0 ? bonus : 0);
    return addAccumulatedValue(state, sourceUnitId, MEMORIA_KEY, totalAmount, MAX_MEMORIA);
};

/**
 * 憶質を消費
 */
const consumeMemoria = (state: GameState, sourceUnitId: string, amount: number): GameState => {
    return consumeAccumulatedValue(state, sourceUnitId, MEMORIA_KEY, amount, 'fixed');
};

/**
 * 長夜がフィールドにいるかチェック
 */
const isChoyaActive = (state: GameState, sourceUnitId: string): boolean => {
    const choya = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    return choya !== undefined;
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
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 天賦: 戦闘開始時に長夜召喚
    const definition = createChoyaDefinition(source, eidolonLevel);
    const summonResult = summonOrRefreshSpirit(newState, source, definition);
    newState = summonResult.state;
    const choya = summonResult.spirit;

    // 精霊天賦「影のように夜に寄りそう」: 召喚時即座に行動
    newState = advanceAction(newState, choya.id as string, 1.0, 'percent');

    // A2: 長夜月と長夜の会心率+35%
    if (source.traces?.some(t => t.id === TRACE_IDS.A2)) {
        const a2Effect: IEffect = {
            id: EFFECT_IDS.A2_CRIT_RATE(sourceUnitId),
            name: '暗い夜の孤独な月',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            modifiers: [{
                target: 'crit_rate' as StatKey,
                value: 0.35,
                type: 'add' as const,
                source: 'A2'
            }],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, sourceUnitId, a2Effect);
        newState = addEffect(newState, choya.id as string, a2Effect);
    }

    // A4: 戦闘開始時EP70回復、憶質1獲得
    if (source.traces?.some(t => t.id === TRACE_IDS.A4)) {
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                ...u,
                ep: Math.min(u.stats.max_ep, u.ep + 70)
            }))
        };
        newState = addMemoria(newState, sourceUnitId, 1, eidolonLevel);
    }

    // 精霊天賦「暗闘に浮かぶ孤独」: 与ダメージアップ
    const spiritDmgBoost = getLeveledValue(ABILITY_VALUES.spiritTalentDmgBoost, 10);
    const spiritDmgEffect: IEffect = {
        id: EFFECT_IDS.SPIRIT_DMG_BUFF(sourceUnitId),
        name: '暗闘に浮かぶ孤独',
        category: 'BUFF',
        sourceUnitId: choya.id as string,
        durationType: 'PERMANENT',
        duration: -1,
        modifiers: [{
            target: 'all_type_dmg_boost' as StatKey,
            value: spiritDmgBoost,
            type: 'add' as const,
            source: '精霊天賦'
        }],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, spiritDmgEffect);
    newState = addEffect(newState, choya.id as string, spiritDmgEffect);

    // 秘技効果（useTechniqueがtrueの場合）
    const useTechnique = source.config?.useTechnique !== false;
    if (useTechnique) {
        // 戦闘スキルと同様の会心ダメージバフ効果
        newState = applySkillCritDmgBuff(newState, sourceUnitId, eidolonLevel);
        newState = addMemoria(newState, sourceUnitId, 1, eidolonLevel);
    }

    return newState;
};

/**
 * スキル使用時の会心ダメージバフ付与
 * 仕様: 「味方の記憶の精霊全体の会心ダメージが長夜月の会心ダメージX%分アップ」
 */
const applySkillCritDmgBuff = (
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
    const skillMultiplier = getLeveledValue(ABILITY_VALUES.skillCritDmgBuff, skillLevel);

    // 長夜月の会心ダメージを参照してバフ量を計算
    const ownerCritDmg = source.stats.crit_dmg || 0;
    const critDmgBuff = ownerCritDmg * skillMultiplier;

    // A6: 記憶キャラ数に応じたボーナス
    let a6Bonus = 0;
    if (source.traces?.some(t => t.id === TRACE_IDS.A6)) {
        const allies = newState.registry.getAliveAllies();
        const remembranceCount = allies.filter(a => a.path === 'Remembrance').length;
        if (remembranceCount >= 4) a6Bonus = 0.65;
        else if (remembranceCount >= 3) a6Bonus = 0.50;
        else if (remembranceCount >= 2) a6Bonus = 0.15;
        else if (remembranceCount >= 1) a6Bonus = 0.05;
    }

    // 全ての精霊に会心ダメージバフ
    const allUnits = newState.registry.toArray();
    const spirits = allUnits.filter(u => u.isSummon && !u.isEnemy);

    for (const spirit of spirits) {
        const buffEffect: IEffect = {
            id: `${EFFECT_IDS.SKILL_CRIT_DMG_BUFF(sourceUnitId)}-${spirit.id}`,
            name: '白昼は静かに去る',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: 2,
            modifiers: [{
                target: 'crit_dmg' as StatKey,
                value: critDmgBuff + a6Bonus,
                type: 'add' as const,
                source: '戦闘スキル'
            }],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, spirit.id as string, buffEffect);
    }

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

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // HP10%消費
    const hpCost = source.hp * SKILL_HP_COST_PCT;
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
            ...u,
            hp: Math.max(1, u.hp - hpCost)
        }))
    };

    // 長夜召喚またはHP回復
    const existingChoya = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
    const definition = createChoyaDefinition(source, eidolonLevel);
    const summonResult = summonOrRefreshSpirit(newState, source, definition);
    newState = summonResult.state;
    const choya = summonResult.spirit;

    if (!summonResult.isNew && existingChoya) {
        // 既存の長夜がいる場合、HP50%回復
        newState = applyHealing(newState, sourceUnitId, choya.id as string, {
            scaling: 'hp',
            multiplier: 0.50,
            flat: 0
        }, '戦闘スキル: 長夜HP回復', true);
    } else {
        // 新規召喚時、即座に行動
        newState = advanceAction(newState, choya.id as string, 1.0, 'percent');
    }

    // 会心ダメージバフ付与
    newState = applySkillCritDmgBuff(newState, sourceUnitId, eidolonLevel);

    // 至暗の謎状態なら追加で憶質12獲得、そうでなければ2獲得
    const isDarkestMystery = source.effects.some(e => e.id === EFFECT_IDS.ULT_DARKEST_MYSTERY(sourceUnitId));
    const memoriaGain = isDarkestMystery ? 14 : 2; // 2 + 12
    newState = addMemoria(newState, sourceUnitId, memoriaGain, eidolonLevel);

    // A2: スキル発動時HP5%消費、会心ダメージ+15%
    if (source.traces?.some(t => t.id === TRACE_IDS.A2)) {
        const a2HpCost = source.hp * 0.05;
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                ...u,
                hp: Math.max(1, u.hp - a2HpCost)
            }))
        };

        // A2: 会心ダメージ+15%を長夜月と長夜の両方に付与
        const a2CritDmgEffect: IEffect = {
            id: EFFECT_IDS.A2_CRIT_DMG(sourceUnitId),
            name: '暗い夜の孤独な月 (会心ダメ)',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_END_BASED',
            duration: 2,
            modifiers: [{
                target: 'crit_dmg' as StatKey,
                value: 0.15,
                type: 'add' as const,
                source: 'A2'
            }],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, sourceUnitId, a2CritDmgEffect);
        newState = addEffect(newState, choya.id as string, {
            ...a2CritDmgEffect,
            id: `${EFFECT_IDS.A2_CRIT_DMG(sourceUnitId)}-choya`
        });
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

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 長夜召喚
    const definition = createChoyaDefinition(source, eidolonLevel);
    const summonResult = summonOrRefreshSpirit(newState, source, definition);
    newState = summonResult.state;
    const choya = summonResult.spirit;

    // 即座に行動
    newState = advanceAction(newState, choya.id as string, 1.0, 'percent');

    // 必殺技バフ/デバフ
    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
    const ultValues = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);

    // 敵全体に被ダメージアップ
    const enemies = TargetSelector.select(source, newState, { type: 'all_enemies' });
    for (const enemy of enemies) {
        const vulnEffect: IEffect = {
            id: `${EFFECT_IDS.ULT_VULN_DEBUFF(sourceUnitId)}-${enemy.id}`,
            name: '至暗の謎 (被ダメージ)',
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            modifiers: [{
                target: 'all_type_vuln' as StatKey,
                value: ultValues.vuln,
                type: 'add' as const,
                source: '至暗の謎'
            }],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, enemy.id as string, vulnEffect);
    }

    // 長夜が敵全体にダメージを与える
    // 仕様: 「長夜は敵全体に自身の最大HPX%分の氷属性ダメージを与え」
    const ultDmg = choya.stats.hp * ultValues.dmg;
    for (const enemy of enemies) {
        const dmgResult = calculateNormalAdditionalDamageWithCritInfo(choya, enemy, ultDmg);
        const result = applyUnifiedDamage(newState, choya, enemy, dmgResult.damage, {
            damageType: 'ULTIMATE',
            details: '眠れぬ世界に永き眠りを',
            skipLog: false,
            isCrit: dmgResult.isCrit,
            breakdownMultipliers: dmgResult.breakdownMultipliers
        });
        newState = result.state;
    }

    // 長夜月と長夜に与ダメージアップ
    const dmgBoostEffect: IEffect = {
        id: EFFECT_IDS.ULT_DARKEST_MYSTERY(sourceUnitId),
        name: '至暗の謎',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: 2, // チャージ2
        maxStacks: 4, // E2で+2
        modifiers: [{
            target: 'all_type_dmg_boost' as StatKey,
            value: ultValues.selfDmgBoost,
            type: 'add' as const,
            source: '至暗の謎'
        }],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, dmgBoostEffect);
    newState = addEffect(newState, choya.id as string, {
        ...dmgBoostEffect,
        id: `${EFFECT_IDS.ULT_DARKEST_MYSTERY(sourceUnitId)}-choya`
    });

    // E2: 追加チャージ
    if (eidolonLevel >= 2) {
        const mysteryEffect = newState.registry.get(createUnitId(sourceUnitId))?.effects.find(
            e => e.id === EFFECT_IDS.ULT_DARKEST_MYSTERY(sourceUnitId)
        );
        if (mysteryEffect) {
            const updatedEffect = {
                ...mysteryEffect,
                stackCount: (mysteryEffect.stackCount || 2) + E2_ULT_CHARGE_BONUS
            };
            const unitEffects = newState.registry.get(createUnitId(sourceUnitId))!.effects;
            const updatedEffects = unitEffects.map(e =>
                e.id === mysteryEffect.id ? updatedEffect : e
            );
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                    ...u,
                    effects: updatedEffects
                }))
            };
        }
    }

    return newState;
};

/**
 * HP減少時（天賦）
 * 仕様: 「この効果はそれぞれが攻撃を受けるたびに最大で1回発動できる」
 */
const onHpConsumed = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // HpConsumeEvent型にキャスト
    if (event.type !== 'ON_HP_CONSUMED') return state;
    const hpEvent = event as { type: 'ON_HP_CONSUMED'; targetId: string; sourceId: string; amount: number };
    const targetId = hpEvent.targetId;

    // 長夜月または長夜のHP減少かチェック
    const source = state.registry.get(createUnitId(sourceUnitId));
    const choya = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (targetId !== sourceUnitId && (!choya || targetId !== choya.id)) return state;

    let newState = state;

    // 「攻撃ごとに最大1回」の制限チェック
    const hpConsumedFlagId = EFFECT_IDS.HP_CONSUMED_THIS_ATTACK(sourceUnitId, targetId);
    const alreadyTriggered = source?.effects.some(e => e.id === hpConsumedFlagId);
    if (alreadyTriggered) return newState;

    // フラグを設定（ターン終了時にリセット）
    const hpConsumedFlag: IEffect = {
        id: hpConsumedFlagId,
        name: 'HP減少検知済み',
        category: 'OTHER',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_END_BASED',
        duration: 1,
        modifiers: [],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, hpConsumedFlag);

    // 天賦: 会心ダメージアップ
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const critDmgBuff = getLeveledValue(ABILITY_VALUES.talentCritDmg, talentLevel);

    // E2: 追加会心ダメージ
    const e2Bonus = eidolonLevel >= 2 ? E2_CRIT_DMG_BUFF : 0;

    const talentEffect: IEffect = {
        id: EFFECT_IDS.TALENT_CRIT_DMG_BUFF(sourceUnitId),
        name: '今夜、アタシと共に',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_END_BASED',
        duration: 2,
        modifiers: [{
            target: 'crit_dmg' as StatKey,
            value: critDmgBuff + e2Bonus,
            type: 'add' as const,
            source: '天賦'
        }],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };

    // 長夜月と長夜の両方に付与
    newState = addEffect(newState, sourceUnitId, talentEffect);
    if (choya) {
        newState = addEffect(newState, choya.id as string, {
            ...talentEffect,
            id: `${EFFECT_IDS.TALENT_CRIT_DMG_BUFF(sourceUnitId)}-choya`
        });
    }

    // 憶質2獲得
    newState = addMemoria(newState, sourceUnitId, 2, eidolonLevel);

    // 憶質16以上で長夜即座行動（フラグがリセットされている場合のみ）
    const currentMemoria = getMemoria(newState, sourceUnitId);
    if (currentMemoria >= MEMORIA_ULT_TRIGGER && choya) {
        const instantUsed = newState.registry.get(createUnitId(sourceUnitId))?.effects.some(
            e => e.id === EFFECT_IDS.INSTANT_ACTION_USED(sourceUnitId)
        );
        if (!instantUsed) {
            newState = advanceAction(newState, choya.id as string, 1.0, 'percent');
            // フラグ設定
            const flagEffect: IEffect = {
                id: EFFECT_IDS.INSTANT_ACTION_USED(sourceUnitId),
                name: '即座行動済み',
                category: 'OTHER',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [],
                apply: (t: Unit, s: GameState) => s,
                remove: (t: Unit, s: GameState) => s
            };
            newState = addEffect(newState, sourceUnitId, flagEffect);
        }
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
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 長夜月のターン開始時: 至暗の謎チャージチェック
    if (event.sourceId === sourceUnitId) {
        const mysteryEffect = source.effects.find(e => e.id === EFFECT_IDS.ULT_DARKEST_MYSTERY(sourceUnitId));
        if (mysteryEffect && (mysteryEffect.stackCount || 0) <= 0) {
            // チャージがない場合、至暗の謎解除
            newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.ULT_DARKEST_MYSTERY(sourceUnitId));
            // 敵の被ダメージアップも解除
            const enemies = TargetSelector.select(source, newState, { type: 'all_enemies' });
            for (const enemy of enemies) {
                newState = removeEffect(newState, enemy.id as string, `${EFFECT_IDS.ULT_VULN_DEBUFF(sourceUnitId)}-${enemy.id}`);
            }
            // 長夜のバフも解除
            const choya = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
            if (choya) {
                newState = removeEffect(newState, choya.id as string, `${EFFECT_IDS.ULT_DARKEST_MYSTERY(sourceUnitId)}-choya`);
            }
        }

        // 戦闘スキルバフの継続時間-1
        const skillBuffEffect = source.effects.find(e => e.id.startsWith(EFFECT_IDS.SKILL_CRIT_DMG_BUFF(sourceUnitId)));
        if (skillBuffEffect && skillBuffEffect.duration > 0) {
            // TURN_START_BASEDなのでeffectManagerが自動で処理
        }
    }

    // 長夜のターン開始時: 精霊スキル発動
    const choya = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
    if (choya && event.sourceId === choya.id) {
        newState = executeSpiritAction(newState, sourceUnitId, choya.id as string, eidolonLevel);
    }

    return newState;
};

/**
 * 精霊の行動を実行
 */
const executeSpiritAction = (
    state: GameState,
    ownerId: string,
    spiritId: string,
    eidolonLevel: number
): GameState => {
    const owner = state.registry.get(createUnitId(ownerId));
    const spirit = state.registry.get(createUnitId(spiritId));
    if (!owner || !spirit) return state;

    let newState = state;
    const currentMemoria = getMemoria(newState, ownerId);

    // 憶質16以上かつ長夜月が行動制限状態でない場合、「夢」発動
    // (行動制限チェックは簡略化)
    if (currentMemoria >= MEMORIA_ULT_TRIGGER) {
        newState = executeDreamAttack(newState, ownerId, spiritId, currentMemoria, eidolonLevel);
    } else {
        newState = executeRainAttack(newState, ownerId, spiritId, eidolonLevel);
    }

    return newState;
};

/**
 * 精霊スキル「雨のように降る記憶」実行
 */
const executeRainAttack = (
    state: GameState,
    ownerId: string,
    spiritId: string,
    eidolonLevel: number
): GameState => {
    const owner = state.registry.get(createUnitId(ownerId));
    const spirit = state.registry.get(createUnitId(spiritId));
    if (!owner || !spirit) return state;

    let newState = state;

    // ターゲット選択（前回攻撃した敵を優先、なければランダム）
    const enemies = TargetSelector.select(spirit, newState, { type: 'all_enemies' });
    if (enemies.length === 0) return newState;

    const target = enemies[0]; // 簡略化: 最初の敵

    // ダメージ計算
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const rainValues = getLeveledValue(ABILITY_VALUES.spiritSkillRain, skillLevel);
    const currentMemoria = getMemoria(newState, ownerId);

    // 基礎ダメージ: HP50%
    const baseDmg = spirit.stats.hp * rainValues.base;

    // 憶質4につき追加ダメージ
    const memoriaBonus = Math.floor(currentMemoria / 4) * rainValues.perMemoria * spirit.stats.hp;

    // E1: 敵数に応じたダメージ倍率
    let e1Mult = 1.0;
    if (eidolonLevel >= 1) {
        const enemyCount = enemies.length;
        if (enemyCount >= 4) e1Mult = E1_DMG_MULT_4_PLUS;
        else if (enemyCount === 3) e1Mult = E1_DMG_MULT_3;
        else if (enemyCount === 2) e1Mult = E1_DMG_MULT_2;
        else e1Mult = E1_DMG_MULT_1;
    }

    const totalDmg = (baseDmg + memoriaBonus) * e1Mult;

    // ダメージ適用（5ヒット）
    const hitCount = 5;
    const dmgPerHit = totalDmg / hitCount;

    for (let i = 0; i < hitCount; i++) {
        const dmgResult = calculateNormalAdditionalDamageWithCritInfo(spirit, target, dmgPerHit);
        const result = applyUnifiedDamage(newState, spirit, target, dmgResult.damage, {
            damageType: 'SPIRIT_SKILL',
            details: `雨のように降る記憶 (${i + 1}/${hitCount})`,
            skipLog: true,
            isCrit: dmgResult.isCrit,
            breakdownMultipliers: dmgResult.breakdownMultipliers
        });
        newState = result.state;
    }

    // 発動後、憶質1獲得
    newState = addMemoria(newState, ownerId, 1, eidolonLevel);

    // 精霊スキル「雨」のEP20回復（仕様通り）
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(ownerId), u => ({
            ...u,
            ep: Math.min(u.stats.max_ep, u.ep + 20)
        }))
    };

    // A4: 追加EP5回復、憶質1獲得
    if (owner.traces?.some(t => t.id === TRACE_IDS.A4)) {
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(ownerId), u => ({
                ...u,
                ep: Math.min(u.stats.max_ep, u.ep + 5)
            }))
        };
        newState = addMemoria(newState, ownerId, 1, eidolonLevel);
    }

    // ログ追加
    newState = {
        ...newState,
        log: [...newState.log, {
            actionType: '精霊スキル',
            sourceId: spiritId,
            characterName: spirit.name,
            details: `雨のように降る記憶: ${target.name}に${Math.round(totalDmg)}ダメージ (憶質${currentMemoria})`
        }]
    };

    return newState;
};

/**
 * 精霊スキル「露のように儚い夢」実行
 */
const executeDreamAttack = (
    state: GameState,
    ownerId: string,
    spiritId: string,
    consumedMemoria: number,
    eidolonLevel: number
): GameState => {
    const owner = state.registry.get(createUnitId(ownerId));
    const spirit = state.registry.get(createUnitId(spiritId));
    if (!owner || !spirit) return state;

    let newState = state;

    const enemies = TargetSelector.select(spirit, newState, { type: 'all_enemies' });
    if (enemies.length === 0) return newState;

    const mainTarget = enemies[0];
    const adjacentTargets = enemies.slice(1);

    // ダメージ計算
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const dreamValues = getLeveledValue(ABILITY_VALUES.spiritSkillDream, skillLevel);

    // E1: 敵数に応じたダメージ倍率
    let e1Mult = 1.0;
    if (eidolonLevel >= 1) {
        const enemyCount = enemies.length;
        if (enemyCount >= 4) e1Mult = E1_DMG_MULT_4_PLUS;
        else if (enemyCount === 3) e1Mult = E1_DMG_MULT_3;
        else if (enemyCount === 2) e1Mult = E1_DMG_MULT_2;
        else e1Mult = E1_DMG_MULT_1;
    }

    // 憶質1につきダメージ
    const mainDmg = consumedMemoria * dreamValues.main * spirit.stats.hp * e1Mult;
    const adjDmg = consumedMemoria * dreamValues.adjacent * spirit.stats.hp * e1Mult;

    // メインターゲットにダメージ
    const mainDmgResult = calculateNormalAdditionalDamageWithCritInfo(spirit, mainTarget, mainDmg);
    let result = applyUnifiedDamage(newState, spirit, mainTarget, mainDmgResult.damage, {
        damageType: 'SPIRIT_SKILL',
        details: '露のように儚い夢 (メイン)',
        skipLog: true,
        isCrit: mainDmgResult.isCrit,
        breakdownMultipliers: mainDmgResult.breakdownMultipliers
    });
    newState = result.state;

    // 隣接ターゲットにダメージ
    for (const adjTarget of adjacentTargets) {
        const adjDmgResult = calculateNormalAdditionalDamageWithCritInfo(spirit, adjTarget, adjDmg);
        result = applyUnifiedDamage(newState, spirit, adjTarget, adjDmgResult.damage, {
            damageType: 'SPIRIT_SKILL',
            details: '露のように儚い夢 (隣接)',
            skipLog: true,
            isCrit: adjDmgResult.isCrit,
            breakdownMultipliers: adjDmgResult.breakdownMultipliers
        });
        newState = result.state;
    }

    // 至暗の謎チャージ消費
    const mysteryEffect = owner.effects.find(e => e.id === EFFECT_IDS.ULT_DARKEST_MYSTERY(ownerId));
    if (mysteryEffect) {
        const newCharge = Math.max(0, (mysteryEffect.stackCount || 0) - 1);
        const updatedEffect = { ...mysteryEffect, stackCount: newCharge };
        const unitEffects = newState.registry.get(createUnitId(ownerId))!.effects;
        const updatedEffects = unitEffects.map(e => e.id === mysteryEffect.id ? updatedEffect : e);
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(ownerId), u => ({ ...u, effects: updatedEffects }))
        };
    }

    // E6: 消費憶質の30%を獲得
    if (eidolonLevel >= 6) {
        const returnMemoria = Math.floor(consumedMemoria * E6_MEMORIA_RETURN_PCT);
        newState = addMemoria(newState, ownerId, returnMemoria, eidolonLevel);
    }

    // A2: SP1回復
    if (owner.traces?.some(t => t.id === TRACE_IDS.A2)) {
        newState = {
            ...newState,
            skillPoints: Math.min(newState.maxSkillPoints, newState.skillPoints + 1)
        };
    }

    // 仕様: 「発動後、HPと憶質をすべて消費し、長夜は退場する」
    // 長夜のHP全消費
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(spiritId), u => ({
            ...u,
            hp: 0
        }))
    };

    // 憶質全消費
    newState = consumeMemoria(newState, ownerId, consumedMemoria);

    // 精霊スキル「夢」のEP10回復
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(ownerId), u => ({
            ...u,
            ep: Math.min(u.stats.max_ep, u.ep + 10)
        }))
    };

    // 長夜退場
    newState = dismissSpiritWithSpeedBuff(newState, ownerId, spiritId, consumedMemoria, eidolonLevel);

    // 即座行動フラグリセット
    newState = removeEffect(newState, ownerId, EFFECT_IDS.INSTANT_ACTION_USED(ownerId));

    // ログ追加
    newState = {
        ...newState,
        log: [...newState.log, {
            actionType: '精霊スキル',
            sourceId: spiritId,
            characterName: spirit.name,
            details: `露のように儚い夢: 憶質${consumedMemoria}消費、${Math.round(mainDmg)}ダメージ`
        }]
    };

    return newState;
};

/**
 * 長夜退場時の速度バフ付与
 */
const dismissSpiritWithSpeedBuff = (
    state: GameState,
    ownerId: string,
    spiritId: string,
    consumedMemoria: number,
    eidolonLevel: number
): GameState => {
    let newState = state;

    // 基礎速度バフ: +10%
    let spdBonus = 0.10;

    // 「夢」発動時: 憶質1につき+1%（最大40）
    const memoriaBonus = Math.min(consumedMemoria, 40) * 0.01;
    spdBonus += memoriaBonus;

    const spdEffect: IEffect = {
        id: EFFECT_IDS.EXIT_SPD_BUFF(ownerId),
        name: 'さよなら、永遠に',
        category: 'BUFF',
        sourceUnitId: spiritId,
        durationType: 'TURN_END_BASED',
        duration: 1,
        modifiers: [{
            target: 'spd_pct' as StatKey,
            value: spdBonus,
            type: 'add' as const,
            source: '退場時'
        }],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };

    newState = addEffect(newState, ownerId, spdEffect);

    // 長夜を削除
    newState = dismissSpirit(newState, spiritId);

    return newState;
};

/**
 * ダメージ計算前処理
 */
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (!event.sourceId) return state;

    let newState = state;

    // E4: 精霊の撃破効率アップ
    if (eidolonLevel >= 4) {
        const attacker = newState.registry.get(createUnitId(event.sourceId));
        if (attacker?.isSummon && !attacker.isEnemy) {
            const choya = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
            let breakEfficiency = E4_BREAK_EFFICIENCY;
            if (choya && event.sourceId === choya.id) {
                breakEfficiency = E4_CHOYA_BREAK_EFFICIENCY;
            }
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    breakEfficiencyBoost: (newState.damageModifiers.breakEfficiencyBoost || 0) + breakEfficiency
                }
            };
        }
    }

    // E6: 全属性耐性貫通+20%
    if (eidolonLevel >= 6) {
        const attacker = newState.registry.get(createUnitId(event.sourceId));
        const owner = newState.registry.get(createUnitId(sourceUnitId));
        if (attacker && owner && !attacker.isEnemy) {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: (newState.damageModifiers.resReduction || 0) + E6_RES_PEN
                }
            };
        }
    }

    return newState;
};

// =============================================================================
// ハンドラーファクトリ
// =============================================================================

export const evernightHandlerFactory: IEventHandlerFactory = (
    sourceUnitId: string,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `evernight-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_TURN_START',
                'ON_HP_CONSUMED',
                'ON_BEFORE_DAMAGE_CALCULATION',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_SKILL_USED') {
                const actionEvent = event as ActionEvent;

                // 長夜月本体のスキル
                if (actionEvent.sourceId === sourceUnitId) {
                    return onSkillUsed(actionEvent, state, sourceUnitId, eidolonLevel);
                }

                // A4: 味方の記憶の精霊がスキルを発動した時、EP5回復、憶質1獲得
                const attacker = state.registry.get(createUnitId(actionEvent.sourceId));
                if (attacker?.isSummon && !attacker.isEnemy && unit.traces?.some(t => t.id === TRACE_IDS.A4)) {
                    let newState = state;
                    newState = {
                        ...newState,
                        registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                            ...u,
                            ep: Math.min(u.stats.max_ep, u.ep + 5)
                        }))
                    };
                    newState = addMemoria(newState, sourceUnitId, 1, eidolonLevel);
                    return newState;
                }

                return state;
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_TURN_START') {
                return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_HP_CONSUMED') {
                return onHpConsumed(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
