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
import { applyUnifiedDamage, appendAdditionalDamage, publishEvent, checkDebuffSuccess } from '../../simulator/engine/dispatcher';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { advanceAction, delayAction } from '../../simulator/engine/utils';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';

// =============================================================================
// 定数定義
// =============================================================================

const CHARACTER_ID = 'fugue';

// --- エフェクトID ---
const EFFECT_IDS = {
    FOX_PRAYER: (sourceId: string, targetId: string) => `${CHARACTER_ID}-fox-prayer-${sourceId}-${targetId}`,
    FOX_PRAYER_PREFIX: `${CHARACTER_ID}-fox-prayer-`,  // 部分一致用プレフィックス
    SCORCHING: (sourceId: string) => `${CHARACTER_ID}-scorching-${sourceId}`,
    DEF_DOWN: (sourceId: string, targetId: string) => `${CHARACTER_ID}-def-down-${sourceId}-${targetId}`,
    CLOUDFLAME: (sourceId: string, targetId: string) => `${CHARACTER_ID}-cloudflame-${sourceId}-${targetId}`,
    A4_FIRST_SKILL_FLAG: (sourceId: string) => `${CHARACTER_ID}-a4-flag-${sourceId}`,
    A4_BREAK_EFFECT: (sourceId: string) => `${CHARACTER_ID}-a4-break-${sourceId}`,
    A6_ALLY_BREAK_EFFECT: (sourceId: string, targetId: string) => `${CHARACTER_ID}-a6-break-${sourceId}-${targetId}`,
    E2_EP_COOLDOWN: (sourceId: string) => `${CHARACTER_ID}-e2-ep-cd-${sourceId}`,
} as const;

// --- 軌跡ID ---
const TRACE_IDS = {
    A2: `${CHARACTER_ID}-trace-a2`, // 青丘の重光
    A4: `${CHARACTER_ID}-trace-a4`, // 塗山の玄設
    A6: `${CHARACTER_ID}-trace-a6`, // 璣星の太素
} as const;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 通常攻撃: E3でLv7に上昇
    basic: {
        6: { mult: 1.00 },
        7: { mult: 1.10 }
    } as Record<number, { mult: number }>,
    // 強化通常攻撃（拡散）: E3でLv7に上昇
    enhancedBasic: {
        6: { mainMult: 1.00, adjMult: 0.50 },
        7: { mainMult: 1.10, adjMult: 0.55 }
    } as Record<number, { mainMult: number; adjMult: number }>,
    // 戦闘スキル: E3でLv12に上昇
    skill: {
        10: { breakEffectUp: 0.30, defDown: 0.18 },
        12: { breakEffectUp: 0.33, defDown: 0.20 }
    } as Record<number, { breakEffectUp: number; defDown: number }>,
    // 必殺技: E5でLv12に上昇
    ultimate: {
        10: { mult: 2.00 },
        12: { mult: 2.20 }
    } as Record<number, { mult: number }>,
    // 天賦: E5でLv12に上昇
    talent: {
        10: { superBreakRatio: 1.00 },
        12: { superBreakRatio: 1.10 }
    } as Record<number, { superBreakRatio: number }>
};

// --- 定数値 ---
// 通常攻撃
const BASIC_EP = 20;
const BASIC_TOUGHNESS = 10;

// 強化通常攻撃
const ENHANCED_BASIC_MAIN_TOUGHNESS = 10;
const ENHANCED_BASIC_ADJ_TOUGHNESS = 5;

// 戦闘スキル
const SKILL_EP = 30;
const SKILL_DURATION = 3;
const FOX_PRAYER_IGNORE_WEAKNESS_RATIO = 0.50; // 弱点無視時の削靭値50%

// 必殺技
const ULT_EP = 5;
const ULT_TOUGHNESS = 20;

// 天賦
const CLOUDFLAME_RATIO = 0.40; // 最大靭性の40%

// 追加能力
const A2_DELAY_RATIO = 0.15; // 行動遅延15%
const A4_BREAK_EFFECT_BONUS = 0.30; // 撃破特効+30%
const A6_BREAK_EFFECT_BONUS_BASE = 0.06; // 撃破特効+6%
const A6_BREAK_EFFECT_BONUS_EXTRA = 0.12; // 追加+12%
const A6_THRESHOLD = 2.20; // 撃破特効220%

