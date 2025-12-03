import { march7th, march7thHandlerFactory } from '../../data/characters/march-7th';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { SimulationConfig, EnemyConfig } from '../../types/index';
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
    partyConfig: { members: [] },
    rounds: 1,
};

// Create Initial State
let state = createInitialGameState(config);

// Register Handlers
const factory = registry.getCharacterFactory('march-7th');
if (factory) {
    const { handlerMetadata, handlerLogic } = factory('march-7th', 80, 0);
    state = dispatch(state, {
        type: 'REGISTER_HANDLERS',
        handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
    });
}

// Battle Start
state = dispatch(state, { type: 'BATTLE_START' });

// Set March EP to Max
const march = state.units.find(u => u.id === 'march-7th');
if (march) {
    state = {
        ...state,
        units: state.units.map(u => u.id === 'march-7th' ? { ...u, ep: u.stats.max_ep } : u)
    };
}

console.log('--- Triggering March 7th Ultimate ---');
// Dispatch Ultimate
state = dispatch(state, {
    type: 'ULTIMATE',
    sourceId: 'march-7th',
    targetId: 'enemy-1' // Ultimate targets all enemies, but action might need a targetId or just sourceId depending on implementation.
    // Dispatcher resolveAction uses sourceId. targetId in Action is optional for some types but UltimateAction usually has it?
    // Let's check Action definition. UltimateAction has targetId?
    // In types.ts: export interface UltimateAction extends ActionBase { type: 'ULTIMATE'; targetId?: string; }
    // So it's optional.
});

// Check if Enemy is Frozen (50% chance)
// We can't guarantee it, but we can check if the code ran without error.
const enemy = state.units.find(u => u.id === 'enemy-1');
const freezeEffect = enemy?.effects.find(e => e.name === '凍結');

if (freezeEffect) {
    console.log('SUCCESS: Enemy is frozen (Lucky!).');
} else {
    console.log('INFO: Enemy is NOT frozen (Unlucky or Bug?).');
}

// Check logs for action
const lastLog = state.log[state.log.length - 1];
console.log('Last Log Action:', lastLog?.actionType);

if (lastLog?.actionType === '必殺技') {
    console.log('SUCCESS: Ultimate executed.');
} else {
    console.error('FAILURE: Ultimate did not execute properly.');
}
