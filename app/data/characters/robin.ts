import { Character, StatKey, IAbility } from '../../types/index';
import { Modifier } from '../../types/stats';
import {
    IEventHandlerFactory,
    IEvent,
    GameState,
    Unit,
    ActionEvent,
    GeneralEvent,
    BeforeDamageCalcEvent
} from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { advanceAction } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent, applyUnifiedDamage, appendAdditionalDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';
import { calculateActionValue, setUnitActionValue, updateActionQueue } from '../../simulator/engine/actionValue';
import { insertSummonAfterOwner, removeSummon } from '../../simulator/engine/summonManager';

// =============================================================================
// 定数定義
// =============================================================================

const CHARACTER_ID = 'robin';
const COUNTDOWN_ID_PREFIX = 'robin-concerto-countdown';
const COUNTDOWN_SPEED = 90;  // 協奏のカウントダウン速度（仕様書より）

const EFFECT_IDS = {
    /** スキルの与ダメージバフ */
    SKILL_DMG_BOOST: (sourceId: string) => `robin-skill-dmg-boost-${sourceId}`,
    /** 協奏状態 */
    CONCERTO: (sourceId: string) => `robin-concerto-${sourceId}`,
    /** 協奏時の攻撃力バフ */
    CONCERTO_ATK_BOOST: (sourceId: string) => `robin-concerto-atk-boost-${sourceId}`,
    /** E1: 全耐性貫通 */
    E1_RES_PEN: (sourceId: string) => `robin-e1-res-pen-${sourceId}`,
    /** E2: 速度バフ */
    E2_SPD_BOOST: (sourceId: string) => `robin-e2-spd-boost-${sourceId}`,
    /** E4: 効果抵抗バフ */
    E4_EFFECT_RES: (sourceId: string) => `robin-e4-effect-res-${sourceId}`,
    /** E6: 付加ダメージカウンター */
    E6_COUNTER: (sourceId: string) => `robin-e6-counter-${sourceId}`,
    /** 天賦: 会心ダメージオーラ */
    TALENT_CRIT_DMG: (sourceId: string) => `robin-talent-crit-dmg-${sourceId}`,
    /** A4: 追加攻撃会心ダメージ */
    A4_FUA_CRIT_DMG: (sourceId: string) => `robin-a4-fua-crit-dmg-${sourceId}`,
} as const;

const TRACE_IDS = {
    /** A2: 華彩のコロラトゥーラ */
    A2_ACTION_ADVANCE: 'robin-trace-a2',
    /** A4: アドリブの装飾曲 */
    A4_FUA_CRIT_DMG: 'robin-trace-a4',
    /** A6: 反復するピリオド */
    A6_SKILL_EP: 'robin-trace-a6',
} as const;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 通常攻撃: E5でLv7に上昇
    basicMult: {
        6: 1.00,
        7: 1.10
    } as Record<number, number>,
    // スキル与ダメージバフ: E3でLv12に上昇
    skillDmgBoost: {
        10: 0.50,
        12: 0.55
    } as Record<number, number>,
    // 必殺技攻撃力バフ倍率: E3でLv12に上昇
    ultAtkMult: {
        10: 0.228,
        12: 0.2432
    } as Record<number, number>,
    // 必殺技攻撃力バフ固定値: E3でLv12に上昇
    ultAtkFlat: {
        10: 200,
        12: 230
    } as Record<number, number>,
    // 必殺技付加ダメージ倍率: E3でLv12に上昇
    ultAdditionalMult: {
        10: 1.20,
        12: 1.296
    } as Record<number, number>,
    // 天賦会心ダメージ: E5でLv12に上昇
    talentCritDmg: {
        10: 0.20,
        12: 0.23
    } as Record<number, number>,
};

// 通常攻撃
const BASIC_TOUGHNESS = 10;
const BASIC_EP = 20;
const BASIC_HITS = 3;

// スキル
const SKILL_DURATION = 3;  // ロビンのターン基準で減少

// 必殺技
const ULT_EP = 5;
const CONCERTO_FIXED_CRIT_RATE = 1.00;
const CONCERTO_FIXED_CRIT_DMG = 1.50;

// 天賦
const TALENT_EP = 2;

// 軌跡
const A2_ACTION_ADVANCE = 0.25;
const A4_FUA_CRIT_DMG = 0.25;
const A6_SKILL_EP = 5;

