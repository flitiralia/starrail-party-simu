import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, IEvent, GameState, Unit, DamageDealtEvent, ActionEvent, BeforeDamageCalcEvent, GeneralEvent, EffectEvent, BeforeDamageReceivedEvent, BeforeDeathEvent } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyHealing } from '../../simulator/engine/utils';
import { calculateAbilityLevel, getLeveledValue } from '../../simulator/utils/abilityLevel';

// --- 定数定義 ---
const CHARACTER_ID = 'fu-xuan';

// エフェクトID
const EFFECT_IDS = {
    MATRIX_OF_PRESCIENCE: (unitId: string) => `${CHARACTER_ID}-matrix-${unitId}`,  // 窮観の陣
    DIVINATION: (sourceId: string, targetId: string) => `${CHARACTER_ID}-divination-${sourceId}-${targetId}`,  // 鑑知
    WARDING: (sourceId: string, targetId: string) => `${CHARACTER_ID}-warding-${sourceId}-${targetId}`,  // 避邪
    TALENT_HEAL_STACKS: (unitId: string) => `${CHARACTER_ID}-talent-heal-${unitId}`,  // 天賦回復スタック
    E2_USED: (unitId: string) => `${CHARACTER_ID}-e2-used-${unitId}`,  // E2発動済みフラグ
    E6_DAMAGE_COUNTER: (unitId: string) => `${CHARACTER_ID}-e6-counter-${unitId}`,  // E6ダメージカウンター
    A6_RESIST_USED: (unitId: string) => `${CHARACTER_ID}-a6-resist-${unitId}`,  // A6行動制限抵抗使用済み
} as const;

// 軌跡ID
const TRACE_IDS = {
    A2_TAIYI: `${CHARACTER_ID}-trace-a2`,        // 太乙神数
    A4_QIMEN: `${CHARACTER_ID}-trace-a4`,        // 奇門遁甲
    A6_LIUREN: `${CHARACTER_ID}-trace-a6`,       // 六壬神課
} as const;

// --- アビリティ倍率 (デフォルトレベル基準) ---

// 通常攻撃 (Lv6: 50%, Lv7: 55%) - HPスケーリング
const BASIC_MULT = 0.50;

// 戦闘スキル (Lv10: 3ターン継続)
const SKILL_DURATION = 3;
const SKILL_DAMAGE_SHARE = 0.65;  // 65%ダメージ分担

// 必殺技 (Lv10: HP 100%, Lv12: HP 108%)
const ULT_MULT = 1.0;

// 天賦
const TALENT_INITIAL_STACKS = 1;
const TALENT_MAX_STACKS = 2;

// A2: EP追加回復
const A2_EP_RECOVERY = 20;

// A4: 味方回復
const A4_HEAL_MULT = 0.05;  // 最大HP 5%
const A4_HEAL_FLAT = 133;

// E1: 会心ダメージ+30%
const E1_CRIT_DMG = 0.30;

// E2: HP回復（最大HPの70%）
const E2_HEAL_PERCENT = 0.70;

// E4: EP+5
const E4_EP_RECOVERY = 5;

// E6: ダメージブースト（累計失ったHP 200%）、上限（最大HP 120%）
const E6_DMG_BOOST_MULT = 2.0;
const E6_DAMAGE_CAP_MULT = 1.2;

// --- E3/E5パターン ---
const ABILITY_VALUES = {
    // 通常攻撃: E5でLv7に上昇
    basicMult: {
        6: { mult: 0.50 },
        7: { mult: 0.55 }
    } as Record<number, { mult: number }>,
    // スキル: E3でLv12に上昇
    skillValues: {
        10: { hpBoost: 0.06, critRate: 0.12 },
        12: { hpBoost: 0.066, critRate: 0.132 }
    } as Record<number, { hpBoost: number; critRate: number }>,
    // 必殺技: E5でLv12に上昇
    ultMult: {
        10: { mult: 1.0 },
        12: { mult: 1.08 }
    } as Record<number, { mult: number }>,
    // 天賦: E3でLv12に上昇
    talentValues: {
        10: { dmgReduction: 0.18, healPercent: 0.90 },
        12: { dmgReduction: 0.196, healPercent: 0.92 }
    } as Record<number, { dmgReduction: number; healPercent: number }>,
};

