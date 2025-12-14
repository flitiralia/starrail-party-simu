
import { runSimulation } from './app/simulator/engine/simulation';
import { Character, Enemy, SimulationConfig } from './app/types';
import * as enemies from './app/data/enemies';
import * as characters from './app/data/characters';
import { createEmptyStatRecord } from './app/simulator/statBuilder';

// Mock Data
const mockCharacter: Character = {
    ...characters.ALL_CHARACTERS[0],
    stats: createEmptyStatRecord(),
    baseStats: { ...createEmptyStatRecord(), hp: 1000, atk: 100, def: 100, spd: 100 },
};

const mockEnemy: Enemy = {
    ...Object.values(enemies)[0],
    baseStats: { ...createEmptyStatRecord(), hp: 10000, atk: 100, def: 100, spd: 100 },
    baseRes: {},
};

// Test Case 1: Default Stats
const configDefault: SimulationConfig = {
    characters: [mockCharacter],
    enemies: [mockEnemy],
    weaknesses: new Set(),
    enemyConfig: {
        level: 80,
        maxHp: 10000,
        toughness: 120,
        spd: 100,
        // No atk/def override
    },
    rounds: 1,
};

const stateDefault = runSimulation(configDefault);
const enemyDefault = stateDefault.units.find(u => u.isEnemy);
console.log(`Default ATK: ${enemyDefault?.stats.atk} (Expected: matches base or undefined if not set in base correctly)`);
console.log(`Default DEF: ${enemyDefault?.stats.def}`);


// Test Case 2: Custom ATK/DEF
const configCustom: SimulationConfig = {
    characters: [mockCharacter],
    enemies: [mockEnemy],
    weaknesses: new Set(),
    enemyConfig: {
        level: 80,
        maxHp: 10000,
        toughness: 120,
        spd: 100,
        atk: 9999,
        def: 8888,
    },
    rounds: 1,
};

const stateCustom = runSimulation(configCustom);
const enemyCustom = stateCustom.units.find(u => u.isEnemy);
console.log(`Custom ATK: ${enemyCustom?.stats.atk} (Expected: 9999)`);
console.log(`Custom DEF: ${enemyCustom?.stats.def} (Expected: 8888)`);

if (enemyCustom?.stats.atk === 9999 && enemyCustom?.stats.def === 8888) {
    console.log("Verification SUCCESS");
} else {
    console.log("Verification FAILED");
}
