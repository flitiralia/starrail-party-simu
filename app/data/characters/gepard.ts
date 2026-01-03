import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, GeneralEvent, EffectEvent } from '../../simulator/engine/types';
import { CrowdControlEffect } from '../../simulator/effect/types';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyShield, advanceAction } from '../../simulator/engine/utils';
import { calculateAbilityLevel, getLeveledValue } from '../../simulator/utils/abilityLevel';
import { checkDebuffSuccess } from '../../simulator/engine/dispatcher';
import { isNewCrowdControlEffect } from '../../simulator/effect/utils';

// --- 定数定義 ---
const CHARACTER_ID = 'gepard';

// エフェクトID
const EFFECT_IDS = {
    SHIELD: (sourceId: string, targetId: string) => `${CHARACTER_ID}-shield-${sourceId}-${targetId}`,
    TECHNIQUE_SHIELD: (sourceId: string, targetId: string) => `${CHARACTER_ID}-tech-shield-${sourceId}-${targetId}`,
    FREEZE: (sourceId: string, targetId: string) => `${CHARACTER_ID}-freeze-${sourceId}-${targetId}`,
    TALENT_USED: (unitId: string) => `${CHARACTER_ID}-talent-used-${unitId}`,
    A6_ATK_BOOST: (unitId: string) => `${CHARACTER_ID}-a6-atk-${unitId}`,
    E2_SLOW: (sourceId: string, targetId: string) => `${CHARACTER_ID}-e2-slow-${sourceId}-${targetId}`,
    E4_EFFECT_RES: (sourceId: string, targetId: string) => `${CHARACTER_ID}-e4-res-${sourceId}-${targetId}`,
} as const;

// 軌跡ID
const TRACE_IDS = {
    A2_AGGRO: `${CHARACTER_ID}-trace-a2`,        // 剛直
    A4_EP_RESTORE: `${CHARACTER_ID}-trace-a4`,  // 統率
    A6_ATK_BOOST: `${CHARACTER_ID}-trace-a6`,   // 戦意
} as const;

// --- アビリティ倍率 (デフォルトレベル基準) ---

// 通常攻撃 (Lv6: 100%, Lv7: 110%) - ATKスケーリング
const BASIC_MULT = 1.00;

// 戦闘スキル (Lv10: 200%, Lv12: 220%) - ATKスケーリング
const SKILL_MULT = 2.00;
const SKILL_FREEZE_BASE_CHANCE = 0.65;
const SKILL_FREEZE_DURATION = 1;

// 必殺技 (Lv10: DEF 45%+600, Lv12: DEF 48%+667.5) - バリア
const ULT_SHIELD_DURATION = 3;

// 秘技バリア (DEF 24%+150, 2ターン)
const TECHNIQUE_SHIELD_MULT = 0.24;
const TECHNIQUE_SHIELD_FLAT = 150;
const TECHNIQUE_SHIELD_DURATION = 2;

// 天賦 (Lv10: HP 50%, Lv12: HP 55%)
const TALENT_HEAL_MULT = 0.50;

// A6: 攻撃力 = 防御力 35%
const A6_DEF_TO_ATK_RATIO = 0.35;

// E1: 凍結確率+35%
const E1_FREEZE_BONUS = 0.35;

// E2: 速度-20%
const E2_SLOW_AMOUNT = 0.20;
const E2_SLOW_DURATION = 1;

// E4: 効果抵抗+20%
const E4_EFFECT_RES = 0.20;

// E6: 追加HP回復 50%
const E6_ADDITIONAL_HEAL = 0.50;

// --- E3/E5パターン ---
const ABILITY_VALUES = {
    // 通常攻撃: E5でLv7に上昇
    basicMult: {
        6: { mult: 1.00 },
        7: { mult: 1.10 }
    } as Record<number, { mult: number }>,
    // スキルダメージ: E5でLv12に上昇
    skillDmg: {
        10: { mult: 2.00, freezeMult: 0.60 },
        12: { mult: 2.20, freezeMult: 0.66 }
    } as Record<number, { mult: number; freezeMult: number }>,
    // 必殺技シールド: E3でLv12に上昇
    ultShield: {
        10: { mult: 0.45, flat: 600 },
        12: { mult: 0.48, flat: 667.5 }
    } as Record<number, { mult: number; flat: number }>,
    // 天賦回復: E3でLv12に上昇
    talentHeal: {
        10: { mult: 0.50 },
        12: { mult: 0.55 }
    } as Record<number, { mult: number }>,
};

