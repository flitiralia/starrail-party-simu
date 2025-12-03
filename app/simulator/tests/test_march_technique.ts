import { march7th, march7thHandlerFactory } from '../../data/characters/march-7th';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { GameState, Unit } from '../engine/types';
import { SimulationConfig, EnemyConfig, PartyConfig } from '../../types/index';
import { registry } from '../registry/index';
// Mock Enemy
const mockEnemy: EnemyConfig = {
    id: 'enemy-1',
    name: 'Mock Enemy',
    level: 80,
    baseStats: {
        hp: 10000,
        atk: 1000,
        def: 1000,
        spd: 100,
        effect_res: 0,
    },
    baseRes: {},
    maxToughness: 100,
    toughness: 100,
    abilities: {
        basic: {
            id: 'enemy-basic',
            name: 'Enemy Attack',
            type: 'Basic ATK',
            targetType: 'single',
            damage: { type: 'simple', multiplier: 1.0, scaling: 'atk' }
        }
    },
    isEnemy: true,
};

// Register March
registry.registerCharacter('march-7th', march7thHandlerFactory);

// Setup Config
const config: SimulationConfig = {
    characters: [march7th],
    enemies: [mockEnemy],
    weaknesses: new Set(['Ice']),
    enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
    partyConfig: { members: [] }, // Not strictly needed for this test
    rounds: 1,
};

// Create Initial State
let state = createInitialGameState(config);

// Register Handlers
const factory = registry.getCharacterFactory('march-7th');
if (factory) {
    const { handlerMetadata, handlerLogic } = factory('march-7th', 80, 0); // E0
    state = dispatch(state, {
        type: 'REGISTER_HANDLERS',
        handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
    });
}

// Trigger Battle Start
console.log('--- Triggering Battle Start ---');
state = dispatch(state, { type: 'BATTLE_START' });

// Check for Freeze Effect on Enemy
const enemy = state.units.find(u => u.id === 'enemy-1');
const freezeEffect = enemy?.effects.find(e => e.name === '凍結 (秘技)');

if (freezeEffect) {
    console.log('SUCCESS: Enemy is frozen by Technique.');
} else {
    console.error('FAILURE: Enemy is NOT frozen.');
}

// Simulate Turn Start for Enemy (to check damage)
if (enemy) {
    console.log('--- Triggering Enemy Turn Start ---');
    // We manually trigger ON_TURN_START for the enemy to test the hook
    // In real simulation, stepSimulation does this.
    // But here we just want to test the handler logic.
    // The handler subscribes to ON_TURN_START.

    const initialHp = enemy.hp;
    state = dispatch(state, {
        type: 'REGISTER_HANDLERS', // Dummy action to trigger event publishing via side effect? No, dispatch doesn't publish arbitrary events directly.
        // We need to use publishEvent, but it's not exported or we can't call it easily from outside without an action.
        // Wait, dispatchInternal calls resolveAction etc.
        // We can simulate a turn start by calling the handler logic directly or mocking the event loop.
        // Or we can just run a step of simulation if we import stepSimulation.
        // Let's try to invoke the handler logic directly since we have it.
        handlers: []
    });

    // Invoke handler directly
    const handler = state.eventHandlerLogics[`march-7th-talent-march-7th`];
    if (handler) {
        state = handler({
            type: 'ON_TURN_START',
            sourceId: 'enemy-1',
            value: 0
        }, state, `march-7th-talent-march-7th`);
    }

    const newEnemy = state.units.find(u => u.id === 'enemy-1');
    if (newEnemy) {
        if (newEnemy.hp < initialHp) {
            console.log(`SUCCESS: Enemy took damage. HP: ${initialHp} -> ${newEnemy.hp}`);
            const damage = initialHp - newEnemy.hp;
            const expectedDamage = march7th.baseStats.atk * 0.5; // Base stats used in mock? No, createInitialGameState uses character stats.
            // march7th base atk is 511.
            // 511 * 0.5 = 255.5
            console.log(`Damage: ${damage}, Expected (approx): ${expectedDamage}`);
        } else {
            console.error('FAILURE: Enemy did NOT take damage.');
        }
    }
}