// 星魂
const E1_RES_PEN = 0.24;
const E2_SPD_BOOST = 0.16;
const E2_EXTRA_EP = 1;
const E4_EFFECT_RES = 0.50;
const E6_CRIT_DMG_BOOST = 4.50;
const E6_MAX_COUNT = 8;

// ヘイト
const AGGRO = 100;  // 調和標準

// 秘技
const TECHNIQUE_EP = 5;

// =============================================================================
// キャラクター定義
// =============================================================================

export const robin: Character = {
    id: CHARACTER_ID,
    name: 'ロビン',
    path: 'Harmony',
    element: 'Physical',
    rarity: 5,
    maxEnergy: 160,
    baseStats: {
        hp: 1280,
        atk: 640,
        def: 485,
        spd: 102,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: AGGRO
    },

    abilities: {
        basic: {
            id: 'robin-basic',
            name: '羽ばたくホワイトノイズ',
            type: 'Basic ATK',
            description: '指定した敵単体にロビンの攻撃力100%分の物理ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 1.00, toughnessReduction: BASIC_TOUGHNESS }
                ],
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'robin-skill',
            name: '飛翔のアリア',
            type: 'Skill',
            description: '味方全体の与ダメージ+50%、3ターン継続。',
            targetType: 'all_allies',
            energyGain: 30,
            spCost: 1,
        },

        ultimate: {
            id: 'robin-ultimate',
            name: '千の音で、群星にフーガを',
            type: 'Ultimate',
            description: '「協奏」状態に入り、自分以外の味方を即座に行動させる。味方全体の攻撃力がロビンの攻撃力に基づいてアップ。味方攻撃後、ロビンが付加ダメージを与える。',
            targetType: 'all_allies',
            energyGain: ULT_EP,
        },

        talent: {
            id: 'robin-talent',
            name: '調和の純正律',
            type: 'Talent',
            description: '味方全体の会心ダメージ+20%。味方が敵に攻撃後、ロビンのEPを2回復。',
            energyGain: 0,
        },

        technique: {
            id: 'robin-technique',
            name: '酩酊のオーバーチュア',
            type: 'Technique',
            description: '領域展開中に戦闘に入った後、各ウェーブ開始時にロビンはEPを5回復する。',
        },
    },

    traces: [
        {
            id: TRACE_IDS.A2_ACTION_ADVANCE,
            name: '華彩のコロラトゥーラ',
            type: 'Bonus Ability',
            description: '戦闘開始時、自身の行動順が25%早まる。'
        },
        {
            id: TRACE_IDS.A4_FUA_CRIT_DMG,
            name: 'アドリブの装飾曲',
            type: 'Bonus Ability',
            description: '「協奏」状態の時、味方全体の追加攻撃が与える会心ダメージ+25%。'
        },
        {
            id: TRACE_IDS.A6_SKILL_EP,
            name: '反復するピリオド',
            type: 'Bonus Ability',
            description: '戦闘スキルを発動する時、さらにEPを5回復する。'
        },
        {
            id: 'robin-stat-atk',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct' as StatKey,
            value: 0.28
        },
        {
            id: 'robin-stat-hp',
            name: '最大HP',
            type: 'Stat Bonus',
            description: '最大HP+18.0%',
            stat: 'hp_pct' as StatKey,
            value: 0.18
        },
        {
            id: 'robin-stat-spd',
            name: '速度',
            type: 'Stat Bonus',
            description: '速度+5',
            stat: 'spd' as StatKey,
            value: 5
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '微笑みの国',
            description: '「協奏」状態の時、味方全体の全耐性貫通+24%。'
        },
        e2: {
            level: 2,
            name: '2人のアフタヌーンティー',
            description: '「協奏」状態の時、味方全体の速度+16%、天賦のEP回復効果がさらに1アップする。'
        },
        e3: {
            level: 3,
            name: '逆さまの主音',
            description: '戦闘スキルのLv+2、必殺技のLv+2。',
        },
        e4: {
            level: 4,
            name: '雨粒のカギ',
            description: '必殺技を発動する時、味方全体の行動制限系デバフを解除する。ロビンが「協奏」状態の時、味方全体の効果抵抗+50%。'
        },
        e5: {
            level: 5,
            name: '孤独な星の涙',
            description: '通常攻撃のLv+1、天賦のLv+2。',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 },
            ]
        },
        e6: {
            level: 6,
            name: '月隠りの真夜中',
            description: '「協奏」状態の時、必殺技による物理付加ダメージの会心ダメージ+450%。8回まで発動可能、必殺技でリセット。'
        }
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'flowing-nightglow',
        superimposition: 1,
        relicSetId: 'messenger_traversing_hackerspace',
        ornamentSetId: 'broken_keel',
        mainStats: {
            body: 'atk_pct',
            feet: 'spd',
            sphere: 'atk_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'atk_pct', value: 0.40 },
            { stat: 'spd', value: 20 },
            { stat: 'effect_res', value: 0.10 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    },
};

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 協奏状態かどうかをチェック
 */
