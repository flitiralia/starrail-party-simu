import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent } from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { applyUnifiedDamage, appendAdditionalDamage, initializeCurrentActionLog, extractBuffsForLogWithAuras, publishEvent } from '../../simulator/engine/dispatcher';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { advanceAction, delayAction } from '../../simulator/engine/utils';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateNormalAdditionalDamageWithCritInfo, calculateBreakDamageWithBreakdown } from '../../simulator/damage';
import { recalculateUnitStats } from '../../simulator/statBuilder';

// --- 定数定義 ---
const CHARACTER_ID = 'boothill';

const EFFECT_IDS = {
    STANDOFF_SELF: (id: string) => `boothill-standoff-self-${id}`,
    STANDOFF_ENEMY: (id: string, enemyId: string) => `boothill-standoff-enemy-${id}-${enemyId}`,
    POCKET_ADVANTAGE: (id: string) => `boothill-pocket-advantage-${id}`,
    PHYSICAL_WEAKNESS: (id: string, enemyId: string) => `boothill-physical-weakness-${id}-${enemyId}`,
    E2_BREAK_EFFECT: (id: string) => `boothill-e2-break-effect-${id}`,
    A2_CRIT_CONVERSION: (id: string) => `boothill-a2-crit-conversion-${id}`,
    TECHNIQUE_FLAG: (id: string) => `boothill-technique-flag-${id}`,
} as const;

const TRACE_IDS = {
    A2_GHOST_LOAD: 'boothill-trace-a2',      // ゴースト・ロード
    A4_ABOVE_SNAKES: 'boothill-trace-a4',    // アバーブ・スネークス
    A6_POINT_BLANK: 'boothill-trace-a6',     // ポイントブランク
} as const;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 通常攻撃: E3でLv7に上昇
    basicMult: {
        6: 1.00,
        7: 1.10
    } as Record<number, number>,
    // 強化通常攻撃: E3でLv7に上昇
    enhancedBasicMult: {
        6: 2.20,
        7: 2.42
    } as Record<number, number>,
    // 必殺技ダメージ: E3でLv12に上昇
    ultMult: {
        10: 4.00,
        12: 4.32
    } as Record<number, number>,
    // 行動遅延: E3でLv12に上昇
    ultDelay: {
        10: 0.40,
        12: 0.42
    } as Record<number, number>,
    // 天賦: ポケットアドバンテージ層数ごとの弱点撃破ダメージ%
    // E5でLv12に上昇
    talentBreakMult: {
        10: [0.70, 1.20, 1.70],   // 1層/2層/3層
        12: [0.77, 1.32, 1.87]    // 1層/2層/3層
    } as Record<number, number[]>,
    // 九死の決闘: E5でスキルLv12に上昇
    skillDmgTaken: {
        10: 0.30,  // 敵被ダメ+30%
        12: 0.33   // 敵被ダメ+33%
    } as Record<number, number>,
};

// 九死の決闘
const STANDOFF_DURATION = 2;
const STANDOFF_ENEMY_DMG_TAKEN_INCREASE = 0.30;   // 敵の被ダメージ+30%（Lv10）
const STANDOFF_SELF_DMG_TAKEN_INCREASE = 0.15;   // 自身の被ダメージ+15%

// ポケットアドバンテージ
const MAX_POCKET_ADVANTAGE = 3;
// 層ごとの靭性削りボーナス（追加値）
const POCKET_TOUGHNESS_BONUS = [0, 0.50, 0.80, 1.00] as const; // 0/1/2/3層

// EP
const BASIC_EP = 20;
const ENHANCED_BASIC_EP = 30;                    // 強化通常攻撃はEP+30
const SKILL_EP = 0;                              // スキルはEP回復しない
const ULT_EP = 5;

// 必殺技
const ULT_ACTION_DELAY = 0.40;                   // 行動40%遅延

// 星魂
const E1_DEF_IGNORE = 0.16;                      // 防御16%無視
const E2_SP_RECOVERY = 1;                        // SP+1
const E2_BREAK_EFFECT_BOOST = 0.30;              // 撃破特効+30%
const E4_DMG_BOOST = 0.12;                       // 与ダメ+12%
const E4_DMG_REDUCTION = 0.12;                   // 被ダメ-12%

