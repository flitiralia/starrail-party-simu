import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, IEvent, GameState, Unit, DamageDealtEvent, ActionEvent, BeforeDamageCalcEvent, GeneralEvent } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage, appendAdditionalDamage } from '../../simulator/engine/dispatcher';
import { calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';
import { applyShield, applyHealing } from '../../simulator/engine/utils';
import { calculateAbilityLevel, getLeveledValue } from '../../simulator/utils/abilityLevel';

// --- 定数定義 ---
const CHARACTER_ID = 'fu-xuan';

// エフェクトID
const EFFECT_IDS = {
    MATRIX_OF_PRESCIENCE: (sourceId: string) => `${CHARACTER_ID}-matrix-${sourceId}`,           // 窮観の陣
    JIANZHI: (sourceId: string, targetId: string) => `${CHARACTER_ID}-jianzhi-${sourceId}-${targetId}`, // 鑑知バリア
    JIANZHI_CRIT: (sourceId: string, targetId: string) => `${CHARACTER_ID}-jianzhi-crit-${sourceId}-${targetId}`, // 会心率バフ
    YAKUBARAI: (sourceId: string, targetId: string) => `${CHARACTER_ID}-yakubarai-${sourceId}-${targetId}`, // 厄払い
    HP_BOOST: (sourceId: string, targetId: string) => `${CHARACTER_ID}-hp-boost-${sourceId}-${targetId}`, // 最大HPブースト
    HP_RECOVERY_CHARGES: (sourceId: string) => `${CHARACTER_ID}-hp-recovery-${sourceId}`, // HP回復発動回数
    E2_USED: (sourceId: string) => `${CHARACTER_ID}-e2-used-${sourceId}`, // E2使用済みフラグ
    E6_BONUS: (sourceId: string) => `${CHARACTER_ID}-e6-bonus-${sourceId}`, // E6一時予ダメージアップ
} as const;

// --- 型定義 & 型ガード ---

interface YakubaraiEffect extends IEffect {
    damageShare: number;
}

function isYakubaraiEffect(effect: IEffect): effect is YakubaraiEffect {
    return effect.tags?.includes('YAKUBARAI') === true && 'damageShare' in effect;
}

interface E6BonusEffect extends IEffect {
    customValue: number;
}

function isE6BonusEffect(effect: IEffect): effect is E6BonusEffect {
    return effect.id.includes('e6-bonus') && 'customValue' in effect;
}

// 軌跡ID
const TRACE_IDS = {
    A2_TAIYI: `${CHARACTER_ID}-trace-a2`,    // 太乙の身、これに遺す
    A4_DUNJIA: `${CHARACTER_ID}-trace-a4`,   // 遁甲の身、これに存す
    A6_LIUREN: `${CHARACTER_ID}-trace-a6`,   // 六壬の身、これに帰す
} as const;

// --- アビリティ倍率 (デフォルトレベル基準) ---

// 通常攻撃 (Lv6: 50%, Lv7: 55%) - HPスケーリング
const BASIC_MULT = 0.50;

// スキル: 窮観の陣 (Lv10)
const SKILL_SHIELD_PCT = 0.10;     // HP 10%
const SKILL_SHIELD_FLAT = 133;
const SKILL_CRIT_RATE = 0.12;      // 会心率+12%
const SKILL_DURATION = 3;

// 必殺技 (Lv10: HP 100%)
const ULT_MULT = 1.0;

// 天賦 (Lv10)
const TALENT_DMG_SHARE = 0.65;     // ダメージ分担率65%
const TALENT_DMG_SHARE_DURATION = 3; // 分担期間3ターン
const TALENT_HP_BOOST = 0.06;      // 最大HP+6%
const TALENT_HEAL_PCT = 0.90;      // 失ったHP90%回復
const TALENT_HEAL_THRESHOLD = 0.50; // HP50%以下で発動
const TALENT_INITIAL_CHARGES = 1;   // 初期回復回数
const TALENT_MAX_CHARGES = 2;       // 最大回復回数

// A2: 窮観の陣中、必殺技で味方回復
const A2_HEAL_PCT = 0.05;
const A2_HEAL_FLAT = 80;

// A4: 天賦HP回復発動時、自身以外の味方も回復
const A4_HEAL_PCT = 0.80;

// E1: 窮観の陣中、会心ダメージ+30%
const E1_CRIT_DMG = 0.30;

// E2: 戦闘不能回避 → HP70%回復
const E2_REVIVE_HP = 0.70;

// E4: ダメージ分担時EP+5
const E4_EP_GAIN = 5;

// E6: HP減少味方1名ごとに必殺技与ダメ+最大HP50%（最大200%）
const E6_DMG_PER_ALLY = 0.50;
const E6_DMG_CAP = 2.0;

// --- E3/E5パターン ---
const ABILITY_VALUES = {
    // 通常攻撃: E5でLv7に上昇
    basicMult: {
        6: { mult: 0.50 },
        7: { mult: 0.55 }
    } as Record<number, { mult: number }>,
    // スキル: E5でLv12に上昇
    skillShield: {
        10: { pct: 0.10, flat: 133, critRate: 0.12 },
        12: { pct: 0.106, flat: 147, critRate: 0.129 }
    } as Record<number, { pct: number; flat: number; critRate: number }>,
    // 必殺技: E3でLv12に上昇
    ultDmg: {
        10: { mult: 1.0 },
        12: { mult: 1.08 }
    } as Record<number, { mult: number }>,
    // 天賦: E3でLv12に上昇
    talentValues: {
        10: { dmgShare: 0.65, hpBoost: 0.06, healPct: 0.90 },
        12: { dmgShare: 0.668, hpBoost: 0.0636, healPct: 0.92 }
    } as Record<number, { dmgShare: number; hpBoost: number; healPct: number }>,
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
        atk: 423,
        def: 654,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 150  // 存護
    },

    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: '星の如き一擲',
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
            name: '星槎の門、未来を開く',
            type: 'Skill',
            description: '「窮観の陣」を展開する、3ターン継続。「窮観の陣」にいる味方は、バリア「鑑知」を獲得し、会心率+12%。',
            energyGain: 20,
            targetType: 'self',
        },

        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: '天律、身を犯すことなかれ',
            type: 'Ultimate',
            description: '敵全体に符玄の最大HP100%分の量子属性ダメージを与え、天賦のHP回復の発動可能回数を1回獲得する。',
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
            name: '易者の憂い、吉凶の兆し',
            type: 'Talent',
            description: '符玄が戦闘可能状態の時、味方全体に「厄払い」を付与する。ダメージ65%を符玄が分担。最大HP+6%。HP50%以下で失ったHP90%回復。',
        },

        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: '吉凶は定めず、神の教えを待つ',
            type: 'Technique',
            description: '秘技を使用した後、味方全体は20秒間継続するバリアを獲得する。バリアがある状態で戦闘に入った後、符玄は自動で戦闘スキルを1回発動する。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_TAIYI,
            name: '太乙の身、これに遺す',
            type: 'Bonus Ability',
            description: '「窮観の陣」が展開されている時、符玄が必殺技を発動すると、味方全体のHPを符玄の最大HP5%分+80回復する。'
        },
        {
            id: TRACE_IDS.A4_DUNJIA,
            name: '遁甲の身、これに存す',
            type: 'Bonus Ability',
            description: '符玄が天賦のHP回復を発動した時、自身以外の味方全体のHPを、符玄の最大HP80%分回復する。'
        },
        {
            id: TRACE_IDS.A6_LIUREN,
            name: '六壬の身、これに帰す',
            type: 'Bonus Ability',
            description: '「窮観の陣」が展開されている時、味方全体が行動制限系デバフに抵抗する。この効果はターンが回ってくるたびに1回発動できる。'
        },
        {
            id: `${CHARACTER_ID}-stat-hp`,
            name: 'HP強化',
            type: 'Stat Bonus',
            description: '最大HP+18.0%',
            stat: 'hp_pct' as StatKey,
            value: 0.18
        },
        {
            id: `${CHARACTER_ID}-stat-crit`,
            name: '会心率',
            type: 'Stat Bonus',
            description: '会心率+12.0%',
            stat: 'crit_rate' as StatKey,
            value: 0.12
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
            name: '乾坤定まる',
            description: '「窮観の陣」の会心ダメージアップ効果+30%。'
        },
        e2: {
            level: 2,
            name: '四象、基を成す',
            description: '「窮観の陣」が展開されている時、味方が戦闘不能状態になるダメージを受けた場合、戦闘不能状態にならず、即座に自身の最大HP70%分のHPを回復する。この効果は1回の戦闘で1回まで発動できる。'
        },
        e3: {
            level: 3,
            name: '六十四卦、信を以て結ぶ',
            description: '必殺技のLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                // 必殺技: Lv10(100%) → Lv12(108%)
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 1.08 },
            ]
        },
        e4: {
            level: 4,
            name: '天地万象、否泰を占う',
            description: '符玄が他の味方のダメージを分担する時、EPを5回復する。'
        },
        e5: {
            level: 5,
            name: '八門、道を論ず',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // 通常攻撃: Lv6(50%) → Lv7(55%)
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.55 },
            ]
        },
        e6: {
            level: 6,
            name: '周天、始まりに戻る',
            description: '「窮観の陣」が展開されている時、フィールド上のHPが減った味方の人数をカウントし、符玄の必殺技の与ダメージがアップする。HPが減った味方1名につき、符玄の必殺技の与ダメージが、符玄の最大HP50%分アップする。この効果は最大で符玄の最大HP200%分までアップする。'
        }
    },

    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'she-already-shut-her-eyes',
        superimposition: 1,
        relicSetId: 'longevous_disciple',
        ornamentSetId: 'broken_keel',
        mainStats: {
            body: 'hp_pct',
            feet: 'spd',
            sphere: 'hp_pct',
            rope: 'hp_pct',
        },
        subStats: [
            { stat: 'hp_pct', value: 0.30 },
            { stat: 'spd', value: 10 },
            { stat: 'effect_res', value: 0.10 },
            { stat: 'def_pct', value: 0.10 },
        ],
        rotationMode: 'spam_skill',
        spamSkillTriggerSp: 4,
        ultStrategy: 'immediate',
    }
};

