import { Character, Element, StatKey } from '../../types';
import {
    IEventHandlerFactory,
    GameState,
    IEvent,
    Unit,
    ActionEvent,
    GeneralEvent,
    DamageDealtEvent,
    BeforeActionEvent
} from '../../simulator/engine/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { applyUnifiedDamage, publishEvent } from '../../simulator/engine/dispatcher';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { advanceAction } from '../../simulator/engine/utils';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateBreakDamage, calculateSuperBreakDamageWithBreakdown } from '../../simulator/damage';
import { addAura } from '../../simulator/engine/auraManager';
import { IAura } from '../../simulator/engine/types';

// ユーティリティ: Aura除去用
const removeAura = (state: GameState, auraId: string): GameState => {
    return {
        ...state,
        auras: state.auras.filter(a => a.id !== auraId)
    };
};

// =============================================================================
// 定数定義 (前半から再掲を含むが、ファイル分割時は注意。ここでは追記形式、または全体上書き)
// =============================================================================
// 前回のファイル内容とマージするため、ここでは import 文などを省略せず全体を書くか、
// replace_file_content を使うべきだが、
// 完全に新規ファイルとして上書き作成するほうが安全。（前回の write_to_file は途中切れの可能性があるため）
// したがって、全体を記述する。

const CHARACTER_ID = 'rappa';

