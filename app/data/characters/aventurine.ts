import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, IEvent, GameState, Unit, DamageDealtEvent, ActionEvent, BeforeDamageCalcEvent, GeneralEvent, FollowUpAttackAction } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';
import { applyShield } from '../../simulator/engine/utils';
import { calculateAbilityLevel, getLeveledValue } from '../../simulator/utils/abilityLevel';

// --- 定数定義 ---
const CHARACTER_ID = 'aventurine';

// エフェクトID
const EFFECT_IDS = {
    FORTIFIED_WAGER: (sourceId: string, targetId: string) => `${CHARACTER_ID}-fortified-wager-${sourceId}-${targetId}`,
    BLIND_BET: (unitId: string) => `${CHARACTER_ID}-blind-bet-${unitId}`,
    UPSET: (sourceId: string, targetId: string) => `${CHARACTER_ID}-upset-${sourceId}-${targetId}`,
    A2_CRIT: (unitId: string) => `${CHARACTER_ID}-a2-crit-${unitId}`,
    A6_COUNTER: (unitId: string) => `${CHARACTER_ID}-a6-counter-${unitId}`,
    EFFECT_RES: (sourceId: string, targetId: string) => `${CHARACTER_ID}-effect-res-${sourceId}-${targetId}`,
    E4_DEF_BOOST: (unitId: string) => `${CHARACTER_ID}-e4-def-${unitId}`,
    E1_CRIT_DMG: (sourceId: string, targetId: string) => `${CHARACTER_ID}-e1-crit-dmg-${sourceId}-${targetId}`,
    E2_RES_SHRED: (sourceId: string, targetId: string) => `${CHARACTER_ID}-e2-res-shred-${sourceId}-${targetId}`,
} as const;

// 軌跡ID
const TRACE_IDS = {
    A2_LEVERAGE: `${CHARACTER_ID}-trace-a2`,       // レバレッジ
    A4_HOT_HAND: `${CHARACTER_ID}-trace-a4`,       // ホットハンド
    A6_BINGO: `${CHARACTER_ID}-trace-a6`,          // ビンゴ！
} as const;

// --- アビリティ倍率 (デフォルトレベル基準) ---

// 通常攻撃 (Lv6: 100%, Lv7: 110%) - DEFスケーリング
const BASIC_MULT = 1.0;

// スキル: シールド (Lv10: DEF 24% + 320, Lv12: DEF 25.6% + 356)
const SKILL_SHIELD_PCT = 0.24;
const SKILL_SHIELD_FLAT = 320;
const SKILL_SHIELD_DURATION = 3;

// 必殺技 (Lv10: DEF 270%, Lv12: DEF 291.6%)
const ULT_MULT = 2.7;
const ULT_UPSET_CRIT_DMG = 0.15;  // 動揺: 会心ダメージ+15%
const ULT_UPSET_DURATION = 3;

// 天賦: ブラインドベット
const TALENT_EFFECT_RES = 0.50;    // 効果抵抗+50%
const TALENT_FUA_MULT = 0.25;      // DEF 25%
const MAX_BLIND_BET_STACKS = 10;
const BLIND_BET_TRIGGER_THRESHOLD = 7;
const TALENT_FUA_HITS = 7;
const TALENT_FUA_TOUGHNESS = 3.3;  // 約3.3

// A2: 防御力超過会心率ボーナス
const A2_DEF_THRESHOLD = 1600;
const A2_CRIT_RATE_PER_100_DEF = 0.02;  // 100超過につき+2%
const A2_CRIT_RATE_CAP = 0.48;           // 最大+48%

// A4: 戦闘開始時シールド
const A4_SHIELD_MULT = 1.0;  // スキルの100%

// A6: 追撃後シールド
const A6_FUA_SHIELD_PCT = 0.07;
const A6_FUA_SHIELD_FLAT = 96;
const A6_MAX_FOLLOW_UP_TRIGGERS = 3;