// 軌跡
const A2_CRIT_RATE_PER_BE = 0.10 / 1;            // 撃破特効10%ごとに会心率+1%
const A2_CRIT_RATE_CAP = 0.30;                   // 会心率上限+30%
const A2_CRIT_DMG_PER_BE = 0.50 / 1;             // 撃破特効50%ごとに会心ダメージ+1%
const A2_CRIT_DMG_CAP = 1.50;                    // 会心ダメージ上限+150%
const A4_DMG_REDUCTION = 0.30;                   // 被ダメ-30%
const A6_EP_RECOVERY = 10;                       // EP+10

// ヘイト
const AGGRO = 75;                                // 巡狩標準

export const boothill: Character = {
    id: CHARACTER_ID,
    name: 'ブートヒル',
    path: 'The Hunt',
    element: 'Physical',
    rarity: 5,
    maxEnergy: 115,
    baseStats: {
        hp: 1203,
        atk: 620,
        def: 436,
        spd: 107,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: AGGRO
    },

    abilities: {
        basic: {
            id: 'boothill-basic',
            name: 'スパーズ・クラッシュ',
            type: 'Basic ATK',
            description: '指定した敵単体に攻撃力100%分の物理ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    // 2ヒット、合計100%
                    { multiplier: 0.50, toughnessReduction: 5 },
                    { multiplier: 0.50, toughnessReduction: 5 }
                ],
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'boothill-skill',
            name: '熱砂のタンゴ',
            type: 'Skill',
            description: 'ターゲットとブートヒルを2ターンの間「九死の決闘」状態にする。決闘中、ブートヒルの通常攻撃は強化通常攻撃に変化し、ターゲットは挑発状態となる。このスキルはEPを回復せず、ターンも終了しない。',
            // ダメージなし、状態付与
            energyGain: SKILL_EP,
            targetType: 'single_enemy',
            spCost: 0,  // SP消費なし
        },

        ultimate: {
            id: 'boothill-ultimate',
            name: 'ダストデビル・ダンサー',
            type: 'Ultimate',
            description: '指定した敵単体に2ターンの間、物理弱点を付与し、攻撃力400%分の物理ダメージを与え、行動順を40%遅延させる。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    // 2ヒット、合計400%
                    { multiplier: 2.00, toughnessReduction: 15 },
                    { multiplier: 2.00, toughnessReduction: 15 }
                ],
            },
            energyGain: ULT_EP,
            targetType: 'single_enemy',
        },

        talent: {
            id: 'boothill-talent',
            name: '5発の銃弾',
            type: 'Talent',
            description: '敵が弱点撃破状態の時に強化通常攻撃を行うと、物理弱点撃破ダメージに基づく追加撃破ダメージを与える。決闘中の敵が倒されるか弱点撃破された場合、「ポケットアドバンテージ」を1層獲得する。',
            // ダメージはハンドラで処理
            energyGain: 0,
            targetType: 'single_enemy'
        },

        technique: {
            id: 'boothill-technique',
            name: 'ビッグ・スマイル',
            type: 'Technique',
            description: '戦闘開始後、初めて戦闘スキルを使用する際、対象の敵に2ターンの間、必殺技と同様の物理弱点を付与する。',
        },

        // 強化通常攻撃（九死の決闘状態時）
        enhancedBasic: {
            id: 'boothill-enhanced-basic',
            name: 'ファニング',
            type: 'Basic ATK',
            description: '「九死の決闘」状態の敵のみを対象とし、攻撃力220%分の物理ダメージを与える。この攻撃ではSPを回復しない。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    // 6ヒット、合計220%、削靭值20（ポケットアドバンテージで最大50まで増加）
                    { multiplier: 0.367, toughnessReduction: 3.33 },
                    { multiplier: 0.367, toughnessReduction: 3.33 },
                    { multiplier: 0.367, toughnessReduction: 3.33 },
                    { multiplier: 0.367, toughnessReduction: 3.33 },
                    { multiplier: 0.367, toughnessReduction: 3.33 },
                    { multiplier: 0.365, toughnessReduction: 3.35 }
                ],
            },
            energyGain: ENHANCED_BASIC_EP,
            targetType: 'single_enemy',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_GHOST_LOAD,
            name: 'ゴースト・ロード',
            type: 'Bonus Ability',
            description: '自身の撃破特効の10%分、会心率をアップする（最大30%）。また、自身の撃破特効の50%分、会心ダメージをアップする（最大150%）。'
        },
        {
            id: TRACE_IDS.A4_ABOVE_SNAKES,
            name: '死地からの脱出',
            type: 'Bonus Ability',
            description: 'ブートヒルが「九死の決闘」状態の場合、「九死の決闘」状態でない敵の攻撃を受ける時、被ダメージ-30%。'
        },
        {
            id: TRACE_IDS.A6_POINT_BLANK,
            name: 'ポイントブランク',
            type: 'Bonus Ability',
            description: '「九死の決闘」状態中に「ポケットアドバンテージ」を獲得する際、EPを10回復する。'
        },
        {
            id: 'boothill-stat-break',
            name: '撃破特効',
            type: 'Stat Bonus',
            description: '撃破特効+37.3%',
            stat: 'break_effect' as StatKey,
            value: 0.373
        },
        {
            id: 'boothill-stat-atk',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+18.0%',
            stat: 'atk_pct' as StatKey,
            value: 0.18
        },
        {
            id: 'boothill-stat-hp',
            name: 'HP',
            type: 'Stat Bonus',
            description: '最大HP+10.0%',
            stat: 'hp_pct' as StatKey,
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '砂塵の中の一等星',
            description: '戦闘開始時、「ポケットアドバンテージ」を1層獲得する。また、敵の防御力を16%無視してダメージを与える。'
        },
        e2: {
            level: 2,
            name: 'マイルストーン・モンガー',
            description: '天賦によって「ポケットアドバンテージ」を獲得する際、SPを1回復し、自身の撃破特効を2ターンの間30%アップさせる。この効果は1ターンに1回発動。'
        },
        e3: {
            level: 3,
            name: '墓守',
            description: '必殺技のLv.+2、通常攻撃のLv.+1。',
            abilityModifiers: [
                // 必殺技Lv12: 432% (2ヒット合計 = 2.16 × 2)
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 2.16 },
                { abilityName: 'ultimate', param: 'damage.hits.1.multiplier', value: 2.16 },
                // 通常攻撃Lv7: 110% (2ヒット合計 = 0.55 × 2)
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.55 },
                { abilityName: 'basic', param: 'damage.hits.1.multiplier', value: 0.55 },
                // 強化通常攻撃Lv7: 242% (6ヒット合計 ≈ 0.403 × 6)
                { abilityName: 'enhancedBasic', param: 'damage.hits.0.multiplier', value: 0.403 },
                { abilityName: 'enhancedBasic', param: 'damage.hits.1.multiplier', value: 0.403 },
                { abilityName: 'enhancedBasic', param: 'damage.hits.2.multiplier', value: 0.403 },
                { abilityName: 'enhancedBasic', param: 'damage.hits.3.multiplier', value: 0.403 },
                { abilityName: 'enhancedBasic', param: 'damage.hits.4.multiplier', value: 0.403 },
                { abilityName: 'enhancedBasic', param: 'damage.hits.5.multiplier', value: 0.405 }
            ]
        },
        e4: {
            level: 4,
            name: '冷めた肉の料理人',
            description: '「九死の決闘」状態の敵がブートヒルの攻撃を受ける時、被ダメージアップ効果さらに+12%。ブートヒルが「九死の決闘」状態の敵の攻撃を受ける時、被ダメージアップ効果-12%。'
        },
        e5: {
            level: 5,
            name: '切り株の演説家',
            description: '戦闘スキルのLv.+2、天賦のLv.+2。'
            // スキルと天賦のレベルアップはハンドラーで動的に処理
        },
        e6: {
            level: 6,
            name: '鉄格子ホテルの常連',
            description: '天賦を触発して弱点撃破ダメージを与える時、ターゲットに対してさらに本来のダメージ倍率40%分の弱点撃破ダメージを与え、隣接する敵に本来のダメージ倍率70%分の弱点撃破ダメージを与える。'
        }
    },

    // デフォルト設定
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'sailing-towards-a-second-life',
        superimposition: 1,
        relicSetId: 'thief_of_shooting_meteor',
        ornamentSetId: 'talia_kingdom_of_banditry',
        mainStats: {
            body: 'crit_rate',
            feet: 'spd',
            sphere: 'physical_dmg_boost',
            rope: 'break_effect',
        },
        subStats: [
            { stat: 'break_effect', value: 0.30 },
            { stat: 'crit_rate', value: 0.15 },
            { stat: 'crit_dmg', value: 0.30 },
            { stat: 'atk_pct', value: 0.15 },
            { stat: 'spd', value: 6 },
        ],
        rotationMode: 'spam_skill',
        spamSkillTriggerSp: 4,
        ultStrategy: 'immediate',
    },
};

