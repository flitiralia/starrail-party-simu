import { Character, StatKey, SimulationLogEntry } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { advanceAction, cleanse } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';
import { addSkillPoints } from '../../simulator/effect/relicEffectHelpers';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';


// --- 定数定義 ---
const CHARACTER_ID = 'sunday';

const EFFECT_IDS = {
    BLESSED: 'sunday-blessed-one',
    SKILL_BOOST: 'sunday-skill-dmg-boost',
    TALENT_CRIT: 'sunday-talent-crit',
    E1_DEF_IGNORE: 'sunday-e1-def-ignore',
    TECH_DMG_BOOST: 'sunday-technique-dmg-boost',
    TECH_READY: 'sunday-technique-ready',
    E2_USED: 'sunday-e2-used',
};

const TRACE_IDS = {
    A2: 'sunday-trace-a2',
    A4: 'sunday-trace-a4',
    A6: 'sunday-trace-a6',
};

const TAGS = {
    BLESSED: 'SUNDAY_BLESSED',
};

// --- E3/E5パターン (標準) ---
// E3: 必殺技Lv+2, 通常Lv+1
// E5: スキルLv+2, 天賦Lv+2

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // スキル与ダメージアップ: E5でLv12に上昇
    skillDmgBoost: {
        10: 0.30,
        12: 0.33
    } as Record<number, number>,
    // スキル召喚物ボーナス: E5でLv12に上昇
    skillSummonBonus: {
        10: 0.50,
        12: 0.55
    } as Record<number, number>,
    // 必殺技会心ダメージ倍率: E3でLv12に上昇
    ultCritDmgMult: {
        10: 0.30,
        12: 0.336
    } as Record<number, number>,
    // 必殺技会心ダメージ固定値: E3でLv12に上昇
    ultCritDmgFlat: {
        10: 0.12,
        12: 0.128
    } as Record<number, number>,
    // 天賦会心率: E5でLv12に上昇
    talentCritRate: {
        10: 0.20,
        12: 0.22
    } as Record<number, number>,
};

// 通常攻撃
const BASIC_MULT_LV6 = 1.00;
const BASIC_MULT_LV7 = 1.10;
const BASIC_TOUGHNESS = 10;
const BASIC_EP = 20;

// スキル
const SKILL_DURATION = 2;
const SKILL_EP = 30;
const SKILL_ADVANCE_PERCENT = 1.00; // 100%短縮 = 即時行動

// 必殺技
const ULT_EP_RECOVERY_PERCENT = 0.20; // 最大EP20%
const ULT_BLESSED_DURATION = 3;
const ULT_EP = 5;

// 天賦
const TALENT_CRIT_DURATION = 3;

// 秘技
const TECHNIQUE_DMG_BOOST = 0.50;
const TECHNIQUE_DURATION = 2;

// 軌跡
const TRACE_A2_MIN_EP = 40;
const TRACE_A4_START_EP = 25;

// 星魂
const E1_CHARACTER_DEF_IGNORE = 0.16;
const E1_SUMMON_DEF_IGNORE = 0.40;
const E1_DURATION = 2;
const E2_FIRST_ULT_SP = 2;
const E2_BLESSED_DMG_BOOST = 0.30;
const E4_TURN_START_EP = 8;
const E6_TALENT_MAX_STACKS = 3;
const E6_TALENT_DURATION_BONUS = 1;
const E6_CRIT_TO_CRIT_DMG_RATIO = 0.02; // 1%超過ごとに2%会心ダメージ

// ===============================
// キャラクター定義
// ===============================

