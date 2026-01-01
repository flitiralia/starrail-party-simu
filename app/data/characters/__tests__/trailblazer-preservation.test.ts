import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, ActionEvent } from '../../../simulator/engine/types';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { trailblazerPreservation, trailblazerPreservationHandlerFactory } from '../trailblazer-preservation';
import { march7th, march7thHandlerFactory } from '../march-7th';
import { createUnitId } from '../../../simulator/engine/unitId';
import { SimulationConfig, Enemy } from '../../../types/index';

describe('開拓者-存護 (Trailblazer Preservation)', () => {
    let state: GameState;
    const charId = 'tb-pres';
    const enemyId = 'enemy-0';

    beforeEach(() => {
        const tbUnit = { ...trailblazerPreservation, id: charId };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy',
            baseStats: { hp: 10000, atk: 500, def: 200, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Fire',
            toughness: 100,
            baseRes: {},
            abilities: {
                basic: { id: 'e-b', name: 'B', type: 'Basic ATK', description: '' },
                skill: { id: 'e-s', name: 'S', type: 'Skill', description: '' },
                ultimate: { id: 'e-u', name: 'U', type: 'Ultimate', description: '' },
                talent: { id: 'e-t', name: 'T', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Te', type: 'Technique', description: '' }
            }
        };

        const config: SimulationConfig = {
            characters: [tbUnit],
            enemies: [enemyUnit],
            weaknesses: new Set([]),
            partyConfig: {
                members: [{ character: tbUnit, config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 6 }]
            },
            enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register TB Handler
        const tbFactory = trailblazerPreservationHandlerFactory(charId, 80, 0);
        state.eventHandlers.push(tbFactory.handlerMetadata);
        state.eventHandlerLogics[tbFactory.handlerMetadata.id] = tbFactory.handlerLogic;

        // Trigger Battle Start
        state = tbFactory.handlerLogic({ type: 'ON_BATTLE_START', sourceId: charId } as any, state, tbFactory.handlerMetadata.id);
    });

    it('should gain "Magma Will" stacks from Battle Start (E4)', () => {
        const unit = state.registry.get(createUnitId(charId))!;
        const stacks = unit.effects.find(e => e.id.includes('magma-will'))?.stackCount || 0;
        expect(stacks).toBe(4);
    });

    it('should provide shields to all allies after an action', () => {
        const factory = trailblazerPreservationHandlerFactory(charId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Simulate Action Start/End
        state.currentActionLog = {
            primaryActionType: 'BASIC',
            primaryTargetId: enemyId,
            sourceId: charId,
            details: [],
            shields: [],
            healing: [],
            additionalDamage: [],
            damageTaken: []
        } as any;
        state = factory.handlerLogic({ type: 'ON_ACTION_COMPLETE', sourceId: charId } as any, state, handlerId);

        const tb = state.registry.get(createUnitId(charId))!;
        expect(tb.shield).toBeGreaterThan(0);
    });

    it('should gain stacks when hit', () => {
        const factory = trailblazerPreservationHandlerFactory(charId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        const initialUnit = state.registry.get(createUnitId(charId))!;
        const initialStacks = initialUnit.effects.find(e => e.id.includes('magma-will'))?.stackCount || 0;

        // Simulate hit
        state = factory.handlerLogic({
            type: 'ON_BEFORE_DAMAGE_RECEIVED',
            targetId: charId,
            sourceId: enemyId,
            value: 100
        } as any, state, handlerId);

        const unitAfter = state.registry.get(createUnitId(charId))!;
        const stacksAfter = unitAfter.effects.find(e => e.id.includes('magma-will'))?.stackCount || 0;
        expect(stacksAfter).toBe(initialStacks + 1);
    });

    it('should consume 4 stacks for Enhanced Basic when Magma Will >= 4', () => {
        const factory = trailblazerPreservationHandlerFactory(charId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // At 4 stacks, it should be enhanced and consume 4
        state.currentActionLog = {
            primaryActionType: 'BASIC',
            primaryTargetId: enemyId,
            sourceId: charId,
            details: [],
            shields: [],
            healing: [],
            additionalDamage: [],
            damageTaken: []
        } as any;
        state = factory.handlerLogic({ type: 'ON_ACTION_COMPLETE', sourceId: charId } as any, state, handlerId);

        const tbAfter = state.registry.get(createUnitId(charId))!;
        const stacksAfter = tbAfter.effects.find(e => e.id.includes('magma-will'))?.stackCount || 0;
        expect(stacksAfter).toBe(0);
    });
});