// --- キャラクター定義 ---
export const fuXuan: Character = {
    id: CHARACTER_ID,
    name: '符玄',
    path: 'Preservation',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 135,
    baseStats: {
        hp: 1474,
        atk: 465,
        def: 606,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 150  // 存護
    },

    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: '始撃歳星',
            type: 'Basic ATK',
            description: '指定した敵単体に符玄の最大HP50%分の量子属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'hp',
                hits: [{ multiplier: BASIC_MULT, toughnessReduction: 10 }],
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: `${CHARACTER_ID}-skill`,
            name: '太微の行棋、影示す霊台',
            type: 'Skill',
            description: '「窮観の陣」を起動し、符玄以外の味方が受けるダメージの65%を符玄が分担する、3ターン継続。味方全体に「鑑知」を付与（最大HP+6.0%、会心率+12.0%）。',
            energyGain: 30,
            targetType: 'all_allies',
        },

        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: '天律大衍、歴劫帰一',
            type: 'Ultimate',
            description: '敵全体に符玄の最大HP100%分の量子属性ダメージを与え、天賦によるHP回復の発動回数+1。',
            damage: {
                type: 'aoe',
                scaling: 'hp',
                hits: [{ multiplier: ULT_MULT, toughnessReduction: 20 }],
            },
            energyGain: 5,
            targetType: 'all_enemies',
        },

        talent: {
            id: `${CHARACTER_ID}-talent`,
            name: '乾坤清夷、一陽来復',
            type: 'Talent',
            description: '味方全体に「避邪」を付与する。被ダメージ-18%。符玄のHP残割合が50%以下になった時、失ったHP90%分のHPを回復する。初期発動回数1回、最大2回累積。',
        },

        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: '否泰記す四郭固',
            type: 'Technique',
            description: '秘技を使用した後、味方全体は20秒間継続するバリアを獲得する。戦闘に入る時、符玄は自動で「窮観の陣」を起動する（2ターン継続）。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_TAIYI,
            name: '太乙神数',
            type: 'Bonus Ability',
            description: '「窮観の陣」が起動している時、符玄が戦闘スキルを発動すると、さらにEPを20回復する。'
        },
        {
            id: TRACE_IDS.A4_QIMEN,
            name: '奇門遁甲',
            type: 'Bonus Ability',
            description: '必殺技を発動した時、符玄以外の味方のHPを、符玄の最大HPの5%分+133回復する。'
        },
        {
            id: TRACE_IDS.A6_LIUREN,
            name: '六壬神課',
            type: 'Bonus Ability',
            description: '「窮観の陣」が起動している時、敵が味方に行動制限系デバフを付与する場合、味方全体がその行動中に付与されるすべての行動制限系デバフを抵抗する。この効果は1回まで発動できる。'
        },
        {
            id: `${CHARACTER_ID}-stat-crit`,
            name: '会心率強化',
            type: 'Stat Bonus',
            description: '会心率+18.7%',
            stat: 'crit_rate' as StatKey,
            value: 0.187
        },
        {
            id: `${CHARACTER_ID}-stat-hp`,
            name: '最大HP強化',
            type: 'Stat Bonus',
            description: '最大HP+18.0%',
            stat: 'hp_pct' as StatKey,
            value: 0.18
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
            name: '司危',
            description: '「鑑知」状態の味方の会心ダメージ+30%。'
        },
        e2: {
            level: 2,
            name: '柔兆',
            description: '「窮観の陣」が起動している時、味方がHPが0になるダメージを受けても、今回の行動でHPが0になるダメージを受けたすべての味方は戦闘不能にならず、自身の最大HP70%分のHPを回復する。この効果は一度の戦闘で1回まで発動できる。'
        },
        e3: {
            level: 3,
            name: '直符',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: []
        },
        e4: {
            level: 4,
            name: '格澤',
            description: '「窮観の陣」の中にいる符玄以外の味方が攻撃を受けた後、符玄はEPを5回復する。'
        },
        e5: {
            level: 5,
            name: '計神',
            description: '必殺技のLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 1.08 },
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.55 },
            ]
        },
        e6: {
            level: 6,
            name: '種陵',
            description: '「窮観の陣」が起動している時、味方全体が戦闘中失った累計HPをカウントする。符玄の必殺技の与ダメージが、戦闘中失った累計HP200%分アップする。戦闘中失った累計HPのカウントは、符玄の最大HPの120%を超えず、必殺技を発動した後にリセットされる。'
        }
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'she-already-shut-her-eyes',
        superimposition: 1,
        relicSetId: 'longevous-disciple',
        ornamentSetId: 'broken-keel',
        mainStats: {
            body: 'hp_pct',
            feet: 'spd',
            sphere: 'hp_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'hp_pct', value: 0.30 },
            { stat: 'spd', value: 10 },
            { stat: 'def_pct', value: 0.10 },
            { stat: 'effect_res', value: 0.10 },
        ],
        rotationMode: 'spam_skill',
        spamSkillTriggerSp: 4,
        ultStrategy: 'immediate',
    }
};

