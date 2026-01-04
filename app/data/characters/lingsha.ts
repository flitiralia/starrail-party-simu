import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, GeneralEvent, ActionEvent, Unit, DamageDealtEvent, HpConsumeEvent, FollowUpAttackAction } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyHealing, cleanse } from '../../simulator/engine/utils';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { advanceUnitAction } from '../../simulator/engine/actionValue';
import { calculateDamageWithCritInfo } from '../../simulator/damage';
import { reduceToughness as sharedReduceToughness } from '../../simulator/engine/utils';

// --- Constants ---
const CHAR_ID = 'lingsha';
const FUYUAN_ID_SUFFIX = 'fuyuan';

const EFFECT_IDS = {
    FUYUAN_COUNT: 'lingsha-fuyuan-count', // 浮元ユニット上での行動回数
    BEFOG: 'lingsha-befog', // 敵に付与（芳酔）
    A2_BUFF: 'lingsha-a2-buff', // 霊砂に付与（ステータス変換）
    E2_BREAK_BUFF: 'lingsha-e2-break-buff', // 味方に付与
    E6_RES_PEN: 'lingsha-e6-res-pen', // 敵に付与（浮元の攻撃時） - 永続効果ではなく動的モディファイアとして使用
    A6_CD: 'lingsha-a6-cd', // 霊砂に付与
};

const TRACE_IDS = {
    A2_VERMILION_WAFT: 'lingsha-a2',
    A4_SCENT: 'lingsha-a4',
    A6_SEQUENCER: 'lingsha-a6',
};

// --- Values ---
const ABILITY_VALUES = {
    basicDmg: { 6: 1.0, 7: 1.1 } as Record<number, number>,
    skillDmg: { 10: 0.80, 12: 0.88 } as Record<number, number>,
    skillHeal: {
        10: { mult: 0.14, flat: 420 },
        12: { mult: 0.148, flat: 467.25 }
    },
    ultDmg: { 10: 1.50, 12: 1.62 } as Record<number, number>,
    ultHeal: {
        10: { mult: 0.12, flat: 360 },
        12: { mult: 0.128, flat: 400.5 }
    },
    ultBreakDmgBoost: { 10: 0.25, 12: 0.27 } as Record<number, number>,
    talentDmgAll: { 10: 0.75, 12: 0.825 } as Record<number, number>,
    talentDmgSingle: { 10: 0.75, 12: 0.825 } as Record<number, number>,
    talentHeal: {
        10: { mult: 0.12, flat: 360 },
        12: { mult: 0.128, flat: 400.5 }
    },
};

const FUYUAN_BASE_SPD = 90;
const FUYUAN_INITIAL_COUNT = 3;
const FUYUAN_MAX_COUNT = 5;

// --- Helper Functions ---

function getFuyuanId(ownerId: string): string {
    return `${ownerId}-${FUYUAN_ID_SUFFIX}`;
}


/**
 * ダメージ計算と適用を行うヘルパー
 */
const applyAbilityDamage = (
    state: GameState,
    source: Unit,
    target: Unit,
    baseDamage: number,
    toughnessReduction: number,
    damageType: string,
    details: string,
    modifiers: any = {},
    isCritFixed?: boolean
): GameState => {
    // 1. 削靭処理（共通ユーティリティを使用）
    const { state: stateAfterToughness, wasBroken } = sharedReduceToughness(state, source.id, target.id, toughnessReduction);
    const freshTarget = stateAfterToughness.registry.get(createUnitId(target.id)) || target;

    // 2. Calculate Damage
    const multiplier = baseDamage / (source.stats.atk > 0 ? source.stats.atk : 1);

    const validAbility: any = {
        damage: {
            type: 'simple',
            scaling: 'atk',
            hits: [{ multiplier: multiplier }] // 靭性はここで手動処理済みなので0
        }
    };

    const dummyAction: any = { type: damageType === 'Follow-up' ? 'FOLLOW_UP_ATTACK' : (damageType === 'Ultimate' ? 'ULTIMATE' : 'SKILL') };

    const { damage, isCrit, breakdownMultipliers } = calculateDamageWithCritInfo(
        source,
        freshTarget,
        validAbility,
        dummyAction,
        modifiers
    );

    // 3. ダメージ適用
    const result = applyUnifiedDamage(stateAfterToughness, source, freshTarget, damage, {
        damageType: damageType,
        details: details,
        isCrit: isCrit,
        breakdownMultipliers: breakdownMultipliers,
        // events: [ ... ] // 必要なら撃破イベント？
    });

    return result.state;
};


