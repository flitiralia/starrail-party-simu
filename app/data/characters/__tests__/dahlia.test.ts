
import { describe, it, expect, beforeEach, test } from 'vitest';
import { dahlia, dahliaHandlerFactory } from '../dahlia';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { GameState, ActionEvent, CurrentActionLog, Unit, IEvent, DamageDealtEvent } from '../../../simulator/engine/types';
import { IEffect } from '../../../simulator/effect/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { Character, Enemy, SimulationConfig } from '../../../types/index';

describe('Dahlia Character Implementation', () => {
    let state: GameState;
    const sourceId = 'dahlia-test';
    const partnerId = 'partner-test';
    const enemyId = 'enemy-test';

    beforeEach(() => {
        const dahliaUnit: Character = { ...dahlia, id: sourceId, name: 'Dahlia' };
        const partnerUnit: Character = {
            id: partnerId,
            name: 'Partner',
            baseStats: { hp: 1000, atk: 1000, def: 1000, spd: 110, critRate: 0.05, critDmg: 0.5, aggro: 100 },
            element: 'Fire',
            abilities: { basic: { id: 'p-b', name: 'PB' } } as any,
            maxEnergy: 100,
            traces: [],
            path: 'Harmony',
            rarity: 5
        };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy 1',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 0 },
            element: 'Fire',
            toughness: 100,
            baseRes: {},
            abilities: { basic: { id: 'e-b', name: 'EB' }, skill: { id: 'e-s', name: 'ES' }, ultimate: { id: 'e-u', name: 'EU' }, talent: { id: 'e-t', name: 'ET' }, technique: { id: 'e-tec', name: 'ETec' } } as any
        };

        const config: SimulationConfig = {
            characters: [dahliaUnit, partnerUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Fire']),
            partyConfig: {
                members: [
                    { character: dahliaUnit, config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 6 },
                    { character: partnerUnit, config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 0 }
                ]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register dahlia handler
        const factory = dahliaHandlerFactory(sourceId, 80, 6);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;

        // Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, factory.handlerMetadata.id);
    });

    test('Talent should determine Dance Partner (highest BE)', () => {
        const partner = state.registry.get(createUnitId(partnerId));
        const partnerEffect = partner?.effects.find(e => e.id.includes('dahlia-partner'));
        expect(partnerEffect).toBeDefined();
    });

    test('Skill should apply Barrier and Decadence', () => {
        const factory = dahliaHandlerFactory(sourceId, 80, 6);
        const handlerId = factory.handlerMetadata.id;

        // Use Skill
        state = factory.handlerLogic({ type: 'ON_SKILL_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        // Check Barrier on Dahlia
        const dahliaUnit = state.registry.get(createUnitId(sourceId));
        expect(dahliaUnit?.effects.find(e => e.id.includes('dahlia-barrier'))).toBeDefined();

        // Check Decadence on Enemy
        const enemy = state.registry.get(createUnitId(enemyId));
        expect(enemy?.effects.find(e => e.id.includes('dahlia-decadence'))).toBeDefined();
    });

    test('Talent Follow-up Attack trigger (once per action)', () => {
        const factory = dahliaHandlerFactory(sourceId, 80, 6);
        const handlerId = factory.handlerMetadata.id;

        // Simulate Partner Attack (Hit 0)
        const damageEvent: DamageDealtEvent = {
            type: 'ON_DAMAGE_DEALT',
            sourceId: partnerId,
            targetId: enemyId,
            value: 1000,
            damageType: 'basic',
            hitDetails: [{ hitIndex: 0 } as any]
        };

        state = factory.handlerLogic(damageEvent, state, handlerId);

        // Expect FUA in pendingActions (5 + 5 for E6)
        expect(state.pendingActions.length).toBe(10);
        expect(state.pendingActions[0].type).toBe('FOLLOW_UP_ATTACK');

        // Simulate Hit 1 (should NOT trigger again)
        const hit1Event = { ...damageEvent, hitDetails: [{ hitIndex: 1 } as any] };
        state = factory.handlerLogic(hit1Event, state, handlerId);
        expect(state.pendingActions.length).toBe(10);
    });

    test('Ultimate should apply Fire weakness', () => {
        const factory = dahliaHandlerFactory(sourceId, 80, 6);
        const handlerId = factory.handlerMetadata.id;

        // Use Ult
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId } as ActionEvent, state, handlerId);

        const enemy = state.registry.get(createUnitId(enemyId));
        expect(enemy?.weaknesses.has('Fire')).toBe(true);
    });

    test('E4: SP recovery when FUA triggered 2 times', () => {
        const factory = dahliaHandlerFactory(sourceId, 80, 6);
        const handlerId = factory.handlerMetadata.id;
        state.skillPoints = 3;

        const damageEvent: DamageDealtEvent = {
            type: 'ON_DAMAGE_DEALT',
            sourceId: partnerId,
            targetId: enemyId,
            value: 1000,
            damageType: 'basic',
            hitDetails: [{ hitIndex: 0 } as any]
        };

        // 2 FUAs (1st action triggers 10 FUA actions, but we count the TRIGGER for SP)
        // Wait, the logic in dahlia.ts counts the TRIGGER (ON_DAMAGE_DEALT entering the block)
        state = factory.handlerLogic(damageEvent, state, handlerId);
        expect(state.skillPoints).toBe(3); // First trigger (fuaCountForSp = 1)

        state = factory.handlerLogic(damageEvent, state, handlerId);
        expect(state.skillPoints).toBe(4); // Second trigger (fuaCountForSp = 0, SP+1)
    });

    test('A2 Trace: Buff applied on healing received', () => {
        const factory = dahliaHandlerFactory(sourceId, 80, 6);
        const handlerId = factory.handlerMetadata.id;

        // Reset turn state
        state = factory.handlerLogic({ type: 'ON_TURN_START', sourceId } as any, state, handlerId);

        // Receive heal
        state = factory.handlerLogic({ type: 'ON_UNIT_HEALED', targetId: sourceId, healingDone: 100 } as any, state, handlerId);

        const partner = state.registry.get(createUnitId(partnerId));
        expect(partner?.effects.find(e => e.id.includes('dahlia-a2-buff'))).toBeDefined();
    });

    test('A6 Trace: Fire weakness application bonuses', () => {
        const factory = dahliaHandlerFactory(sourceId, 80, 6);
        const handlerId = factory.handlerMetadata.id;

        const initialEp = state.registry.get(createUnitId(sourceId))?.ep || 0;
        const targetEnemy = state.registry.get(createUnitId(enemyId))!;
        const initialToughness = targetEnemy.toughness;

        // Partner applies Fire weakness
        const effect: IEffect = {
            id: 'dummy-fire-weakness',
            name: '弱点付与: Fire',
            category: 'DEBUFF',
            sourceUnitId: partnerId,
            miscData: { element: 'Fire' },
            durationType: 'PERMANENT',
            duration: -1,
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        state = factory.handlerLogic({ type: 'ON_EFFECT_APPLIED', targetId: enemyId, effect, sourceId: partnerId } as any, state, handlerId);

        const dahliaUnit = state.registry.get(createUnitId(sourceId))!;
        expect(dahliaUnit.effects.find(e => e.id.includes('dahlia-a6-spd'))).toBeDefined();
        expect(dahliaUnit.ep).toBeGreaterThan(initialEp);

        const enemy = state.registry.get(createUnitId(enemyId))!;
        expect(enemy.toughness).toBeLessThan(initialToughness);
    });

    test('E1: Additional toughness reduction on attack', () => {
        const factory = dahliaHandlerFactory(sourceId, 80, 6);
        const handlerId = factory.handlerMetadata.id;

        const targetEnemy = state.registry.get(createUnitId(enemyId))!;
        const initialToughness = targetEnemy.toughness;

        // Partner attacks
        const damageEvent: DamageDealtEvent = {
            type: 'ON_DAMAGE_DEALT',
            sourceId: partnerId,
            targetId: enemyId,
            value: 1000,
            damageType: 'basic',
            hitDetails: [{ hitIndex: 0, toughnessReduction: 10 } as any]
        };

        state = factory.handlerLogic(damageEvent, state, handlerId);

        const enemy = state.registry.get(createUnitId(enemyId))!;
        // Initial 100 - (100 * 0.25 E1 * 1.5 efficiency) = 100 - 37.5 = 62.5
        expect(enemy.toughness).toBe(62.5);
    });

    test('E6: Action Advance for Dance Partner', () => {
        const factory = dahliaHandlerFactory(sourceId, 80, 6);
        const handlerId = factory.handlerMetadata.id;

        const partnerUnit = state.registry.get(createUnitId(partnerId))!;
        const initialAV = partnerUnit.actionValue;

        // Partner attacks (triggers FUA)
        const damageEvent: DamageDealtEvent = {
            type: 'ON_DAMAGE_DEALT',
            sourceId: partnerId,
            targetId: enemyId,
            value: 1000,
            damageType: 'basic',
            hitDetails: [{ hitIndex: 0 } as any]
        };

        state = factory.handlerLogic(damageEvent, state, handlerId);

        const updatedPartner = state.registry.get(createUnitId(partnerId))!;
        expect(updatedPartner.actionValue).toBeLessThan(initialAV);
    });
});
