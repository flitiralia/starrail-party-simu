import { createInitialGameState } from '../engine/gameState';
import { stepSimulation } from '../engine/simulation';
import { Enemy, Element } from '../../types';
import { PartyConfig } from '../../types';
import { march7th } from '../../data/characters/march-7th';

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

// Party Config
const partyConfig: PartyConfig = {
    members: [
        {
            character: {
                ...march7th,
                baseStats: { ...march7th.baseStats, spd: 126 } // Speed 126
            },
            config: {
                rotation: ['s'], // Force Skill
                ultStrategy: 'immediate',
                ultCooldown: 0
            },
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

// Give March enough EP so Skill triggers Ult
// Max EP 120. Skill gives 30. So start with 90.
const marchId = march7th.id;
state = {
    ...state,
    units: state.units.map(u => u.id === marchId ? { ...u, ep: 90 } : u),
    skillPoints: 3 // Ensure SP for skill
};

console.log('--- Initial State ---');
const march = state.units.find(u => u.id === marchId)!;
console.log(`March Speed: ${march.stats.spd}`);
console.log(`March EP: ${march.ep}`);
console.log(`Base AV: ${10000 / march.stats.spd}`);

// Add a mock handler to simulate an enemy counter that delays the attacker
const mockCounterHandler = {
    handlerMetadata: {
        id: 'mock-counter-delay',
        subscribesTo: ['ON_ULTIMATE_USED']
    },
    handlerLogic: (event: any, s: any) => {
        if (event.sourceId === marchId) {
            console.log('--- Mock Counter Triggered: Applying 75% Delay ---');
            // Apply 75% Delay (Imprisonment-like)
            // Delay = BaseAV * 0.75
            const unit = s.units.find((u: any) => u.id === marchId);
            const baseAV = 10000 / unit.stats.spd;
            const delay = baseAV * 0.75;

            const newAV = unit.actionValue + delay;

            return {
                ...s,
                units: s.units.map((u: any) => u.id === marchId ? { ...u, actionValue: newAV } : u)
            };
        }
        return s;
    }
};

// Register the handler
state = {
    ...state,
    eventHandlers: [...state.eventHandlers, mockCounterHandler.handlerMetadata],
    eventHandlerLogics: { ...state.eventHandlerLogics, [mockCounterHandler.handlerMetadata.id]: mockCounterHandler.handlerLogic }
};

// Run Turn 1
console.log('\n--- Turn 1 (Skill -> Ult) ---');
state = stepSimulation(state);

// Check Logs
console.log('\n--- Logs ---');
state.log.forEach(l => {
    console.log(`[${l.actionTime?.toFixed(2)}] ${l.characterName}: ${l.actionType}`);
});

// Check Next AV
const nextMarch = state.units.find(u => u.id === marchId)!;
console.log(`\nMarch Next AV (Queue): ${nextMarch.actionValue.toFixed(2)}`);

