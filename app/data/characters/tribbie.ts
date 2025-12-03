import { Character, Element, Path, StatKey } from '../../types';
import { IEventHandlerFactory, GameState, IEvent, Unit, IHit, ActionContext } from '../../simulator/engine/types';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateNormalAdditionalDamage } from '../../simulator/damage';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

export const tribbie: Character = {
    id: 'tribbie',
    name: 'トリビー',
    path: 'Harmony',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1047,
        atk: 524,
        def: 728,
        spd: 96,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'tribbie-basic',
            name: '百発分のピラヴロス',
            type: 'Basic ATK',
            description: '指定した敵単体および隣接する敵に量子属性ダメージを与える。',
            targetType: 'blast',
            damage: {
                type: 'blast',
                scaling: 'hp',
                mainMultiplier: 0.3, // Lv.6
                adjacentMultiplier: 0.15, // Lv.6
            },
            energyGain: 20,
            toughnessReduction: 10,
        },
        skill: {
            id: 'tribbie-skill',
            name: 'プレゼントはどこ？',
            type: 'Skill',
            description: '味方全体に「神の啓示」を付与する。全属性耐性貫通+24%。3ターン継続。',
            targetType: 'self',
            energyGain: 30,
            toughnessReduction: 0,
            effects: [] // Handled by Handler (Aura)
        },
        ultimate: {
            id: 'tribbie-ultimate',
            name: 'ここに住んでるのは誰でしょう！',
            type: 'Ultimate',
            description: '結界を展開し、敵全体に量子属性ダメージを与える。結界展開中、敵の被ダメージをアップさせる。また、味方の攻撃後、最もHPの高い敵に付加ダメージを与える。',
            targetType: 'all_enemies',
            energyGain: 5,
            toughnessReduction: 20,
            damage: {
                type: 'simple',
                scaling: 'hp',
                multiplier: 0.3 // Lv.10
            },
            effects: [] // Field handled by handler
        },
        talent: {
            id: 'tribbie-talent',
            name: 'どたばたトリビー',
            type: 'Talent',
            description: '自身以外の味方が必殺技を発動した後、トリビーが追加攻撃を行い、敵全体に量子属性ダメージを与える。この効果は各味方につき1回まで発動可能で、トリビーが必殺技を発動すると回数がリセットされる。',
            targetType: 'all_enemies', // AoE Follow-up
            damage: {
                type: 'simple',
                scaling: 'hp',
                multiplier: 0.18 // Lv.10
            },
            energyGain: 5,
            toughnessReduction: 5,
        },
        technique: {
            id: 'tribbie-technique',
            name: '楽しいなら手を叩こう',
            type: 'Technique',
            description: '戦闘開始時、味方全体に「神の啓示」を付与する。',
            toughnessReduction: 0,
        }
    },
    traces: [
        {
            id: 'tribbie-trace-1',
            name: '壁の外の子羊…',
            type: 'Bonus Ability',
            description: '天賦の追加攻撃を行った後、トリビーの与ダメージ+72%。最大3層累積、3ターン継続。',
        },
        {
            id: 'tribbie-trace-2',
            name: '羽の生えたガラス玉！',
            type: 'Bonus Ability',
            description: '結界が展開されている間、トリビーの最大HPが「味方全体の最大HP合計値の9%分」アップする。',
        },
        {
            id: 'tribbie-trace-3',
            name: '分かれ道の傍の小石？',
            type: 'Bonus Ability',
            description: '戦闘開始時、EPを30回復する。トリビー以外の味方が攻撃を行った後、命中した敵1体につき、トリビーがEPを1.5回復する。',
        },
        {
            id: 'tribbie-stat-cd',
            name: '会心ダメージ',
            type: 'Stat Bonus',
            description: '会心ダメージ+37.3%',
            stat: 'crit_dmg',
            value: 0.373,
        },
        {
            id: 'tribbie-stat-cr',
            name: '会心率',
            type: 'Stat Bonus',
            description: '会心率+12.0%',
            stat: 'crit_rate',
            value: 0.12,
        },
        {
            id: 'tribbie-stat-hp',
            name: 'HP',
            type: 'Stat Bonus',
            description: 'HP+10.0%',
            stat: 'hp_pct',
            value: 0.10,
        }
    ],
    eidolons: {
        e1: {
            level: 1,
            name: '砂糖を拾い上げる祭典',
            description: '結界中、味方の攻撃後、付加ダメージを受けた敵に総ダメージの24%分の確定ダメージを与える。'
        },
        e2: {
            level: 2,
            name: '素敵な夢への案内人',
            description: '結界の付加ダメージ倍率120%UP。さらに1回付加ダメージを追加。'
        },
        e3: {
            level: 3,
            name: '朝焼けの宝物',
            description: '必殺技Lv.+2、通常攻撃Lv.+1',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.mainMultiplier', value: 0.33 },
                { abilityName: 'basic', param: 'damage.adjacentMultiplier', value: 0.16 },
                { abilityName: 'ultimate', param: 'damage.multiplier', value: 0.34 },
            ]
        },
        e4: {
            level: 4,
            name: '心通い合う安らぎ',
            description: '「神の啓示」中、味方全体の防御無視+18%。'
        },
        e5: {
            level: 5,
            name: '奇跡を起こす時計',
            description: '戦闘スキルLv.+2、天賦Lv.+2',
            abilityModifiers: [
                { abilityName: 'skill', param: 'effects.0.modifiers.0.value', value: 0.276 },
                { abilityName: 'talent', param: 'damage.multiplier', value: 0.198 }
            ]
        },
        e6: {
            level: 6,
            name: '星が煌めく明日',
            description: '必殺技発動後、敵全体に天賦の追加攻撃を行う。ダメージ+729%。'
        }
    }
};

