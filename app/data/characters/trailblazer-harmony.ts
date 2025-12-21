import { Character, Element, Path, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, DamageDealtEvent, ActionEvent, GeneralEvent } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage, publishEvent } from '../../simulator/engine/dispatcher';
import { calculateSuperBreakDamageWithBreakdown } from '../../simulator/damage';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { delayAction } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { addSkillPoints } from '../../simulator/effect/relicEffectHelpers';
import { IAura } from '../../simulator/engine/types';
import { addAura } from '../../simulator/engine/auraManager';

// --- 定数定義 ---


const EFFECT_IDS = {
    BACK_DANCE: (sourceId: string, targetId: string) => `trailblazer-harmony-backdance-${sourceId}-${targetId}`,
    TECHNIQUE: (sourceId: string, targetId: string) => `trailblazer-harmony-technique-${sourceId}-${targetId}`,
    E2_ERR: (sourceId: string) => `trailblazer-harmony-e2-err-${sourceId}`,
    E4_AURA: (sourceId: string) => `trailblazer-harmony-e4-aura-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2: 'trailblazer-harmony-trace-a2', // ダンス・フォー・ミー
    A4: 'trailblazer-harmony-trace-a4', // 流れに身を任せて
    A6: 'trailblazer-harmony-trace-a6', // シアターハット
} as const;

// --- E3/E5パターン (標準) ---
// E3: スキルLv+2, 天賦Lv+2
// E5: 必殺技Lv+2, 通常Lv+1

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // スキル倍率: E3でLv12に上昇
    skillDamage: {
        10: 0.50,
        12: 0.55
    } as Record<number, number>,
    // 必殺技撃破特効: E5でLv12に上昇
    ultBreakEff: {
        10: 0.30,
        12: 0.33
    } as Record<number, number>,
    // 天賦EP回復: E3でLv12に上昇
    talentEpRecovery: {
        10: 10.0,
        12: 11.0
    } as Record<number, number>,
};

// 通常攻撃
const BASIC_MULT_LV6 = 1.00;
const BASIC_MULT_LV7 = 1.10;
const BASIC_TOUGHNESS = 10;
const BASIC_EP = 20;

// スキル
const SKILL_MAIN_TOUGHNESS = 10;
const SKILL_BOUNCE_TOUGHNESS = 5;
const SKILL_EP = 30; // 基本EP (6 × 5ヒット)
const SKILL_E6_EXTRA_EP = 12; // E6追加EP (6 × 2ヒット)

// 必殺技
const ULT_DURATION = 3;
const ULT_EP = 5;

// 秘技
const TECHNIQUE_BREAK_EFF = 0.30;
const TECHNIQUE_DURATION = 2;

// 軌跡
const TRACE_A2_SUPER_BREAK_BONUSES = [0.20, 0.30, 0.40, 0.50, 0.60]; // 敵5/4/3/2/1体時
const TRACE_A6_DELAY = 0.30; // 30%遅延

// 星魂
const E1_SP_RECOVERY = 1;
const E2_ERR_BOOST = 0.25;
const E2_DURATION = 3;
const E4_BREAK_EFF_RATIO = 0.15; // 開拓者の撃破特効15%分

export const trailblazerHarmony: Character = {
    id: 'trailblazer-harmony',
    name: '調和開拓者',
    path: 'Harmony',
    element: 'Imaginary',
    rarity: 5,
    maxEnergy: 140,
    baseStats: {
        hp: 1086,
        atk: 446,
        def: 679,
        spd: 105,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'trailblazer-harmony-basic',
            name: '揺らめく礼儀',
            type: 'Basic ATK',
            description: '指定した敵単体に開拓者の攻撃力100%分の虚数属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: BASIC_MULT_LV6, toughnessReduction: BASIC_TOUGHNESS }],
            },
            energyGain: BASIC_EP,
        },
        skill: {
            id: 'trailblazer-harmony-skill',
            name: '間奏曲が降らす雨',
            type: 'Skill',
            description: '指定した敵単体に虚数属性ダメージを与え、さらに4ヒットする。各ヒットはランダムな敵単体に虚数属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'bounce',
                scaling: 'atk',
                hits: [
                    // A4軌跡適用済み: 1ヒット目の削靭値+100%（10 → 20）
                    { multiplier: 0.50, toughnessReduction: SKILL_MAIN_TOUGHNESS * 2 },
                    { multiplier: 0.50, toughnessReduction: SKILL_BOUNCE_TOUGHNESS },
                    { multiplier: 0.50, toughnessReduction: SKILL_BOUNCE_TOUGHNESS },
                    { multiplier: 0.50, toughnessReduction: SKILL_BOUNCE_TOUGHNESS },
                    { multiplier: 0.50, toughnessReduction: SKILL_BOUNCE_TOUGHNESS },
                ],
            },
            energyGain: SKILL_EP,
        },
        ultimate: {
            id: 'trailblazer-harmony-ultimate',
            name: '賑やかなパレード',
            type: 'Ultimate',
            description: '味方全体に「バックダンス」を付与する。3ターン継続。',
            targetType: 'self',
            energyGain: ULT_EP,
            effects: [], // Handled by Handler
        },
        talent: {
            id: 'trailblazer-harmony-talent',
            name: 'エアリアルステップ',
            type: 'Talent',
            description: '敵が弱点撃破された時、開拓者はEPを10回復する。',
        },
        technique: {
            id: 'trailblazer-harmony-technique',
            name: '即興！独奏団',
            type: 'Technique',
            description: '戦闘開始時、味方全体の撃破特効+30%、2ターン継続。',
        },
    },
    traces: [
        {
            id: TRACE_IDS.A2,
            name: 'ダンス・フォー・ミー',
            type: 'Bonus Ability',
            description: 'フィールド上の敵の数が5以上/4/3/2/1の場合、「バックダンス」が触発する超撃破ダメージ+20%/30%/40%/50%/60%。',
        },
        {
            id: TRACE_IDS.A4,
            name: '流れに身を任せて',
            type: 'Bonus Ability',
            description: '戦闘スキルを発動する時、1ヒット目の削靭値+100%。',
        },
        {
            id: TRACE_IDS.A6,
            name: 'シアターハット',
            type: 'Bonus Ability',
            description: '味方が敵を弱点撃破した後、さらに敵の行動順を30%遅延させる。',
        },
        {
            id: 'trailblazer-harmony-stat-break',
            name: '撃破強化',
            type: 'Stat Bonus',
            description: '撃破特効+37.3%',
            stat: 'break_effect',
            value: 0.373,
        },
        {
            id: 'trailblazer-harmony-stat-imaginary',
            name: 'ダメージ強化・虚数',
            type: 'Stat Bonus',
            description: '虚数属性ダメージ+14.4%',
            stat: 'imaginary_dmg_boost',
            value: 0.144,
        },
        {
            id: 'trailblazer-harmony-stat-effect-res',
            name: '効果抵抗強化',
            type: 'Stat Bonus',
            description: '効果抵抗+10%',
            stat: 'effect_res',
            value: 0.10,
        },
    ],
    eidolons: {
        e1: {
            level: 1,
            name: '最高の観客席',
            description: '初めて戦闘スキルを発動した後、SPを1回復する。',
        },
        e2: {
            level: 2,
            name: '牢を打ち破る虹',
            description: '戦闘開始時、開拓者のEP回復効率+25%、3ターン継続。',
        },
        e3: {
            level: 3,
            name: '休止符の療養院',
            description: '戦闘スキルLv.+2、天賦Lv.+2',
            abilityModifiers: [],
        },
        e4: {
            level: 4,
            name: 'ハトを隠す冠',
            description: '開拓者がフィールド上にいる時、自身以外の味方の撃破特効を、開拓者の撃破特効15%分アップする。',
        },
        e5: {
            level: 5,
            name: '古き旋律を抱く詩篇',
            description: '必殺技Lv.+2、通常攻撃Lv.+1',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: BASIC_MULT_LV7 },
            ],
        },
        e6: {
            level: 6,
            name: '明日スポットライトの下で',
            description: '戦闘スキルのヒット数+2。',
        },
    },
    defaultConfig: {
        lightConeId: 'chasing-the-wind',
        superimposition: 1, // 3* LC usually S5, but spec doesn't say. I'll stick to 5 for 3*. Wait, usually default is 1 or 5. I'll use 5 for 3* LC.
        // Actually, I'll use 5 because it's easy to get.
        relicSetId: 'watchmaker_master_of_dream_machinations',
        ornamentSetId: 'talia_kingdom_of_banditry',
        mainStats: {
            body: 'hp_pct',
            feet: 'spd',
            sphere: 'def_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'break_effect', value: 0.80 },
            { stat: 'spd', value: 20 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    },
};

// ===============================
// ヘルパー関数
// ===============================

/**
 * 「バックダンス」エフェクトを作成
 */
function createBackDanceEffect(sourceId: string, targetId: string, duration: number, eidolonLevel: number): IEffect {
    // E5で必殺技Lv+2 → Lv12の撃破特効値を使用
    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
    const breakEffValue = getLeveledValue(ABILITY_VALUES.ultBreakEff, ultLevel);

    return {
        id: EFFECT_IDS.BACK_DANCE(sourceId, targetId),
        name: 'バックダンス',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED', // 開拓者のターン開始時にカウントダウン
        duration: duration,
        modifiers: [{
            source: 'バックダンス',
            target: 'break_effect' as StatKey,
            type: 'add',
            value: breakEffValue,
        }],
        tags: ['BACKDANCE_SUPER_BREAK'], // 超撃破変換用タグ
        onApply: (t, s) => s,
        onRemove: (t, s) => s,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

/**
 * 秘技の撃破特効バフを作成
 */
function createTechniqueBreakEffBuff(sourceId: string, targetId: string, duration: number): IEffect {
    return {
        id: EFFECT_IDS.TECHNIQUE(sourceId, targetId),
        name: '即興！独奏団',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: duration,
        modifiers: [{
            source: '即興！独奏団',
            target: 'break_effect' as StatKey,
            type: 'add',
            value: TECHNIQUE_BREAK_EFF,
        }],
        onApply: (t, s) => s,
        onRemove: (t, s) => s,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

/**
 * E2のEP回復効率バフを作成
 */
function createE2ErrBuff(sourceId: string, duration: number): IEffect {
    return {
        id: EFFECT_IDS.E2_ERR(sourceId),
        name: '牢を打ち破る虹',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: duration,
        modifiers: [{
            source: '牢を打ち破る虹',
            target: 'energy_regen_rate' as StatKey,
            type: 'add',
            value: E2_ERR_BOOST,
        }],
        onApply: (t, s) => s,
        onRemove: (t, s) => s,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

// ===============================
// イベントハンドラー関数
// ===============================

/**
 * 戦闘開始時の処理
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

    // 秘技: 味方全体に撃破特効+30%（2ターン）
    const useTechnique = unit.config?.useTechnique !== false;
    if (useTechnique) {
        const allies = newState.registry.getAliveAllies();
        for (const ally of allies) {
            const techBuff = createTechniqueBreakEffBuff(sourceUnitId, ally.id, TECHNIQUE_DURATION);
            newState = addEffect(newState, ally.id, techBuff);
        }

        // ログ記録
        newState = {
            ...newState,
            log: [...newState.log, {
                characterName: unit.name,
                actionTime: newState.time,
                actionType: '秘技',
                skillPointsAfterAction: newState.skillPoints,
                damageDealt: 0,
                healingDone: 0,
                shieldApplied: 0,
                currentEp: unit.ep,
                details: '秘技: 味方全体の撃破特効+30%（2ターン）'
            }]
        };
    }

    // E2: 戦闘開始時にEP回復効率+25%（3ターン）
    if (eidolonLevel >= 2) {
        const e2Buff = createE2ErrBuff(sourceUnitId, E2_DURATION);
        newState = addEffect(newState, sourceUnitId, e2Buff);
    }

    // E4: 味方の撃破特効を開拓者の15%分アップ（オーラ）
    if (eidolonLevel >= 4) {
        const trailblazerUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (trailblazerUnit) {
            const breakEffBonus = (trailblazerUnit.stats.break_effect || 0) * E4_BREAK_EFF_RATIO;
            const e4Aura: IAura = {
                id: EFFECT_IDS.E4_AURA(sourceUnitId),
                name: 'ハトを隠す冠 (E4)',
                sourceUnitId: createUnitId(sourceUnitId),
                target: 'other_allies',
                modifiers: [{
                    target: 'break_effect' as StatKey,
                    value: breakEffBonus,
                    type: 'add',
                    source: 'ハトを隠す冠'
                }]
            };
            newState = addAura(newState, e4Aura);
        }
    }

    return newState;
};

/**
 * スキル使用時の処理
 */
const onSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number,
    isFirstSkill: { value: boolean }
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;

    // E1: 初回スキル使用時にSP+1
    if (eidolonLevel >= 1 && isFirstSkill.value) {
        newState = addSkillPoints(newState, E1_SP_RECOVERY);
        isFirstSkill.value = false;
    }

    // E6: 追加2ヒット分のEP（12EP）
    if (eidolonLevel >= 6) {
        newState = addEnergyToUnit(newState, sourceUnitId, SKILL_E6_EXTRA_EP, 0, false, {
            sourceId: sourceUnitId,
            publishEventFn: publishEvent
        });
    }

    return newState;
};

/**
 * 必殺技使用時の処理
 */
const onUltimateUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;

    // 味方全体に「バックダンス」を付与
    const allies = newState.registry.getAliveAllies();
    for (const ally of allies) {
        // 既存のバックダンスを削除
        const existingBuff = ally.effects.find(e => e.name === 'バックダンス' && e.sourceUnitId === sourceUnitId);
        if (existingBuff) {
            newState = removeEffect(newState, ally.id, existingBuff.id);
        }
        // 新しいバックダンスを付与
        const backDance = createBackDanceEffect(sourceUnitId, ally.id, ULT_DURATION, eidolonLevel);
        newState = addEffect(newState, ally.id, backDance);
    }

    return newState;
};

/**
 * 弱点撃破時の処理
 */
const onWeaknessBreak = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 天賦: 敵弱点撃破時にEP回復
    // E3で天賦Lv+2 → Lv12のEP回復値を使用
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const epRecovery = getLeveledValue(ABILITY_VALUES.talentEpRecovery, talentLevel);
    newState = addEnergyToUnit(newState, sourceUnitId, epRecovery, 0, false, {
        sourceId: sourceUnitId,
        publishEventFn: publishEvent
    });

    // A6軌跡: 弱点撃破後、敵の行動順を追加で30%遅延
    const traceA6 = unit.traces?.find(t => t.id === TRACE_IDS.A6);
    if (traceA6 && event.targetId) {
        newState = delayAction(newState, event.targetId, TRACE_A6_DELAY, 'percent');
    }

    return newState;
};

/**
 * ダメージ発生時の処理（バックダンス超撃破ダメージ）
 * Replaced onAttack with onDamageDealt to access toughness reduction
 */
const onDamageDealt = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string
): GameState => {
    // 自身の超撃破ダメージなど、再帰呼び出しを防ぐ
    if (event.damageType === '超撃破ダメージ' || event.damageType === 'super_break') return state;

    // 対象が存在し、敵であること
    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || !target.isEnemy) return state;

    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker) return state;

    // 開拓者自身の取得
    const trailblazer = state.registry.get(createUnitId(sourceUnitId));
    if (!trailblazer) return state;

    // 攻撃者がバックダンスを持っているか確認
    const backDance = attacker.effects.find(e => e.name === 'バックダンス' && e.sourceUnitId === sourceUnitId);
    if (!backDance) return state;

    // 弱点撃破状態の敵に攻撃した場合のみ発動 (Toughness <= 0 or isBroken flag?)
    // Note: toughness can be 0 but check state logic. Usually toughness <= 0 implies broken.
    if (target.toughness > 0) return state;

    // 削靭値の計算 (hitDetailsから合計)
    if (!event.hitDetails || event.hitDetails.length === 0) return state;
    const toughnessReduction = event.hitDetails.reduce((sum, hit) => sum + (hit.toughnessReduction || 0), 0);

    // 削靭値がない攻撃では超撃破は発生しない
    if (toughnessReduction <= 0) return state;

    let newState = state;

    // A2軌跡: 敵数に応じた超撃破ダメージボーナス
    const traceA2 = trailblazer.traces?.find(t => t.id === TRACE_IDS.A2);
    let superBreakBonus = 0;
    if (traceA2) {
        const enemyCount = newState.registry.getAliveEnemies().length;
        if (enemyCount >= 5) superBreakBonus = TRACE_A2_SUPER_BREAK_BONUSES[0];
        else if (enemyCount === 4) superBreakBonus = TRACE_A2_SUPER_BREAK_BONUSES[1];
        else if (enemyCount === 3) superBreakBonus = TRACE_A2_SUPER_BREAK_BONUSES[2];
        else if (enemyCount === 2) superBreakBonus = TRACE_A2_SUPER_BREAK_BONUSES[3];
        else superBreakBonus = TRACE_A2_SUPER_BREAK_BONUSES[4];
    }

    // バックダンス超撃破ダメージ計算
    // 攻撃者のステータスを一時的に変更して超撃破計算
    const tempAttacker: Unit = {
        ...attacker,
        stats: {
            ...attacker.stats,
            super_break_dmg_boost: 1.0 + superBreakBonus, // バックダンス超撃破 = 100% + A2ボーナス
        }
    };

    const superBreakDamageResult = calculateSuperBreakDamageWithBreakdown(tempAttacker, target, toughnessReduction, {});

    if (superBreakDamageResult.damage > 0) {
        const result = applyUnifiedDamage(
            newState,
            attacker,
            target,
            superBreakDamageResult.damage,
            {
                damageType: '超撃破ダメージ',
                details: 'バックダンス: 超撃破ダメージ',
                skipLog: true,
                events: [],
                additionalDamageEntry: {
                    source: attacker.name,
                    name: 'バックダンス超撃破',
                    damageType: 'super_break',
                    isCrit: superBreakDamageResult.isCrit,
                    breakdownMultipliers: superBreakDamageResult.breakdownMultipliers
                }
            }
        );
        newState = result.state;
    }

    return newState;
};

// ===============================
// ハンドラーファクトリ
// ===============================

export const trailblazerHarmonyHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    // E1用: 初回スキルフラグ
    const isFirstSkill = { value: true };

    return {
        handlerMetadata: {
            id: `trailblazer-harmony-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_WEAKNESS_BREAK',
                'ON_DAMAGE_DEALT',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_SKILL_USED') {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel, isFirstSkill);
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_WEAKNESS_BREAK') {
                return onWeaknessBreak(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event as DamageDealtEvent, state, sourceUnitId);
            }

            return state;
        }
    };
};