// --- ヘルパー関数 ---

// 九死の決闘状態かどうか
function isInStandoff(unit: Unit): boolean {
    return unit.effects.some(e => e.id.startsWith('boothill-standoff-self-'));
}

// 対象が九死の決闘の相手かどうか
function isStandoffTarget(state: GameState, sourceId: string, targetId: string): boolean {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return false;
    return target.effects.some(e => e.id === EFFECT_IDS.STANDOFF_ENEMY(sourceId, targetId));
}

// ポケットアドバンテージを取得
function getPocketAdvantage(unit: Unit): number {
    const effect = unit.effects.find(e => e.id.startsWith('boothill-pocket-advantage-'));
    return effect?.stackCount || 0;
}

// ポケットアドバンテージを更新
function updatePocketAdvantage(state: GameState, unitId: string, delta: number, eidolonLevel: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const effectId = EFFECT_IDS.POCKET_ADVANTAGE(unitId);
    const existingEffect = unit.effects.find(e => e.id === effectId);
    const currentStacks = existingEffect?.stackCount || 0;
    const newStacks = Math.min(Math.max(currentStacks + delta, 0), MAX_POCKET_ADVANTAGE);

    let newState = state;

    if (existingEffect) {
        const updatedEffect = {
            ...existingEffect,
            stackCount: newStacks,
            name: `ポケットアドバンテージ (${newStacks}/${MAX_POCKET_ADVANTAGE})`
        };
        const newEffects = unit.effects.map(e => e.id === effectId ? updatedEffect : e);
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(unitId), u => ({ ...u, effects: newEffects }))
        };
    } else if (newStacks > 0) {
        const pocketEffect: IEffect = {
            id: effectId,
            name: `ポケットアドバンテージ (${newStacks}/${MAX_POCKET_ADVANTAGE})`,
            category: 'BUFF',
            sourceUnitId: unitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: newStacks,
            maxStacks: MAX_POCKET_ADVANTAGE,
            // 靭性削りボーナスは適用時に計算
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, unitId, pocketEffect);
    }

    return newState;
}

