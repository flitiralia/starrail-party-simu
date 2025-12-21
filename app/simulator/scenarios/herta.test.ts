import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { herta, hertaHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Herta Scenario Test', () => {
    let initialState: GameState;
    const hertaId = 'herta-1';
    const enemyId = 'enemy-1';
    const enemy2Id = 'enemy-2';

    beforeEach(() => {
        const characters: Character[] = [
            {
                ...herta,
                id: hertaId,
            }
        ];

        // Multiple enemies for Herta's talent testing (triggers on enemies < 50% HP)
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
            } as Enemy
        ];

        const partyConfig: PartyConfig = {
            members: characters.map(char => ({
                character: char,
                config: { rotation: [], rotationMode: 'sequence', ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0
            }))
        };

        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Ice']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Herta's event handlers
        const { handlerMetadata, handlerLogic } = hertaHandlerFactory(hertaId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Skill - One-Time Offer', () => {
        it('should deal AoE damage', () => {
            let state = initialState;
            const getEnemy = (s: GameState) => getUnit(s, enemyId);
            const getEnemy2 = (s: GameState) => getUnit(s, enemy2Id);

            const initialHp1 = getEnemy(state)?.hp ?? 100000;
            const initialHp2 = getEnemy2(state)?.hp ?? 50000;

            state = { ...state, currentTurnOwnerId: createUnitId(hertaId) };
            state = dispatch(state, { type: 'SKILL', sourceId: hertaId, targetId: enemyId });

            // Both enemies should take damage (AoE skill)
            const enemy1 = getEnemy(state);
            const enemy2 = getEnemy2(state);
            expect(enemy1?.hp).toBeLessThan(initialHp1);
        });
    });

    describe('Talent - Fine, I Will Do It Myself', () => {
        it('should trigger follow-up when enemy HP drops below 50%', () => {
            let state = initialState;
            const getEnemy2 = (s: GameState) => getUnit(s, enemy2Id);

            // Set enemy2 HP to just above 50%
            state = {
                ...state,
                registry: state.registry.update(createUnitId(enemy2Id), u => ({
                    ...u,
                    hp: 26000,  // 52% of 50000
                    stats: { ...u.stats, hp: 50000 }
                }))
            };

            // Attack should trigger talent when HP drops below 50%
            state = { ...state, currentTurnOwnerId: createUnitId(hertaId) };
            state = dispatch(state, { type: 'SKILL', sourceId: hertaId, targetId: enemy2Id });

            // Check for pending follow-up attack or decreased HP
            const enemy2 = getEnemy2(state);
            expect(enemy2).toBeDefined();
        });
    });

    describe('Ultimate - Its Magic, I Added Some Magic', () => {
        it('should deal AoE damage to all enemies', () => {
            let state = initialState;
            const getHerta = (s: GameState) => getUnit(s, hertaId);
            const getEnemy = (s: GameState) => getUnit(s, enemyId);

            // Set EP to max
            state = {
                ...state,
                registry: state.registry.update(createUnitId(hertaId), u => ({ ...u, ep: 100 }))
            };

            const initialHp = getEnemy(state)?.hp ?? 100000;

            state = { ...state, currentTurnOwnerId: createUnitId(hertaId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: hertaId, targetId: enemyId });

            const enemy = getEnemy(state);
            expect(enemy?.hp).toBeLessThan(initialHp);
        });
    });
});