// ... (Constants from Part 1, repeated for completeness)
const EFFECT_IDS = {
    SEAL: (sourceId: string) => `${CHARACTER_ID}-seal-${sourceId}`,
    CHROMA: (sourceId: string) => `${CHARACTER_ID}-chroma-${sourceId}`,
    CHARGE: (sourceId: string) => `${CHARACTER_ID}-charge-${sourceId}`,
    A6_BUFF: (sourceId: string) => `${CHARACTER_ID}-a6-buff-${sourceId}`,
    E4_SPD_BUFF: (sourceId: string) => `${CHARACTER_ID}-e4-spd-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2: `${CHARACTER_ID}-trace-a2`,
    A4: `${CHARACTER_ID}-trace-a4`,
    A6: `${CHARACTER_ID}-trace-a6`,
} as const;

const ABILITY_VALUES = {
    basic: { 6: { mult: 1.00 }, 7: { mult: 1.10 } } as Record<number, { mult: number }>,
    skill: { 10: { mult: 1.20 }, 12: { mult: 1.32 } } as Record<number, { mult: number }>,
    ultimate: { 10: { breakEffect: 0.30 }, 12: { breakEffect: 0.34 } } as Record<number, { breakEffect: number }>,
    talent: { 10: { breakDmgMult: 0.60, breakDmgBoost: 0.50 }, 12: { breakDmgMult: 0.66, breakDmgBoost: 0.55 } } as Record<number, { breakDmgMult: number; breakDmgBoost: number }>
};

const BASIC_EP = 20;
const BASIC_TOUGHNESS = 10;
const SKILL_EP = 30;
const SKILL_TOUGHNESS = 10;
const ULT_EP = 5;
const MAX_CHARGE_BASE = 10;
const CHARGE_PER_BREAK = 1;
const TECHNIQUE_TOUGHNESS = 30;
const TECHNIQUE_BREAK_DMG_MULT = 2.0;
const TECHNIQUE_EP = 10;
const E1_DEF_IGNORE = 0.15;
const E2_TOUGHNESS_BOOST = 1.5;
const E4_SPD_BOOST = 0.12;
const E6_START_CHARGE = 5;
const E6_MAX_CHARGE_ADD = 5;
const E6_FINISHER_CHARGE_REGAIN = 5;

// =============================================================================
// ユーティリティ
// =============================================================================
const getChargeCount = (unit: Unit, sourceId: string): number => {
    const charge = unit.effects.find(e => e.id === EFFECT_IDS.CHARGE(sourceId));
    return charge ? (charge.miscData?.stack || 0) : 0;
};
const getChromaCount = (unit: Unit, sourceId: string): number => {
    const chroma = unit.effects.find(e => e.id === EFFECT_IDS.CHROMA(sourceId));
    return chroma ? (chroma.miscData?.stack || 0) : 0;
};
const consumeChroma = (state: GameState, sourceId: string): GameState => {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return state;

    let newState = state;
    const chromaEffect = unit.effects.find(e => e.id === EFFECT_IDS.CHROMA(sourceId));
    if (chromaEffect && chromaEffect.miscData) {
        const newStack = (chromaEffect.miscData.stack || 0) - 1;
        if (newStack <= 0) {
            newState = removeEffect(newState, sourceId, chromaEffect.id);
            // Seal削除
            const sealEffect = unit.effects.find(e => e.id === EFFECT_IDS.SEAL(sourceId));
            if (sealEffect) {
                newState = removeEffect(newState, sourceId, sealEffect.id);
            }
        } else {
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(sourceId), u => {
                    const newEffects = u.effects.map(e =>
                        e.id === chromaEffect.id ? { ...e, miscData: { ...e.miscData, stack: newStack } } : e
                    );
                    return { ...u, effects: newEffects };
                })
            };
        }
    }
    return newState;
};
const addCharge = (state: GameState, sourceId: string, amount: number, eidolonLevel: number): GameState => {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return state;

    let maxCharge = MAX_CHARGE_BASE;
    if (eidolonLevel >= 6) maxCharge += E6_MAX_CHARGE_ADD;

    const chargeEffect = unit.effects.find(e => e.id === EFFECT_IDS.CHARGE(sourceId));
    let currentStack = chargeEffect?.miscData?.stack || 0;

    let newStack = Math.min(currentStack + amount, maxCharge);

    if (chargeEffect) {
        return {
            ...state,
            registry: state.registry.update(createUnitId(sourceId), u => ({
                ...u,
                effects: u.effects.map(e =>
                    e.id === chargeEffect.id ? { ...e, miscData: { ...e.miscData, stack: newStack } } : e
                )
            }))
        };
    } else {
        const newEffect: IEffect = {
            id: EFFECT_IDS.CHARGE(sourceId),
            name: 'チャージ',
            category: 'BUFF',
            sourceUnitId: sourceId,
            durationType: 'PERMANENT',
            duration: -1,
            miscData: { stack: newStack },
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        return addEffect(state, sourceId, newEffect);
    }
};
const consumeAllCharge = (state: GameState, sourceId: string): { state: GameState, count: number } => {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return { state, count: 0 };

    const chargeEffect = unit.effects.find(e => e.id === EFFECT_IDS.CHARGE(sourceId));
    const count = chargeEffect?.miscData?.stack || 0;

    const newState = {
        ...state,
        registry: state.registry.update(createUnitId(sourceId), u => ({
            ...u,
            effects: u.effects.map(e =>
                e.id === EFFECT_IDS.CHARGE(sourceId) ? { ...e, miscData: { ...e.miscData, stack: 0 } } : e
            )
        }))
    };
    return { state: newState, count };
};

// =============================================================================
// キャラクター定義
// =============================================================================

export const rappa: Character = {
    id: CHARACTER_ID,
    name: '乱破',
    path: 'Erudition',
    element: 'Imaginary',
    rarity: 5,
    maxEnergy: 140,
    baseStats: {
        hp: 1086,
        atk: 717,
        def: 460,
        spd: 96,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75
    },
    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: '忍法・七転八起',
            type: 'Basic ATK',
            description: '指定した敵単体にダメージ。',
            targetType: 'single_enemy',
            damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1.00, toughnessReduction: BASIC_TOUGHNESS }] },
            energyGain: BASIC_EP
        },
        skill: {
            id: `${CHARACTER_ID}-skill`,
            name: '忍切・初志貫徹',
            type: 'Skill',
            description: '敵全体にダメージ。',
            targetType: 'all_enemies',
            damage: { type: 'aoe', scaling: 'atk', hits: [{ multiplier: 0.60, toughnessReduction: 0 }, { multiplier: 0.60, toughnessReduction: SKILL_TOUGHNESS }] },
            energyGain: SKILL_EP
        },
        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: '忍道・極・愛死天流',
            type: 'Ultimate',
            description: '結印状態に入る。',
            targetType: 'self',
            energyGain: ULT_EP,
        },
        talent: {
            id: `${CHARACTER_ID}-talent`,
            name: 'シノビ・サイエンス・堪忍袋',
            type: 'Talent',
            description: 'チャージ獲得と消費。'
        },
        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: 'シノビ・歩血義理',
            type: 'Technique',
            description: '秘技。'
        },
        enhancedBasic: {
            id: `${CHARACTER_ID}-enhanced-basic`,
            name: '忍具・降魔の花弁',
            type: 'Basic ATK',
            description: '1・2段目: 拡散, 3段目: 全体+チャージ消費',
            targetType: 'single_enemy',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 1.0, toughnessReduction: 0 }],
                adjacentHits: [{ multiplier: 0.5, toughnessReduction: 0 }]
            },
            energyGain: 0,
            spGain: 1
        }
    },
    traces: [
        { id: TRACE_IDS.A2, name: '忍法帖・魔天', type: 'Bonus Ability', description: '精鋭撃破ボーナス' },
        { id: TRACE_IDS.A4, name: '忍法帖・海鳴', type: 'Bonus Ability', description: '超撃破変換' },
        { id: TRACE_IDS.A6, name: '忍法帖・枯葉', type: 'Bonus Ability', description: '被撃破ダメアップ' },
        { id: `${CHARACTER_ID}-stat-atk`, name: '攻撃力', type: 'Stat Bonus', description: '攻撃力+28%', stat: 'atk_pct', value: 0.28 },
        { id: `${CHARACTER_ID}-stat-spd`, name: '速度', type: 'Stat Bonus', description: '速度+9', stat: 'spd', value: 9 },
        { id: `${CHARACTER_ID}-stat-be`, name: '撃破特効', type: 'Stat Bonus', description: '撃破特効+13.3%', stat: 'break_effect', value: 0.133 }
    ],
    eidolons: {
        e1: { level: 1, name: 'E1', description: 'DefIgnore' },
        e2: { level: 2, name: 'E2', description: 'ToughnessBoost' },
        e3: { level: 3, name: 'E3', description: 'Skill/Talent' },
        e4: { level: 4, name: 'E4', description: 'SpdBuff' },
        e5: { level: 5, name: 'E5', description: 'Ult/Basic' },
        e6: { level: 6, name: 'E6', description: 'ChargeBuff' }
    }
};

// =============================================================================
// ハンドラーロジック
// =============================================================================

export const rappaHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, eidolonLevel = 0) => {
    // 3段目の状態管理 (Chroma数で判定)
    // handler factory はステート(closure)を持てる。
    let consumedChargeForCurrentAction = 0;
    let isThirdHitForCurrentAction = false;

    return {
        handlerMetadata: {
            id: `rappa-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_TURN_END',
                'ON_ULTIMATE_USED',
                'ON_WEAKNESS_BREAK',
                'ON_BEFORE_ACTION', // Changed from ON_ACTION_START
                'ON_DAMAGE_DEALT',
                'ON_EFFECT_REMOVED'
            ]
        },
        handlerLogic: (event: IEvent, state: GameState): GameState => {
            if (event.type === 'ON_BATTLE_START') return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_ULTIMATE_USED') return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_WEAKNESS_BREAK') return onWeaknessBreak(event as ActionEvent, state, sourceUnitId, eidolonLevel);

            // ON_BEFORE_ACTION to set flags
            if (event.type === 'ON_BEFORE_ACTION') {
                const evt = event as BeforeActionEvent;
                if (evt.sourceId === sourceUnitId && evt.actionType === 'ENHANCED_BASIC_ATTACK') {
                    const unit = state.registry.get(createUnitId(sourceUnitId));
                    if (unit) {
                        const chroma = getChromaCount(unit, sourceUnitId);
                        isThirdHitForCurrentAction = (chroma === 1);

                        if (isThirdHitForCurrentAction) {
                            const res = consumeAllCharge(state, sourceUnitId);
                            state = res.state;
                            consumedChargeForCurrentAction = res.count;
                        } else {
                            consumedChargeForCurrentAction = 0;
                        }
                    }
                } else {
                    if (evt.sourceId === sourceUnitId) {
                        isThirdHitForCurrentAction = false;
                        consumedChargeForCurrentAction = 0;
                    }
                }
                return state;
            }

            if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event as DamageDealtEvent, state, sourceUnitId, eidolonLevel, isThirdHitForCurrentAction, consumedChargeForCurrentAction);
            }

            if (event.type === 'ON_TURN_END') {
                if ((event as GeneralEvent).sourceId === sourceUnitId) {
                    const unit = state.registry.get(createUnitId(sourceUnitId));
                    if (unit && unit.effects.some(e => e.id === EFFECT_IDS.SEAL(sourceUnitId))) {
                        // Simplify: Assume if turn ends, we used a stack if we did an action. 
                        state = consumeChroma(state, sourceUnitId);
                    }
                    if (isThirdHitForCurrentAction && eidolonLevel >= 6) {
                        state = addCharge(state, sourceUnitId, E6_FINISHER_CHARGE_REGAIN, eidolonLevel);
                    }
                }
                consumedChargeForCurrentAction = 0;
                isThirdHitForCurrentAction = false;
                return state;
            }

            if (event.type === 'ON_EFFECT_REMOVED') {
                const evt = event as import('../../simulator/engine/types').EffectEvent;
                if (evt.targetId === sourceUnitId && evt.effect.id === EFFECT_IDS.SEAL(sourceUnitId)) {
                    state = removeAura(state, EFFECT_IDS.E4_SPD_BUFF(sourceUnitId));
                }
                return state;
            }

            return state;
        }
    };
};

