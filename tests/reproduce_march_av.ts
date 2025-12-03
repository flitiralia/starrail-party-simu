
import { createInitialGameState } from '../app/simulator/engine/gameState';
import { stepSimulation } from '../app/simulator/engine/simulation';
import { Character, SimulationConfig } from '../app/simulator/engine/types';
import { march7th } from '../app/data/characters/march-7th';
import { registry } from '../app/simulator/registry/index'; // Fixed import
import { march7thHandlerFactory } from '../app/data/characters/march-7th';

// Register March 7th
registry.registerCharacter('march-7th', march7thHandlerFactory);

const config: any = { // Use any to bypass strict type checks for quick reproduction
    characters: [
        {
            id: 'march-7th',
            level: 80,
            eidolonLevel: 0,
            lightCone: { id: 'we-are-the-wildfire', level: 80, superimposition: 1 },
            relics: [],
            ornaments: [],
            config: {
                rotation: ['s', 'b'],
                ultStrategy: 'cooldown',
                ultCooldown: 0
            }
        }
    ],
    enemies: [
        {
            id: 'dummy',
            level: 80,
            hp: 100000,
            toughness: 100,
            maxToughness: 100,
            weaknesses: ['Ice'],
            speed: 100,
            actions: []
        }
    ],
    rounds: 10
};

let state = createInitialGameState(config);

// Run a few steps and log AV
console.log('Starting Simulation...');
for (let i = 0; i < 10; i++) {
    // Find next actor
    if (state.actionQueue.length > 0) {
        const next = state.actionQueue[0];
        const unit = state.units.find(u => u.id === next.unitId);
        console.log(`Step ${i}: Next is ${unit?.name} (AV: ${next.actionValue})`);
    }

    state = stepSimulation(state);

    // Check March's AV after step
    const march = state.units.find(u => u.id === 'march-7th');
    if (march) {
        console.log(`March AV after step ${i}: ${march.actionValue}`);
    }
}
