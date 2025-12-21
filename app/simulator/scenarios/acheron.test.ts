import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../engine/types';
import { createInitialGameState } from '../engine/gameState';
import { createUnitId } from '../engine/unitId';
import { acheron } from '../../data/characters/acheron';
import { Character, Enemy } from '../../types';
import { addEnergyToUnit } from '../engine/energy';
import { dispatch, publishEvent } from '../engine/dispatcher';
import { acheronHandlerFactory } from '../../data/characters/acheron';

// Mock enemies
const enemy1: Enemy = {
    id: 'enemy1',
    name: 'Enemy 1',
    element: 'Physical',
    toughness: 30, // Added to fix lint error
    maxToughness: 30, // Added for completeness
    baseStats: { hp: 10000, atk: 100, def: 0, spd: 100, aggro: 0, critRate: 0.05, critDmg: 0.50 } as any,
    baseRes: { Physical: 0, Fire: 0, Ice: 0, Lightning: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    abilities: {
        basic: { id: 'e-basic', name: 'Basic', type: 'Basic ATK', description: '', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
        talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' },
    }
};

describe('Acheron Mechanics', () => {
    let state: GameState;
    const ACHERON_ID = 'acheron';

    beforeEach(() => {
        const characters: Character[] = [
            { ...acheron, id: ACHERON_ID }
        ];

        // Mock config
        const config = {
            characters,
            enemies: [enemy1],
            weaknesses: new Set(['Lightning']),
            partyConfig: {
                members: [
                    { character: characters[0], config: acheron.defaultConfig!, enabled: true, eidolonLevel: 0 }
                ]
            },
            enemyConfig: { level: 80, maxHp: 10000, toughness: 30, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config as any);

        // Register Handlers manually similar to runSimulation
        const factories = [acheronHandlerFactory];
        state.eventHandlers = [];
        state.eventHandlerLogics = {};

        // Basic registration logic (simplified from simulation.ts)
        const acheronHandler = acheronHandlerFactory(createUnitId(ACHERON_ID), 80, 0);
        state.eventHandlers.push(acheronHandler.handlerMetadata);
        state.eventHandlerLogics[acheronHandler.handlerMetadata.id] = acheronHandler.handlerLogic;

        // Trigger Battle Start
        state = publishEvent(state, { type: 'ON_BATTLE_START', sourceId: 'system', value: 0 });
    });

    const getAcheron = (s: GameState) => s.registry.get(createUnitId(ACHERON_ID))!;

    it('should initialize with correct properties', () => {
        const u = getAcheron(state);
        expect(u.stats.max_ep).toBe(9);
        expect(u.disableEnergyRecovery).toBe(true);
    });

    it('should ignore standard energy recovery', () => {
        let u = getAcheron(state);
        const initialEp = u.ep;

        // Try to add standard energy
        state = addEnergyToUnit(state, u.id, 10);
        u = getAcheron(state);

        expect(u.ep).toBe(initialEp);
    });

    it('should gain EP (Zanmu) via Skill', () => {
        let u = getAcheron(state);
        const initialEp = u.ep;

        // Execute Skill
        state = dispatch(state, {
            type: 'SKILL',
            sourceId: u.id,
            targetId: createUnitId(enemy1.id)
        });

        u = getAcheron(state);
        // Skill gives +1 Zanmu (handled in onSkillUsed) 
        // Note: A2 gives +5 at start if unlocked. Let's verify start EP first.

        expect(u.ep).toBeGreaterThan(initialEp);
        expect(u.ep).toBe(initialEp + 1);
    });

    it('should gain EP when debuff is applied', () => {
        let u = getAcheron(state);
        const initialEp = u.ep;

        // Simulate debuff application (e.g. from Pela or LC)
        // Need to fire ON_EFFECT_APPLIED
        state = publishEvent(state, {
            type: 'ON_EFFECT_APPLIED',
            sourceId: u.id, // Acheron applying debuff (e.g. from LC) or ally
            targetId: createUnitId(enemy1.id),
            effect: {
                id: 'test-debuff',
                name: 'Test Debuff',
                category: 'DEBUFF',
                sourceUnitId: u.id,
                durationType: 'TURN_BASED',
                duration: 2,
                apply: (t, s) => s,
                remove: (t, s) => s
            } as any
        });

        u = getAcheron(state);
        expect(u.ep).toBe(initialEp + 1);
    });

    it('should consume EP on Ultimate', () => {
        let u = getAcheron(state);
        // Force EP to max
        state = {
            ...state,
            registry: state.registry.update(u.id, unit => ({ ...unit, ep: 9 }))
        };
        u = getAcheron(state);
        expect(u.ep).toBe(9);

        // Execute Ultimate
        state = dispatch(state, {
            type: 'ULTIMATE',
            sourceId: u.id,
            targetId: createUnitId(enemy1.id)
        });

        u = getAcheron(state);
        expect(u.ep).toBe(0);
    });

    it('should handle stored stacks (Shisou Danwa)', () => {
        let u = getAcheron(state);

        // Set EP to 9
        state = {
            ...state,
            registry: state.registry.update(u.id, unit => ({ ...unit, ep: 9 }))
        };

        // Add 1 more stack (should go to storage)
        // Trigger via skill for realism
        state = dispatch(state, {
            type: 'SKILL',
            sourceId: u.id,
            targetId: createUnitId(enemy1.id)
        });

        u = getAcheron(state);
        expect(u.ep).toBe(9); // Capped at 9

        // Check for Shisou Danwa effect
        const storageEffect = u.effects.find(e => e.id.includes('shisou-danwa'));
        expect(storageEffect).toBeDefined();
        if (storageEffect) {
            expect(storageEffect.stackCount).toBe(1);
        }

        // Execute Ultimate
        state = dispatch(state, {
            type: 'ULTIMATE',
            sourceId: u.id,
            targetId: createUnitId(enemy1.id)
        });

        u = getAcheron(state);
        // Should have 1 EP now (restored from storage)
        expect(u.ep).toBe(1);

        // Storage should be gone
        const storageEffectAfter = u.effects.find(e => e.id.includes('shisou-danwa'));
        expect(storageEffectAfter).toBeUndefined();
    });

});