// 浮元の行動回数を更新する
function updateFuyuanCount(state: GameState, ownerId: string, amount: number): GameState {
    let newState = state;
    const fuyuanId = getFuyuanId(ownerId);
    const fuyuanUnit = newState.registry.get(createUnitId(fuyuanId));

    // 浮元が存在しない場合、プラスの更新なら召喚する
    if (!fuyuanUnit) {
        if (amount > 0) {
            return spawnFuyuan(newState, ownerId, amount);
        }
        return newState;
    }

    const currentEffect = fuyuanUnit.effects.find(e => e.id === EFFECT_IDS.FUYUAN_COUNT);
    const currentCount = currentEffect ? (currentEffect.stackCount || 0) : 0;

    let newCount = currentCount + amount;
    if (newCount > FUYUAN_MAX_COUNT) newCount = FUYUAN_MAX_COUNT;

    if (newCount <= 0) {
        // 行動回数0で消滅
        newState = {
            ...newState,
            registry: newState.registry.remove(createUnitId(fuyuanId))
        };
        return newState;
    }

    // カウント更新
    if (currentEffect) {
        newState = removeEffect(newState, fuyuanUnit.id, EFFECT_IDS.FUYUAN_COUNT);
    }

    const countEffect: IEffect = {
        id: EFFECT_IDS.FUYUAN_COUNT,
        name: `浮元行動回数 (${newCount})`,
        category: 'OTHER',
        sourceUnitId: ownerId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: newCount,
        maxStacks: FUYUAN_MAX_COUNT,

        /* remove removed */
    };


    newState = addEffect(newState, fuyuanUnit.id, countEffect);
    return newState;
}

