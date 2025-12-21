import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { blade, bladeHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

// Helper to create game state with specific eidolon level
const createBladeState = (eidolonLevel: number): GameState => {
    const bladeId = 'blade-1';
    const enemyId = 'enemy-1';

    const characters: Character[] = [
        {
            ...blade,
            id: bladeId,
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
        members: [{
            character: characters[0],
            config: {
                rotation: [],
                rotationMode: 'sequence',
                ultStrategy: 'immediate',
                ultCooldown: 0
            },
            enabled: true,
            eidolonLevel
        }]
    };

    const config = {
        characters,
        enemies,
        weaknesses: new Set(['Wind']) as Set<import('../../types').Element>,
        enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
        partyConfig,
        rounds: 5
    };

    let state = createInitialGameState(config);

    // Register handler with eidolon level
    const { handlerMetadata, handlerLogic } = bladeHandlerFactory(bladeId, 80, eidolonLevel);
    state = {
        ...state,
        eventHandlers: [...state.eventHandlers, handlerMetadata],
        eventHandlerLogics: { ...state.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
    };

    state = dispatch(state, { type: 'BATTLE_START' });
    return state;
};

describe('Blade Eidolon Tests', () => {
    const bladeId = 'blade-1';
    const enemyId = 'enemy-1';

    describe('E0 - Base functionality', () => {
        it('should have 5 max charges without eidolons', () => {
            const state = createBladeState(0);
            const bladeUnit = getUnit(state, bladeId);

            const chargeEffect = bladeUnit?.effects.find(e => e.id.includes('charges'));
            expect(chargeEffect?.maxStacks).toBe(5);
        });
    });

    describe('E2 - Crit Rate in Hellscape', () => {
        it('should gain +15% crit rate when entering Hellscape', () => {
            let state = createBladeState(2);
            const getBlade = (s: GameState) => getUnit(s, bladeId);

            // Use skill to enter Hellscape
            state = { ...state, currentTurnOwnerId: createUnitId(bladeId) };
            state = dispatch(state, { type: 'SKILL', sourceId: bladeId, targetId: bladeId });

            // Check for E2 crit buff
            const bladeUnit = getBlade(state);
            const e2CritEffect = bladeUnit?.effects.find(e =>
                e.id.includes('e2-crit') || e.name.includes('E2')
            );
            expect(e2CritEffect).toBeDefined();

            const critModifier = e2CritEffect?.modifiers?.find(m => m.target === 'crit_rate');
            expect(critModifier?.value).toBe(0.15);
        });

        it('should not have E2 buff at E1', () => {
            let state = createBladeState(1);
            const getBlade = (s: GameState) => getUnit(s, bladeId);

            state = { ...state, currentTurnOwnerId: createUnitId(bladeId) };
            state = dispatch(state, { type: 'SKILL', sourceId: bladeId, targetId: bladeId });

            const bladeUnit = getBlade(state);
            const e2CritEffect = bladeUnit?.effects.find(e =>
                e.id.includes('e2-crit') || e.name.includes('E2')
            );
            expect(e2CritEffect).toBeUndefined();
        });
    });

    describe('E6 - Reduced Charge Cap', () => {
        it('should have 4 max charges at E6', () => {
            const state = createBladeState(6);
            const bladeUnit = getUnit(state, bladeId);

            const chargeEffect = bladeUnit?.effects.find(e => e.id.includes('charges'));
            expect(chargeEffect?.maxStacks).toBe(4);
        });

        it('should still have 5 max charges at E5', () => {
            const state = createBladeState(5);
            const bladeUnit = getUnit(state, bladeId);

            const chargeEffect = bladeUnit?.effects.find(e => e.id.includes('charges'));
            expect(chargeEffect?.maxStacks).toBe(5);
        });
    });
});