// 九死の決闘を開始
function startStandoff(
    state: GameState,
    sourceId: string,
    targetId: string,
    eidolonLevel: number
): GameState {
    let newState = state;

    // 自身に決闘状態を付与 (ENHANCED_BASICタグ)
    // E4: 九死の決闘状態の敵からの攻撃時、被ダメ-12%
    const selfModifiers: { target: StatKey; value: number; type: 'add' | 'pct'; source: string }[] = [
        { target: 'dmg_taken' as StatKey, value: STANDOFF_SELF_DMG_TAKEN_INCREASE, type: 'add', source: '九死の決闘' }
    ];

    // E4: 被ダメ軽減を追加（dmg_taken_reductionは被ダメから減算される）
    if (eidolonLevel >= 4) {
        selfModifiers.push({
            target: 'dmg_taken_reduction' as StatKey,
            value: E4_DMG_REDUCTION,
            type: 'add',
            source: 'E4 冷めた肉の料理人'
        });
    }

    const selfEffect: IEffect = {
        id: EFFECT_IDS.STANDOFF_SELF(sourceId),
        name: '九死の決闘',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: STANDOFF_DURATION,
        skipFirstTurnDecrement: true,
        tags: ['ENHANCED_BASIC', 'SKILL_SILENCE', 'STANDOFF'],
        modifiers: selfModifiers,
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, sourceId, selfEffect);

    // 敵に決闘状態を付与 (LINKED、挑発)
    const enemyEffect: IEffect = {
        id: EFFECT_IDS.STANDOFF_ENEMY(sourceId, targetId),
        name: '九死の決闘（対象）',
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'LINKED',
        duration: 0,
        linkedEffectId: EFFECT_IDS.STANDOFF_SELF(sourceId),
        tags: ['TAUNT', 'STANDOFF'],
        modifiers: [
            { target: 'dmg_taken' as StatKey, value: STANDOFF_ENEMY_DMG_TAKEN_INCREASE, type: 'add', source: '九死の決闘' }
        ],
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, targetId, enemyEffect);

    return newState;
}

