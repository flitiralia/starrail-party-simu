import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { stepSimulation } from '../engine/simulation';
import { SimulationConfig, EnemyConfig, Unit } from '../../types/index';
import { registry } from '../registry/index';
import { march7thHandlerFactory } from '../../data/characters/march-7th';
import { IEffect } from '../effect/types';

// Register March (dummy, just need a character)
registry.registerCharacter('march-7th', march7thHandlerFactory);

// Mock Enemy
const mockEnemy: EnemyConfig = {
    id: 'enemy-1',
    name: 'Mock Enemy',
    level: 80,
    baseStats: { hp: 10000, atk: 1000, def: 1000, spd: 100, effect_res: 0 },
    baseRes: {},
    maxToughness: 100,
    toughness: 100,
    abilities: { basic: { id: 'e-b', name: 'A', type: 'Basic ATK', targetType: 'single', damage: { type: 'simple', scaling: 'atk', multiplier: 1 } } },
    isEnemy: true,
};

// Setup Config
const config: SimulationConfig = {
    characters: [], // No characters needed for this specific test logic
    enemies: [mockEnemy],
    weaknesses: new Set(['Ice']),
    enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
    partyConfig: { members: [] },
    rounds: 10,
};

let state = createInitialGameState(config);
state = dispatch(state, { type: 'BATTLE_START' });

// Add Freeze Effect to Enemy
const freezeEffect: IEffect = {
    id: 'freeze-1',
    name: 'Freeze',
    category: 'STATUS',
    type: 'BreakStatus', // Important for freeze logic
    sourceUnitId: 'enemy-1', // Self-inflicted for test
    durationType: 'TURN_START_BASED',
    duration: 2,
    onApply: (t, s) => s,
    onRemove: (t, s) => s,
    apply: (t, s) => s,
    remove: (t, s) => s,
};
// Add statusType for Freeze
(freezeEffect as any).statusType = 'Freeze';

// Add a Buff to Enemy (TURN_START_BASED)
const testBuffStart: IEffect = {
    id: 'test-buff-start',
    name: 'Test Buff Start',
    category: 'BUFF',
    sourceUnitId: 'enemy-1',
    durationType: 'TURN_START_BASED',
    duration: 2,
    onApply: (t, s) => s,
    onRemove: (t, s) => s,
    apply: (t, s) => s,
    remove: (t, s) => s,
};

// Add a Buff to Enemy (TURN_END_BASED)
const testBuffEnd: IEffect = {
    id: 'test-buff-end',
    name: 'Test Buff End',
    category: 'BUFF',
    sourceUnitId: 'enemy-1',
    durationType: 'TURN_END_BASED',
    duration: 2,
    onApply: (t, s) => s,
    onRemove: (t, s) => s,
    apply: (t, s) => s,
    remove: (t, s) => s,
};

// Manually add effects
state = {
    ...state,
    units: state.units.map(u => {
        if (u.id === 'enemy-1') {
            return { ...u, effects: [freezeEffect, testBuffStart, testBuffEnd] };
        }
        return u;
    })
};

console.log('--- Start Test ---');
const enemy = state.units.find(u => u.id === 'enemy-1');
console.log(`Initial: Freeze: ${enemy?.effects.find(e => e.name === 'Freeze')?.duration}, StartBuff: ${enemy?.effects.find(e => e.name === 'Test Buff Start')?.duration}, EndBuff: ${enemy?.effects.find(e => e.name === 'Test Buff End')?.duration}`);

// Step Simulation (Enemy Turn)
state = stepSimulation(state);

const enemyAfter = state.units.find(u => u.id === 'enemy-1');
const freezeAfter = enemyAfter?.effects.find(e => e.name === 'Freeze');
const buffStartAfter = enemyAfter?.effects.find(e => e.name === 'Test Buff Start');
const buffEndAfter = enemyAfter?.effects.find(e => e.name === 'Test Buff End');

console.log(`After Step: Freeze: ${freezeAfter?.duration}, StartBuff: ${buffStartAfter?.duration}, EndBuff: ${buffEndAfter?.duration}`);

// Check results
if (freezeAfter?.duration === 1 && buffStartAfter?.duration === 1 && buffEndAfter?.duration === 1) {
    console.log('SUCCESS: All durations decreased.');
} else {
    console.error('FAILURE: Durations did not decrease as expected.');
}
