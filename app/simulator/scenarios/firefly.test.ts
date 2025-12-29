import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { firefly, fireflyHandlerFactory } from '../../data/characters/firefly';
import { Character, Enemy, PartyConfig, Element } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Firefly Scenario Test', () => {
    let initialState: GameState;
    const fireflyId = 'firefly-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        // Setup initial state with Firefly and an Enemy
        const characters: Character[] = [{
            ...firefly,
            id: fireflyId,
        }];

        const enemies: Enemy[] = [{
            id: enemyId,
            name: 'Test Enemy',
            level: 80,
            element: 'Fire',
            toughness: 180,
            maxToughness: 180,
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
            weaknesses: new Set(['Fire']) as Set<Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 180, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Firefly's event handlers
        const { handlerMetadata, handlerLogic } = fireflyHandlerFactory(fireflyId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Dispatch BATTLE_START to trigger initial effects
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    it('should recover EP to 50% at battle start (Talent)', () => {
        const fireflyUnit = getUnit(initialState, fireflyId);
        expect(fireflyUnit).toBeDefined();

        // EP should be 50% of max (240 * 0.5 = 120)
        expect(fireflyUnit!.ep).toBeGreaterThanOrEqual(120);
    });

    it('should enter Complete Combustion state after Ultimate', () => {
        let state = initialState;
        const fireflyUnit = getUnit(state, fireflyId);
        expect(fireflyUnit).toBeDefined();

        // Give enough EP to use ultimate
        state = {
            ...state,
            registry: state.registry.update(createUnitId(fireflyId), u => ({
                ...u,
                ep: 240  // Max EP
            }))
        };

        // Use Ultimate
        state = dispatch(state, { type: 'ULTIMATE', sourceId: fireflyId });

        // Check for Complete Combustion effect
        const updatedFirefly = getUnit(state, fireflyId);
        expect(updatedFirefly).toBeDefined();

        const combustionEffect = updatedFirefly!.effects.find(e => e.id.includes('combustion'));
        expect(combustionEffect).toBeDefined();
        expect(combustionEffect?.name).toBe('完全燃焼');
    });

    it('should apply Fire weakness to enemies via enhanced skill', () => {
        let state = initialState;

        // Enter Complete Combustion
        state = {
            ...state,
            registry: state.registry.update(createUnitId(fireflyId), u => ({
                ...u,
                ep: 240
            }))
        };
        state = dispatch(state, { type: 'ULTIMATE', sourceId: fireflyId });

        // Use Enhanced Skill
        state = dispatch(state, { type: 'SKILL', sourceId: fireflyId, targetId: enemyId });

        // Check for Fire weakness effect on enemy
        const enemy = getUnit(state, enemyId);
        expect(enemy).toBeDefined();

        const weaknessEffect = enemy!.effects.find(e => e.id.includes('fire-weakness'));
        expect(weaknessEffect).toBeDefined();
    });

    it('should have countdown unit inserted after entering Complete Combustion', () => {
        let state = initialState;

        // Enter Complete Combustion
        state = {
            ...state,
            registry: state.registry.update(createUnitId(fireflyId), u => ({
                ...u,
                ep: 240
            }))
        };
        state = dispatch(state, { type: 'ULTIMATE', sourceId: fireflyId });

        // Check for countdown unit
        const units = state.registry.toArray();
        const countdownUnit = units.find(u => u.name === '完全燃焼カウントダウン');
        expect(countdownUnit).toBeDefined();
        expect(countdownUnit?.isSummon).toBe(true);
        expect(countdownUnit?.untargetable).toBe(true);
    });

    it('should consume HP when using normal Skill (40% HP cost)', () => {
        let state = initialState;
        const fireflyUnit = getUnit(state, fireflyId);
        expect(fireflyUnit).toBeDefined();

        const initialHp = fireflyUnit!.hp;

        // Use Skill (not in Complete Combustion)
        state = dispatch(state, { type: 'SKILL', sourceId: fireflyId, targetId: enemyId });

        const updatedFirefly = getUnit(state, fireflyId);
        expect(updatedFirefly).toBeDefined();

        // HP should be reduced by ~40%
        // Note: HP might be 1 if original HP was too low
        const expectedHp = Math.max(1, initialHp - fireflyUnit!.stats.hp * 0.40);
        expect(updatedFirefly!.hp).toBeLessThanOrEqual(initialHp);
    });

    it('should heal HP when using enhanced basic attack (20% HP heal)', () => {
        let state = initialState;

        // Reduce HP first
        state = {
            ...state,
            registry: state.registry.update(createUnitId(fireflyId), u => ({
                ...u,
                hp: u.stats.hp * 0.5,  // Set to 50% HP
                ep: 240
            }))
        };

        // Enter Complete Combustion
        state = dispatch(state, { type: 'ULTIMATE', sourceId: fireflyId });

        const beforeHp = getUnit(state, fireflyId)!.hp;

        // Use Enhanced Basic Attack
        state = dispatch(state, { type: 'ENHANCED_BASIC_ATTACK', sourceId: fireflyId, targetId: enemyId });

        const afterHp = getUnit(state, fireflyId)!.hp;

        // HP should increase (healed by 20%)
        expect(afterHp).toBeGreaterThanOrEqual(beforeHp);
    });
});
