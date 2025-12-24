import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, GeneralEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { advanceAction, cleanse } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent, applyUnifiedDamage, appendAdditionalDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';


// --- 定数定義 ---
const CHARACTER_ID = 'bronya';

const EFFECT_IDS = {
    SKILL_DMG_BOOST: (sourceId: string, targetId: string) => `bronya-skill-dmg-boost-${sourceId}-${targetId}`,
    ULT_ATK_BOOST: (sourceId: string) => `bronya-ult-atk-boost-${sourceId}`,
    ULT_CRIT_DMG_BOOST: (sourceId: string) => `bronya-ult-crit-dmg-boost-${sourceId}`,
    TECHNIQUE_ATK_BOOST: (sourceId: string) => `bronya-technique-atk-boost-${sourceId}`,
    A4_DEF_BOOST: (sourceId: string) => `bronya-a4-def-boost-${sourceId}`,
    A6_DMG_BOOST: (sourceId: string) => `bronya-a6-dmg-boost-${sourceId}`,
    E1_COOLDOWN: (sourceId: string) => `bronya-e1-cooldown-${sourceId}`,
    E2_MARKER: (sourceId: string, targetId: string) => `bronya-e2-marker-${sourceId}-${targetId}`,
    E2_SPD_BOOST: (sourceId: string, targetId: string) => `bronya-e2-spd-boost-${sourceId}-${targetId}`,
    E4_COUNTER: (sourceId: string) => `bronya-e4-counter-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2_CRIT_RATE: 'bronya-trace-a2',      // 号令
    A4_DEF_BOOST: 'bronya-trace-a4',      // 陣地
    A6_DMG_BOOST: 'bronya-trace-a6',      // 軍勢
} as const;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 通常攻撃: E5でLv7に上昇
    basicMult: {
        6: 1.00,
        7: 1.10
    } as Record<number, number>,
    // スキル与ダメージ: E5でLv12に上昇
    skillDmgBoost: {
        10: 0.66,
        12: 0.726
    } as Record<number, number>,
    // 必殺技攻撃力: E3でLv12に上昇
    ultAtkBoost: {
        10: 0.55,
        12: 0.594
    } as Record<number, number>,
    // 必殺技会心ダメージ倍率: E3でLv12に上昇
    ultCritDmgMult: {
        10: 0.16,
        12: 0.168
    } as Record<number, number>,
    // 必殺技会心ダメージ固定値: E3でLv12に上昇
    ultCritDmgFlat: {
        10: 0.20,
        12: 0.216
    } as Record<number, number>,
    // 天賦行動短縮: E3でLv12に上昇
    talentAdvance: {
        10: 0.30,
        12: 0.33
    } as Record<number, number>,
};

// 通常攻撃
const BASIC_TOUGHNESS = 10;
const BASIC_EP = 20;

// スキル
const SKILL_DURATION = 1;
const SKILL_EP = 30;
const SKILL_ADVANCE_PERCENT = 1.00; // 100%短縮 = 即時行動

// 必殺技
const ULT_DURATION = 2;
const ULT_EP = 5;

// 秘技
const TECHNIQUE_ATK_BOOST = 0.15;
const TECHNIQUE_DURATION = 2;

// 軌跡
const A4_DEF_BOOST = 0.20;
const A4_DURATION = 2;
const A6_DMG_BOOST = 0.10;

// 星魂
const E1_SP_RECOVERY = 1;
const E1_CHANCE = 0.50;
const E2_SPD_BOOST = 0.30;
const E2_DURATION = 1;
const E4_DMG_MULT = 0.80;
const E4_TOUGHNESS = 10;
const E4_EP = 5;
const E6_DURATION_BONUS = 1;

// ヘイト
const AGGRO = 100; // 調和標準

export const bronya: Character = {
    id: CHARACTER_ID,
    name: 'ブローニャ',
    path: 'Harmony',
    element: 'Wind',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1241,
        atk: 582,
        def: 533,
        spd: 99,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: AGGRO
    },

    abilities: {
        basic: {
            id: 'bronya-basic',
            name: '疾風の弾丸',
            type: 'Basic ATK',
            description: '指定した敵単体にブローニャの攻撃力100%分の風属性ダメージを与える。',
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
            id: 'bronya-skill',
            name: '作戦再展開',
            type: 'Skill',
            description: '指定した味方単体のデバフを1つ解除し、その味方を即座に行動させ、与ダメージ+66%、1ターン継続。自身に対してこのスキルを発動した時、即時行動の効果は発動しない。',
            targetType: 'ally',
            manualTargeting: true,
            energyGain: SKILL_EP,
            spCost: 1,
        },

        ultimate: {
            id: 'bronya-ultimate',
            name: 'ベロブルグ行進曲',
            type: 'Ultimate',
            description: '味方全体の攻撃力+55%、会心ダメージがブローニャの会心ダメージの16%+20%アップする、2ターン継続。',
            targetType: 'all_allies',
            energyGain: ULT_EP,
        },

        talent: {
            id: 'bronya-talent',
            name: '先人一歩',
            type: 'Talent',
            description: '通常攻撃を行った後、ブローニャの行動順が30%早まる。',
            energyGain: 0,
        },

        technique: {
            id: 'bronya-technique',
            name: '旗の下で',
            type: 'Technique',
            description: '秘技を使用した後、次の戦闘開始時、味方全体の攻撃力+15%、2ターン継続。',
        },
    },

    traces: [
        {
            id: TRACE_IDS.A2_CRIT_RATE,
            name: '号令',
            type: 'Bonus Ability',
            description: '通常攻撃の会心率が100%まで上がる。'
        },
        {
            id: TRACE_IDS.A4_DEF_BOOST,
            name: '陣地',
            type: 'Bonus Ability',
            description: '戦闘開始時、味方全体の防御力+20%、2ターン継続。'
        },
        {
            id: TRACE_IDS.A6_DMG_BOOST,
            name: '軍勢',
            type: 'Bonus Ability',
            description: 'ブローニャがフィールド上にいる時、味方全体の与ダメージ+10%。'
        },
        {
            id: 'bronya-stat-wind-dmg',
            name: '風属性ダメージ',
            type: 'Stat Bonus',
            description: '風属性ダメージ+22.4%',
            stat: 'wind_dmg_boost' as StatKey,
            value: 0.224
        },
        {
            id: 'bronya-stat-crit-dmg',
            name: '会心ダメージ',
            type: 'Stat Bonus',
            description: '会心ダメージ+24.0%',
            stat: 'crit_dmg' as StatKey,
            value: 0.24
        },
        {
            id: 'bronya-stat-effect-res',
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
            name: '英気を養う',
            description: '戦闘スキルを発動した時、50%の固定確率でSPを1回復する、クールタイムは1ターン。'
        },
        e2: {
            level: 2,
            name: '急行軍',
            description: '戦闘スキルを発動した時、指定された味方は行動した後に速度+30%、1ターン継続。'
        },
        e3: {
            level: 3,
            name: '一斉射撃',
            description: '必殺技のLv.+2、天賦のLv.+2',
            // abilityModifiers は実行時の倍率計算で対応
        },
        e4: {
            level: 4,
            name: '不意打ち',
            description: '他の味方が、弱点が風属性の敵に通常攻撃を行った後、ブローニャは追加攻撃を行い、その敵に通常攻撃のダメージ80%分の風属性ダメージを与える、この効果はターンが回ってくるたびに1回発動できる。'
        },
        e5: {
            level: 5,
            name: '向かう所敵なし',
            description: '戦闘スキルのLv.+2、通常攻撃のLv.+1',
            abilityModifiers: [
                // 通常攻撃Lv7: 110%
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 },
            ]
        },
        e6: {
            level: 6,
            name: '気勢貫天',
            description: '戦闘スキルが付与する、指定した味方の与ダメージアップ効果の継続時間+1ターン。'
        }
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'but-the-battle-isnt-over',
        superimposition: 1,
        relicSetId: 'messenger_traversing_hackerspace',
        ornamentSetId: 'broken_keel',
        mainStats: {
            body: 'crit_dmg',
            feet: 'spd',
            sphere: 'def_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'crit_dmg', value: 0.80 },
            { stat: 'spd', value: 20 },
            { stat: 'effect_res', value: 0.20 },
            { stat: 'def_pct', value: 0.20 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    },
};

// --- ヘルパー関数 ---

/**
 * スキルの与ダメージバフエフェクトを作成
 */
function createSkillDmgBoostEffect(
    sourceId: string,
    targetId: string,
    duration: number,
    eidolonLevel: number
): IEffect {
    // E5でスキルLv+2 → Lv12の値を使用
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const dmgBoost = getLeveledValue(ABILITY_VALUES.skillDmgBoost, skillLevel);

    return {
        id: EFFECT_IDS.SKILL_DMG_BOOST(sourceId, targetId),
        name: '作戦再展開',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: [{
            source: '作戦再展開',
            target: 'all_type_dmg_boost',
            type: 'add',
            value: dmgBoost,
        }],
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

/**
 * 必殺技の攻撃力バフエフェクトを作成
 */
function createUltimateAtkBoostEffect(
    sourceId: string,
    duration: number,
    eidolonLevel: number
): IEffect {
    // E3で必殺技Lv+2 → Lv12の値を使用
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const atkBoost = getLeveledValue(ABILITY_VALUES.ultAtkBoost, ultLevel);

    return {
        id: EFFECT_IDS.ULT_ATK_BOOST(sourceId),
        name: 'ベロブルグ行進曲',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: [{
            source: 'ベロブルグ行進曲',
            target: 'atk_pct',
            type: 'add',
            value: atkBoost,
        }],
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

/**
 * 必殺技の会心ダメージバフエフェクトを作成
 * ブローニャの会心ダメージに基づいて計算
 */
function createUltimateCritDmgBoostEffect(
    sourceId: string,
    bronyaStats: { crit_dmg: number },
    duration: number,
    eidolonLevel: number
): IEffect {
    // E3で必殺技Lv+2 → Lv12の値を使用
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const critDmgMult = getLeveledValue(ABILITY_VALUES.ultCritDmgMult, ultLevel);
    const critDmgFlat = getLeveledValue(ABILITY_VALUES.ultCritDmgFlat, ultLevel);

    // ブローニャの会心ダメージを基に計算
    const critDmgBoost = bronyaStats.crit_dmg * critDmgMult + critDmgFlat;

    return {
        id: EFFECT_IDS.ULT_CRIT_DMG_BOOST(sourceId),
        name: 'ベロブルグ行進曲',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: [{
            source: 'ベロブルグ行進曲',
            target: 'crit_dmg',
            type: 'add',
            value: critDmgBoost,
        }],
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

/**
 * 秘技の攻撃力バフエフェクトを作成
 */
function createTechniqueAtkBoostEffect(sourceId: string, duration: number): IEffect {
    return {
        id: EFFECT_IDS.TECHNIQUE_ATK_BOOST(sourceId),
        name: '旗の下で',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: [{
            source: '旗の下で',
            target: 'atk_pct',
            type: 'add',
            value: TECHNIQUE_ATK_BOOST,
        }],
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

/**
 * A4の防御力バフエフェクトを作成
 */
function createA4DefBoostEffect(sourceId: string, duration: number): IEffect {
    return {
        id: EFFECT_IDS.A4_DEF_BOOST(sourceId),
        name: '陣地',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: [{
            source: '陣地',
            target: 'def_pct',
            type: 'add',
            value: A4_DEF_BOOST,
        }],
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

/**
 * E2の速度バフエフェクトを作成
 */
function createE2SpdBoostEffect(
    sourceId: string,
    targetId: string,
    duration: number
): IEffect {
    return {
        id: EFFECT_IDS.E2_SPD_BOOST(sourceId, targetId),
        name: '急行軍',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: [{
            source: '急行軍',
            target: 'spd_pct',
            type: 'add',
            value: E2_SPD_BOOST,
        }],
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

// --- ハンドラー関数 ---

/**
 * 戦闘開始時
 */
const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 秘技使用フラグを確認
    const useTechnique = unit.config?.useTechnique !== false;
    if (useTechnique) {
        // 秘技「旗の下で」: 味方全体に攻撃力+15%バフを付与
        const allies = newState.registry.toArray().filter(u => !u.isEnemy && u.hp > 0);
        const techBuff = createTechniqueAtkBoostEffect(sourceUnitId, TECHNIQUE_DURATION);

        for (const ally of allies) {
            newState = addEffect(newState, ally.id, techBuff);
        }
    }

    // A4軌跡: 戦闘開始時、味方全体の防御力+20%
    const traceA4 = unit.traces?.find(t => t.id === TRACE_IDS.A4_DEF_BOOST);
    if (traceA4) {
        const allies = newState.registry.toArray().filter(u => !u.isEnemy && u.hp > 0);
        const defBuff = createA4DefBoostEffect(sourceUnitId, A4_DURATION);

        for (const ally of allies) {
            newState = addEffect(newState, ally.id, defBuff);
        }
    }

    // A6軌跡: 味方全体の与ダメージ+10%（オーラ）
    const traceA6 = unit.traces?.find(t => t.id === TRACE_IDS.A6_DMG_BOOST);
    if (traceA6) {
        const auraEffect: IEffect = {
            id: EFFECT_IDS.A6_DMG_BOOST(sourceUnitId),
            name: '軍勢',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            tags: ['AURA'],
            modifiers: [{
                source: '軍勢',
                target: 'all_type_dmg_boost',
                type: 'add',
                value: A6_DMG_BOOST,
            }],
            apply: (t, s) => s,
            remove: (t, s) => s,
        };
        newState = addEffect(newState, sourceUnitId, auraEffect);
    }

    return newState;
};

/**
 * ターン開始時
 */
const onTurnStart = (event: GeneralEvent, state: GameState, sourceUnitId: string): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // E1のクールダウンをリセット
    const cooldown = unit.effects.find(e => e.id === EFFECT_IDS.E1_COOLDOWN(sourceUnitId));
    if (cooldown) {
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.E1_COOLDOWN(sourceUnitId));
    }

    // E4のターンごとのカウンターをリセット
    const counter = unit.effects.find(e => e.id === EFFECT_IDS.E4_COUNTER(sourceUnitId));
    if (counter) {
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.E4_COUNTER(sourceUnitId));
    }

    return newState;
};

/**
 * 通常攻撃使用時
 */
const onBasicAttack = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 天賦: 通常攻撃後、行動順を30%/33%短縮
    const talentLevel = eidolonLevel >= 3 ? 12 : 10;
    const advancePercent = getLeveledValue(ABILITY_VALUES.talentAdvance, talentLevel);
    newState = advanceAction(newState, sourceUnitId, advancePercent, 'percent');

    return newState;
};

/**
 * スキル使用時
 */
const onSkill = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // ターゲット取得
    let targetId = event.targetId;
    if (!targetId) {
        targetId = unit.config?.skillTargetId;
    }
    if (!targetId) {
        console.log('[Bronya Handler] No skill target specified');
        return newState;
    }

    const target = newState.registry.get(createUnitId(targetId));
    if (!target || target.isEnemy) return newState;

    // 1. デバフを1つ解除
    newState = cleanse(newState, targetId, 1);

    // 2. 与ダメージバフを付与
    // E6: 継続時間+1ターン
    const duration = eidolonLevel >= 6 ? SKILL_DURATION + E6_DURATION_BONUS : SKILL_DURATION;
    const skillBuff = createSkillDmgBoostEffect(sourceUnitId, targetId, duration, eidolonLevel);
    newState = addEffect(newState, targetId, skillBuff);

    // 3. E1: 50%の確率でSP+1（クールダウン1ターン）
    if (eidolonLevel >= 1) {
        const hasCooldown = unit.effects.some(e => e.id === EFFECT_IDS.E1_COOLDOWN(sourceUnitId));
        if (!hasCooldown) {
            // 50%の固定確率
            if (Math.random() < E1_CHANCE) {
                newState = {
                    ...newState,
                    skillPoints: Math.min(newState.skillPoints + E1_SP_RECOVERY, 5)
                };
            }
            // クールダウンマーカーを付与
            newState = addEffect(newState, sourceUnitId, {
                id: EFFECT_IDS.E1_COOLDOWN(sourceUnitId),
                name: 'E1 Cooldown',
                category: 'STATUS',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                apply: (t, s) => s,
                remove: (t, s) => s,
            });
        }
    }

    // 4. E2: 行動後に速度バフを付与するためのマーカー
    if (eidolonLevel >= 2 && targetId !== sourceUnitId) {
        newState = addEffect(newState, targetId, {
            id: EFFECT_IDS.E2_MARKER(sourceUnitId, targetId),
            name: 'E2 Marker',
            category: 'STATUS',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            apply: (t, s) => s,
            remove: (t, s) => s,
        });
    }

    // 5. 即座に行動させる（自分自身でない場合のみ）
    if (targetId !== sourceUnitId) {
        newState = advanceAction(newState, targetId, SKILL_ADVANCE_PERCENT, 'percent');
    }

    return newState;
};

/**
 * 必殺技使用時
 */
const onUltimate = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 味方全体に攻撃力バフと会心ダメージバフを付与
    const allies = newState.registry.toArray().filter(u => !u.isEnemy && u.hp > 0);

    const atkBuff = createUltimateAtkBoostEffect(sourceUnitId, ULT_DURATION, eidolonLevel);
    const critDmgBuff = createUltimateCritDmgBoostEffect(
        sourceUnitId,
        { crit_dmg: unit.stats.crit_dmg },
        ULT_DURATION,
        eidolonLevel
    );

    for (const ally of allies) {
        newState = addEffect(newState, ally.id, atkBuff);
        newState = addEffect(newState, ally.id, critDmgBuff);
    }

    return newState;
};

/**
 * 行動完了時（E2用）
 */
const onActionComplete = (event: ActionEvent, state: GameState, sourceUnitId: string): GameState => {
    if (!event.sourceId) return state;
    if (event.sourceId === sourceUnitId) return state; // 自分自身は除外

    const target = state.registry.get(createUnitId(event.sourceId));
    if (!target || target.isEnemy) return state;

    let newState = state;

    // E2マーカーがあるかチェック
    const marker = target.effects.find(e => e.id === EFFECT_IDS.E2_MARKER(sourceUnitId, event.sourceId));
    if (marker) {
        // 速度バフを付与
        const spdBuff = createE2SpdBoostEffect(sourceUnitId, event.sourceId, E2_DURATION);
        newState = addEffect(newState, event.sourceId, spdBuff);

        // マーカーを削除
        newState = removeEffect(newState, event.sourceId, EFFECT_IDS.E2_MARKER(sourceUnitId, event.sourceId));
    }

    return newState;
};

/**
 * 通常攻撃時（E4追加攻撃用、他の味方の通常攻撃を検知）
 */
const onBasicAttackForE4 = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (eidolonLevel < 4) return state;
    if (event.sourceId === sourceUnitId) return state; // 自分自身は除外
    if (!event.targetId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker || attacker.isEnemy) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || !target.isEnemy) return state;

    let newState = state;

    // 既にこのターンに追加攻撃を発動したかチェック
    const hasTriggered = unit.effects.some(e => e.id === EFFECT_IDS.E4_COUNTER(sourceUnitId));
    if (hasTriggered) return newState;

    // 敵が風弱点を持っているかチェック
    const hasWindWeakness = target.weaknesses?.has('Wind');
    if (!hasWindWeakness) return newState;

    // 追加攻撃を発動
    const basicMult = eidolonLevel >= 5 ? 1.10 : 1.00;
    const followUpMult = basicMult * E4_DMG_MULT;

    // ダメージ計算
    const baseDamage = unit.stats.atk * followUpMult;
    const dmgCalcResult = calculateNormalAdditionalDamageWithCritInfo(
        unit,
        target,
        baseDamage
    );

    // ダメージ適用
    const result = applyUnifiedDamage(
        newState,
        unit,
        target,
        dmgCalcResult.damage,
        {
            damageType: 'FOLLOW_UP_DAMAGE',
            details: 'E4 不意打ち',
            skipLog: true,
            isCrit: dmgCalcResult.isCrit,
            breakdownMultipliers: dmgCalcResult.breakdownMultipliers
        }
    );
    newState = result.state;

    // ログに追加
    newState = appendAdditionalDamage(newState, {
        source: unit.name,
        name: 'E4 不意打ち',
        damage: result.totalDamage,
        target: target.name,
        damageType: 'additional',
        isCrit: result.isCrit || false,
        breakdownMultipliers: result.breakdownMultipliers
    });

    // EP回復
    newState = addEnergyToUnit(newState, sourceUnitId, E4_EP, 0, false, {
        sourceId: sourceUnitId,
        publishEventFn: publishEvent
    });

    // カウンターマーカーを付与
    newState = addEffect(newState, sourceUnitId, {
        id: EFFECT_IDS.E4_COUNTER(sourceUnitId),
        name: 'E4 Counter',
        category: 'STATUS',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        apply: (t, s) => s,
        remove: (t, s) => s,
    });

    return newState;
};

/**
 * ダメージ計算前（A2用）
 */
const onBeforeDamageCalculation = (event: IEvent, state: GameState, sourceUnitId: string): GameState => {
    // 攻撃者がブローニャの場合
    if (event.sourceId === sourceUnitId && event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
        const damageEvent = event as BeforeDamageCalcEvent;

        // 通常攻撃の場合のみ（abilityIdで判定）
        if (damageEvent.abilityId === 'bronya-basic') {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            // A2軌跡: 会心率100%
            const traceA2 = unit.traces?.find(t => t.id === TRACE_IDS.A2_CRIT_RATE);
            if (traceA2) {
                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        critRate: 1.00 // 100%
                    }
                };
            }
        }
    }

    return state;
};

// --- ハンドラーファクトリ ---

export const bronyaHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `bronya-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_BASIC_ATTACK',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_ACTION_COMPLETE',
                'ON_BEFORE_DAMAGE_CALCULATION',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId);
            }

            if (event.type === 'ON_TURN_START') {
                return onTurnStart(event as GeneralEvent, state, sourceUnitId);
            }

            if (event.type === 'ON_BASIC_ATTACK') {
                // 自分の通常攻撃時: 天賦の行動短縮
                const basicResult = onBasicAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                // E4: 他の味方の通常攻撃時の追加攻撃
                return onBasicAttackForE4(event as ActionEvent, basicResult, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_SKILL_USED') {
                return onSkill(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimate(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ACTION_COMPLETE') {
                return onActionComplete(event as ActionEvent, state, sourceUnitId);
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event, state, sourceUnitId);
            }

            return state;
        }
    };
};