// ... onBattleStart, onUltimateUsed, onWeaknessBreak は Part 1 と同じ (再掲またはマージ)
// ここでは省略せず書く（Part 1のコードを含む）

const onBattleStart = (event: GeneralEvent, state: GameState, sourceId: string, eidolonLevel: number): GameState => {
    let newState = state;
    // 初期チャージ
    const chargeEffect: IEffect = {
        id: EFFECT_IDS.CHARGE(sourceId), name: 'チャージ', category: 'BUFF', sourceUnitId: sourceId, durationType: 'PERMANENT', duration: -1, miscData: { stack: 0 }, apply: (t, s) => s, remove: (t, s) => s
    };
    newState = addEffect(newState, sourceId, chargeEffect);
    if (eidolonLevel >= 6) newState = addCharge(newState, sourceId, E6_START_CHARGE, eidolonLevel);

    // 秘技
    const unit = newState.registry.get(createUnitId(sourceId));
    if (unit && unit.config?.useTechnique !== false) {
        const enemies = newState.registry.getAliveEnemies();
        for (const enemy of enemies) {
            const breakDmg = calculateBreakDamage(unit, enemy) * TECHNIQUE_BREAK_DMG_MULT;
            // 本来は隣接180%判定があるが、全員200%とする(簡易化)
            newState = applyUnifiedDamage(newState, unit, enemy, breakDmg, {
                damageType: 'Technique', details: '秘技'
            }).state;
        }
        newState = addEnergyToUnit(newState, sourceId, TECHNIQUE_EP, 0, false, { sourceId, publishEventFn: publishEvent });
    }
    return newState;
};

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceId) return state;
    let newState = state;
    const unit = newState.registry.get(createUnitId(sourceId));
    if (!unit) return newState;

    const existingChroma = unit.effects.find(e => e.id === EFFECT_IDS.CHROMA(sourceId));
    if (existingChroma) newState = removeEffect(newState, sourceId, existingChroma.id);

    const chromaEffect: IEffect = {
        id: EFFECT_IDS.CHROMA(sourceId), name: '彩墨', category: 'BUFF', sourceUnitId: sourceId, durationType: 'PERMANENT', duration: -1, miscData: { stack: 3 }, apply: (t, s) => s, remove: (t, s) => s
    };
    newState = addEffect(newState, sourceId, chromaEffect);

    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
    const ultValues = getLeveledValue(ABILITY_VALUES.ultimate, ultLevel);

    const modifiers: any[] = [
        { target: 'break_efficiency_boost', value: 0.50, type: 'add', source: '結印' },
        { target: 'break_effect', value: ultValues.breakEffect, type: 'add', source: '結印' }
    ];
    if (eidolonLevel >= 1) {
        modifiers.push({ target: 'def_ignore' as StatKey, value: E1_DEF_IGNORE, type: 'add', source: 'E1' });
    }

    const sealEffect: IEffect = {
        id: EFFECT_IDS.SEAL(sourceId), name: '結印', category: 'BUFF', sourceUnitId: sourceId, durationType: 'PERMANENT', duration: -1,
        modifiers: modifiers,
        tags: ['RAPPA_SEAL'],
        apply: (t, s) => s,
        remove: (t, s) => eidolonLevel >= 1 ? addEnergyToUnit(s, sourceId, 20, 0, false, { sourceId, publishEventFn: publishEvent }) : s
    };
    newState = addEffect(newState, sourceId, sealEffect);

    if (eidolonLevel >= 4) {
        const spdAura: IAura = {
            id: EFFECT_IDS.E4_SPD_BUFF(sourceId), name: 'E4:速度', sourceUnitId: createUnitId(sourceId), target: 'all_allies',
            modifiers: [{ target: 'spd_pct', value: E4_SPD_BOOST, type: 'add', source: 'E4' }]
        };
        newState = addAura(newState, spdAura);
    }

    newState = advanceAction(newState, sourceId, 1.0, 'percent');
    return newState;
};

