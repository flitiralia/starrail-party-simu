import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch, applyUnifiedDamage, publishEvent } from '../engine/dispatcher';
import { blade, bladeHandlerFactory } from '../../data/characters/blade';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId, UnitId } from '../engine/unitId';
import { consumeHp } from '../engine/utils';
import { stepSimulation } from '../engine/simulation';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Blade Scenario Test', () => {
    let initialState: GameState;
    const bladeId = 'blade-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        // Setup initial state with Blade and an Enemy
        const characters: Character[] = [{
            ...blade,
            id: bladeId,
        }];

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
        } as Enemy]; // Casting to avoid strict checks for now

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
            weaknesses: new Set(['Wind']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Blade's event handlers manually if simulation loop doesn't restart
        // (Typically createInitialGameState or BATTLE_START action registers them)
        // Let's assume we need to dispatch REGISTER_HANDLERS or BATTLE_START
        // Or if handlers are attached to Unit, check blade.ts used IEventHandlerFactory?
        // blade.ts exports `blade` object which has eidolons, etc. 
        // It seems `bladeHandlerFactory` is exported from blade.ts too.

        const { handlerMetadata, handlerLogic } = bladeHandlerFactory(bladeId, 80);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Dispatch BATTLE_START to trigger initial buffs (if any)
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    it('should gain charges when consuming HP and trigger Follow-Up Attack at 5 stacks', () => {
        let state = initialState;
        let bladeUnit = getUnit(state, bladeId);
        expect(bladeUnit).toBeDefined();

        // 1. Initial State: 1 Charge (from Technique usage in onBattleStart)
        const getCharges = (s: GameState) => {
            const u = getUnit(s, bladeId);
            const chargeEffect = u?.effects.find(e => e.id.includes('blade-charges'));
            return chargeEffect?.stackCount || 0;
        };
        expect(getCharges(state)).toBe(1);

        // 2. Use Skill (consumes HP)
        // This should trigger ON_SKILL_USED -> ON_HP_CONSUMED -> Charge +1
        state = dispatch(state, { type: 'SKILL', sourceId: bladeId, targetId: bladeId });

        // Verify Hellscape state (Skill Buff)
        const getHellscape = (s: GameState) => {
            const u = getUnit(s, bladeId);
            return u?.effects.find(e => e.id.includes('blade-hellscape'));
        };
        expect(getHellscape(state)).toBeDefined();

        // Verify Charge +1 (Total 2)
        expect(getCharges(state)).toBe(2);

        // 3. Simulate taking damage (Charge +1)
        const enemy = getUnit(state, enemyId);
        // We use applyUnifiedDamage or just dispatch an attack from enemy
        // Let's manually trigger damage to ensure expected behavior without RNG
        // Or better, publish ON_DAMAGE_DEALT? No, damage must be applied to trigger handler.
        // Let's use applyUnifiedDamage directly or simulating an enemy attack action.

        // Simulating enemy attack:
        state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: enemyId, targetId: bladeId });

        // Verify Charge +1 (Total 3)
        expect(getCharges(state)).toBe(3);

        // 4. Manually consume HP to reach 4 stacks (Skill consumed once, Hit once. Need 2 more to reach 4)
        // consumeHp helper returns { state, consumed }
        // We need to verify ON_HP_CONSUMED event is fired. `consumeHp` does NOT fire event automatically usually?
        // Checking `utils.ts`: consumeHp DOES fire ON_HP_CONSUMED via publishEvent. Great.

        // Stack 4
        let res = consumeHp(state, bladeId, bladeId, 0.1, 'Test Consumtpion 1');
        state = res.state;
        expect(getCharges(state)).toBe(4);

        // Stack 5 (Trigger FuA)
        res = consumeHp(state, bladeId, bladeId, 0.1, 'Test Consumption 2');
        state = res.state;
        // expect(getCharges(state)).toBe(4); // Removed intermediate check as it might trigger immediately or stay at 5 depending on implementation

        // 5. Trigger the 5th stack to launch Follow-Up Attack
        // The Follow-Up Attack (FuA) is usually queued in `pendingActions`.

        // Stack 5 handling
        // Check pending actions directly
        // res = consumeHp(state, bladeId, bladeId, 0.1, 'Test Consumption 3');
        // state = res.state;

        // Verify Pending Action
        // Blade's handler should have pushed a FOLLOW_UP_ATTACK action to pendingActions state
        expect(state.pendingActions.length).toBeGreaterThan(0);
        const fuaAction = state.pendingActions.find(a => a.type === 'FOLLOW_UP_ATTACK' && a.sourceId === bladeId);
        expect(fuaAction).toBeDefined();

        // 6. Execute Pending Actions (Simulation Loop does this via stepSimulation, but we are using dispatch directly)
        // We need to manually dispatch the pending action to verify execution effect (reset charges)
        if (fuaAction) {
            state = dispatch(state, fuaAction);
        }

        // 7. Verify Charges Reset
        expect(getCharges(state)).toBe(0);

        // Verify FuA happened (check logs or damage happened)
        // Since we didn't mock random, verifying exact damage is hard, but we can check if Action Log has "Talent" or similar
        // Or check if enemy HP decreased (FuA is AoE)
        const enemyUnit = getUnit(state, enemyId);
        expect(enemyUnit?.hp).toBeLessThan(100000); // Should have taken damage from FuA
    });
    it('should allow Enhanced Basic Attack for 4 turns (Turn 1 + 3 turns)', () => {
        let state = initialState;
        const getBlade = (s: GameState) => getUnit(s, bladeId);

        // --- Step 1: Advance until Blade's turn ---
        // Advance timeline until Blade acts
        let maxSteps = 100;
        while (state.actionQueue.length === 0 || state.actionQueue[0].unitId !== bladeId) {
            state = stepSimulation(state);
            maxSteps--;
            if (maxSteps <= 0) throw new Error('Blade never took a turn');
        }

        // --- Step 2: Use Skill (Turn 1) ---
        // Ensure state is set as "Blade's turn" by simulation, but stepSimulation returns BEFORE action execution.
        // We act on behalf of the character.
        // Important: `stepSimulation` sets `currentTurnOwnerId` in the state it returns if it reached an action phase.
        // Let's verify.

        // Actually stepSimulation returns state ready for input if it stops at action decision point? 
        // No, `stepSimulation` executes ONE action if automated, but for player characters it might wait? 
        // Our simulator `stepSimulation` executes automated actions. For player unit, we usually intercept or use dispatch.
        // But `stepSimulation` implementation calls `determineNextAction`. 
        // If we want to control it, we should interact with `actionQueue` directly or ensure `determineNextAction` picks what we want?
        // Or we just manually dispatch 'SKILL' and then 'ENHANCED_BASIC_ATTACK' while forcing `currentTurnOwnerId`.

        // Let's use the manual dispatch approach but with cleaner loop for turns

        // Force Turn Owner for correct buff application logic logic
        state = { ...state, currentTurnOwnerId: createUnitId(bladeId) };

        // Skill Action
        state = dispatch(state, { type: 'SKILL', sourceId: bladeId, targetId: bladeId });

        // Verify Hellscape applied
        let b = getBlade(state)!;
        let hellscape = b.effects.find(e => e.id.includes('blade-hellscape'));
        expect(hellscape).toBeDefined();
        expect(hellscape?.duration).toBe(3);

        // --- Turn 1 Attack (Immediate) ---
        state = dispatch(state, { type: 'ENHANCED_BASIC_ATTACK', sourceId: bladeId, targetId: enemyId });

        // Verify Hellscape still max duration (consumed 0 turns because it's same turn as applied)
        // However, "Turn End" hasn't happened yet in valid simulation flow.
        // We Must Simulate Turn End to decrement buffs.
        // `updateTurnEndState` is internal. 
        // Best proxy: Use `stepSimulation` to process "End of Turn".
        // But `dispatch` doesn't automatically trigger "End of Turn" fully if we just call it.
        // `simulation.ts` main loop does: determineAction -> dispatch -> updateTurnEndState.

        // So, correct way is to inject our choice into `determineNextAction` or config.
        // Let's change Blade's config to "spam_basic" (or use spam_skill logic).
        // For this test, manual state updates for turn end is most reliable without mocking huge parts.

        const simulateTurnEnd = (s: GameState, unitId: string) => {
            // Replicate minimal turn end logic for buff duration
            const u = getUnit(s, unitId)!;
            const newEffects = u.effects.map(e => {
                if (e.durationType !== 'TURN_END_BASED') return e;
                if (e.skipFirstTurnDecrement && e.appliedDuringTurnOf === unitId) {
                    return { ...e, appliedDuringTurnOf: undefined }; // Consume flag
                }
                return { ...e, duration: e.duration - 1 };
            }).filter(e => e.duration > 0);

            return {
                ...s,
                registry: s.registry.update(createUnitId(unitId), unit => ({ ...unit, effects: newEffects }))
            };
        };

        // End Turn 1
        state = simulateTurnEnd(state, bladeId);

        // Expect Duration still 3 (flag consumed)
        b = getBlade(state)!;
        hellscape = b.effects.find(e => e.id.includes('blade-hellscape'));
        expect(hellscape).toBeDefined();
        expect(hellscape?.duration).toBe(3);
        expect(hellscape?.appliedDuringTurnOf).toBeUndefined();

        // --- Turn 2 ---
        state = dispatch(state, { type: 'ENHANCED_BASIC_ATTACK', sourceId: bladeId, targetId: enemyId });
        state = simulateTurnEnd(state, bladeId);

        b = getBlade(state)!;
        hellscape = b.effects.find(e => e.id.includes('blade-hellscape'));
        expect(hellscape?.duration).toBe(2);

        // --- Turn 3 ---
        state = dispatch(state, { type: 'ENHANCED_BASIC_ATTACK', sourceId: bladeId, targetId: enemyId });
        state = simulateTurnEnd(state, bladeId);

        b = getBlade(state)!;
        hellscape = b.effects.find(e => e.id.includes('blade-hellscape'));
        expect(hellscape?.duration).toBe(1);

        // --- Turn 4 ---
        // Still has buff (duration 1)
        expect(hellscape).toBeDefined();

        state = dispatch(state, { type: 'ENHANCED_BASIC_ATTACK', sourceId: bladeId, targetId: enemyId });
        state = simulateTurnEnd(state, bladeId);

        // --- Turn 5 Start Check ---
        b = getBlade(state)!;
        hellscape = b.effects.find(e => e.id.includes('blade-hellscape'));
        expect(hellscape).toBeUndefined(); // Expired
    });
});