// 九死の決闘を解除
function endStandoff(state: GameState, sourceId: string): GameState {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return state;

    const standoffEffect = unit.effects.find(e => e.id === EFFECT_IDS.STANDOFF_SELF(sourceId));
    if (!standoffEffect) return state;

    // 自身の決闘状態を解除（LINKED効果は自動的に削除される）
    return removeEffect(state, sourceId, EFFECT_IDS.STANDOFF_SELF(sourceId));
}

// 物理弱点を付与
function applyPhysicalWeakness(
    state: GameState,
    sourceId: string,
    targetId: string,
    duration: number
): GameState {
    const weaknessEffect: IEffect = {
        id: EFFECT_IDS.PHYSICAL_WEAKNESS(sourceId, targetId),
        name: '物理弱点（埋め込み）',
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: duration,
        tags: ['PHYSICAL_WEAKNESS', 'IMPLANTED_WEAKNESS'],
        // 物理弱点を持つように設定
        apply: (t, s) => {
            const currentWeaknesses = t.weaknesses || new Set();
            if (!currentWeaknesses.has('Physical')) {
                const updatedWeaknesses = new Set(currentWeaknesses);
                updatedWeaknesses.add('Physical');
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(t.id), u => ({ ...u, weaknesses: updatedWeaknesses }))
                };
            }
            return s;
        },
        remove: (t, s) => {
            // 埋め込み弱点を削除時に物理弱点を元に戻す
            // 注意: 元々物理弱点を持っていた場合は削除しない
            return s;
        }
    };

    return addEffect(state, targetId, weaknessEffect);
}

// --- ハンドラー関数 ---

// 戦闘開始時
const onBattleStart = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // ポケットアドバンテージを初期化
    newState = updatePocketAdvantage(newState, sourceUnitId, 0, eidolonLevel);

    // E1: 戦闘開始時にポケットアドバンテージ+1
    if (eidolonLevel >= 1) {
        newState = updatePocketAdvantage(newState, sourceUnitId, 1, eidolonLevel);
    }

    // A2: ゴースト・ロード - 撃破特効→会心変換はON_BEFORE_DAMAGE_CALCULATIONで動的に計算

    // 秘技「ビッグ・スマイル」: 初回スキル使用時の物理弱点付与フラグを設定
    // NOTE: このシミュレーターでは秘技使用を前提として常にフラグを立てる
    const techniqueFlag: IEffect = {
        id: EFFECT_IDS.TECHNIQUE_FLAG(sourceUnitId),
        name: 'ビッグ・スマイル（初回スキルフラグ）',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        tags: ['TECHNIQUE_FLAG'],
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, sourceUnitId, techniqueFlag);

    return newState;
};

