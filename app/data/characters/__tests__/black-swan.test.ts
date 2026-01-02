
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { blackSwan, blackSwanHandlerFactory } from '../black-swan';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { GameState, ActionEvent, Unit } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { Character, Enemy, SimulationConfig } from '../../../types/index';

describe('Black Swan Debuff Duration Test', () => {
    let state: GameState;
    const sourceId = 'black_swan-test';
    const enemyId = 'enemy-test';

    beforeEach(() => {
        const bsUnit: Character = { ...blackSwan, id: sourceId, name: 'BlackSwan' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Test Enemy',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Wind',
            toughness: 100,
            baseRes: {},
            abilities: {} as any
        };

        const config: SimulationConfig = {
            characters: [bsUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Wind']),
            partyConfig: {
                members: [{
                    character: bsUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register handler
        const factory = blackSwanHandlerFactory(sourceId, 80, 0);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;

        // Trigger Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, factory.handlerMetadata.id);
    });

    it('Epiphany (Ultimate) should last 2 FULL enemy turns (TURN_END_BASED)', () => {
        const factory = blackSwanHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // 1. Use Ultimate to apply Epiphany
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        let enemy = state.registry.get(createUnitId(enemyId));
        let epiphany = enemy?.effects.find(e => e.name === '開示');

        expect(epiphany).toBeDefined();
        // Initial duration should be 2
        expect(epiphany?.duration).toBe(2);

        // Mock State Update for Turn Processing
        // We need to simulate Turn End for the Enemy.
        // The Simulation engine handles decrementing. We are testing the Definition, so we check duration type.

        expect(epiphany?.durationType).toBe('TURN_END_BASED');
        expect(epiphany?.skipFirstTurnDecrement).toBe(true);
    });

    it('Def Down (Skill) should last 3 FULL enemy turns (TURN_END_BASED)', () => {
        const factory = blackSwanHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // 1. Use Skill to apply Def Down
        state = factory.handlerLogic({ type: 'ON_SKILL_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        let enemy = state.registry.get(createUnitId(enemyId));
        let defDown = enemy?.effects.find(e => e.name === '防御力ダウン');

        expect(defDown).toBeDefined();
        expect(defDown?.duration).toBe(3);

        expect(defDown?.durationType).toBe('TURN_END_BASED');
        expect(defDown?.skipFirstTurnDecrement).toBe(true);
    });
});