const isInConcerto = (state: GameState, sourceUnitId: string): boolean => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return false;
    return unit.effects.some(e => e.id === EFFECT_IDS.CONCERTO(sourceUnitId));
};

/**
 * カウントダウンIDを取得
 */
const getCountdownId = (sourceUnitId: string): string => {
    return `${COUNTDOWN_ID_PREFIX}-${sourceUnitId}`;
};

/**
 * 協奏カウントダウンを挿入
 */
const insertConcertoCountdown = (state: GameState, sourceUnitId: string): GameState => {
    const countdownId = getCountdownId(sourceUnitId);
    const countdownAV = calculateActionValue(COUNTDOWN_SPEED);

    // 既存のカウントダウンがあれば何もしない
    if (state.registry.get(createUnitId(countdownId))) {
        return state;
    }

    // システムユニットとして作成
    const countdownUnit: Unit = {
        id: createUnitId(countdownId),
        name: '協奏カウントダウン',
        element: 'Physical',
        path: 'Harmony',
        stats: {
            hp: 1, atk: 0, def: 999999, spd: COUNTDOWN_SPEED,
            crit_rate: 0, crit_dmg: 0, max_ep: 0,
            aggro: 0, break_effect: 0, effect_hit_rate: 0, effect_res: 0,
            energy_regen_rate: 0, outgoing_healing_boost: 0
        } as Unit['stats'],
        baseStats: {
            hp: 1, atk: 0, def: 999999, spd: COUNTDOWN_SPEED,
            crit_rate: 0, crit_dmg: 0, max_ep: 0,
            aggro: 0, break_effect: 0, effect_hit_rate: 0, effect_res: 0,
            energy_regen_rate: 0, outgoing_healing_boost: 0
        } as Unit['baseStats'],
        hp: 1,
        isEnemy: false,
        isSummon: false, // 召喚物ではなくカウントダウンとして扱う
        isCountdown: true,
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

    let newState = insertSummonAfterOwner(state, countdownUnit, sourceUnitId);
    newState = updateActionQueue(newState);

    return newState;
};

/**
 * 協奏カウントダウンを削除
 */
const removeConcertoCountdown = (state: GameState, sourceUnitId: string): GameState => {
    const countdownId = getCountdownId(sourceUnitId);
    return removeSummon(state, countdownId);
};

/**
 * スキルの与ダメージバフエフェクトを作成
 */
function createSkillDmgBoostEffect(
    sourceId: string,
    duration: number,
    eidolonLevel: number
): IEffect {
    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
    const dmgBoost = getLeveledValue(ABILITY_VALUES.skillDmgBoost, skillLevel);

    return {
        id: EFFECT_IDS.SKILL_DMG_BOOST(sourceId),
        name: '飛翔のアリア',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',  // ロビンのターン基準
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: [{
            source: '飛翔のアリア',
            target: 'all_type_dmg_boost',
            type: 'add',
            value: dmgBoost,
        }],
       
       
    };
}

/**
 * 天賦の会心ダメージオーラを作成
 */
function createTalentCritDmgAura(sourceId: string, eidolonLevel: number): IEffect {
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const critDmg = getLeveledValue(ABILITY_VALUES.talentCritDmg, talentLevel);

    return {
        id: EFFECT_IDS.TALENT_CRIT_DMG(sourceId),
        name: '調和の純正律',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        tags: ['AURA'],
        modifiers: [{
            source: '調和の純正律',
            target: 'crit_dmg',
            type: 'add',
            value: critDmg,
        }],
       
       
    };
}

/**
 * 協奏時の攻撃力バフエフェクトを作成
 */
function createConcertoAtkBoostEffect(
    sourceId: string,
    robinAtk: number,
    eidolonLevel: number
): IEffect {
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const atkMult = getLeveledValue(ABILITY_VALUES.ultAtkMult, ultLevel);
    const atkFlat = getLeveledValue(ABILITY_VALUES.ultAtkFlat, ultLevel);
    const atkBoost = robinAtk * atkMult + atkFlat;

    return {
        id: EFFECT_IDS.CONCERTO_ATK_BOOST(sourceId),
        name: '千の音で、群星にフーガを',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'LINKED',
        duration: 0,
        linkedEffectId: EFFECT_IDS.CONCERTO(sourceId),
        modifiers: [{
            source: '千の音で、群星にフーガを',
            target: 'atk' as StatKey,
            type: 'add',
            value: atkBoost,
        }],
       
       
    };
}

/**
 * E6カウンターの取得
 */
const getE6Counter = (state: GameState, sourceUnitId: string): number => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.E6_COUNTER(sourceUnitId));
    return effect?.stackCount || 0;
};

