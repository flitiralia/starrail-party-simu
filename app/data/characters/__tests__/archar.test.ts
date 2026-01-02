import { describe, it, expect, beforeEach, test } from 'vitest';
import { archar, archarHandlerFactory } from '../archar';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { GameState, ActionEvent, Unit } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { Character, Enemy, SimulationConfig } from '../../../types/index';
import { removeEffect } from '../../../simulator/engine/effectManager';

describe('Archar Character Implementation', () => {
    let state: GameState;
    const sourceId = 'archar-test';
    const enemyId = 'enemy-test';

    beforeEach(() => {
        const archarUnit: Character = { ...archar, id: sourceId, name: 'Archar' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy 1',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Fire', // NOT Quantum
            toughness: 100,
            baseRes: {},
            abilities: {
                basic: { id: 'e-b', name: 'EB', type: 'Basic ATK', description: '' },
                skill: { id: 'e-s', name: 'ES', type: 'Skill', description: '' },
                ultimate: { id: 'e-u', name: 'EU', type: 'Ultimate', description: '' },
                talent: { id: 'e-t', name: 'ET', type: 'Talent', description: '' },
                technique: { id: 'e-tec', name: 'ETec', type: 'Technique', description: '' }
            }
        };

        const config: SimulationConfig = {
            characters: [archarUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Fire']), // Enemy is weak to Fire, NOT Quantum
            partyConfig: {
                members: [{
                    character: archarUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 2 // E2 required for weakness implant
                }]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register handler with E2
        const factory = archarHandlerFactory(sourceId, 80, 2);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;

        // Trigger Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, factory.handlerMetadata.id);
    });

    test('E2 Ultimate should apply Quantum Weakness to enemy without it', () => {
        const factory = archarHandlerFactory(sourceId, 80, 2);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Ultimate
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        const enemy = state.registry.get(createUnitId(enemyId));

        // Enemy should now have Quantum weakness
        expect(enemy?.weaknesses.has('Quantum')).toBe(true);

        // Check E2 Debuff Effect exists
        const e2Debuff = enemy?.effects.find(e => e.id.includes('archar-e2-debuff'));
        expect(e2Debuff).toBeDefined();
    });

    test('E2 Quantum Weakness should be removed when effect expires', () => {
        const factory = archarHandlerFactory(sourceId, 80, 2);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Ultimate
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        // Verify weakness was added
        let enemy = state.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Quantum')).toBe(true);

        // Find and remove the E2 debuff (simulating expiration)
        const e2Debuff = enemy?.effects.find(e => e.id.includes('archar-e2-debuff'));
        expect(e2Debuff).toBeDefined();
        if (e2Debuff) {
            state = removeEffect(state, enemyId, e2Debuff.id);
        }

        // Check that Quantum weakness was removed
        enemy = state.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Quantum')).toBe(false);
    });

    test('E2 Quantum Weakness should NOT be removed if enemy originally had it', () => {
        // Create state where enemy already has Quantum weakness
        const archarUnit: Character = { ...archar, id: sourceId, name: 'Archar' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy 1',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Quantum', // Enemy is Quantum type
            toughness: 100,
            baseRes: {},
            abilities: {
                basic: { id: 'e-b', name: 'EB', type: 'Basic ATK', description: '' },
                skill: { id: 'e-s', name: 'ES', type: 'Skill', description: '' },
                ultimate: { id: 'e-u', name: 'EU', type: 'Ultimate', description: '' },
                talent: { id: 'e-t', name: 'ET', type: 'Talent', description: '' },
                technique: { id: 'e-tec', name: 'ETec', type: 'Technique', description: '' }
            }
        };

        const config: SimulationConfig = {
            characters: [archarUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Quantum']), // Enemy already has Quantum weakness
            partyConfig: {
                members: [{
                    character: archarUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 2
                }]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        let localState = createInitialGameState(config);

        const factory = archarHandlerFactory(sourceId, 80, 2);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start
        localState = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, localState, handlerId);

        // Trigger Ultimate
        localState = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId, targetId: enemyId } as ActionEvent, localState, handlerId);

        // Find and remove the E2 debuff (simulating expiration)
        let enemy = localState.registry.get(createUnitId(enemyId));
        const e2Debuff = enemy?.effects.find(e => e.id.includes('archar-e2-debuff'));
        if (e2Debuff) {
            localState = removeEffect(localState, enemyId, e2Debuff.id);
        }

        // Check that Quantum weakness is STILL present (because enemy originally had it)
        enemy = localState.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Quantum')).toBe(true);
    });

    test('Without E2, Ultimate should NOT apply Quantum Weakness', () => {
        // Create state without E2
        const archarUnit: Character = { ...archar, id: sourceId, name: 'Archar' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy 1',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Fire',
            toughness: 100,
            baseRes: {},
            abilities: {
                basic: { id: 'e-b', name: 'EB', type: 'Basic ATK', description: '' },
                skill: { id: 'e-s', name: 'ES', type: 'Skill', description: '' },
                ultimate: { id: 'e-u', name: 'EU', type: 'Ultimate', description: '' },
                talent: { id: 'e-t', name: 'ET', type: 'Talent', description: '' },
                technique: { id: 'e-tec', name: 'ETec', type: 'Technique', description: '' }
            }
        };

        const config: SimulationConfig = {
            characters: [archarUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Fire']),
            partyConfig: {
                members: [{
                    character: archarUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0 // No E2
                }]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        let localState = createInitialGameState(config);

        const factory = archarHandlerFactory(sourceId, 80, 0); // E0
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start
        localState = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, localState, handlerId);

        // Trigger Ultimate
        localState = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId, targetId: enemyId } as ActionEvent, localState, handlerId);

        const enemy = localState.registry.get(createUnitId(enemyId));

        // Enemy should NOT have Quantum weakness (no E2)
        expect(enemy?.weaknesses.has('Quantum')).toBe(false);

        // Check no E2 Debuff Effect
        const e2Debuff = enemy?.effects.find(e => e.id.includes('archar-e2-debuff'));
        expect(e2Debuff).toBeUndefined();
    });
});