// --- ヘルパー関数 ---

/**
 * 窮観の陣が展開されているか確認
 */
function isMatrixActive(state: GameState, sourceId: string): boolean {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return false;
    return unit.effects.some(e => e.id === EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceId));
}

/**
 * 窮観の陣の残りターン数を取得
 */
function getMatrixDuration(state: GameState, sourceId: string): number {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceId));
    return effect?.duration || 0;
}

/**
 * HP回復発動回数を取得
 */
function getHpRecoveryCharges(state: GameState, unitId: string): number {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.HP_RECOVERY_CHARGES(unitId));
    return effect?.stackCount || 0;
}

/**
 * HP回復発動回数を設定
 */
function setHpRecoveryCharges(state: GameState, unitId: string, charges: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const clampedCharges = Math.min(Math.max(0, charges), TALENT_MAX_CHARGES);

    let newState = removeEffect(state, unitId, EFFECT_IDS.HP_RECOVERY_CHARGES(unitId));

    if (clampedCharges > 0) {
        const chargeEffect: IEffect = {
            id: EFFECT_IDS.HP_RECOVERY_CHARGES(unitId),
            name: `HP回復発動回数 (${clampedCharges})`,
            category: 'BUFF',
            sourceUnitId: unitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: clampedCharges,
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, unitId, chargeEffect);
    }

    return newState;
}