// 星魂
const E1_BREAK_EFFICIENCY = 0.50; // 弱点撃破効率+50%
const E2_EP_RECOVERY = 3; // EP+3
const E2_ADVANCE_RATIO = 0.24; // 行動順24%早まる
const E4_BREAK_DMG_BOOST = 0.20; // 弱点撃破ダメージ+20%
const E6_BREAK_EFFICIENCY = 0.50; // 弱点撃破効率+50%

// ヘイト
const AGGRO = 100; // 虚無標準

// =============================================================================
// キャラクター定義
// =============================================================================

export const fugue: Character = {
    id: CHARACTER_ID,
    name: '帰忘の流離人',
    path: 'Nihility',
    element: 'Fire',
    rarity: 5,
    maxEnergy: 130,
    baseStats: {
        hp: 1125,
        atk: 582,
        def: 557,
        spd: 102,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: AGGRO
    },

    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: '燦然たる日月の尾',
            type: 'Basic ATK',
            description: '指定した敵単体に帰忘の流離人の攻撃力100%分の炎属性ダメージを与える。',
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
            name: '義を有せば吉兆を招く',
            type: 'Skill',
            description: '指定した味方単体に「狐の祈り」を付与し、自身は「灼熱」状態になる。3ターン継続。',
            energyGain: SKILL_EP,
            targetType: 'ally',
            spCost: 1
        },

        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: '極陽は遍く世を照らす',
            type: 'Ultimate',
            description: '敵全体に帰忘の流離人の攻撃力200%分の炎属性ダメージを与え、弱点属性を無視して敵全体の靭性を削る。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                // 5ヒット、合計200%
                hits: [
                    { multiplier: 0.40, toughnessReduction: 4 },
                    { multiplier: 0.40, toughnessReduction: 4 },
                    { multiplier: 0.40, toughnessReduction: 4 },
                    { multiplier: 0.40, toughnessReduction: 4 },
                    { multiplier: 0.40, toughnessReduction: 4 }
                ]
            },
            energyGain: ULT_EP,
            targetType: 'all_enemies'
        },

        talent: {
            id: `${CHARACTER_ID}-talent`,
            name: '善満ちる所福来たる',
            type: 'Talent',
            description: '敵に「雲火昭瑞」を付与。弱点撃破状態の敵への攻撃時、削靭値×100%分の超撃破ダメージを与える。'
        },

        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: '照照たる光輝',
            type: 'Technique',
            description: '秘技使用後、一定範囲内の敵を目眩状態にする。戦闘開始時、防御力ダウンを付与。'
        },

        // 強化通常攻撃（灼熱状態時）
        enhancedBasic: {
            id: `${CHARACTER_ID}-enhanced-basic`,
            name: '緩緩たる熾炎',
            type: 'Basic ATK',
            description: '指定した敵単体に攻撃力100%分、隣接する敵に攻撃力50%分の炎属性ダメージを与える。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 1.00, toughnessReduction: ENHANCED_BASIC_MAIN_TOUGHNESS }],
                adjacentHits: [{ multiplier: 0.50, toughnessReduction: ENHANCED_BASIC_ADJ_TOUGHNESS }]
            },
            energyGain: BASIC_EP,
            targetType: 'blast'
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2,
            name: '青丘の重光',
            type: 'Bonus Ability',
            description: '味方が敵を弱点撃破した後、さらに敵の行動順を15%遅延させる。'
        },
        {
            id: TRACE_IDS.A4,
            name: '塗山の玄設',
            type: 'Bonus Ability',
            description: '自身の撃破特効+30%、初めて戦闘スキルを発動した後、SPを1回復する。'
        },
        {
            id: TRACE_IDS.A6,
            name: '璣星の太素',
            type: 'Bonus Ability',
            description: '敵が弱点撃破される時、自身以外の味方キャラの撃破特効+6%。撃破特効220%以上でさらに+12%。2ターン、最大2層。'
        },
        {
            id: `${CHARACTER_ID}-stat-spd`,
            name: '速度',
            type: 'Stat Bonus',
            description: '速度+14',
            stat: 'spd' as StatKey,
            value: 14
        },
        {
            id: `${CHARACTER_ID}-stat-break`,
            name: '撃破特効',
            type: 'Stat Bonus',
            description: '撃破特効+24.0%',
            stat: 'break_effect' as StatKey,
            value: 0.24
        },
        {
            id: `${CHARACTER_ID}-stat-hp`,
            name: '最大HP',
            type: 'Stat Bonus',
            description: '最大HP+10.0%',
            stat: 'hp_pct' as StatKey,
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '狐塵とうに散り、雲を駕とすればその期あり',
            description: '「狐の祈り」状態の味方の弱点撃破効率+50％。'
        },
        e2: {
            level: 2,
            name: '瑞応来れば、必ず有徳を明かす',
            description: '敵が弱点撃破された時、帰忘の流離人はEPを3回復する。必殺技を発動した後、味方全体の行動順が24%早まる。'
        },
        e3: {
            level: 3,
            name: '正色の鴻寿、神思は化して伐つ',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // 通常攻撃Lv7
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 },
                // 強化通常攻撃Lv7
                { abilityName: 'enhancedBasic', param: 'damage.mainHits.0.multiplier', value: 1.10 },
                { abilityName: 'enhancedBasic', param: 'damage.adjacentHits.0.multiplier', value: 0.55 }
            ]
        },
        e4: {
            level: 4,
            name: '自我形を離れ、今や数多の姓となる',
            description: '「狐の祈り」状態の味方の弱点撃破ダメージ+20%。'
        },
        e5: {
            level: 5,
            name: '五色の雲、蒼穹は後を施す',
            description: '必殺技のLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                // 必殺技Lv12: 各ヒット 0.44 (合計220%)
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 0.44 },
                { abilityName: 'ultimate', param: 'damage.hits.1.multiplier', value: 0.44 },
                { abilityName: 'ultimate', param: 'damage.hits.2.multiplier', value: 0.44 },
                { abilityName: 'ultimate', param: 'damage.hits.3.multiplier', value: 0.44 },
                { abilityName: 'ultimate', param: 'damage.hits.4.multiplier', value: 0.44 }
            ]
        },
        e6: {
            level: 6,
            name: '肇めて未来を悟り、明暗の興亡を知る',
            description: '帰忘の流離人の弱点撃破効率+50%。灼熱状態の時、「狐の祈り」が味方全体に効果を発揮するようになる。'
        }
    },

    defaultConfig: {
        lightConeId: 'long-road-leads-home',
        superimposition: 1,
        relicSetId: 'iron_cavalry_which_tramples_the_raging_flame',
        ornamentSetId: 'talia_kingdom_of_banditry',
        mainStats: {
            body: 'effect_hit_rate',
            feet: 'spd',
            sphere: 'hp_pct',
            rope: 'break_effect'
        },
        subStats: [
            { stat: 'break_effect', value: 0.40 },
            { stat: 'effect_hit_rate', value: 0.20 },
            { stat: 'spd', value: 10 },
            { stat: 'hp_pct', value: 0.15 }
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate'
    }
};

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 狐の祈りバフを持っているかチェック
 */
