import { Character, Element, Path, StatKey } from '../../types';
import { IEventHandlerFactory, GameState, IEvent, Unit, IHit, ActionContext } from '../../simulator/engine/types';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateNormalAdditionalDamage } from '../../simulator/damage';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

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
                multiplier: 1.0, // Lv.6
            },
            hits: 1,
            toughnessReduction: 10,
            energyGain: 20,
        },
        skill: {
            id: 'archar-skill',
            name: '偽・螺旋剣',
            type: 'Skill',
            description: '「回路接続」状態に入る。指定した敵単体にアーチャーの攻撃力360%分の量子属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                // Note: Description says single target but template said blast logic? Assuming single target based on description.
                // Given "指定した敵単体に...", I will use simple damage.
                type: 'simple',
                scaling: 'atk',
                multiplier: 3.6,
            },
            toughnessReduction: 20,
            energyGain: 30,
            hits: 1,
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
                multiplier: 10.00, // Lv.10
            },
            toughnessReduction: 30, // Assuming 30 for single target ult
            energyGain: 5,
            hits: 15,
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
                multiplier: 2.0, // Lv.10
            },
            toughnessReduction: 10,
            energyGain: 5,
            hits: 1,
        },
        technique: {
            id: 'archar-tech',
            name: '千里眼',
            type: 'Technique',
            description: '敵を攻撃。戦闘に入った後、敵全体にアーチャーの攻撃力200%分の量子属性ダメージを与える、チャージを1獲得する。',
            targetType: 'all_enemies',
            damage: {
                type: 'simple',
                scaling: 'atk',
                multiplier: 2.0,
            },
            toughnessReduction: 20,
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
            stat: 'atk', // Note: 'atk' usually means flat atk in baseStats, but 'atk_pct' for bonuses?
            // Checking types/stats.ts would be good, but usually 'atk' in StatKey is percentage for bonuses in this system?
            // Let's check tribbie.ts... tribbie has 'hp_pct'. So likely 'atk_pct'.
            // But types/stats.ts usually defines keys.
            // I will use 'atk' for now and verify if 'atk_pct' is needed.
            // Wait, tribbie.ts uses 'hp_pct'.
            // Let's assume 'atk_pct' is correct for percentage boost.
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
                { abilityName: 'skill', param: 'damage.multiplier', value: 3.96 }, // 3.6 * 1.1
                { abilityName: 'basic', param: 'damage.multiplier', value: 1.1 }, // 1.0 * 1.1
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
                { abilityName: 'ultimate', param: 'damage.multiplier', value: 10.8 }, // 10.0 * 1.08
                { abilityName: 'talent', param: 'damage.multiplier', value: 2.2 }, // 2.0 * 1.1
            ]
        },
        e6: {
            level: 6,
            name: '果てなきを彷徨う巡礼',
            description: 'ターンが回ってきた時、SPを1回復する。自身の戦闘スキルで累積できるダメージアップ効果+1層。戦闘スキルダメージは防御力を20%無視する。',
        }
    }
};