// 浮元を召喚する
function spawnFuyuan(state: GameState, ownerId: string, initialCount: number = FUYUAN_INITIAL_COUNT): GameState {
    let newState = state;
    const owner = newState.registry.get(createUnitId(ownerId));
    if (!owner) return newState;

    const fuyuanId = getFuyuanId(ownerId);

    if (newState.registry.get(createUnitId(fuyuanId))) {
        return updateFuyuanCount(newState, ownerId, initialCount);
    }

    const fuyuanUnit: Unit = {
        id: createUnitId(fuyuanId),
        name: '浮元',
        isEnemy: false,
        isSummon: true,
        ownerId: createUnitId(ownerId),
        element: 'Fire',
        level: owner.level,
        abilities: {
            basic: { id: 'fuyuan-atk', name: '浮元攻撃', type: 'Talent', description: '' },
            skill: { id: 'fuyuan-skill', name: '浮元スキル', type: 'Talent', description: '' },
            ultimate: { id: 'fuyuan-ult', name: '浮元必殺', type: 'Talent', description: '' },
            talent: { id: 'fuyuan-talent', name: '浮元天賦', type: 'Talent', description: '' },
            technique: { id: 'fuyuan-tech', name: '浮元秘技', type: 'Technique', description: '' }
        },
        baseStats: {
            hp: 1, atk: 0, def: 0, spd: FUYUAN_BASE_SPD,
            crit_rate: 0, crit_dmg: 0, aggro: 0
        } as any,
        stats: {
            // 初期ステータス（速度以外は全て0）
            hp: 1, atk: 0, def: 0, spd: FUYUAN_BASE_SPD,
            crit_rate: 0, crit_dmg: 0, aggro: 0,
            hp_pct: 0, atk_pct: 0, def_pct: 0, spd_pct: 0,
            break_effect: 0, effect_hit_rate: 0, effect_res: 0, energy_regen_rate: 1, max_ep: 0,
            outgoing_healing_boost: 0, incoming_heal_boost: 0, shield_strength_boost: 0,
            physical_dmg_boost: 0, fire_dmg_boost: 0, ice_dmg_boost: 0, lightning_dmg_boost: 0, wind_dmg_boost: 0, quantum_dmg_boost: 0, imaginary_dmg_boost: 0, all_type_dmg_boost: 0,
            physical_res_pen: 0, fire_res_pen: 0, ice_res_pen: 0, lightning_res_pen: 0, wind_res_pen: 0, quantum_res_pen: 0, imaginary_res_pen: 0, all_type_res_pen: 0,
            physical_res: 0, fire_res: 0, ice_res: 0, lightning_res: 0, wind_res: 0, quantum_res: 0, imaginary_res: 0, crowd_control_res: 0,
            bleed_res: 0, burn_res: 0, frozen_res: 0, shock_res: 0, wind_shear_res: 0, entanglement_res: 0, imprisonment_res: 0,
            all_dmg_taken_boost: 0, break_dmg_taken_boost: 0, dot_dmg_taken_boost: 0,
            physical_dmg_taken_boost: 0, fire_dmg_taken_boost: 0, ice_dmg_taken_boost: 0, lightning_dmg_taken_boost: 0, wind_dmg_taken_boost: 0, quantum_dmg_taken_boost: 0, imaginary_dmg_taken_boost: 0,
            def_reduction: 0, def_ignore: 0,
            break_efficiency_boost: 0, break_dmg_boost: 0, super_break_dmg_boost: 0,
            fua_dmg_boost: 0, dot_dmg_boost: 0, dot_def_ignore: 0,
            all_dmg_dealt_reduction: 0, dmg_taken_reduction: 0,
            basic_atk_dmg_boost: 0, skill_dmg_boost: 0, ult_dmg_boost: 0
        },
        hp: 1, ep: 0, shield: 0, toughness: 0, maxToughness: 0,
        weaknesses: new Set(),
        modifiers: [],
        effects: [],
        actionValue: 10000 / FUYUAN_BASE_SPD, // 90SPD
        rotationIndex: 0,
        ultCooldown: 0,
        untargetable: true,
        debuffImmune: true
    };

    newState = {
        ...newState,
        registry: newState.registry.add(fuyuanUnit)
    };

    const countEffect: IEffect = {
        id: EFFECT_IDS.FUYUAN_COUNT,
        name: `浮元行動回数 (${initialCount})`,
        category: 'OTHER',
        sourceUnitId: ownerId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: initialCount,
        maxStacks: FUYUAN_MAX_COUNT,

        /* remove removed */
    };
    newState = addEffect(newState, fuyuanUnit.id, countEffect);

    return newState;
}

