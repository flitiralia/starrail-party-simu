
import { describe, it, expect, beforeEach, test } from 'vitest';
import { seele, seeleHandlerFactory } from '../seele';
import { UnitRegistry } from '../../../simulator/engine/unitRegistry';
import { GameState, Unit, ActionEvent, DamageDealtEvent, CurrentActionLog } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { addEffect } from '../../../simulator/engine/effectManager';
import { addEnergyToUnit } from '../../../simulator/engine/energy';
import { Character, Enemy, SimulationConfig } from '../../../types/index';

describe('Seele Character Implementation', () => {
    let state: GameState;
    const sourceId = 'seele-test-id';
    const enemyId = 'enemy-test-id';

    beforeEach(() => {
        const seeleUnit: Character = { ...seele, id: sourceId, name: 'Seele' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy',
            baseStats: { hp: 10000, atk: 500, def: 200, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Quantum',
            toughness: 100,
            baseRes: {},
            abilities: {
                basic: { id: 'e-basic', name: 'Enemy Basic', type: 'Basic ATK', description: '' },
                skill: { id: 'e-skill', name: 'Enemy Skill', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: 'Enemy Ult', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: 'Enemy Talent', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Enemy Tech', type: 'Technique', description: '' }
            }
        };

        const config: SimulationConfig = {
            characters: [seeleUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Quantum']),
            partyConfig: {
                members: [{
                    character: seeleUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register handlers manually
        const factory = seeleHandlerFactory(sourceId, 80, 0);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;

        // Trigger Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, factory.handlerMetadata.id);
    });

    test('Skill Applies Speed Boost (E0)', () => {
        const factory = seeleHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Skill Used
        state = factory.handlerLogic({ type: 'ON_SKILL_USED', sourceId } as ActionEvent, state, handlerId);

        const unit = state.registry.get(createUnitId(sourceId));
        const speedBuff = unit?.effects.find(e => e.id.includes('seele-skill-spd-boost'));

        expect(speedBuff).toBeDefined();
        // Base Speed 115 * 25% = 28.75.
        // Effect modifiers check
        expect(speedBuff!.modifiers![0].value).toBeCloseTo(0.25);
    });

    test('Skill Speed Boost Stacking (E2)', () => {
        const factoryE2 = seeleHandlerFactory(sourceId, 80, 2);
        const handlerId = factoryE2.handlerMetadata.id;

        // 1. Skill Used
        state = factoryE2.handlerLogic({ type: 'ON_SKILL_USED', sourceId } as ActionEvent, state, handlerId);
        let unit = state.registry.get(createUnitId(sourceId));
        let speedBuff = unit?.effects.find(e => e.id.includes('seele-skill-spd-boost'));
        expect(speedBuff?.stackCount).toBe(1);
        expect(speedBuff!.modifiers![0].value).toBeCloseTo(0.25);

        // 2. Skill Used Again
        state = factoryE2.handlerLogic({ type: 'ON_SKILL_USED', sourceId } as ActionEvent, state, handlerId);
        unit = state.registry.get(createUnitId(sourceId));
        speedBuff = unit?.effects.find(e => e.id.includes('seele-skill-spd-boost'));
        expect(speedBuff?.stackCount).toBe(2);
        expect(speedBuff!.modifiers![0].value).toBeCloseTo(0.25);

        // 3. Skill Used Again (Cap at 2)
        state = factoryE2.handlerLogic({ type: 'ON_SKILL_USED', sourceId } as ActionEvent, state, handlerId);
        unit = state.registry.get(createUnitId(sourceId));
        speedBuff = unit?.effects.find(e => e.id.includes('seele-skill-spd-boost'));
        expect(speedBuff?.stackCount).toBe(2);
    });

    test('Enter Buffed State on Ultimate', () => {
        const factory = seeleHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Ult Used
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId } as ActionEvent, state, handlerId);

        const unit = state.registry.get(createUnitId(sourceId));
        const buffedState = unit?.effects.find(e => e.id.includes('seele-buffed-state'));

        expect(buffedState).toBeDefined();
        // Check Dmg Boost (Talent Lv 10 E0 -> 80%)
        expect(buffedState!.modifiers![0].value).toBeCloseTo(0.80);
    });

    test('Resurgence Triggers Extra Turn and Buffed State', () => {
        const factory = seeleHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Setup Mock Action Log (Requirement for Resurgence)
        state.currentActionLog = {
            actionId: 'test-action',
            primarySourceId: sourceId,
            primarySourceName: 'Seele',
            primaryActionType: 'BASIC_ATTACK',
            startTime: 0,
            primaryDamage: { hitDetails: [], totalDamage: 0 },
            additionalDamage: [],
            damageTaken: [],
            healing: [],
            shields: [],
            dotDetonations: [],
            equipmentEffects: [],
            resourceChanges: []
        } as CurrentActionLog;

        // Simulate Enemy Defeated by Seele
        state = factory.handlerLogic({ type: 'ON_ENEMY_DEFEATED', sourceId, targetId: enemyId } as any, state, handlerId);

        const unit = state.registry.get(createUnitId(sourceId));

        // Check Buffed State
        const buffedState = unit?.effects.find(e => e.id.includes('seele-buffed-state'));
        expect(buffedState).toBeDefined();

        // Check Resurgence Marker
        const resurgence = unit?.effects.find(e => e.id.includes('seele-resurgence-indicator'));
        expect(resurgence).toBeDefined();

        // Clean up should remove marker
        state = factory.handlerLogic({ type: 'ON_ACTION_COMPLETE', sourceId } as any, state, handlerId);
        const unitAfter = state.registry.get(createUnitId(sourceId));
        const resurgenceAfter = unitAfter?.effects.find(e => e.id.includes('seele-resurgence-indicator'));
        expect(resurgenceAfter).toBeUndefined();
    });

    test('E6 Applies Butterfly', () => {
        const factoryE6 = seeleHandlerFactory(sourceId, 80, 6);
        const handlerId = factoryE6.handlerMetadata.id;

        // Use Ult
        state = factoryE6.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        const enemy = state.registry.get(createUnitId(enemyId));
        const butterfly = enemy?.effects.find(e => e.id.includes('seele-ult-butterfly'));

        expect(butterfly).toBeDefined();
    });

    test('A2 Aggro Down when HP <= 50%', () => {
        const factory = seeleHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;
        let unit = state.registry.get(createUnitId(sourceId));

        // Ensure Trace available
        if (unit && unit.traces && unit.traces.length > 0) {
            // Force HP update
            const newUnit = { ...unit, hp: unit.stats.hp * 0.4 }; // 40% HP
            state = {
                ...state,
                registry: state.registry.update(createUnitId(sourceId), u => ({ ...u, ...newUnit }))
            };

            // Trigger HP Consumption Event
            state = factory.handlerLogic({ type: 'ON_HP_CONSUMED', targetId: sourceId } as any, state, handlerId);

            unit = state.registry.get(createUnitId(sourceId));
            const aggroBuff = unit?.effects.find(e => e.id.includes('seele-a2-aggro-down'));
            expect(aggroBuff).toBeDefined();
            expect(aggroBuff!.modifiers![0].value).toBe(-0.5);

            // Heal back
            const healedUnit = { ...unit!, hp: unit!.stats.hp * 0.9 }; // 90%
            state = {
                ...state,
                registry: state.registry.update(createUnitId(sourceId), u => ({ ...u, ...healedUnit }))
            };

            state = factory.handlerLogic({ type: 'ON_UNIT_HEALED', targetId: sourceId } as any, state, handlerId);

            unit = state.registry.get(createUnitId(sourceId));
            const aggroBuffAfter = unit?.effects.find(e => e.id.includes('seele-a2-aggro-down'));
            expect(aggroBuffAfter).toBeUndefined();
        }
    });
});