// E1: バリア持ち味方の会心ダメージ+20%
const E1_CRIT_DMG = 0.20;

// E2: 通常攻撃時ターゲットの全耐性-12%
const E2_RES_SHRED = 0.12;
const E2_RES_SHRED_DURATION = 3;

// E4: 追撃前防御力+40%、攻撃段数+3
const E4_DEF_BUFF = 0.40;
const E4_DEF_BUFF_DURATION = 2;
const E4_EXTRA_HITS = 3;

// E6: バリア持ち味方1名につき与ダメージ+50%、最大+150%
const E6_DMG_BOOST_PER_ALLY = 0.50;
const E6_DMG_BOOST_CAP = 1.50;

// --- E3/E5パターン ---
const ABILITY_VALUES = {
    // 通常攻撃: E3でLv7に上昇
    basicMult: {
        6: { mult: 1.0 },
        7: { mult: 1.10 }
    } as Record<number, { mult: number }>,
    // スキルシールド: E5でLv12に上昇
    skillShield: {
        10: { pct: 0.24, flat: 320 },
        12: { pct: 0.256, flat: 356 }
    } as Record<number, { pct: number; flat: number }>,
    // 必殺技: E3でLv12に上昇
    ultDmg: {
        10: { mult: 2.7, critDmg: 0.15 },
        12: { mult: 2.916, critDmg: 0.162 }
    } as Record<number, { mult: number; critDmg: number }>,
    // 天賦: E5でLv12に上昇
    talentEffectRes: {
        10: { res: 0.50 },
        12: { res: 0.55 }
    } as Record<number, { res: number }>,
    talentFuaMult: {
        10: { mult: 0.25 },
        12: { mult: 0.275 }
    } as Record<number, { mult: number }>,
};

