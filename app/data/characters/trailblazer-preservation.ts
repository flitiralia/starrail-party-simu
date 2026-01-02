import { Character, StatKey, IAbility } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, DamageDealtEvent } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect, TauntEffect } from '../../simulator/effect/types';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { applyShield, applyHealing } from '../../simulator/engine/utils';

// --- Constants ---
const CHARACTER_ID = 'trailblazer-preservation';

const EFFECT_IDS = {
    MAGMA_WILL: (sourceId: string) => `trailblazer-pres-magma-will-${sourceId}`,
    ULT_ENHANCED_BASIC: (sourceId: string) => `trailblazer-pres-ult-enhanced-${sourceId}`,
    A2_DMG_REDUCTION: (sourceId: string, targetId: string) => `trailblazer-pres-a2-reduction-${sourceId}-${targetId}`,
    A6_BUFF: (sourceId: string) => `trailblazer-pres-a6-buff-${sourceId}`,
    E6_DEF_BUFF: (sourceId: string) => `trailblazer-pres-e6-def-${sourceId}`,
    TECHNIQUE_SHIELD: (sourceId: string) => `trailblazer-pres-technique-shield-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2_PROTECT: 'trailblazer-pres-trace-a2',
    A4_SURVIVAL: 'trailblazer-pres-trace-a4',
    A6_ACTION: 'trailblazer-pres-trace-a6',
} as const;

// --- Ability Values ---
const ABILITY_VALUES = {
    basicMult: { 6: 1.00, 7: 1.10 } as Record<number, number>,
    basicEnhancedMainMult: { 6: 1.35, 7: 1.4625 } as Record<number, number>,
    basicEnhancedAdjMult: { 6: 0.54, 7: 0.585 } as Record<number, number>,
    skillDmgRed: { 10: 0.50, 12: 0.52 } as Record<number, number>,
    ultAtkMult: { 10: 1.00, 12: 1.10 } as Record<number, number>,
    ultDefMult: { 10: 1.50, 12: 1.65 } as Record<number, number>,
    talentShieldDef: { 10: 0.06, 12: 0.064 } as Record<number, number>,
    talentShieldFlat: { 10: 80, 12: 89 } as Record<number, number>,
};

const BASIC_EP = 20;
const SKILL_EP = 30;
const ULT_EP_REFUND = 5;

const MAX_MAGMA_WILL = 8;
const ENHANCED_THRESHOLD = 4;

export const trailblazerPreservation: Character = {
    id: CHARACTER_ID,
    name: '開拓者-存護',
    path: 'Preservation',
    element: 'Fire',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1241,
        atk: 601,
        def: 606,
        spd: 95,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 150 // Preservation Standard
    },

    abilities: {
        basic: {
            id: 'trailblazer-pres-basic',
            name: '堅氷を貫く烈火',
            type: 'Basic ATK',
            description: '指定した敵単体、または強化通常攻撃時は拡散範囲に炎属性ダメージを与える。「灼熱意志」を獲得または消費する。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                // デフォルトは単体攻撃の倍率を設定（Blast化してもMainTargetにはこれが適用される）
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }],
            },
            energyGain: BASIC_EP,
            // 強化通常攻撃（拡散）を包括するため blast に設定し、
            // 通常時は隣接倍率を0にすることで擬似的に単体攻撃とする
            targetType: 'blast',
        },

        skill: {
            id: 'trailblazer-pres-skill',
            name: '不滅のアンバー',
            type: 'Skill',
            description: '戦闘スキルを発動した後、開拓者の被ダメージ-50%、「灼熱意志」を1層獲得、さらに100%の基礎確率で敵全体を挑発状態にする。',
            energyGain: SKILL_EP,
            spCost: 1,
            targetType: 'all_enemies',
            // ダメージは発生しない
        },

        ultimate: {
            id: 'trailblazer-pres-ultimate',
            name: '陥陣無帰の炎槍',
            type: 'Ultimate',
            description: '敵全体に開拓者の攻撃力100%+防御力150%分の炎属性ダメージを与える。次の通常攻撃を強化、その強化通常攻撃は「灼熱意志」を消費しない。',
            damage: {
                type: 'aoe',
                scaling: 'def', // We use def as primary, but logic will add atk part
                hits: [{ multiplier: 1.50, toughnessReduction: 20 }],
            },
            energyGain: ULT_EP_REFUND,
            targetType: 'all_enemies',
        },

        talent: {
            id: 'trailblazer-pres-talent',
            name: '建創者の失われし宝',
            type: 'Talent',
            description: '通常攻撃、戦闘スキル、必殺技を発動した後、味方全体にバリアを付与する。攻撃を受けるごとに「灼熱意志」を1層獲得する。',
            energyGain: 0,
        },

        technique: {
            id: 'trailblazer-pres-technique',
            name: '守護者命令',
            type: 'Technique',
            description: '戦闘開始時、自身にバリアを付与する。',
        },
    },

    traces: [
        {
            id: TRACE_IDS.A2_PROTECT,
            name: '弱きを助け',
            type: 'Bonus Ability',
            description: '戦闘スキルを発動した後、味方全体の被ダメージ-15%、1ターン継続。',
        },
        {
            id: TRACE_IDS.A4_SURVIVAL,
            name: '死の前に生を',
            type: 'Bonus Ability',
            description: '開拓者が強化通常攻撃を行った後、HPを最大HP5%回復する。',
        },
        {
            id: TRACE_IDS.A6_ACTION,
            name: '考えるより行動',
            type: 'Bonus Ability',
            description: 'ターン開始時、バリアを持つ場合、攻撃力+15%、EPを5回復する。',
        },
        {
            id: 'trailblazer-pres-stat-def-1',
            name: '防御力',
            type: 'Stat Bonus',
            description: '防御力+35.0%',
            stat: 'def_pct',
            value: 0.35
        },
        {
            id: 'trailblazer-pres-stat-atk-1',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+18.0%',
            stat: 'atk_pct',
            value: 0.18
        },
        {
            id: 'trailblazer-pres-stat-hp-1',
            name: '最大HP',
            type: 'Stat Bonus',
            description: '最大HP+10.0%',
            stat: 'hp_pct',
            value: 0.10
        }
    ],

    eidolons: {
        e1: { level: 1, name: '大地芯髄の鳴動', description: '通常攻撃に防御力25%分の、強化通常攻撃に防御力50%分の炎属性ダメージを追加する。' },
        e2: { level: 2, name: '古き寒鉄の堅守', description: 'バリアの耐久値アップ。' },
        e3: { level: 3, name: '未来を築く青図', description: '戦闘スキルのLv.+2、天賦のLv.+2' },
        e4: { level: 4, name: '文明に留まる誓い', description: '戦闘開始時、「灼熱意志」を4層獲得する。' },
        e5: { level: 5, name: '光焔を燃やす勇気', description: '必殺技のLv.+2、通常攻撃のLv.+1' },
        e6: { level: 6, name: '永世に聳える壁塁', description: '強化通常攻撃または必殺技を発動した後、開拓者の防御力+10%、最大3層。' },
    },

    defaultConfig: {
        eidolonLevel: 6,
        lightConeId: 'moment-of-victory',
        superimposition: 1,
        relicSetId: 'knight-of-purity-palace',
        ornamentSetId: 'broken-keel',
        mainStats: {
            body: 'def_pct',
            feet: 'spd',
            sphere: 'fire_dmg_boost',
            rope: 'def_pct',
        },
        subStats: [
            { stat: 'def_pct', value: 0.30 },
            { stat: 'spd', value: 10 },
            { stat: 'effect_res', value: 0.10 },
            { stat: 'hp_pct', value: 0.10 },
        ],
        rotationMode: 'sequence',
        ultStrategy: 'immediate',
    },
};

// --- Helper Functions ---

/**
 * 灼熱意志スタックを取得
 */
function getMagmaWillStacks(state: GameState, unitId: string): number {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return 0;
    const effect = unit.effects.find(e => e.id === EFFECT_IDS.MAGMA_WILL(unitId));
    return effect?.stackCount || 0;
}

/**
 * 灼熱意志スタックを設定
 */
function setMagmaWillStacks(state: GameState, unitId: string, stacks: number): GameState {
    const clampedStacks = Math.min(Math.max(0, stacks), MAX_MAGMA_WILL);

    const magmaWillEffect: IEffect = {
        id: EFFECT_IDS.MAGMA_WILL(unitId),
        name: `灼熱意志 (${clampedStacks})`,
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: clampedStacks,

        /* remove removed */
    };

    let newState = removeEffect(state, unitId, EFFECT_IDS.MAGMA_WILL(unitId));
    if (clampedStacks > 0) {
        newState = addEffect(newState, unitId, magmaWillEffect);
    }
    return newState;
}

/**
 * 味方全体に天賦バリアを付与
 */
function applyTalentShield(state: GameState, sourceId: string, eidolonLevel: number): GameState {
    const source = state.registry.get(createUnitId(sourceId));
    if (!source) return state;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    let shieldPct = getLeveledValue(ABILITY_VALUES.talentShieldDef, talentLevel);
    let shieldFlat = getLeveledValue(ABILITY_VALUES.talentShieldFlat, talentLevel);

    // E2: 耐久値アップ
    if (eidolonLevel >= 2) {
        shieldPct += 0.02;
        shieldFlat += 27;
    }

    let newState = state;
    const allies = newState.registry.getAliveAllies();
    for (const ally of allies) {
        newState = applyShield(
            newState,
            sourceId,
            ally.id,
            { scaling: 'def', multiplier: shieldPct, flat: shieldFlat },
            2,
            'TURN_END_BASED',
            '建創者の失われし宝',
            undefined, // Unique ID per application
            false
        );
    }
    return newState;
}

// --- Handler Factory ---
export const trailblazerPreservationHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `trailblazer-pres-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_ACTION_COMPLETE',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_DAMAGE_DEALT',
                'ON_BEFORE_DAMAGE_RECEIVED'
            ],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            const eidolonLevel = unit.eidolonLevel || 0;
            let newState = state;

            // --- ON_BATTLE_START ---
            if (event.type === 'ON_BATTLE_START') {
                // E4: 戦闘開始時 灼熱意志4層
                if (eidolonLevel >= 4) {
                    newState = setMagmaWillStacks(newState, sourceUnitId, 4);
                }

                // 秘技のバリア: 防御力30%+384, 1ターン
                const def = unit.stats.def;
                const shieldVal = def * 0.30 + 384;
                newState = applyShield(
                    newState,
                    sourceUnitId,
                    sourceUnitId,
                    { scaling: 'def', multiplier: 0.30, flat: 384 },
                    1,
                    'TURN_END_BASED',
                    '守護者命令',
                );
            }

            // --- ON_TURN_START ---
            if (event.type === 'ON_TURN_START' && event.sourceId === sourceUnitId) {
                // A6: バリアを持つ場合 EP回復と攻撃力バフ
                const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6_ACTION);
                if (hasA6 && (unit.shield || 0) > 0) {
                    newState = addEnergyToUnit(newState, sourceUnitId, 5, 0, false, { sourceId: sourceUnitId });

                    const a6Effect: IEffect = {
                        id: EFFECT_IDS.A6_BUFF(sourceUnitId),
                        name: '考えるより行動',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_END_BASED',
                        duration: 1,
                        modifiers: [{
                            source: '考えるより行動',
                            target: 'atk_pct',
                            type: 'add',
                            value: 0.15
                        }],

                        /* remove removed */
                    };
                    newState = addEffect(newState, sourceUnitId, a6Effect);
                }
            }

            // --- ON_BEFORE_DAMAGE_CALCULATION ---
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceUnitId) {
                const actionLog = state.currentActionLog;
                if (!actionLog) return state;

                // 通常攻撃（Blast設定）: スタック数に応じて強化版かどうか判定
                const currentStacks = getMagmaWillStacks(state, sourceUnitId);
                const hasUltBuff = unit.effects.some(e => e.id === EFFECT_IDS.ULT_ENHANCED_BASIC(sourceUnitId));

                if (actionLog.primaryActionType === 'BASIC') {
                    const isEnhanced = currentStacks >= ENHANCED_THRESHOLD || hasUltBuff;
                    const basicLevel = calculateAbilityLevel(eidolonLevel, 5, 'Basic');

                    if (isEnhanced) {
                        // 強化通常攻撃
                        const mainMult = getLeveledValue(ABILITY_VALUES.basicEnhancedMainMult, basicLevel);
                        const adjMult = getLeveledValue(ABILITY_VALUES.basicEnhancedAdjMult, basicLevel);

                        // メインターゲットか拡散対象かで倍率分岐
                        if ((event as any).isMainTarget) {
                            (event as any).multiplier = mainMult;
                            // 削靭値は強化時は20
                            (event as any).toughnessReduction = 20;
                        } else {
                            (event as any).multiplier = adjMult;
                            (event as any).toughnessReduction = 10;
                        }

                        // E1: 防御力スケーリングの追加ダメージ (+50% DEF)
                        if (eidolonLevel >= 1) {
                            const bonusDmg = unit.stats.def * 0.50;
                            newState = {
                                ...newState,
                                damageModifiers: {
                                    ...newState.damageModifiers,
                                    baseDmgAdd: (newState.damageModifiers.baseDmgAdd || 0) + bonusDmg
                                }
                            };
                        }
                    } else {
                        // 通常通常攻撃
                        const normalMult = getLeveledValue(ABILITY_VALUES.basicMult, basicLevel);

                        if ((event as any).isMainTarget) {
                            (event as any).multiplier = normalMult;
                            // 削靭値 10
                            (event as any).toughnessReduction = 10;
                        } else {
                            // 通常時は単体攻撃なので、隣接対象にはダメージ0
                            (event as any).multiplier = 0;
                            (event as any).toughnessReduction = 0;
                        }

                        // E1: 防御力スケーリングの追加ダメージ (+25% DEF)
                        // メインターゲットのみ適用
                        if (eidolonLevel >= 1 && (event as any).isMainTarget) {
                            const bonusDmg = unit.stats.def * 0.25;
                            newState = {
                                ...newState,
                                damageModifiers: {
                                    ...newState.damageModifiers,
                                    baseDmgAdd: (newState.damageModifiers.baseDmgAdd || 0) + bonusDmg
                                }
                            };
                        }
                    }
                }

                // 必殺技の倍率調整 (ATK + DEF)
                if (actionLog.primaryActionType === 'ULTIMATE') {
                    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');

                    // Def倍率は damage.hits で設定済み。
                    // ここで攻撃力部分を追加する。
                    const atkPartMult = getLeveledValue(ABILITY_VALUES.ultAtkMult, ultLevel);
                    const bonusDmg = unit.stats.atk * atkPartMult;

                    newState = {
                        ...newState,
                        damageModifiers: {
                            ...newState.damageModifiers,
                            baseDmgAdd: (newState.damageModifiers.baseDmgAdd || 0) + bonusDmg
                        }
                    };
                }
            }

            // --- ON_ACTION_COMPLETE ---
            if (event.type === 'ON_ACTION_COMPLETE' && event.sourceId === sourceUnitId) {
                const actionLog = state.currentActionLog;
                if (!actionLog) return state;

                // 通常・スキル・必殺技の後にバリア付与
                if (['BASIC', 'SKILL', 'ULTIMATE'].includes(actionLog.primaryActionType)) {
                    newState = applyTalentShield(newState, sourceUnitId, eidolonLevel);
                }

                // スタック獲得・消費
                if (actionLog.primaryActionType === 'BASIC') {
                    const currentStacks = getMagmaWillStacks(newState, sourceUnitId);
                    const hasUltBuff = unit.effects.some(e => e.id === EFFECT_IDS.ULT_ENHANCED_BASIC(sourceUnitId));
                    const isEnhanced = currentStacks >= ENHANCED_THRESHOLD || hasUltBuff;

                    if (isEnhanced) {
                        // 強化通常攻撃発動後
                        if (!hasUltBuff) {
                            newState = setMagmaWillStacks(newState, sourceUnitId, currentStacks - 4);
                        } else {
                            // 必殺技バフがあればスタック消費せずバフ解除
                            newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.ULT_ENHANCED_BASIC(sourceUnitId));
                        }

                        // エネルギー回復: 強化時は30 (Basic定義は20なので+10)
                        newState = addEnergyToUnit(newState, sourceUnitId, 10, 0, false, { sourceId: sourceUnitId });

                        // A4: 自己回復
                        const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_SURVIVAL);
                        if (hasA4) {
                            newState = applyHealing(newState, sourceUnitId, sourceUnitId, {
                                scaling: 'hp',
                                multiplier: 0.05,
                                flat: 0
                            }, '死の前に生を');
                        }

                        // E6: 防御力バフ
                        if (eidolonLevel >= 6) {
                            const currentE6Effect = unit.effects.find(e => e.id === EFFECT_IDS.E6_DEF_BUFF(sourceUnitId));
                            const e6Stacks = (currentE6Effect?.stackCount || 0) + 1;
                            const e6Effect: IEffect = {
                                id: EFFECT_IDS.E6_DEF_BUFF(sourceUnitId),
                                name: '永世に聳える壁塁',
                                category: 'BUFF',
                                sourceUnitId: sourceUnitId,
                                durationType: 'PERMANENT',
                                duration: -1,
                                stackCount: Math.min(e6Stacks, 3),
                                maxStacks: 3,
                                modifiers: [{
                                    source: '永世に聳える壁塁',
                                    target: 'def_pct',
                                    type: 'add',
                                    value: 0.10
                                }],

                                /* remove removed */
                            };
                            newState = addEffect(newState, sourceUnitId, e6Effect);
                        }
                    } else {
                        // 通常攻撃発動後 スタック+1
                        newState = setMagmaWillStacks(newState, sourceUnitId, currentStacks + 1);
                    }
                }

                if (actionLog.primaryActionType === 'SKILL') {
                    // スキル使用後: スタック+1, 被ダメ軽減, A2バフ
                    const currentStacks = getMagmaWillStacks(newState, sourceUnitId);
                    newState = setMagmaWillStacks(newState, sourceUnitId, currentStacks + 1);

                    // 自身の被ダメ軽減
                    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
                    const dmgRed = getLeveledValue(ABILITY_VALUES.skillDmgRed, skillLevel);
                    const selfDmgRedEffect: IEffect = {
                        id: `trailblazer-pres-skill-self-reduction-${sourceUnitId}`,
                        name: '不滅のアンバー (自己軽減)',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_END_BASED',
                        duration: 1,
                        modifiers: [{
                            source: '不滅のアンバー',
                            target: 'dmg_taken_reduction' as StatKey,
                            type: 'add',
                            value: dmgRed
                        }],

                        /* remove removed */
                    };
                    newState = addEffect(newState, sourceUnitId, selfDmgRedEffect);

                    // 挑発 (基礎確率100% - 効果命中/効果抵抗の判定あり)
                    const enemies = newState.registry.getAliveEnemies();
                    for (const enemy of enemies) {
                        const tauntEffect: TauntEffect = {
                            id: `taunt-${enemy.id}`,
                            type: 'Taunt',
                            name: '挑発',
                            category: 'DEBUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            duration: 1,
                            isCleansable: true,
                            targetAllyId: sourceUnitId,  // 開拓者自身を攻撃させる
                            // ignoreResistance: false (default) - 基礎確率100%なので効果抵抗判定あり
                        };
                        newState = addEffect(newState, enemy.id, tauntEffect);
                    }

                    // A2: 味方全体の被ダメ軽減
                    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_PROTECT);
                    if (hasA2) {
                        const allies = newState.registry.getAliveAllies();
                        for (const ally of allies) {
                            const a2Effect: IEffect = {
                                id: EFFECT_IDS.A2_DMG_REDUCTION(sourceUnitId, ally.id),
                                name: '弱きを助け',
                                category: 'BUFF',
                                sourceUnitId: sourceUnitId,
                                durationType: 'TURN_END_BASED',
                                duration: 1,
                                modifiers: [{
                                    source: '弱きを助け',
                                    target: 'dmg_taken_reduction' as StatKey,
                                    type: 'add',
                                    value: 0.15
                                }],

                                /* remove removed */
                            };
                            newState = addEffect(newState, ally.id, a2Effect);
                        }
                    }
                }

                if (actionLog.primaryActionType === 'ULTIMATE') {
                    // 必殺技使用後: 強化通常フラグ付与
                    const ultBuff: IEffect = {
                        id: EFFECT_IDS.ULT_ENHANCED_BASIC(sourceUnitId),
                        name: '陥陣無帰の炎槍',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,

                        /* remove removed */
                    };
                    newState = addEffect(newState, sourceUnitId, ultBuff);

                    // E6: 防御力バフ
                    if (eidolonLevel >= 6) {
                        const currentE6Effect = unit.effects.find(e => e.id === EFFECT_IDS.E6_DEF_BUFF(sourceUnitId));
                        const e6Stacks = (currentE6Effect?.stackCount || 0) + 1;
                        const e6EffectValue = 0.10;
                        const e6Effect: IEffect = {
                            id: EFFECT_IDS.E6_DEF_BUFF(sourceUnitId),
                            name: '永世に聳える壁塁',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'PERMANENT',
                            duration: -1,
                            stackCount: Math.min(e6Stacks, 3),
                            maxStacks: 3,
                            modifiers: [{
                                source: '永世に聳える壁塁',
                                target: 'def_pct',
                                type: 'add',
                                value: e6EffectValue
                            }],

                            /* remove removed */
                        };
                        newState = addEffect(newState, sourceUnitId, e6Effect);
                    }
                }
            }

            // --- ON_BEFORE_DAMAGE_RECEIVED ---
            if (event.type === 'ON_BEFORE_DAMAGE_RECEIVED' && event.targetId === sourceUnitId) {
                // 攻撃を受けるごとにスタック+1
                const currentStacks = getMagmaWillStacks(newState, sourceUnitId);
                newState = setMagmaWillStacks(newState, sourceUnitId, currentStacks + 1);
            }

            return newState;
        }
    };
};