// スキル使用時: 九死の決闘開始
const onSkillUsed = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const actionEvent = event as ActionEvent;
    if (!actionEvent.targetId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // 既に九死の決闘状態なら何もしない
    if (isInStandoff(unit)) return state;

    let newState = state;

    // 秘技「ビッグ・スマイル」: 初回スキル使用時に物理弱点を付与
    const techniqueFlag = unit.effects.find(e => e.id === EFFECT_IDS.TECHNIQUE_FLAG(sourceUnitId));
    if (techniqueFlag) {
        // 物理弱点を2ターン付与（必殺技と同様）
        newState = applyPhysicalWeakness(newState, sourceUnitId, actionEvent.targetId, 2);
        // フラグを削除（初回のみ発動）
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.TECHNIQUE_FLAG(sourceUnitId));
    }

    // 九死の決闘を開始
    newState = startStandoff(newState, sourceUnitId, actionEvent.targetId, eidolonLevel);

    // ターン終了スキップ設定（スキル発動後→強化通常攻撃→ターン終了）
    newState = {
        ...newState,
        currentTurnState: {
            skipTurnEnd: true,
            endConditions: [{ type: 'action_count', actionCount: 1 }],
            actionCount: -1  // スキル発動自体をカウントしない
        }
    };

    return newState;
};

// 必殺技使用時: 物理弱点付与、行動遅延
const onUltimateUsed = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const actionEvent = event as ActionEvent;
    if (!actionEvent.targetId) return state;

    let newState = state;

    // 物理弱点を2ターン付与
    newState = applyPhysicalWeakness(newState, sourceUnitId, actionEvent.targetId, 2);

    // 行動30%遅延
    newState = delayAction(newState, actionEvent.targetId, ULT_ACTION_DELAY, 'percent');

    return newState;
};