// 浮元の行動ロジック
function executeFuyuanAction(state: GameState, fuyuanId: string, ownerId: string, eidolonLevel: number, isExtraAction: boolean = false): GameState {
    let newState = state;
    const owner = newState.registry.get(createUnitId(ownerId));
    if (!owner) return newState;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const dmgAllMult = getLeveledValue(ABILITY_VALUES.talentDmgAll, talentLevel);
    const dmgSingleMult = getLeveledValue(ABILITY_VALUES.talentDmgSingle, talentLevel);
    const healVal = getLeveledValue(ABILITY_VALUES.talentHeal, talentLevel);

    const isE6 = eidolonLevel >= 6;
    const modifiers = isE6 ? { resReduction: 0.20 } : {};

    // 敵全体攻撃
    const enemies = newState.registry.getAliveEnemies();
    enemies.forEach(target => {
        newState = applyAbilityDamage(
            newState,
            owner,
            target,
            owner.stats.atk * dmgAllMult,
            10, // 靭性削り
            'Follow-up',
            '浮元全体攻撃',
            modifiers
        );
    });

    // ランダム敵単体 (ターゲット優先: 炎弱点あり && 靭性>0)
    const priorityTargets = enemies.filter(e => e.weaknesses.has('Fire') && e.toughness > 0);
    let singleTarget = null;

    if (priorityTargets.length > 0) {
        singleTarget = priorityTargets[Math.floor(Math.random() * priorityTargets.length)];
    } else if (enemies.length > 0) {
        singleTarget = enemies[Math.floor(Math.random() * enemies.length)];
    }

    if (singleTarget) {
        const target = newState.registry.get(createUnitId(singleTarget.id)) || singleTarget;
        newState = applyAbilityDamage(
            newState,
            owner,
            target,
            owner.stats.atk * dmgSingleMult,
            10, // 靭性削り
            'Follow-up',
            '浮元単体攻撃',
            modifiers
        );

        // E6 多段ヒット (4回, ダメージ50%, 靭性削り5)
        if (isE6) {
            for (let i = 0; i < 4; i++) {
                // 各ヒットでランダムターゲット再抽選
                const freshState = newState;
                const e6PriorityTargets = freshState.registry.getAliveEnemies().filter(e => e.weaknesses.has('Fire') && e.toughness > 0);
                let e6Target = null;
                if (e6PriorityTargets.length > 0) {
                    e6Target = e6PriorityTargets[Math.floor(Math.random() * e6PriorityTargets.length)];
                } else {
                    const alive = freshState.registry.getAliveEnemies();
                    if (alive.length > 0) e6Target = alive[Math.floor(Math.random() * alive.length)];
                }

                if (e6Target) {
                    const latestE6Target = freshState.registry.get(createUnitId(e6Target.id)) || e6Target;
                    newState = applyAbilityDamage(
                        newState,
                        owner,
                        latestE6Target,
                        owner.stats.atk * 0.50,
                        5,
                        'Follow-up',
                        `浮元E6追撃(${i + 1})`,
                        modifiers
                    );
                }
            }
        }
    }

    // 味方回復 + デバフ解除 (1個)
    const allies = newState.registry.getAliveAllies();

    // E4: 残りHPが最も低い味方のHPを、霊砂の攻撃力40%分回復
    let e4TargetId: string | undefined;
    let minHpPct = 2.0;
    if (eidolonLevel >= 4) {
        allies.forEach(a => {
            const pct = a.hp / a.stats.hp;
            if (pct < minHpPct) {
                minHpPct = pct;
                e4TargetId = a.id;
            }
        });
    }

    allies.forEach(ally => {
        newState = cleanse(newState, ally.id, 1);

        newState = applyHealing(newState, ownerId, ally.id, {
            scaling: 'atk',
            multiplier: healVal.mult,
            flat: healVal.flat
        }, '浮元回復', true);
    });

    if (eidolonLevel >= 4 && e4TargetId) {
        newState = applyHealing(newState, ownerId, e4TargetId, {
            scaling: 'atk',
            multiplier: 0.40,
            flat: 0
        }, '浮元E4回復', true);
    }

    // 行動回数消費 (追加行動でない場合)
    if (!isExtraAction) {
        newState = updateFuyuanCount(newState, ownerId, -1);
    }

    return newState;
}

// A2: 撃破特効変換バフ
function applyA2Buff(state: GameState, ownerId: string): GameState {
    const owner = state.registry.get(createUnitId(ownerId));
    if (!owner) return state;

    const be = owner.stats.break_effect ?? 0;
    const atkBuff = Math.min(be * 0.25, 0.50);
    const healBuff = Math.min(be * 0.10, 0.20);

    const effect: IEffect = {
        id: EFFECT_IDS.A2_BUFF,
        name: '朱炎 (ステータス変換)',
        category: 'BUFF',
        sourceUnitId: ownerId,
        durationType: 'PERMANENT',
        duration: -1,
        modifiers: [
            { source: 'A2', target: 'atk_pct', type: 'add', value: atkBuff },
            { source: 'A2', target: 'outgoing_healing_boost', type: 'add', value: healBuff }
        ],

        /* remove removed */
    };

    return addEffect(state, ownerId, effect);
}

