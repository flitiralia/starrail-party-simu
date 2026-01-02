
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { mydeiHandlerFactory } from '../mydei';
import { createUnitId } from '../../../simulator/engine/unitId';
import { dispatch } from '../../../simulator/engine/dispatcher';
import { GameState, Action } from '../../../simulator/engine/types';
import { Character, Enemy, SimulationConfig } from '../../../types/index';
import { recalculateUnitStats } from '../../../simulator/statBuilder';

const MYDEI_ID = 'mydei';
const ENEMY_ID = 'enemy1';

describe('Mydei Character Implementation', () => {
    let state: GameState;

    beforeEach(() => {
        const mydei: Character = {
            id: MYDEI_ID,
            name: 'Mydei',
            path: 'Destruction',
            element: 'Imaginary',
            rarity: 5,
            maxEnergy: 160,
            baseStats: { hp: 1552, atk: 426, def: 194, spd: 95, critRate: 0.05, critDmg: 0.50, aggro: 125 },
            abilities: {
                basic: { id: 'm-basic', name: 'Basic', type: 'Basic ATK', description: '', targetType: 'single_enemy' },
                skill: { id: 'm-skill', name: 'Skill', type: 'Skill', description: '', targetType: 'blast', spCost: 1 },
                ultimate: { id: 'm-ult', name: 'Ult', type: 'Ultimate', description: '', targetType: 'blast' },
                talent: { id: 'm-talent', name: 'Talent', type: 'Talent', description: '', targetType: 'self' },
                technique: { id: 'm-tech', name: 'Tech', type: 'Technique', description: '', targetType: 'self' }
            },
            traces: [],
            effects: []
        };

        const enemy: Enemy = {
            id: ENEMY_ID,
            name: 'Test Enemy',
            baseStats: { hp: 10000, atk: 500, def: 200, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            abilities: {
                basic: { id: 'e-basic', name: 'Enemy Basic', type: 'Basic ATK', description: '' },
                skill: { id: 'e-skill', name: 'Enemy Skill', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: 'Enemy Ult', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: 'Enemy Talent', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Enemy Tech', type: 'Technique', description: '' }
            },
            toughness: 300,
            element: 'Physical',
            baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 }
        };

        const config: SimulationConfig = {
            characters: [mydei],
            enemies: [enemy],
            weaknesses: new Set(['Imaginary']),
            partyConfig: {
                members: [{
                    character: mydei,
                    config: { rotation: ['s', 'b'], ultStrategy: 'immediate', ultCooldown: 0, useTechnique: false },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 10000, toughness: 300, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Manually register Mydei's handler
        const { handlerMetadata, handlerLogic } = mydeiHandlerFactory(MYDEI_ID, 0);
        state = dispatch(state, {
            type: 'REGISTER_HANDLERS',
            handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
        });

        // Start battle to initialize handlers properly
        state = dispatch(state, { type: 'BATTLE_START' });
    });

    it('should gain charge when taking damage', () => {
        // Simulate damage dealt to Mydei
        // 1552 HP. 1% = 15.52.
        const damageAmount = 155.2; // 10% HP
        const event: any = {
            type: 'ON_DAMAGE_DEALT',
            sourceId: ENEMY_ID,
            targetId: MYDEI_ID,
            value: damageAmount,
            isCrit: false,
            abilityId: 'e-basic',
            element: 'Physical',
            damageType: 'Normal',
            healthBefore: 1552,
            healthAfter: 1552 - damageAmount
        };

        // There is no public dispatch for generic events in test utils usually, 
        // we use `dispatch` with `Action` or specialized event injection if supported.
        // Wait, `dispatch` handles Actions. To trigger event handlers, we need to mock internal event bus or use `simulateAction`?
        // Actually, `state.handlers` are triggered by `dispatcher.ts` internal logic.
        // But for unit testing logic, we can invoke the handler logic directly or construct an action that causes damage.
        // Constructing an enemy attack action is best.

        const action: Action = {
            type: 'BASIC_ATTACK',
            sourceId: ENEMY_ID,
            targetId: MYDEI_ID
        };
        // We need to ensure Enemy Basic deals damage.
        // My mocked enemy basic is 'simple' but default damage calculation logic requires proper definition.
        // The mock above lacks `damage` property on enemy basic ability.

        // Alternative: Use `handlerLogic` directly!
        const { handlerLogic } = mydeiHandlerFactory(MYDEI_ID, 0);
        state = handlerLogic(event, state, 'mydei-handler-mydei');

        const unit = state.registry.get(createUnitId(MYDEI_ID));
        const charge = unit?.effects.find(e => e.id === `mydei-charge-tracker-${MYDEI_ID}`);
        expect(charge).toBeDefined();
        expect(charge?.stackCount).toBeCloseTo(10, 0); // 10% lost -> 10 charge
        expect(charge?.name).toContain('10');
    });

    it('should enter Blood Retribution state at 100 charge', () => {
        // Mock handler
        const { handlerLogic } = mydeiHandlerFactory(MYDEI_ID, 0);

        // Trigger damage to gain 100 charge (100% HP? No, accumulating)
        // Or fake the charge update by simulating multiple hits or manually adding effect?
        // Let's use loop.
        const damageAmount = 155.2; // 10% -> 10 charge
        const event: any = {
            type: 'ON_DAMAGE_DEALT',
            sourceId: ENEMY_ID,
            targetId: MYDEI_ID,
            value: damageAmount,
            isCrit: false,
            abilityId: 'e-basic',
            element: 'Physical',
            damageType: 'Normal',
            healthBefore: 1552,
            healthAfter: 1552 - damageAmount
        };

        for (let i = 0; i < 10; i++) {
            state = handlerLogic(event, state, 'mydei-handler-mydei');
        }

        const unit = state.registry.get(createUnitId(MYDEI_ID));
        // Should have entered state. Charge should be 0 (100 consumed).
        const charge = unit?.effects.find(e => e.id === `mydei-charge-tracker-${MYDEI_ID}`);
        // Wait, if I gained 100, and logic consumes 100, I should have 0.
        // Depending on order.
        expect(charge?.stackCount).toBe(0);

        const bloodRetribution = unit?.effects.find(e => e.id === `mydei-blood-retribution-${MYDEI_ID}`);
        expect(bloodRetribution).toBeDefined();

        // Check Buffs
        const hpBuff = bloodRetribution?.modifiers?.find(m => m.target === 'hp_pct');
        expect(hpBuff?.value).toBe(0.50);

        const defBuff = bloodRetribution?.modifiers?.find(m => m.target === 'def_pct');
        expect(defBuff?.value).toBe(-1.0);

        // Check Action Advance
        const pending = state.pendingActions.find(a => a.type === 'ACTION_ADVANCE' && a.targetId === MYDEI_ID);
        expect(pending).toBeDefined();
        expect((pending as any).percent).toBe(1.0);
    });

    it('should swap skill to Auto Skill 1 on turn start in state', () => {
        // Force Enter State
        const { handlerLogic } = mydeiHandlerFactory(MYDEI_ID, 0);
        // Add buff manually
        let unit = state.registry.get(createUnitId(MYDEI_ID))!;
        state = {
            ...state,
            registry: state.registry.update(createUnitId(MYDEI_ID), u => ({
                ...u,
                effects: [...u.effects, {
                    id: `mydei-blood-retribution-${MYDEI_ID}`,
                    name: 'Blood Retribution',
                    category: 'BUFF',
                    sourceUnitId: MYDEI_ID,
                    durationType: 'PERMANENT',
                    duration: -1,
                    apply: (t, s) => s,
                    remove: (t, s) => s
                }]
            }))
        };

        // Trigger Turn Start
        const event: any = {
            type: 'ON_TURN_START',
            sourceId: MYDEI_ID,
            targetId: MYDEI_ID // irrelevant
        };
        state = handlerLogic(event, state, 'mydei-handler-mydei');

        unit = state.registry.get(createUnitId(MYDEI_ID))!;
        expect(unit.abilities.skill.id).toBe('mydei-auto-skill-1');
        expect(unit.abilities.skill.name).toBe('王を殺め王となる');
    });

    it('should trigger God Killer (Auto Skill 2) when Charge hits 150 in state', () => {
        const { handlerLogic } = mydeiHandlerFactory(MYDEI_ID, 0);

        // 1. Enter State
        let unit = state.registry.get(createUnitId(MYDEI_ID))!;
        state = {
            ...state,
            registry: state.registry.update(createUnitId(MYDEI_ID), u => ({
                ...u,
                effects: [...u.effects, {
                    id: `mydei-blood-retribution-${MYDEI_ID}`,
                    name: 'Blood Retribution',
                    category: 'BUFF',
                    sourceUnitId: MYDEI_ID,
                    durationType: 'PERMANENT',
                    duration: -1,
                    apply: (t, s) => s,
                    remove: (t, s) => s
                }]
            }))
        };

        // 2. Add 150 Charge
        // Manually or via logic. Logic wraps `updateCharge`.
        // We'll simulate damage to gain 150 charge.
        const damageAmount = 155.2 * 15; // 150% HP (impossible but simulated events work)
        const event: any = {
            type: 'ON_DAMAGE_DEALT',
            sourceId: ENEMY_ID,
            targetId: MYDEI_ID,
            value: damageAmount,
            isCrit: false,
            abilityId: 'e-basic',
            element: 'Physical',
            damageType: 'Normal',
            healthBefore: 1552 * 2, // Assume healed
            healthAfter: 1552 * 0.5
        };

        state = handlerLogic(event, state, 'mydei-handler-mydei');

        // Check Pending Action for Extra Turn
        const pending = state.pendingActions.find(a => a.type === 'ACTION_ADVANCE' && a.targetId === MYDEI_ID);
        expect(pending).toBeDefined();

        // Check "God Killer Pending" marker
        unit = state.registry.get(createUnitId(MYDEI_ID))!;
        const marker = unit.effects.find(e => e.id === `mydei-god-killer-pending-${MYDEI_ID}`);
        expect(marker).toBeDefined();

        // 3. Trigger Turn Start (Extra Turn)
        const turnEvent: any = {
            type: 'ON_TURN_START',
            sourceId: MYDEI_ID,
            targetId: MYDEI_ID
        };
        state = handlerLogic(turnEvent, state, 'mydei-handler-mydei');

        // Should have swapped to Auto Skill 2
        unit = state.registry.get(createUnitId(MYDEI_ID))!;
        expect(unit.abilities.skill.id).toBe('mydei-auto-skill-2');
        expect(unit.abilities.skill.name).toBe('神を殺め神となる');
    });

    it('should prevent death and exit state (A2/Talent)', () => {
        const { handlerLogic } = mydeiHandlerFactory(MYDEI_ID, 0);

        // 1. Enter State (Talent)
        let unit = state.registry.get(createUnitId(MYDEI_ID))!;
        // Add state effect manually
        state = {
            ...state,
            registry: state.registry.update(createUnitId(MYDEI_ID), u => ({
                ...u,
                effects: [...u.effects, {
                    id: `mydei-blood-retribution-${MYDEI_ID}`,
                    name: 'Blood Retribution',
                    category: 'BUFF',
                    sourceUnitId: MYDEI_ID,
                    durationType: 'PERMANENT',
                    duration: -1,
                    apply: (t, s) => s,
                    remove: (t, s) => s
                }]
            }))
        };

        // 2. Trigger Death Event
        const deathEvent: any = {
            type: 'ON_BEFORE_DEATH',
            targetId: MYDEI_ID,
            sourceId: MYDEI_ID, // added sourceId
            killerId: ENEMY_ID,
            preventDeath: false,
            healAmount: 0 // Initialize
        };

        // Need to ensure Trace A2 not active for Talent check, or A2 active for A2 Check.
        // Default has no traces. So this tests Talent mechanic.

        state = handlerLogic(deathEvent, state, 'mydei-handler-mydei');

        unit = state.registry.get(createUnitId(MYDEI_ID))!;

        // Should have exited state
        const inState = unit.effects.some(e => e.id === `mydei-blood-retribution-${MYDEI_ID}`);
        expect(inState).toBe(false);

        // Should be healed (HP 50%)
        // Note: Logic updates HP directly in registry.
        expect(unit.hp).toBeCloseTo(unit.stats.hp * 0.50);

        // Charge should be cleared
        const charge = unit.effects.find(e => e.id === `mydei-charge-tracker-${MYDEI_ID}`);
        expect(charge?.stackCount || 0).toBe(0);
    });

    it('should convert healing to charge (E2)', () => {
        // E2: 40% of heal amount -> Charge. Cap 40 per action.
        const { handlerLogic } = mydeiHandlerFactory(MYDEI_ID, 2); // E2

        // Simulate Healing.
        // Base HP 1552. Heal 1000 = 64% HP.
        // Convert Logic: (1000/1552*100) * 0.40 ~ 64 * 0.4 = 25.6 Charge.
        // This is safe under 40 cap.

        const healAmount = 1000;
        const expectedCharge = (healAmount / 1552 * 100) * 0.40;

        let unit = state.registry.get(createUnitId(MYDEI_ID))!;

        const healEvent: any = {
            type: 'ON_HEAL_RECEIVED',
            targetId: MYDEI_ID,
            sourceId: 'healer',
            value: healAmount
        };

        state = handlerLogic(healEvent, state, 'mydei-handler-mydei');

        unit = state.registry.get(createUnitId(MYDEI_ID))!;
        let charge = unit.effects.find(e => e.id === `mydei-charge-tracker-${MYDEI_ID}`);
        expect(charge?.stackCount).toBeCloseTo(expectedCharge, 1);

        // Test Cap (Cumulative)
        // Heal again huge amount.
        // 5000 Heal -> 322% HP -> 128 Charge.
        // Cap is 40. Already gained ~25.6. Remaining ~14.4.
        // Should cap at 40 total.

        const hugeHealEvent: any = {
            type: 'ON_HEAL_RECEIVED',
            targetId: MYDEI_ID,
            sourceId: 'healer',
            value: 5000
        };

        state = handlerLogic(hugeHealEvent, state, 'mydei-handler-mydei');

        unit = state.registry.get(createUnitId(MYDEI_ID))!;
        charge = unit.effects.find(e => e.id === `mydei-charge-tracker-${MYDEI_ID}`);

        // Total gained should be 40.
        expect(charge?.stackCount).toBeCloseTo(40, 0);

        // Reset check (Action Complete)
        const actionEvent: any = {
            type: 'ON_ACTION_COMPLETE',
            sourceId: MYDEI_ID,
            targetId: 'any'
        };
        state = handlerLogic(actionEvent, state, 'mydei-handler-mydei');

        // Tracker should be gone or reset.
        const tracker = unit.effects.find(e => e.id === `mydei-e2-tracker-${MYDEI_ID}`);
        // Logic removes it. 
        // Need to refetch unit from state though as `removeEffect` returns new state.
        unit = state.registry.get(createUnitId(MYDEI_ID))!;
        const remainingTracker = unit.effects.find(e => e.id === `mydei-e2-tracker-${MYDEI_ID}`);
        expect(remainingTracker).toBeUndefined();
    });
});