// Helper to create the Aura Effect
function createDivineRevelationAura(sourceId: string, duration: number, eidolonLevel: number): IEffect {
    return {
        id: `divine-revelation-aura-${sourceId}`,
        name: 'Divine Revelation Aura',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: duration,
        onApply: (t, s) => {
            // Apply Buff to ALL allies (including self)
            let newState = s;
            s.units.forEach(u => {
                if (!u.isEnemy && u.hp > 0) {
                    const buff: IEffect = {
                        id: `divine-revelation-buff-${sourceId}-${u.id}`,
                        name: 'Divine Revelation',
                        category: 'BUFF',
                        sourceUnitId: sourceId,
                        durationType: 'PERMANENT', // Managed by Aura
                        duration: 0,
                        onApply: (target, state) => {
                            const newModifiers = [...target.modifiers, {
                                source: 'Divine Revelation',
                                target: 'all_type_res_pen' as StatKey,
                                type: 'add' as const,
                                value: 0.24,
                            }];
                            if (eidolonLevel >= 4) {
                                newModifiers.push({
                                    source: 'Divine Revelation (E4)',
                                    target: 'def_ignore' as StatKey,
                                    type: 'add' as const,
                                    value: 0.18
                                });
                            }
                            return { ...state, units: state.units.map(unit => unit.id === target.id ? { ...unit, modifiers: newModifiers } : unit) };
                        },
                        onRemove: (target, state) => {
                            const newModifiers = target.modifiers.filter(m => m.source !== 'Divine Revelation' && m.source !== 'Divine Revelation (E4)');
                            return { ...state, units: state.units.map(unit => unit.id === target.id ? { ...unit, modifiers: newModifiers } : unit) };
                        },
                        apply: (target, state) => state,
                        remove: (target, state) => state
                    };
                    newState = addEffect(newState, u.id, buff);
                }
            });
            return newState;
        },
        onRemove: (t, s) => {
            // Remove Buff from ALL allies
            let newState = s;
            s.units.forEach(u => {
                if (!u.isEnemy) {
                    newState = removeEffect(newState, u.id, `divine-revelation-buff-${sourceId}-${u.id}`);
                }
            });
            return newState;
        },
        apply: (t, s) => s,
        remove: (t, s) => s
    };
}