// --- ヘルパー関数 ---

/**
 * 窮観の陣が起動しているか確認
 */
function isMatrixActive(state: GameState, unitId: string): boolean {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return false;
    return unit.effects.some(e => e.id === EFFECT_IDS.MATRIX_OF_PRESCIENCE(unitId));
}

/**
 * 天賦回復スタックを取得
 */
function getTalentHealStacks(state: GameState, unitId: string): number {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.TALENT_HEAL_STACKS(unitId));
    return effect?.stackCount || 0;
}

/**
 * 天賦回復スタックを設定
 */
function setTalentHealStacks(state: GameState, unitId: string, stacks: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const clampedStacks = Math.min(Math.max(0, stacks), TALENT_MAX_STACKS);

    const stackEffect: IEffect = {
        id: EFFECT_IDS.TALENT_HEAL_STACKS(unitId),
        name: `天賦回復スタック (${clampedStacks})`,
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: clampedStacks,
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };

    let newState = removeEffect(state, unitId, EFFECT_IDS.TALENT_HEAL_STACKS(unitId));
    if (clampedStacks > 0) {
        newState = addEffect(newState, unitId, stackEffect);
    }

    return newState;
}

/**
 * E6ダメージカウンターを取得
 */
function getE6DamageCounter(state: GameState, unitId: string): number {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.E6_DAMAGE_COUNTER(unitId));
    return (effect as IEffect & { damageCounter?: number })?.damageCounter || 0;
}

/**
 * E6ダメージカウンターを設定
 */
function setE6DamageCounter(state: GameState, unitId: string, damage: number, maxHp: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const cap = maxHp * E6_DAMAGE_CAP_MULT;
    const clampedDamage = Math.min(damage, cap);

    const counterEffect: IEffect & { damageCounter: number } = {
        id: EFFECT_IDS.E6_DAMAGE_COUNTER(unitId),
        name: 'E6ダメージカウンター',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        damageCounter: clampedDamage,
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };

    let newState = removeEffect(state, unitId, EFFECT_IDS.E6_DAMAGE_COUNTER(unitId));
    newState = addEffect(newState, unitId, counterEffect as IEffect);

    return newState;
}

/**
 * 鑑知バフを付与
 * 注意: hpBoostは符玄の最大HPのX%を「固定値」として加算する
 */
function applyDivination(
    state: GameState,
    sourceId: string,
    targetId: string,
    hpBoostPercent: number,  // 符玄の最大HPに対する割合（0.06 = 6%）
    critRate: number,
    critDmg: number
): GameState {
    // 符玄のステータスを取得
    const fuXuanUnit = state.registry.get(createUnitId(sourceId));
    if (!fuXuanUnit) return state;

    // 固定HP加算値 = 符玄の最大HP × X%
    const hpBoostFlat = fuXuanUnit.stats.hp * hpBoostPercent;

    // 既存のバフを削除
    let newState = removeEffect(state, targetId, EFFECT_IDS.DIVINATION(sourceId, targetId));

    const modifiers: IEffect['modifiers'] = [
        { target: 'hp' as StatKey, value: hpBoostFlat, type: 'add' as const, source: '鑑知' },
        { target: 'crit_rate' as StatKey, value: critRate, type: 'add' as const, source: '鑑知' },
    ];

    // E1: 会心ダメージ+30%
    if (critDmg > 0) {
        modifiers.push({ target: 'crit_dmg' as StatKey, value: critDmg, type: 'add' as const, source: '鑑知 (E1)' });
    }

    const divinationEffect: IEffect = {
        id: EFFECT_IDS.DIVINATION(sourceId, targetId),
        name: '鑑知',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'LINKED',  // 窮観の陣と連動
        duration: -1,
        linkedEffectId: EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceId),
        modifiers,
        tags: ['DIVINATION'],
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };

    newState = addEffect(newState, targetId, divinationEffect);
    return newState;
}

