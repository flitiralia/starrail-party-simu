import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, IEvent, GameState, Unit, DamageDealtEvent, ActionEvent, BeforeDamageCalcEvent, GeneralEvent } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { calculateAbilityLevel, getLeveledValue } from '../../simulator/utils/abilityLevel';

// --- 定数定義 ---
const CHARACTER_ID = 'argenti';

// エフェクトID
const EFFECT_IDS = {
    GLORY: (unitId: string) => `${CHARACTER_ID}-glory-${unitId}`,
    E2_ATK_BUFF: (unitId: string) => `${CHARACTER_ID}-e2-atk-${unitId}`,
} as const;

// 軌跡ID
const TRACE_IDS = {
    A2_PIETY: `${CHARACTER_ID}-trace-a2`,      // 敬虔
    A4_GENEROUS: `${CHARACTER_ID}-trace-a4`,   // 慷慨
    A6_COURAGE: `${CHARACTER_ID}-trace-a6`,    // 勇気
} as const;

// --- アビリティ倍率 (デフォルトレベル基準) ---

// 通常攻撃 (Lv6: 100%, Lv7: 110%)
const BASIC_MULT = 1.0;

// スキル (Lv10: 120%, Lv12: 132%)
const SKILL_MULT = 1.2;

// 必殺技90EP (Lv10: 160%, Lv12: 172.8%)
const ULT_90_MULT = 1.6;

// 必殺技180EP: バウンス回数
const ULT_180_BOUNCE_COUNT = 6;

// 天賦 (Lv10: 2.5%, Lv12: 2.8%)
const TALENT_EP_GAIN = 3;
const TALENT_CRIT_RATE_PER_STACK = 0.025;
const MAX_GLORY_STACKS = 10;

// E1: 栄達1層につき会心ダメージ+4%
const E1_CRIT_DMG_PER_STACK = 0.04;

// E2: 敵3体以上時ATK+40%
const E2_ENEMY_THRESHOLD = 3;
const E2_ATK_BUFF = 0.40;

// E4: 戦闘開始時栄達+2層、最大層数+2
const E4_INITIAL_STACKS = 2;
const E4_MAX_STACKS_BONUS = 2;

// E6: 必殺技時敵防御力30%無視
const E6_DEF_IGNORE = 0.30;

// A6: HP50%以下の敵に与ダメ+15%
const A6_DMG_BOOST = 0.15;
const A6_HP_THRESHOLD = 0.50;

// --- E3/E5パターン ---
const ABILITY_VALUES = {
    skillDmg: {
        10: { mult: 1.2 },
        12: { mult: 1.32 }
    } as Record<number, { mult: number }>,
    ult90Dmg: {
        10: { mult: 1.6 },
        12: { mult: 1.728 }
    } as Record<number, { mult: number }>,
    ult180Main: {
        10: { mult: 2.8 },
        12: { mult: 3.024 }
    } as Record<number, { mult: number }>,
    ult180Bounce: {
        10: { mult: 0.95 },
        12: { mult: 1.026 }
    } as Record<number, { mult: number }>,
    talentCritRate: {
        10: { rate: 0.025 },
        12: { rate: 0.028 }
    } as Record<number, { rate: number }>,
};