export const tribbieHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    return {
        handlerMetadata: {
            id: `tribbie-handler-${sourceUnitId}`,
            subscribesTo: ['ON_DAMAGE_DEALT', 'ON_TURN_START', 'ON_BATTLE_START', 'ON_ULTIMATE_USED', 'ON_SKILL_USED', 'ON_BASIC_ATTACK', 'ON_FOLLOW_UP_ATTACK'],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const tribbieUnit = state.units.find(u => u.id === sourceUnitId);
            if (!tribbieUnit) return state;

            let newState = state;

            // Technique: Battle Start
            if (event.type === 'ON_BATTLE_START') {
                console.log('[Tribbie Handler] ON_BATTLE_START event received');

                // Apply Aura
                const aura = createDivineRevelationAura(sourceUnitId, 3, eidolonLevel);
                newState = addEffect(newState, sourceUnitId, aura);

                console.log('[Tribbie Handler] After addEffect, tribbie effects:',
                    newState.units.find(u => u.id === sourceUnitId)?.effects.length);

                // Log Technique Activation
                newState.log.push({
                    characterName: tribbieUnit.name,
                    actionTime: newState.time,
                    actionType: 'Technique',
                    skillPointsAfterAction: newState.skillPoints,
                    damageDealt: 0,
                    healingDone: 0,
                    shieldApplied: 0,
                    sourceHpState: `${tribbieUnit.hp.toFixed(0)}/${tribbieUnit.stats.hp.toFixed(0)}`,
                    targetHpState: '',
                    targetToughness: '',
                    currentEp: tribbieUnit.ep,
                    activeEffects: [],
                    details: '秘技: 神の啓示を付与'
                } as any);

                // Trace 3: Energy Regen at Battle Start
                const pebbleTrace = tribbieUnit.traces?.find(t => t.id === 'tribbie-trace-3');
                if (pebbleTrace) {
                    // ★ FIX: Get the latest tribbie unit from newState (after addEffect)
                    const currentTribbie = newState.units.find(u => u.id === sourceUnitId);
                    if (currentTribbie) {
                        const newEp = Math.min(currentTribbie.ep + 30, currentTribbie.stats.max_ep);
                        const updatedTribbie = { ...currentTribbie, ep: newEp };  // Now uses current unit with effects
                        newState = {
                            ...newState,
                            units: newState.units.map(u => u.id === sourceUnitId ? updatedTribbie : u)
                        };
                    }
                }

                console.log('[Tribbie Handler] Returning state, tribbie effects:',
                    newState.units.find(u => u.id === sourceUnitId)?.effects.length,
                    newState.units.find(u => u.id === sourceUnitId)?.effects.map(e => e.name));

                return newState;
            }

            // Skill: Apply Aura
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                const aura = createDivineRevelationAura(sourceUnitId, 3, eidolonLevel);
                newState = addEffect(newState, sourceUnitId, aura);
            }

            // Ultimate Field Logic
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                // Apply Field to Tribbie (Duration 2)
                const fieldEffect: IEffect = {
                    id: `tribbie-field-${Date.now()}`,
                    name: 'Who Lives Here!',
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'TURN_START_BASED',
                    duration: 2,
                    onApply: (t, s) => {
                        // Trace 2: Max HP Boost
                        let totalMaxHp = 0;
                        s.units.forEach(u => {
                            if (!u.isEnemy) totalMaxHp += u.stats.hp;
                        });

                        const trace2 = tribbieUnit.traces?.find(tr => tr.id === 'tribbie-trace-2');
                        let hpBoost = 0;
                        if (trace2) {
                            hpBoost = totalMaxHp * 0.09;
                        }

                        const newModifiers = [...t.modifiers];
                        if (hpBoost > 0) {
                            newModifiers.push({
                                source: 'Who Lives Here! (Trace 2)',
                                target: 'hp' as StatKey,
                                type: 'add' as const,
                                value: hpBoost
                            });
                        }

                        return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                    },
                    onRemove: (t, s) => {
                        const newModifiers = t.modifiers.filter(m => m.source !== 'Who Lives Here! (Trace 2)');
                        return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                    },
                    apply: (t, s) => s,
                    remove: (t, s) => s
                };
                newState = addEffect(newState, sourceUnitId, fieldEffect);

                // E6: Trigger Talent Follow-up
                if (eidolonLevel >= 6) {
                    const followUpAction: any = {
                        type: 'FOLLOW_UP_ATTACK',
                        sourceId: sourceUnitId,
                        targetId: newState.units.find(u => u.isEnemy && u.hp > 0)?.id,
                    };

                    const e6Buff: IEffect = {
                        id: `tribbie-e6-buff-${Date.now()}`,
                        name: 'E6 Damage Boost',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'DURATION_BASED',
                        duration: 1,
                        onApply: (t, s) => {
                            const newModifiers = [...t.modifiers, {
                                source: 'E6 Damage Boost',
                                target: 'all_type_dmg_boost' as StatKey,
                                type: 'add' as const,
                                value: 7.29
                            }];
                            return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                        },
                        onRemove: (t, s) => {
                            const newModifiers = t.modifiers.filter(m => m.source !== 'E6 Damage Boost');
                            return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                        },
                        apply: (t, s) => s,
                        remove: (t, s) => s
                    };
                    newState = addEffect(newState, sourceUnitId, e6Buff);
                    newState = {
                        ...newState,
                        pendingActions: [...newState.pendingActions, followUpAction]
                    };
                }
            }

            // Additional Damage Logic (Field) & Trace 3 Energy Regen
            if ((event.type === 'ON_SKILL_USED' || event.type === 'ON_BASIC_ATTACK' || event.type === 'ON_ULTIMATE_USED') && event.sourceId !== sourceUnitId) {
                const sourceAlly = newState.units.find(u => u.id === event.sourceId);
                if (sourceAlly && !sourceAlly.isEnemy) {
                    // Check if action was an attack
                    let isAttack = false;
                    if (event.type === 'ON_BASIC_ATTACK') isAttack = true;
                    else if (event.type === 'ON_ULTIMATE_USED' && sourceAlly.abilities.ultimate.damage) isAttack = true;
                    else if (event.type === 'ON_SKILL_USED' && sourceAlly.abilities.skill.damage) isAttack = true;

                    if (isAttack) {
                        // Trace 3: Energy Regen on Ally Attack
                        const pebbleTrace = tribbieUnit.traces?.find(t => t.id === 'tribbie-trace-3');
                        if (pebbleTrace) {
                            const targetsHit = 1; // Simplified
                            const energyGain = 1.5 * targetsHit;
                            const currentTribbie = newState.units.find(u => u.id === sourceUnitId)!;
                            const newEp = Math.min(currentTribbie.ep + energyGain, currentTribbie.stats.max_ep);
                            newState = {
                                ...newState,
                                units: newState.units.map(u => u.id === sourceUnitId ? { ...u, ep: newEp } : u)
                            };
                        }

                        // Field Logic
                        const currentTribbie = newState.units.find(u => u.id === sourceUnitId)!;
                        const hasField = currentTribbie.effects.find(e => e.name === 'Who Lives Here!');
                        if (hasField) {
                            const enemies = newState.units.filter(u => u.isEnemy && u.hp > 0);
                            if (enemies.length > 0) {
                                const target = enemies.reduce((prev, current) => (prev.hp > current.hp) ? prev : current);

                                let baseMult = 0.12;
                                if (eidolonLevel >= 3) baseMult = 0.132;

                                let multiplier = 1.0;
                                if (eidolonLevel >= 2) multiplier = 2.2; // 120% UP = 2.2x

                                const baseDamage = currentTribbie.stats.hp * baseMult * multiplier;
                                const damageAmount = calculateNormalAdditionalDamage(currentTribbie, target, baseDamage);

                                // Apply Unified Damage (1st Hit)
                                const result1 = applyUnifiedDamage(
                                    newState,
                                    currentTribbie,
                                    target,
                                    damageAmount,
                                    {
                                        damageType: 'ADDITIONAL_DAMAGE',
                                        details: 'Who Lives Here! Field Damage',
                                        events: [{
                                            type: 'ON_DAMAGE_DEALT',
                                            payload: {
                                                subType: 'ADDITIONAL_DAMAGE',
                                                targetCount: 1
                                            }
                                        }]
                                    }
                                );
                                newState = result1.state;
                                let totalDamageDealt = result1.totalDamage;

                                // E2: Extra Hit
                                if (eidolonLevel >= 2) {
                                    // Re-fetch target as it might have died or changed state (though applyUnifiedDamage handles death)
                                    // But we need the unit object for the next call if we want to be safe, 
                                    // although applyUnifiedDamage takes Unit object, it mostly uses ID.
                                    // Let's use the updated unit from newState.
                                    const updatedTarget = newState.units.find(u => u.id === target.id);
                                    if (updatedTarget && updatedTarget.hp > 0) {
                                        // E2 Extra Hit also needs calculation
                                        // Note: baseDamage is same, but target stats (def/res) might differ if target changed?
                                        // Ideally recalculate, but for now reuse baseDamage.
                                        // Wait, calculateNormalAdditionalDamage uses target stats. So we must call it again.
                                        const damageAmount2 = calculateNormalAdditionalDamage(currentTribbie, updatedTarget, baseDamage);

                                        const result2 = applyUnifiedDamage(
                                            newState,
                                            currentTribbie,
                                            updatedTarget,
                                            damageAmount2,
                                            {
                                                damageType: 'ADDITIONAL_DAMAGE',
                                                details: 'Who Lives Here! Field Damage (E2 Extra)',
                                                events: [{
                                                    type: 'ON_DAMAGE_DEALT',
                                                    payload: {
                                                        subType: 'ADDITIONAL_DAMAGE',
                                                        targetCount: 1
                                                    }
                                                }]
                                            }
                                        );
                                        newState = result2.state;
                                        totalDamageDealt += result2.totalDamage;
                                    }
                                }

                                // E1: True Damage based on total damage
                                if (eidolonLevel >= 1 && totalDamageDealt > 0) {
                                    const trueDamage = totalDamageDealt * 0.24;
                                    const updatedTarget = newState.units.find(u => u.id === target.id);
                                    if (updatedTarget && updatedTarget.hp > 0) {
                                        const resultE1 = applyUnifiedDamage(
                                            newState,
                                            currentTribbie,
                                            updatedTarget,
                                            trueDamage,
                                            {
                                                damageType: 'TRUE_DAMAGE',
                                                details: 'Who Lives Here! E1 True Damage',
                                                events: [{
                                                    type: 'ON_DAMAGE_DEALT',
                                                    payload: {
                                                        subType: 'TRUE_DAMAGE',
                                                        targetCount: 1
                                                    }
                                                }]
                                            }
                                        );
                                        newState = resultE1.state;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Talent: Follow-up on Ally Ultimate
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId !== sourceUnitId) {
                const sourceAlly = newState.units.find(u => u.id === event.sourceId);
                if (sourceAlly && !sourceAlly.isEnemy) {
                    const followUpAction: any = {
                        type: 'FOLLOW_UP_ATTACK',
                        sourceId: sourceUnitId,
                        targetId: newState.units.find(u => u.isEnemy && u.hp > 0)?.id,
                    };

                    newState = {
                        ...newState,
                        pendingActions: [...newState.pendingActions, followUpAction]
                    };
                }
            }

            // Trace 1: DMG Boost after Talent
            if (event.type === 'ON_FOLLOW_UP_ATTACK' && event.sourceId === sourceUnitId) {
                const trace1 = tribbieUnit.traces?.find(t => t.id === 'tribbie-trace-1');
                if (trace1) {
                    const buffId = `tribbie-trace1-${sourceUnitId}`;
                    const existingBuff = tribbieUnit.effects.find(e => e.id === buffId);
                    let stackCount = (existingBuff as any)?.stackCount || 0;
                    if (stackCount < 3) stackCount++;

                    const buff: IEffect = {
                        id: buffId,
                        name: 'Trace 1 DMG Boost',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'DURATION_BASED',
                        duration: 3,
                        onApply: (t, s) => {
                            // Remove old modifier if exists to update value
                            const cleanModifiers = t.modifiers.filter(m => m.source !== 'Trace 1 DMG Boost');
                            const newModifiers = [...cleanModifiers, {
                                source: 'Trace 1 DMG Boost',
                                target: 'all_type_dmg_boost' as StatKey,
                                type: 'add' as const,
                                value: 0.72 * stackCount
                            }];
                            return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                        },
                        onRemove: (t, s) => {
                            const newModifiers = t.modifiers.filter(m => m.source !== 'Trace 1 DMG Boost');
                            return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                        },
                        apply: (t, s) => s,
                        remove: (t, s) => s
                    };
                    (buff as any).stackCount = stackCount; // Hack to store stack count

                    newState = addEffect(newState, sourceUnitId, buff);
                }
            }

            return newState;
        }
    };
};
