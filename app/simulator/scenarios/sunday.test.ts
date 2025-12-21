import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { sunday, sundayHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Sunday Scenario Test', () => {
    let initialState: GameState;
    const sundayId = 'sunday-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        // Setup initial state with Sunday, an ally, and an Enemy
        const characters: Character[] = [
            {
                ...sunday,
                id: sundayId,
            },
            // Simple ally character for skill target
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
            weaknesses: new Set(['Imaginary']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Sunday's event handlers
        const { handlerMetadata, handlerLogic } = sundayHandlerFactory(sundayId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Dispatch BATTLE_START
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Skill - David and Goliath', () => {
        it('should apply damage boost effect to ally', () => {
            let state = initialState;
            const getSunday = (s: GameState) => getUnit(s, sundayId);
            const getAlly = (s: GameState) => getUnit(s, allyId);

            // Force turn owner
            state = { ...state, currentTurnOwnerId: createUnitId(sundayId) };

            // Use skill on ally
            state = dispatch(state, { type: 'SKILL', sourceId: sundayId, targetId: allyId });

            // Verify ally has damage boost effect
            const ally = getAlly(state);
            const dmgBoostEffect = ally?.effects.find(e =>
                e.id.includes('sunday-skill-dmg') || e.name.includes('ダメージ')
            );
            expect(dmgBoostEffect).toBeDefined();
        });

        it('should apply crit rate effect from talent', () => {
            let state = initialState;
            const getAlly = (s: GameState) => getUnit(s, allyId);

            state = { ...state, currentTurnOwnerId: createUnitId(sundayId) };
            state = dispatch(state, { type: 'SKILL', sourceId: sundayId, targetId: allyId });

            // Verify ally has crit rate boost from talent
            const ally = getAlly(state);
            const critEffect = ally?.effects.find(e =>
                e.modifiers?.some(m => m.target === 'crit_rate')
            );
            expect(critEffect).toBeDefined();
        });
    });

    describe('Ultimate - Blessed One', () => {
        it('should apply crit damage boost to target', () => {
            let state = initialState;
            const getSunday = (s: GameState) => getUnit(s, sundayId);
            const getAlly = (s: GameState) => getUnit(s, allyId);

            // Set EP to max so ultimate can be used
            const sundayUnit = getSunday(state)!;
            state = {
                ...state,
                registry: state.registry.update(createUnitId(sundayId), u => ({ ...u, ep: 130 }))
            };

            state = { ...state, currentTurnOwnerId: createUnitId(sundayId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: sundayId, targetId: allyId });

            // Verify ally has Blessed One effect (crit dmg boost)
            const ally = getAlly(state);
            const blessedEffect = ally?.effects.find(e =>
                e.id.includes('blessed') || e.name.includes('祝福')
            );
            expect(blessedEffect).toBeDefined();
        });
    });
});