export const sunday: Character = {
    id: CHARACTER_ID,
    name: 'サンデー',
    path: 'Harmony',
    element: 'Imaginary',
    rarity: 5,
    maxEnergy: 130,
    baseStats: {
        hp: 1241,
        atk: 640,
        def: 533,
        spd: 96,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'sunday-basic',
            name: '光を纏う告諭',
            type: 'Basic ATK',
            description: '指定した敵単体にサンデーの攻撃力100%分の虚数属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: BASIC_MULT_LV6, toughnessReduction: BASIC_TOUGHNESS }],
            },
            energyGain: BASIC_EP,
        },
        skill: {
            id: 'sunday-skill',
            name: '紙と式典の賜物',
            type: 'Skill',
            description: '指定した味方キャラ単体とその召喚物を即座に行動させ、与ダメージ+30%、2ターン継続。',
            targetType: 'ally',
            manualTargeting: true, // ターゲット指定が必要
            energyGain: SKILL_EP,
            effects: [], // Handled by Handler
        },
        ultimate: {
            id: 'sunday-ultimate',
            name: '抱擁と傷痕の賛歌',
            type: 'Ultimate',
            description: '指定した味方のEPを回復し、「祝福されし者」状態を付与。会心ダメージアップ、3ターン継続。',
            targetType: 'ally',
            manualTargeting: true, // ターゲット指定が必要
            energyGain: ULT_EP,
            effects: [], // Handled by Handler
        },
        talent: {
            id: 'sunday-talent',
            name: '肉体の告解',
            type: 'Talent',
            description: 'スキル発動時、ターゲットの会心率+20%、3ターン継続。',
            targetType: 'ally',
        },
        technique: {
            id: 'sunday-technique',
            name: '栄光の秘儀',
            type: 'Technique',
            description: '次の戦闘で初めてスキル発動時、ターゲットの与ダメージ+50%、2ターン継続。',
        },
    },
    traces: [
        {
            id: TRACE_IDS.A2,
            name: '主日の渇望',
            type: 'Bonus Ability',
            description: '必殺技で回復するEPが40未満の場合、40まで引き上げる。',
        },
        {
            id: TRACE_IDS.A4,
            name: '崇高なる浄化',
            type: 'Bonus Ability',
            description: '戦闘開始時、サンデーのEPを25回復する。',
        },
        {
            id: TRACE_IDS.A6,
            name: '掌上の安息',
            type: 'Bonus Ability',
            description: 'スキル発動時、ターゲットのデバフを1つ解除する。',
        },
        {
            id: 'sunday-stat-critdmg',
            name: '会心ダメージ強化',
            type: 'Stat Bonus',
            description: '会心ダメージ+37.3%',
            stat: 'crit_dmg',
            value: 0.373,
        },
        {
            id: 'sunday-stat-effres',
            name: '効果抵抗強化',
            type: 'Stat Bonus',
            description: '効果抵抗+18%',
            stat: 'effect_res',
            value: 0.18,
        },
        {
            id: 'sunday-stat-def',
            name: '防御強化',
            type: 'Stat Bonus',
            description: '防御力+12.5%',
            stat: 'def_pct',
            value: 0.125,
        },
    ],
    eidolons: {
        e1: {
            level: 1,
            name: '千年の静寂の果て',
            description: 'スキル発動時、キャラは防御16%無視、召喚物は防御40%無視（2ターン）。',
        },
        e2: {
            level: 2,
            name: '瑕瑾を補う信仰',
            description: '初回必殺技後SP+2。「祝福されし者」の与ダメージ+30%。',
        },
        e3: {
            level: 3,
            name: '静謐な茨の隠れ家',
            description: '必殺技Lv+2、通常攻撃Lv+1',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: BASIC_MULT_LV7 },
            ],
        },
        e4: {
            level: 4,
            name: '彫像の序言',
            description: 'ターン開始時EP+8。',
        },
        e5: {
            level: 5,
            name: '銀湾に漂う紙の船',
            description: 'スキルLv+2、天賦Lv+2',
            abilityModifiers: [],
        },
        e6: {
            level: 6,
            name: '群星喧騒の黎明',
            description: '天賦効果が最大3層累積可能、継続時間+1ターン。必殺技発動時にも天賦効果付与。会心率100%超過1%ごとに会心ダメージ+2%。',
        },
    },
    defaultConfig: {
        lightConeId: 'a-grounded-ascent',
        superimposition: 1,
        relicSetId: 'sacerdos-relived-ordeal',
        ornamentSetId: 'lushaka-the-sunken-seas',
        mainStats: {
            body: 'crit_dmg',
            feet: 'spd',
            sphere: 'def_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'spd', value: 20 },
            { stat: 'crit_dmg', value: 0.80 },
            { stat: 'effect_res', value: 0.20 },
            { stat: 'def_pct', value: 0.20 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    },
};

// ===============================
// ヘルパー関数
// ===============================

/**
 * 「祝福されし者」エフェクトを作成（必殺技用）
 * 会心ダメージアップ効果。サンデーのターン開始時に持続時間が減少する特殊仕様。
 */
function createBlessedOneEffect(
    sourceId: string,
    targetId: string,
    sundayStats: { crit_dmg: number | undefined },
    duration: number,
    eidolonLevel: number
): IEffect {
    // E3で必殺技Lv+2 → Lv12の値を使用
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const critDmgMult = getLeveledValue(ABILITY_VALUES.ultCritDmgMult, ultLevel);
    const critDmgFlat = getLeveledValue(ABILITY_VALUES.ultCritDmgFlat, ultLevel);

    // サンデーの会心ダメージを基に計算
    const critDmgBoost = (sundayStats.crit_dmg ?? 0.5) * critDmgMult + critDmgFlat;

    // E2: 「祝福されし者」の与ダメージ+30%
    const e2DmgBoost = eidolonLevel >= 2 ? E2_BLESSED_DMG_BOOST : 0;

    const effect: IEffect = {
        id: `${EFFECT_IDS.BLESSED}-${sourceId}-${targetId}`,
        name: '祝福されし者',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT', // 手動で減少させるためPERMANENT
        duration: duration,
        tags: [TAGS.BLESSED], // サンデーのターン開始時に減少させるためのタグ
        modifiers: [
            {
                source: '祝福されし者',
                target: 'crit_dmg' as StatKey,
                type: 'add' as const,
                value: critDmgBoost,
            }
        ]
    };

    // E2: 与ダメージ+30%
    if (e2DmgBoost > 0) {
        if (!effect.modifiers) effect.modifiers = [];
        effect.modifiers.push({
            source: '祝福されし者 (E2)',
            target: 'all_type_dmg_boost' as StatKey,
            type: 'add' as const,
            value: e2DmgBoost,
        });
    }


    return effect;
}

/**
 * スキルの与ダメージアップエフェクトを作成
 */
function createSkillDmgBoostEffect(
    sourceId: string,
    targetId: string,
    hasSummon: boolean,
    duration: number,
    eidolonLevel: number
): IEffect {
    // E5でスキルLv+2 → Lv12の値を使用
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const baseDmgBoost = getLeveledValue(ABILITY_VALUES.skillDmgBoost, skillLevel);
    const summonBonus = hasSummon ? getLeveledValue(ABILITY_VALUES.skillSummonBonus, skillLevel) : 0;
    const totalDmgBoost = baseDmgBoost + summonBonus;

    return {
        id: `${EFFECT_IDS.SKILL_BOOST}-${sourceId}-${targetId}`,
        name: '紙と式典の賜物',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: [{
            source: '紙と式典の賜物',
            target: 'all_type_dmg_boost',
            type: 'add',
            value: totalDmgBoost,
        }],


    };
}

/**
 * 天賦の会心率アップエフェクトを作成
 */
function createTalentCritRateEffect(
    sourceId: string,
    targetId: string,
    duration: number,
    eidolonLevel: number,
    existingStacks: number = 0
): IEffect {
    // E5で天賦Lv+2 → Lv12の値を使用
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const critRateBoost = getLeveledValue(ABILITY_VALUES.talentCritRate, talentLevel);

    // E6: 最大3層まで累積可能
    const maxStacks = eidolonLevel >= 6 ? E6_TALENT_MAX_STACKS : 1;
    const newStacks = Math.min(existingStacks + 1, maxStacks);

    // E6: 継続時間+1ターン
    const actualDuration = eidolonLevel >= 6 ? duration + E6_TALENT_DURATION_BONUS : duration;

    return {
        id: `${EFFECT_IDS.TALENT_CRIT}-${sourceId}-${targetId}`,
        name: '肉体の告解',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: actualDuration,
        skipFirstTurnDecrement: true,
        stackCount: newStacks,
        maxStacks: maxStacks,
        modifiers: [{
            source: '肉体の告解',
            target: 'crit_rate',
            type: 'add',
            value: critRateBoost, // stackCountにより自動的に乗算される
        }],


    };
}

/**
 * E1の防御無視エフェクトを作成
 */
function createE1DefIgnoreEffect(
    sourceId: string,
    targetId: string,
    isSummon: boolean,
    duration: number
): IEffect {
    const defIgnoreValue = isSummon ? E1_SUMMON_DEF_IGNORE : E1_CHARACTER_DEF_IGNORE;

    return {
        id: `${EFFECT_IDS.E1_DEF_IGNORE}-${sourceId}-${targetId}`,
        name: '千年の静寂の果て',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        onApply: (target, state) => {
            const newModifiers = [...target.modifiers, {
                source: '千年の静寂の果て',
                target: 'def_ignore' as StatKey,
                type: 'add' as const,
                value: defIgnoreValue,
            }];
            return {
                ...state,
                registry: state.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
            };
        },
        onRemove: (target, state) => {
            const newModifiers = target.modifiers.filter(m => m.source !== '千年の静寂の果て');
            return {
                ...state,
                registry: state.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
            };
        },


    };
}

/**
 * 秘技の与ダメージアップエフェクトを作成
 */
function createTechniqueDmgBoostEffect(
    sourceId: string,
    targetId: string,
    duration: number
): IEffect {
    return {
        id: `${EFFECT_IDS.TECH_DMG_BOOST}-${sourceId}-${targetId}`,
        name: '栄光の秘儀',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: duration,
        skipFirstTurnDecrement: true,
        modifiers: [{
            source: '栄光の秘儀',
            target: 'all_type_dmg_boost',
            type: 'add',
            value: TECHNIQUE_DMG_BOOST,
        }],


    };
}

// ===============================
// ハンドラーファクトリ
// ===============================

const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string): GameState => {
    console.log('[Sunday Handler] ON_BATTLE_START event received');
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // 秘技使用フラグを確認
    const useTechnique = unit.config?.useTechnique !== false;
    if (useTechnique) {
        // 秘技準備完了マーカーを付与
        newState = addEffect(newState, sourceUnitId, {
            id: `${EFFECT_IDS.TECH_READY}-${sourceUnitId}`,
            name: 'Technique Ready',
            category: 'STATUS',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,


        });
    }

    // A4 軌跡: 戦闘開始時にEP+25
    const traceA4 = unit.traces?.find(t => t.id === TRACE_IDS.A4);
    if (traceA4) {
        newState = addEnergyToUnit(newState, sourceUnitId, 0, TRACE_A4_START_EP, false, {
            sourceId: sourceUnitId,
            publishEventFn: publishEvent
        });

        // ログ記録
        newState = {
            ...newState,
            log: [...newState.log, {
                characterName: unit.name,
                actionTime: newState.time,
                actionType: '軌跡',
                skillPointsAfterAction: newState.skillPoints,
                damageDealt: 0,
                healingDone: 0,
                shieldApplied: 0,
                currentEp: (newState.registry.get(createUnitId(sourceUnitId))?.ep || 0),
                details: '崇高なる浄化: EP+25'
            } as SimulationLogEntry]
        };
    }

    console.log('[Sunday Handler] Battle start effects applied');
    return newState;
};

const onTurnStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;

    // E4: ターン開始時EP+8
    if (eidolonLevel >= 4) {
        newState = addEnergyToUnit(newState, sourceUnitId, 0, E4_TURN_START_EP, false, {
            sourceId: sourceUnitId,
            publishEventFn: publishEvent
        });
    }

    // 「祝福されし者」の持続時間を減少（サンデーのターン開始時に減少）
    // 全ユニットの「祝福されし者」バフをチェック
    newState.registry.toArray().forEach((u: Unit) => {
        const blessedEffect = u.effects.find(e =>
            e.tags?.includes(TAGS.BLESSED) && e.sourceUnitId === sourceUnitId
        );
        if (blessedEffect && typeof blessedEffect.duration === 'number' && blessedEffect.duration > 0) {
            const newDuration = blessedEffect.duration - 1;
            if (newDuration <= 0) {
                // 持続時間が0になったら削除
                newState = removeEffect(newState, u.id, blessedEffect.id);
            } else {
                // 持続時間を更新
                const updatedEffect = { ...blessedEffect, duration: newDuration };
                newState = {
                    ...newState,
                    registry: newState.registry.update(u.id, unit => ({
                        ...unit,
                        effects: unit.effects.map(e =>
                            e.id === blessedEffect.id ? updatedEffect : e
                        )
                    }))
                };
            }
        }
    });

    return newState;
};