// --- キャラクター定義 ---
export const aventurine: Character = {
    id: CHARACTER_ID,
    name: 'アベンチュリン',
    path: 'Preservation',
    element: 'Imaginary',
    rarity: 5,
    maxEnergy: 110,
    baseStats: {
        hp: 1203,
        atk: 446,
        def: 654,
        spd: 106,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 150  // 存護
    },

    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: 'ストレートベット',
            type: 'Basic ATK',
            description: '指定した敵単体にアベンチュリンの防御力100%分の虚数属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'def',
                hits: [{ multiplier: BASIC_MULT, toughnessReduction: 10 }],
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: `${CHARACTER_ID}-skill`,
            name: '繁栄の基石',
            type: 'Skill',
            description: '味方全体にアベンチュリンの防御力24%+320の「堅固なチップ」バリアを付与する、3ターン継続。重複付与時は累積（上限: スキルの200%）。',
            shield: {
                scaling: 'def',
                multiplier: SKILL_SHIELD_PCT,
                flat: SKILL_SHIELD_FLAT,
            },
            energyGain: 30,
            targetType: 'all_allies',
        },

        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: 'ロード・オブ・ルーレット',
            type: 'Ultimate',
            description: 'ランダムで「ブラインドベット」を1～7獲得し、指定した敵単体を「動揺」状態にする（3ターン）。指定した敵単体に防御力270%分の虚数属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'def',
                hits: [{ multiplier: ULT_MULT, toughnessReduction: 30 }],
            },
            energyGain: 5,
            targetType: 'single_enemy',
        },

        talent: {
            id: `${CHARACTER_ID}-talent`,
            name: '銃口の右には…',
            type: 'Talent',
            description: '「堅固なチップ」持ち味方の効果抵抗+50%。被弾時アベンチュリンの「ブラインドベット」+1（自身被弾時+2）。7スタックで7段追加攻撃（DEF25%×7）。',
            damage: {
                type: 'bounce',
                scaling: 'def',
                hits: Array(TALENT_FUA_HITS).fill({ multiplier: TALENT_FUA_MULT, toughnessReduction: TALENT_FUA_TOUGHNESS }),
            },
        },

        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: '赤と黒の狭間で',
            type: 'Technique',
            description: '秘技使用でランダムに防御力+24%/36%/60%のうち1つを獲得（3ターン）。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_LEVERAGE,
            name: 'レバレッジ',
            type: 'Bonus Ability',
            description: '防御力が1,600を超えた場合、超過した防御力100につき自身の会心率+2%、最大で+48%。'
        },
        {
            id: TRACE_IDS.A4_HOT_HAND,
            name: 'ホットハンド',
            type: 'Bonus Ability',
            description: '戦闘開始時、味方全体に「堅固なチップ」バリアを付与する（スキルの100%）、3ターン継続。'
        },
        {
            id: TRACE_IDS.A6_BINGO,
            name: 'ビンゴ！',
            type: 'Bonus Ability',
            description: '「堅固なチップ」持ち味方（自身以外）が追加攻撃を行った後、「ブラインドベット」+1（最大3回/ターン）。天賦追撃後、全味方にDEF7%+96シールド付与。'
        },
        {
            id: `${CHARACTER_ID}-stat-def`,
            name: '防御力強化',
            type: 'Stat Bonus',
            description: '防御力+35.0%',
            stat: 'def_pct' as StatKey,
            value: 0.35
        },
        {
            id: `${CHARACTER_ID}-stat-imaginary`,
            name: '虚数属性ダメージ強化',
            type: 'Stat Bonus',
            description: '虚数属性ダメージ+14.4%',
            stat: 'imaginary_dmg_boost' as StatKey,
            value: 0.144
        },
        {
            id: `${CHARACTER_ID}-stat-res`,
            name: '効果抵抗',
            type: 'Stat Bonus',
            description: '効果抵抗+10.0%',
            stat: 'effect_res' as StatKey,
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '囚人のジレンマ',
            description: '「堅固なチップ」を持つ味方の会心ダメージ+20%。必殺技発動後、味方全体に「堅固なチップ」バリアを付与する（スキルの100%）。'
        },
        e2: {
            level: 2,
            name: '限定合理性',
            description: '通常攻撃を行う時、ターゲットの全耐性-12%、3ターン継続。'
        },
        e3: {
            level: 3,
            name: '最高倍率',
            description: '必殺技のLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // 必殺技: Lv10(270%) → Lv12(291.6%)
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 2.916 },
                // 通常攻撃: Lv6(100%) → Lv7(110%)
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 },
            ]
        },
        e4: {
            level: 4,
            name: '予期せぬ絞首刑',
            description: '天賦の追加攻撃を発動する前にアベンチュリンの防御力+40%、2ターン継続。さらに天賦の追加攻撃の攻撃段数+3。'
        },
        e5: {
            level: 5,
            name: '曖昧性忌避',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                // スキル: Lv10(24%+320) → Lv12(25.6%+356)
                { abilityName: 'skill', param: 'shield.multiplier', value: 0.256 },
                { abilityName: 'skill', param: 'shield.flat', value: 356 },
            ]
        },
        e6: {
            level: 6,
            name: 'スタグハントゲーム',
            description: 'バリアを持つ自身以外の味方1名につき、アベンチュリンの与ダメージ+50%、最大で+150%。'
        }
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'inherently-unjust-destiny',
        superimposition: 1,
        relicSetId: 'the_ashblazing_grand_duke',
        ornamentSetId: 'broken_keel',
        mainStats: {
            body: 'def_pct',
            feet: 'spd',
            sphere: 'def_pct',
            rope: 'def_pct',
        },
        subStats: [
            { stat: 'def_pct', value: 0.30 },
            { stat: 'spd', value: 10 },
            { stat: 'crit_rate', value: 0.10 },
            { stat: 'effect_res', value: 0.10 },
        ],
        rotationMode: 'spam_skill',
        spamSkillTriggerSp: 4,
        ultStrategy: 'immediate',
    }
};

