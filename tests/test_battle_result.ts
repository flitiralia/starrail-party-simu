
import { runSimulation } from '../app/simulator/engine/simulation.ts';
import { SimulationConfig, BattleResult } from '../app/simulator/engine/types.ts';
import { march7th } from '../app/data/characters/march-7th.ts';
import { tribbie } from '../app/data/characters/tribbie.ts';
import * as enemies from '../app/data/enemies/index.ts';
import { PartyConfig } from '../app/types/index.ts';

// Mock Config
const mockEnemy = Object.values(enemies)[0];
const mockConfig: SimulationConfig = {
    characters: [march7th, tribbie],
    enemies: [mockEnemy],
    weaknesses: new Set(['Ice', 'Quantum']),
    enemyConfig: {
        level: 80,
        maxHp: 100000,
        toughness: 300,
        spd: 132
    },
    partyConfig: {
        members: [
            {
                character: march7th,
                enabled: true,
                config: { rotation: ['b'], ultStrategy: 'immediate', ultCooldown: 0 },
                eidolonLevel: 0
            },
            {
                character: tribbie,
                enabled: true,
                config: { rotation: ['b'], ultStrategy: 'immediate', ultCooldown: 0 },
                eidolonLevel: 0
            }
        ]
    },
    rounds: 1
};

console.log('Running Battle Result Test...');
const resultState = runSimulation(mockConfig);

console.log('Simulation Complete.');
console.log('Total Damage:', resultState.result.totalDamageDealt);
console.log('Character Stats:', JSON.stringify(resultState.result.characterStats, null, 2));

if (resultState.result.totalDamageDealt > 0) {
    console.log('SUCCESS: Damage recorded.');
} else {
    console.error('FAILURE: No damage recorded.');
    process.exit(1);
}

if (resultState.result.characterStats['march-7th']) {
    console.log('SUCCESS: March 7th stats recorded.');
} else {
    console.error('FAILURE: March 7th stats not recorded.');
    process.exit(1);
}