const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // ターゲットはイベントから取得、なければconfig.skillTargetIdを使用
    let targetId = event.targetId;
    if (!targetId) {
        targetId = unit.config?.skillTargetId;
    }
    if (!targetId) {
        console.log('[Sunday Handler] No skill target specified');
        return newState;
    }

    const target = newState.registry.get(createUnitId(targetId));
    if (!target || target.isEnemy) return newState;

    console.log(`[Sunday Handler] Skill used on ${target.name}`);

    // 1. ターゲットが召喚物を持っているかチェック
    const summons = newState.registry.toArray().filter((u: Unit) =>
        u.isSummon &&
        !u.isCountdown &&
        (u.ownerId === targetId || u.linkedUnitId === targetId) &&
        u.hp > 0
    );
    const hasSummon = summons.length > 0;

    // 2. 与ダメージアップバフを付与
    const skillBuff = createSkillDmgBoostEffect(
        sourceUnitId,
        targetId,
        hasSummon,
        SKILL_DURATION,
        eidolonLevel
    );
    newState = addEffect(newState, targetId, skillBuff);

    // 召喚物にも与ダメージバフを付与
    summons.forEach(summon => {
        const summonBuff = createSkillDmgBoostEffect(
            sourceUnitId,
            summon.id,
            true,
            SKILL_DURATION,
            eidolonLevel
        );
        newState = addEffect(newState, summon.id, summonBuff);
    });

    // 3. 天賦: 会心率アップを付与
    const existingTalentEffect = target.effects.find(e =>
        e.id === `${EFFECT_IDS.TALENT_CRIT}-${sourceUnitId}-${targetId}`
    );
    const existingStacks = existingTalentEffect?.stackCount || 0;
    const talentBuff = createTalentCritRateEffect(
        sourceUnitId,
        targetId,
        TALENT_CRIT_DURATION,
        eidolonLevel,
        existingStacks
    );
    newState = addEffect(newState, targetId, talentBuff);

    // 4. E1: 防御無視バフを付与
    if (eidolonLevel >= 1) {
        const e1Buff = createE1DefIgnoreEffect(sourceUnitId, targetId, false, E1_DURATION);
        newState = addEffect(newState, targetId, e1Buff);

        // 召喚物にも防御無視を付与（40%）
        summons.forEach(summon => {
            const summonE1Buff = createE1DefIgnoreEffect(sourceUnitId, summon.id, true, E1_DURATION);
            newState = addEffect(newState, summon.id, summonE1Buff);
        });
    }

    // 5. 秘技: 初回スキル時に与ダメージ+50%
    const techniqueReadyFunc = unit.effects.find(e => e.id === `${EFFECT_IDS.TECH_READY}-${sourceUnitId}`);
    if (techniqueReadyFunc) {
        const techBuff = createTechniqueDmgBoostEffect(sourceUnitId, targetId, TECHNIQUE_DURATION);
        newState = addEffect(newState, targetId, techBuff);
        // マーカー削除
        newState = removeEffect(newState, sourceUnitId, techniqueReadyFunc.id);
    }

    // 6. A6 軌跡: デバフを1つ解除
    const traceA6 = unit.traces?.find(t => t.id === TRACE_IDS.A6);
    if (traceA6) {
        newState = cleanse(newState, targetId, 1);
    }

    // 7. 「祝福されし者」状態の味方ならSP+1
    const freshTarget = newState.registry.get(createUnitId(targetId));
    const hasBlessed = freshTarget?.effects.some(e => e.tags?.includes(TAGS.BLESSED));
    if (hasBlessed) {
        newState = addSkillPoints(newState, 1);
    }

    // 8. 即時行動（調和キャラ以外）
    const isHarmony = freshTarget?.path === 'Harmony';

    if (!isHarmony) {
        newState = advanceAction(newState, targetId, SKILL_ADVANCE_PERCENT, 'percent');

        // 召喚物も即時行動
        summons.forEach(summon => {
            newState = advanceAction(newState, summon.id, SKILL_ADVANCE_PERCENT, 'percent');
        });
    }

    return newState;
};

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // ターゲットはイベントから取得、なければskillTargetIdを使用
    let targetId = event.targetId;
    if (!targetId) {
        targetId = unit.config?.skillTargetId;
    }
    if (!targetId) {
        console.log('[Sunday Handler] No ultimate target specified');
        return newState;
    }

    const targetUnit = newState.registry.get(createUnitId(targetId));
    if (!targetUnit || targetUnit.isEnemy) return newState;

    console.log(`[Sunday Handler] Ultimate used on ${targetUnit.name}`);
    // 1. EP回復（最大EP×20%、ERR非適用）
    let epRecovery = (targetUnit.stats.max_ep ?? 100) * ULT_EP_RECOVERY_PERCENT;

    // A2 軌跡: EP回復が40未満なら40まで引き上げ
    const traceA2 = unit.traces?.find(t => t.id === TRACE_IDS.A2);
    if (traceA2 && epRecovery < TRACE_A2_MIN_EP) {
        epRecovery = TRACE_A2_MIN_EP;
    }

    newState = addEnergyToUnit(newState, targetId, 0, epRecovery, false, {
        sourceId: sourceUnitId,
        publishEventFn: publishEvent
    });

    // 2. 「祝福されし者」を付与
    const freshSunday = newState.registry.get(createUnitId(sourceUnitId));
    if (freshSunday) {
        const blessedEffect = createBlessedOneEffect(
            sourceUnitId,
            targetId,
            { crit_dmg: freshSunday.stats.crit_dmg ?? 0.5 },
            ULT_BLESSED_DURATION,
            eidolonLevel
        );
        newState = addEffect(newState, targetId, blessedEffect);

        // 召喚物にも「祝福されし者」を付与
        const summons = newState.registry.toArray().filter((u: Unit) =>
            u.isSummon &&
            (u.ownerId === targetId || u.linkedUnitId === targetId) &&
            u.hp > 0
        );
        summons.forEach(summon => {
            const summonBlessed = createBlessedOneEffect(
                sourceUnitId,
                summon.id,
                { crit_dmg: freshSunday.stats.crit_dmg ?? 0.5 },
                ULT_BLESSED_DURATION,
                eidolonLevel
            );
            newState = addEffect(newState, summon.id, summonBlessed);
        });
    }

    // 3. E2: 初回必殺技後SP+2
    if (eidolonLevel >= 2) {
        const e2Marker = unit.effects.find(e => e.id === `${EFFECT_IDS.E2_USED}-${sourceUnitId}`);
        if (!e2Marker) {
            newState = addSkillPoints(newState, E2_FIRST_ULT_SP);
            newState = addEffect(newState, sourceUnitId, {
                id: `${EFFECT_IDS.E2_USED}-${sourceUnitId}`,
                name: 'E2 Used',
                category: 'STATUS',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,


            });
        }
    }

    // 4. E6: 必殺技発動時にも天賦効果を付与
    if (eidolonLevel >= 6) {
        const existingTalentEffect = targetUnit.effects.find(e =>
            e.id === `${EFFECT_IDS.TALENT_CRIT}-${sourceUnitId}-${targetId}`
        );
        const existingStacks = existingTalentEffect?.stackCount || 0;
        const talentBuff = createTalentCritRateEffect(
            sourceUnitId,
            targetId,
            TALENT_CRIT_DURATION,
            eidolonLevel,
            existingStacks
        );
        newState = addEffect(newState, targetId, talentBuff);
    }

    return newState;
};

