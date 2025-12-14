
import { runSimulation } from './app/simulator/engine/simulation';
import { Character, Enemy, SimulationConfig, SimulationLogEntry } from './app/types';
import * as enemies from './app/data/enemies';
import * as characters from './app/data/characters';
import { createEmptyStatRecord } from './app/simulator/statBuilder';

// Helper to create valid base stats
const createBaseStats = (hp: number, aggro: number) => ({
    ...createEmptyStatRecord(),
    hp,
    atk: 100,
    def: 100,
    spd: 100,
    aggro,
    critRate: 0.05, // Required by Zod schema
    critDmg: 0.5,   // Required by Zod schema
});

// Mock Data
const charHighAggro: Character = {
    ...characters.ALL_CHARACTERS[0],
    id: 'char_high',
    name: 'High Aggro Char',
    baseStats: createBaseStats(3000, 150) as any, // Cast to avoid strict type matching if schema is tricky
    stats: createEmptyStatRecord(),
};

const charLowAggro: Character = {
    ...characters.ALL_CHARACTERS[1],
    id: 'char_low',
    name: 'Low Aggro Char',
    baseStats: createBaseStats(2000, 75) as any,
    stats: createEmptyStatRecord(),
};

const mockEnemy: Enemy = {
    ...Object.values(enemies)[0],
    baseStats: {
        ...createEmptyStatRecord(),
        hp: 100000, atk: 100, def: 100, spd: 200,
        critRate: 0.05, critDmg: 0.5, aggro: 0
    } as any,
    baseRes: {},
};

const config: SimulationConfig = {
    characters: [charHighAggro, charLowAggro],
    enemies: [mockEnemy],
    weaknesses: new Set(),
    enemyConfig: {
        level: 80,
        maxHp: 100000,
        toughness: 120,
        spd: 200,
    },
    rounds: 100,
};

const state = runSimulation(config);

// Analyze Logs
let attacksOnHigh = 0;
let attacksOnLow = 0;

state.log.forEach((entry: SimulationLogEntry) => {
    // Check for Enemy Basic Attacks
    if (entry.sourceId === mockEnemy.id && (entry.actionType === '通常攻撃' || entry.actionType === 'BASIC_ATTACK')) {
        if (entry.targetId === charHighAggro.id) {
            attacksOnHigh++;
        } else if (entry.targetId === charLowAggro.id) {
            attacksOnLow++;
        }
    }
});

console.log(`High Aggro (150) Attacks: ${attacksOnHigh}`);
console.log(`Low Aggro (75) Attacks: ${attacksOnLow}`);

const total = attacksOnHigh + attacksOnLow;
if (total === 0) {
    console.log("No enemy attacks detected. Check log parsing.");
    console.log("Sample Logs:", state.log.filter(l => l.sourceId === mockEnemy.id).slice(0, 3));
} else {
    const ratio = attacksOnHigh / total;
    const expectedRatio = 150 / (150 + 75); // 0.66
    console.log(`Ratio High: ${ratio.toFixed(2)} (Expected ~${expectedRatio.toFixed(2)})`);

    // Allow some variance due to randomness (e.g. +/- 0.15)
    if (Math.abs(ratio - expectedRatio) < 0.20) {
        console.log("Verification SUCCESS");
    } else {
        console.log("Verification FAILED (Ratio variance too high)");
    }
}
