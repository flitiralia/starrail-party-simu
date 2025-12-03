import { createInitialGameState } from '../engine/gameState';
import { march7th, march7thHandlerFactory } from '../../data/characters/march-7th';
import { registry } from '../registry/index';
import { Enemy, Element } from '../../types/index';
import { addEffect } from '../engine/effectManager';
import { IEffect } from '../effect/types';
import { dispatch } from '../engine/dispatcher';

// Register March 7th
registry.registerCharacter('march-7th', march7thHandlerFactory);

// Mock Enemy
const mockEnemy: Enemy = {
    id: 'enemy-1',
    name: 'Mock Enemy',
    element: 'Imaginary',
    baseStats: { hp: 10000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 100 },
    baseRes: {},
    toughness: 100,
    abilities: {
        basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', description: '', targetType: 'single_enemy', toughnessReduction: 10 },
        skill: { id: 'skill', name: 'Skill', type: 'Skill', description: '', targetType: 'single_enemy', toughnessReduction: 20 },
        ultimate: { id: 'ult', name: 'Ult', type: 'Ultimate', description: '', targetType: 'single_enemy', toughnessReduction: 30 },
        talent: { id: 'talent', name: 'Talent', type: 'Talent', description: '', targetType: 'self', toughnessReduction: 0 },
        technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '', targetType: 'self', toughnessReduction: 0 }
    }
};

async function testMarchCleanse() {
    console.log('--- Test: March 7th Cleanse (Trace: Purify) ---');

    // Setup State
    let state = createInitialGameState({
        characters: [march7th],
        enemies: [mockEnemy],
        weaknesses: new Set<Element>(['Ice']),
        enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
        rounds: 5,
        partyConfig: {
            members: [{ character: march7th, config: { rotation: ['Skill'], ultStrategy: 'cooldown' as const, ultCooldown: 0 }, enabled: true, eidolonLevel: 0 }]
        }
    });

    // Apply a Debuff to March 7th (Self Cleanse test)
    const debuff: IEffect = {
        id: 'test-debuff',
        name: 'Test Debuff',
        category: 'DEBUFF',
        sourceUnitId: mockEnemy.id,
        durationType: 'TURN_END_BASED',
        duration: 2,
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    state = addEffect(state, march7th.id, debuff);

    // Verify Debuff is present
    let marchUnit = state.units.find(u => u.id === march7th.id)!;
    const hasDebuff = marchUnit.effects.some(e => e.id === 'test-debuff');
    console.log(`Debuff present before skill: ${hasDebuff}`);
    if (!hasDebuff) {
        console.error('FAIL: Debuff was not applied correctly.');
        process.exit(1);
    }

    // Dispatch Skill Action
    console.log('Dispatching Skill...');
    state = dispatch(state, {
        type: 'SKILL',
        sourceId: march7th.id,
        targetId: march7th.id
    });

    // Verify Debuff is removed
    marchUnit = state.units.find(u => u.id === march7th.id)!;
    const hasDebuffAfter = marchUnit.effects.some(e => e.id === 'test-debuff');
    console.log(`Debuff present after skill: ${hasDebuffAfter}`);

    // Check Log for Cleanse entry
    const cleanseLog = state.log.find(l => l.actionType === 'Cleanse');
    console.log(`Cleanse Log found: ${!!cleanseLog}`);
    if (cleanseLog) {
        console.log(`Log Details: ${cleanseLog.details}`);
    }

    if (!hasDebuffAfter && cleanseLog) {
        console.log('SUCCESS: March 7th Cleanse works correctly.');
    } else {
        console.log('All Logs:', JSON.stringify(state.log, null, 2));
        console.error('FAIL: Cleanse failed.');
        process.exit(1);
    }
}

testMarchCleanse();
