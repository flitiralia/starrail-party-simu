import { describe, expect, test, beforeEach } from 'vitest';
import { sparkle, sparkleHandlerFactory } from '../sparkle';
import { seele, seeleHandlerFactory } from '../seele';
import { GameState, Unit, ActionEvent, CurrentActionLog } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { addEffect } from '../../../simulator/engine/effectManager';
import { SimulationConfig, Character, Enemy } from '../../../types/index';
import { addSkillPoints } from '../../../simulator/effect/relicEffectHelpers';

describe('Sparkle (Hanabi) Implementation', () => {
    let state: GameState;
    const sparkleId = 'sparkle-test';
    const seeleId = 'seele-test';
    const enemyId = 'enemy-test';

    beforeEach(() => {
        const sparkleUnit: Character = { ...sparkle, id: sparkleId, name: 'Sparkle' };
        const seeleUnit: Character = { ...seele, id: seeleId, name: 'Seele' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy',
            baseStats: { hp: 10000, atk: 500, def: 200, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Physical',
            toughness: 100,
            baseRes: {},
            abilities: {
                basic: { id: 'e-basic', name: 'Enemy Basic', type: 'Basic ATK', description: '' },
                skill: { id: 'e-skill', name: 'Enemy Skill', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: 'Enemy Ult', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: 'Enemy Talent', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Enemy Tech', type: 'Technique', description: '' }
            }
        };

        const config: SimulationConfig = {
            characters: [sparkleUnit, seeleUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Quantum']),
            partyConfig: {
                members: [
                    { character: sparkleUnit, config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 0 },
                    { character: seeleUnit, config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 0 }
                ]
            },
            enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register handlers
        const sFactory = sparkleHandlerFactory(sparkleId, 80, 0);
        state.eventHandlers.push(sFactory.handlerMetadata);
        state.eventHandlerLogics[sFactory.handlerMetadata.id] = sFactory.handlerLogic;

        const seFactory = seeleHandlerFactory(seeleId, 80, 0);
        state.eventHandlers.push(seFactory.handlerMetadata);
        state.eventHandlerLogics[seFactory.handlerMetadata.id] = seFactory.handlerLogic;

        // Trigger Battle Start
        state = sFactory.handlerLogic({ type: 'ON_BATTLE_START', sourceId: sparkleId } as any, state, sFactory.handlerMetadata.id);
    });

    test('Technique recovers 3 SP at Battle Start and Sets Max SP', () => {
        // Technically handled in beforeEach via ON_BATTLE_START if technique enabled.
        // Default technique is enabled.
        // Base 5 + Talent 2 = 7.
        expect(state.maxSkillPoints).toBe(7);
        // Default SP is 3. +3 = 6.
        expect(state.skillPoints).toBe(6);
    });

    test('Skill buffs Crit DMG (Ally)', () => {
        const factory = sparkleHandlerFactory(sparkleId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Use Skill on Seele
        state = factory.handlerLogic({
            type: 'ON_SKILL_USED',
            sourceId: sparkleId,
            targetId: seeleId
        } as ActionEvent, state, handlerId);

        const unit = state.registry.get(createUnitId(seeleId));
        const buff = unit?.effects.find(e => e.id.includes('sparkle-skill-cdmg'));

        expect(buff).toBeDefined();
        // Check Duration
        // E0 A2? No A4? Default config has no traces usually unless specified.
        // Need to check if createInitialGameState initializes traces. It maps character.traces.
        // So Has A4 checks traces access.
    });

    test('Ultimate recovers SP and applies Cipher', () => {
        state.skillPoints = 0;
        const factory = sparkleHandlerFactory(sparkleId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        state = factory.handlerLogic({
            type: 'ON_ULTIMATE_USED',
            sourceId: sparkleId,
            targetId: sparkleId
        } as ActionEvent, state, handlerId);

        expect(state.skillPoints).toBe(4); // Base

        const unit = state.registry.get(createUnitId(seeleId));
        const cipher = unit?.effects.find(e => e.id.includes('sparkle-cipher'));
        expect(cipher).toBeDefined();
    });

    test('Talent boosts DMG on SP Consumption', () => {
        const factory = sparkleHandlerFactory(sparkleId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Simulate Seele consuming 1 SP manually via event
        const spConsumeEvent = {
            type: 'ON_SP_CONSUMED',
            sourceId: seeleId,
            value: 1
        };

        state = factory.handlerLogic(spConsumeEvent as any, state, handlerId);

        // Verify Buff on Seele
        const unit = state.registry.get(createUnitId(seeleId));
        const buff = unit?.effects.find(e => e.id.includes('sparkle-talent-dmg'));

        expect(buff).toBeDefined();
        expect(buff?.stackCount).toBe(1);

        // Consume 2 more SP (Total 3 consumed logic should be checked)
        // Talent says "Whenever ... consumes SP". 
        // Logic implemented: adds stacks equal to amount consumed (capped at 3 total stacks in buff).
        // If consumption is 2, add 2 stacks.

        const spConsumeEvent2 = {
            type: 'ON_SP_CONSUMED',
            sourceId: seeleId,
            value: 2
        };
        state = factory.handlerLogic(spConsumeEvent2 as any, state, handlerId);

        const unit2 = state.registry.get(createUnitId(seeleId));
        const buff2 = unit2?.effects.find(e => e.id.includes('sparkle-talent-dmg'));
        expect(buff2?.stackCount).toBe(3); // 1 + 2 = 3
    });
});
