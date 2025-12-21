import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { DanHengToukou, danHengToukouHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Dan Heng Toukou (丹恒・騰荒) Scenario Test', () => {
    let initialState: GameState;
    const danHengId = 'dan-heng-toukou-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        const characters: Character[] = [
            {
                ...DanHengToukou,
                id: danHengId,
            },
            // Ally to be the "comrade" target
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
            weaknesses: new Set(['Physical']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Dan Heng Toukou's event handlers
        const { handlerMetadata, handlerLogic } = danHengToukouHandlerFactory(danHengId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Skill - Barrier and Comrade', () => {
        it('should designate target as Comrade (同袍)', () => {
            let state = initialState;
            const getAlly = (s: GameState) => getUnit(s, allyId);

            state = { ...state, currentTurnOwnerId: createUnitId(danHengId) };
            state = dispatch(state, { type: 'SKILL', sourceId: danHengId, targetId: allyId });

            // Check if ally has Comrade effect
            const ally = getAlly(state);
            const comradeEffect = ally?.effects.find(e =>
                e.id.includes('comrade') || e.name.includes('同袍')
            );
            expect(comradeEffect).toBeDefined();
        });

        it('should apply barrier to all allies', () => {
            let state = initialState;
            const getDanHeng = (s: GameState) => getUnit(s, danHengId);
            const getAlly = (s: GameState) => getUnit(s, allyId);

            state = { ...state, currentTurnOwnerId: createUnitId(danHengId) };
            state = dispatch(state, { type: 'SKILL', sourceId: danHengId, targetId: allyId });

            // Check if Dan Heng has shield
            const danHeng = getDanHeng(state);
            expect(danHeng?.shield).toBeGreaterThan(0);

            // Check if ally has shield
            const ally = getAlly(state);
            expect(ally?.shield).toBeGreaterThan(0);
        });
    });

    describe('Talent - Dragon Spirit Summon', () => {
        it('should summon Dragon Spirit when Comrade is designated', () => {
            let state = initialState;

            state = { ...state, currentTurnOwnerId: createUnitId(danHengId) };
            state = dispatch(state, { type: 'SKILL', sourceId: danHengId, targetId: allyId });

            // Check if Dragon Spirit summon exists
            const summons = state.registry.toArray().filter(u => u.isSummon);
            const dragonSpirit = summons.find(s => s.name.includes('龍霊') || s.id.includes('dragon'));
            expect(dragonSpirit).toBeDefined();
        });
    });

    describe('Ultimate - AoE Damage and Barrier', () => {
        it('should deal damage to all enemies', () => {
            let state = initialState;
            const getDanHeng = (s: GameState) => getUnit(s, danHengId);
            const getEnemy = (s: GameState) => getUnit(s, enemyId);

            // Set EP to max
            state = {
                ...state,
                registry: state.registry.update(createUnitId(danHengId), u => ({ ...u, ep: 135 }))
            };

            const initialHp = getEnemy(state)?.hp ?? 100000;

            state = { ...state, currentTurnOwnerId: createUnitId(danHengId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: danHengId, targetId: enemyId });

            const enemy = getEnemy(state);
            expect(enemy?.hp).toBeLessThan(initialHp);
        });

        it('should apply barrier to all allies on ultimate', () => {
            let state = initialState;
            const getDanHeng = (s: GameState) => getUnit(s, danHengId);

            // First use skill to have comrade
            state = { ...state, currentTurnOwnerId: createUnitId(danHengId) };
            state = dispatch(state, { type: 'SKILL', sourceId: danHengId, targetId: allyId });

            // Set EP to max
            state = {
                ...state,
                registry: state.registry.update(createUnitId(danHengId), u => ({ ...u, ep: 135 }))
            };

            state = dispatch(state, { type: 'ULTIMATE', sourceId: danHengId, targetId: enemyId });

            // Check Dan Heng has shield
            const danHeng = getDanHeng(state);
            expect(danHeng?.shield).toBeGreaterThan(0);
        });
    });
});
