import { describe, it, expect, beforeEach, test } from 'vitest';
import { anaxa, anaxaHandlerFactory } from '../anaxa';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { GameState, ActionEvent, Unit } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { Character, Enemy, SimulationConfig } from '../../../types/index';
import { removeEffect } from '../../../simulator/engine/effectManager';

describe('Anaxa Character Implementation - Weakness Management', () => {
    let state: GameState;
    const sourceId = 'anaxa-test';
    const enemyId = 'enemy-test';

    beforeEach(() => {
        const anaxaUnit: Character = { ...anaxa, id: sourceId, name: 'Anaxa' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy 1',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Fire', // NOT Wind (Anaxa's element)
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
            characters: [anaxaUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Fire']), // Enemy is weak to Fire only
            partyConfig: {
                members: [{
                    character: anaxaUnit,
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
        const factory = anaxaHandlerFactory(sourceId, 80, 0);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;
    });

    test('Weakness implant should update Unit.weaknesses directly', () => {
        const factory = anaxaHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start (applies technique weakness implants)
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, handlerId);

        const enemy = state.registry.get(createUnitId(enemyId));

        // チェック: Unit.weaknesses が更新されていること（ダメージエンジン互換性）
        // Anaxa's technique applies party member elements as weaknesses
        // Anaxa is Wind element
        expect(enemy?.weaknesses.has('Wind')).toBe(true);
    });

    test('Weakness should be removed when effect expires', () => {
        const factory = anaxaHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, handlerId);

        let enemy = state.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Wind')).toBe(true);

        // Find and remove the weakness effect (simulating expiration)
        const weaknessEffect = enemy?.effects.find(e => e.id.includes('anaxa-weakness-') && e.id.includes('Wind'));
        if (weaknessEffect) {
            state = removeEffect(state, enemyId, weaknessEffect.id);
        }

        // Check that Wind weakness was removed from Unit.weaknesses
        enemy = state.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Wind')).toBe(false);
    });

    test('Weakness should NOT be removed if enemy originally had it', () => {
        // Create state where enemy already has Wind weakness
        const anaxaUnit: Character = { ...anaxa, id: sourceId, name: 'Anaxa' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy 1',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Wind', // Enemy is Wind type
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
            characters: [anaxaUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Wind']), // Enemy already has Wind weakness
            partyConfig: {
                members: [{
                    character: anaxaUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        let localState = createInitialGameState(config);

        const factory = anaxaHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start
        localState = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, localState, handlerId);

        // Find and remove the weakness effect (simulating expiration)
        let enemy = localState.registry.get(createUnitId(enemyId));
        const weaknessEffect = enemy?.effects.find(e => e.id.includes('anaxa-weakness-') && e.id.includes('Wind'));
        if (weaknessEffect) {
            localState = removeEffect(localState, enemyId, weaknessEffect.id);
        }

        // Check that Wind weakness is STILL present (because enemy originally had it)
        enemy = localState.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Wind')).toBe(true);
    });

    test('Sublimation (all-element weakness) should update Unit.weaknesses', () => {
        const factory = anaxaHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start first
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, handlerId);

        // Trigger Ultimate (applies Sublimation)
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        const enemy = state.registry.get(createUnitId(enemyId));

        // 昇華状態: 全属性弱点が Unit.weaknesses に追加されていること
        expect(enemy?.weaknesses.has('Physical')).toBe(true);
        expect(enemy?.weaknesses.has('Fire')).toBe(true);
        expect(enemy?.weaknesses.has('Ice')).toBe(true);
        expect(enemy?.weaknesses.has('Lightning')).toBe(true);
        expect(enemy?.weaknesses.has('Wind')).toBe(true);
        expect(enemy?.weaknesses.has('Quantum')).toBe(true);
        expect(enemy?.weaknesses.has('Imaginary')).toBe(true);
    });

    test('Sublimation weaknesses should be removed when effect expires', () => {
        const factory = anaxaHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Battle Start first
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, handlerId);

        // Trigger Ultimate (applies Sublimation)
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        let enemy = state.registry.get(createUnitId(enemyId));

        // Verify all weaknesses were added
        expect(enemy?.weaknesses.has('Quantum')).toBe(true);
        expect(enemy?.weaknesses.has('Imaginary')).toBe(true);

        // Find and remove the sublimation effect (simulating expiration)
        const sublimationEffect = enemy?.effects.find(e => e.id.includes('anaxa-sublimation-'));
        if (sublimationEffect) {
            state = removeEffect(state, enemyId, sublimationEffect.id);
        }

        // Check that added weaknesses were removed (Fire was original, should remain)
        enemy = state.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Fire')).toBe(true); // Original
        expect(enemy?.weaknesses.has('Quantum')).toBe(false); // Added by Sublimation, should be removed
        expect(enemy?.weaknesses.has('Imaginary')).toBe(false); // Added by Sublimation, should be removed
    });

    describe('Anaxa E2 Implementation', () => {
        let state: GameState;
        const sourceId = 'anaxa-e2-test';
        const enemyId = 'enemy-e2-test';

        test('E2 should apply All-Type RES Down debuff with correct modifiers on enemy spawn', () => {
            const anaxaUnit: Character = { ...anaxa, id: sourceId, name: 'Anaxa' };
            const enemyUnit: Enemy = {
                id: enemyId,
                name: 'Enemy E2',
                baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
                element: 'Fire',
                toughness: 100,
                baseRes: {},
                abilities: { basic: { id: 'e-b', name: 'EB', type: 'Basic ATK', description: '' } } as any
            };

            const config: SimulationConfig = {
                characters: [anaxaUnit],
                enemies: [enemyUnit],
                weaknesses: new Set(['Fire']),
                partyConfig: {
                    members: [{
                        character: anaxaUnit,
                        config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                        enabled: true,
                        eidolonLevel: 2 // E2 Enabled
                    }]
                },
                enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
                rounds: 5
            };

            state = createInitialGameState(config);
            const factory = anaxaHandlerFactory(sourceId, 80, 2); // Handler with E2
            const handlerId = factory.handlerMetadata.id;

            // Trigger ON_ENEMY_SPAWNED
            state = factory.handlerLogic({
                type: 'ON_ENEMY_SPAWNED',
                sourceId: 'system',
                targetId: enemyId
            } as any, state, handlerId);

            const enemy = state.registry.get(createUnitId(enemyId));
            expect(enemy).toBeDefined();

            // Find RES Down Effect
            const resDownEffect = enemy?.effects.find(e => e.id.includes('anaxa-e2-all-res-down-'));
            expect(resDownEffect).toBeDefined();
            expect(resDownEffect?.name).toContain('E2: 全属性耐性ダウン');

            // Validate Modifiers
            expect(resDownEffect?.modifiers).toBeDefined();
            expect(resDownEffect?.modifiers?.length).toBeGreaterThan(0);

            const mod = resDownEffect?.modifiers?.[0];
            // Value should be -0.20
            expect(mod?.target).toBe('all_type_res');
            expect(mod?.value).toBeCloseTo(-0.20);
        });
    });
});