/**
 * 窮観の陣を展開
 */
function deployMatrix(
    state: GameState,
    sourceId: string,
    eidolonLevel: number
): GameState {
    const source = state.registry.get(createUnitId(sourceId));
    if (!source) return state;

    let newState = state;

    // 既存の窮観の陣を削除
    newState = removeEffect(newState, sourceId, EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceId));

    // 窮観の陣エフェクトを作成
    const matrixEffect: IEffect = {
        id: EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceId),
        name: '窮観の陣',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: SKILL_DURATION,
        tags: ['MATRIX_OF_PRESCIENCE'],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceId, matrixEffect);

    // 味方全体に鑑知バリアと会心率バフを付与
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const skillValues = getLeveledValue(ABILITY_VALUES.skillShield, skillLevel);
    let critDmgBonus = 0;
    if (eidolonLevel >= 1) {
        critDmgBonus = E1_CRIT_DMG;
    }

    const allies = newState.registry.getAliveAllies();
    for (const ally of allies) {
        // 既存の鑑知バリアを削除（リフレッシュ）
        newState = removeEffect(newState, ally.id, EFFECT_IDS.JIANZHI(sourceId, ally.id));
        newState = removeEffect(newState, ally.id, EFFECT_IDS.JIANZHI_CRIT(sourceId, ally.id));

        // 鑑知バリアを付与
        newState = applyShield(
            newState,
            sourceId,
            ally.id,
            { scaling: 'hp', multiplier: skillValues.pct, flat: skillValues.flat },
            SKILL_DURATION,
            'TURN_START_BASED',
            '鑑知',
            EFFECT_IDS.JIANZHI(sourceId, ally.id),
            true
        );

        // 会心率バフを付与
        const modifiers: IEffect['modifiers'] = [
            { target: 'crit_rate' as StatKey, value: skillValues.critRate, type: 'add' as const, source: '鑑知' }
        ];
        if (critDmgBonus > 0) {
            modifiers.push({ target: 'crit_dmg' as StatKey, value: critDmgBonus, type: 'add' as const, source: '窮観の陣 (E1)' });
        }

        const critEffect: IEffect = {
            id: EFFECT_IDS.JIANZHI_CRIT(sourceId, ally.id),
            name: '鑑知 (会心)',
            category: 'BUFF',
            sourceUnitId: sourceId,
            durationType: 'LINKED',
            duration: -1,
            linkedEffectId: EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceId),
            modifiers,
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, ally.id, critEffect);
    }

    return newState;
}