// 芳酔 (Befog) デバフ付与
function applyBefog(state: GameState, ownerId: string, targetId: string, eidolonLevel: number): GameState {
    const owner = state.registry.get(createUnitId(ownerId));
    if (!owner) return state;

    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const breakDmgUp = getLeveledValue(ABILITY_VALUES.ultBreakDmgBoost, ultLevel);

    const effect: IEffect = {
        id: EFFECT_IDS.BEFOG,
        name: '芳酔',
        category: 'DEBUFF',
        sourceUnitId: ownerId,
        durationType: 'TURN_END_BASED',
        duration: 2,
        modifiers: [
            { source: '芳酔', target: 'break_dmg_taken_boost', type: 'add', value: breakDmgUp }
        ],

        /* remove removed */
    };

    return addEffect(state, targetId, effect);
}

// ハンドラ定義
const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    // 1凸: 撃破効率+50%
    if (eidolonLevel >= 1) {
        const e1Buff: IEffect = {
            id: 'lingsha-e1-efficiency',
            name: 'E1: 撃破効率+50%',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            modifiers: [{ source: 'E1', target: 'break_efficiency_boost', type: 'add', value: 0.50 }],
            /* remove removed */
        };
        newState = addEffect(newState, sourceUnitId, e1Buff);
    }

    if (source.config?.useTechnique !== false) {
        newState = spawnFuyuan(newState, sourceUnitId, FUYUAN_INITIAL_COUNT);
        newState.registry.getAliveEnemies().forEach(e => {
            newState = applyBefog(newState, sourceUnitId, e.id, eidolonLevel);
        });
    }

    if (source.traces?.some(t => t.id === TRACE_IDS.A2_VERMILION_WAFT)) {
        newState = applyA2Buff(newState, sourceUnitId);
    }

    return newState;
};

const onTurnStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const fuyuanId = getFuyuanId(sourceUnitId);
    if (event.sourceId === fuyuanId) {
        return executeFuyuanAction(state, fuyuanId, sourceUnitId, eidolonLevel);
    }

    if (event.sourceId === sourceUnitId) {
        const source = state.registry.get(createUnitId(sourceUnitId));
        if (source?.traces?.some(t => t.id === TRACE_IDS.A2_VERMILION_WAFT)) {
            return applyA2Buff(state, sourceUnitId);
        }
    }

    return state;
};

const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const dmgMult = getLeveledValue(ABILITY_VALUES.skillDmg, skillLevel);
    const healVal = getLeveledValue(ABILITY_VALUES.skillHeal, skillLevel);

    newState.registry.getAliveEnemies().forEach(target => {
        newState = applyAbilityDamage(
            newState,
            source,
            target,
            source.stats.atk * dmgMult,
            10,
            'Skill',
            '彩煙'
        );
    });

    newState.registry.getAliveAllies().forEach(ally => {
        newState = applyHealing(newState, sourceUnitId, ally.id, {
            scaling: 'atk',
            multiplier: healVal.mult,
            flat: healVal.flat
        }, '彩煙回復', true);
    });

    newState = updateFuyuanCount(newState, sourceUnitId, 3);

    const fuyuanId = getFuyuanId(sourceUnitId);
    const fuyuan = newState.registry.get(createUnitId(fuyuanId));
    if (fuyuan) {
        newState = advanceUnitAction(newState, fuyuanId, 0.20);
    }

    return newState;
};

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const dmgMult = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);
    const healVal = getLeveledValue(ABILITY_VALUES.ultHeal, ultLevel);

    if (eidolonLevel >= 2) {
        newState.registry.getAliveAllies().forEach(ally => {
            const e2Buff: IEffect = {
                id: EFFECT_IDS.E2_BREAK_BUFF,
                name: 'E2: 撃破特効+40%',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_START_BASED',
                duration: 3,
                modifiers: [{ source: 'E2', target: 'break_effect', type: 'add', value: 0.40 }],
                /* remove removed */
            };
            newState = addEffect(newState, ally.id, e2Buff);
        });
    }

    newState.registry.getAliveEnemies().forEach(target => {
        newState = applyBefog(newState, sourceUnitId, target.id, eidolonLevel);
    });

    newState.registry.getAliveEnemies().forEach(target => {
        newState = applyAbilityDamage(
            newState,
            source,
            target,
            source.stats.atk * dmgMult,
            10,
            'Ultimate',
            '彩雲の如く巡る霞'
        );
    });

    newState.registry.getAliveAllies().forEach(ally => {
        newState = applyHealing(newState, sourceUnitId, ally.id, {
            scaling: 'atk',
            multiplier: healVal.mult,
            flat: healVal.flat
        }, '必殺技回復', true);
    });

    const fuyuanId = getFuyuanId(sourceUnitId);
    if (newState.registry.get(createUnitId(fuyuanId))) {
        newState = advanceUnitAction(newState, fuyuanId, 1.0);
    }

    return newState;
};

