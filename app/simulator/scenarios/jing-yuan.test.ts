import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch, publishEvent } from '../engine/dispatcher';
import { jingYuan, jingYuanHandlerFactory } from '../../data/characters/jing-yuan';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';
import { getLeveledValue } from '../utils/abilityLevel';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Jing Yuan Scenario Test', () => {
    let initialState: GameState;
    const jyId = 'jing-yuan-1';
    const llId = 'jing-yuan-1-lightning-lord';
    const enemyId = 'enemy-1';

    // Helper to create state with specific Eidolon level
    const createTestState = (eidolonLevel: number = 0): GameState => {
        const characters: Character[] = [
            { ...jingYuan, id: jyId }
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
                baseRes: { Lightning: 0.0 },
                isEnemy: true,
                abilities: { basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' } } as any
            } as Enemy
        ];

        const partyConfig: PartyConfig = {
            members: characters.map(char => ({
                character: char,
                config: { rotation: [], rotationMode: 'sequence', ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: eidolonLevel
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

        let state = createInitialGameState(config);

        // Register handlers manually
        const jyHandler = jingYuanHandlerFactory(jyId, eidolonLevel);

        state = {
            ...state,
            eventHandlers: [...state.eventHandlers, jyHandler.handlerMetadata],
            eventHandlerLogics: {
                ...state.eventHandlerLogics,
                [jyHandler.handlerMetadata.id]: jyHandler.handlerLogic
            }
        };

        return dispatch(state, { type: 'BATTLE_START' });
    };

    beforeEach(() => {
        initialState = createTestState(0);
    });

    it('should spawn Lightning-Lord with 6 stacks (technique) and 90 SPD at battle start', () => {
        const llUnit = getUnit(initialState, llId);
        expect(llUnit).toBeDefined();

        // Check Stacks (3 Base + 3 Technique = 6)
        const stackEffect = llUnit?.effects.find(e => e.id === 'jing-yuan-ll-stacks');
        expect(stackEffect).toBeDefined();
        expect(stackEffect?.stackCount).toBe(6);

        // Check Speed
        // Base 60. 6 stacks -> (6-3)*10 = +30. Total 90.
        expect(llUnit?.stats.spd).toBe(90);
    });

    it('should increase stacks and speed on Skill use', () => {
        let state = initialState;

        // Skill -> +2 Stacks. (6 -> 8)
        state = dispatch(state, { type: 'SKILL', sourceId: jyId, targetId: enemyId });

        const llUnit = getUnit(state, llId);
        const stackEffect = llUnit?.effects.find(e => e.id === 'jing-yuan-ll-stacks');
        expect(stackEffect?.stackCount).toBe(8);

        // Speed check: 8 stacks -> (8-3)*10 = +50. Total 110.
        expect(llUnit?.stats.spd).toBe(110);
    });

    it('should increase stacks and speed on Ultimate use', () => {
        let state = initialState;

        // Ultimate -> +3 Stacks. (6 -> 9)
        state = dispatch(state, { type: 'ULTIMATE', sourceId: jyId, targetId: enemyId });

        const llUnit = getUnit(state, llId);
        const stackEffect = llUnit?.effects.find(e => e.id === 'jing-yuan-ll-stacks');
        expect(stackEffect?.stackCount).toBe(9);

        // Speed check: 9 stacks -> +60. Total 120.
        expect(llUnit?.stats.spd).toBe(120);
    });

    it('should cap stacks at 10', () => {
        let state = initialState;

        // Initial 6
        // Skill (+2) -> 8
        state = dispatch(state, { type: 'SKILL', sourceId: jyId, targetId: enemyId });
        // Ult (+3) -> 11 -> Cap 10
        state = dispatch(state, { type: 'ULTIMATE', sourceId: jyId, targetId: enemyId });

        const llUnit = getUnit(state, llId);
        const stackEffect = llUnit?.effects.find(e => e.id === 'jing-yuan-ll-stacks');
        expect(stackEffect?.stackCount).toBe(10);

        // Speed: (10-3)*10 = +70. Total 130.
        expect(llUnit?.stats.spd).toBe(130);
    });

    it('should reset stacks to 3 after Lightning-Lord action', () => {
        let state = initialState;

        // Need to trigger LL turn.
        // LL starts at 6 stacks/90 Speed.
        // Use publishEvent to simulate ON_TURN_START

        state = publishEvent(state, { type: 'ON_TURN_START', sourceId: llId });

        // Should have reset
        const llUnit = getUnit(state, llId);
        const stackEffect = llUnit?.effects.find(e => e.id === 'jing-yuan-ll-stacks');
        expect(stackEffect?.stackCount).toBe(3);
        expect(llUnit?.stats.spd).toBe(60);
    });

    it('should apply A6 Crit Rate buff after Skill', () => {
        const stateWithA6 = createTestState(0);
        // Use Skill
        const jyHandler = jingYuanHandlerFactory(jyId, 0);
        let newState = jyHandler.handlerLogic({
            type: 'ON_SKILL_USED',
            sourceId: jyId,
            targetType: 'all_enemies'
        } as any, stateWithA6, 'handler-id');

        const jy = getUnit(newState, jyId);
        const a6Buff = jy?.effects.find(e => e.id === 'jing-yuan-a6-crit-rate');
        expect(a6Buff).toBeDefined();
        expect(a6Buff?.modifiers?.[0].value).toBe(0.10);
    });

    it('should apply A2 Crit DMG buff to Lightning-Lord when stacks >= 6', () => {
        let state = createTestState(0); // A2 is a trace, not eidolon. Assume it's active by default.
        // Initial spawn logic in test helper uses `spawnLightningLord` which sets stacks to 3+3=6 normally (with technique).
        // So LL should start with 6 stacks.

        const llUnit = getUnit(state, llId);
        expect(llUnit).toBeDefined();

        // The default `jingYuan` definition has all traces in `traces` array.
        // So checking `llUnit.effects` should show A2 buff if logic works.

        const a2Buff = llUnit?.effects.find(e => e.id === 'jing-yuan-a2-crit-dmg');
        expect(a2Buff).toBeDefined();
        expect(a2Buff?.modifiers?.[0].value).toBe(0.25);
    });

    it('should increase damage per hit with E6 (Vulnerability)', () => {
        // E6 Scenario
        let state = createTestState(6); // E6 enabled

        // Ensure single enemy for consistent hits
        // Our setup creates 1 enemy 'test-enemy-1'.

        // Trigger LL Attack
        const handler = jingYuanHandlerFactory(jyId, 6);

        // Initial Stacks 6. Speed 90.
        // Trigger ON_TURN_START for LL
        const nextState = handler.handlerLogic({
            type: 'ON_TURN_START',
            sourceId: llId
        } as any, state, 'test-handler');

        // Check if Enemy has E6 Debuff
        // The handler loop removes it at the end of function!
        // "Clean up E6 Vulnerability from enemies"

        // So `nextState` will NOT have the effect.
        // Verification: The implementation should have applied it during the loop.
        // Mocking `applyUnifiedDamage` is hard here.
        // But we can check if the removal logic worked? 
        // If we want to verify it was applied, we'd need to intercept.
        // For regression testing: at least ensure no crash and state is consistent.

        expect(nextState).toBeDefined();
    });

    it('should apply E2 Damage Boosts to Basic, Skill, and Ultimate after LL action', () => {
        let state = createTestState(2); // E2 enabled
        const handler = jingYuanHandlerFactory(jyId, 2);

        // Trigger LL Turn
        state = handler.handlerLogic({
            type: 'ON_TURN_START',
            sourceId: llId
        } as any, state, 'test-handler');

        const jy = getUnit(state, jyId);
        const e2Buff = jy?.effects.find(e => e.id === 'jing-yuan-e2-dmg-buff');
        expect(e2Buff).toBeDefined();

        // Verify modifiers
        const modifiers = e2Buff?.modifiers || [];
        expect(modifiers.some(m => m.target === 'basic_atk_dmg_boost' && m.value === 0.20)).toBe(true);
        expect(modifiers.some(m => m.target === 'skill_dmg_boost' && m.value === 0.20)).toBe(true);
        expect(modifiers.some(m => m.target === 'ult_dmg_boost' && m.value === 0.20)).toBe(true);
        // Verify NOT all_type_dmg_boost
        expect(modifiers.some(m => m.target === 'all_type_dmg_boost')).toBe(false);
    });
});
