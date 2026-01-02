import { describe, it, expect, beforeEach, test } from 'vitest';
import { boothill, boothillHandlerFactory } from '../boothill';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { GameState, ActionEvent, Unit } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { Character, Enemy, SimulationConfig } from '../../../types/index';
import { removeEffect } from '../../../simulator/engine/effectManager';

describe('Boothill Character Implementation', () => {
    let state: GameState;
    const sourceId = 'boothill-test';
    const enemyId = 'enemy-test';

    beforeEach(() => {
        const boothillUnit: Character = { ...boothill, id: sourceId, name: 'Boothill' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy 1',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Ice',
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
            characters: [boothillUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Ice']), // Enemy is weak to Ice, NOT Physical
            partyConfig: {
                members: [{
                    character: boothillUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register handler
        const factory = boothillHandlerFactory(sourceId, 80, 0);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;
    });

    test('Standoff should apply Physical Weakness to enemy without it', () => {
        const factory = boothillHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, handlerId);

        // Trigger Skill (starts Standoff)
        state = factory.handlerLogic({ type: 'ON_SKILL_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        const enemy = state.registry.get(createUnitId(enemyId));

        // Enemy should now have Physical weakness
        expect(enemy?.weaknesses.has('Physical')).toBe(true);

        // Check Physical Weakness Effect exists
        const weaknessEffect = enemy?.effects.find(e => e.id.includes('physical-weakness'));
        expect(weaknessEffect).toBeDefined();
    });

    test('Physical Weakness should be removed when effect expires', () => {
        const factory = boothillHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, handlerId);

        // Trigger Skill (starts Standoff)
        state = factory.handlerLogic({ type: 'ON_SKILL_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        // Verify weakness was added
        let enemy = state.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Physical')).toBe(true);

        // Find and remove the physical weakness effect (simulating expiration)
        const weaknessEffect = enemy?.effects.find(e => e.id.includes('physical-weakness'));
        if (weaknessEffect) {
            state = removeEffect(state, enemyId, weaknessEffect.id);
        }

        // Check that Physical weakness was removed
        enemy = state.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Physical')).toBe(false);
    });

    test('Physical Weakness should NOT be removed if enemy originally had it', () => {
        // Create state where enemy already has Physical weakness
        const boothillUnit: Character = { ...boothill, id: sourceId, name: 'Boothill' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy 1',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Physical', // Enemy is Physical type
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
            characters: [boothillUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Physical']), // Enemy already has Physical weakness
            partyConfig: {
                members: [{
                    character: boothillUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        let localState = createInitialGameState(config);

        const factory = boothillHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start
        localState = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, localState, handlerId);

        // Trigger Skill (starts Standoff)
        localState = factory.handlerLogic({ type: 'ON_SKILL_USED', sourceId, targetId: enemyId } as ActionEvent, localState, handlerId);

        // Find and remove the physical weakness effect (simulating expiration)
        let enemy = localState.registry.get(createUnitId(enemyId));
        const weaknessEffect = enemy?.effects.find(e => e.id.includes('physical-weakness'));
        if (weaknessEffect) {
            localState = removeEffect(localState, enemyId, weaknessEffect.id);
        }

        // Check that Physical weakness is STILL present (because enemy originally had it)
        enemy = localState.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Physical')).toBe(true);
    });
});