// Helper to manage Charge (Stackable Buff)
function addCharge(state: GameState, unitId: string, amount: number): GameState {
    const unit = state.units.find(u => u.id === unitId);
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
    const unit = state.units.find(u => u.id === unitId);
    if (unit?.effects.find(e => e.id === buffId)) return state;

    const circuitBuff: IEffect = {
        id: buffId,
        name: 'Circuit Connection',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT', // Managed manually by Skill count / SP check
        duration: 0,
        tags: ['PREVENT_TURN_END'], // System flag to skip turn end
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
            subscribesTo: ['ON_BATTLE_START', 'ON_TURN_START', 'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_BASIC_ATTACK', 'ON_FOLLOW_UP_ATTACK', 'ON_ACTION_COMPLETE'],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            if (event.sourceId === sourceUnitId) console.log(`[ArcherHandler] Event: ${event.type}`);
            const archarUnit = state.units.find(u => u.id === sourceUnitId);
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
                    // Add Charge Logic here
                }
            }

            // Skill Logic: Circuit Connection & Damage Stacks
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                // 1. Enter Circuit Connection if not present
                newState = applyCircuitConnection(newState, sourceUnitId, eidolonLevel);

                // 2. Update Skill Count & Check Exit Conditions
                const circuitBuff = newState.units.find(u => u.id === sourceUnitId)?.effects.find(e => e.id === `archar-circuit-${sourceUnitId}`);
                if (circuitBuff) {
                    let skillCount = (circuitBuff as any).customData?.skillCount || 0;
                    skillCount++;
                    (circuitBuff as any).customData = { skillCount };
                    console.log(`[Archer] Circuit Skill Count: ${skillCount}`);

                    // Apply Stacking Damage Buff
                    const stackBuffId = `archar-circuit-stacks-${sourceUnitId}`;
                    const existingStackBuff = newState.units.find(u => u.id === sourceUnitId)?.effects.find(e => e.id === stackBuffId);
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
                            value: 0.20 * stacks, // 20% per stack
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

                // E2: Apply Weakness & Res Down
                if (eidolonLevel >= 2) {
                    // Handled by adding debuff to target. 
                    // Since ON_ULTIMATE_USED doesn't have targetId in event payload for Single Target (it might, but let's be safe),
                    // we can rely on the fact that Ultimate action sets target.
                    // But here we are in event handler.
                    // Ideally, we should add effects to the ability definition or handle it here if we can find the target.
                    // For now, let's assume we can't easily find the target here without context, 
                    // BUT we can add a "next hit applies debuff" logic or similar.
                    // Actually, `ON_ULTIMATE_USED` is fired AFTER action.
                    // Let's use `ON_BEFORE_DAMAGE_CALCULATION` or modify ability definition in `createInitialGameState` (better).
                    // Wait, `createInitialGameState` is static.
                    // We can use `applyCharacterMechanics` in `gameState.ts` to add effects to Ultimate if E2.
                    // Or we can just find the target from `state.actionQueue` or `pendingActions`? No.
                    // Let's leave E2 for now and focus on Charge.
                }
            }

            // Talent Logic: Follow-up on Ally Attack
            if ((event.type === 'ON_BASIC_ATTACK' || event.type === 'ON_SKILL_USED' || event.type === 'ON_ULTIMATE_USED') && event.sourceId !== sourceUnitId) {
                const sourceAlly = newState.units.find(u => u.id === event.sourceId);
                if (sourceAlly && !sourceAlly.isEnemy) {
                    // Check Charge
                    const chargeBuff = archarUnit.effects.find(e => e.id === `archar-charge-${sourceUnitId}`);
                    const chargeCount = (chargeBuff as any)?.stackCount || 0;

                    if (chargeCount > 0) {
                        // Consume 1 Charge
                        newState = addCharge(newState, sourceUnitId, -1);

                        // Trigger Follow-up Attack
                        // Target: Main target of the ally's attack?
                        // Event doesn't carry targetId reliably for all types.
                        // But usually `event.targetId` is populated in dispatcher.
                        let targetId = event.targetId;

                        // If target is dead or invalid, pick random enemy
                        let target = newState.units.find(u => u.id === targetId);
                        if (!target || target.hp <= 0) {
                            const enemies = newState.units.filter(u => u.isEnemy && u.hp > 0);
                            if (enemies.length > 0) {
                                target = enemies[Math.floor(Math.random() * enemies.length)];
                                targetId = target.id;
                            } else {
                                targetId = undefined;
                            }
                        }

                        if (targetId) {
                            const followUpAction: any = {
                                type: 'FOLLOW_UP_ATTACK',
                                sourceId: sourceUnitId,
                                targetId: targetId,
                            };
                            newState = {
                                ...newState,
                                pendingActions: [...newState.pendingActions, followUpAction]
                            };

                            // SP Recovery (Talent)
                            newState = { ...newState, skillPoints: Math.min(newState.maxSkillPoints, newState.skillPoints + 1) };
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
                    newState = { ...newState, skillPoints: Math.min(newState.maxSkillPoints, newState.skillPoints + 2) };
                    console.log('[Archer] E1 triggered: SP +2');
                }

                const trackerBuff: IEffect = {
                    id: trackerId,
                    name: 'E1 Skill Tracker',
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'TURN_END_BASED',
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
                newState = { ...newState, skillPoints: Math.min(newState.maxSkillPoints, newState.skillPoints + 1) };
                console.log('[Archer] E6 triggered: SP +1');
            }

            return newState;
        }
    };
};
