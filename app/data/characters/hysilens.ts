/**
 * セイレンス (Hysilens)
 * 物理属性・虚無運命の5星キャラクター
 * 
 * 主要メカニズム:
 * - 結界展開: 敵全体にATK/DEFデバフ、持続ダメージトリガー
 * - 天賦: 味方攻撃時に風化/裂創/燃焼/感電を自動付与
 * - 結界中の追加持続ダメージ: 敵ターン開始時・味方攻撃後に発動（最大8回）
 */

import { Character, StatKey } from '../../types';
import {
    IEventHandlerFactory,
    GameState,
    IEvent,
    Unit,
    GeneralEvent,
    ActionEvent,
    IAura,
    DoTDamageEvent
} from '../../simulator/engine/types';
import { SimulationLogEntry } from '../../types';

import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { addAura, removeAura } from '../../simulator/engine/auraManager';
import { IEffect, DoTEffect } from '../../simulator/effect/types';
import { calculateNormalDoTDamageWithBreakdown, calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';
import { applyUnifiedDamage, appendAdditionalDamage, checkDebuffSuccess, publishEvent } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';

// --- 定数定義 ---
const CHARACTER_ID = 'hysilens';

// エフェクトID
const EFFECT_IDS = {
    BARRIER: (sourceId: string) => `${CHARACTER_ID}-barrier-${sourceId}`,
    BARRIER_ATK_DEBUFF: (sourceId: string) => `${CHARACTER_ID}-barrier-atk-debuff-${sourceId}`,
    BARRIER_DEF_DEBUFF: (sourceId: string) => `${CHARACTER_ID}-barrier-def-debuff-${sourceId}`,
    BARRIER_TRIGGER_COUNT: (sourceId: string) => `${CHARACTER_ID}-barrier-trigger-count-${sourceId}`,
    SKILL_VULN_DEBUFF: (sourceId: string, targetId: string) => `${CHARACTER_ID}-skill-vuln-${sourceId}-${targetId}`,
    WINDSHEAR: (sourceId: string, targetId: string) => `${CHARACTER_ID}-windshear-${sourceId}-${targetId}`,
    BLEED: (sourceId: string, targetId: string) => `${CHARACTER_ID}-bleed-${sourceId}-${targetId}`,
    BURN: (sourceId: string, targetId: string) => `${CHARACTER_ID}-burn-${sourceId}-${targetId}`,
    SHOCK: (sourceId: string, targetId: string) => `${CHARACTER_ID}-shock-${sourceId}-${targetId}`,
    A6_DMG_BOOST: (sourceId: string) => `${CHARACTER_ID}-a6-dmg-boost-${sourceId}`,
    E1_DOT_BOOST_AURA: (sourceId: string) => `${CHARACTER_ID}-e1-dot-boost-${sourceId}`,
    E4_RES_SHRED: (sourceId: string) => `${CHARACTER_ID}-e4-res-shred-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2: `${CHARACTER_ID}-trace-a2`, // 征服の剣旗
    A4: `${CHARACTER_ID}-trace-a4`, // 盛宴の泡沫
    A6: `${CHARACTER_ID}-trace-a6`, // 真珠の琴線
} as const;

// --- アビリティ倍率 (デフォルトレベル基準) ---

// 通常攻撃 (Lv6)
const BASIC_MULT = 1.00;

// 戦闘スキル (Lv10)
const SKILL_DAMAGE_MULT = 1.40;
const SKILL_VULN_PCT = 0.20; // 受けるダメージ+20%

// 必殺技 (Lv10)
const ULT_DAMAGE_MULT = 2.00;
const ULT_ATK_DEBUFF = 0.15;
const ULT_DEF_DEBUFF = 0.25;
const ULT_DOT_TRIGGER_MULT = 0.80; // 結界DoT倍率

// 天賦 (Lv10)
const TALENT_DOT_MULT = 0.25; // 風化/燃焼/感電
const DOT_DURATION = 2;

// 結界
const BARRIER_DURATION = 3;
const BARRIER_MAX_TRIGGERS = 8;
const E6_BARRIER_MAX_TRIGGERS = 12;

// A6: 真珠の琴線
const A6_EFFECT_HIT_THRESHOLD = 0.60;
const A6_DMG_BOOST_PER_10PCT = 0.15;
const A6_MAX_DMG_BOOST = 0.90;

// E1
const E1_DOT_BOOST = 0.16; // 持続ダメージ116% → +16%

// E6
const E6_DOT_TRIGGER_MULT_BONUS = 0.20;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 戦闘スキル
    skillDamage: {
        10: { mult: 1.40, vuln: 0.20 },
        12: { mult: 1.54, vuln: 0.22 }
    } as Record<number, { mult: number; vuln: number }>,

    // 必殺技
    ultDamage: {
        10: { mult: 2.00, defDebuff: 0.25, dotTriggerMult: 0.80 },
        12: { mult: 2.16, defDebuff: 0.27, dotTriggerMult: 0.88 }
    } as Record<number, { mult: number; defDebuff: number; dotTriggerMult: number }>,

    // 天賦
    talentDot: {
        10: 0.25,
        12: 0.275
    } as Record<number, number>,

    // 通常攻撃
    basicDamage: {
        6: 1.00,
        7: 1.10
    } as Record<number, number>,
};

// --- キャラクター定義 ---
export const hysilens: Character = {
    id: CHARACTER_ID,
    name: 'セイレンス',
    path: 'Nihility',
    element: 'Physical',
    rarity: 5,
    maxEnergy: 110,
    baseStats: {
        hp: 1203,
        atk: 601,
        def: 485,
        spd: 102,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100
    },

    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: '短調、止水に響く',
            type: 'Basic ATK',
            description: '指定した敵単体にセイレンスの攻撃力100%分の物理属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.50, toughnessReduction: 5 },
                    { multiplier: 0.50, toughnessReduction: 5 }
                ],
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: `${CHARACTER_ID}-skill`,
            name: '倍音、暗流の先の斉唱',
            type: 'Skill',
            description: '100%の基礎確率で敵全体の受けるダメージ+20%、3ターン継続。同時に敵全体にセイレンスの攻撃力140%分の物理属性ダメージを与える。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.70, toughnessReduction: 5 },
                    { multiplier: 0.70, toughnessReduction: 5 }
                ],
            },
            energyGain: 30,
            targetType: 'all_enemies',
        },

        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: '絶海の渦潮、呑魂の舞曲',
            type: 'Ultimate',
            description: 'セイレンスが結界を展開し、敵の攻撃力-15%、防御力-25%。敵全体にセイレンスの攻撃力200%分の物理属性ダメージを与える。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 2.00, toughnessReduction: 20 }],
            },
            energyGain: 5,
            targetType: 'all_enemies'
        },

        talent: {
            id: `${CHARACTER_ID}-talent`,
            name: 'セイレーンの歓歌',
            type: 'Talent',
            description: '味方が攻撃する時、セイレンスは100%の基礎確率でその味方が攻撃を受けた敵に風化/裂創/燃焼/感電状態のいずれか1種類を付与する。',
        },

        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: '棲まう海にて',
            type: 'Technique',
            description: '秘技を使用した後、特殊領域を作り出し「酔心」状態を付与。戦闘開始時に2種類の持続ダメージを付与。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2,
            name: '征服の剣旗',
            type: 'Bonus Ability',
            description: '戦闘開始時、セイレンスは必殺技の結界と同じ効果を持つ結界を展開する。結界を展開するたびにSPを1回復。'
        },
        {
            id: TRACE_IDS.A4,
            name: '盛宴の泡沫',
            type: 'Bonus Ability',
            description: 'セイレンスが必殺技を発動した時、敵に持続ダメージ系デバフがある場合、付与されている全持続ダメージ系デバフが本来のダメージ150%分のダメージを発生させる。'
        },
        {
            id: TRACE_IDS.A6,
            name: '真珠の琴線',
            type: 'Bonus Ability',
            description: 'セイレンスの効果命中が60%を超えた時、超過した効果命中10%につき、自身の与ダメージ+15%、最大で+90%。'
        },
        {
            id: `${CHARACTER_ID}-stat-spd`,
            name: '速度',
            type: 'Stat Bonus',
            description: '速度+14',
            stat: 'spd',
            value: 14
        },
        {
            id: `${CHARACTER_ID}-stat-atk`,
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+18.0%',
            stat: 'atk_pct',
            value: 0.18
        },
        {
            id: `${CHARACTER_ID}-stat-hit`,
            name: '効果命中',
            type: 'Stat Bonus',
            description: '効果命中+10.0%',
            stat: 'effect_hit_rate',
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '何故、心は悲しむか',
            description: 'セイレンスがフィールド上にいる時、味方が与える持続ダメージは本来の116%になる。天賦で持続ダメージを付与する時、追加で1つ付与する。'
        },
        e2: {
            level: 2,
            name: '何故、潮はさんざめく',
            description: '結界が展開されている間、軌跡「真珠の琴線」による与ダメージアップ効果が味方全体に適用される。'
        },
        e3: {
            level: 3,
            name: '何故、灯は忘らるる',
            description: '必殺技のLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // 必殺技: 200% → 216%
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 2.16 },
                // 通常攻撃: 100% → 110%
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.55 },
                { abilityName: 'basic', param: 'damage.hits.1.multiplier', value: 0.55 }
            ]
        },
        e4: {
            level: 4,
            name: '何故、時は流れるか',
            description: '結界が展開されている間、敵全体の全属性耐性-20%。'
        },
        e5: {
            level: 5,
            name: '髪を梳き、口ずさむ',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                // スキル: 140% → 154%
                { abilityName: 'skill', param: 'damage.hits.0.multiplier', value: 0.77 },
                { abilityName: 'skill', param: 'damage.hits.1.multiplier', value: 0.77 }
            ]
        },
        e6: {
            level: 6,
            name: '沈みし君、いずれ帰郷せん',
            description: '結界の追加持続ダメージ発動上限が12回になり、ダメージ倍率+20%。'
        }
    },

    defaultConfig: {
        lightConeId: 'why-does-the-ocean-sing',
        superimposition: 1,
        relicSetId: 'prisoner-in-deep-confinement',
        ornamentSetId: 'revelry-by-the-sea',
        mainStats: {
            body: 'effect_hit_rate',
            feet: 'atk_pct',
            sphere: 'physical_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'effect_hit_rate', value: 0.20 },
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'spd', value: 6 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// --- ヘルパー関数 ---

/**
 * 結界が展開中かどうかを判定
 */
const isBarrierActive = (state: GameState, sourceUnitId: string): boolean => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return false;
    return unit.effects.some(e => e.id === EFFECT_IDS.BARRIER(sourceUnitId));
};

/**
 * 結界のトリガー回数を取得
 */
const getBarrierTriggerCount = (state: GameState, sourceUnitId: string): number => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return 0;
    const counter = unit.effects.find(e => e.id === EFFECT_IDS.BARRIER_TRIGGER_COUNT(sourceUnitId));
    return counter?.stackCount || 0;
};

/**
 * 結界トリガー回数を増加
 */
const incrementBarrierTriggerCount = (state: GameState, sourceUnitId: string): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const counter = unit.effects.find(e => e.id === EFFECT_IDS.BARRIER_TRIGGER_COUNT(sourceUnitId));
    if (!counter) return state;

    const newCount = (counter.stackCount || 0) + 1;
    const updatedEffects = unit.effects.map(e =>
        e.id === counter.id ? { ...e, stackCount: newCount } : e
    );

    return {
        ...state,
        registry: state.registry.update(createUnitId(sourceUnitId), u => ({ ...u, effects: updatedEffects }))
    };
};

/**
 * A6: 効果命中ベースの与ダメージボーナスを計算
 */
const calculateA6DmgBoost = (effectHitRate: number): number => {
    if (effectHitRate <= A6_EFFECT_HIT_THRESHOLD) return 0;
    const excessHit = effectHitRate - A6_EFFECT_HIT_THRESHOLD;
    const boost = Math.floor(excessHit / 0.10) * A6_DMG_BOOST_PER_10PCT;
    return Math.min(boost, A6_MAX_DMG_BOOST);
};

/**
 * 持続ダメージタイプの優先順位付き選択
 * まだ付与されていない状態を優先する
 */
const selectDoTType = (targetEffects: IEffect[], sourceId: string, targetId: string): ('WindShear' | 'Bleed' | 'Burn' | 'Shock')[] => {
    const dotTypes: ('WindShear' | 'Bleed' | 'Burn' | 'Shock')[] = ['WindShear', 'Bleed', 'Burn', 'Shock'];
    const effectIds = {
        'WindShear': EFFECT_IDS.WINDSHEAR(sourceId, targetId),
        'Bleed': EFFECT_IDS.BLEED(sourceId, targetId),
        'Burn': EFFECT_IDS.BURN(sourceId, targetId),
        'Shock': EFFECT_IDS.SHOCK(sourceId, targetId),
    };

    // まだ付与されていないものを先に
    const notApplied = dotTypes.filter(type =>
        !targetEffects.some(e => e.id === effectIds[type])
    );
    const applied = dotTypes.filter(type =>
        targetEffects.some(e => e.id === effectIds[type])
    );

    return [...notApplied, ...applied];
};

/**
 * 持続ダメージエフェクトを作成
 */
const createDoTEffect = (
    source: Unit,
    target: Unit,
    dotType: 'WindShear' | 'Bleed' | 'Burn' | 'Shock',
    multiplier: number
): DoTEffect => {
    const effectIdMap = {
        'WindShear': EFFECT_IDS.WINDSHEAR,
        'Bleed': EFFECT_IDS.BLEED,
        'Burn': EFFECT_IDS.BURN,
        'Shock': EFFECT_IDS.SHOCK,
    };

    const nameMap = {
        'WindShear': '風化',
        'Bleed': '裂創',
        'Burn': '燃焼',
        'Shock': '感電',
    };

    return {
        id: effectIdMap[dotType](source.id, target.id),
        name: `${nameMap[dotType]} (${source.name})`,
        category: 'DEBUFF',
        type: 'DoT',
        dotType: dotType,
        sourceUnitId: source.id,
        durationType: 'TURN_START_BASED',
        duration: DOT_DURATION,
        damageCalculation: 'multiplier',
        multiplier: multiplier,
        isCleansable: true,
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
};

/**
 * 結界を展開
 */
const deployBarrier = (
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 既存の結界を削除
    if (isBarrierActive(newState, sourceUnitId)) {
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.BARRIER(sourceUnitId));
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.BARRIER_TRIGGER_COUNT(sourceUnitId));
        // 敵のデバフを削除
        newState.registry.getAliveEnemies().forEach(enemy => {
            newState = removeEffect(newState, enemy.id, EFFECT_IDS.BARRIER_ATK_DEBUFF(sourceUnitId));
            newState = removeEffect(newState, enemy.id, EFFECT_IDS.BARRIER_DEF_DEBUFF(sourceUnitId));
            if (eidolonLevel >= 4) {
                newState = removeEffect(newState, enemy.id, EFFECT_IDS.E4_RES_SHRED(sourceUnitId));
            }
        });
    }

    // E3/E5によるレベル
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const ultValues = getLeveledValue(ABILITY_VALUES.ultDamage, ultLevel);

    // 結界マーカーエフェクト
    const barrierEffect: IEffect = {
        id: EFFECT_IDS.BARRIER(sourceUnitId),
        name: `結界 (${BARRIER_DURATION}ターン)`,
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_START_BASED',
        duration: BARRIER_DURATION,
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, barrierEffect);

    // トリガー回数カウンター
    const maxTriggers = eidolonLevel >= 6 ? E6_BARRIER_MAX_TRIGGERS : BARRIER_MAX_TRIGGERS;
    const triggerCounter: IEffect = {
        id: EFFECT_IDS.BARRIER_TRIGGER_COUNT(sourceUnitId),
        name: `結界トリガー (0/${maxTriggers})`,
        category: 'STATUS',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: 0,
        maxStacks: maxTriggers,
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, triggerCounter);

    // 敵全体にデバフ
    const enemies = newState.registry.getAliveEnemies();
    enemies.forEach(enemy => {
        // ATK-15%
        const atkDebuff: IEffect = {
            id: EFFECT_IDS.BARRIER_ATK_DEBUFF(sourceUnitId),
            name: '結界 (ATK-15%)',
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: -1,
            linkedEffectId: EFFECT_IDS.BARRIER(sourceUnitId),
            modifiers: [{ target: 'atk_pct' as StatKey, value: -ULT_ATK_DEBUFF, type: 'add', source: '結界' }],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, enemy.id, atkDebuff);

        // DEF-25%
        const defDebuff: IEffect = {
            id: EFFECT_IDS.BARRIER_DEF_DEBUFF(sourceUnitId),
            name: `結界 (DEF-${(ultValues.defDebuff * 100).toFixed(0)}%)`,
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: -1,
            linkedEffectId: EFFECT_IDS.BARRIER(sourceUnitId),
            modifiers: [{ target: 'def_pct' as StatKey, value: -ultValues.defDebuff, type: 'add', source: '結界' }],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, enemy.id, defDebuff);

        // E4: 全属性耐性-20%
        if (eidolonLevel >= 4) {
            const resShred: IEffect = {
                id: EFFECT_IDS.E4_RES_SHRED(sourceUnitId),
                name: '結界 (全耐性-20%)',
                category: 'DEBUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'LINKED',
                duration: -1,
                linkedEffectId: EFFECT_IDS.BARRIER(sourceUnitId),
                modifiers: [
                    { target: 'physical_res' as StatKey, value: -0.20, type: 'add', source: 'E4' },
                    { target: 'fire_res' as StatKey, value: -0.20, type: 'add', source: 'E4' },
                    { target: 'ice_res' as StatKey, value: -0.20, type: 'add', source: 'E4' },
                    { target: 'lightning_res' as StatKey, value: -0.20, type: 'add', source: 'E4' },
                    { target: 'wind_res' as StatKey, value: -0.20, type: 'add', source: 'E4' },
                    { target: 'quantum_res' as StatKey, value: -0.20, type: 'add', source: 'E4' },
                    { target: 'imaginary_res' as StatKey, value: -0.20, type: 'add', source: 'E4' },
                ],
                apply: (t: Unit, s: GameState) => s,
                remove: (t: Unit, s: GameState) => s
            };
            newState = addEffect(newState, enemy.id, resShred);
        }
    });

    // SP+1回復
    newState = { ...newState, skillPoints: Math.min(newState.skillPoints + 1, 5) };

    return newState;
};

/**
 * 結界の持続ダメージをトリガー
 */
const triggerBarrierDoT = (
    state: GameState,
    sourceUnitId: string,
    targetId: string,
    eidolonLevel: number
): GameState => {
    if (!isBarrierActive(state, sourceUnitId)) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    const target = state.registry.get(createUnitId(targetId));
    if (!source || !target || !target.isEnemy) return state;

    // 最大トリガー回数チェック
    const maxTriggers = eidolonLevel >= 6 ? E6_BARRIER_MAX_TRIGGERS : BARRIER_MAX_TRIGGERS;
    const currentTriggers = getBarrierTriggerCount(state, sourceUnitId);
    if (currentTriggers >= maxTriggers) return state;

    // 敵に持続ダメージ系デバフがあるかチェック
    const hasDoT = target.effects.some(e => {
        const dotEffect = e as DoTEffect;
        return dotEffect.type === 'DoT' ||
            ['Shock', 'Bleed', 'Burn', 'WindShear', 'Wind Shear'].includes(dotEffect.dotType || '');
    });
    if (!hasDoT) return state;

    let newState = state;

    // トリガー回数増加
    newState = incrementBarrierTriggerCount(newState, sourceUnitId);

    // E3/E5によるレベル
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const ultValues = getLeveledValue(ABILITY_VALUES.ultDamage, ultLevel);
    let dotMult = ultValues.dotTriggerMult;
    if (eidolonLevel >= 6) dotMult += E6_DOT_TRIGGER_MULT_BONUS;

    // ダメージ計算
    const baseDamage = source.stats.atk * dotMult;
    const dmgCalcResult = calculateNormalDoTDamageWithBreakdown(source, target, baseDamage);

    // ダメージ適用
    const result = applyUnifiedDamage(
        newState,
        source,
        target,
        dmgCalcResult.damage,
        {
            damageType: '結界持続ダメージ',
            details: `結界DoT (${(dotMult * 100).toFixed(0)}%)`,
            skipLog: true,
            skipStats: false
        }
    );
    newState = result.state;

    // ログに追加
    newState = appendAdditionalDamage(newState, {
        source: source.name,
        name: `結界DoT (${(dotMult * 100).toFixed(0)}%)`,
        damage: dmgCalcResult.damage,
        target: target.name,
        damageType: 'dot',
        isCrit: false,
        breakdownMultipliers: dmgCalcResult.breakdownMultipliers
    });

    return newState;
};

// --- イベントハンドラー関数 ---

/**
 * 戦闘開始時
 * - A2: 結界展開
 * - E1: 味方DoTブーストオーラ
 * - A6: 効果命中ブースト
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

    // A2: 戦闘開始時に結界展開
    if (unit.traces?.some(t => t.id === TRACE_IDS.A2)) {
        newState = deployBarrier(newState, sourceUnitId, eidolonLevel);
    }

    // E1: 味方全体の持続ダメージ+16%（オーラ）
    if (eidolonLevel >= 1) {
        const e1Aura: IAura = {
            id: EFFECT_IDS.E1_DOT_BOOST_AURA(sourceUnitId),
            name: 'E1: DoT+16%',
            sourceUnitId: createUnitId(sourceUnitId),
            target: 'all_allies',
            modifiers: [{
                target: 'dot_dmg_boost' as StatKey,
                value: E1_DOT_BOOST,
                type: 'add',
                source: 'セイレンスE1'
            }]
        };
        newState = addAura(newState, e1Aura);
    }

    // A6: 効果命中ベースの与ダメージアップ
    if (unit.traces?.some(t => t.id === TRACE_IDS.A6)) {
        const effectHit = unit.stats.effect_hit_rate || 0;
        const dmgBoost = calculateA6DmgBoost(effectHit);
        if (dmgBoost > 0) {
            const a6Effect: IEffect = {
                id: EFFECT_IDS.A6_DMG_BOOST(sourceUnitId),
                name: `真珠の琴線 (与ダメ+${(dmgBoost * 100).toFixed(0)}%)`,
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{ target: 'all_type_dmg_boost' as StatKey, value: dmgBoost, type: 'add', source: 'A6' }],
                apply: (t: Unit, s: GameState) => s,
                remove: (t: Unit, s: GameState) => s
            };
            newState = addEffect(newState, sourceUnitId, a6Effect);
        }
    }

    return newState;
};

/**
 * ターン開始時
 * - 結界の持続時間更新
 */
const onTurnStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // セイレンスのターン開始時のみ
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // 結界の持続時間-1は自動で行われる（TURN_START_BASED）
    // 結界終了時のリンクエフェクト削除も自動

    return state;
};

/**
 * スキル使用時
 * - 受けるダメージ+20%デバフ付与
 */
const onSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;
    const enemies = newState.registry.getAliveEnemies();

    // E5でスキルLv+2
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const skillValues = getLeveledValue(ABILITY_VALUES.skillDamage, skillLevel);

    // 敵全体に受けるダメージアップデバフ
    enemies.forEach(enemy => {
        if (!checkDebuffSuccess(source, enemy, 1.0, 'Debuff')) return;

        const vulnDebuff: IEffect = {
            id: EFFECT_IDS.SKILL_VULN_DEBUFF(sourceUnitId, enemy.id),
            name: `受ダメ+${(skillValues.vuln * 100).toFixed(0)}%`,
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: 3,
            modifiers: [{ target: 'dmg_taken' as StatKey, value: skillValues.vuln, type: 'add', source: 'スキル' }],
            isCleansable: true,
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, enemy.id, vulnDebuff);
    });

    return newState;
};

/**
 * 必殺技使用時
 * - 結界展開
 * - A4: 持続ダメージ即時発動
 */
const onUltimateUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 結界展開
    newState = deployBarrier(newState, sourceUnitId, eidolonLevel);

    // A4: 盛宴の泡沫 - 持続ダメージ即時発動（150%）
    if (source.traces?.some(t => t.id === TRACE_IDS.A4)) {
        const enemies = newState.registry.getAliveEnemies();
        enemies.forEach(enemy => {
            const freshEnemy = newState.registry.get(createUnitId(enemy.id));
            if (!freshEnemy) return;

            // 持続ダメージ系デバフを検索
            freshEnemy.effects.forEach(effect => {
                const dotEffect = effect as DoTEffect;
                if (dotEffect.type !== 'DoT') return;

                // 基礎ダメージ計算
                let baseDamage = 0;
                if (dotEffect.damageCalculation === 'multiplier' && dotEffect.multiplier) {
                    baseDamage = source.stats.atk * dotEffect.multiplier;
                } else if (dotEffect.baseDamage) {
                    baseDamage = dotEffect.baseDamage;
                }

                if (baseDamage <= 0) return;

                // 150%のダメージ
                const a4Damage = baseDamage * 1.5;
                const dmgCalcResult = calculateNormalDoTDamageWithBreakdown(source, freshEnemy, a4Damage);

                const result = applyUnifiedDamage(
                    newState,
                    source,
                    freshEnemy,
                    dmgCalcResult.damage,
                    {
                        damageType: 'A4持続ダメージ',
                        details: `盛宴の泡沫 (${dotEffect.dotType})`,
                        skipLog: true,
                        skipStats: false
                    }
                );
                newState = result.state;

                newState = appendAdditionalDamage(newState, {
                    source: source.name,
                    name: `盛宴の泡沫 (${dotEffect.dotType} 150%)`,
                    damage: dmgCalcResult.damage,
                    target: freshEnemy.name,
                    damageType: 'dot',
                    isCrit: false,
                    breakdownMultipliers: dmgCalcResult.breakdownMultipliers
                });
            });
        });
    }

    return newState;
};

/**
 * 味方攻撃後
 * - 天賦: 持続ダメージ付与
 * - 結界DoTトリガー
 */
const onAllyAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!source || !attacker || attacker.isEnemy) return state;

    let newState = state;
    const targetId = event.targetId;
    if (!targetId) return state;

    const target = newState.registry.get(createUnitId(targetId));
    if (!target || !target.isEnemy) return state;

    // 天賦: 持続ダメージ付与
    if (checkDebuffSuccess(source, target, 1.0, 'Debuff')) {
        // E5で天賦Lv+2
        const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
        const dotMult = getLeveledValue(ABILITY_VALUES.talentDot, talentLevel);

        // 付与する持続ダメージタイプを選択
        const dotTypes = selectDoTType(target.effects, sourceUnitId, targetId);
        const numToApply = eidolonLevel >= 1 ? 2 : 1; // E1: 追加で1つ付与

        for (let i = 0; i < numToApply && i < dotTypes.length; i++) {
            const dotEffect = createDoTEffect(source, target, dotTypes[i], dotMult);
            newState = addEffect(newState, targetId, dotEffect);
        }
    }

    // 結界DoTトリガー
    newState = triggerBarrierDoT(newState, sourceUnitId, targetId, eidolonLevel);

    return newState;
};

/**
 * 敵ターン開始時
 * - 結界DoTトリガー
 */
const onEnemyTurnStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const enemyId = event.sourceId;
    if (!enemyId) return state;

    const enemy = state.registry.get(createUnitId(enemyId));
    if (!enemy || !enemy.isEnemy) return state;

    return triggerBarrierDoT(state, sourceUnitId, enemyId, eidolonLevel);
};

// --- ハンドラーファクトリ ---
export const hysilensHandlerFactory: IEventHandlerFactory = (
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
                'ON_ATTACK',           // 味方攻撃時（天賦トリガー）
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            // 戦闘開始時
            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            // ターン開始時（セイレンス自身または敵）
            if (event.type === 'ON_TURN_START') {
                const turnOwner = state.registry.get(createUnitId(event.sourceId));
                if (turnOwner) {
                    if (turnOwner.isEnemy) {
                        // 敵ターン開始時: 結界DoTトリガー
                        return onEnemyTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                    } else if (event.sourceId === sourceUnitId) {
                        // セイレンス自身のターン開始時
                        return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                    }
                }
            }

            // スキル使用時（セイレンス自身）
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            // 必殺技使用時（セイレンス自身）
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            // 味方攻撃時
            if (event.type === 'ON_ATTACK') {
                const attacker = state.registry.get(createUnitId(event.sourceId));
                if (attacker && !attacker.isEnemy) {
                    return onAllyAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                }
            }

            return state;
        }
    };
};