// --- キャラクター定義 ---
export const gepard: Character = {
    id: CHARACTER_ID,
    name: 'ジェパード',
    path: 'Preservation',
    element: 'Ice',
    rarity: 5,
    maxEnergy: 100,
    baseStats: {
        hp: 1397,
        atk: 543,
        def: 654,
        spd: 92,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 150  // 存護
    },

    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: '一意の拳',
            type: 'Basic ATK',
            description: '指定した敵単体にジェパードの攻撃力100%分の氷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: BASIC_MULT / 2, toughnessReduction: 5 },
                    { multiplier: BASIC_MULT / 2, toughnessReduction: 5 }
                ],
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: `${CHARACTER_ID}-skill`,
            name: '震撼の一撃',
            type: 'Skill',
            description: '指定した敵単体にジェパードの攻撃力200%分の氷属性ダメージを与え、65%の基礎確率で攻撃を受けた敵を凍結状態にする、1ターン継続。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: SKILL_MULT / 3, toughnessReduction: 7 },
                    { multiplier: SKILL_MULT / 3, toughnessReduction: 7 },
                    { multiplier: SKILL_MULT / 3, toughnessReduction: 6 }
                ],
            },
            energyGain: 30,
            targetType: 'single_enemy',
        },

        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: '永屹の壁',
            type: 'Ultimate',
            description: '味方全体にジェパードの防御力45%+600の耐久値を持つバリアを付与する、3ターン継続。',
            energyGain: 5,
            targetType: 'all_allies',
            shield: {
                multiplier: 0.45,
                flat: 600,
                scaling: 'def',
                duration: ULT_SHIELD_DURATION
            }
        },

        talent: {
            id: `${CHARACTER_ID}-talent`,
            name: '不屈の体躯',
            type: 'Talent',
            description: 'ジェパードはHPが0になる攻撃を受けても戦闘不能状態にならず、HPを最大HP50%分回復する。この効果は一度の戦闘で1回まで発動できる。',
        },

        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: '仁心の証',
            type: 'Technique',
            description: '秘技を使用した後、次の戦闘開始時、味方全体にジェパードの防御力24%+150の耐久値を持つバリアを付与する、2ターン継続。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_AGGRO,
            name: '剛直',
            type: 'Bonus Ability',
            description: 'ジェパードが敵に攻撃される確率がアップする。'
        },
        {
            id: TRACE_IDS.A4_EP_RESTORE,
            name: '統率',
            type: 'Bonus Ability',
            description: '「不屈の体躯」を発動した後、ジェパードのEPを100％まで回復する。'
        },
        {
            id: TRACE_IDS.A6_ATK_BOOST,
            name: '戦意',
            type: 'Bonus Ability',
            description: 'ジェパードの攻撃力が自身の防御力35%分アップ、ターンが回ってくるたびに更新される。'
        },
        {
            id: `${CHARACTER_ID}-stat-ice`,
            name: '氷属性ダメージ強化',
            type: 'Stat Bonus',
            description: '氷属性ダメージ+22.4%',
            stat: 'ice_dmg_boost' as StatKey,
            value: 0.224
        },
        {
            id: `${CHARACTER_ID}-stat-res`,
            name: '効果抵抗',
            type: 'Stat Bonus',
            description: '効果抵抗+18.0%',
            stat: 'effect_res' as StatKey,
            value: 0.18
        },
        {
            id: `${CHARACTER_ID}-stat-def`,
            name: '防御力強化',
            type: 'Stat Bonus',
            description: '防御力+12.5%',
            stat: 'def_pct' as StatKey,
            value: 0.125
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '忠実篤厚',
            description: '戦闘スキルを発動した時、攻撃を受けた敵が凍結状態になる基礎確率＋35%。'
        },
        e2: {
            level: 2,
            name: '余寒',
            description: '戦闘スキルで敵に与えた凍結状態が解除された後、敵の速度-20%、1ターン継続。'
        },
        e3: {
            level: 3,
            name: '永劫不落',
            description: '必殺技のLv＋2、最大Lv15まで。天賦のLv＋2、最大Lv15まで。',
            abilityModifiers: [
                { abilityName: 'ultimate', param: 'shield.multiplier', value: 0.48 },
                { abilityName: 'ultimate', param: 'shield.flat', value: 667.5 },
            ]
        },
        e4: {
            level: 4,
            name: '確固たる意志',
            description: 'ジェパードがフィールド上にいる時、味方全体の効果抵抗＋20%。'
        },
        e5: {
            level: 5,
            name: '寒鉄の如く拳',
            description: '戦闘スキルのLv＋2、最大Lv15まで。通常攻撃のLv＋1、最大Lv10まで。',
            abilityModifiers: [
                { abilityName: 'skill', param: 'damage.hits.0.multiplier', value: 2.20 / 3 },
                { abilityName: 'skill', param: 'damage.hits.1.multiplier', value: 2.20 / 3 },
                { abilityName: 'skill', param: 'damage.hits.2.multiplier', value: 2.20 / 3 },
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 / 2 },
                { abilityName: 'basic', param: 'damage.hits.1.multiplier', value: 1.10 / 2 },
            ]
        },
        e6: {
            level: 6,
            name: '不屈の決意',
            description: '天賦発動時、ジェパードが即座に行動し、HPの回復量がさらに自身の最大HP50%分アップする。'
        }
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'moment-of-victory',
        superimposition: 1,
        relicSetId: 'knight-of-purity-palace',
        ornamentSetId: 'broken-keel',
        mainStats: {
            body: 'def_pct',
            feet: 'spd',
            sphere: 'def_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'def_pct', value: 0.30 },
            { stat: 'spd', value: 10 },
            { stat: 'hp_pct', value: 0.15 },
            { stat: 'effect_res', value: 0.10 },
        ],
        rotationMode: 'spam_skill',
        spamSkillTriggerSp: 4,
        ultStrategy: 'immediate',
    }
};