/**
 * 避邪バフを付与（味方全体）
 */
function applyWarding(state: GameState, sourceId: string, dmgReduction: number): GameState {
    let newState = state;
    const allies = newState.registry.getAliveAllies();

    for (const ally of allies) {
        // 既存のバフを削除
        newState = removeEffect(newState, ally.id, EFFECT_IDS.WARDING(sourceId, ally.id));

        const wardingEffect: IEffect = {
            id: EFFECT_IDS.WARDING(sourceId, ally.id),
            name: '避邪',
            category: 'BUFF',
            sourceUnitId: sourceId,
            durationType: 'PERMANENT',  // 符玄が戦闘可能な限り継続
            duration: -1,
            modifiers: [
                { target: 'dmg_taken_reduction' as StatKey, value: dmgReduction, type: 'add' as const, source: '避邪' },
            ],
            tags: ['WARDING'],
            onApply: (t: Unit, s: GameState) => s,
            onRemove: (t: Unit, s: GameState) => s
        };

        newState = addEffect(newState, ally.id, wardingEffect);
    }

    return newState;
}

/**
 * 敵に被ダメージアップ性能デバフ（玄止）を付与（E6効果、本来は必殺技時のみだが簡略化）
 */
function applyE6Vuln(state: GameState, sourceId: string, targetId: string): GameState {
    const VULN_VALUE = 0.20; // 仮の数値（本来は仕様に基づく）

    // 既存のデバフを削除
    let newState = removeEffect(state, targetId, `${sourceId}-e6-vuln`);

    const vulnEffect: IEffect = {
        id: `${sourceId}-e6-vuln`,
        name: '玄止',
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        modifiers: [{
            target: 'all_dmg_taken_boost' as StatKey,
            value: VULN_VALUE,
            type: 'add',
            source: '玄止'
        }],
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };

    return addEffect(newState, targetId, vulnEffect);
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

    // 天賦: 初期回復スタックを設定
    newState = setTalentHealStacks(newState, sourceUnitId, TALENT_INITIAL_STACKS);

    // 天賦: 避邪を味方全体に付与
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const talentValues = getLeveledValue(ABILITY_VALUES.talentValues, talentLevel);
    newState = applyWarding(newState, sourceUnitId, talentValues.dmgReduction);

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

    // 天賦: HP50%以下で自動回復
    const hpPercent = unit.hp / unit.stats.hp;
    if (hpPercent <= 0.5) {
        const stacks = getTalentHealStacks(newState, sourceUnitId);
        if (stacks > 0) {
            const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
            const talentValues = getLeveledValue(ABILITY_VALUES.talentValues, talentLevel);

            // 失ったHPの割合で回復
            const lostHp = unit.stats.hp - unit.hp;
            const healAmount = lostHp * talentValues.healPercent;

            newState = applyHealing(
                newState,
                sourceUnitId,
                sourceUnitId,
                healAmount,
                '天賦: 乾坤清夷、一陽来復',
                false
            );

            // スタックを消費
            newState = setTalentHealStacks(newState, sourceUnitId, stacks - 1);
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

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // A2: 窮観の陣起動中ならEP+20
    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_TAIYI);
    const wasMatrixActive = isMatrixActive(newState, sourceUnitId);
    if (hasA2 && wasMatrixActive) {
        const currentUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (currentUnit) {
            const newEp = Math.min(currentUnit.ep + A2_EP_RECOVERY, fuXuan.maxEnergy);
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                    ...u,
                    ep: newEp
                }))
            };
        }
    }

    // 窮観の陣を起動（既存を更新）
    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceUnitId));
    // A6抵抗カウンターをリセット
    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.A6_RESIST_USED(sourceUnitId));

    const matrixEffect: IEffect = {
        id: EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceUnitId),
        name: '窮観の陣',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_END_BASED',
        duration: SKILL_DURATION,
        skipFirstTurnDecrement: true,
        tags: ['MATRIX_OF_PRESCIENCE'],
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, matrixEffect);

    // 鑑知を味方全体に付与
    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
    const skillValues = getLeveledValue(ABILITY_VALUES.skillValues, skillLevel);
    const e1CritDmg = eidolonLevel >= 1 ? E1_CRIT_DMG : 0;

    const allies = newState.registry.getAliveAllies();
    for (const ally of allies) {
        newState = applyDivination(
            newState,
            sourceUnitId,
            ally.id,
            skillValues.hpBoost,
            skillValues.critRate,
            e1CritDmg
        );
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

    // 天賦回復スタック+1
    const currentStacks = getTalentHealStacks(newState, sourceUnitId);
    newState = setTalentHealStacks(newState, sourceUnitId, currentStacks + 1);

    // A4: 符玄以外の味方を回復
    const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_QIMEN);
    if (hasA4) {
        const allies = newState.registry.getAliveAllies();
        for (const ally of allies) {
            if (ally.id !== sourceUnitId) {
                newState = applyHealing(
                    newState,
                    sourceUnitId,
                    ally.id,
                    { scaling: 'hp', multiplier: A4_HEAL_MULT, flat: A4_HEAL_FLAT },
                    'A4: 奇門遁甲',
                    true
                );
            }
        }
    }

    // E6: ダメージカウンターをリセット
    if (eidolonLevel >= 6) {
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.E6_DAMAGE_COUNTER(sourceUnitId));
    }

    return newState;
};

