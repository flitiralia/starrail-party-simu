import { Character, Element, Path, StatKey } from '../../types';
import { IEventHandlerFactory, GameState, IEvent, Unit, IHit, ActionContext, Action } from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateNormalAdditionalDamage, calculateDamage } from '../../simulator/damage';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { addSkillPoints } from '../../simulator/effect/relicEffectHelpers';

// --- 定数定義 ---
const CHARACTER_ID = 'archar';

// 通常攻撃
const BASIC_MULT = 1.0;

// スキル
const SKILL_MULT = 3.6;
const SKILL_SP_COST = 2;
const SKILL_DMG_BOOST_PER_STACK = 1.0;

// 必殺技
const ULT_MULT = 10.0;
const ULT_CHARGE_GAIN = 2;

// 天賦
const TALENT_MULT = 2.0;

// 秘技
const TECHNIQUE_DMG_MULT = 2.0;
const TECHNIQUE_CHARGE_GAIN = 1;

// チャージ
const MAX_CHARGES = 4;

// 回路接続
const MAX_CIRCUIT_SKILLS = 5;
const BASE_CIRCUIT_STACKS = 2;
const E6_CIRCUIT_STACKS = 3;

// 星魂
const E1_SKILL_COUNT_FOR_SP = 3;
const E1_SP_RECOVER = 2;
const E2_RES_DOWN = 0.20;
const E4_ULT_DMG_BOOST = 1.50;
const E6_DEF_IGNORE = 0.20;

// 軌跡
const A2_MAX_SP_BONUS = 2;
const A4_INITIAL_CHARGE = 1;
const A6_CRIT_DMG_BOOST = 1.20;