// --- ヘルパー関数 ---

/**
 * 天賦が既に発動済みかチェック
 */
function isTalentUsed(state: GameState, unitId: string): boolean {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return true;
    return unit.effects.some(e => e.id === EFFECT_IDS.TALENT_USED(unitId));
}

/**
 * 天賦発動済みフラグを設定
 */
function setTalentUsed(state: GameState, unitId: string): GameState {
    const talentUsedEffect: IEffect = {
        id: EFFECT_IDS.TALENT_USED(unitId),
        name: '天賦発動済み',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };
    return addEffect(state, unitId, talentUsedEffect);
}

/**
 * 凍結エフェクトを作成
 * 
 * 凍結は行動制限デバフ（Crowd Control）として扱う。
 * 解除時に付加ダメージ（ATK参照）が発生し、次の行動順が50%早まる。
 * 
 * @param sourceId ジェパードのUnit ID
 * @param targetId 凍結を付与する対象のUnit ID
 * @param freezeDamageMult 凍結付加ダメージのATK倍率
 * @param eidolonLevel 星魂レベル（E2以上で追加効果）
 * @returns 統一されたCrowdControlEffect
 */
function createFreezeEffect(
    sourceId: string,
    targetId: string,
    freezeDamageMult: number,
    eidolonLevel: number
): CrowdControlEffect {
    return {
        id: EFFECT_IDS.FREEZE(sourceId, targetId),
        name: '凍結',
        category: 'DEBUFF',
        type: 'CrowdControl',
        ccType: 'Freeze',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: SKILL_FREEZE_DURATION,
        tags: ['FREEZE', 'CROWD_CONTROL'],

        // ダメージ計算（キャラクター由来）
        damageCalculation: 'multiplier',
        scaling: 'atk',
        multiplier: freezeDamageMult,

        // 凍結解除後の行動順加速（汎用的な凍結仕様として50%）
        avAdvanceOnRemoval: 0.5,

        // E2判定用フラグを汎用データストアに保存
        miscData: {
            gepardE2Active: eidolonLevel >= 2
        },

        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };
}

