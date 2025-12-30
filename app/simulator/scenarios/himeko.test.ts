
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch, publishEvent } from '../engine/dispatcher';
import { himekoHandlerFactory } from '../../data/characters/himeko';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';
import { himeko } from '../../data/characters/himeko';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Himeko Scenario Test', () => {
    let initialState: GameState;
    const himekoId = 'himeko-1';
    const enemyId = 'enemy-1';
    const enemy2Id = 'enemy-2';

    beforeEach(() => {
        const characters: Character[] = [
            {
                ...himeko,
                id: himekoId,
            }
        ];

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
                abilities: { basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' } } as any
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
                abilities: { basic: { id: 'e2-basic', name: 'Atk', type: 'Basic ATK', description: '' } } as any
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
            weaknesses: new Set(['Fire']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Himeko logic manually since we mocked factory in logic but test environment needs registration
        const { handlerMetadata, handlerLogic } = himekoHandlerFactory(himekoId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Note: dispatch BATTLE_START to trigger initial charges
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Talent - Victory Rush', () => {
        it('should start with 1 charge', () => {
            const unit = getUnit(initialState, himekoId);
            const chargeEffect = unit?.effects.find(e => e.id.includes('charge'));
            expect(chargeEffect?.stackCount).toBe(1);
        });

        it('should gain charge on weakness break', () => {
            let state = initialState;

            // Simulate Break
            state = publishEvent(state, {
                type: 'ON_WEAKNESS_BREAK',
                sourceId: himekoId,
                targetId: enemyId,
                subType: 'SKILL' // Simulate skill break for E4 check later
            } as any);

            const unit = getUnit(state, himekoId);
            const chargeEffect = unit?.effects.find(e => e.id.includes('charge'));
            expect(chargeEffect?.stackCount).toBe(2); // 1 start + 1 break
        });

        it('should trigger follow-up when fully charged and ally attacks', () => {
            let state = initialState;

            // Add 2 stacks to reach 3
            // We can manually manipulate state or trigger breaks
            // Let's force add effect for testing speed
            state = publishEvent(state, {
                type: 'ON_WEAKNESS_BREAK', sourceId: himekoId, targetId: enemyId, subType: 'BASIC'
            } as any);
            state = publishEvent(state, {
                type: 'ON_WEAKNESS_BREAK', sourceId: himekoId, targetId: enemy2Id, subType: 'BASIC'
            } as any);

            // Charges should be 3
            let unit = getUnit(state, himekoId);
            let chargeEffect = unit?.effects.find(e => e.id.includes('charge'));
            expect(chargeEffect?.stackCount).toBe(3);

            // Ally (Himeko herself here) attacks
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: himekoId, targetId: enemyId });

            // Check if Follow-Up triggered (Charges consumed)
            unit = getUnit(state, himekoId);
            chargeEffect = unit?.effects.find(e => e.id.includes('charge'));
            // Charges should be consumed (0 or removed)
            expect(chargeEffect).toBeUndefined();

            // Check Logs for Follow-up (requires log inspection)
            // Or check Enemy HP decreased more than Basic Attack
        });
    });

    describe('Skill - Molten Detonation', () => {
        it('should deal blast damage', () => {
            let state = initialState;
            const getEnemy = (s: GameState) => getUnit(s, enemyId);
            const getEnemy2 = (s: GameState) => getUnit(s, enemy2Id);

            const initHp1 = getEnemy(state)?.hp || 0;
            const initHp2 = getEnemy2(state)?.hp || 0;

            // Skill on Enemy 1 (blast to 2)
            // Dispatcher helper or raw action? Dispatcher uses 'SKILL' action.
            state = dispatch(state, {
                type: 'SKILL',
                sourceId: himekoId,
                targetId: enemyId,
                // adjacent targets usually auto-resolved by selector, but we might need to mock or setup positions?
                // Simulator selector assumes linear list?
                // Currently Simulator's `adjacentIds` are often calculated by `TargetSelector.select`.
                // But dispatch `SKILL` invokes `onSkillUsed`?
                // Wait, Himeko `onSkillUsed` is automatic? 
                // Currently `himeko.ts` doesn't implement `ON_SKILL_USED` explicitly for damage, 
                // standard engine handles damage based on `abilities` definition.
                // We only implemented `ON_BEFORE_DAMAGE_CALCULATION` and Traces.
                // So engine should handle blast if configured correctly.
            });

            // Since we didn't mock position/selector fully in this test helper, 
            // `TargetSelector` in default engine picks adjacent based on index.
            // Enemy1 and Enemy2 are adj in the list ([0], [1]).

            // Check hp
            expect(getEnemy(state)?.hp).toBeLessThan(initHp1);
            expect(getEnemy2(state)?.hp).toBeLessThan(initHp2);
        });
    });
});