export const archar: Character = {
    id: 'archar',
    name: 'アーチャー',
    rarity: 5,
    path: 'The Hunt',
    element: 'Quantum',
    maxEnergy: 220,
    baseStats: {
        hp: 1164,
        atk: 620,
        def: 485,
        spd: 105,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 75,
    },
    abilities: {
        basic: {
            id: 'archar-basic',
            name: '干将・莫耶',
            type: 'Basic ATK',
            description: '指定した敵単体にアーチャーの攻撃力X%分の量子属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.30, toughnessReduction: 3 },
                    { multiplier: 0.35, toughnessReduction: 3.5 },
                    { multiplier: 0.35, toughnessReduction: 3.5 }
                ],
            },
            energyGain: 20,
        },
        skill: {
            id: 'archar-skill',
            name: '偽・螺旋剣',
            type: 'Skill',
            description: '「回路接続」状態に入る。指定した敵単体にアーチャーの攻撃力360%分の量子属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 3.6, toughnessReduction: 20 }],
            },
            energyGain: 30,
            spCost: 2, // Archer's skill costs 2 SP
            effects: [], // Handled by Handler
        },
        ultimate: {
            id: 'archar-ultimate',
            name: '無限の剣製',
            type: 'Ultimate',
            description: '指定した敵単体にアーチャーの攻撃力X%分の量子属性ダメージを与え、チャージを2獲得する。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 0.40, toughnessReduction: 1.2 },
                    { multiplier: 4.40, toughnessReduction: 13.2 }
                ],
            },
            energyGain: 5,
            effects: [], // Handled by Handler
        },
        talent: {
            id: 'archar-talent',
            name: '心眼(真)',
            type: 'Talent',
            description: 'アーチャー以外の味方が敵に攻撃を行った後、アーチャーが即座にチャージを1消費してメインターゲットに追加攻撃を行う。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 2.0, toughnessReduction: 10 }],
            },
            energyGain: 5,
        },
        technique: {
            id: 'archar-tech',
            name: '千里眼',
            type: 'Technique',
            description: '敵を攻撃。戦闘に入った後、敵全体にアーチャーの攻撃力200%分の量子属性ダメージを与える、チャージを1獲得する。',
            targetType: 'all_enemies',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 2.0, toughnessReduction: 20 }],
            },
        }
    },
    traces: [
        {
            id: 'archar-trace-a2',
            name: '投影魔術',
            type: 'Bonus Ability',
            description: 'アーチャーがフィールド上にいる時、最大SP+2。',
        },
        {
            id: 'archar-trace-a4',
            name: '正義の味方',
            type: 'Bonus Ability',
            description: 'アーチャーが戦闘に入る時、チャージを1獲得する。',
        },
        {
            id: 'archar-trace-a6',
            name: '守護者',
            type: 'Bonus Ability',
            description: '味方がSPを獲得した後、SPが4以上の場合、アーチャーの会心ダメージ+120%、1ターン継続。',
        },
        {
            id: 'archar-stat-1',
            name: '量子属性ダメージ',
            type: 'Stat Bonus',
            description: '量子属性ダメージ+22.4%',
            stat: 'quantum_dmg_boost',
            value: 0.224
        },
        {
            id: 'archar-stat-2',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+18.0%',
            stat: 'atk_pct',
            value: 0.18
        },
        {
            id: 'archar-stat-3',
            name: '会心率',
            type: 'Stat Bonus',
            description: '会心率+6.7%',
            stat: 'crit_rate',
            value: 0.067
        },
    ],
    eidolons: {
        e1: {
            level: 1,
            name: '触れられなかった理想',
            description: '戦闘スキルを1ターンに3回発動した後、SPを2回復する。',
        },
        e2: {
            level: 2,
            name: '叶えられなかった幸福',
            description: '必殺技を発動する時、ターゲットの量子属性耐性-20%、さらに量子属性弱点を付与する、2ターン継続。',
        },
        e3: {
            level: 3,
            name: '凡庸に甘んじない気概',
            description: 'スキルLv+2, 通常攻撃Lv+1',
            abilityModifiers: [
                { abilityName: 'skill', param: 'damage.hits.0.multiplier', value: 3.96 }, // 3.6 * 1.1
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.1 }, // 1.0 * 1.1
            ]
        },
        e4: {
            level: 4,
            name: '英雄とは程遠い生涯',
            description: '必殺技ダメージ+150%。',
            // Handled by handler (modifier)
        },
        e5: {
            level: 5,
            name: '無銘なる孤影の守護',
            description: '必殺技Lv+2, 天賦Lv+2',
            abilityModifiers: [
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 10.8 }, // 10.0 * 1.08
                { abilityName: 'talent', param: 'damage.hits.0.multiplier', value: 2.2 }, // 2.0 * 1.1
            ]
        },
        e6: {
            level: 6,
            name: '果てなきを彷徨う巡礼',
            description: 'ターンが回ってきた時、SPを1回復する。自身の戦闘スキルで累積できるダメージアップ効果+1層。戦闘スキルダメージは防御力を20%無視する。',
        }
    },

    // デフォルト設定
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'the-hell-where-ideals-burn',
        superimposition: 1,
        relicSetId: 'genius_of_brilliant_stars',
        ornamentSetId: 'rutilant_arena',
        mainStats: {
            body: 'crit_rate',
            feet: 'spd',
            sphere: 'quantum_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.324 },
            { stat: 'crit_dmg', value: 0.648 },
            { stat: 'atk_pct', value: 0.432 },
            { stat: 'spd', value: 6 },
        ],
        rotationMode: 'spam_skill',
        spamSkillTriggerSp: 6,
        ultStrategy: 'immediate',
    },
};