/**
 * 厄払いを付与
 */
function applyYakubarai(
    state: GameState,
    sourceId: string,
    targetId: string,
    eidolonLevel: number
): GameState {
    const source = state.registry.get(createUnitId(sourceId));
    if (!source) return state;

    let newState = state;

    // 既存の厄払いを削除
    newState = removeEffect(newState, targetId, EFFECT_IDS.YAKUBARAI(sourceId, targetId));
    newState = removeEffect(newState, targetId, EFFECT_IDS.HP_BOOST(sourceId, targetId));

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const talentValues = getLeveledValue(ABILITY_VALUES.talentValues, talentLevel);

    // 厄払いエフェクト
    const yakubaraiEffect: YakubaraiEffect = {
        id: EFFECT_IDS.YAKUBARAI(sourceId, targetId),
        name: '厄払い',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        tags: ['YAKUBARAI'],
        // ダメージ分担情報を保持
        damageShare: talentValues.dmgShare,
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };

    newState = addEffect(newState, targetId, yakubaraiEffect);

    // 最大HPブースト (符玄の最大HP基準)
    const hpBoostValue = source.stats.hp * talentValues.hpBoost;
    const hpBoostEffect: IEffect = {
        id: EFFECT_IDS.HP_BOOST(sourceId, targetId),
        name: '厄払い (HP)',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        modifiers: [
            { target: 'hp' as StatKey, value: hpBoostValue, type: 'add' as const, source: '厄払い' }
        ],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, targetId, hpBoostEffect);

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

    // HP回復発動回数を初期化
    newState = setHpRecoveryCharges(newState, sourceUnitId, TALENT_INITIAL_CHARGES);

    // 味方全体に厄払いを付与
    const allies = newState.registry.getAliveAllies();
    for (const ally of allies) {
        newState = applyYakubarai(newState, sourceUnitId, ally.id, eidolonLevel);
    }

    // 秘技使用フラグを確認（デフォルト true）
    const useTechnique = unit.config?.useTechnique !== false;
    if (useTechnique) {
        // 秘技: 自動で戦闘スキル発動（2ターン）
        newState = deployMatrix(newState, sourceUnitId, eidolonLevel);
        // 継続ターンを2ターンに修正
        const matrixEffect = newState.registry.get(createUnitId(sourceUnitId))?.effects.find(
            e => e.id === EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceUnitId)
        );
        if (matrixEffect) {
            newState = removeEffect(newState, sourceUnitId, matrixEffect.id);
            const modifiedEffect: IEffect = {
                ...matrixEffect,
                duration: 2
            };
            newState = addEffect(newState, sourceUnitId, modifiedEffect);
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
    // 符玄自身のターン開始時のみ処理
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // A6: 行動制限デバフ抵抗（窮観の陣中、味方全体に1回）
    // 未実装: デバフ抵抗システムは別途実装が必要

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

    // 窮観の陣を展開
    return deployMatrix(state, sourceUnitId, eidolonLevel);
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

    // HP回復発動回数+1
    const currentCharges = getHpRecoveryCharges(newState, sourceUnitId);
    newState = setHpRecoveryCharges(newState, sourceUnitId, currentCharges + 1);

    // A2: 窮観の陣中、味方全体回復
    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_TAIYI);
    if (hasA2 && isMatrixActive(newState, sourceUnitId)) {
        const allies = newState.registry.getAliveAllies();
        for (const ally of allies) {
            newState = applyHealing(
                newState,
                sourceUnitId,
                ally.id,
                { scaling: 'hp', multiplier: A2_HEAL_PCT, flat: A2_HEAL_FLAT },
                '太乙の身',
                true
            );
        }
    }

    return newState;
};