// --- キャラクター定義 ---
export const argenti: Character = {
    id: CHARACTER_ID,
    name: 'アルジェンティ',
    path: 'Erudition',
    element: 'Physical',
    rarity: 5,
    maxEnergy: 180,  // 180EP版が最大
    baseStats: {
        hp: 1047,
        atk: 737,
        def: 363,
        spd: 103,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75  // 知恵
    },

    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: '刹那の芬芳',
            type: 'Basic ATK',
            description: '指定した敵単体にアルジェンティの攻撃力100%分の物理ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: BASIC_MULT, toughnessReduction: 10 }],
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: `${CHARACTER_ID}-skill`,
            name: '公正、ここに咲き誇る',
            type: 'Skill',
            description: '敵全体にアルジェンティの攻撃力120%分の物理ダメージを与える。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: SKILL_MULT, toughnessReduction: 10 }],
            },
            energyGain: 30,
            targetType: 'all_enemies',
        },

        // 必殺技: 90EP版をデフォルトとして定義（90EP/180EPはハンドラで分岐）
        // 90EP版: 160%倍率、180EP版: 280%+95%×6
        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: '花園にて捧げる美の際限',
            type: 'Ultimate',
            description: 'EPを90/180消費し、敵全体にダメージを与える。180EP版は追加で6回ランダム攻撃。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: ULT_90_MULT, toughnessReduction: 20 }],
            },
            energyGain: 5,
            targetType: 'all_enemies',
        },

        talent: {
            id: `${CHARACTER_ID}-talent`,
            name: '崇高なる客体',
            type: 'Talent',
            description: '攻撃が敵1体に命中するごとにアルジェンティのEPを3回復し、「栄達」を1層獲得する。',
        },

        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: '純粋で高潔なる宣言',
            type: 'Technique',
            description: '秘技を使用した後、敵全体にアルジェンティの攻撃力80%分の物理ダメージを与え、EPを15回復する。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_PIETY,
            name: '敬虔',
            type: 'Bonus Ability',
            description: 'ターンが回ってきた時、「栄達」を1層獲得する。'
        },
        {
            id: TRACE_IDS.A4_GENEROUS,
            name: '慷慨',
            type: 'Bonus Ability',
            description: '敵が戦闘に入った時、自身のEPを2回復する。'
        },
        {
            id: TRACE_IDS.A6_COURAGE,
            name: '勇気',
            type: 'Bonus Ability',
            description: '残りHPが50%以下の敵に対して与ダメージ+15%。'
        },
        {
            id: `${CHARACTER_ID}-stat-atk`,
            name: '攻撃力強化',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct' as StatKey,
            value: 0.28
        },
        {
            id: `${CHARACTER_ID}-stat-physical`,
            name: '物理ダメージ強化',
            type: 'Stat Bonus',
            description: '物理ダメージ+14.4%',
            stat: 'physical_dmg_boost' as StatKey,
            value: 0.144
        },
        {
            id: `${CHARACTER_ID}-stat-hp`,
            name: 'HP強化',
            type: 'Stat Bonus',
            description: '最大HP+10.0%',
            stat: 'hp_pct' as StatKey,
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '審美王国の欠陥',
            description: '「栄達」1層につき、さらに会心ダメージ+4%。'
        },
        e2: {
            level: 2,
            name: 'メノウの謙遜',
            description: '必殺技を発動した時、フィールド上の敵が3体以上の場合、攻撃力+40%、1ターン継続。'
        },
        e3: {
            level: 3,
            name: '荊棘の道の栄光',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                { abilityName: 'skill', param: 'damage.hits.0.multiplier', value: 1.32 },
                // 天賦のLv+2は calculateAbilityLevel で処理
            ]
        },
        e4: {
            level: 4,
            name: 'トランペットの奉献',
            description: '戦闘開始時、「栄達」を2層獲得し、天賦の累積可能層数+2。'
        },
        e5: {
            level: 5,
            name: '宇宙のどこかで降る雪',
            description: '必殺技のLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // 通常攻撃: Lv6(100%) → Lv7(110%)
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 },
                // 必殺技: 90EP版 Lv10(160%) → Lv12(172.8%)
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 1.728 },
            ]
        },
        e6: {
            level: 6,
            name: '「貴女」の輝き',
            description: '必殺技を発動した時、敵の防御力を30%無視する。'
        }
    },

    defaultConfig: {
        lightConeId: 'an-instant-before-a-gaze',
        superimposition: 1,
        relicSetId: 'scholar-lost-in-erudition',
        ornamentSetId: 'inert-salsotto',
        mainStats: {
            body: 'crit_rate',
            feet: 'spd',
            sphere: 'physical_dmg_boost',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.20 },
            { stat: 'crit_dmg', value: 0.40 },
            { stat: 'spd', value: 8 },
            { stat: 'atk_pct', value: 0.15 },
        ],
        rotationMode: 'spam_skill',
        spamSkillTriggerSp: 1,
        ultStrategy: 'immediate' as const,
        ultEpOption: 'argenti_180' as const,
    }
};

// --- ヘルパー関数 ---

/**
 * 栄達スタックを取得
 * ※ 現在はaddGloryStacks内でのみ使用、将来の拡張用に保持
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getGloryStacks(state: GameState, unitId: string): number {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.GLORY(unitId));
    return effect?.stackCount || 0;
}

/**
 * 最大栄達スタックを取得（E4で+2）
 */
function getMaxGloryStacks(eidolonLevel: number): number {
    return MAX_GLORY_STACKS + (eidolonLevel >= 4 ? E4_MAX_STACKS_BONUS : 0);
}

