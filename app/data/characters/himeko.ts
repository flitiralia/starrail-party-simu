
import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, GameState, IEvent, Unit, ActionEvent, BeforeDamageCalcEvent, DoTDamageEvent, GeneralEvent } from '../../simulator/engine/types';
import { IEffect, DoTEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage, checkDebuffSuccess, publishEvent } from '../../simulator/engine/dispatcher';
import { calculateAbilityLevel, getLeveledValue } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { calculateNormalDoTDamageWithBreakdown } from '../../simulator/damage';
import { TargetSelector } from '../../simulator/engine/selector';

// --- Constants ---
const CHARACTER_ID = 'himeko';

// Ability Levels & Multipliers
const ABILITY_VALUES = {
    basic: {
        6: { mult: 1.0 },
        7: { mult: 1.1 }
    },
    skill: {
        10: { main: 2.0, adj: 0.8 },
        12: { main: 2.2, adj: 0.88 }
    },
    ultimate: {
        10: { mult: 2.3 },
        12: { mult: 2.484 }
    },
    talent: {
        10: { mult: 1.4 },
        12: { mult: 1.54 }
    }
};

// Effect IDs
const EFFECT_IDS = {
    CHARGE: (unitId: string) => `himeko-charge-${unitId}`,
    TECHNIQUE_DEBUFF: (sourceId: string, targetId: string) => `himeko-tech-fire-vuln-${sourceId}-${targetId}`,
    BURN: (sourceId: string, targetId: string) => `himeko-burn-${sourceId}-${targetId}`,
    E1_SPD: (unitId: string) => `himeko-e1-spd-${unitId}`,
    BENCHMARK_BUFF: (unitId: string) => `himeko-benchmark-${unitId}`,
} as const;

// Trace IDs
const TRACE_IDS = {
    STARFIRE: 'himeko-trace-starfire',
    MAGMA: 'himeko-trace-magma',
    BENCHMARK: 'himeko-trace-benchmark',
} as const;

// --- Helper Functions ---

function getChargeStack(state: GameState, unitId: string): number {
    const unit = state.registry.get(createUnitId(unitId));
    const effect = unit?.effects.find(e => e.id === EFFECT_IDS.CHARGE(unitId));
    return effect?.stackCount || 0;
}

function addChargeStack(state: GameState, unitId: string, amount: number): GameState {
    const maxStacks = 3;
    const currentStacks = getChargeStack(state, unitId);
    if (currentStacks >= maxStacks) return state;

    const newStacks = Math.min(currentStacks + amount, maxStacks);

    // Using a permanent buff to track stacks
    return addEffect(state, createUnitId(unitId), {
        id: EFFECT_IDS.CHARGE(unitId),
        name: 'Victory Rush Charge',
        category: 'BUFF',
        sourceUnitId: unitId, // Fixed prop name
        stackCount: newStacks,
        maxStacks: maxStacks, // Fixed prop name
        duration: -1,
        durationType: 'PERMANENT',
        isDispellable: false,
        isCleansable: false,
        modifiers: [],
        apply: (t, s) => s,
        remove: (t, s) => s
    });
}

function consumeAllCharge(state: GameState, unitId: string): GameState {
    return removeEffect(state, createUnitId(unitId), EFFECT_IDS.CHARGE(unitId));
}

// --- Character Definition ---