/**
 * ダメージ受ける前 (ダメージ分担情報の保存とEP回復)
 * ON_DAMAGE_DEALTの直前、ダメージ計算は終わっているが適用前のフックがあればベストだが、
 * 現状のアーキテクチャでは ON_DAMAGE_DEALT (事後) で処理せざるを得ない部分と、
 * ON_BEFORE_DAMAGE_CALCULATION (事前) で処理する部分に分ける。
 *
 * ここでは E4 のEP回復などのトリガー処理を行う。
 * 実際のダメージ転送は onTransferDamage (ON_DAMAGE_DEALT内) で行う。
 */
const onDamageTransferCheck = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 符玄自身へのダメージは分担しない
    if (event.targetId === sourceUnitId) return state;
    if (!event.targetId) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || target.isEnemy) return state;

    // 厄払いを持っているか確認
    const yakubaraiEffect = target.effects.find(
        e => e.id === EFFECT_IDS.YAKUBARAI(sourceUnitId, event.targetId!)
    );
    if (!yakubaraiEffect || !isYakubaraiEffect(yakubaraiEffect)) return state;

    let newState = state;

    // 分担ダメージ量の計算 (event.value は既に軽減された後のダメージの可能性があるため、逆算が必要だが、
    // ここでは簡略化して「符玄が受けたダメージ」をベースにするロジックが望ましい。
    // しかし DamageDealtEvent には「誰がどれだけ分担したか」の情報がない。
    // したがって、E4の実装は「符玄がダメージを受けた時」のトリガー（onAfterDamageReceived）で行うのが自然かもしれないが、
    // 仕様では「味方のダメージを分担する時」なのでここで判定する。

    // 今回の実装では、ON_BEFORE_DAMAGE_CALCULATION でダメージ係数を下げているため、
    // event.value は「符玄分担分が引かれた後のダメージ」になっているはず。
    // なので、分担されたダメージ = event.value / (1 - 0.65) * 0.65 
    // ただし計算誤差や他の軽減もあるため、正確には
    // 「本来受けるはずだったダメージ」を推定するのは難しい。

    // アプローチ変更: ここでは簡易的に「分担が発生した」事実に基づいてEP回復を行う。
    // 実際のダメージ量は問わない（または固定値とみなす）か、
    // あるいは後述の transferDamageToFuXuan 関数内で処理を統合する。

    return newState;
};