// --- ヘルパー関数 ---

/**
 * ブラインドベットスタックを取得
 */
function getBlindBetStacks(state: GameState, unitId: string): number {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.BLIND_BET(unitId));
    return effect?.stackCount || 0;
}

/**
 * ブラインドベットスタックを設定
 */
function setBlindBetStacks(state: GameState, unitId: string, stacks: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const clampedStacks = Math.min(Math.max(0, stacks), MAX_BLIND_BET_STACKS);

    const blindBetEffect: IEffect = {
        id: EFFECT_IDS.BLIND_BET(unitId),
        name: `ブラインドベット (${clampedStacks})`,
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: clampedStacks,
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };

    let newState = removeEffect(state, unitId, EFFECT_IDS.BLIND_BET(unitId));
    if (clampedStacks > 0) {
        newState = addEffect(newState, unitId, blindBetEffect);
    }

    return newState;
}

/**
 * ブラインドベットスタックを追加し、7以上で追撃をトリガー
 */
function addBlindBetStacks(state: GameState, unitId: string, amount: number, eidolonLevel: number): GameState {
    const currentStacks = getBlindBetStacks(state, unitId);
    const newStacks = Math.min(currentStacks + amount, MAX_BLIND_BET_STACKS);

    let newState = setBlindBetStacks(state, unitId, newStacks);

    // 7スタック以上で追撃をトリガー
    if (newStacks >= BLIND_BET_TRIGGER_THRESHOLD) {
        newState = {
            ...newState,
            pendingActions: [...newState.pendingActions, {
                type: 'FOLLOW_UP_ATTACK',
                sourceId: unitId,
                targetId: undefined,  // ランダムターゲット
                eidolonLevel
            } as FollowUpAttackAction]
        };
    }

    return newState;
}

/**
 * 堅固なチップ（シールド）を付与
 */
function applyFortifiedWager(
    state: GameState,
    sourceId: string,
    targetId: string,
    shieldPct: number,
    shieldFlat: number,
    eidolonLevel: number
): GameState {
    // シールド上限: スキルの200%
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const skillValues = getLeveledValue(ABILITY_VALUES.skillShield, skillLevel);
    const source = state.registry.get(createUnitId(sourceId));
    if (!source) return state;

    const baseShieldValue = source.stats.def * skillValues.pct + skillValues.flat;
    const shieldBoost = source.stats.shield_strength_boost || 0;
    const maxShieldCap = baseShieldValue * (1 + shieldBoost) * 2;  // 200%

    // 天賦レベルで効果抵抗ボーナスを計算
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const effectResBonus = getLeveledValue(ABILITY_VALUES.talentEffectRes, talentLevel).res;

    let newState = applyShield(
        state,
        sourceId,
        targetId,
        { scaling: 'def', multiplier: shieldPct, flat: shieldFlat },
        SKILL_SHIELD_DURATION,
        'TURN_END_BASED',
        '堅固なチップ',
        EFFECT_IDS.FORTIFIED_WAGER(sourceId, targetId),
        true,
        { stackable: true, cap: maxShieldCap }
    );

    // 効果抵抗バフを付与（既存があれば更新）
    const existingResEffect = state.registry.get(createUnitId(targetId))?.effects.find(
        e => e.id === EFFECT_IDS.EFFECT_RES(sourceId, targetId)
    );
    if (!existingResEffect) {
        const effectResEffect: IEffect = {
            id: EFFECT_IDS.EFFECT_RES(sourceId, targetId),
            name: '堅固なチップ (効果抵抗)',
            category: 'BUFF',
            sourceUnitId: sourceId,
            durationType: 'LINKED',  // シールドと連動
            duration: -1,
            linkedEffectId: EFFECT_IDS.FORTIFIED_WAGER(sourceId, targetId),
            modifiers: [{
                target: 'effect_res' as StatKey,
                value: effectResBonus,
                type: 'add' as const,
                source: '堅固なチップ'
            }],
            onApply: (t: Unit, s: GameState) => s,
            onRemove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, targetId, effectResEffect);
    }

    return newState;
}

