import { Character, StatKey, Unit } from '../../types/index';
import {
    IEventHandlerFactory,
    GameState,
    IEvent,
    ActionEvent,
    GeneralEvent,
    BeforeDamageCalcEvent,
    DamageDealtEvent
} from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { Modifier } from '../../types/stats';
import { createUnitId, UnitId } from '../../simulator/engine/unitId';
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

const CHARACTER_ID = 'castorice';
const SUMMON_ID_PREFIX = 'siryu'; // 死竜

// 新蕾関連
const CHARGE_KEY = 'castorice-charge';
const MAX_CHARGE = 34000; // 新蕾の上限（固定値）

// エフェクトID
const EFFECT_IDS = {
    /** 天賦: 与ダメージアップ */
    TALENT_DMG_BUFF: (sourceId: string) => `castorice-talent-dmg-${sourceId}`,
    /** 境界「遺世の冥域」全属性耐性ダウン */
    REALM_RES_DOWN: (sourceId: string) => `castorice-realm-${sourceId}`,
    /** 死竜のターンカウンター */
    SIRYU_TURN_COUNT: (spiritId: string) => `siryu-turn-count-${spiritId}`,
    /** A2: 回復→新蕾変換カウンター */
    A2_HEAL_CONVERT: (unitId: string) => `castorice-a2-heal-convert-${unitId}`,
    /** A4: 速度バフ（キャストリス） */
    A4_SPD_BUFF: (sourceId: string) => `castorice-a4-spd-${sourceId}`,
    /** A4: 速度バフ（死竜） */
    A4_SIRYU_SPD: (spiritId: string) => `siryu-a4-spd-${spiritId}`,
    /** A6: 晦冥焼き払う息吹ダメージバフ */
    A6_BREATH_DMG: (spiritId: string) => `siryu-a6-breath-dmg-${spiritId}`,
    /** 静寂を揺るがす怒哮: 与ダメージバフ */
    SPIRIT_ROAR_BUFF: (siryuId: string) => `siryu-roar-dmg-buff-${siryuId}`,
    /** E2: 熾意 */
    E2_SHII: (sourceId: string) => `castorice-e2-shii-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2: 'castorice-trace-a2', // 瓶の中の暗流
    A4: 'castorice-trace-a4', // 反転した炬火
    A6: 'castorice-trace-a6', // 寸陰留まる西風
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

    // 戦闘スキル（通常版）
    skillDmg: {
        10: { main: 0.50, adj: 0.30 },
        12: { main: 0.55, adj: 0.33 }
    } as Record<number, { main: number; adj: number }>,

    // 戦闘スキル（強化版）
    enhancedSkillDmg: {
        10: { castorice: 0.30, siryu: 0.50 },
        12: { castorice: 0.33, siryu: 0.55 }
    } as Record<number, { castorice: number; siryu: number }>,

    // 必殺技: 境界の耐性ダウン
    ultResDown: {
        10: 0.20,
        12: 0.22
    } as Record<number, number>,

    // 天賦: 与ダメージアップ
    talentDmgBoost: {
        10: 0.20,
        12: 0.22
    } as Record<number, number>,

    // 精霊スキル「冥茫裂く爪痕」
    spiritSkillDmg: {
        10: 0.52,
        12: 0.56
    } as Record<number, number>,

    // 精霊スキル「晦冥焼き払う息吹」
    breathDmg: {
        10: { base: 0.312, boost1: 0.364, boost2: 0.442 },
        12: { base: 0.35, boost1: 0.40, boost2: 0.49 } // 推定値
    } as Record<number, { base: number; boost1: number; boost2: number }>,

    // 精霊天賦「幽墟奪略の晦翼」
    wingDmg: {
        10: { dmg: 0.44, healPct: 0.066, healFlat: 880 },
        12: { dmg: 0.49, healPct: 0.073, healFlat: 968 } // 推定値
    } as Record<number, { dmg: number; healPct: number; healFlat: number }>
};

// HP消費
const SKILL_HP_COST_PCT = 0.30; // 通常スキル: 味方全員30%
const ENHANCED_SKILL_HP_COST_PCT = 0.40; // 強化スキル: 味方全員40%

// 死竜
const SIRYU_BASE_SPD = 165;
const SIRYU_TURN_LIMIT = 3; // 3ターンで消滅
const SIRYU_BREATH_HP_COST = 0.25; // 晦冥焼き払う息吹: 死竜最大HP25%消費

// トレース
const A2_HEAL_CONVERT_RATE = 1.0; // 回復量100%を新蕾に変換
const A2_CONVERT_CAP_PCT = 0.12; // 新蕾上限の12%まで
const A4_SPD_BUFF = 0.40; // キャストリスHP50%以上で速度+40%
const A4_HP_THRESHOLD = 0.50; // HP閾値50%
const A4_SIRYU_SPD_BUFF = 1.0; // 死竜の全滅ダメージ時速度+100%
const A6_BREATH_DMG_BUFF = 0.30; // 晦冥焼き払う息吹ごとに+30%
const A6_MAX_STACKS = 6;
const SPIRIT_ROAR_DMG_BUFF = 0.10; // 静寂を揺るがす怒哮: 与ダメージ+10%
const SPIRIT_ROAR_DURATION = 3; // 3ターン継続

// 星魂
const E1_HP_THRESHOLD_1 = 0.80; // HP80%以下
const E1_HP_THRESHOLD_2 = 0.50; // HP50%以下
const E1_DMG_MULT_1 = 1.20; // 120%
const E1_DMG_MULT_2 = 1.40; // 140%
const E2_SHII_STACKS = 2; // 熾意2層
const E4_HEAL_BOOST = 0.20; // 回復量+20%
const E6_QUANTUM_RES_PEN = 0.20; // 量子耐性貫通+20%
const E6_WING_BOUNCE_BONUS = 3; // バウンド回数+3

// =============================================================================
// キャラクター定義
// =============================================================================

export const castorice: Character = {
    id: CHARACTER_ID,
    name: 'キャストリス',
    path: 'Remembrance',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 0, // 新蕾システムを使用

    baseStats: {
        hp: 1629,
        atk: 523,
        def: 485,
        spd: 95,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75 // 記憶標準
    },

    abilities: {
        basic: {
            id: 'castorice-basic',
            name: '哀悼、死海の小波',
            type: 'Basic ATK',
            description: '指定した敵単体にキャストリスの最大HP50%分の量子属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'hp',
                hits: [
                    { multiplier: 0.25, toughnessReduction: 5 },
                    { multiplier: 0.25, toughnessReduction: 5 }
                ]
            },
            energyGain: 0,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'castorice-skill',
            name: '沈黙、幽蝶の慈しみ',
            type: 'Skill',
            description: '味方それぞれの残りHP30%分のHPを消費し、指定した敵単体にキャストリスの最大HP50%分の量子属性ダメージを与え、さらに隣接する敵にキャストリスの最大HP30%分の量子属性ダメージを与える。',
            targetType: 'blast',
            energyGain: 0,
            spCost: 0,
            damage: {
                type: 'blast',
                scaling: 'hp',
                mainHits: [{ multiplier: 0.50, toughnessReduction: 15 }],
                adjacentHits: [{ multiplier: 0.30, toughnessReduction: 5 }]
            }
        },

        ultimate: {
            id: 'castorice-ultimate',
            name: '亡者の怒哮、蘇生の鐘',
            type: 'Ultimate',
            description: '記憶の精霊「死竜」を召喚し、その行動順を100%早める。同時に、境界「遺世の冥域」を展開し、敵全体の全属性耐性を20%ダウンさせる。',
            energyGain: 0,
            targetType: 'self',
        },

        talent: {
            id: 'castorice-talent',
            name: '手のひらを伝う衰亡',
            type: 'Talent',
            description: '味方全体がHPを1失うたびに、キャストリスは「新蕾」を1獲得する。「新蕾」が上限に達すると必殺技を発動できる。味方がHPを失った時、キャストリスと死竜の与ダメージ+20%、この効果は最大で3層累積できる。3ターン継続。',
        },

        technique: {
            id: 'castorice-technique',
            name: '慟哭、死の兆しを贈る',
            type: 'Technique',
            description: '戦闘開始時、死竜を召喚し、その行動順を100%早める。戦闘に入った後、死竜を召喚しなかった場合、キャストリスは「新蕾」の上限30%分の「新蕾」を獲得する。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2,
            name: '瓶の中の暗流',
            type: 'Bonus Ability',
            description: '死竜以外の味方が治癒を受けた後、治癒量の100%を「新蕾」に変換する。ただし、死竜がフィールドにいる場合は、死竜のHPに変換される。味方それぞれが累積できる変換量のカウントは「新蕾」の上限の12%を超えない。任意のユニットが行動した後、累積できる変換量のカウントはリセットされる。'
        },
        {
            id: TRACE_IDS.A4,
            name: '反転した炬火',
            type: 'Bonus Ability',
            description: 'キャストリスの残りHPが自身の最大HP50%以上の時、キャストリスの速度+40%。死竜が「晦冥焼き払う息吹」を発動し、フィールドにいるすべての敵にHPが0になるダメージを与えた時、または敵のHPがそれ以上削れない時、死竜の速度+100%、1ターン継続。'
        },
        {
            id: TRACE_IDS.A6,
            name: '寸陰留まる西風',
            type: 'Bonus Ability',
            description: '死竜が「晦冥焼き払う息吹」を発動するたびに、与ダメージ+30%。この効果は最大6層まで累積できる。ターンが終了するまで継続。'
        },
        {
            id: 'castorice-stat-crit-rate',
            name: '会心率強化',
            type: 'Stat Bonus',
            description: '会心率+18.7%',
            stat: 'crit_rate',
            value: 0.187
        },
        {
            id: 'castorice-stat-quantum',
            name: '量子属性ダメージ強化',
            type: 'Stat Bonus',
            description: '量子属性ダメージ+14.4%',
            stat: 'quantum_dmg_boost',
            value: 0.144
        },
        {
            id: 'castorice-stat-crit-dmg',
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
            name: '雪地の聖女、記憶を棺に閉じ込めて',
            description: '敵の残りHPが最大HP80%/50%以下の時、その敵に対する「骸爪、冥竜の抱擁」、「冥茫裂く爪痕」、「晦冥焼き払う息吹」、「幽墟奪略の晦翼」の与ダメージは本来の120%/140%になる。'
        },
        e2: {
            level: 2,
            name: '翼翅と花の冠を戴く',
            description: '記憶の精霊「死竜」を召喚した後、キャストリスは「熾意」を2層獲得する。「熾意」は最大で2層累積でき、死竜の精霊スキル「晦冥焼き払う息吹」が消費するHPの代わりとして消費できる。さらにキャストリスの行動順が100%早まり、次の強化戦闘スキル発動後、キャストリスは「新蕾」の上限30%分の「新蕾」を獲得する。'
        },
        e3: {
            level: 3,
            name: '敬虔な旅人、死境で軽やかに舞って',
            description: '必殺技のLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。精霊天賦のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.275 },
                { abilityName: 'basic', param: 'damage.hits.1.multiplier', value: 0.275 }
            ]
        },
        e4: {
            level: 4,
            name: '哀歌を抱く安らかな眠り',
            description: 'キャストリスがフィールドにいる時、味方全体が治癒を受けた場合、回復量+20%。'
        },
        e5: {
            level: 5,
            name: '純白の新編、預言で彩られて',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。精霊スキルのLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                { abilityName: 'skill', param: 'damage.mainHits.0.multiplier', value: 0.55 },
                { abilityName: 'skill', param: 'damage.adjacentHits.0.multiplier', value: 0.33 }
            ]
        },
        e6: {
            level: 6,
            name: '流年を待ち繭を破る',
            description: 'キャストリスと死竜がダメージを与える時、量子属性耐性貫通+20%。死竜は攻撃時、弱点属性を無視して敵の靭性を削ることができる。敵を弱点撃破した時、量子属性の弱点撃破効果を発動する。また、精霊天賦「幽墟奪略の晦翼」のバウンド回数+3。'
        }
    },

    defaultConfig: {
        lightConeId: 'farewells-can-be-beautiful',
        superimposition: 1,
        relicSetId: 'the_wondrous_poetaster',
        ornamentSetId: 'izumo_gensei_and_takama_divine_realm',
        mainStats: {
            body: 'crit_dmg',
            feet: 'hp_pct',
            sphere: 'quantum_dmg_boost',
            rope: 'hp_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.30 },
            { stat: 'crit_dmg', value: 0.60 },
            { stat: 'hp_pct', value: 0.20 },
            { stat: 'spd', value: 10 }
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
        customConfig: {
            siryuBreathCount: 1 // 死竜の「晦冥焼き払う息吹」発動回数 (デフォルト: 1)
        }
    }
};

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 死竜精霊定義を作成
 */
function createSiryuDefinition(owner: Unit, eidolonLevel: number): IMemorySpiritDefinition {
    // 死竜の最大HP: 新蕾の上限100%分 = 34000
    // HPはATK基準で計算されるため、hpMultiplierを設定
    const siryuMaxHp = MAX_CHARGE;
    const hpMultiplier = siryuMaxHp / owner.stats.atk;

    return {
        idPrefix: SUMMON_ID_PREFIX,
        name: '死竜',
        element: 'Quantum',
        hpMultiplier: hpMultiplier,
        baseSpd: SIRYU_BASE_SPD,
        abilities: {
            basic: {
                id: 'siryu-basic',
                name: 'なし',
                type: 'Basic ATK',
                description: 'なし',
                damage: { type: 'simple', scaling: 'atk', hits: [] }
            },
            skill: {
                id: 'siryu-skill',
                name: '冥茫裂く爪痕',
                type: 'Skill',
                description: '敵全体にキャストリスの最大HP52%分の量子属性ダメージを与える。',
                targetType: 'all_enemies',
                energyGain: 0,
                damage: {
                    type: 'aoe',
                    scaling: 'hp', // オーナー（キャストリス）のHPを参照
                    hits: [{ multiplier: 0.52, toughnessReduction: 10 }]
                }
            },
            ultimate: { id: 'siryu-ult', name: 'なし', type: 'Ultimate', description: 'なし' },
            talent: { id: 'siryu-talent', name: 'なし', type: 'Talent', description: 'なし' },
            technique: { id: 'siryu-tech', name: 'なし', type: 'Technique', description: 'なし' }
        },
        debuffImmune: false,
        untargetable: false,
        initialDuration: 999 // ターンカウントで管理
    };
}

/**
 * 新蕾を取得
 */
const getCharge = (state: GameState, sourceUnitId: string): number => {
    return getAccumulatedValue(state, sourceUnitId, CHARGE_KEY);
};

/**
 * 新蕾を追加
 */
const addCharge = (state: GameState, sourceUnitId: string, amount: number): GameState => {
    return addAccumulatedValue(state, sourceUnitId, CHARGE_KEY, amount, MAX_CHARGE);
};

/**
 * 新蕾を消費
 */
const consumeCharge = (state: GameState, sourceUnitId: string): GameState => {
    return consumeAccumulatedValue(state, sourceUnitId, CHARGE_KEY, MAX_CHARGE, 'fixed');
};

/**
 * 必殺技発動可能かチェック
 */
const canUseUltimate = (state: GameState, sourceUnitId: string): boolean => {
    return getCharge(state, sourceUnitId) >= MAX_CHARGE;
};

/**
 * 死竜がフィールドにいるかチェック
 */
const isSiryuActive = (state: GameState, sourceUnitId: string): boolean => {
    const siryu = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    return siryu !== undefined;
};

/**
 * 死竜のターンカウントを取得
 */
const getSiryuTurnCount = (state: GameState, spiritId: string): number => {
    const spirit = state.registry.get(createUnitId(spiritId));
    if (!spirit) return 0;
    const effect = spirit.effects.find(e => e.id === EFFECT_IDS.SIRYU_TURN_COUNT(spiritId));
    return effect?.stackCount || 0;
};

/**
 * 死竜のターンカウントを設定
 */
const setSiryuTurnCount = (state: GameState, spiritId: string, count: number): GameState => {
    const spirit = state.registry.get(createUnitId(spiritId));
    if (!spirit) return state;

    const effectId = EFFECT_IDS.SIRYU_TURN_COUNT(spiritId);
    const existingEffect = spirit.effects.find(e => e.id === effectId);

    if (existingEffect) {
        const updatedEffect: IEffect = {
            ...existingEffect,
            stackCount: count
        };
        const updatedEffects = spirit.effects.map(e => e.id === effectId ? updatedEffect : e);
        return {
            ...state,
            registry: state.registry.update(createUnitId(spiritId), u => ({ ...u, effects: updatedEffects }))
        };
    } else {
        const turnCountEffect: IEffect = {
            id: effectId,
            name: `ターンカウント (${count}/${SIRYU_TURN_LIMIT})`,
            category: 'BUFF',
            sourceUnitId: spiritId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: count,
            modifiers: [],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        return addEffect(state, spiritId, turnCountEffect);
    }
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

    // 秘技「慟哭、死の兆しを贈る」
    const useTechnique = source.config?.useTechnique !== false;
    if (useTechnique) {
        // 死竜召喚
        const definition = createSiryuDefinition(source, eidolonLevel);
        const summonResult = summonOrRefreshSpirit(newState, source, definition);
        newState = summonResult.state;
        const siryu = summonResult.spirit;

        // 行動順100%短縮
        newState = advanceAction(newState, siryu.id as string, 1.0, 'percent');

        // 境界「遺世の冥域」展開
        newState = applyRealmEffect(newState, sourceUnitId, eidolonLevel);

        // ターンカウンター初期化
        newState = setSiryuTurnCount(newState, siryu.id as string, 0);

        // 死竜の残りHP: 新蕾の上限50%分
        const initialHp = MAX_CHARGE * 0.50;
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(siryu.id as string), u => ({
                ...u,
                hp: Math.min(initialHp, u.stats.hp)
            }))
        };

        // 精霊天賦「静寂を揺るがす怒哮」: 死竜召喚時、味方全体の与ダメージ+10%、3ターン
        const alliesForRoar = newState.registry.getAliveAllies();
        for (const ally of alliesForRoar) {
            const roarEffect: IEffect = {
                id: EFFECT_IDS.SPIRIT_ROAR_BUFF(siryu.id as string),
                name: '静寂を揺るがす怒哮',
                category: 'BUFF',
                sourceUnitId: siryu.id as string,
                durationType: 'TURN_END_BASED',
                duration: SPIRIT_ROAR_DURATION,
                skipFirstTurnDecrement: true,
                modifiers: [{
                    target: 'all_type_dmg_boost' as StatKey,
                    value: SPIRIT_ROAR_DMG_BUFF,
                    type: 'add' as const,
                    source: '静寂を揺るがす怒哮'
                }],
                apply: (t: Unit, s: GameState) => s,
                remove: (t: Unit, s: GameState) => s
            };
            newState = addEffect(newState, ally.id as string, roarEffect);
        }

        // 死竜以外の味方全体の残りHP40%消費
        const allies = TargetSelector.select(source, newState, { type: 'all_allies' });
        for (const ally of allies) {
            if (ally.id !== siryu.id) {
                newState = consumeAllyHp(newState, ally.id as string, ENHANCED_SKILL_HP_COST_PCT, sourceUnitId, eidolonLevel);
            }
        }
    } else {
        // 死竜を召喚しなかった場合、新蕾の上限30%獲得
        newState = addCharge(newState, sourceUnitId, MAX_CHARGE * 0.30);
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

    // 死竜がいるかチェック
    const siryu = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
    const hpCostPct = siryu ? ENHANCED_SKILL_HP_COST_PCT : SKILL_HP_COST_PCT;

    // 味方全員のHP消費
    const allies = TargetSelector.select(source, newState, { type: 'all_allies' });
    for (const ally of allies) {
        if (!siryu || ally.id !== siryu.id) {
            newState = consumeAllyHp(newState, ally.id as string, hpCostPct, sourceUnitId, eidolonLevel);
        }
    }

    // E2: 強化戦闘スキル発動後、新蕾30%獲得
    if (eidolonLevel >= 2 && siryu) {
        // 死竜がいる状態でスキルを使った（=強化スキル）場合、新蕾30%獲得
        newState = addCharge(newState, sourceUnitId, MAX_CHARGE * 0.30);
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

    // 新蕾を消費
    newState = consumeCharge(newState, sourceUnitId);

    // 死竜召喚
    const definition = createSiryuDefinition(source, eidolonLevel);
    const summonResult = summonOrRefreshSpirit(newState, source, definition);
    newState = summonResult.state;
    const siryu = summonResult.spirit;

    // 行動順100%短縮
    newState = advanceAction(newState, siryu.id as string, 1.0, 'percent');

    // 境界「遺世の冥域」展開
    newState = applyRealmEffect(newState, sourceUnitId, eidolonLevel);

    // ターンカウンター初期化
    newState = setSiryuTurnCount(newState, siryu.id as string, 0);

    // E2: 熾意2層獲得
    if (eidolonLevel >= 2) {
        const shiiEffect: IEffect = {
            id: EFFECT_IDS.E2_SHII(sourceUnitId),
            name: '熾意',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: E2_SHII_STACKS,
            maxStacks: 2,
            modifiers: [],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, sourceUnitId, shiiEffect);

        // キャストリスの行動順100%短縮
        newState = advanceAction(newState, sourceUnitId, 1.0, 'percent');
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

    // A4: HP50%以上で速度バフ
    if (source.traces?.some(t => t.id === TRACE_IDS.A4)) {
        const hpPct = source.hp / source.stats.hp;
        const hasA4Buff = source.effects.some(e => e.id === EFFECT_IDS.A4_SPD_BUFF(sourceUnitId));

        if (hpPct >= A4_HP_THRESHOLD && !hasA4Buff) {
            // バフ付与
            const a4Effect: IEffect = {
                id: EFFECT_IDS.A4_SPD_BUFF(sourceUnitId),
                name: '反転した炬火',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{
                    target: 'spd_pct' as StatKey,
                    value: A4_SPD_BUFF,
                    type: 'add' as const,
                    source: 'A4'
                }],
                apply: (t: Unit, s: GameState) => s,
                remove: (t: Unit, s: GameState) => s
            };
            newState = addEffect(newState, sourceUnitId, a4Effect);
        } else if (hpPct < A4_HP_THRESHOLD && hasA4Buff) {
            // バフ削除
            newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.A4_SPD_BUFF(sourceUnitId));
        }
    }

    // 死竜のターン開始時
    const siryu = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
    if (siryu && event.sourceId === siryu.id) {
        // 精霊スキル「晦冥焼き払う息吹」発動
        const siryuUnit = newState.registry.get(createUnitId(siryu.id as string));
        const owner = newState.registry.get(createUnitId(sourceUnitId));

        if (siryuUnit && owner) {
            const breathCount = owner.config?.customConfig?.siryuBreathCount ?? 1;
            if (breathCount > 0) {
                newState = executeSiryuBreath(newState, sourceUnitId, siryu.id as string, breathCount, eidolonLevel);

                // 精霊スキル発動後、死竜が消えている可能性があるため再チェック
                const siryuAfterBreath = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
                if (!siryuAfterBreath) {
                    // 死竜が消えた場合はターンカウント処理をスキップ
                    return newState;
                }
            }
        }

        // ターンカウント+1
        const currentCount = getSiryuTurnCount(newState, siryu.id as string);
        const newCount = currentCount + 1;
        newState = setSiryuTurnCount(newState, siryu.id as string, newCount);

        // 3ターン経過で死竜退場
        if (newCount >= SIRYU_TURN_LIMIT) {
            newState = dismissSiryuWithWing(newState, sourceUnitId, siryu.id as string, eidolonLevel);
        }
    }

    // A2: 行動後に回復変換カウンターリセット
    const allies = newState.registry.toArray().filter(u => !u.isEnemy);
    for (const ally of allies) {
        const convertEffect = ally.effects.find(e => e.id === EFFECT_IDS.A2_HEAL_CONVERT(ally.id as string));
        if (convertEffect) {
            newState = removeEffect(newState, ally.id as string, EFFECT_IDS.A2_HEAL_CONVERT(ally.id as string));
        }
    }

    return newState;
};

/**
 * ターン終了時
 */
const onTurnEnd = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const siryu = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!siryu || event.sourceId !== siryu.id) return state;

    // A6: 晦冥焼き払う息吹のダメージバフをリセット
    const a6Effect = siryu.effects.find(e => e.id === EFFECT_IDS.A6_BREATH_DMG(siryu.id as string));
    if (a6Effect) {
        return removeEffect(state, siryu.id as string, EFFECT_IDS.A6_BREATH_DMG(siryu.id as string));
    }

    return state;
};

/**
 * ダメージ発生時（HP損失検知）
 */
const onDamageDealt = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (!event.targetId || !event.value) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || target.isEnemy) return state;

    let newState = state;

    // HP損失を新蕾に変換（死竜がいない場合）
    const siryu = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
    if (!siryu) {
        newState = addCharge(newState, sourceUnitId, event.value);
    } else if (target.id !== siryu.id) {
        // 死竜がいる場合、死竜以外の味方のHP損失を死竜のHPに変換
        const siryuUnit = newState.registry.get(createUnitId(siryu.id as string));
        if (siryuUnit) {
            const healAmount = event.value;
            newState = applyHealing(newState, sourceUnitId, siryu.id as string, healAmount, '天賦: HP変換', true);
        }
    }

    // 天賦: ダメージバフ付与
    newState = applyTalentDmgBuff(newState, sourceUnitId);

    return newState;
};

/**
 * 回復時
 */
const onUnitHealed = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (!('targetId' in event) || !('value' in event)) return state;
    if (!event.targetId || !event.value) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!target || !source || target.isEnemy) return state;

    let newState = state;
    let healAmount = event.value as number;

    // E4: 回復量+20%
    if (eidolonLevel >= 4) {
        healAmount *= (1 + E4_HEAL_BOOST);
    }

    // A2: 回復量を新蕾/死竜HPに変換
    if (source.traces?.some(t => t.id === TRACE_IDS.A2)) {
        const siryu = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);

        // 死竜以外の味方が回復を受けた場合
        if (!siryu || target.id !== siryu.id) {
            const convertAmount = healAmount * A2_HEAL_CONVERT_RATE;
            const cap = MAX_CHARGE * A2_CONVERT_CAP_PCT;

            // 累積カウンターを取得
            const convertEffect = target.effects.find(e => e.id === EFFECT_IDS.A2_HEAL_CONVERT(target.id as string));
            const currentAccumulated = (convertEffect as any)?.accumulated || 0;

            if (currentAccumulated < cap) {
                const actualConvert = Math.min(convertAmount, cap - currentAccumulated);

                if (siryu) {
                    // 死竜のHPに変換
                    newState = applyHealing(newState, sourceUnitId, siryu.id as string, actualConvert, 'A2: 回復→HP変換', true);
                } else {
                    // 新蕾に変換
                    newState = addCharge(newState, sourceUnitId, actualConvert);
                }

                // カウンター更新
                const newAccumulated = currentAccumulated + actualConvert;
                const updatedConvertEffect: IEffect = {
                    id: EFFECT_IDS.A2_HEAL_CONVERT(target.id as string),
                    name: `回復変換 (${newAccumulated.toFixed(0)}/${cap.toFixed(0)})`,
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'PERMANENT',
                    duration: -1,
                    modifiers: [],
                    apply: (t: Unit, s: GameState) => s,
                    remove: (t: Unit, s: GameState) => s
                };
                (updatedConvertEffect as any).accumulated = newAccumulated;
                newState = addEffect(newState, target.id as string, updatedConvertEffect);
            }
        }
    }

    return newState;
};

/**
 * ダメージ計算前（E1, E6の介入）
 */
const onBeforeDamageCalculation = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.type !== 'ON_BEFORE_DAMAGE_CALCULATION') return state;
    const bdcEvent = event as BeforeDamageCalcEvent;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    const siryu = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);

    // キャストリスまたは死竜の攻撃でない場合は無視
    if (bdcEvent.sourceId !== sourceUnitId && (!siryu || bdcEvent.sourceId !== siryu.id)) {
        return state;
    }

    let newState = state;

    // E1: HP閾値ダメージアップ
    if (eidolonLevel >= 1 && bdcEvent.targetId) {
        const target = newState.registry.get(createUnitId(bdcEvent.targetId));
        if (target && target.isEnemy) {
            const hpPct = target.hp / target.stats.hp;
            let dmgMult = 1.0;

            if (hpPct <= E1_HP_THRESHOLD_2) {
                dmgMult = E1_DMG_MULT_2;
            } else if (hpPct <= E1_HP_THRESHOLD_1) {
                dmgMult = E1_DMG_MULT_1;
            }

            if (dmgMult > 1.0) {
                // 対象スキルの判定（強化スキル、精霊スキル、晦冥、幽墟）
                const abilityId = bdcEvent.abilityId || '';
                const isTargetAbility = abilityId === 'skill' || abilityId === 'siryu-skill' ||
                    abilityId === 'breath' || abilityId === 'wing';

                if (isTargetAbility) {
                    const currentDmgBoost = newState.damageModifiers.allTypeDmg || 0;
                    newState = {
                        ...newState,
                        damageModifiers: {
                            ...newState.damageModifiers,
                            allTypeDmg: currentDmgBoost + (dmgMult - 1.0)
                        }
                    };
                }
            }
        }
    }

    // E6: 量子耐性貫通+20%、弱点無視靭性削り、量子撃破効果
    if (eidolonLevel >= 6) {
        const siryu = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);

        // キャストリスまたは死竜の攻撃の場合
        const isSourceAttack = bdcEvent.sourceId === sourceUnitId;
        const isSiryuAttack = siryu && bdcEvent.sourceId === siryu.id;

        if (isSourceAttack || isSiryuAttack) {
            const currentResPen = newState.damageModifiers.resReduction || 0;
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: currentResPen + E6_QUANTUM_RES_PEN,
                    // 死竜の攻撃のみ: 弱点無視靭性削り + 量子撃破効果
                    ...(isSiryuAttack ? {
                        ignoreToughnessWeakness: true,
                        forceBreakElement: 'Quantum' as const
                    } : {})
                }
            };
        }
    }

    return newState;
};

/**
 * ユニット死亡時
 */
const onUnitDeath = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (!('targetId' in event) || !event.targetId) return state;

    const siryu = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!siryu || event.targetId !== siryu.id) return state;

    // 死竜が死亡した場合、幽墟奪略の晦翼を発動
    return dismissSiryuWithWing(state, sourceUnitId, siryu.id as string, eidolonLevel);
};

/**
 * ダメージ前（月の繭が覆う身躯）
 */
const onBeforeHit = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.type !== 'ON_BEFORE_HIT') return state;
    const beforeHitEvent = event as any; // BeforeHitEvent型が定義されている場合はそれを使用

    if (!beforeHitEvent.targetId || !beforeHitEvent.damage) return state;

    const target = state.registry.get(createUnitId(beforeHitEvent.targetId));
    if (!target || target.isEnemy) return state;

    const siryu = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!siryu || target.id === siryu.id) return state; // 死竜自身は保護対象外

    // ダメージ後HP1未満になるかチェック
    const damageAmount = beforeHitEvent.damage;
    const newHp = target.hp - damageAmount;

    if (newHp < 1) {
        // HP1以下になる分を死竜が負担（500%）
        const overflow = 1 - newHp;
        const siryuHpCost = overflow * 5.0; // 500%

        // 死竜のHP消費
        let newState = consumeSiryuHpForProtection(state, sourceUnitId, siryu.id as string, siryuHpCost, eidolonLevel);

        // ダメージを制限（味方はHP1までしか減らない）
        if (beforeHitEvent.modifyDamage) {
            const limitedDamage = target.hp - 1;
            beforeHitEvent.modifyDamage(limitedDamage);
        }

        return newState;
    }

    return state;
};

// =============================================================================
// ヘルパー関数（追加）
// =============================================================================

/**
 * 熾意を1層消費
 */
const consumeShiiStack = (state: GameState, ownerId: string): GameState => {
    const owner = state.registry.get(createUnitId(ownerId));
    if (!owner) return state;

    const shiiEffect = owner.effects.find(e => e.id === EFFECT_IDS.E2_SHII(ownerId));
    if (!shiiEffect || !shiiEffect.stackCount || shiiEffect.stackCount <= 0) return state;

    const newStackCount = shiiEffect.stackCount - 1;

    if (newStackCount <= 0) {
        // 熾意が0になったら削除
        return removeEffect(state, ownerId, EFFECT_IDS.E2_SHII(ownerId));
    } else {
        // スタック数を減らす
        const updatedEffect: IEffect = {
            ...shiiEffect,
            stackCount: newStackCount
        };
        const updatedEffects = owner.effects.map(e => e.id === shiiEffect.id ? updatedEffect : e);
        return {
            ...state,
            registry: state.registry.update(createUnitId(ownerId), u => ({ ...u, effects: updatedEffects }))
        };
    }
};

/**
 * A6: 晦冥焼き払う息吹のダメージバフを付与
 */
const applyA6BreathBuff = (state: GameState, siryuId: string): GameState => {
    const siryu = state.registry.get(createUnitId(siryuId));
    if (!siryu) return state;

    const buffEffect: IEffect = {
        id: EFFECT_IDS.A6_BREATH_DMG(siryuId),
        name: '晦冥焼き払う息吹バフ',
        category: 'BUFF',
        sourceUnitId: siryuId,
        durationType: 'TURN_END_BASED',
        skipFirstTurnDecrement: true,
        duration: 1,
        maxStacks: A6_MAX_STACKS,
        modifiers: [{
            target: 'all_type_dmg_boost' as StatKey,
            value: A6_BREATH_DMG_BUFF,
            type: 'add' as const,
            source: 'A6'
        }],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };

    return addEffect(state, siryuId, buffEffect);
};

/**
 * 精霊スキル「晦冥焼き払う息吹」を実行
 */
const executeSiryuBreath = (
    state: GameState,
    ownerId: string,
    siryuId: string,
    count: number,
    eidolonLevel: number
): GameState => {
    let newState = state;

    for (let i = 0; i < count; i++) {
        const siryu = newState.registry.get(createUnitId(siryuId));
        const owner = newState.registry.get(createUnitId(ownerId));
        if (!siryu || !owner) break;

        // HP消費または熾意消費
        const canUseShii = eidolonLevel >= 2;
        const shiiEffect = canUseShii ? owner.effects.find(e => e.id === EFFECT_IDS.E2_SHII(ownerId)) : undefined;
        const hasShii = shiiEffect && (shiiEffect.stackCount || 0) > 0;

        if (hasShii) {
            // 熾意を1層消費
            newState = consumeShiiStack(newState, ownerId);
        } else {
            // 死竜のHP25%消費
            const hpCost = siryu.stats.hp * SIRYU_BREATH_HP_COST;
            const newHp = Math.max(0, siryu.hp - hpCost);

            // HP更新
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(siryuId), u => ({ ...u, hp: newHp }))
            };

            // HP0またはHP1以下になったら死竜退場
            // HP0またはHP1以下になったら死竜退場
            if (newHp <= 1) {
                newState = dismissSiryuWithWing(newState, ownerId, siryuId, eidolonLevel);
                break;
            }
        }

        // A6: ダメージバフ蓄積（ダメージ計算前に付与）
        if (owner.traces?.some(t => t.id === TRACE_IDS.A6)) {
            newState = applyA6BreathBuff(newState, siryuId);
        }

        // ダメージ倍率の決定（発動回数依存）
        const breathLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill'); // E5: 精霊スキルLv+1
        const breathValues = getLeveledValue(ABILITY_VALUES.breathDmg, breathLevel);
        let multiplier = breathValues.base; // 初回: 31.2%
        if (i === 1) multiplier = breathValues.boost1; // 1回目: 36.4%
        if (i >= 2) multiplier = breathValues.boost2; // 2回目以降: 44.2%

        // ダメージ計算と適用
        const enemies = newState.registry.getAliveEnemies();
        for (const enemy of enemies) {
            const baseDmg = owner.stats.hp * multiplier;
            const dmgResult = calculateNormalAdditionalDamageWithCritInfo(owner, enemy, baseDmg);

            const result = applyUnifiedDamage(newState, owner, enemy, dmgResult.damage, {
                damageType: '精霊スキル',
                details: '晦冥焼き払う息吹',
                skipLog: true,
                isCrit: dmgResult.isCrit,
                breakdownMultipliers: dmgResult.breakdownMultipliers
            });
            newState = result.state;

            // ログ追加
            newState = appendAdditionalDamage(newState, {
                source: siryu.name,
                name: `晦冥焼き払う息吹 (${i + 1}回目)`,
                damage: result.totalDamage,
                target: enemy.name,
                damageType: 'additional',
                isCrit: result.isCrit || false,
                breakdownMultipliers: result.breakdownMultipliers
            });
        }
    }

    return newState;
};

/**
 * 死竜のHP消費保護関数（月の繭が覆う身躯）
 */
const consumeSiryuHpForProtection = (
    state: GameState,
    sourceUnitId: string,
    siryuId: string,
    hpCost: number,
    eidolonLevel: number
): GameState => {
    const siryu = state.registry.get(createUnitId(siryuId));
    if (!siryu) return state;

    const newHp = Math.max(0, siryu.hp - hpCost);
    let newState = {
        ...state,
        registry: state.registry.update(createUnitId(siryuId), u => ({ ...u, hp: newHp }))
    };

    // HP0になったら死竜退場
    if (newHp <= 0) {
        newState = dismissSiryuWithWing(newState, sourceUnitId, siryuId, eidolonLevel);
    }

    return newState;
};

/**
 * 味方のHPを消費（残りHP1未満にならない）
 */
const consumeAllyHp = (state: GameState, allyId: string, costPct: number, sourceUnitId: string, eidolonLevel: number): GameState => {
    const ally = state.registry.get(createUnitId(allyId));
    if (!ally) return state;

    const cost = Math.floor(ally.hp * costPct);
    const siryuCheck = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);

    let workingState = state;
    let newHp: number;
    let actualCost: number;

    // 死竜保護: HP1以下にならないよう制限
    if (siryuCheck && (ally.hp - cost) < 1) {
        const overflow = 1 - (ally.hp - cost);
        const siryuHpCost = overflow * 5.0;
        actualCost = ally.hp - 1;
        newHp = 1;
        workingState = consumeSiryuHpForProtection(workingState, sourceUnitId, siryuCheck.id as string, siryuHpCost, eidolonLevel);
    } else {
        newHp = Math.max(1, ally.hp - cost);
        actualCost = ally.hp - newHp;
    }

    workingState = {
        ...workingState,
        registry: workingState.registry.update(createUnitId(allyId), (u: Unit) => ({ ...u, hp: newHp }))
    };

    const siryuAfter = getActiveSpirit(workingState, sourceUnitId, SUMMON_ID_PREFIX);
    if (!siryuAfter) {
        workingState = addCharge(workingState, sourceUnitId, actualCost);
    } else if (allyId !== siryuAfter.id) {
        workingState = applyHealing(workingState, sourceUnitId, siryuAfter.id as string, actualCost, '天賦: HP変換', true);
    }

    workingState = applyTalentDmgBuff(workingState, sourceUnitId);

    return workingState;
};

/**
 * 境界「遺世の冥域」を展開
 */
const applyRealmEffect = (state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    // E5: 天賦Lv+2（ただし境界は必殺技レベル依存）
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const resDown = getLeveledValue(ABILITY_VALUES.ultResDown, ultLevel);

    const enemies = TargetSelector.select(source, state, { type: 'all_enemies' });
    let newState = state;

    for (const enemy of enemies) {
        const realmEffect: IEffect = {
            id: EFFECT_IDS.REALM_RES_DOWN(sourceUnitId),
            name: '遺世の冥域',
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            modifiers: [{
                target: 'all_type_res' as StatKey,
                value: -resDown,
                type: 'add' as const,
                source: '遺世の冥域'
            }],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, enemy.id as string, realmEffect);
    }

    return newState;
};

/**
 * 天賦: ダメージバフを付与（最大3層）
 */
const applyTalentDmgBuff = (state: GameState, sourceUnitId: string): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    // 星魂レベルを取得（sourceから）
    const eidolonLevel = source.eidolonLevel || 0;

    // E5: 天賦Lv+2
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const dmgBoost = getLeveledValue(ABILITY_VALUES.talentDmgBoost, talentLevel);

    const buffEffect: IEffect = {
        id: EFFECT_IDS.TALENT_DMG_BUFF(sourceUnitId),
        name: '天賦: 与ダメージ',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_END_BASED',
        skipFirstTurnDecrement: true,
        duration: 3,
        maxStacks: 3,
        modifiers: [{
            target: 'all_type_dmg_boost' as StatKey,
            value: dmgBoost,
            type: 'add' as const,
            source: '天賦'
        }],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };

    let newState = addEffect(state, sourceUnitId, buffEffect);

    // 死竜にも同じバフを付与
    const siryu = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
    if (siryu) {
        const siryuBuff = { ...buffEffect, id: EFFECT_IDS.TALENT_DMG_BUFF(siryu.id as string) };
        newState = addEffect(newState, siryu.id as string, siryuBuff);
    }

    return newState;
};

/**
 * 死竜を退場させ、幽墟奪略の晦翼を発動
 */
const dismissSiryuWithWing = (
    state: GameState,
    sourceUnitId: string,
    siryuId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 精霊天賦レベル
    // E3: 精霊天賦Lv+1（仕様書に明記）
    const wingLevel = eidolonLevel >= 3 ? 11 : 10; // Lv10→Lv11（+1）
    const wingValues = getLeveledValue(ABILITY_VALUES.wingDmg, wingLevel);

    // バウンド回数（E6で+3）
    const bounceCount = eidolonLevel >= 6 ? 6 + E6_WING_BOUNCE_BONUS : 6;

    // ランダム敵にバウンドダメージ
    const enemies = newState.registry.getAliveEnemies();
    if (enemies.length > 0) {
        for (let i = 0; i < bounceCount; i++) {
            const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
            const baseDmg = source.stats.hp * wingValues.dmg;
            const dmgResult = calculateNormalAdditionalDamageWithCritInfo(source, randomEnemy, baseDmg);

            const result = applyUnifiedDamage(newState, source, randomEnemy, dmgResult.damage, {
                damageType: '精霊天賦',
                details: '幽墟奪略の晦翼',
                skipLog: true,
                isCrit: dmgResult.isCrit,
                breakdownMultipliers: dmgResult.breakdownMultipliers
            });
            newState = result.state;

            // ログに追加
            newState = appendAdditionalDamage(newState, {
                source: source.name,
                name: '幽墟奪略の晦翼',
                damage: result.totalDamage,
                target: randomEnemy.name,
                damageType: 'additional',
                isCrit: result.isCrit || false,
                breakdownMultipliers: result.breakdownMultipliers
            });
        }
    }

    // 味方全体回復
    const allies = TargetSelector.select(source, newState, { type: 'all_allies' });
    for (const ally of allies) {
        newState = applyHealing(
            newState,
            sourceUnitId,
            ally.id as string,
            {
                scaling: 'hp',
                multiplier: wingValues.healPct,
                flat: wingValues.healFlat
            },
            '幽墟奪略の晦翼'
        );
    }

    // 境界「遺世の冥域」を解除
    const allEnemies = newState.registry.getAliveEnemies();
    for (const enemy of allEnemies) {
        newState = removeEffect(newState, enemy.id as string, EFFECT_IDS.REALM_RES_DOWN(sourceUnitId));
    }

    // 死竜を削除
    const siryuToRemove = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
    if (siryuToRemove) {
        newState = dismissSpirit(newState, siryuToRemove.id as string);
    }

    return newState;
};

export const castoriceHandlerFactory: IEventHandlerFactory = (
    sourceUnitId: string,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `castorice-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_TURN_START',
                'ON_TURN_END',
                'ON_DAMAGE_DEALT',
                'ON_UNIT_HEALED',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_ACTION_COMPLETE',
                'ON_UNIT_DEATH',
                'ON_BEFORE_HIT', // 月の繭が覆う身躯
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_SKILL_USED') {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_TURN_START') {
                return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_TURN_END') {
                return onTurnEnd(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event as DamageDealtEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_UNIT_HEALED') {
                return onUnitHealed(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_UNIT_DEATH') {
                return onUnitDeath(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BEFORE_HIT') {
                return onBeforeHit(event, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