/**
 * ダメージ発生後（E4 EP回復, E6 ダメージカウンター）
 * 
 * Note: 窮観の陣のダメージ分担(65%)は現在のシミュレーターで
 * ON_BEFORE_DAMAGE_RECEIVEDイベントがサポートされていないため、
 * 被ダメージ軽減として避邪(dmg_takenモディファイア)で代替する。
 */
const onDamageDealt = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 味方がダメージを受けた場合
    if (!event.targetId) return state;
    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || target.isEnemy) return state;

    // 攻撃者が敵かどうか確認
    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker || !attacker.isEnemy) return state;

    // 窮観の陣が起動していない場合は処理しない
    if (!isMatrixActive(state, sourceUnitId)) return state;

    let newState = state;

    // E4: 符玄以外の味方被弾でEP+5
    if (eidolonLevel >= 4 && event.targetId !== sourceUnitId) {
        const fuXuanUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (fuXuanUnit) {
            const newEp = Math.min(fuXuanUnit.ep + E4_EP_RECOVERY, fuXuan.maxEnergy);
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                    ...u,
                    ep: newEp
                }))
            };
        }
    }

    // E6: ダメージカウンター更新（味方が受けたダメージを記録）
    if (eidolonLevel >= 6) {
        const fuXuanUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (fuXuanUnit) {
            const currentDamage = getE6DamageCounter(newState, sourceUnitId);
            const damageAmount = event.value || 0;
            newState = setE6DamageCounter(newState, sourceUnitId, currentDamage + damageAmount, fuXuanUnit.stats.hp);
        }
    }

    return newState;
};

/**
 * ダメージ計算前（E6ダメージブースト）
 */
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    if (event.subType !== 'ULTIMATE_DAMAGE') return state;

    if (eidolonLevel < 6) return state;

    // 窮観の陣が起動していない場合は処理しない
    if (!isMatrixActive(state, sourceUnitId)) return state;

    // E6: 累計失ったHPに応じてダメージブースト
    const damageCounter = getE6DamageCounter(state, sourceUnitId);
    const fuXuanUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!fuXuanUnit) return state;

    // ダメージブースト = 累計失ったHP * 200%
    const damageBoost = damageCounter * E6_DMG_BOOST_MULT;

    if (damageBoost > 0) {
        // damageModifiersに基礎ダメージ加算を追加
        return {
            ...state,
            damageModifiers: {
                ...state.damageModifiers,
                baseDmgAdd: (state.damageModifiers.baseDmgAdd || 0) + damageBoost
            }
        };
    }

    return state;
};