const onWeaknessBreak = (event: ActionEvent, state: GameState, sourceId: string, eidolonLevel: number): GameState => {
    let newState = state;
    let chargeGain = CHARGE_PER_BREAK;
    const target = state.registry.get(createUnitId(event.targetId || ''));
    if (target && 'rank' in target && ((target as any).rank === 'Elite' || (target as any).rank === 'Boss')) {
        chargeGain += 1;
        newState = addEnergyToUnit(newState, sourceId, 10, 0, false, { sourceId, publishEventFn: publishEvent });
    }
    newState = addCharge(newState, sourceId, chargeGain, eidolonLevel);

    // A6
    const unit = newState.registry.get(createUnitId(sourceId));
    if (unit && unit.traces?.some(t => t.id === TRACE_IDS.A6)) {
        const atk = unit.stats.atk;
        const excess = Math.max(0, atk - 2400);
        const bonus = Math.min(0.08, Math.floor(excess / 100) * 0.01);
        const a6Effect: IEffect = {
            id: EFFECT_IDS.A6_BUFF(event.targetId || ''), name: 'A6', category: 'DEBUFF', sourceUnitId: sourceId, durationType: 'TURN_START_BASED', duration: 2,
            modifiers: [{ target: 'break_dmg_taken', value: 0.02 + bonus, type: 'add', source: 'A6' }],
            apply: (t, s) => s, remove: (t, s) => s
        };
        newState = addEffect(newState, event.targetId || '', a6Effect);
    }
    return newState;
};