// 弱点撃破時: ポケットアドバンテージ獲得、決闘解除
const onWeaknessBreak = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    if (!event.targetId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 九死の決闘中の敵を弱点撃破した場合
    if (isStandoffTarget(newState, sourceUnitId, event.targetId)) {
        // ポケットアドバンテージ+1
        newState = updatePocketAdvantage(newState, sourceUnitId, 1, eidolonLevel);

        // A6: 決闘中にポケットアドバンテージ獲得時EP+10
        const freshUnit = newState.registry.get(createUnitId(sourceUnitId));
        const hasA6 = freshUnit?.traces?.some(t => t.id === TRACE_IDS.A6_POINT_BLANK);
        if (hasA6) {
            newState = addEnergyToUnit(newState, sourceUnitId, A6_EP_RECOVERY);
        }

        // E2: ポケットアドバンテージ獲得時SP+1、撃破特効+30%（2ターン）
        if (eidolonLevel >= 2) {
            // SP+1
            newState = {
                ...newState,
                skillPoints: Math.min(newState.skillPoints + E2_SP_RECOVERY, 5)
            };

            // 撃破特効+30%バフ
            const e2Buff: IEffect = {
                id: EFFECT_IDS.E2_BREAK_EFFECT(sourceUnitId),
                name: 'E2 撃破特効',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_END_BASED',
                duration: 2,
                skipFirstTurnDecrement: true,
                modifiers: [
                    { target: 'break_effect' as StatKey, value: E2_BREAK_EFFECT_BOOST, type: 'add', source: 'E2' }
                ],
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            newState = addEffect(newState, sourceUnitId, e2Buff);
        }

        // 九死の決闘を解除
        newState = endStandoff(newState, sourceUnitId);
    }

    return newState;
};

// 敵撃破時: 決闘中なら解除
const onEnemyDefeated = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    if (!('targetId' in event) || !event.targetId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 九死の決闘中の敵を撃破した場合
    if (isStandoffTarget(newState, sourceUnitId, event.targetId as string)) {
        // ポケットアドバンテージ+1（弱点撃破と重複しない）
        // 弱点撃破で既に獲得している場合はスキップ
        // 注意: ON_WEAKNESS_BREAK と ON_ENEMY_DEFEATED の発火順序に依存

        // 九死の決闘を解除
        newState = endStandoff(newState, sourceUnitId);
    }

    return newState;
};

// ダメージ計算前: E1防御無視、E4与ダメ増加、A4被ダメ軽減
const onBeforeDamageCalculation = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    // 攻撃者がブートヒルの場合
    if (event.sourceId === sourceUnitId) {
        let newState = state;

        // E1: 防御16%無視
        if (eidolonLevel >= 1) {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    defIgnore: (newState.damageModifiers.defIgnore || 0) + E1_DEF_IGNORE
                }
            };
        }

        // E4: 九死の決闘状態の敵に与ダメ+12%
        if (eidolonLevel >= 4 && ('targetId' in event) && event.targetId) {
            if (isStandoffTarget(newState, sourceUnitId, event.targetId as string)) {
                newState = {
                    ...newState,
                    damageModifiers: {
                        ...newState.damageModifiers,
                        allTypeDmg: (newState.damageModifiers.allTypeDmg || 0) + E4_DMG_BOOST
                    }
                };
            }
        }

        // A2: ゴースト・ロード - 撃破特効→会心変換（動的計算）
        const unit = newState.registry.get(createUnitId(sourceUnitId));
        const hasA2 = unit?.traces?.some(t => t.id === TRACE_IDS.A2_GHOST_LOAD);
        if (hasA2 && unit) {
            const breakEffect = unit.stats.break_effect || 0;
            const critRateBonus = Math.min(breakEffect * A2_CRIT_RATE_PER_BE, A2_CRIT_RATE_CAP);
            const critDmgBonus = Math.min(breakEffect * A2_CRIT_DMG_PER_BE, A2_CRIT_DMG_CAP);

            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    critRate: (newState.damageModifiers.critRate || 0) + critRateBonus,
                    critDmg: (newState.damageModifiers.critDmg || 0) + critDmgBonus
                }
            };
        }

        // ポケットアドバンテージによる削靭値加算（強化通常攻撃時のみ）
        if (('subType' in event) && (event as any).subType === 'ENHANCED_BASIC_ATTACK' && unit) {
            const pocketAdvantage = getPocketAdvantage(unit);
            if (pocketAdvantage > 0) {
                // 1層:+10, 2層:+20, 3層:+30（合計値、6ヒットに分散）
                // ヒットごとの加算: pocketAdvantage * 10 / 6
                const flatBonus = (pocketAdvantage * 10) / 6;
                newState = {
                    ...newState,
                    damageModifiers: {
                        ...newState.damageModifiers,
                        toughnessFlat: (newState.damageModifiers.toughnessFlat || 0) + flatBonus
                    }
                };
            }
        }

        return newState;
    }

    // 被弾者がブートヒルの場合: A4被ダメ軽減
    if (('targetId' in event) && event.targetId === sourceUnitId) {
        const unit = state.registry.get(createUnitId(sourceUnitId));
        if (!unit) return state;

        // ブートヒルが九死の決闘状態かチェック
        if (!isInStandoff(unit)) return state;

        // A4: 攻撃者が九死の決闘状態でない場合、被ダメ-30%
        const attackerId = event.sourceId;
        if (!attackerId) return state;

        const attacker = state.registry.get(createUnitId(attackerId));
        if (!attacker) return state;

        // 攻撃者が九死の決闘状態（決闘の対象）かチェック
        const attackerInStandoff = attacker.effects.some(
            e => e.id === EFFECT_IDS.STANDOFF_ENEMY(sourceUnitId, attackerId)
        );

        // A4条件: 攻撃者が決闘状態でない
        const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_ABOVE_SNAKES);
        if (hasA4 && !attackerInStandoff) {
            return {
                ...state,
                damageModifiers: {
                    ...state.damageModifiers,
                    dmgTakenReduction: (state.damageModifiers.dmgTakenReduction || 0) + A4_DMG_REDUCTION
                }
            };
        }
    }

    return state;
};