/**
 * E6カウンターを増加
 */
const incrementE6Counter = (state: GameState, sourceUnitId: string): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const effectId = EFFECT_IDS.E6_COUNTER(sourceUnitId);
    const existingEffect = unit.effects.find(e => e.id === effectId);
    const currentCount = existingEffect?.stackCount || 0;
    const newCount = currentCount + 1;

    if (existingEffect) {
        const updatedEffect: IEffect = {
            ...existingEffect,
            stackCount: newCount,
            name: `月隠りの真夜中 (${newCount}/${E6_MAX_COUNT})`,
        };
        const updatedEffects = unit.effects.map(e => e.id === effectId ? updatedEffect : e);
        return {
            ...state,
            registry: state.registry.update(createUnitId(sourceUnitId), u => ({
                ...u,
                effects: updatedEffects
            }))
        };
    } else {
        const counterEffect: IEffect = {
            id: effectId,
            name: `月隠りの真夜中 (${newCount}/${E6_MAX_COUNT})`,
            category: 'STATUS',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: newCount,
           
           
        };
        return addEffect(state, sourceUnitId, counterEffect);
    }
};

/**
 * E6カウンターをリセット
 */
const resetE6Counter = (state: GameState, sourceUnitId: string): GameState => {
    return removeEffect(state, sourceUnitId, EFFECT_IDS.E6_COUNTER(sourceUnitId));
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
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 秘技使用時: EP+5
    const useTechnique = unit.config?.useTechnique !== false;
    if (useTechnique) {
        newState = addEnergyToUnit(newState, sourceUnitId, TECHNIQUE_EP);
    }

    // A2: 戦闘開始時、行動順25%早まる
    const traceA2 = unit.traces?.find(t => t.id === TRACE_IDS.A2_ACTION_ADVANCE);
    if (traceA2) {
        newState = advanceAction(newState, sourceUnitId, A2_ACTION_ADVANCE, 'percent');
    }

    // 天賦オーラ: 味方全体の会心ダメージ+20%
    const allies = newState.registry.toArray().filter(u => !u.isEnemy && u.hp > 0 && !u.isSummon);
    const talentAura = createTalentCritDmgAura(sourceUnitId, eidolonLevel);
    for (const ally of allies) {
        newState = addEffect(newState, ally.id, talentAura);
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

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 味方全体に与ダメージバフを付与
    const allies = newState.registry.toArray().filter(u => !u.isEnemy && u.hp > 0 && !u.isSummon);
    const skillBuff = createSkillDmgBoostEffect(sourceUnitId, SKILL_DURATION, eidolonLevel);

    for (const ally of allies) {
        newState = addEffect(newState, ally.id, skillBuff);
    }

    // A6: スキル発動時EP+5
    const traceA6 = unit.traces?.find(t => t.id === TRACE_IDS.A6_SKILL_EP);
    if (traceA6) {
        newState = addEnergyToUnit(newState, sourceUnitId, A6_SKILL_EP);
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

    // E6カウンターをリセット
    if (eidolonLevel >= 6) {
        newState = resetE6Counter(newState, sourceUnitId);
    }

    // E4: 必殺技発動時、味方全体のデバフ解除
    if (eidolonLevel >= 4) {
        const allies = newState.registry.toArray().filter(u => !u.isEnemy && u.hp > 0 && !u.isSummon);
        for (const ally of allies) {
            const debuffs = ally.effects.filter(e => e.category === 'DEBUFF');
            for (const debuff of debuffs) {
                // 行動制限系デバフのみ解除（CC_IMMOBILIZE タグを持つもの）
                if (debuff.tags?.includes('CC') || debuff.tags?.includes('CROWD_CONTROL')) {
                    newState = removeEffect(newState, ally.id, debuff.id);
                }
            }
        }
    }

    // 協奏状態を付与
    const concertoEffect: IEffect = {
        id: EFFECT_IDS.CONCERTO(sourceUnitId),
        name: '協奏',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        tags: ['SKIP_ACTION', 'CC_IMMUNE'],  // ターンスキップ、行動制限抵抗
       
       
    };
    newState = addEffect(newState, sourceUnitId, concertoEffect);

    // 味方全体に攻撃力バフを付与
    const robinAtk = source.stats.atk;
    const allies = newState.registry.toArray().filter(u => !u.isEnemy && u.hp > 0 && !u.isSummon);
    const atkBuff = createConcertoAtkBoostEffect(sourceUnitId, robinAtk, eidolonLevel);

    for (const ally of allies) {
        newState = addEffect(newState, ally.id, atkBuff);
    }

    // E1: 協奏時、全耐性貫通+24%
    if (eidolonLevel >= 1) {
        const e1Effect: IEffect = {
            id: EFFECT_IDS.E1_RES_PEN(sourceUnitId),
            name: '微笑みの国',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: 0,
            linkedEffectId: EFFECT_IDS.CONCERTO(sourceUnitId),
            modifiers: [{
                source: '微笑みの国',
                target: 'all_type_res_pen' as StatKey,
                type: 'add',
                value: E1_RES_PEN,
            }],
           
           
        };
        for (const ally of allies) {
            newState = addEffect(newState, ally.id, e1Effect);
        }
    }

    // E2: 協奏時、速度+16%
    if (eidolonLevel >= 2) {
        const e2Effect: IEffect = {
            id: EFFECT_IDS.E2_SPD_BOOST(sourceUnitId),
            name: '2人のアフタヌーンティー',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: 0,
            linkedEffectId: EFFECT_IDS.CONCERTO(sourceUnitId),
            modifiers: [{
                source: '2人のアフタヌーンティー',
                target: 'spd_pct' as StatKey,
                type: 'add',
                value: E2_SPD_BOOST,
            }],
           
           
        };
        for (const ally of allies) {
            newState = addEffect(newState, ally.id, e2Effect);
        }
    }

    // E4: 協奏時、効果抵抗+50%
    if (eidolonLevel >= 4) {
        const e4Effect: IEffect = {
            id: EFFECT_IDS.E4_EFFECT_RES(sourceUnitId),
            name: '雨粒のカギ',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: 0,
            linkedEffectId: EFFECT_IDS.CONCERTO(sourceUnitId),
            modifiers: [{
                source: '雨粒のカギ',
                target: 'effect_res' as StatKey,
                type: 'add',
                value: E4_EFFECT_RES,
            }],
           
           
        };
        for (const ally of allies) {
            newState = addEffect(newState, ally.id, e4Effect);
        }
    }

    // A4: 協奏時、追加攻撃会心ダメージ+25%
    const traceA4 = source.traces?.find(t => t.id === TRACE_IDS.A4_FUA_CRIT_DMG);
    if (traceA4) {
        const a4Effect: IEffect = {
            id: EFFECT_IDS.A4_FUA_CRIT_DMG(sourceUnitId),
            name: 'アドリブの装飾曲',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: 0,
            linkedEffectId: EFFECT_IDS.CONCERTO(sourceUnitId),
            modifiers: [{
                source: 'アドリブの装飾曲',
                target: 'fua_crit_dmg' as StatKey,  // 追加攻撃会心ダメージ
                type: 'add',
                value: A4_FUA_CRIT_DMG,
            }],
           
           
        };
        for (const ally of allies) {
            newState = addEffect(newState, ally.id, a4Effect);
        }
    }

    // カウントダウン挿入
    newState = insertConcertoCountdown(newState, sourceUnitId);

    // 自分以外の味方を即座に行動させる
    for (const ally of allies) {
        if (ally.id !== source.id) {
            newState = advanceAction(newState, ally.id as string, 1.0, 'percent');
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
    const countdownId = getCountdownId(sourceUnitId);

    // カウントダウンのターンが来た場合
    if (event.sourceId === countdownId) {
        let newState = state;

        // 協奏状態を解除
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.CONCERTO(sourceUnitId));

        // カウントダウンを削除
        newState = removeConcertoCountdown(newState, sourceUnitId);

        // ロビンを即座に行動させる
        newState = advanceAction(newState, sourceUnitId, 1.0, 'percent');

        return newState;
    }

    return state;
};

/**
 * 攻撃完了時（天賦のEP回復と付加ダメージ）
 */
const onAttackComplete = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 攻撃者がロビン自身または敵の場合はスキップ
    if (event.sourceId === sourceUnitId) return state;

    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker || attacker.isEnemy) return state;

    const robin = state.registry.get(createUnitId(sourceUnitId));
    if (!robin) return state;

    let newState = state;

    // 天賦: 味方攻撃後EP+2（E2時+1追加）
    const epRecovery = eidolonLevel >= 2 ? TALENT_EP + E2_EXTRA_EP : TALENT_EP;
    newState = addEnergyToUnit(newState, sourceUnitId, epRecovery);

    // 協奏状態の場合: 付加ダメージ
    if (isInConcerto(newState, sourceUnitId)) {
        // E6: 8回制限チェック
        if (eidolonLevel >= 6) {
            const currentCount = getE6Counter(newState, sourceUnitId);
            if (currentCount >= E6_MAX_COUNT) {
                return newState;  // 8回超えたら付加ダメージなし
            }
        }

        // ターゲット取得
        const targetId = event.targetId;
        if (!targetId) return newState;

        const target = newState.registry.get(createUnitId(targetId));
        if (!target || !target.isEnemy) return newState;

        // 付加ダメージ計算
        const updatedRobin = newState.registry.get(createUnitId(sourceUnitId));
        if (!updatedRobin) return newState;

        const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
        const additionalMult = getLeveledValue(ABILITY_VALUES.ultAdditionalMult, ultLevel);
        const baseDamage = updatedRobin.stats.atk * additionalMult;

        // 会心率100%、会心ダメージ150%固定
        // E6: 会心ダメージ+450%
        let critDmg = CONCERTO_FIXED_CRIT_DMG;
        if (eidolonLevel >= 6) {
            critDmg += E6_CRIT_DMG_BOOST;
        }

        // 固定会心でダメージ計算
        const dmgCalcResult = calculateNormalAdditionalDamageWithCritInfo(
            updatedRobin,
            target,
            baseDamage
        );

        // 会心を強制適用
        const fixedCritDamage = baseDamage * critDmg;

        const result = applyUnifiedDamage(
            newState,
            updatedRobin,
            target,
            fixedCritDamage,
            {
                damageType: 'ADDITIONAL_DAMAGE',
                details: '協奏付加ダメージ',
                skipLog: true,
                isCrit: true,
                breakdownMultipliers: {
                    baseDmg: baseDamage,
                    critMult: critDmg,
                    dmgBoostMult: 1.0,
                    defMult: dmgCalcResult.breakdownMultipliers?.defMult || 1.0,
                    resMult: dmgCalcResult.breakdownMultipliers?.resMult || 1.0,
                    vulnMult: dmgCalcResult.breakdownMultipliers?.vulnMult || 1.0,
                    brokenMult: dmgCalcResult.breakdownMultipliers?.brokenMult || 1.0,
                }
            }
        );
        newState = result.state;

        // ログに追加
        newState = appendAdditionalDamage(newState, {
            source: robin.name,
            name: '協奏付加ダメージ',
            damage: result.totalDamage,
            target: target.name,
            damageType: 'additional',
            isCrit: true,
            breakdownMultipliers: result.breakdownMultipliers
        });

        // E6: カウンター増加
        if (eidolonLevel >= 6) {
            newState = incrementE6Counter(newState, sourceUnitId);
        }
    }

    return newState;
};

// =============================================================================
// ハンドラーファクトリ
// =============================================================================

export const robinHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `robin-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_ACTION_COMPLETE',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_TURN_START') {
                return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_SKILL_USED') {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ACTION_COMPLETE') {
                return onAttackComplete(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
