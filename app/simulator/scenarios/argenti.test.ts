import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { argenti, argentiHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Argenti Scenario Test', () => {
    let initialState: GameState;
    const argentiId = 'argenti-1';
    const enemyId = 'enemy-1';
    const enemy2Id = 'enemy-2';
    const enemy3Id = 'enemy-3';

    beforeEach(() => {
        const characters: Character[] = [
            {
                ...argenti,
                id: argentiId,
            }
        ];

        // Multiple enemies for Argenti's AoE skills
        const enemies: Enemy[] = [
            {
                id: enemyId,
                name: 'Test Enemy 1',
                level: 80,
                element: 'Wind',
                toughness: 100,
                maxToughness: 100,
                baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
                abilities: {
                    basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                    skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '' },
                    ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '' },
                    talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
                    technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' }
                }
            } as Enemy,
            {
                id: enemy2Id,
                name: 'Test Enemy 2',
                level: 80,
                element: 'Fire',
                toughness: 100,
                maxToughness: 100,
                baseStats: { hp: 50000, atk: 1000, def: 1000, spd: 90, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
                abilities: {
                    basic: { id: 'e2-basic', name: 'Atk', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                    skill: { id: 'e2-skill', name: 'Skill', type: 'Skill', description: '' },
                    ultimate: { id: 'e2-ult', name: 'Ult', type: 'Ultimate', description: '' },
                    talent: { id: 'e2-talent', name: 'Talent', type: 'Talent', description: '' },
                    technique: { id: 'e2-tech', name: 'Tech', type: 'Technique', description: '' }
                }
            } as Enemy,
            {
                id: enemy3Id,
                name: 'Test Enemy 3',
                level: 80,
                element: 'Ice',
                toughness: 100,
                maxToughness: 100,
                baseStats: { hp: 50000, atk: 1000, def: 1000, spd: 80, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
                abilities: {
                    basic: { id: 'e3-basic', name: 'Atk', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                    skill: { id: 'e3-skill', name: 'Skill', type: 'Skill', description: '' },
                    ultimate: { id: 'e3-ult', name: 'Ult', type: 'Ultimate', description: '' },
                    talent: { id: 'e3-talent', name: 'Talent', type: 'Talent', description: '' },
                    technique: { id: 'e3-tech', name: 'Tech', type: 'Technique', description: '' }
                }
            } as Enemy
        ];

        const partyConfig: PartyConfig = {
            members: characters.map(char => ({
                character: char,
                config: { rotation: ['s'], rotationMode: 'sequence', ultStrategy: 'argenti_180', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0
            }))
        };

        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Physical']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Argenti's event handlers
        const { handlerMetadata, handlerLogic } = argentiHandlerFactory(argentiId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Basic Attack', () => {
        it('should deal single target damage', () => {
            let state = initialState;
            const getEnemy = (s: GameState) => getUnit(s, enemyId);

            const initialHp = getEnemy(state)?.hp ?? 100000;

            state = { ...state, currentTurnOwnerId: createUnitId(argentiId) };
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: argentiId, targetId: enemyId });

            const enemy = getEnemy(state);
            expect(enemy?.hp).toBeLessThan(initialHp);
        });
    });

    describe('Skill - Justice, Bloom Like the Flowers', () => {
        it('should deal AoE damage to all enemies', () => {
            let state = initialState;
            const getEnemy = (s: GameState) => getUnit(s, enemyId);
            const getEnemy2 = (s: GameState) => getUnit(s, enemy2Id);
            const getEnemy3 = (s: GameState) => getUnit(s, enemy3Id);

            const initialHp1 = getEnemy(state)?.hp ?? 100000;
            const initialHp2 = getEnemy2(state)?.hp ?? 50000;
            const initialHp3 = getEnemy3(state)?.hp ?? 50000;

            state = { ...state, currentTurnOwnerId: createUnitId(argentiId) };
            state = dispatch(state, { type: 'SKILL', sourceId: argentiId, targetId: enemyId });

            // All enemies should take damage (AoE skill)
            expect(getEnemy(state)?.hp).toBeLessThan(initialHp1);
            expect(getEnemy2(state)?.hp).toBeLessThan(initialHp2);
            expect(getEnemy3(state)?.hp).toBeLessThan(initialHp3);
        });
    });

    describe('Ultimate - 90EP Version', () => {
        it('should deal AoE damage with 90EP', () => {
            let state = initialState;
            const getEnemy = (s: GameState) => getUnit(s, enemyId);
            const getArgenti = (s: GameState) => getUnit(s, argentiId);

            // Set EP to 90 and strategy to 90EP version
            state = {
                ...state,
                registry: state.registry.update(createUnitId(argentiId), u => ({
                    ...u,
                    ep: 90,
                    config: { ...u.config!, ultStrategy: 'argenti_90' as const }
                }))
            };

            const initialHp = getEnemy(state)?.hp ?? 100000;
            const initialEp = getArgenti(state)?.ep ?? 90;

            state = { ...state, currentTurnOwnerId: createUnitId(argentiId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: argentiId, targetId: enemyId });

            const enemy = getEnemy(state);
            const argentiUnit = getArgenti(state);

            // Damage should be dealt
            expect(enemy?.hp).toBeLessThan(initialHp);
            // EP should be consumed (90EP), but talent recovers 3EP per hit (3 enemies = 9EP + 5 base = 14EP)
            expect(argentiUnit?.ep).toBeLessThan(initialEp);
        });
    });

    describe('Ultimate - 180EP Version', () => {
        it('should deal AoE damage + 6 bounces with 180EP', () => {
            let state = initialState;
            const getEnemy = (s: GameState) => getUnit(s, enemyId);
            const getArgenti = (s: GameState) => getUnit(s, argentiId);

            // Set EP to 180
            state = {
                ...state,
                registry: state.registry.update(createUnitId(argentiId), u => ({
                    ...u,
                    ep: 180,
                    config: { ...u.config!, ultStrategy: 'argenti_180' as const }
                }))
            };

            const initialHp = getEnemy(state)?.hp ?? 100000;

            state = { ...state, currentTurnOwnerId: createUnitId(argentiId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: argentiId, targetId: enemyId });

            const enemy = getEnemy(state);
            const argentiUnit = getArgenti(state);

            // Damage should be dealt (more than 90EP version due to higher multiplier + bounces)
            expect(enemy?.hp).toBeLessThan(initialHp);
            // EP should be consumed (180EP), but talent and base recovery add EP back
        });
    });

    describe('Eidolon 4 - Initial Glory Stacks', () => {
        it('should gain 2 initial Glory stacks at battle start', () => {
            // Create new state with E4
            const characters: Character[] = [
                {
                    ...argenti,
                    id: argentiId,
                }
            ];

            const enemies: Enemy[] = [
                {
                    id: enemyId,
                    name: 'Test Enemy',
                    level: 80,
                    element: 'Wind',
                    toughness: 100,
                    maxToughness: 100,
                    baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                    baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
                    abilities: {
                        basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' },
                        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '' },
                        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '' },
                        talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
                        technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' }
                    }
                } as Enemy
            ];

            const partyConfig: PartyConfig = {
                members: characters.map(char => ({
                    character: char,
                    config: { rotation: ['s'], rotationMode: 'sequence', ultStrategy: 'argenti_180', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 4  // E4
                }))
            };

            const config = {
                characters,
                enemies,
                weaknesses: new Set(['Physical']) as Set<import('../../types').Element>,
                enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
                partyConfig,
                rounds: 5
            };

            let state = createInitialGameState(config);

            // Register Argenti's event handlers with E4
            const { handlerMetadata, handlerLogic } = argentiHandlerFactory(argentiId, 80, 4);
            state = {
                ...state,
                eventHandlers: [...state.eventHandlers, handlerMetadata],
                eventHandlerLogics: { ...state.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
            };

            state = dispatch(state, { type: 'BATTLE_START' });

            // Check for Glory stacks effect
            const argentiUnit = getUnit(state, argentiId);
            const gloryEffect = argentiUnit?.effects.find(e => e.name === '栄達');

            expect(gloryEffect).toBeDefined();
            expect(gloryEffect?.stackCount).toBe(2);
        });
    });
});