/**
 * 栄達スタックを追加
 */
function addGloryStacks(state: GameState, unitId: string, amount: number, eidolonLevel: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const currentStacks = getGloryStacks(state, unitId);
    const maxStacks = getMaxGloryStacks(eidolonLevel);
    const newStacks = Math.min(currentStacks + amount, maxStacks);

    // 天賦レベル計算
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const talentValues = getLeveledValue(ABILITY_VALUES.talentCritRate, talentLevel);
    const critRatePerStack = talentValues.rate;

    const gloryEffect: IEffect = {
        id: EFFECT_IDS.GLORY(unitId),
        name: '栄達',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: newStacks,
        modifiers: [
            {
                target: 'crit_rate' as StatKey,
                // StatBuilderがstackCountで自動乗算するため、1層あたりの値を設定
                value: critRatePerStack,
                type: 'add' as const,
                source: '栄達'
            },
            // E1: 栄達1層につき会心ダメージ+4%
            ...(eidolonLevel >= 1 ? [{
                target: 'crit_dmg' as StatKey,
                value: E1_CRIT_DMG_PER_STACK,
                type: 'add' as const,
                source: '栄達 (E1)'
            }] : [])
        ],
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };

    // 既存エフェクトを削除して新しいスタックで追加
    let newState = removeEffect(state, unitId, EFFECT_IDS.GLORY(unitId));
    newState = addEffect(newState, unitId, gloryEffect);

    return newState;
}

/**
 * 栄達スタックをリセット
 * ※ 仕様書にリセットの記載がないため未使用、将来の拡張用に保持
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function resetGloryStacks(state: GameState, unitId: string): GameState {
    return removeEffect(state, unitId, EFFECT_IDS.GLORY(unitId));
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
    let newState = state;

    // E4: 戦闘開始時に栄達+2層
    if (eidolonLevel >= 4) {
        newState = addGloryStacks(newState, sourceUnitId, E4_INITIAL_STACKS, eidolonLevel);
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

    // A2: ターン開始時に栄達+1層
    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_PIETY);
    if (hasA2) {
        newState = addGloryStacks(newState, sourceUnitId, 1, eidolonLevel);
    }

    return newState;
};

/**
 * ダメージ発生時（天賦）
 */
const onDamageDealt = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 天賦: 敵に命中するごとにEP+3、栄達+1層
    newState = addEnergyToUnit(newState, sourceUnitId, TALENT_EP_GAIN);
    newState = addGloryStacks(newState, sourceUnitId, 1, eidolonLevel);

    return newState;
};

/**
 * 敵出現時
 */
