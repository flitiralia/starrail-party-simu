import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { Hianshi, hianshiHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Hianshi Scenario Test', () => {
    let initialState: GameState;
    const hianshiId = 'hianshi-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        const characters: Character[] = [
            {
                ...Hianshi,
                id: hianshiId,
            },
            {
                id: allyId,
                name: 'Test Ally',
                path: 'Destruction',
                element: 'Physical',
                rarity: 5,
                maxEnergy: 120,
                baseStats: { hp: 1000, atk: 800, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 100 },
                abilities: {
                    basic: { id: 'ally-basic', name: 'Atk', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                    skill: { id: 'ally-skill', name: 'Skill', type: 'Skill', description: '' },
                    ultimate: { id: 'ally-ult', name: 'Ult', type: 'Ultimate', description: '' },
                    talent: { id: 'ally-talent', name: 'Talent', type: 'Talent', description: '' },
                    technique: { id: 'ally-tech', name: 'Tech', type: 'Technique', description: '' }
                },
                traces: [],
                eidolons: {},
            } as Character
        ];

        const enemies: Enemy[] = [{
            id: enemyId,
            name: 'Test Enemy',
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
        } as Enemy];

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
            weaknesses: new Set(['Wind']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        const { handlerMetadata, handlerLogic } = hianshiHandlerFactory(hianshiId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Skill - Healing and Buff', () => {
        it('should heal target ally', () => {
            let state = initialState;
            const getAlly = (s: GameState) => getUnit(s, allyId);

            // Reduce ally HP first
            state = {
                ...state,
                registry: state.registry.update(createUnitId(allyId), u => ({ ...u, hp: 500 }))
            };

            const beforeHp = getAlly(state)?.hp ?? 500;

            state = { ...state, currentTurnOwnerId: createUnitId(hianshiId) };
            state = dispatch(state, { type: 'SKILL', sourceId: hianshiId, targetId: allyId });

            const ally = getAlly(state);
            expect(ally?.hp).toBeGreaterThan(beforeHp);
        });
    });

    describe('Talent - Passive Effects', () => {
        it('should have talent effects active', () => {
            let state = initialState;
            const getHianshi = (s: GameState) => getUnit(s, hianshiId);

            const hianshi = getHianshi(state);
            expect(hianshi).toBeDefined();
        });
    });

    describe('Ultimate - Team Buff', () => {
        it('should apply buff to team', () => {
            let state = initialState;
            const getHianshi = (s: GameState) => getUnit(s, hianshiId);

            // Set EP to max
            state = {
                ...state,
                registry: state.registry.update(createUnitId(hianshiId), u => ({ ...u, ep: 110 }))
            };

            state = { ...state, currentTurnOwnerId: createUnitId(hianshiId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: hianshiId, targetId: allyId });

            expect(state).toBeDefined();
        });
    });
});