const onBasicAttack = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    const hasA4 = source.traces?.some(t => t.id === TRACE_IDS.A4_SCENT);

    if (hasA4) {
        newState = addEnergyToUnit(newState, sourceUnitId, 10);
    }

    return newState;
};

const checkA6Trigger = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source || !source.traces?.some(t => t.id === TRACE_IDS.A6_SEQUENCER)) return state;

    const fuyuanId = getFuyuanId(sourceUnitId);
    if (!state.registry.get(createUnitId(fuyuanId))) return state;

    const cdEffect = source.effects.find(e => e.id === EFFECT_IDS.A6_CD);
    if (cdEffect) return state;

    const allies = state.registry.getAliveAllies();
    const hasLowHp = allies.some(a => (a.hp / a.stats.hp) <= 0.60);

    if (hasLowHp) {
        let newState = state;
        newState = executeFuyuanAction(newState, fuyuanId, sourceUnitId, eidolonLevel, true);
        const cooldown: IEffect = {
            id: EFFECT_IDS.A6_CD,
            name: 'A6 クールダウン',
            category: 'OTHER',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: 2,
            /* remove removed */
        };
        newState = addEffect(newState, sourceUnitId, cooldown);
        return newState;
    }

    return state;
};

export const lingshaHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, eidolonLevel = 0) => {
    return {
        handlerMetadata: {
            id: `lingsha-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_BASIC_ATTACK',
                'ON_ACTION_COMPLETE',
                'ON_HP_CONSUMED',
                'ON_WEAKNESS_BREAK'
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const source = state.registry.get(createUnitId(sourceUnitId));
            if (!source) return state;

            if (event.type === 'ON_BATTLE_START') return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_TURN_START') return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_SKILL_USED') return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_ULTIMATE_USED') return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_BASIC_ATTACK') return onBasicAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);

            if (event.type === 'ON_WEAKNESS_BREAK') {
                if (eidolonLevel >= 1) {
                    const tId = (event as any).targetId;
                    if (tId) {
                        const e1DefDebuff: IEffect = {
                            id: 'lingsha-e1-def-down',
                            name: 'E1: 防御力-20%',
                            category: 'DEBUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_START_BASED',
                            duration: 2,
                            modifiers: [{ source: 'E1', target: 'def_reduction' as StatKey, type: 'add', value: 0.20 }],

                            /* remove removed */
                        };
                        return addEffect(state, tId, e1DefDebuff);
                    }
                }
                return state;
            }

            // A6トリガー (アクション完了時に判定 - 本家仕様準拠)
            if (event.type === 'ON_ACTION_COMPLETE') {
                const actionEvent = event as ActionEvent;
                // 味方がダメージを受けた場合のA6トリガーは、芳元の行動完了時にチェック
                return checkA6Trigger(event as IEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_HP_CONSUMED') {
                return checkA6Trigger(event as IEvent, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};

export const lingsha: Character = {
    id: CHAR_ID,
    name: "霊砂",
    path: 'Abundance',
    element: 'Fire',
    rarity: 5,
    maxEnergy: 110,
    baseStats: {
        hp: 1358,
        atk: 679,
        def: 436,
        spd: 98,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'lingsha-basic',
            name: "供香",
            type: 'Basic ATK',
            description: "敵単体に炎属性ダメージ。",
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            },
            energyGain: 20
        },
        skill: {
            id: 'lingsha-skill',
            name: "彩煙",
            type: 'Skill',
            description: "敵全体に炎属性ダメージ、味方全体HP回復、「浮元」行動順20%短縮。",
            targetType: 'all_enemies',
            energyGain: 30
        },
        ultimate: {
            id: 'lingsha-ult',
            name: "彩雲の如く巡る霞",
            type: 'Ultimate',
            description: "敵全体を「芳酔」状態にする。全体ダメージ+全体回復。「浮元」行動順100%短縮。",
            targetType: 'all_enemies',
            energyGain: 5
        },
        talent: {
            id: 'lingsha-talent',
            name: "紅霧より出づる煙獣",
            type: 'Talent',
            description: "スキル使用時「浮元」を召喚。浮元は追加全体攻撃と回復を行う。",
            targetType: 'self'
        },
        technique: {
            id: 'lingsha-tech',
            name: "流翠散雲",
            type: 'Technique',
            description: "戦闘開始時「浮元」召喚、敵全体を「芳酔」にする。"
        }
    },
    traces: [
        { id: TRACE_IDS.A2_VERMILION_WAFT, name: "朱炎", type: 'Bonus Ability', description: "攻撃力と治癒量を撃破特効に応じてアップ。" },
        { id: TRACE_IDS.A4_SCENT, name: "幽香", type: 'Bonus Ability', description: "通常攻撃時EP+10。" },
        { id: TRACE_IDS.A6_SEQUENCER, name: "余香", type: 'Bonus Ability', description: "HP低下時、「浮元」が追加攻撃を行う。" },
        { id: 'stat-be', name: '撃破特効', type: 'Stat Bonus', stat: 'break_effect', value: 0.373, description: '撃破特効+37.3%' },
        { id: 'stat-hp', name: 'HP', type: 'Stat Bonus', stat: 'hp_pct', value: 0.18, description: 'HP+18%' },
        { id: 'stat-atk', name: '攻撃力', type: 'Stat Bonus', stat: 'atk_pct', value: 0.10, description: '攻撃力+10%' },
    ],
    eidolons: {
        e1: { level: 1, name: "破邪の香り", description: "弱点撃破効率+50%。撃破時防御-20%。" },
        e2: { level: 2, name: "垂れ雲に紅香炉", description: "必殺技時、味方全体撃破特効+40%。" },
        e3: { level: 3, name: "一縷の新芽", description: "必殺技Lv+2, 天賦Lv+2" },
        e4: { level: 4, name: "帳を撫でる朱煙", description: "浮元行動時、低HP味方を回復。" },
        e5: { level: 5, name: "揺るがぬ規矩", description: "スキルLv+2, 通常Lv+1" },
        e6: { level: 6, name: "春蘭の宿香", description: "浮元存在時、敵全耐性-20%。浮元攻撃多段化。" }
    },
    defaultConfig: {
        lightConeId: 'scent-alone-stays-true',
        superimposition: 1,
        relicSetId: 'iron-cavalry-against-scourge',
        ornamentSetId: 'forge-of-the-kalpagni-lantern',
        mainStats: {
            body: 'outgoing_healing_boost',
            feet: 'spd',
            sphere: 'atk_pct',
            rope: 'break_effect',
        },
        subStats: [
            { stat: 'break_effect', value: 0.30 },
            { stat: 'spd', value: 5 },
            { stat: 'atk_pct', value: 0.10 },
            { stat: 'hp_pct', value: 0.10 },
        ],
        rotationMode: 'sequence',
        rotation: ['s', 'b', 'b'],
        ultStrategy: 'immediate',
    }
};
