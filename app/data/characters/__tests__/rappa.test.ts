import { describe, it, expect, beforeEach, test } from 'vitest';
import { rappa, rappaHandlerFactory } from '../rappa';
import { UnitRegistry } from '../../../simulator/engine/unitRegistry';
import { GameState, Unit, ActionEvent, DamageDealtEvent } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { addEffect } from '../../../simulator/engine/effectManager';
import { addEnergyToUnit } from '../../../simulator/engine/energy';
import { calculateBreakDamage } from '../../../simulator/damage';
import { Character, Enemy, SimulationConfig } from '../../../types/index';

describe('Rappa Character Implementation', () => {
    let state: GameState;
    const sourceId = 'rappa-test-id';
    const enemyId = 'enemy-test-id';

    beforeEach(() => {
        const rappaUnit: Character = { ...rappa, id: sourceId, name: 'Rappa' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy',
            baseStats: { hp: 10000, atk: 500, def: 200, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Physical',
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
            characters: [rappaUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Imaginary']),
            partyConfig: {
                members: [{
                    character: rappaUnit,
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
        const factory = rappaHandlerFactory(sourceId, 80, 0);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;

        // Trigger Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, factory.handlerMetadata.id);
    });

    test('Initial State (E0)', () => {
        const unit = state.registry.get(createUnitId(sourceId));
        const charge = unit?.effects.find(e => e.id.includes('charge'));
        expect(charge).toBeDefined();
        expect(charge?.miscData?.stack).toBe(0);
    });

    test('Ultimate Activates Seal and Chroma', () => {
        const factory = rappaHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;
        // Simulate Ultimate Usage
        const actionEvent: ActionEvent = { type: 'ON_ULTIMATE_USED', sourceId, targetId: sourceId };
        state = factory.handlerLogic(actionEvent, state, handlerId);

        const unit = state.registry.get(createUnitId(sourceId));
        const seal = unit?.effects.find(e => e.id.includes('seal'));
        const chroma = unit?.effects.find(e => e.id.includes('chroma'));

        expect(seal).toBeDefined();
        expect(chroma).toBeDefined();
        expect(chroma?.miscData?.stack).toBe(3);

        expect(seal?.modifiers?.some(m => m.target === 'break_efficiency_boost')).toBe(true);
    });

    test('Weakness Break adds Charge', () => {
        const factory = rappaHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;
        // Simulate Break
        const breakEvent: ActionEvent = { type: 'ON_WEAKNESS_BREAK', sourceId, targetId: enemyId };
        state = factory.handlerLogic(breakEvent, state, handlerId);

        const unit = state.registry.get(createUnitId(sourceId));
        const charge = unit?.effects.find(e => e.id.includes('charge'));
        expect(charge?.miscData?.stack).toBe(1);
    });

    test('Enhanced Basic Attack Consumes Chroma on Turn End', () => {
        const factory = rappaHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;
        // 1. Enter Seal
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId } as ActionEvent, state, handlerId);

        // 2. Perform Enhanced Basic (Simulation: ON_BEFORE_ACTION -> ON_TURN_END)
        const beforeActionEvent = {
            type: 'ON_BEFORE_ACTION',
            sourceId,
            actionType: 'ENHANCED_BASIC_ATTACK'
        } as any;
        state = factory.handlerLogic(beforeActionEvent, state, handlerId);

        // 3. Turn End
        state = factory.handlerLogic({ type: 'ON_TURN_END', sourceId } as any, state, handlerId);

        const unit = state.registry.get(createUnitId(sourceId));
        const chroma = unit?.effects.find(e => e.id.includes('chroma'));
        expect(chroma?.miscData?.stack).toBe(2);
    });

    test('3rd Hit uses Charge', () => {
        const factory = rappaHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Setup Charge via break
        // We will just mutate state for valid Charge setup
        state = {
            ...state,
            registry: state.registry.update(createUnitId(sourceId), u => {
                // Create or update charge effect
                const newEffects = [...u.effects.filter(e => !e.id.includes('charge'))];
                newEffects.push({
                    id: `rappa-charge-${sourceId}`,
                    name: 'Charge',
                    category: 'BUFF',
                    sourceUnitId: sourceId,
                    durationType: 'PERMANENT',
                    duration: -1,
                    miscData: { stack: 10 },
                    apply: (t, s) => s, remove: (t, s) => s,
                    modifiers: []
                });
                return { ...u, effects: newEffects };
            })
        };

        // Enter Seal and set Chroma to 1
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId } as ActionEvent, state, handlerId);
        state = {
            ...state,
            registry: state.registry.update(createUnitId(sourceId), u => {
                const newEffects = u.effects.map(e => e.id.includes('chroma') ? { ...e, miscData: { stack: 1 } } : e);
                return { ...u, effects: newEffects };
            })
        };

        // Before Action (Sets flags and consumes charge)
        const beforeActionEvent = {
            type: 'ON_BEFORE_ACTION',
            sourceId,
            actionType: 'ENHANCED_BASIC_ATTACK'
        } as any;
        state = factory.handlerLogic(beforeActionEvent, state, handlerId);

        // Check Charge consumed
        const unitAfterAction = state.registry.get(createUnitId(sourceId));
        const charge = unitAfterAction?.effects.find(e => e.id.includes('charge'));
        // Should be 0 after consumption
        expect(charge?.miscData?.stack).toBe(0);
    });

    test('E6 Mechanics', () => {
        const factoryE6 = rappaHandlerFactory(sourceId, 80, 6);

        const rappaUnit: Character = { ...rappa, id: sourceId, name: 'Rappa' };
        const config: SimulationConfig = {
            characters: [rappaUnit],
            enemies: [], // No enemies needed for simple start check? Or minimally one.
            weaknesses: new Set(),
            partyConfig: {
                members: [{
                    character: rappaUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 6 // E6
                }]
            },
            enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register handlers manually (using factoryE6)
        state.eventHandlers.push(factoryE6.handlerMetadata);
        state.eventHandlerLogics[factoryE6.handlerMetadata.id] = factoryE6.handlerLogic;

        // Battle Start E6
        state = factoryE6.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, factoryE6.handlerMetadata.id);

        const unit = state.registry.get(createUnitId(sourceId));
        const charge = unit?.effects.find(e => e.id.includes('charge'));
        expect(charge?.miscData?.stack).toBe(5); // E6 Start Charge
    });
});
