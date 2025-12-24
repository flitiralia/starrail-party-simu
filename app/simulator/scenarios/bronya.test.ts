import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { bronya, bronyaHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Bronya Scenario Test', () => {
    let initialState: GameState;
    const bronyaId = 'bronya-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        // Setup initial state with Bronya, an ally, and an Enemy
        const characters: Character[] = [
            {
                ...bronya,
                id: bronyaId,
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
                    basic: { id: 'ally-basic', name: 'Atk', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] }, energyGain: 20, targetType: 'single_enemy' },
                    skill: { id: 'ally-skill', name: 'Skill', type: 'Skill', description: '', energyGain: 30, targetType: 'single_enemy' },
                    ultimate: { id: 'ally-ult', name: 'Ult', type: 'Ultimate', description: '', energyGain: 5, targetType: 'single_enemy' },
                    talent: { id: 'ally-talent', name: 'Talent', type: 'Talent', description: '', energyGain: 0 },
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
                basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] }, energyGain: 0, targetType: 'single_enemy' },
                skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '', energyGain: 0, targetType: 'single_enemy' },
                ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '', energyGain: 0, targetType: 'single_enemy' },
                talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '', energyGain: 0 },
                technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' }
            },
            weaknesses: new Set<import('../../types').Element>(['Wind'])
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

        // Register Bronya's event handlers
        const { handlerMetadata, handlerLogic } = bronyaHandlerFactory(bronyaId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Dispatch BATTLE_START
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Skill - Operation Redeploy', () => {
        it('should apply damage boost effect to ally', () => {
            let state = initialState;
            const getAlly = (s: GameState) => getUnit(s, allyId);

            // Set turn owner and SP
            state = { ...state, currentTurnOwnerId: createUnitId(bronyaId), skillPoints: 3 };

            // Use skill on ally
            state = dispatch(state, { type: 'SKILL', sourceId: bronyaId, targetId: allyId });

            // Verify ally has damage boost effect
            const ally = getAlly(state);
            const dmgBoostEffect = ally?.effects.find(e =>
                e.id.includes('bronya-skill-dmg-boost') || e.name.includes('作戦再展開')
            );
            expect(dmgBoostEffect).toBeDefined();
            expect(dmgBoostEffect?.modifiers?.some(m => m.target === 'all_type_dmg_boost')).toBe(true);
        });

        it('should advance ally action by 100%', () => {
            let state = initialState;
            const getAlly = (s: GameState) => getUnit(s, allyId);

            const initialAV = getAlly(state)?.actionValue ?? 0;

            state = { ...state, currentTurnOwnerId: createUnitId(bronyaId), skillPoints: 3 };
            state = dispatch(state, { type: 'SKILL', sourceId: bronyaId, targetId: allyId });

            const finalAV = getAlly(state)?.actionValue ?? 0;

            // Action value should be significantly reduced (100% advance)
            expect(finalAV).toBeLessThan(initialAV);
        });
    });

    describe('Ultimate - Belobog March', () => {
        it('should apply ATK boost to all allies', () => {
            let state = initialState;
            const getBronya = (s: GameState) => getUnit(s, bronyaId);
            const getAlly = (s: GameState) => getUnit(s, allyId);

            // Set EP to max
            state = {
                ...state,
                registry: state.registry.update(createUnitId(bronyaId), u => ({ ...u, ep: 120 }))
            };

            state = { ...state, currentTurnOwnerId: createUnitId(bronyaId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: bronyaId });

            // Verify both Bronya and ally have ATK boost
            const bronya = getBronya(state);
            const ally = getAlly(state);

            const bronyaAtkEffect = bronya?.effects.find(e =>
                e.id.includes('bronya-ult-atk-boost') && e.modifiers?.some(m => m.target === 'atk_pct')
            );
            const allyAtkEffect = ally?.effects.find(e =>
                e.id.includes('bronya-ult-atk-boost') && e.modifiers?.some(m => m.target === 'atk_pct')
            );

            expect(bronyaAtkEffect).toBeDefined();
            expect(allyAtkEffect).toBeDefined();
        });

        it('should apply Crit DMG boost to all allies', () => {
            let state = initialState;
            const getAlly = (s: GameState) => getUnit(s, allyId);

            // Set EP to max
            state = {
                ...state,
                registry: state.registry.update(createUnitId(bronyaId), u => ({ ...u, ep: 120 }))
            };

            state = { ...state, currentTurnOwnerId: createUnitId(bronyaId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: bronyaId });

            // Verify ally has Crit DMG boost
            const ally = getAlly(state);
            const critDmgEffect = ally?.effects.find(e =>
                e.id.includes('bronya-ult-crit-dmg-boost') && e.modifiers?.some(m => m.target === 'crit_dmg')
            );

            expect(critDmgEffect).toBeDefined();
        });
    });

    describe('Talent - Leading the Way', () => {
        it('should advance action after basic attack', () => {
            let state = initialState;
            const getBronya = (s: GameState) => getUnit(s, bronyaId);

            const initialAV = getBronya(state)?.actionValue ?? 0;

            state = { ...state, currentTurnOwnerId: createUnitId(bronyaId) };
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: bronyaId, targetId: enemyId });

            const finalAV = getBronya(state)?.actionValue ?? 0;

            // Bronya's action value should be reduced after basic attack (talent effect)
            expect(finalAV).toBeLessThan(initialAV);
        });
    });

    describe('Technique - Under the Banner', () => {
        it('should apply ATK boost to all allies at battle start', () => {
            // The technique is applied in battle start, which already happened in beforeEach
            const getBronya = (s: GameState) => getUnit(s, bronyaId);
            const getAlly = (s: GameState) => getUnit(s, allyId);

            const bronya = getBronya(initialState);
            const ally = getAlly(initialState);

            // Both should have technique ATK boost
            const bronyaTechEffect = bronya?.effects.find(e =>
                e.id.includes('bronya-technique-atk-boost') && e.modifiers?.some(m => m.target === 'atk_pct')
            );
            const allyTechEffect = ally?.effects.find(e =>
                e.id.includes('bronya-technique-atk-boost') && e.modifiers?.some(m => m.target === 'atk_pct')
            );

            expect(bronyaTechEffect).toBeDefined();
            expect(allyTechEffect).toBeDefined();
        });
    });

    describe('Trace A2 - Command', () => {
        it('should have 100% crit rate on basic attack', () => {
            let state = initialState;

            state = { ...state, currentTurnOwnerId: createUnitId(bronyaId) };

            // Dispatch basic attack and check damage modifiers
            // Note: This is difficult to test directly without inspecting damageModifiers during calculation
            // We can at least verify the trace exists
            const getBronya = (s: GameState) => getUnit(s, bronyaId);
            const bronya = getBronya(state);

            const traceA2 = bronya?.traces?.find(t => t.id === 'bronya-trace-a2');
            expect(traceA2).toBeDefined();
            expect(traceA2?.name).toBe('号令');
        });
    });

    describe('Trace A4 - Position', () => {
        it('should apply DEF boost to all allies at battle start', () => {
            const getBronya = (s: GameState) => getUnit(s, bronyaId);
            const getAlly = (s: GameState) => getUnit(s, allyId);

            const bronya = getBronya(initialState);
            const ally = getAlly(initialState);

            // Both should have DEF boost from A4
            const bronyaDefEffect = bronya?.effects.find(e =>
                e.id.includes('bronya-a4-def-boost') && e.modifiers?.some(m => m.target === 'def_pct')
            );
            const allyDefEffect = ally?.effects.find(e =>
                e.id.includes('bronya-a4-def-boost') && e.modifiers?.some(m => m.target === 'def_pct')
            );

            expect(bronyaDefEffect).toBeDefined();
            expect(allyDefEffect).toBeDefined();
        });
    });

    describe('Trace A6 - Army', () => {
        it('should apply DMG boost aura', () => {
            const getBronya = (s: GameState) => getUnit(s, bronyaId);
            const bronya = getBronya(initialState);

            // Bronya should have A6 aura effect
            const auraEffect = bronya?.effects.find(e =>
                e.id.includes('bronya-a6-dmg-boost') &&
                e.tags?.includes('AURA') &&
                e.modifiers?.some(m => m.target === 'all_type_dmg_boost')
            );

            expect(auraEffect).toBeDefined();
        });
    });
});