// 各ヒット後: 天賦「5発の銃弾」の弱点撃破ダメージ計算
const onAfterHit = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number, level: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    if (!('actionType' in event)) return state;

    const actionEvent = event as any;

    // 強化通常攻撃のみ
    if (actionEvent.actionType !== 'ENHANCED_BASIC_ATTACK') return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const targetId = actionEvent.targetId;
    if (!targetId) return state;

    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    // 敵が弱点撃破状態かチェック（靭性が0以下）
    if (target.toughness > 0) return state;

    // ポケットアドバンテージの層数を取得
    const pocketAdvantage = getPocketAdvantage(unit);
    if (pocketAdvantage <= 0) return state;

    let newState = state;

    // 天賦レベルを計算（E5でLv12）
    const talentLevel = eidolonLevel >= 5 ? 12 : 10;
    const breakMultipliers = ABILITY_VALUES.talentBreakMult[talentLevel];
    const breakMultiplier = breakMultipliers[pocketAdvantage - 1]; // 0-indexed

    // 撃破ダメージの基礎値を計算（通常攻撃の削靭値16倍 = 160を上限とする）
    const BASIC_TOUGHNESS_REDUCTION = 10;
    const MAX_TOUGHNESS_FOR_BREAK = BASIC_TOUGHNESS_REDUCTION * 16; // 160

    // 弱点撃破ダメージを計算
    const breakDamageResult = calculateBreakDamageWithBreakdown(unit, target, newState.damageModifiers);
    const talentBreakDamage = breakDamageResult.damage * breakMultiplier;

    // ダメージを適用
    const result = applyUnifiedDamage(
        newState,
        unit,
        target,
        talentBreakDamage,
        {
            damageType: 'break',
            skipLog: true,
            events: []
        }
    );
    newState = result.state;

    // ログに追加
    newState = appendAdditionalDamage(newState, {
        source: unit.name,
        name: `天賦撃破ダメージ (${pocketAdvantage}層)`,
        damage: talentBreakDamage,
        target: target.name,
        damageType: 'break',
        isCrit: false,
        breakdownMultipliers: breakDamageResult.breakdownMultipliers
    });

    // E6: 追加の撃破ダメージ
    if (eidolonLevel >= 6) {
        // ターゲットに本来倍率40%の追加ダメージ
        const e6TargetDamage = talentBreakDamage * 0.40;
        const e6TargetResult = applyUnifiedDamage(
            newState,
            unit,
            target,
            e6TargetDamage,
            {
                damageType: 'break',
                skipLog: true,
                events: []
            }
        );
        newState = e6TargetResult.state;

        newState = appendAdditionalDamage(newState, {
            source: unit.name,
            name: 'E6 追加撃破ダメージ (ターゲット)',
            damage: e6TargetDamage,
            target: target.name,
            damageType: 'break',
            isCrit: false
        });

        // 隣接する敵に本来倍率70%の追加ダメージ
        const enemies = newState.registry.getAliveEnemies();
        const targetIndex = enemies.findIndex(e => e.id === targetId);
        const adjacentIndices = [targetIndex - 1, targetIndex + 1];

        for (const adjIdx of adjacentIndices) {
            if (adjIdx >= 0 && adjIdx < enemies.length) {
                const adjacentEnemy = enemies[adjIdx];
                if (adjacentEnemy.id !== targetId) {
                    const e6AdjacentDamage = talentBreakDamage * 0.70;
                    const e6AdjResult = applyUnifiedDamage(
                        newState,
                        unit,
                        adjacentEnemy,
                        e6AdjacentDamage,
                        {
                            damageType: 'break',
                            skipLog: true,
                            events: []
                        }
                    );
                    newState = e6AdjResult.state;

                    newState = appendAdditionalDamage(newState, {
                        source: unit.name,
                        name: 'E6 追加撃破ダメージ (隣接)',
                        damage: e6AdjacentDamage,
                        target: adjacentEnemy.name,
                        damageType: 'break',
                        isCrit: false
                    });
                }
            }
        }
    }

    return newState;
};

// --- ハンドラーファクトリ ---

export const boothillHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `boothill-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_WEAKNESS_BREAK',
                'ON_ENEMY_DEFEATED',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_AFTER_HIT',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            // ソースユニットの存在確認
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            // イベントタイプで分岐
            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_SKILL_USED') {
                return onSkillUsed(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_WEAKNESS_BREAK') {
                return onWeaknessBreak(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ENEMY_DEFEATED') {
                return onEnemyDefeated(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_AFTER_HIT') {
                return onAfterHit(event, state, sourceUnitId, eidolonLevel, level);
            }

            return state;
        }
    };
};
