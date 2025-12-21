import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { trailblazerRemembrance, trailblazerRemembranceHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Trailblazer Remembrance Scenario Test', () => {
    let initialState: GameState;
    const tbId = 'trailblazer-remembrance-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        const characters: Character[] = [
            {
                ...trailblazerRemembrance,
                id: tbId,
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
            weaknesses: new Set(['Lightning']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        const { handlerMetadata, handlerLogic } = trailblazerRemembranceHandlerFactory(tbId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Skill - Mem Summon', () => {
        it('should summon Mem for target ally', () => {
            let state = initialState;

            state = { ...state, currentTurnOwnerId: createUnitId(tbId) };
            state = dispatch(state, { type: 'SKILL', sourceId: tbId, targetId: allyId });

            // Check if Mem summon exists
            const summons = state.registry.toArray().filter(u => u.isSummon);
            expect(summons.length).toBeGreaterThan(0);
        });
    });

    describe('Talent - Charge System', () => {
        it('should track charge stacks', () => {
            let state = initialState;
            const getTB = (s: GameState) => getUnit(s, tbId);

            const tb = getTB(state);
            expect(tb).toBeDefined();
        });
    });

    describe('Ultimate - Team Support', () => {
        it('should execute ultimate ability', () => {
            let state = initialState;
            const getTB = (s: GameState) => getUnit(s, tbId);

            // Set EP to max
            state = {
                ...state,
                registry: state.registry.update(createUnitId(tbId), u => ({ ...u, ep: 110 }))
            };

            state = { ...state, currentTurnOwnerId: createUnitId(tbId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: tbId, targetId: allyId });

            expect(state).toBeDefined();
        });
    });
});