/**
 * ダメージ分担の実行 (符玄へのダメージ適用)
 * ON_DAMAGE_DEALT で呼び出される
 */
const transferDamageToFuXuan = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.targetId === sourceUnitId) return state;
    if (!event.targetId) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || target.isEnemy) return state;

    // 厄払い確認
    const yakubaraiEffect = target.effects.find(
        e => e.id === EFFECT_IDS.YAKUBARAI(sourceUnitId, event.targetId!)
    );
    if (!yakubaraiEffect || !isYakubaraiEffect(yakubaraiEffect)) return state;

    const damageShare = yakubaraiEffect.damageShare; // 0.65

    // 味方が受けたダメージは既に 35% になっているので、
    // 元のダメージ = event.value / (1 - damageShare)
    // 符玄が受けるダメージ = 元のダメージ * damageShare
    //                      = event.value / (1 - damageShare) * damageShare
    // 例: 元1000 -> 味方350 (event.value). 符玄 = 350 / 0.35 * 0.65 = 1000 * 0.65 = 650.

    // ゼロ除算回避
    if (damageShare >= 1) return state;

    const sharedDamage = (event.value / (1 - damageShare)) * damageShare;
    if (sharedDamage <= 0) return state;

    let newState = state;

    // 符玄にダメージを与える (applyUnifiedDamageなどは循環参照のリスクがあるため、直接HPを操作するか、再帰を防ぐフラグ付きでダメージ関数を呼ぶ)
    // ここでは簡易的にHP直接操作とログ記録を行う
    // ※本来は applyUnifiedDamage を使って符玄の防御力などを適用すべきか？
    // 仕様: "符玄が分担"。通常、分担ダメージは防御力計算前の生のダメージの一部を受け持つか、
    // 軽減後のダメージを受け持つかだが、崩壊スターレイルの仕様では
    // 「味方が受ける最終ダメージ」の一定割合を肩代わりし、その肩代わりダメージには符玄の防御等は適用されない（確定ダメージ扱い）。
    // したがって、上記計算式で算出した sharedDamage をそのまま減らす。

    const fuXuan = newState.registry.get(createUnitId(sourceUnitId));
    if (!fuXuan || fuXuan.hp <= 0) return newState;

    const newHp = Math.max(0, fuXuan.hp - sharedDamage);
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
            ...u,
            hp: newHp
        }))
    };

    // ログ記録用のダミーイベント等は省略（システムログに出るのが望ましいが）

    // E4: ダメージ分担時EP+5
    if (eidolonLevel >= 4) {
        const refreshedFuXuan = newState.registry.get(createUnitId(sourceUnitId));
        if (refreshedFuXuan) {
            const newEp = Math.min(refreshedFuXuan.ep + E4_EP_GAIN, refreshedFuXuan.stats.max_ep || 135);
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                    ...u,
                    ep: newEp
                }))
            };
        }
    }

    // HP減少時のトリガー（天賦回復）をチェックするために、再帰的に onAfterDamageReceived を呼ぶか、
    // ここでチェックロジックを呼ぶ
    // 符玄自身がダメージを受けた扱いとして処理
    const damageEvents: DamageDealtEvent = {
        ...event,
        targetId: sourceUnitId,
        value: sharedDamage,
        // 無限ループ防止のため sourceId は変更しない、または区別できるフラグが必要だが、
        // onAfterDamageReceived は targetId === sourceUnitId の時のみ動くので、
        // ここで擬似的にイベントを作って渡せば動く
    };

    newState = onAfterDamageReceived(damageEvents, newState, sourceUnitId, eidolonLevel);

    return newState;
};

/**
 * ダメージ受けた後 (HP回復発動チェック)
 */
