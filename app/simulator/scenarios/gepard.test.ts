import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { gepard, gepardHandlerFactory } from '../../data/characters/gepard';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Gepard Scenario Test', () => {
    let initialState: GameState;
    const gepardId = 'gepard-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        // Setup initial state with Gepard, an Ally, and an Enemy
        const characters: Character[] = [
            {
                ...gepard,
                id: gepardId,
            },
            {
                ...gepard,
                id: allyId,
                name: 'テスト味方',
            }
        ];

        const enemies: Enemy[] = [{
            id: enemyId,
            name: 'Test Enemy',
            level: 80,
            element: 'Physical',
            toughness: 100,
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

        // Create config
        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Ice']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Gepard's event handlers
        const { handlerMetadata, handlerLogic } = gepardHandlerFactory(gepardId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Dispatch BATTLE_START to trigger initial buffs
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Ultimate Shield', () => {
        it('should apply shield to all allies on ultimate use', () => {
            let state = initialState;

            // Set EP to full
            state = {
                ...state,
                registry: state.registry.update(createUnitId(gepardId), u => ({
                    ...u,
                    ep: 100
                }))
            };

            // Use ultimate
            state = dispatch(state, { type: 'ULTIMATE', sourceId: gepardId });

            // Check if Gepard has shield
            const gepardUnit = getUnit(state, gepardId);
            expect(gepardUnit?.shield).toBeGreaterThan(0);

            // Check if ally has shield
            const allyUnit = getUnit(state, allyId);
            expect(allyUnit?.shield).toBeGreaterThan(0);
        });

        it('should calculate shield value based on DEF', () => {
            let state = initialState;

            // Set EP to full
            state = {
                ...state,
                registry: state.registry.update(createUnitId(gepardId), u => ({
                    ...u,
                    ep: 100
                }))
            };

            // Get Gepard's DEF before ultimate
            const gepardBefore = getUnit(state, gepardId);
            // 秘技バリア (DEF 24%+150) + 必殺技バリア (DEF 45%+600) = DEF 69%+750
            const techniqueShield = (gepardBefore?.stats.def || 0) * 0.24 + 150;
            const ultimateShield = (gepardBefore?.stats.def || 0) * 0.45 + 600;
            const expectedShield = techniqueShield + ultimateShield;

            // Use ultimate
            state = dispatch(state, { type: 'ULTIMATE', sourceId: gepardId });

            // Check shield value is approximately correct
            const gepardAfter = getUnit(state, gepardId);
            expect(gepardAfter?.shield).toBeCloseTo(expectedShield, 0);
        });
    });

    describe('Skill Freeze', () => {
        it('should apply skill damage to enemy', () => {
            let state = initialState;

            const enemyBefore = getUnit(state, enemyId);
            const hpBefore = enemyBefore?.hp || 0;

            // Use skill
            state = dispatch(state, { type: 'SKILL', sourceId: gepardId, targetId: enemyId });

            const enemyAfter = getUnit(state, enemyId);
            expect(enemyAfter?.hp).toBeLessThan(hpBefore);
        });
    });

    describe('A6 Trace: ATK Boost', () => {
        it('should have A6 trace defined', () => {
            // Check if Gepard has A6 trace
            const gepardUnit = getUnit(initialState, gepardId);
            const hasA6Trace = gepardUnit?.traces?.some(t => t.id.includes('trace-a6'));
            expect(hasA6Trace).toBe(true);
        });
    });

    describe('E4: Effect Resistance Buff', () => {
        it('should apply effect resistance buff to all allies with E4', () => {
            // Create a new state with E4 enabled
            const characters: Character[] = [
                {
                    ...gepard,
                    id: gepardId,
                },
                {
                    ...gepard,
                    id: allyId,
                    name: 'テスト味方',
                }
            ];

            const enemies: Enemy[] = [{
                id: enemyId,
                name: 'Test Enemy',
                level: 80,
                element: 'Physical',
                toughness: 100,
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
                    eidolonLevel: 4  // Enable E4
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

            let state = createInitialGameState(config);

            // Register Gepard's event handlers with E4
            const { handlerMetadata, handlerLogic } = gepardHandlerFactory(gepardId, 80, 4);
            state = {
                ...state,
                eventHandlers: [...state.eventHandlers, handlerMetadata],
                eventHandlerLogics: { ...state.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
            };

            // Dispatch BATTLE_START
            state = dispatch(state, { type: 'BATTLE_START' });

            // Check if Gepard has E4 effect resistance buff
            const gepardUnit = getUnit(state, gepardId);
            const hasE4Effect = gepardUnit?.effects.some(e => e.tags?.includes('E4_EFFECT_RES'));
            expect(hasE4Effect).toBe(true);

            // Check if ally has E4 effect resistance buff
            const allyUnit = getUnit(state, allyId);
            const allyHasE4Effect = allyUnit?.effects.some(e => e.tags?.includes('E4_EFFECT_RES'));
            expect(allyHasE4Effect).toBe(true);
        });
    });
});