// Helper to manage Charge (Stackable Buff)
function addCharge(state: GameState, unitId: string, amount: number): GameState {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return state;

    const buffId = `archar-charge-${unitId}`;
    const existingBuff = unit.effects.find(e => e.id === buffId);
    let currentStacks = (existingBuff as any)?.stackCount || 0;
    let newStacks = Math.min(4, currentStacks + amount); // Max 4 stacks

    if (newStacks === currentStacks) return state;

    const chargeBuff: IEffect = {
        id: buffId,
        name: 'Archer Charge',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: 0,
        onApply: (t, s) => s, // Visual only, logic handled in Talent
        onRemove: (t, s) => s,
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    (chargeBuff as any).stackCount = newStacks;

    // Remove old, add new to update stack count
    let newState = removeEffect(state, unitId, buffId);
    if (newStacks > 0) {
        newState = addEffect(newState, unitId, chargeBuff);
    }
    console.log(`[Archer] Charge updated: ${currentStacks} -> ${newStacks}`);
    return newState;
}

// Helper to manage Circuit Connection
function applyCircuitConnection(state: GameState, unitId: string, eidolonLevel: number): GameState {
    const buffId = `archar-circuit-${unitId}`;

    // Check if already active
    const unit = state.registry.get(createUnitId(unitId));
    if (unit?.effects.find(e => e.id === buffId)) return state;

    const circuitBuff: IEffect = {
        id: buffId,
        name: 'Circuit Connection',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT', // Managed manually by Skill count / SP check
        duration: 0,
        tags: [], // ターン終了制御はcurrentTurnStateで管理
        onApply: (t, s) => {
            return s;
        },
        onRemove: (t, s) => {
            // Remove Skill Damage Stacks when Circuit ends
            return removeEffect(s, t.id, `archar-circuit-stacks-${t.id}`);
        },
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    // Initialize custom data for skill count
    (circuitBuff as any).customData = { skillCount: 0 };

    return addEffect(state, unitId, circuitBuff);
}

export const archarHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    return {
        handlerMetadata: {
            id: `archar-handler-${sourceUnitId}`,
            subscribesTo: ['ON_BATTLE_START', 'ON_TURN_START', 'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_ATTACK', 'ON_ACTION_COMPLETE', 'ON_BEFORE_DAMAGE_CALCULATION', 'ON_SP_GAINED'],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            if (event.sourceId === sourceUnitId) console.log(`[ArcherHandler] Event: ${event.type}`);
            const archarUnit = state.registry.get(createUnitId(sourceUnitId));
            if (!archarUnit) return state;

            let newState = state;

            // Trace A2: Max SP +2
            if (event.type === 'ON_BATTLE_START') {
                const a2Trace = archarUnit.traces?.find(t => t.id === 'archar-trace-a2');
                if (a2Trace) {
                    newState = { ...newState, maxSkillPoints: 7 };
                    console.log('[Archer] Max SP increased to 7 (Trace A2)');
                }

                // Trace A4: Start with 1 Charge
                const a4Trace = archarUnit.traces?.find(t => t.id === 'archar-trace-a4');
                if (a4Trace) {
                    newState = addCharge(newState, sourceUnitId, 1);
                    console.log('[Archer] Trace A4 triggered: +1 Charge');
                }

                // E4: 必殺技ダメージ+150% (永続バフ)
                if (eidolonLevel >= 4) {
                    const e4BuffId = `archar-e4-buff-${sourceUnitId}`;
                    const e4Buff: IEffect = {
                        id: e4BuffId,
                        name: '英雄とは程遠い生涯',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,
                        modifiers: [{
                            target: 'ult_dmg_boost' as StatKey,
                            source: 'Archer E4',
                            value: E4_ULT_DMG_BOOST,
                            type: 'add'
                        }],
                        onApply: (t, s) => s,
                        onRemove: (t, s) => s,
                        apply: (t, s) => s,
                        remove: (t, s) => s
                    };
                    newState = addEffect(newState, sourceUnitId, e4Buff);
                    console.log('[Archer] E4 triggered: ult_dmg_boost +150%');
                }

                // 秘技使用フラグを確認 (デフォルト true)
                const useTechnique = archarUnit.config?.useTechnique !== false;

                if (useTechnique) {
                    // Technique: 200% ATK to all enemies + 1 Charge
                    if (archarUnit.abilities.technique) {
                        const enemies = newState.registry.getAliveEnemies();
                        const techAbility = archarUnit.abilities.technique;
                        // 最新のUnitを取得（E4バフ適用後）
                        const freshArcharUnit = newState.registry.get(createUnitId(sourceUnitId));
                        if (freshArcharUnit) {
                            enemies.forEach(enemy => {
                                // calculateDamageを使用してダメージ計算
                                const techAction: Action = { type: 'BASIC_ATTACK', sourceId: sourceUnitId, targetId: enemy.id };
                                const damage = techAbility?.damage
                                    ? calculateDamage(freshArcharUnit, enemy, techAbility, techAction)
                                    : freshArcharUnit.stats.atk * TECHNIQUE_DMG_MULT;
                                const result = applyUnifiedDamage(
                                    newState,
                                    freshArcharUnit,
                                    enemy,
                                    damage,
                                    {
                                        damageType: '秘技',
                                        details: '秘技: 全体攻撃 (200%)',
                                        skipLog: false,
                                        skipStats: false
                                    }
                                );
                                newState = result.state;
                            });
                        }

                        // Gain 1 Charge
                        newState = addCharge(newState, sourceUnitId, 1);
                        console.log('[Archer] Technique triggered: AOE Damage +1 Charge');
                    }
                }
            }

            // Skill Logic: Circuit Connection & Damage Stacks
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                // 1. Enter Circuit Connection if not present
                newState = applyCircuitConnection(newState, sourceUnitId, eidolonLevel);

                // ★ ターン終了スキップ設定（初回スキル発動時のみ）
                // 終了条件: 5回アクション OR SP < 2
                // actionCount: -1 は最初のスキル発動自体をカウントしないため
                if (!newState.currentTurnState) {
                    newState = {
                        ...newState,
                        currentTurnState: {
                            skipTurnEnd: true,
                            endConditions: [
                                { type: 'action_count', actionCount: 5 },
                                { type: 'sp_threshold', spThreshold: 2 }
                            ],
                            actionCount: -1
                        }
                    };
                }

                // 2. Update Skill Count & Check Exit Conditions
                const circuitBuff = newState.registry.get(createUnitId(sourceUnitId))?.effects.find(e => e.id === `archar-circuit-${sourceUnitId}`);
                if (circuitBuff) {
                    let skillCount = (circuitBuff as any).customData?.skillCount || 0;
                    skillCount++;
                    (circuitBuff as any).customData = { skillCount };
                    console.log(`[Archer] Circuit Skill Count: ${skillCount}`);

                    // Apply Stacking Damage Buff
                    const stackBuffId = `archar-circuit-stacks-${sourceUnitId}`;
                    const existingStackBuff = newState.registry.get(createUnitId(sourceUnitId))?.effects.find(e => e.id === stackBuffId);
                    let stacks = (existingStackBuff as any)?.stackCount || 0;
                    const maxStacks = eidolonLevel >= 6 ? 3 : 2;
                    stacks = Math.min(maxStacks, stacks + 1);

                    const stackBuff: IEffect = {
                        id: stackBuffId,
                        name: 'Circuit Damage Boost',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: 0,
                        modifiers: [{
                            target: 'skill_dmg_boost',
                            source: 'Circuit Connection',
                            value: 1.0 * stacks, // 20% per stack
                            type: 'add'
                        }],
                        onApply: (t, s) => s,
                        onRemove: (t, s) => s,
                        apply: (t, s) => s,
                        remove: (t, s) => s
                    };
                    (stackBuff as any).stackCount = stacks;
                    newState = removeEffect(newState, sourceUnitId, stackBuffId);
                    newState = addEffect(newState, sourceUnitId, stackBuff);

                    // Check Exit Conditions
                    // 1. 5 Skills used
                    // 2. Insufficient SP (Cost 2) -> Check if remaining SP is less than skill cost
                    if (skillCount >= 5 || newState.skillPoints < 2) {
                        newState = removeEffect(newState, sourceUnitId, `archar-circuit-${sourceUnitId}`);
                        console.log('[Archer] Circuit Connection ended (Limit reached or Low SP)');
                    }
                }
            }

            // Ultimate Logic: Gain 2 Charge
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                newState = addCharge(newState, sourceUnitId, 2);

                // E2: Apply Quantum Res Down & Quantum Weakness
                if (eidolonLevel >= 2 && event.targetId) {
                    const targetUnit = newState.registry.get(createUnitId(event.targetId));
                    if (targetUnit && targetUnit.isEnemy) {
                        const e2DebuffId = `archar-e2-debuff-${targetUnit.id}`;

                        const e2Debuff: IEffect = {
                            id: e2DebuffId,
                            name: '叶えられなかった幸福',
                            category: 'DEBUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_START_BASED',
                            duration: 2,
                            isCleansable: true,
                            ignoreResistance: true,  // 固定確率
                            modifiers: [{
                                target: 'quantum_res' as StatKey,
                                source: 'Archer E2',
                                value: -E2_RES_DOWN,
                                type: 'add'
                            }],
                            onApply: (t, s) => {
                                // 量子弱点を付与
                                const updatedUnit = {
                                    ...t,
                                    weaknesses: new Set([...t.weaknesses, 'Quantum' as Element])
                                };
                                return {
                                    ...s,
                                    registry: s.registry.update(t.id, u => updatedUnit)
                                };
                            },
                            onRemove: (t, s) => s,  // 弱点は消えない（原作仕様）
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        newState = addEffect(newState, targetUnit.id, e2Debuff);
                        console.log(`[Archer] E2 triggered: quantum_res -20% & Quantum weakness on ${targetUnit.name}`);
                    }
                }
            }

            // Talent Logic: Follow-up on Ally Attack (ON_ATTACK イベントで発動)
            if (event.type === 'ON_ATTACK' && event.sourceId !== sourceUnitId) {
                const sourceUnit = newState.registry.get(createUnitId(event.sourceId));
                const targetUnit = event.targetId ? newState.registry.get(createUnitId(event.targetId)) : undefined;

                // 発動条件: ソースが味方で、ターゲットが敵
                if (sourceUnit && !sourceUnit.isEnemy && targetUnit?.isEnemy) {
                    // Check Charge
                    const chargeBuff = archarUnit.effects.find(e => e.id === `archar-charge-${sourceUnitId}`);
                    const chargeCount = (chargeBuff as any)?.stackCount || 0;

                    if (chargeCount > 0) {
                        // Consume 1 Charge
                        newState = addCharge(newState, sourceUnitId, -1);

                        // Target: メインターゲット（敵）または生存敵からランダム選択
                        let followUpTargetId = event.targetId;
                        let followUpTarget = followUpTargetId ? newState.registry.get(createUnitId(followUpTargetId)) : undefined;

                        // ターゲットが倒されていた場合、ランダムな敵を選択
                        if (!followUpTarget || followUpTarget.hp <= 0) {
                            const enemies = newState.registry.getAliveEnemies();
                            if (enemies.length > 0) {
                                followUpTarget = enemies[Math.floor(Math.random() * enemies.length)];
                                followUpTargetId = followUpTarget.id;
                            } else {
                                followUpTargetId = undefined;
                            }
                        }

                        if (followUpTargetId) {
                            const followUpAction: any = {
                                type: 'FOLLOW_UP_ATTACK',
                                sourceId: sourceUnitId,
                                targetId: followUpTargetId,
                            };
                            newState = {
                                ...newState,
                                pendingActions: [...newState.pendingActions, followUpAction]
                            };

                            // SP Recovery (Talent)
                            newState = addSkillPoints(newState, 1);
                            console.log('[Archer] Talent triggered: Charge consumed, FuA queued, SP +1');
                        }
                    }
                }
            }

            // E1: SP Recovery on 3rd Skill in a turn
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId && eidolonLevel >= 1) {
                // Track skills used this turn
                // We need a turn-based counter. Use a buff with TURN_END_BASED duration 1.
                const trackerId = `archar-e1-tracker-${sourceUnitId}`;
                const existingTracker = archarUnit.effects.find(e => e.id === trackerId);
                let count = (existingTracker as any)?.stackCount || 0;
                count++;

                if (count === 3) {
                    newState = addSkillPoints(newState, 2);
                    console.log('[Archer] E1 triggered: SP +2');
                }

                const trackerBuff: IEffect = {
                    id: trackerId,
                    name: 'E1 Skill Tracker',
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'TURN_END_BASED',
                    skipFirstTurnDecrement: true,
                    duration: 1,
                    onApply: (t, s) => s,
                    onRemove: (t, s) => s,
                    apply: (t, s) => s,
                    remove: (t, s) => s
                };
                (trackerBuff as any).stackCount = count;

                newState = removeEffect(newState, sourceUnitId, trackerId);
                newState = addEffect(newState, sourceUnitId, trackerBuff);
            }

            // E6: SP Recovery on Turn Start
            if (event.type === 'ON_TURN_START' && event.sourceId === sourceUnitId && eidolonLevel >= 6) {
                newState = addSkillPoints(newState, 1);
                console.log('[Archer] E6 triggered: SP +1');
            }

            // E6: Skill damage ignores 20% DEF
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION'
                && event.sourceId === sourceUnitId
                && event.subType === 'SKILL'
                && eidolonLevel >= 6
            ) {
                newState = {
                    ...newState,
                    damageModifiers: {
                        ...newState.damageModifiers,
                        defIgnore: (newState.damageModifiers.defIgnore || 0) + E6_DEF_IGNORE
                    }
                };
                console.log('[Archer] E6 triggered: Skill damage ignores 20% DEF');
            }

            // A6: Crit DMG +120% when SP >= 4 after SP gain
            if (event.type === 'ON_SP_GAINED') {
                const a6Trace = archarUnit.traces?.find(t => t.id === 'archar-trace-a6');
                if (a6Trace && newState.skillPoints >= 4) {
                    const a6BuffId = `archar-a6-buff-${sourceUnitId}`;

                    const a6Buff: IEffect = {
                        id: a6BuffId,
                        name: '守護者',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_END_BASED',
                        skipFirstTurnDecrement: true,
                        duration: 1,
                        modifiers: [{
                            target: 'crit_dmg' as StatKey,
                            source: 'Archer A6',
                            value: A6_CRIT_DMG_BOOST,
                            type: 'add'
                        }],
                        onApply: (t, s) => s,
                        onRemove: (t, s) => s,
                        apply: (t, s) => s,
                        remove: (t, s) => s
                    };
                    newState = addEffect(newState, sourceUnitId, a6Buff);
                    console.log('[Archer] A6 triggered: crit_dmg +120%');
                }
            }

            return newState;
        }
    };
};