const onAfterDamageReceived = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 符玄自身へのダメージのみチェック
    if (event.targetId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit || unit.hp <= 0) return state;

    const hpRatio = unit.hp / unit.stats.hp;
    if (hpRatio > TALENT_HEAL_THRESHOLD) return state;

    // HP回復発動回数を確認
    const charges = getHpRecoveryCharges(state, sourceUnitId);
    if (charges <= 0) return state;

    let newState = state;

    // 回復発動
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const talentValues = getLeveledValue(ABILITY_VALUES.talentValues, talentLevel);
    const lostHp = unit.stats.hp - unit.hp;
    const healAmount = lostHp * talentValues.healPct;

    newState = applyHealing(
        newState,
        sourceUnitId,
        sourceUnitId,
        healAmount,
        '天賦HP回復',
        true
    );

    // 回復回数を減らす
    newState = setHpRecoveryCharges(newState, sourceUnitId, charges - 1);

    // A4: 自身以外の味方も回復
    const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_DUNJIA);
    if (hasA4) {
        const allies = newState.registry.getAliveAllies().filter(a => a.id !== sourceUnitId);
        for (const ally of allies) {
            newState = applyHealing(
                newState,
                sourceUnitId,
                ally.id,
                { scaling: 'hp', multiplier: A4_HEAL_PCT, flat: 0 },
                '遁甲の身',
                true
            );
        }
    }

    return newState;
};

/**
 * 致命ダメージ時 (E2: 戦闘不能回避)
 */
const onFatalDamage = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (eidolonLevel < 2) return state;
    if (!event.targetId) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || target.isEnemy) return state;

    // 窮観の陣が展開されているか確認
    if (!isMatrixActive(state, sourceUnitId)) return state;

    // E2が使用済みか確認
    const fuXuan = state.registry.get(createUnitId(sourceUnitId));
    if (!fuXuan) return state;
    const e2Used = fuXuan.effects.some(e => e.id === EFFECT_IDS.E2_USED(sourceUnitId));
    if (e2Used) return state;

    let newState = state;

    // ターゲットのHPを70%に回復
    const newHp = target.stats.hp * E2_REVIVE_HP;
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(event.targetId), u => ({
            ...u,
            hp: newHp
        }))
    };

    // E2使用済みフラグを設定
    const e2UsedEffect: IEffect = {
        id: EFFECT_IDS.E2_USED(sourceUnitId),
        name: '四象 (使用済み)',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, e2UsedEffect);

    return newState;
};

/**
 * 符玄が戦闘不能になった時、厄払いを解除
 */
const checkFuXuanDeath = (
    state: GameState,
    sourceUnitId: string
): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit || unit.hp > 0) return state;

    // 厄払いを全員から解除
    let newState = state;
    const allies = newState.registry.getAliveAllies();
    for (const ally of allies) {
        newState = removeEffect(newState, ally.id, EFFECT_IDS.YAKUBARAI(sourceUnitId, ally.id));
        newState = removeEffect(newState, ally.id, EFFECT_IDS.HP_BOOST(sourceUnitId, ally.id));
    }

    // 窮観の陣も解除
    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.MATRIX_OF_PRESCIENCE(sourceUnitId));

    return newState;
};

/**
 * E6バフの後処理 (ダメージ適用後に解除)
 */
const resolveE6Bonus = (
    state: GameState,
    sourceUnitId: string
): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const e6Effect = unit.effects.find(e => e.id === EFFECT_IDS.E6_BONUS(sourceUnitId));
    if (!e6Effect || !isE6BonusEffect(e6Effect)) return state;

    // 結論: E6 Effect に `value` プロパティを持たせる (isE6BonusEffectで確認済み)
    const bonusValue = e6Effect.customValue;

    const currentUltDmg = state.damageModifiers.ultDmg || 0;
    let newState = {
        ...state,
        damageModifiers: {
            ...state.damageModifiers,
            ultDmg: Math.max(0, currentUltDmg - bonusValue)
        }
    };

    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.E6_BONUS(sourceUnitId));
    return newState;
};

