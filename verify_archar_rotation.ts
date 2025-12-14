
import { Character, CharacterBaseStats, Enemy } from './app/types';
import { GameState, SimulationConfig } from './app/simulator/engine/types';
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch } from './app/simulator/engine/dispatcher';
import { runSimulation } from './app/simulator/engine/simulation';
import { archarHandlerFactory, archar } from './app/data/characters/archar';

// Mock Enemy
const enemy: Enemy = {
    id: 'enemy',
    name: 'Test Enemy',
    path: 'Destruction',
    element: 'Quantum',
    rarity: 4,
    baseStats: {
        hp: 100000,
        atk: 100,
        def: 100,
        spd: 100,
        critRate: 0,
        critDmg: 0,
        aggro: 100,
        max_ep: 0,
    },
    baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    maxEnergy: 100,
    abilities: {
        basic: { id: 'e-b', name: 'Basic', type: 'Basic ATK', description: '' },
        skill: { id: 'e-s', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'e-u', name: 'Ultimate', type: 'Ultimate', description: '' },
        talent: { id: 'e-t', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'e-te', name: 'Tech', type: 'Technique', description: '' },
    },
    traces: []
};

// Initialize State
const simConfig: SimulationConfig = {
    characters: [archar],
    enemies: [enemy],
    weaknesses: new Set(['Quantum']),
    partyConfig: {
        members: [
            {
                character: archar,
                config: {
                    rotation: ['b', 'b', 'b'],
                    rotationMode: 'spam_skill',
                    spamSkillTriggerSp: 4,
                    ultStrategy: 'immediate',
                    ultCooldown: 0
                },
                enabled: true,
                eidolonLevel: 0
            }
        ]
    },
    enemyConfig: {
        level: 80,
        maxHp: 100000,
        spd: 100,
        toughness: 100,
        weaknesses: ['Quantum']
    },
    rounds: 2
};

let state = createInitialGameState(simConfig);

// Set High SP to trigger Continuous Mode (e.g. 5)
state = { ...state, skillPoints: 5 };
console.log(`Starting SP: ${state.skillPoints}`);

// Register Handlers
state.units.forEach(unit => {
    if (unit.id === 'archar') {
        const { handlerMetadata, handlerLogic } = archarHandlerFactory(unit.id, unit.level, 0);
        state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: [{ metadata: handlerMetadata, logic: handlerLogic }] });
    }
});
state = dispatch(state, { type: 'BATTLE_START' });

// Run simulation until Archer acts
import { stepSimulation } from './app/simulator/engine/simulation';
import { initializeActionQueue } from './app/simulator/engine/actionValue';

if (state.actionQueue.length === 0) {
    state.actionQueue = initializeActionQueue(state.units);
}

for (let i = 0; i < 5; i++) {
    const nextUnitId = state.actionQueue[0]?.unitId;
    if (nextUnitId === archar.id) {
        console.log(`[Turn] Archer is acting. SP: ${state.skillPoints}`);
    }
    state = stepSimulation(state);
}

console.log('--- LOGS DUMP ---');
state.log.forEach((l, idx) => {
    console.log(`[${idx}] Type: ${l.actionType}, Source: ${l.sourceId}, Details: ${l.details}`);
});
console.log('-----------------');

const skillCount = state.log.filter(l => l.sourceId === archar.id && (l.actionType === 'SKILL' || l.actionType === 'Skill' || l.actionType === 'スキル')).length;
const basicCount = state.log.filter(l => l.sourceId === archar.id && (l.actionType === 'BASIC_ATTACK' || l.actionType === 'Basic ATK')).length;
console.log(`Total Skills: ${skillCount}`);
console.log(`Total Basics: ${basicCount}`);

if (skillCount === 0 && basicCount > 0) {
    console.log('✅ Archer used Basic (Sequence Mode Active)');
} else {
    console.error('❌ Archer did NOT use Basic or used Skill unexpectedly');
}