// --- イベントハンドラー関数 ---

/**
 * 戦闘開始時
 */
const onBattleStart = (
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 秘技: 戦闘開始時に味方全体にバリア付与 (DEF 24%+150, 2ターン)
    const allies = newState.registry.getAliveAllies();
    for (const ally of allies) {
        newState = applyShield(
            newState,
            sourceUnitId,
            ally.id,
            { scaling: 'def', multiplier: TECHNIQUE_SHIELD_MULT, flat: TECHNIQUE_SHIELD_FLAT },
            TECHNIQUE_SHIELD_DURATION,
            'TURN_END_BASED',
            '仁心の証',
            EFFECT_IDS.TECHNIQUE_SHIELD(sourceUnitId, ally.id),
            true
        );
    }

    // E4: 味方全体に効果抵抗+20%
    if (eidolonLevel >= 4) {
        for (const ally of allies) {
            const e4Effect: IEffect = {
                id: EFFECT_IDS.E4_EFFECT_RES(sourceUnitId, ally.id),
                name: 'E4 効果抵抗',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [
                    { target: 'effect_res' as StatKey, value: E4_EFFECT_RES, type: 'add' as const, source: 'E4: 確固たる意志' }
                ],
                tags: ['E4_EFFECT_RES'],
                onApply: (t: Unit, s: GameState) => s,
                onRemove: (t: Unit, s: GameState) => s
            };
            newState = addEffect(newState, ally.id, e4Effect);
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

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // A6: 攻撃力を防御力35%分アップ（毎ターン更新）
    const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6_ATK_BOOST);
    if (hasA6) {
        // 既存のA6バフを削除
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.A6_ATK_BOOST(sourceUnitId));

        // 現在の防御力を取得
        const currentUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (currentUnit) {
            const atkBoost = currentUnit.stats.def * A6_DEF_TO_ATK_RATIO;

            const a6Effect: IEffect = {
                id: EFFECT_IDS.A6_ATK_BOOST(sourceUnitId),
                name: 'A6: 戦意',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [
                    { target: 'atk' as StatKey, value: atkBoost, type: 'add' as const, source: 'A6: 戦意' }
                ],
                tags: ['A6_ATK_BOOST'],
                onApply: (t: Unit, s: GameState) => s,
                onRemove: (t: Unit, s: GameState) => s
            };
            newState = addEffect(newState, sourceUnitId, a6Effect);
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
    if (!event.targetId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    const target = state.registry.get(createUnitId(event.targetId));
    if (!source || !target) return state;

    let newState = state;

    // 凍結付与
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const skillValues = getLeveledValue(ABILITY_VALUES.skillDmg, skillLevel);

    // 凍結確率計算
    let freezeChance = SKILL_FREEZE_BASE_CHANCE;
    if (eidolonLevel >= 1) {
        freezeChance += E1_FREEZE_BONUS;  // E1: +35%
    }

    // デバフ成功判定
    if (checkDebuffSuccess(source, target, freezeChance, 'Freeze')) {
        const freezeEffect = createFreezeEffect(
            sourceUnitId,
            event.targetId,
            skillValues.freezeMult,
            eidolonLevel
        );
        newState = addEffect(newState, event.targetId, freezeEffect);
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

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // シールド値計算
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const ultValues = getLeveledValue(ABILITY_VALUES.ultShield, ultLevel);

    // 味方全体にバリア付与
    const allies = newState.registry.getAliveAllies();
    for (const ally of allies) {
        newState = applyShield(
            newState,
            sourceUnitId,
            ally.id,
            { scaling: 'def', multiplier: ultValues.mult, flat: ultValues.flat },
            ULT_SHIELD_DURATION,
            'TURN_END_BASED',
            '永屹の壁',
            EFFECT_IDS.SHIELD(sourceUnitId, ally.id),
            true
        );
    }

    return newState;
};

/**
 * HP0時の処理（天賦: 不屈の体躯）
 */
const onBeforeDeath = (
    event: { targetId?: string; preventDeath?: boolean; healAmount?: number },
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 対象がジェパード自身かチェック
    if (event.targetId !== sourceUnitId) return state;

    // 既に天賦使用済みかチェック
    if (isTalentUsed(state, sourceUnitId)) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // 天賦回復量計算
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const talentValues = getLeveledValue(ABILITY_VALUES.talentHeal, talentLevel);

    let healPercent = talentValues.mult;
    if (eidolonLevel >= 6) {
        healPercent += E6_ADDITIONAL_HEAL;  // E6: +50%
    }

    const healAmount = unit.stats.hp * healPercent;

    // 死亡を防止
    event.preventDeath = true;
    event.healAmount = healAmount;

    // 天賦使用済みフラグを設定
    let newState = setTalentUsed(state, sourceUnitId);

    // A4: EP100%回復
    const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_EP_RESTORE);
    if (hasA4) {
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                ...u,
                ep: gepard.maxEnergy
            }))
        };
    }

    // E6: 即座に行動
    if (eidolonLevel >= 6) {
        newState = advanceAction(newState, sourceUnitId, 1.0, 'percent');
    }

    return newState;
};