/**
 * 対象が堅固なチップを持っているか確認
 */
function hasFortifiedWager(state: GameState, sourceId: string, targetId: string): boolean {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return false;
    return target.effects.some(e => e.id === EFFECT_IDS.FORTIFIED_WAGER(sourceId, targetId));
}

/**
 * A6: 追加攻撃発動カウンターを取得
 */
function getA6Counter(state: GameState, unitId: string): number {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.A6_COUNTER(unitId));
    return effect?.stackCount || 0;
}

/**
 * A6: 追加攻撃発動カウンターを設定
 */
function setA6Counter(state: GameState, unitId: string, count: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const a6Effect: IEffect = {
        id: EFFECT_IDS.A6_COUNTER(unitId),
        name: 'ビンゴ！カウンター',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: count,
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };

    let newState = removeEffect(state, unitId, EFFECT_IDS.A6_COUNTER(unitId));
    if (count > 0) {
        newState = addEffect(newState, unitId, a6Effect);
    }

    return newState;
}

// --- イベントハンドラー関数 ---

/**
 * 戦闘開始時
 */
const onBattleStart = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // A4: 戦闘開始時に味方全体にシールド付与（スキルの100%）
    const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_HOT_HAND);
    if (hasA4) {
        const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
        const skillValues = getLeveledValue(ABILITY_VALUES.skillShield, skillLevel);

        const allies = newState.registry.getAliveAllies();
        for (const ally of allies) {
            newState = applyFortifiedWager(
                newState,
                sourceUnitId,
                ally.id,
                skillValues.pct * A4_SHIELD_MULT,
                skillValues.flat * A4_SHIELD_MULT,
                eidolonLevel
            );
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
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;

    // A6: ターン開始時にカウンターをリセット
    newState = setA6Counter(newState, sourceUnitId, 0);

    // A2: 防御力超過による会心率ボーナスを更新
    const unit = newState.registry.get(createUnitId(sourceUnitId));
    if (!unit) return newState;

    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_LEVERAGE);
    if (hasA2) {
        const totalDef = unit.stats.def;
        if (totalDef > A2_DEF_THRESHOLD) {
            const excessDef = totalDef - A2_DEF_THRESHOLD;
            const critBonus = Math.min((excessDef / 100) * A2_CRIT_RATE_PER_100_DEF, A2_CRIT_RATE_CAP);

            // 既存のA2バフを削除して新しい値で付与
            newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.A2_CRIT(sourceUnitId));
            const a2Effect: IEffect = {
                id: EFFECT_IDS.A2_CRIT(sourceUnitId),
                name: 'レバレッジ',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{
                    target: 'crit_rate' as StatKey,
                    value: critBonus,
                    type: 'add' as const,
                    source: 'レバレッジ'
                }],
                onApply: (t: Unit, s: GameState) => s,
                onRemove: (t: Unit, s: GameState) => s
            };
            newState = addEffect(newState, sourceUnitId, a2Effect);
        }
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

    let newState = state;
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const skillValues = getLeveledValue(ABILITY_VALUES.skillShield, skillLevel);

    // 味方全体にシールド付与
    const allies = newState.registry.getAliveAllies();
    for (const ally of allies) {
        newState = applyFortifiedWager(
            newState,
            sourceUnitId,
            ally.id,
            skillValues.pct,
            skillValues.flat,
            eidolonLevel
        );
    }

    return newState;
};

/**
 * 通常攻撃使用時
 */
const onBasicAttackUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    if (!event.targetId) return state;

    let newState = state;

    // E2: ターゲットの全耐性-12%
    if (eidolonLevel >= 2) {
        const existingShred = state.registry.get(createUnitId(event.targetId))?.effects.find(
            e => e.id === EFFECT_IDS.E2_RES_SHRED(sourceUnitId, event.targetId!)
        );
        if (existingShred) {
            newState = removeEffect(newState, event.targetId, existingShred.id);
        }

        const resShredEffect: IEffect = {
            id: EFFECT_IDS.E2_RES_SHRED(sourceUnitId, event.targetId),
            name: '限定合理性 (E2)',
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: E2_RES_SHRED_DURATION,
            modifiers: [
                { target: 'physical_res' as StatKey, value: -E2_RES_SHRED, type: 'add' as const, source: 'E2' },
                { target: 'fire_res' as StatKey, value: -E2_RES_SHRED, type: 'add' as const, source: 'E2' },
                { target: 'ice_res' as StatKey, value: -E2_RES_SHRED, type: 'add' as const, source: 'E2' },
                { target: 'lightning_res' as StatKey, value: -E2_RES_SHRED, type: 'add' as const, source: 'E2' },
                { target: 'wind_res' as StatKey, value: -E2_RES_SHRED, type: 'add' as const, source: 'E2' },
                { target: 'quantum_res' as StatKey, value: -E2_RES_SHRED, type: 'add' as const, source: 'E2' },
                { target: 'imaginary_res' as StatKey, value: -E2_RES_SHRED, type: 'add' as const, source: 'E2' },
            ],
            onApply: (t: Unit, s: GameState) => s,
            onRemove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, event.targetId, resShredEffect);
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

    let newState = state;

    // ランダムでブラインドベット1～7獲得
    const stacksGained = Math.floor(Math.random() * 7) + 1;
    newState = addBlindBetStacks(newState, sourceUnitId, stacksGained, eidolonLevel);

    // ターゲットに「動揺」デバフ付与
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const ultValues = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);

    const upsetEffect: IEffect = {
        id: EFFECT_IDS.UPSET(sourceUnitId, event.targetId),
        name: '動揺',
        category: 'DEBUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_START_BASED',
        duration: ULT_UPSET_DURATION,
        tags: ['UPSET'],
        // 動揺の会心ダメージブーストはON_BEFORE_DAMAGE_CALCULATIONで処理
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, event.targetId, upsetEffect);

    // E1: 必殺技発動後、味方全体にシールド付与（スキルの100%）
    if (eidolonLevel >= 1) {
        const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
        const skillValues = getLeveledValue(ABILITY_VALUES.skillShield, skillLevel);

        const allies = newState.registry.getAliveAllies();
        for (const ally of allies) {
            newState = applyFortifiedWager(
                newState,
                sourceUnitId,
                ally.id,
                skillValues.pct,
                skillValues.flat,
                eidolonLevel
            );
        }
    }

    return newState;
};

/**
 * ダメージ発生時（天賦: バリア持ち味方被弾でスタック+1）
 * 
 * 仕様:
 * - 「堅固なチップ」を持つ味方単体は攻撃を受けた後にアベンチュリンの「ブラインドベット」+1
 * - また、アベンチュリンが攻撃を受けた後、さらに「ブラインドベット」+1
 * 
 * 解釈:
 * - シールド持ち味方被弾: +1
 * - アベンチュリン自身被弾: +1（シールドの有無に関係なく）
 * - アベンチュリンがシールドを持って被弾: +2（上記両方）
 */
const onDamageDealt = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 敵からのダメージのみ処理
    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker || !attacker.isEnemy) return state;

    if (!event.targetId) return state;
    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || target.isEnemy) return state;

    let newState = state;
    let stacksToAdd = 0;

    // ターゲットが堅固なチップを持っている場合: +1
    if (hasFortifiedWager(state, sourceUnitId, event.targetId)) {
        stacksToAdd += 1;
    }

    // アベンチュリン自身が攻撃を受けた場合: さらに+1（シールドの有無に関係なく）
    if (event.targetId === sourceUnitId) {
        stacksToAdd += 1;
    }

    if (stacksToAdd > 0) {
        newState = addBlindBetStacks(newState, sourceUnitId, stacksToAdd, eidolonLevel);
    }

    return newState;
};