/**
 * ダメージを受ける前（窮観の陣のダメージ分担）
 */
const onBeforeDamageReceived = (
    event: BeforeDamageReceivedEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 符玄自身が受けるダメージは分担しない
    if (event.targetId === sourceUnitId) return state;

    // 窮観の陣が起動しているか確認
    if (!isMatrixActive(state, sourceUnitId)) return state;

    const fuXuanUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!fuXuanUnit || fuXuanUnit.hp <= 0) return state;

    // ダメージの65%を符玄が分担
    const damageToShare = event.originalDamage * SKILL_DAMAGE_SHARE;
    const reducedDamage = event.originalDamage * (1 - SKILL_DAMAGE_SHARE);

    // イベントに変更を設定（dispatcherが処理）
    event.modifiedDamage = reducedDamage;
    event.sharedDamage = {
        targetId: sourceUnitId,
        amount: damageToShare
    };

    return state;
};

/**
 * 死亡前（E2蘇生防止）
 */
const onBeforeDeath = (
    event: BeforeDeathEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (eidolonLevel < 2) return state;

    // 窮観の陣が起動していない場合は処理しない
    if (!isMatrixActive(state, sourceUnitId)) return state;

    // E2が既に使用済みかチェック
    const fuXuanUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!fuXuanUnit) return state;
    const e2Used = fuXuanUnit.effects.some(e => e.id === EFFECT_IDS.E2_USED(sourceUnitId));
    if (e2Used) return state;

    // 対象が味方かつ戦闘不能になる場合
    if (!event.targetId) return state;
    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || target.isEnemy) return state;

    // 死亡を防止
    event.preventDeath = true;
    event.healAmount = target.stats.hp * E2_HEAL_PERCENT;

    // E2使用済みフラグを設定
    const e2UsedEffect: IEffect = {
        id: EFFECT_IDS.E2_USED(sourceUnitId),
        name: 'E2使用済み',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };
    return addEffect(state, sourceUnitId, e2UsedEffect);
};

/**
 * デバフ付与時（A6行動制限抵抗）
 */
const onDebuffApplied = (
    event: EffectEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6_LIUREN);
    if (!hasA6) return state;

    // 窮観の陣が起動していない場合は処理しない
    if (!isMatrixActive(state, sourceUnitId)) return state;

    // A6が既に使用済みかチェック
    const a6Used = unit.effects.some(e => e.id === EFFECT_IDS.A6_RESIST_USED(sourceUnitId));
    if (a6Used) return state;

    // 行動制限系デバフかどうかチェック
    const ccTags = ['FREEZE', 'IMPRISON', 'ENTANGLE', 'CROWD_CONTROL'];
    const isCcDebuff = event.effect?.tags?.some(tag => ccTags.includes(tag));
    if (!isCcDebuff) return state;

    let newState = state;

    // デバフをキャンセル（Note: 実際のキャンセルはシミュレーターで対応が必要）
    // ここではA6使用済みフラグを設定
    const a6UsedEffect: IEffect = {
        id: EFFECT_IDS.A6_RESIST_USED(sourceUnitId),
        name: 'A6使用済み',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'LINKED',  // 窮観の陣と連動
        duration: -1,
        linkedEffectId: EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceUnitId),
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, a6UsedEffect);

    return newState;
};

// --- ハンドラーファクトリ ---
export const fuXuanHandlerFactory: IEventHandlerFactory = (
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
                'ON_DAMAGE_DEALT',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_EFFECT_APPLIED',
                'ON_BEFORE_DAMAGE_RECEIVED',
                'ON_BEFORE_DEATH',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            // 符玄が存在するか確認
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
                case 'ON_DAMAGE_DEALT':
                    return onDamageDealt(event as DamageDealtEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_BEFORE_DAMAGE_CALCULATION':
                    return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_EFFECT_APPLIED':
                    return onDebuffApplied(event as EffectEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_BEFORE_DAMAGE_RECEIVED':
                    return onBeforeDamageReceived(event as BeforeDamageReceivedEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_BEFORE_DEATH':
                    return onBeforeDeath(event as BeforeDeathEvent, state, sourceUnitId, eidolonLevel);
                default:
                    return state;
            }
        }
    };
};