/**
 * エフェクト削除時の処理
 * 
 * E2: ジェパードが付与した凍結が解除された時、対象の速度-20%（1ターン）
 * 
 * @param event エフェクト削除イベント
 * @param state 現在のゲーム状態
 * @param sourceUnitId ジェパードのUnit ID
 * @param eidolonLevel 星魂レベル
 * @returns 更新されたゲーム状態
 */
const onEffectRemoved = (
    event: EffectEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (eidolonLevel < 2) return state;

    const effect = event.effect;
    if (!effect) return state;

    // CrowdControlEffect型の凍結かどうかチェック
    if (isNewCrowdControlEffect(effect) && effect.ccType === 'Freeze') {
        // ジェパード由来かつE2フラグがあるかチェック
        if (effect.sourceUnitId === sourceUnitId && effect.miscData?.gepardE2Active) {
            const targetId = event.targetId;
            if (!targetId) return state;

            // 速度-20%デバフを付与
            const e2SlowEffect: IEffect = {
                id: EFFECT_IDS.E2_SLOW(sourceUnitId, targetId),
                name: 'E2: 余寒',
                category: 'DEBUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_START_BASED',
                duration: E2_SLOW_DURATION,
                modifiers: [
                    { target: 'spd' as StatKey, value: -E2_SLOW_AMOUNT, type: 'pct' as const, source: 'E2: 余寒' }
                ],
                tags: ['SLOW', 'E2_SLOW'],
                onApply: (t: Unit, s: GameState) => s,
                onRemove: (t: Unit, s: GameState) => s
            };

            return addEffect(state, targetId, e2SlowEffect);
        }
    }

    return state;
};

// --- ハンドラーファクトリ ---
export const gepardHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
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
                'ON_ULTIMATE_USED',
                'ON_BEFORE_DEATH',
                'ON_EFFECT_REMOVED',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            // ジェパードが存在するか確認
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit || unit.hp <= 0) {
                return state;
            }

            switch (event.type) {
                case 'ON_BATTLE_START':
                    return onBattleStart(state, sourceUnitId, eidolonLevel);
                case 'ON_TURN_START':
                    return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_SKILL_USED':
                    return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_ULTIMATE_USED':
                    return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_BEFORE_DEATH':
                    return onBeforeDeath(
                        event as { targetId?: string; preventDeath?: boolean; healAmount?: number },
                        state,
                        sourceUnitId,
                        eidolonLevel
                    );
                case 'ON_EFFECT_REMOVED':
                    return onEffectRemoved(event as EffectEvent, state, sourceUnitId, eidolonLevel);
                default:
                    return state;
            }
        }
    };
};