/**
 * 追加攻撃発生時（A6: 味方の追撃でスタック+1）
 */
const onFollowUpAttackTriggered = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 自分の追撃は除外
    if (event.sourceId === sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6_BINGO);
    if (!hasA6) return state;

    // 追撃者が堅固なチップを持っているか確認
    if (!hasFortifiedWager(state, sourceUnitId, event.sourceId)) return state;

    // カウンターが上限未満か確認
    const currentCounter = getA6Counter(state, sourceUnitId);
    if (currentCounter >= A6_MAX_FOLLOW_UP_TRIGGERS) return state;

    let newState = state;
    newState = setA6Counter(newState, sourceUnitId, currentCounter + 1);
    newState = addBlindBetStacks(newState, sourceUnitId, 1, eidolonLevel);

    return newState;
};

/**
 * 天賦の追加攻撃をハンドル
 */
const onFollowUpAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    let source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // ブラインドベットを7消費
    const currentStacks = getBlindBetStacks(newState, sourceUnitId);
    newState = setBlindBetStacks(newState, sourceUnitId, currentStacks - BLIND_BET_TRIGGER_THRESHOLD);

    // E4: 追撃前に防御力+40%
    if (eidolonLevel >= 4) {
        const e4Effect: IEffect = {
            id: EFFECT_IDS.E4_DEF_BOOST(sourceUnitId),
            name: '予期せぬ絞首刑 (E4)',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_END_BASED',
            duration: E4_DEF_BUFF_DURATION,
            modifiers: [{
                target: 'def_pct' as StatKey,
                value: E4_DEF_BUFF,
                type: 'add' as const,
                source: 'E4'
            }],
            onApply: (t: Unit, s: GameState) => s,
            onRemove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, sourceUnitId, e4Effect);

        // E4 DEFバフ適用後にsourceを再取得（ダメージ計算に反映させるため）
        source = newState.registry.get(createUnitId(sourceUnitId))!;
    }

    // 攻撃段数を決定（E4で+3）
    const hitCount = eidolonLevel >= 4 ? TALENT_FUA_HITS + E4_EXTRA_HITS : TALENT_FUA_HITS;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const fuaValues = getLeveledValue(ABILITY_VALUES.talentFuaMult, talentLevel);

    // 7〜10段のダメージを与える
    const aliveEnemies = newState.registry.getAliveEnemies();
    if (aliveEnemies.length > 0) {
        for (let i = 0; i < hitCount; i++) {
            // ランダムな敵を選択
            const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            const baseDamage = source.stats.def * fuaValues.mult;

            const dmgCalc = calculateNormalAdditionalDamageWithCritInfo(source, randomEnemy, baseDamage);
            const result = applyUnifiedDamage(
                newState,
                source,
                randomEnemy,
                dmgCalc.damage,
                {
                    damageType: 'FOLLOW_UP_ATTACK_DAMAGE',
                    details: `天賦: 追加攻撃 ${i + 1}/${hitCount}`,
                    isCrit: dmgCalc.isCrit,
                    breakdownMultipliers: dmgCalc.breakdownMultipliers
                }
            );
            newState = result.state;

            // 削靪値適用
            const updatedEnemy = newState.registry.get(createUnitId(randomEnemy.id));
            if (updatedEnemy && updatedEnemy.toughness > 0) {
                const newToughness = Math.max(0, updatedEnemy.toughness - TALENT_FUA_TOUGHNESS);
                newState = {
                    ...newState,
                    registry: newState.registry.update(createUnitId(randomEnemy.id), u => ({
                        ...u,
                        toughness: newToughness
                    }))
                };
            }
        }
    }

    // A6: 天賦追撃後、全味方にシールド付与
    const hasA6 = source.traces?.some(t => t.id === TRACE_IDS.A6_BINGO);
    if (hasA6) {
        const allies = newState.registry.getAliveAllies();

        // 全味方にDEF7%+96シールド
        for (const ally of allies) {
            newState = applyFortifiedWager(
                newState,
                sourceUnitId,
                ally.id,
                A6_FUA_SHIELD_PCT,
                A6_FUA_SHIELD_FLAT,
                eidolonLevel
            );
        }

        // バリア耐久値が最も低い味方にさらにシールド付与
        const alliesWithShield = newState.registry.getAliveAllies().filter(a => a.shield > 0);
        if (alliesWithShield.length > 0) {
            const lowestShieldAlly = alliesWithShield.reduce((lowest, current) =>
                current.shield < lowest.shield ? current : lowest
            );
            newState = applyFortifiedWager(
                newState,
                sourceUnitId,
                lowestShieldAlly.id,
                A6_FUA_SHIELD_PCT,
                A6_FUA_SHIELD_FLAT,
                eidolonLevel
            );
        }
    }

    return newState;
};