const onEnemySpawned = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // A4: 敵が戦闘に入った時、EP+2
    const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_GENEROUS);
    if (hasA4) {
        newState = addEnergyToUnit(newState, sourceUnitId, 2);
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
    if (event.sourceId !== sourceUnitId) return state;
    if (!event.targetId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    const target = state.registry.get(createUnitId(event.targetId));
    if (!source || !target) return state;

    let newState = state;
    let damageModifiers = { ...newState.damageModifiers };

    // A6: 残りHP50%以下の敵に与ダメ+15%
    const hasA6 = source.traces?.some(t => t.id === TRACE_IDS.A6_COURAGE);
    if (hasA6 && target.hp / target.stats.hp <= A6_HP_THRESHOLD) {
        damageModifiers.allTypeDmg = (damageModifiers.allTypeDmg || 0) + A6_DMG_BOOST;
    }

    // E6: 必殺技発動時、敵の防御力30%無視
    if (eidolonLevel >= 6 && event.subType === 'ULTIMATE_DAMAGE') {
        damageModifiers.defIgnore = (damageModifiers.defIgnore || 0) + E6_DEF_IGNORE;
    }

    newState = { ...newState, damageModifiers };
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

    // E2: フィールド上の敵が3体以上の場合、ATK+40%
    if (eidolonLevel >= 2) {
        const aliveEnemies = newState.registry.getAliveEnemies();
        if (aliveEnemies.length >= E2_ENEMY_THRESHOLD) {
            const e2Effect: IEffect = {
                id: EFFECT_IDS.E2_ATK_BUFF(sourceUnitId),
                name: '審美の恩寵 (E2)',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_END_BASED',
                duration: 1,
                modifiers: [{
                    target: 'atk_pct' as StatKey,
                    value: E2_ATK_BUFF,
                    type: 'add' as const,
                    source: '審美の恩寵 (E2)'
                }],
                onApply: (t: Unit, s: GameState) => s,
                onRemove: (t: Unit, s: GameState) => s
            };
            newState = addEffect(newState, sourceUnitId, e2Effect);
        }
    }

    // 180EP版の場合、メイン倍率の追加分 + 6回のバウンスダメージを追加
    const is180EPVersion = source.config?.ultEpOption === 'argenti_180';
    if (is180EPVersion) {
        const aliveEnemies = newState.registry.getAliveEnemies();
        if (aliveEnemies.length > 0) {
            // E5で必殺技レベルが上がる
            const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
            const mainValues = getLeveledValue(ABILITY_VALUES.ult180Main, ultLevel);
            const bounceValues = getLeveledValue(ABILITY_VALUES.ult180Bounce, ultLevel);
            const ult90Values = getLeveledValue(ABILITY_VALUES.ult90Dmg, ultLevel);

            // 180EP版のメインダメージと90EP版の差分を追加ダメージとして適用
            // 180EP版: 280%, 90EP版: 160% → 差分: 120%
            const additionalMainMult = mainValues.mult - ult90Values.mult;
            const bounceMult = bounceValues.mult;

            // メインダメージの追加分（全体攻撃）
            for (const enemy of aliveEnemies) {
                const additionalBaseDamage = source.stats.atk * additionalMainMult;
                const additionalDmgCalc = calculateNormalAdditionalDamageWithCritInfo(source, enemy, additionalBaseDamage);
                const additionalResult = applyUnifiedDamage(
                    newState,
                    source,
                    enemy,
                    additionalDmgCalc.damage,
                    {
                        damageType: 'ULTIMATE_DAMAGE',
                        details: '必殺技: 180EP版追加ダメージ',
                        skipLog: true,
                        isCrit: additionalDmgCalc.isCrit,
                        breakdownMultipliers: additionalDmgCalc.breakdownMultipliers,
                        additionalDamageEntry: {
                            source: source.name,
                            name: '180EP追加',
                            damageType: 'additional',
                            isCrit: additionalDmgCalc.isCrit,
                            breakdownMultipliers: additionalDmgCalc.breakdownMultipliers
                        }
                    }
                );
                newState = additionalResult.state;
            }

            // 6回のバウンスダメージ（各5削靭値）
            for (let i = 0; i < ULT_180_BOUNCE_COUNT; i++) {
                // ランダムな敵を選択
                const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
                const baseDamage = source.stats.atk * bounceMult;

                const dmgCalc = calculateNormalAdditionalDamageWithCritInfo(source, randomEnemy, baseDamage);
                const result = applyUnifiedDamage(
                    newState,
                    source,
                    randomEnemy,
                    dmgCalc.damage,
                    {
                        damageType: 'ULTIMATE_DAMAGE',
                        details: `必殺技: バウンス${i + 1}`,
                        skipLog: true,
                        isCrit: dmgCalc.isCrit,
                        breakdownMultipliers: dmgCalc.breakdownMultipliers,
                        additionalDamageEntry: {
                            source: source.name,
                            name: `バウンス${i + 1}`,
                            damageType: 'additional',
                            isCrit: dmgCalc.isCrit,
                            breakdownMultipliers: dmgCalc.breakdownMultipliers
                        }
                    }
                );
                newState = result.state;

                // バウンスの削靭値を適用（5 per bounce）
                const updatedEnemy = newState.registry.get(createUnitId(randomEnemy.id));
                if (updatedEnemy && updatedEnemy.toughness > 0) {
                    const newToughness = Math.max(0, updatedEnemy.toughness - 5);
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
    }

    // 必殺技発動後に栄達をリセット（仕様では明記されていないが、多くのキャラで同様）
    // ※ アルジェンティの仕様書には栄達リセットの記載がないため、コメントアウト
    // newState = resetGloryStacks(newState, sourceUnitId);

    return newState;
};

// --- ハンドラーファクトリ ---
export const argentiHandlerFactory: IEventHandlerFactory = (
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
                'ON_DAMAGE_DEALT',
                'ON_ENEMY_SPAWNED',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_ULTIMATE_USED',
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

            if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event as DamageDealtEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ENEMY_SPAWNED') {
                return onEnemySpawned(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