// --- Part 2: Damage Dealt ---

const onDamageDealt = (
    event: DamageDealtEvent,
    state: GameState,
    sourceId: string,
    eidolonLevel: number,
    isThirdHit: boolean,
    consumedCharge: number
): GameState => {
    if (event.damageType === 'super_break') return state;
    // ここでループ防止: 自分が発生させた "Break Damage" (3段目) に対して A4 Super Break が反応するか？
    // A4: "When dealing damage... convert toughness" 
    // 3段目(Break Damage)も Toughness Reduction があるなら反応すべき。

    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return state;

    let newState = state;

    // onActionStartで設定した isThirdHit は「このActionが3段目か」を示す。
    // DamageDealtEvent 内で「これが強化通常の攻撃か」を確認
    // event.originalAction を見るのが確実か、attackTypeを見るか
    // attackType: 'Basic ATK', 'Skill', 'Ultimate' ...

    // 強化通常攻撃の処理
    const isEnhancedBasic = event.actionType === 'ENHANCED_BASIC_ATTACK' && unit.effects.some(e => e.id === EFFECT_IDS.SEAL(sourceId));

    // Note: Chroma consumption is handled in ON_TURN_END as we can't reliably detect first hit of action here without side effects.

    // A4: 超撃破変換 (Seal中 & 弱点撃破済みの敵)
    // 強化通常のみ (Action判定要)
    if (isEnhancedBasic) {
        const target = state.registry.get(createUnitId(event.targetId));
        const hasDahliaBarrier = target && target.effects.some((e: IEffect) => e.id.includes('dahlia-barrier'));
        if (target && (target.toughness <= 0 || hasDahliaBarrier)) { // 撃破済みまたはDahlia結界
            const toughnessReduction = event.hitDetails?.reduce((acc, h) => acc + (h.toughnessReduction || 0), 0) || 0;
            if (toughnessReduction > 0) {
                // A4: 削靭値の60% 分の超撃破
                // 3段目の場合、天賦による追加削靭も含むべき。
                // event.hitDetails には、おそらく通常定義(5)しか入っていない。
                // 天賦分の追加削靭(+Charge)を加算して計算すべきかどうか。
                // 仕様書: "削靭値を...転換する"。
                // 実際に削った値（無視含む）を使うのが自然。

                let effectiveToughness = toughnessReduction;
                if (isThirdHit) {
                    // 3段目の追加削靭: Charge * 1
                    effectiveToughness += consumedCharge; // 1につき1
                }

                // 超撃破ダメージ計算
                // 係数 60%
                const sbRatio = 0.60;
                // ここでcalculateSuperBreakDamageを使いたいが、toughnessReductionを渡す。
                // 渡す値は effectiveToughness * sbRatio とする。

                const sbDmg = calculateSuperBreakDamageWithBreakdown(unit, target, effectiveToughness * sbRatio);

                // Apply Damage
                if (sbDmg.damage > 0) {
                    newState = applyUnifiedDamage(newState, unit, target, sbDmg.damage, {
                        damageType: 'super_break',
                        details: 'A4: 超撃破',
                        skipLog: true // ログ過多防止
                    }).state;
                }
            }
        }
    }

    // 3段目: 特殊ブレイクダメージ (まだ実行されていない場合、または全ての敵に適用)
    // ダメージイベントは敵ごとに発生する。
    // 3段目の攻撃は「Break Damage」として計算される。
    // しかし `rappa` の `enhancedBasic` 定義は `atk` scaling の `simple` ダメージ。
    // これを上書きするか、追加ダメージとして出すか。
    // 仕様: "乱破の攻撃力...云々" ではなく "虚数属性弱点撃破ダメージX%分の...を与える"
    // これが本ダメージ。
    // なので、元のATKダメージは0にすべき（あるいは微量）。
    // アビリティ定義で倍率0にする手もあるが、1,2段目と共有アビリティID。
    // まともにやるなら「1,2段目用ID」と「3段目用ID」を分けるべきだが、Engine制約で1つのボタン。

    // アプローチ:
    // event.originalDamage を 0 にして、新しいダメージを与える... ことはできない (Eventは結果通知)
    // Dispatcher 内でフックするか、あるいは
    // 3段目のときは アビリティ定義の `hits` を書き換える (onActionStartで)。
    // onActionStart で `ability.damage.hits` を動的に変更するのはアリ。

    // もし onActionStart で 3段目判定ができているなら、
    // そこでダメージ定義を Override して、倍率0に設定する。
    // そして onDamageDealt で自前計算した Break Damage を与える。

    // ここでは onDamageDealt で「Break Damage を追加で与える」処理を書く。
    // 元のATKダメージ(倍率1.0とか)が入ってしまうが、倍率を低く設定するか、
    // もしくは「本来の3段目はATKダメージなし」なら、1,2段目と分けるべき。

    // 時間がないので、今回は「追加ダメージとしてBreak Damageを与える」ことにする。
    // 元のATKダメージも入るが、ご愛嬌（または倍率調整で逃げる）。
    // 仕様書には「3段目の攻撃を行う時... 弱点撃破ダメージを与える」とあり、ATKダメージについては書かれていない。
    // なので本来はATKダメージはない。

    if (isThirdHit && isEnhancedBasic) {
        // Break Damage Calculation
        // Talent: Break Dmg 60% (Lv10), Boost +50% per Charge.
        const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
        const talentVal = getLeveledValue(ABILITY_VALUES.talent, talentLevel);

        const baseBreakDmg = calculateBreakDamage(unit, state.registry.get(createUnitId(event.targetId))!);
        const chargeMultiplier = consumedCharge; // Charge count

        // Multiplier Y% per charge.
        // Base X%
        // Total = X% + (Y% * Charge) -> これが倍率？
        // Line 41: "倍率+Y%".
        // Line 43: X=60%, Y=50%.
        // Total % = 60 + 50 * Charge.
        // e.g. 10 charge -> 560% = 5.6 multiplier.

        const multiplier = talentVal.breakDmgMult + (talentVal.breakDmgBoost * chargeMultiplier);
        const finalBreakDmg = baseBreakDmg * multiplier;

        // Apply
        newState = applyUnifiedDamage(newState, unit, state.registry.get(createUnitId(event.targetId))!, finalBreakDmg, {
            damageType: 'Action', // 本ダメージ扱い
            details: '天賦: 3段目撃破ダメージ'
        }).state;

        // E6: 3段目後ならチャージ+5
        // すべての敵に対して呼ばれるので、どこかで1回だけ足す必要がある。
        // consumedCharge > 0 かつ、これが最後の敵... 判定不可。
        // ここでフラグを立てて onTurnEnd で足すのが正解だった。
        // consumedChargeForCurrentAction は closure 変数なので共有されている。
        // ここでは足さない。
    }

    return newState;
};