/**
 * ダメージ計算前
 */
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (!event.targetId) return state;

    const source = state.registry.get(createUnitId(event.sourceId));
    const target = state.registry.get(createUnitId(event.targetId));
    if (!source || !target) return state;

    let newState = state;
    let damageModifiers = { ...newState.damageModifiers };

    // 味方のダメージ計算時（ソースが味方）
    if (!source.isEnemy) {
        // 動揺デバフチェック: ターゲットが動揺状態なら会心ダメージ+15%
        const hasUpset = target.effects.some(e => e.tags?.includes('UPSET'));
        if (hasUpset) {
            const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
            const ultValues = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);
            damageModifiers.critDmg = (damageModifiers.critDmg || 0) + ultValues.critDmg;
        }

        // E1: ソースが堅固なチップを持っている場合、会心ダメージ+20%
        if (eidolonLevel >= 1 && hasFortifiedWager(state, sourceUnitId, event.sourceId)) {
            damageModifiers.critDmg = (damageModifiers.critDmg || 0) + E1_CRIT_DMG;
        }

        // E6: バリア持ち味方1名につき与ダメージ+50%（自分以外、最大+150%）
        if (eidolonLevel >= 6 && event.sourceId === sourceUnitId) {
            const allies = newState.registry.getAliveAllies().filter(a => a.id !== sourceUnitId);
            const alliesWithShield = allies.filter(a => a.shield > 0);
            const dmgBoost = Math.min(alliesWithShield.length * E6_DMG_BOOST_PER_ALLY, E6_DMG_BOOST_CAP);
            damageModifiers.allTypeDmg = (damageModifiers.allTypeDmg || 0) + dmgBoost;
        }
    }

    newState = { ...newState, damageModifiers };
    return newState;
};

// --- ハンドラーファクトリ ---
export const aventurineHandlerFactory: IEventHandlerFactory = (
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
                'ON_SKILL_USED',
                'ON_BASIC_ATTACK',
                'ON_ULTIMATE_USED',
                'ON_DAMAGE_DEALT',
                'ON_FOLLOW_UP_ATTACK',
                'ON_BEFORE_DAMAGE_CALCULATION',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_TURN_START') {
                return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_SKILL_USED') {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BASIC_ATTACK') {
                return onBasicAttackUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event as DamageDealtEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_FOLLOW_UP_ATTACK') {
                // 自分の追撃はダメージ処理、他者の追撃はA6処理
                if ((event as ActionEvent).sourceId === sourceUnitId) {
                    return onFollowUpAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                } else {
                    return onFollowUpAttackTriggered(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                }
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