const onBeforeDamageCalculation = (event: BeforeDamageCalcEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    if (eidolonLevel >= 6) {
        const attackerId = event.sourceId;
        if (!attackerId) return newState;

        const attacker = newState.registry.get(createUnitId(attackerId));
        if (!attacker || attacker.isEnemy) return newState;

        // 天賦バフを持っているかチェック
        const hasTalentBuff = attacker.effects.some(e =>
            e.id === `${EFFECT_IDS.TALENT_CRIT}-${sourceUnitId}-${attackerId}`
        );

        if (hasTalentBuff) {
            // 会心率が100%を超えている場合、超過分を会心ダメージに変換
            const critRate = attacker.stats.crit_rate ?? 0.05;
            if (critRate > 1.0) {
                const excessCritRate = critRate - 1.0;
                const bonusCritDmg = excessCritRate * 100 * E6_CRIT_TO_CRIT_DMG_RATIO;

                // damageModifiersに追加（critDmgを使用）
                newState = {
                    ...newState,
                    damageModifiers: {
                        ...newState.damageModifiers,
                        critDmg: (newState.damageModifiers?.critDmg || 0) + bonusCritDmg
                    }
                };
            }
        }
    }
    return newState;
};

export const sundayHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    return {
        handlerMetadata: {
            id: `sunday-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_BEFORE_DAMAGE_CALCULATION',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, state, sourceUnitId);
            }
            if (event.type === 'ON_TURN_START' && event.sourceId === sourceUnitId) {
                return onTurnStart(event, state, sourceUnitId, eidolonLevel);
            }
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