export const himeko: Character = {
    id: CHARACTER_ID,
    name: '姫子',
    path: 'Erudition',
    element: 'Fire',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1047,
        atk: 756,
        def: 436,
        spd: 96,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75
    },
    abilities: {
        basic: {
            id: 'himeko-basic',
            name: 'Ms. Himeko\'s Adjudication',
            type: 'Basic ATK',
            targetType: 'single_enemy',
            description: 'Deals Fire DMG equal to 100% of Himeko\'s ATK to a single enemy.',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            },
            energyGain: 20
        },
        skill: {
            id: 'himeko-skill',
            name: 'Molten Detonation',
            type: 'Skill',
            targetType: 'blast',
            description: 'Deals Fire DMG equal to 200% of Himeko\'s ATK to a single enemy and Fire DMG equal to 80% of Himeko\'s ATK to enemies adjacent to it.',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 2.0, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: 0.8, toughnessReduction: 10 }]
            },
            energyGain: 30
        },
        ultimate: {
            id: 'himeko-ult',
            name: 'Heavenly Flare',
            type: 'Ultimate',
            targetType: 'all_enemies',
            description: 'Deals Fire DMG equal to 230% of Himeko\'s ATK to all enemies. Himeko regenerates 5 extra Energy for each enemy defeated.',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 2.3, toughnessReduction: 20 }]
            },
            energyGain: 5
        },
        talent: {
            id: 'himeko-talent',
            name: 'Victory Rush',
            type: 'Talent',
            description: 'Charge system description...',
            targetType: 'all_enemies',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.35, toughnessReduction: 2.5 },
                    { multiplier: 0.35, toughnessReduction: 2.5 },
                    { multiplier: 0.35, toughnessReduction: 2.5 },
                    { multiplier: 0.35, toughnessReduction: 2.5 }
                ]
            },
            energyGain: 10
        },
        technique: {
            id: 'himeko-tech',
            name: 'Incomplete Combustion',
            type: 'Technique',
            description: 'Creates a dimension...',
            targetType: 'self'
        }
    },
    traces: [
        {
            id: TRACE_IDS.STARFIRE,
            name: 'Starfire',
            type: 'Bonus Ability',
            description: 'After attacking, 50% chance to inflict Burn...',
        },
        {
            id: TRACE_IDS.MAGMA,
            name: 'Magma',
            type: 'Bonus Ability',
            description: 'Skill deals 20% more DMG to burning enemies.',
        },
        {
            id: TRACE_IDS.BENCHMARK,
            name: 'Benchmark',
            type: 'Bonus Ability',
            description: 'HP >= 80% -> Crit Rate +15%.',
        },
        {
            id: 'himeko-stat-fire',
            name: 'Fire DMG Boost',
            type: 'Stat Bonus',
            description: 'Fire DMG +22.4%',
            stat: 'fire_dmg_boost',
            value: 0.224
        },
        {
            id: 'himeko-stat-atk',
            name: 'ATK Boost',
            type: 'Stat Bonus',
            description: 'ATK +18%',
            stat: 'atk_pct',
            value: 0.18
        },
        {
            id: 'himeko-stat-res',
            name: 'Effect Res Boost',
            type: 'Stat Bonus',
            description: 'Effect Res +10%',
            stat: 'effect_res',
            value: 0.10
        }
    ],
    eidolons: {
        e1: { level: 1, name: 'Childhood', description: 'SPD +20% for 2 turns after Talent.' },
        e2: { level: 2, name: 'Convergence', description: 'DMG +15% vs HP <= 50% enemies.' },
        e3: {
            level: 3, name: 'Poised', description: 'Skill +2, Basic +1',
            abilityModifiers: [
                { abilityName: 'skill', param: 'damage.mainHits.0.multiplier', value: 2.2 },
                { abilityName: 'skill', param: 'damage.adjacentHits.0.multiplier', value: 0.88 },
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.1 }
            ]
        },
        e4: { level: 4, name: 'Dedication', description: 'Skill Break gives +1 extra Charge.' },
        e5: {
            level: 5, name: 'Aspiration', description: 'Ult +2, Talent +2',
            abilityModifiers: [
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 2.484 },
                { abilityName: 'talent', param: 'damage.hits.0.multiplier', value: 0.385 }, // 1.54 / 4
                { abilityName: 'talent', param: 'damage.hits.1.multiplier', value: 0.385 },
                { abilityName: 'talent', param: 'damage.hits.2.multiplier', value: 0.385 },
                { abilityName: 'talent', param: 'damage.hits.3.multiplier', value: 0.385 }
            ]
        },
        e6: { level: 6, name: 'Trailblaze!', description: 'Ult deals 2 extra hits.' }
    },
    defaultConfig: {
        lightConeId: 'night-on-the-milky-way',
        superimposition: 1,
        relicSetId: 'the_ashblazing_grand_duke',
        ornamentSetId: 'firmament_frontline_glamoth',
        mainStats: {
            body: 'crit_rate',
            feet: 'atk_pct', // Himeko is slow, maybe ATK or SPD
            sphere: 'fire_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.15 },
            { stat: 'crit_dmg', value: 0.30 },
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'spd', value: 6 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// --- Handler Logic ---

export const himekoHandlerFactory: IEventHandlerFactory = (sourceId, level, eidolonLevel = 0) => {
    return {
        handlerMetadata: {
            id: `himeko-handler-${sourceId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_ACTION_COMPLETE', // Replaces ON_ACTION_END
                'ON_WEAKNESS_BREAK',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_ENEMY_DEFEATED', // For Ult kill energy? And E4?
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceId));
            if (!unit) return state;

            // ON_BATTLE_START
            if (event.type === 'ON_BATTLE_START') {
                let newState = state;
                // Talent: Start with 1 charge
                newState = addChargeStack(newState, sourceId, 1);

                // Technique: Apply Zone
                const useTechnique = unit.config?.useTechnique !== false;
                if (useTechnique) {
                    const enemies = newState.registry.getAliveEnemies();
                    for (const enemy of enemies) {
                        newState = addEffect(newState, enemy.id, {
                            id: EFFECT_IDS.TECHNIQUE_DEBUFF(sourceId, enemy.id),
                            name: 'Incomplete Combustion (Technique)',
                            category: 'DEBUFF',
                            sourceUnitId: sourceId,
                            durationType: 'TURN_START_BASED',
                            duration: 2,
                            modifiers: [{
                                target: 'dmg_taken' as StatKey, // Assuming generic dmg taken mod or elemental
                                // Element specific dmg taken usually needs checks.
                                // Framework might support subType?
                                // For now using dmg_taken, simulating +10% Fire DMG taken by roughly DmgTaken +10%
                                value: 0.10,
                                type: 'add',
                                source: 'Technique'
                            }],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        });
                    }
                }

                // Benchmark Buff (Initial check)
                if (unit.traces?.some(t => t.id === TRACE_IDS.BENCHMARK)) {
                    const hpRatio = unit.hp / unit.stats.hp;
                    if (hpRatio >= 0.8) {
                        const buff: IEffect = {
                            id: EFFECT_IDS.BENCHMARK_BUFF(sourceId),
                            name: 'Benchmark (Crit Rate +15%)',
                            category: 'BUFF',
                            sourceUnitId: sourceId,
                            durationType: 'PERMANENT',
                            duration: -1,
                            modifiers: [{
                                target: 'crit_rate' as StatKey,
                                value: 0.15,
                                type: 'add',
                                source: 'Benchmark'
                            }],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };
                        newState = addEffect(newState, sourceId, buff);
                    }
                }
                return newState;
            }

            // ON_TURN_START: Benchmark Check
            if (event.type === 'ON_TURN_START' && event.sourceId === sourceId) {
                if (unit.traces?.some(t => t.id === TRACE_IDS.BENCHMARK)) {
                    const hpRatio = unit.hp / unit.stats.hp; // unit.stats.hp is Max HP
                    const buffId = EFFECT_IDS.BENCHMARK_BUFF(sourceId);
                    const hasBuff = unit.effects.some(e => e.id === buffId);

                    if (hpRatio >= 0.8 && !hasBuff) {
                        const buff: IEffect = {
                            id: buffId,
                            name: 'Benchmark (Crit Rate +15%)',
                            category: 'BUFF',
                            sourceUnitId: sourceId,
                            durationType: 'PERMANENT',
                            duration: -1,
                            modifiers: [{
                                target: 'crit_rate' as StatKey,
                                value: 0.15,
                                type: 'add',
                                source: 'Benchmark'
                            }],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };
                        return addEffect(state, sourceId, buff);
                    } else if (hpRatio < 0.8 && hasBuff) {
                        return removeEffect(state, createUnitId(sourceId), buffId);
                    }
                }
            }

            // ON_WEAKNESS_BREAK: Gain Charge
            if (event.type === 'ON_WEAKNESS_BREAK') {
                // Event should be ActionEvent or similar?
                // engine/types defines ON_WEAKNESS_BREAK in ActionEvent
                const breakEvent = event as ActionEvent;
                // Any enemy break? Himeko gains charge when *an enemy* is broken.
                // Target must be enemy.
                const targetId = breakEvent.targetId;
                if (!targetId) return state;
                const target = state.registry.get(createUnitId(targetId));
                if (!target || !target.isEnemy) return state;

                let newState = state;
                let chargeGain = 1;

                // E4: If Himeko broke it with Skill
                if (eidolonLevel >= 4 && breakEvent.sourceId === sourceId && breakEvent.subType === 'Skill') {
                    chargeGain += 1;
                }
                // NOTE: 'subType' in ActionEvent for ON_WEAKNESS_BREAK?
                // The dispatcher usually keeps original action scope.
                // Or we check active action? 
                // For now assuming existing E4 implementation pattern.
                // If subType is unreliable, we might check last action.

                newState = addChargeStack(newState, sourceId, chargeGain);
                return newState;
            }

            // ON_ACTION_COMPLETE: Check Talent Trigger & Apply Starfire Burn
            if (event.type === 'ON_ACTION_COMPLETE') {
                const actionEvent = event as ActionEvent;
                const actorId = actionEvent.sourceId;
                const actor = state.registry.get(createUnitId(actorId));

                // 1. Starfire Trace: Apply Burn after Himeko attacks
                if (actorId === sourceId && unit.traces?.some(t => t.id === TRACE_IDS.STARFIRE)) {
                    // Check if attack
                    if (['ON_BASIC_ATTACK', 'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_FOLLOW_UP_ATTACK'].includes(actionEvent.subType || '')) {
                        // We need targets. 'targetId' for single, 'targets' if multiple?
                        // ActionEvent has `targetId` and `adjacentIds`.
                        // For AoE/Blast, we iterate.
                        // However, ON_ACTION_COMPLETE might not carry ALL targets easily.
                        // But we can rely on `targetId` + `adjacentIds` for Blast.
                        // For AoE (Ult/Talent), targetId is usually undefined or one of them?
                        // Himeko Ult targetType is 'all_enemies'.

                        let targetsToProcc: Unit[] = [];
                        if (actionEvent.targetType === 'all_enemies') {
                            targetsToProcc = state.registry.getAliveEnemies();
                        } else if (actionEvent.targetId) {
                            const main = state.registry.get(createUnitId(actionEvent.targetId));
                            if (main) targetsToProcc.push(main);
                            if (actionEvent.adjacentIds) {
                                actionEvent.adjacentIds.forEach(aid => {
                                    const adj = state.registry.get(createUnitId(aid));
                                    if (adj) targetsToProcc.push(adj);
                                });
                            }
                        }

                        let newState = state;
                        targetsToProcc.forEach(t => {
                            if (checkDebuffSuccess(unit, t, 0.5, 'Burn')) {
                                newState = addEffect(newState, t.id, {
                                    id: EFFECT_IDS.BURN(sourceId, t.id),
                                    name: 'Burn (Starfire)',
                                    category: 'DEBUFF',
                                    type: 'DoT',
                                    sourceUnitId: sourceId,
                                    durationType: 'TURN_START_BASED',
                                    duration: 2,
                                    modifiers: [],
                                    apply: (t, s) => s,
                                    remove: (t, s) => s,
                                    dotType: 'Burn',
                                    damageCalculation: 'multiplier',
                                    multiplier: 0.30
                                } as DoTEffect);
                            }
                        });
                        state = newState; // Update local state for next block
                    }
                }

                // 2. Talent Trigger: After ALLY attacks
                // "Ally" includes Himeko? Yes.
                if (actor && actor.isEnemy === unit.isEnemy) { // Same faction
                    // Must be an attack
                    const attackTypes = ['ON_BASIC_ATTACK', 'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_FOLLOW_UP_ATTACK'];
                    // The event type itself is ON_ACTION_COMPLETE, we check strict action types?
                    // Wait, ON_ACTION_COMPLETE logic: `actionEvent.subType` might be the original event type? 
                    // Or check ifdamage dealt?
                    // Simplest: Check if `subType` (original action type) is an attack.
                    // The simulator dispatches `ON_ACTION_COMPLETE` with `subType` set to `action.type` (e.g., 'SKILL').
                    // `SkillAction` type is 'SKILL'.
                    // Let's assume subType maps to ActionType.
                    const isAttack = ['BASIC_ATTACK', 'SKILL', 'ULTIMATE', 'FOLLOW_UP_ATTACK', 'ENHANCED_BASIC_ATTACK'].includes(actionEvent.subType || '');

                    if (isAttack) {
                        const charges = getChargeStack(state, sourceId);
                        if (charges >= 3) {
                            // Trigger Talent
                            let newState = consumeAllCharge(state, sourceId);

                            const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
                            const talentMults = getLeveledValue(ABILITY_VALUES.talent, talentLevel);
                            const targets = newState.registry.getAliveEnemies();

                            // 4 Hits logic
                            // Total Mult = talentMults.mult
                            // Each hit = 25% of Total
                            const hitCount = 4;
                            const dmgPerHitMultiplier = talentMults.mult / 4;

                            for (let i = 0; i < hitCount; i++) {
                                for (const target of targets) {
                                    const result = applyUnifiedDamage(newState, unit, target, unit.stats.atk * dmgPerHitMultiplier, {
                                        damageType: 'FOLLOW_UP_ATTACK', // Use correct string
                                        details: `Victory Rush (Hit ${i + 1})`,
                                        isKillRecoverEp: false
                                    });
                                    newState = result.state;
                                    // Check Starfire per hit? Usually once per action.
                                    // We did Starfire block above for Himeko's actions.
                                    // If this Talent is Himeko's action, it will trigger Starfire in NEXT event loop?
                                    // No, `applyUnifiedDamage` is synchronous. 
                                    // We manually dispatch events?
                                    // Better to treat Starfire as "Once per Ability Use".
                                }
                                // Add Energy (Talent gives 10 total).
                                // Let's add 2.5 per hit or 10 at end? 
                                // Usually 10 per Use.
                            }
                            // Add EP (10)
                            newState = addEnergyToUnit(newState, sourceId, 10, 0, false, { sourceId, publishEventFn: publishEvent });

                            // E1: SPD Boost
                            if (eidolonLevel >= 1) {
                                newState = addEffect(newState, sourceId, {
                                    id: EFFECT_IDS.E1_SPD(sourceId),
                                    name: 'Childhood (SPD +20%)',
                                    category: 'BUFF',
                                    sourceUnitId: sourceId,
                                    durationType: 'TURN_START_BASED',
                                    duration: 2,
                                    modifiers: [{ target: 'spd_pct' as StatKey, value: 0.20, type: 'add', source: 'E1' }],
                                    apply: (t, s) => s,
                                    remove: (t, s) => s
                                });
                            }

                            return newState;
                        }
                    }
                }
            }

            // ON_BEFORE_DAMAGE_CALCULATION: Magma & E2
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                const evt = event as BeforeDamageCalcEvent;
                if (evt.sourceId !== sourceId) return state;
                if (!evt.targetId) return state;
                const target = state.registry.get(createUnitId(evt.targetId));
                if (!target) return state;

                let dmgBoost = 0;

                // Magma: Skill vs Burning
                if (evt.abilityId === 'himeko-skill' && unit.traces?.some(t => t.id === TRACE_IDS.MAGMA)) {
                    if (target.effects.some(e => (e as any).dotType === 'Burn')) {
                        dmgBoost += 0.20;
                    }
                }

                // E2: HP <= 50%
                if (eidolonLevel >= 2) {
                    const hpRatio = target.hp / target.stats.hp;
                    if (hpRatio <= 0.5) {
                        dmgBoost += 0.15;
                    }
                }

                if (dmgBoost > 0) {
                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + dmgBoost
                        }
                    };
                }
            }

            // ON_ENEMY_DEFEATED: Ult Energy
            if (event.type === 'ON_ENEMY_DEFEATED') {
                // Should check if killed by Himeko's Ult?
                // Event usually has killerId?
                // engine/types `EnemyDefeatedEvent`: contains `defeatedEnemy`. SourceId of event is usually killer?
                // Let's check `dispatcher`.
                // If I am the source, I killed it.
                if (event.sourceId === sourceId) {
                    // Check if Ult was used?
                    // We need context. State doesn't easily store "Current Action Type" for this event.
                    // But we can check `state.currentActionLog?.primaryActionType`.
                    if (state.currentActionLog?.primaryActionType === 'ULTIMATE') {
                        // Gain 5 Energy per kill
                        return addEnergyToUnit(state, sourceId, 5, 0, false, { sourceId, publishEventFn: publishEvent });
                    }
                }
            }

            return state;
        }
    };
};
