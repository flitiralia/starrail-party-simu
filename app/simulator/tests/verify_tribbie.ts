import { stepSimulation } from '../engine/simulation';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { tribbie, tribbieHandlerFactory } from '../../data/characters/tribbie';
import { march7th, march7thHandlerFactory } from '../../data/characters/march-7th';
import { Enemy, Element } from '../../types';
import { PartyConfig } from '../../types';
import { RegisterHandlersAction } from '../engine/types';

// Mock Enemy
const enemy: Enemy = {
    id: 'enemy-1',
    name: 'Voidranger',
    element: 'Quantum',
    baseStats: {
        hp: 100000,
        atk: 1000,
        def: 1000,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: { id: 'e-basic', name: 'Attack', type: 'Basic ATK', description: '' },
        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '' },
        talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' },
    },
    toughness: 300, // Fixed: maxToughness -> toughness
    baseRes: {}
};

// Party Config
const partyConfig: PartyConfig = {
    members: [
        {
            character: tribbie,
            config: {
                rotation: ['skill', 'basic', 'basic'],
                ultStrategy: 'immediate',
                ultCooldown: 0
            },
            enabled: true,
            eidolonLevel: 2 // Test E2
        },
        {
            character: march7th,
            config: {
                rotation: ['basic', 'basic', 'basic'],
                ultStrategy: 'cooldown',
                ultCooldown: 0
            },
            enabled: true,
            eidolonLevel: 0
        }
    ]
};

// Initialize
const config = {
    characters: [tribbie, march7th],
    enemies: [enemy],
    weaknesses: new Set(['Quantum'] as Element[]),
    partyConfig: partyConfig,
    enemyConfig: { level: 80, maxHp: 100000, toughness: 300, spd: 132 },
    rounds: 5
};

let state = createInitialGameState(config);

// Register Handlers
const tribbieHandler = tribbieHandlerFactory('tribbie', 80, 2); // Lv80, E2
const marchHandler = march7thHandlerFactory('march-7th', 80, 0);

const action: RegisterHandlersAction = {
    type: 'REGISTER_HANDLERS',
    handlers: [
        { metadata: tribbieHandler.handlerMetadata, logic: tribbieHandler.handlerLogic },
        { metadata: marchHandler.handlerMetadata, logic: marchHandler.handlerLogic }
    ]
};
state = dispatch(state, action);

// Battle Start
state = dispatch(state, { type: 'BATTLE_START' });

// Run Simulation
console.log('Starting Tribbie Verification...');
console.log('Initial Units:', state.units.map(u => `${u.name} (HP: ${u.hp})`));
let lastLogLength = 0;

// Run for a few steps
for (let i = 0; i < 30; i++) {
    const aliveAllies = state.units.filter(u => !u.isEnemy && u.hp > 0);
    const aliveEnemies = state.units.filter(u => u.isEnemy && u.hp > 0);
    if (aliveAllies.length === 0 || aliveEnemies.length === 0) break;

    state = stepSimulation(state);

    // Check all new logs
    const newLogs = state.log.slice(lastLogLength);
    for (const log of newLogs) {
        if (log.actionType === 'ADDITIONAL_DAMAGE' || log.actionType === 'TRUE_DAMAGE') {
            console.log(`[${log.actionTime?.toFixed(1)}] ${log.actionType} -> ${log.damageDealt?.toFixed(0)} Dmg (${log.details})`);
        }
    }
    lastLogLength = state.log.length;
}

// Check for Buffs
const tribbieUnit = state.units.find(u => u.id === 'tribbie');
if (tribbieUnit) {
    console.log('Tribbie Effects:', tribbieUnit.effects.map(e => e.name));
}

console.log('Verification Complete.');
