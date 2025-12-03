
import { createInitialGameState } from './app/simulator/engine/gameState';
import { createGenericRelicHandlerFactory } from './app/simulator/engine/handlers/generic';
import { Character, Enemy, SimulationConfig, IAbility } from './app/types';
import { FLEET_OF_THE_AGELESS } from './app/data/ornaments/fleet-of-the-ageless';

const fleet = FLEET_OF_THE_AGELESS;

// Mock Data
const mockCharacter: Character = {
    id: 'healer',
    name: 'Healer',
    element: 'Imaginary',
    path: 'Abundance',
    maxEnergy: 100,
    baseStats: { hp: 1000, atk: 500, def: 500, spd: 120, critRate: 0.05, critDmg: 0.5 }, // SPD 120
    abilities: {
        basic: { id: 'basic', description: '', name: 'Basic', type: 'Basic ATK', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        skill: { id: 'skill', description: '', name: 'Skill', type: 'Skill' } as IAbility,
        ultimate: { id: 'ult', description: '', name: 'Ult', type: 'Ultimate' } as IAbility,
        talent: { id: 'talent', description: '', name: 'Talent', type: 'Talent' } as IAbility,
        technique: { id: 'tech', description: '', name: 'Tech', type: 'Technique' } as IAbility,
    },
    traces: [],
    ornaments: [
        {
            type: 'Planar Sphere',
            level: 15,
            mainStat: { stat: 'hp_pct', value: 0.432 },
            subStats: [],
            set: fleet,
        },
        {
            type: 'Link Rope',
            level: 15,
            mainStat: { stat: 'energy_regen_rate', value: 0.194 },
            subStats: [],
            set: fleet,
        }
    ],
    relics: [],
};

const mockAlly: Character = {
    id: 'dps',
    name: 'DPS',
    element: 'Fire',
    path: 'Destruction',
    maxEnergy: 120,
    baseStats: { hp: 1000, atk: 1000, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5 },
    abilities: {
        basic: { id: 'basic', description: '', name: 'Basic', type: 'Basic ATK' } as IAbility,
        skill: { id: 'skill', description: '', name: 'Skill', type: 'Skill' } as IAbility,
        ultimate: { id: 'ult', description: '', name: 'Ult', type: 'Ultimate' } as IAbility,
        talent: { id: 'talent', description: '', name: 'Talent', type: 'Talent' } as IAbility,
        technique: { id: 'tech', description: '', name: 'Tech', type: 'Technique' } as IAbility,
    },
    traces: [],
    ornaments: [],
    relics: [],
};

const mockEnemy: Enemy = {
    id: 'trotter',
    name: 'Trotter',
    element: 'Physical',
    toughness: 30,
    baseStats: { hp: 10000, atk: 100, def: 100, spd: 100, critRate: 0.05, critDmg: 0.5 },
    baseRes: {},
    abilities: {
        basic: { id: 'trot', description: '', name: 'Trot', type: 'Basic ATK' } as IAbility,
        skill: { id: 'skill', description: '', name: 'Skill', type: 'Skill' } as IAbility,
        ultimate: { id: 'ult', description: '', name: 'Ult', type: 'Ultimate' } as IAbility,
        talent: { id: 'talent', description: '', name: 'Talent', type: 'Talent' } as IAbility,
        technique: { id: 'tech', description: '', name: 'Tech', type: 'Technique' } as IAbility,
    },
};

const config: SimulationConfig = {
    characters: [mockCharacter, mockAlly],
    enemies: [mockEnemy],
    weaknesses: new Set(['Physical']),
    characterConfig: {
        'healer': { rotation: [], ultStrategy: 'always', ultCooldown: 0 },
        'dps': { rotation: [], ultStrategy: 'always', ultCooldown: 0 },
    },
    enemyConfig: { level: 80, maxHp: 10000, toughness: 30 },
    rounds: 1,
};

// Test
console.log('--- Starting Fleet of the Ageless Test ---');

// 1. Initialize State
const initialState = createInitialGameState(config);
const healer = initialState.units.find(u => u.id === 'healer');
const dps = initialState.units.find(u => u.id === 'dps');

if (!healer || !dps) {
    console.error('Characters not found in state');
    process.exit(1);
}

console.log(`Healer SPD: ${healer.stats.spd}`);
console.log(`DPS Initial ATK%: ${dps.stats.atk_pct || 0}`);

// 2. Run Handler
const factory = createGenericRelicHandlerFactory(fleet);
const handler = factory('healer', 2);

// Simulate BATTLE_START event
const event = { type: 'ON_BATTLE_START', sourceId: 'system', value: 0 };
// @ts-ignore
const newState = handler.handlerLogic(event, initialState, handler.handlerMetadata.id);

// 3. Verify Result
const updatedDps = newState.units.find(u => u.id === 'dps');
console.log(`DPS Updated ATK%: ${updatedDps?.stats.atk_pct}`);

const diff = (updatedDps?.stats.atk_pct || 0) - (dps.stats.atk_pct || 0);
console.log(`ATK% Change: ${diff}`);

// Check for localized effect name
const effect = updatedDps?.effects.find(e => e.name === '老いぬ者の仙舟 (攻撃力)');
if (effect) {
    console.log('SUCCESS: Localized effect name found.');
} else {
    console.log('FAILURE: Localized effect name NOT found (Expected for now if not yet localized).');
}

if (Math.abs(diff - 0.08) < 0.001) {
    console.log('SUCCESS: Fleet buff applied.');
} else {
    console.error(`FAILURE: Fleet buff NOT applied. Diff: ${diff}`);
}
