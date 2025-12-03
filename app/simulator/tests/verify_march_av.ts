import { createInitialGameState } from '../engine/gameState';
import { stepSimulation } from '../engine/simulation';
import { Enemy, Element } from '../../types';
import { PartyConfig } from '../../types';
import { march7th } from '../../data/characters/march-7th';
import { dispatch } from '../engine/dispatcher';

// Mock Enemy
const enemy: Enemy = {
    id: 'enemy-1',
    name: 'Sandbag',
    element: 'Quantum',
    baseStats: {
        hp: 100000,
        atk: 1000,
        def: 1000,
        spd: 1,
        critRate: 0.05,
        critDmg: 0.5,
    },
    abilities: {
        basic: { id: 'e-basic', name: 'Attack', type: 'Basic ATK', description: '' },
        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '' },
        talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' },
    },
    toughness: 300,
    baseRes: {}
};

// Party Config (Speed 126)
const partyConfig: PartyConfig = {
    members: [
        {
            character: {
                ...march7th,
                baseStats: { ...march7th.baseStats, spd: 126 }
            },
            config: { rotation: ['basic'], ultStrategy: 'immediate', ultCooldown: 0 },
            enabled: true,
            eidolonLevel: 0
        }
    ]
};

const config = {
    characters: [partyConfig.members[0].character],
    enemies: [enemy],
    weaknesses: new Set(['Ice'] as Element[]),
    partyConfig: partyConfig,
    enemyConfig: { level: 80, maxHp: 100000, toughness: 300, spd: 1 },
    rounds: 5
};

let state = createInitialGameState(config);

console.log('--- Initial State ---');
const march = state.units.find(u => u.id === march7th.id)!;
console.log(`March Speed: ${march.stats.spd}`);
const baseAV = 10000 / march.stats.spd;
console.log(`Expected Base AV: ${baseAV.toFixed(2)}`);

// Turn 1
console.log('\n--- Turn 1 ---');
state = stepSimulation(state);
let lastLog = state.log[state.log.length - 1];
console.log(`Time: ${lastLog.actionTime?.toFixed(2)}, Action: ${lastLog.actionType}`);

// Check Next AV
let marchUnit = state.units.find(u => u.id === march7th.id)!;
console.log(`March Next AV (Queue): ${marchUnit.actionValue.toFixed(2)}`);
console.log(`Expected Next Time: ${(lastLog.actionTime! + marchUnit.actionValue).toFixed(2)}`);

// Turn 2
console.log('\n--- Turn 2 ---');
state = stepSimulation(state);
lastLog = state.log[state.log.length - 1];
console.log(`Time: ${lastLog.actionTime?.toFixed(2)}, Action: ${lastLog.actionType}`);

// Check Next AV
marchUnit = state.units.find(u => u.id === march7th.id)!;
console.log(`March Next AV (Queue): ${marchUnit.actionValue.toFixed(2)}`);
console.log(`Expected Next Time: ${(lastLog.actionTime! + marchUnit.actionValue).toFixed(2)}`);

// Interrupt with Ultimate
console.log('\n--- Interrupt with Ultimate ---');
// Give full energy
state = {
    ...state,
    units: state.units.map(u => u.id === march7th.id ? { ...u, ep: u.stats.max_ep } : u)
};
// Dispatch Ult
state = dispatch(state, { type: 'ULTIMATE', sourceId: march7th.id, targetId: enemy.id });
console.log('Ult Dispatched.');

// Check AV after Ult
marchUnit = state.units.find(u => u.id === march7th.id)!;
console.log(`March AV after Ult: ${marchUnit.actionValue.toFixed(2)} (Should be same as before)`);

// Turn 3
console.log('\n--- Turn 3 ---');
state = stepSimulation(state);
lastLog = state.log[state.log.length - 1];
console.log(`Time: ${lastLog.actionTime?.toFixed(2)}, Action: ${lastLog.actionType}`);