/**
 * ダメージ計算前 (E6: 動的与ダメアップ + ダメージ分担による軽減)
 */
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 1. ダメージ分担ロジック (被ダメージ軽減)
    // 符玄以外が攻撃を受けた時
    if (event.targetId && event.targetId !== sourceUnitId) {
        const target = state.registry.get(createUnitId(event.targetId));
        if (target && !target.isEnemy) {
            const yakubaraiEffect = target.effects.find(
                e => e.id === EFFECT_IDS.YAKUBARAI(sourceUnitId, event.targetId!)
            );

            if (yakubaraiEffect && isYakubaraiEffect(yakubaraiEffect)) {
                // ダメージ分担率だけダメージを減らす (例: 65%分担 -> 0.65軽減)
                // dmgTakenReduction を使用する。これは被ダメージ軽減として作用する。
                // 既に他の軽減がある場合は加算される (例: 10%軽減 + 65%軽減 = 75%軽減)。
                // 独立乗算ではないが、仕様としてはこれで十分と仮定。

                const currentReduction = state.damageModifiers.dmgTakenReduction || 0;

                state = {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        dmgTakenReduction: currentReduction + yakubaraiEffect.damageShare
                    }
                };
            }
        }
    }

    // 2. E6: 動的与ダメアップ (必殺技時)
    if (eidolonLevel >= 6 && event.sourceId === sourceUnitId &&
        (event.subType === 'Ultimate' || event.subType === 'ULTIMATE_DAMAGE')) {

        if (isMatrixActive(state, sourceUnitId)) {
            const fuXuan = state.registry.get(createUnitId(sourceUnitId));
            if (fuXuan) {
                const allies = state.registry.getAliveAllies();
                let injuredCount = 0;
                for (const ally of allies) {
                    if (ally.hp < ally.stats.hp) {
                        injuredCount++;
                    }
                }

                if (injuredCount > 0) {
                    const dmgBonus = Math.min(injuredCount * E6_DMG_PER_ALLY, E6_DMG_CAP);

                    const currentUltDmg = state.damageModifiers.ultDmg || 0;
                    state = {
                        ...state,
                        damageModifiers: {
                            ...(state.damageModifiers || {}),
                            ultDmg: (currentUltDmg + dmgBonus) as number
                        }
                    };

                    // 解除用にEffectを付与して値を保存
                    const e6Effect: E6BonusEffect = {
                        id: EFFECT_IDS.E6_BONUS(sourceUnitId),
                        name: '周天 (一時バフ)',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT', // Manual removal
                        duration: -1,
                        apply: (t, s) => s,
                        remove: (t, s) => s,
                        customValue: dmgBonus // 型定義に従って直接設定
                    };

                    state = addEffect(state, sourceUnitId, e6Effect);
                }
            }
        }
    }

    return state;
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
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            switch (event.type) {
                case 'ON_BATTLE_START':
                    return onBattleStart(event, state, sourceUnitId, eidolonLevel);
                case 'ON_TURN_START':
                    return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_SKILL_USED':
                    return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_ULTIMATE_USED':
                    return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_DAMAGE_DEALT': {
                    // ダメージ分担処理 (符玄への転送)
                    let newState = transferDamageToFuXuan(event as DamageDealtEvent, state, sourceUnitId, eidolonLevel);
                    // HP回復発動チェック
                    newState = onAfterDamageReceived(event as DamageDealtEvent, newState, sourceUnitId, eidolonLevel);
                    // E2: 戦闘不能回避
                    newState = onFatalDamage(event as DamageDealtEvent, newState, sourceUnitId, eidolonLevel);

                    // E6バフ解除
                    newState = resolveE6Bonus(newState, sourceUnitId);

                    // 死亡チェック (最後に行う)
                    newState = checkFuXuanDeath(newState, sourceUnitId);

                    return newState;
                }
                case 'ON_BEFORE_DAMAGE_CALCULATION':
                    return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
                default:
                    return state;
            }
        }
    };
};