const hasFoxPrayer = (unit: Unit): boolean => {
    return unit.effects.some(e => e.id.startsWith(EFFECT_IDS.FOX_PRAYER_PREFIX));
};

/**
 * 雲火昭瑞を敵に付与
 */
const applyCloudflame = (
    state: GameState,
    sourceId: string,
    targetId: string
): GameState => {
    const target = state.registry.get(createUnitId(targetId));
    if (!target || !target.isEnemy) return state;

    const effectId = EFFECT_IDS.CLOUDFLAME(sourceId, targetId);
    const cloudflameMax = (target.maxToughness || 0) * CLOUDFLAME_RATIO;

    // 既存の雲火昭瑞があれば更新しない
    if (target.effects.some(e => e.id === effectId)) return state;

    const cloudflameEffect: IEffect = {
        id: effectId,
        name: '雲火昭瑞',
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        ignoreResistance: true,
        miscData: {
            currentValue: cloudflameMax,
            maxValue: cloudflameMax
        },
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    return addEffect(state, targetId, cloudflameEffect);
};

/**
 * 狐の祈りを付与
 */
const applyFoxPrayer = (
    state: GameState,
    sourceId: string,
    targetId: string,
    eidolonLevel: number
): GameState => {
    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
    const skillValues = getLeveledValue(ABILITY_VALUES.skill, skillLevel);

    // 既存の狐の祈りを削除
    let newState = state;
    const target = newState.registry.get(createUnitId(targetId));
    if (target) {
        const existingFoxPrayer = target.effects.find(e => e.id.startsWith(EFFECT_IDS.FOX_PRAYER_PREFIX));
        if (existingFoxPrayer) {
            newState = removeEffect(newState, targetId, existingFoxPrayer.id);
        }
    }

    const modifiers: { target: StatKey; value: number; type: 'add' | 'pct'; source: string }[] = [
        { target: 'break_effect' as StatKey, value: skillValues.breakEffectUp, type: 'add', source: '狐の祈り' }
    ];

    // E1: 弱点撃破効率+50%
    if (eidolonLevel >= 1) {
        modifiers.push({
            target: 'break_efficiency_boost' as StatKey,
            value: E1_BREAK_EFFICIENCY,
            type: 'add',
            source: 'E1 狐の祈り'
        });
    }

    // E4: 弱点撃破ダメージ+20%
    if (eidolonLevel >= 4) {
        modifiers.push({
            target: 'break_dmg' as StatKey,
            value: E4_BREAK_DMG_BOOST,
            type: 'add',
            source: 'E4 狐の祈り'
        });
    }

    const foxPrayerEffect: IEffect = {
        id: EFFECT_IDS.FOX_PRAYER(sourceId, targetId),
        name: '狐の祈り',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'LINKED',
        duration: 0,
        linkedEffectId: EFFECT_IDS.SCORCHING(sourceId),
        modifiers,
        tags: ['FOX_PRAYER', 'IGNORE_WEAKNESS_FOR_TOUGHNESS'],
        miscData: {
            ignoreWeaknessRatio: FOX_PRAYER_IGNORE_WEAKNESS_RATIO,
            defDown: skillValues.defDown
        },
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    return addEffect(newState, targetId, foxPrayerEffect);
};

/**
 * 灼熱状態を付与
 */
const applyScorching = (
    state: GameState,
    sourceId: string,
    eidolonLevel: number
): GameState => {
    let newState = state;

    // 既存の灼熱を削除
    newState = removeEffect(newState, sourceId, EFFECT_IDS.SCORCHING(sourceId));

    const modifiers: { target: StatKey; value: number; type: 'add' | 'pct'; source: string }[] = [];

    // E6: 弱点撃破効率+50%
    if (eidolonLevel >= 6) {
        modifiers.push({
            target: 'break_efficiency_boost' as StatKey,
            value: E6_BREAK_EFFICIENCY,
            type: 'add',
            source: 'E6 灼熱'
        });
    }

    const scorchingEffect: IEffect = {
        id: EFFECT_IDS.SCORCHING(sourceId),
        name: '灼熱',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: SKILL_DURATION,
        modifiers,
        tags: ['SCORCHING', 'ENHANCED_BASIC'],
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    return addEffect(newState, sourceId, scorchingEffect);
};

/**
 * 防御力ダウンを付与
 */
const applyDefDown = (
    state: GameState,
    sourceId: string,
    targetId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceId));
    const target = state.registry.get(createUnitId(targetId));
    if (!source || !target || !target.isEnemy) return state;

    // 効果命中チェック
    if (!checkDebuffSuccess(source, target, 1.0, 'Debuff')) return state;

    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
    const skillValues = getLeveledValue(ABILITY_VALUES.skill, skillLevel);

    // 既存の防御ダウンを削除
    let newState = removeEffect(state, targetId, EFFECT_IDS.DEF_DOWN(sourceId, targetId));

    const defDownEffect: IEffect = {
        id: EFFECT_IDS.DEF_DOWN(sourceId, targetId),
        name: '防御力ダウン（狐の祈り）',
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: 2,
        modifiers: [
            { target: 'def' as StatKey, value: -skillValues.defDown, type: 'pct', source: '狐の祈り' }
        ],
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    return addEffect(newState, targetId, defDownEffect);
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

    // 天賦: 敵全体に「雲火昭瑞」を付与
    const enemies = newState.registry.getAliveEnemies();
    for (const enemy of enemies) {
        newState = applyCloudflame(newState, sourceUnitId, enemy.id as string);
    }

    // A4: 撃破特効+30%（永続バフ）
    const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4);
    if (hasA4) {
        const a4Effect: IEffect = {
            id: EFFECT_IDS.A4_BREAK_EFFECT(sourceUnitId),
            name: '塗山の玄設: 撃破特効',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            modifiers: [
                { target: 'break_effect' as StatKey, value: A4_BREAK_EFFECT_BONUS, type: 'add', source: '塗山の玄設' }
            ],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, a4Effect);

        // A4: 初回スキルフラグ
        const a4FlagEffect: IEffect = {
            id: EFFECT_IDS.A4_FIRST_SKILL_FLAG(sourceUnitId),
            name: '塗山の玄設: 初回スキルフラグ',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, a4FlagEffect);
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
    _eidolonLevel: number
): GameState => {
    // 自分のターン開始時のみ処理
    if (event.sourceId !== sourceUnitId) return state;

    // 灼熱状態のターン減少はエフェクトマネージャーで自動処理される
    return state;
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
    if (!event.targetId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 灼熱状態を付与
    newState = applyScorching(newState, sourceUnitId, eidolonLevel);

    // E6: 灼熱状態の時、狐の祈りが味方全体に効果を発揮
    if (eidolonLevel >= 6) {
        const allies = newState.registry.getAliveAllies();
        for (const ally of allies) {
            if (ally.id !== sourceUnitId) {
                newState = applyFoxPrayer(newState, sourceUnitId, ally.id as string, eidolonLevel);
            }
        }
    } else {
        // 指定した味方に狐の祈りを付与
        newState = applyFoxPrayer(newState, sourceUnitId, event.targetId, eidolonLevel);
    }

    // A4: 初回スキル時SP+1
    const freshUnit = newState.registry.get(createUnitId(sourceUnitId));
    const hasA4Flag = freshUnit?.effects.some(e => e.id === EFFECT_IDS.A4_FIRST_SKILL_FLAG(sourceUnitId));
    if (hasA4Flag) {
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.A4_FIRST_SKILL_FLAG(sourceUnitId));
        newState = {
            ...newState,
            skillPoints: Math.min(newState.skillPoints + 1, 5)
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

    let newState = state;

    // E2: 必殺技後、味方全体の行動順が24%早まる
    if (eidolonLevel >= 2) {
        const allies = newState.registry.getAliveAllies();
        for (const ally of allies) {
            newState = advanceAction(newState, ally.id as string, E2_ADVANCE_RATIO, 'percent');
        }
    }

    return newState;
};

/**
 * 弱点撃破時
 */
const onWeaknessBreak = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 味方による弱点撃破を監視
    const source = state.registry.get(createUnitId(event.sourceId));
    if (!source || source.isEnemy) return state;

    const fugue = state.registry.get(createUnitId(sourceUnitId));
    if (!fugue) return state;

    let newState = state;

    // A2: 味方が敵を弱点撃破した後、行動順15%遅延
    const hasA2 = fugue.traces?.some(t => t.id === TRACE_IDS.A2);
    if (hasA2 && event.targetId) {
        newState = delayAction(newState, event.targetId, A2_DELAY_RATIO, 'percent');
    }

    // E2: 弱点撃破時EP+3（1回/行動）
    if (eidolonLevel >= 2) {
        const hasCooldown = fugue.effects.some(e => e.id === EFFECT_IDS.E2_EP_COOLDOWN(sourceUnitId));
        if (!hasCooldown) {
            newState = addEnergyToUnit(newState, sourceUnitId, E2_EP_RECOVERY);
            // クールダウンを付与
            const cooldownEffect: IEffect = {
                id: EFFECT_IDS.E2_EP_COOLDOWN(sourceUnitId),
                name: 'E2 EPクールダウン',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            newState = addEffect(newState, sourceUnitId, cooldownEffect);
        }
    }

    // A6: 弱点撃破時、自身以外の味方に撃破特効バフ
    const hasA6 = fugue.traces?.some(t => t.id === TRACE_IDS.A6);
    if (hasA6) {
        const freshFugue = newState.registry.get(createUnitId(sourceUnitId));
        const breakEffect = freshFugue?.stats.break_effect || 0;
        const bonusValue = breakEffect >= A6_THRESHOLD
            ? A6_BREAK_EFFECT_BONUS_BASE + A6_BREAK_EFFECT_BONUS_EXTRA
            : A6_BREAK_EFFECT_BONUS_BASE;

        const allies = newState.registry.getAliveAllies();
        for (const ally of allies) {
            if (ally.id === sourceUnitId) continue;

            const allyId = ally.id as string;
            const effectId = EFFECT_IDS.A6_ALLY_BREAK_EFFECT(sourceUnitId, allyId);
            const existingEffect = ally.effects.find(e => e.id === effectId);
            const currentStacks = existingEffect?.stackCount || 0;

            if (currentStacks < 2) {
                // 既存のエフェクトを削除して新規作成
                newState = removeEffect(newState, allyId, effectId);

                const a6Effect: IEffect = {
                    id: effectId,
                    name: `璣星の太素 (${currentStacks + 1}/2)`,
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    stackCount: currentStacks + 1,
                    maxStacks: 2,
                    modifiers: [
                        { target: 'break_effect' as StatKey, value: bonusValue * (currentStacks + 1), type: 'add', source: '璣星の太素' }
                    ],
                    apply: (t, s) => s,
                    remove: (t, s) => s
                };
                newState = addEffect(newState, allyId, a6Effect);
            }
        }
    }

    return newState;
};

/**
 * 行動終了時: E2クールダウンリセット
 */
const onTurnEnd = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    _eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    // E2クールダウンをリセット
    return removeEffect(state, sourceUnitId, EFFECT_IDS.E2_EP_COOLDOWN(sourceUnitId));
};

/**
 * ダメージ計算前: 狐の祈りによる防御ダウン付与
 */
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 攻撃者が狐の祈り状態の味方かチェック
    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker || attacker.isEnemy) return state;
    if (!hasFoxPrayer(attacker)) return state;

    // 攻撃対象に防御ダウンを付与
    if (!event.targetId) return state;

    return applyDefDown(state, sourceUnitId, event.targetId, eidolonLevel);
};

/**
 * ヒット前: 必殺技の弱点無視靭性削りと炎属性撃破効果
 */
const onBeforeHit = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if ((event as any).sourceId !== sourceUnitId) return state;

    const actionType = (event as any).actionType;

    // 必殺技使用時のみ弱点無視靭性削り
    if (actionType !== 'ULTIMATE') return state;

    let newState = state;

    // 弱点属性を無視して靭性を削る + 炎属性撃破効果を発動
    newState = {
        ...newState,
        damageModifiers: {
            ...newState.damageModifiers,
            ignoreToughnessWeakness: true,
            forceBreakElement: 'Fire' as Element
        }
    };

    return newState;
};

// =============================================================================
// ハンドラーファクトリ
// =============================================================================

export const fugueHandlerFactory: IEventHandlerFactory = (
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
                'ON_TURN_END',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_WEAKNESS_BREAK',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_BEFORE_HIT'
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            switch (event.type) {
                case 'ON_BATTLE_START':
                    return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_TURN_START':
                    return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_TURN_END':
                    return onTurnEnd(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_SKILL_USED':
                    return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_ULTIMATE_USED':
                    return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_WEAKNESS_BREAK':
                    return onWeaknessBreak(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_BEFORE_DAMAGE_CALCULATION':
                    return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_BEFORE_HIT':
                    return onBeforeHit(event, state, sourceUnitId, eidolonLevel);
                default:
                    return state;
            }
        }
    };
};
