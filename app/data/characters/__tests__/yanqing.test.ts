import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameState, IEvent } from '../../../simulator/engine/types';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { yanqing, yanqingHandlerFactory } from '../yanqing';
import { createUnitId } from '../../../simulator/engine/unitId';
import { Character, CharacterRotationConfig, SimulationConfig, Enemy } from '../../../types/index';

describe('彦卿 (Yanqing)', () => {
    let state: GameState;
    const charId = 'yanqing-test';
    const enemyId = 'enemy-test';

    beforeEach(() => {
        const charUnit = { ...yanqing, id: charId };

        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy',
            rank: 'Elite',
            baseStats: { hp: 1000, atk: 100, def: 100, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 100, effect_res: 0, effect_hit_rate: 0 },
            element: 'Physical',
            toughness: 100,
            baseRes: { Physical: 0, Fire: 0, Ice: 0, Lightning: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
            abilities: {
                basic: { id: 'e-basic', name: 'Basic', type: 'Basic ATK', description: 'desc', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: 'desc', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: 'desc', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: 'desc' },
                technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: 'desc' },
            },
            // weaknesses removed from Enemy
        };

        // Ensure enemyConfig matches
        const enemyConfig = {
            level: 80,
            maxHp: 1000,
            atk: 100,
            def: 100,
            spd: 100,
            toughness: 100,
        };

        const partyConfig: CharacterRotationConfig = {
            rotation: [],
            rotationMode: 'sequence',
            ultStrategy: 'immediate',
            ultCooldown: 0,
        };

        const config: SimulationConfig = {
            characters: [charUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Ice']),
            partyConfig: {
                members: [{ character: charUnit, config: partyConfig, enabled: true, eidolonLevel: 0 }]
            },
            enemyConfig: enemyConfig,
            rounds: 5
        };

        state = createInitialGameState(config);

        // Mock currentActionLog for tests
        state.currentActionLog = {
            actionId: 'test-action',
            primarySourceId: charId,
            primarySourceName: 'Yanqing',
            primaryActionType: 'SKILL',
            startTime: 0,
            primaryDamage: { hitDetails: [], totalDamage: 0 },
            additionalDamage: [],
            damageTaken: [],
            healing: [],
            shields: [],
            dotDetonations: [],
            equipmentEffects: [],
            resourceChanges: [],
        };

        // Register Handler
        const factory = yanqingHandlerFactory(charId, 80, 0);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;

        // Trigger Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId: charId } as any, state, factory.handlerMetadata.id);
    });


    it('should apply Soulsteel Sync after using Skill', () => {
        const factory = yanqingHandlerFactory(charId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Simulate Skill Action
        state.currentActionLog = {
            ...state.currentActionLog,
            primaryActionType: 'SKILL',
            primaryTargetId: enemyId,
            sourceId: charId,
            additionalDamage: [], // Explicitly ensure array exists
        } as any;

        state = factory.handlerLogic({ type: 'ON_ACTION_COMPLETE', sourceId: charId } as any, state, handlerId);

        const unit = state.registry.get(createUnitId(charId))!;
        const sync = unit.effects.find(e => e.name === '智剣連心');
        expect(sync).toBeDefined();

        // Crit Rate check (Base 20 at Lv10)
        const crMod = sync?.modifiers?.find(m => m.target === 'crit_rate');
        expect(crMod?.value).toBeGreaterThan(0.19); // Approx 0.20
    });

    it('should remove Soulsteel Sync when taking HP damage', () => {
        const factory = yanqingHandlerFactory(charId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // 1. Skill to Apply Sync
        state.currentActionLog = {
            ...state.currentActionLog,
            primaryActionType: 'SKILL',
            primaryTargetId: enemyId,
            sourceId: charId,
            additionalDamage: [],
        } as any;
        state = factory.handlerLogic({ type: 'ON_ACTION_COMPLETE', sourceId: charId } as any, state, handlerId);

        let unit = state.registry.get(createUnitId(charId))!;
        expect(unit.effects.some(e => e.name === '智剣連心')).toBeTruthy();

        // 2. Take Damage (ON_DAMAGE_DEALT, Target = Yanqing, HP dropped)
        state = factory.handlerLogic({
            type: 'ON_DAMAGE_DEALT',
            sourceId: enemyId,
            targetId: charId,
            value: 100,
            previousHpRatio: 1.0,
            currentHpRatio: 0.9, // HP Dropped
        } as any, state, handlerId);

        unit = state.registry.get(createUnitId(charId))!;
        expect(unit.effects.some(e => e.name === '智剣連心')).toBeFalsy();
    });

    it('should NOT remove Soulsteel Sync when taking 0 HP damage (Shield)', () => {
        const factory = yanqingHandlerFactory(charId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Apply Sync
        state.currentActionLog = { ...state.currentActionLog, primaryActionType: 'SKILL', primaryTargetId: enemyId, sourceId: charId } as any;
        state = factory.handlerLogic({ type: 'ON_ACTION_COMPLETE', sourceId: charId } as any, state, handlerId);

        // Take 0 HP Damage (Shield took it all)
        state = factory.handlerLogic({
            type: 'ON_DAMAGE_DEALT',
            sourceId: enemyId,
            targetId: charId,
            value: 1000,
            previousHpRatio: 1.0,
            currentHpRatio: 1.0, // HP Stayed same
        } as any, state, handlerId);

        const unit = state.registry.get(createUnitId(charId))!;
        expect(unit.effects.some(e => e.name === '智剣連心')).toBeTruthy();
    });

    it('should trigger Talent Follow-up Attack (Mocked 100%)', () => {
        const factory = yanqingHandlerFactory(charId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Mock Math.random to return 0 (Success for any rate > 0)
        vi.spyOn(Math, 'random').mockReturnValue(0.01);

        // Apply Sync
        state.currentActionLog = { ...state.currentActionLog, primaryActionType: 'SKILL', primaryTargetId: enemyId, sourceId: charId } as any;
        state = factory.handlerLogic({ type: 'ON_ACTION_COMPLETE', sourceId: charId } as any, state, handlerId);

        // Check if FUA triggered logic is called?
        // Yanqing FUA logic is inside ON_ACTION_COMPLETE. 
        // We already called it above for Skill application. FUA also triggers after attacking.
        // Wait, did I implement FUA trigger on "After attacking"? Yes, ON_ACTION_COMPLETE.
        // So the Skill usage itself can trigger FUA.
        // Let's verify if "Combined Damage" in log or "Additional Damage" includes FUA.

        // To properly test FUA, we need to inspect state changes (like Energy) or logs.
        // FUA restores 10 Energy. Skill restores 30. Total should be 40 + Initial (or 0 -> 40).
        // Initial state EP might be 0 or 70 (half). Let's check diff.

        const unitBefore = state.registry.get(createUnitId(charId))!;
        const epBefore = unitBefore.ep;

        // Reset state for clean test of Basic Atk -> FUA
        // But need Sync active.
        // So:
        // 1. Skill (Apply Sync) -> may trigger FUA.
        // 2. Next turn Basic (With Sync) -> trigger FUA clearly.

        // Let's try simulating Basic Attack with Sync active.
        state.currentActionLog = {
            ...state.currentActionLog,
            primaryActionType: 'BASIC',
            primaryTargetId: enemyId,
            sourceId: charId,
            additionalDamage: [],
        } as any;
        state = factory.handlerLogic({ type: 'ON_ACTION_COMPLETE', sourceId: charId } as any, state, handlerId);

        // Check logs for FUA entry
        // Since we mocked random to 0.01, it should trigger (60% chance).
        // Note: applyUnifiedDamage adds entries to log.
        // However, in test environment, `applyUnifiedDamage` is real from dispatcher, so it relies on `state.log`.
        // `applyUnifiedDamage` returns state with updated log.

        // Since we are not fully mocking dispatcher, we can check if Frozen effect is applied to enemy
        // Because FUA applies Frozen (65% base chance).
        // Math.random is 0.01, so chance check passes.

        const enemy = state.registry.get(createUnitId(enemyId))!;
        const frozen = enemy.effects.find(e => e.type === 'Frozen');
        expect(frozen).toBeDefined();

        // Also check EP gain: Basic (20) + FUA (10) = 30.
        // Since we bypassed Basic Attack core logic, only FUA EP (10) is added.
        const unitAfter = state.registry.get(createUnitId(charId))!;
        expect(unitAfter.ep).toBe(epBefore + 10);
    });

    it('should buff Ultimate Crit Rate', () => {
        const factory = yanqingHandlerFactory(charId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Trigger Ult Used
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId: charId } as any, state, handlerId);

        const unit = state.registry.get(createUnitId(charId))!;
        const ultBuff = unit.effects.find(e => e.id.includes('ult-crit-rate'));
        expect(ultBuff).toBeDefined();
        expect(ultBuff?.modifiers?.[0].value).toBe(0.60);
    });

});
