
import { createInitialGameState } from './app/simulator/engine/gameState';
import { createGenericRelicHandlerFactory } from './app/simulator/engine/handlers/generic';
import { Character, Enemy, SimulationConfig, IAbility } from './app/types';
import { GENIUS_OF_BRILLIANT_STARS } from './app/data/relics/genius-of-brilliant-stars';

const genius = GENIUS_OF_BRILLIANT_STARS;

// Mock Data
const quantumDps: Character = {
    id: 'seele',
    name: 'Seele',
    element: 'Quantum',
    path: 'The Hunt',
    maxEnergy: 120,
    baseStats: { hp: 1000, atk: 1000, def: 500, spd: 115, critRate: 0.05, critDmg: 0.5 },
    abilities: {
        basic: { id: 'basic', description: '', name: 'Basic', type: 'Basic ATK', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        skill: { id: 'skill', description: '', name: 'Skill', type: 'Skill' } as IAbility,
        ultimate: { id: 'ult', description: '', name: 'Ult', type: 'Ultimate' } as IAbility,
        talent: { id: 'talent', description: '', name: 'Talent', type: 'Talent' } as IAbility,
        technique: { id: 'tech', description: '', name: 'Tech', type: 'Technique' } as IAbility,
    },
    traces: [],
    ornaments: [],
    relics: [
        { type: 'Head', level: 15, mainStat: { stat: 'hp', value: 705 }, subStats: [], set: genius },
        { type: 'Hands', level: 15, mainStat: { stat: 'atk', value: 352 }, subStats: [], set: genius },
        { type: 'Body', level: 15, mainStat: { stat: 'crit_rate', value: 0.324 }, subStats: [], set: genius },
        { type: 'Feet', level: 15, mainStat: { stat: 'atk_pct', value: 0.432 }, subStats: [], set: genius },
    ],
};

const mockEnemyNoQuantum: Enemy = {
    id: 'trotter',
    name: 'Trotter',
    element: 'Physical',
    toughness: 30,
    baseStats: { hp: 10000, atk: 100, def: 100, spd: 100, critRate: 0.05, critDmg: 0.5 },
    baseRes: {},
    abilities: { basic: { id: 'trot', description: '', name: 'Trot', type: 'Basic ATK' } as IAbility },
    weaknesses: new Set(['Physical']),
};

const mockEnemyQuantum: Enemy = {
    id: 'bug',
    name: 'Bug',
    element: 'Quantum',
    toughness: 30,
    baseStats: { hp: 10000, atk: 100, def: 100, spd: 100, critRate: 0.05, critDmg: 0.5 },
    baseRes: {},
    abilities: { basic: { id: 'sting', description: '', name: 'Sting', type: 'Basic ATK' } as IAbility },
    weaknesses: new Set(['Quantum']),
};

const config: SimulationConfig = {
    characters: [quantumDps],
    enemies: [mockEnemyNoQuantum, mockEnemyQuantum],
    weaknesses: new Set(['Physical', 'Quantum']),
    characterConfig: {
        'seele': { rotation: [], ultStrategy: 'always', ultCooldown: 0 },
    },
    enemyConfig: { level: 80, maxHp: 10000, toughness: 30 },
    rounds: 1,
};

// Test
console.log('--- Starting Genius of Brilliant Stars Test ---');

// 1. Initialize State
const initialState = createInitialGameState(config);
const seele = initialState.units.find(u => u.id === 'seele');

if (!seele) {
    console.error('Character not found in state');
    process.exit(1);
}

// 2. Run Handler
const factory = createGenericRelicHandlerFactory(genius);
const handler = factory('seele', 4);

// Simulate BATTLE_START event
const event = { type: 'ON_BATTLE_START', sourceId: 'system', value: 0 };
// @ts-ignore
const newState = handler.handlerLogic(event, initialState, handler.handlerMetadata.id);

// 3. Verify Result
const updatedSeele = newState.units.find(u => u.id === 'seele');

// Check DEF Ignore
const defIgnore = updatedSeele?.stats.def_ignore || 0;
console.log(`Initial DEF Ignore: ${defIgnore}`);

// Check for localized effect name
const effect = updatedSeele?.effects.find(e => e.name === '星の如く輝く天才 (防御無視)');
if (effect) {
    console.log('SUCCESS: Localized effect name found.');
} else {
    console.log('FAILURE: Localized effect name NOT found.');
}

// Note: The current implementation of Genius is static 10% ignore.
// The requirement is 10% base + 10% if enemy has Quantum weakness.
// However, DEF ignore is usually a stat on the attacker, not conditional per enemy in the stats object itself unless we have conditional stats.
// In this system, we might need to implement it as a "conditional modifier" or just a flat stat if the system supports "def_ignore" which applies to all attacks.
// But the 2nd 10% is conditional on the target.
// If the system doesn't support target-specific stats, we might need to hook into damage calculation or apply a modifier that checks the target.
// For now, let's see if the basic 10% is applied.

if (Math.abs(defIgnore - 0.1) < 0.001) {
    console.log('SUCCESS: Basic 10% DEF Ignore applied.');
} else {
    console.error(`FAILURE: Basic DEF Ignore NOT applied. Expected 0.1, got ${defIgnore}`);
}

// Test Conditional Logic (if we implement it)
// Ideally, we want to see if we can handle the "extra 10% vs Quantum Weakness".
// Since `def_ignore` is a stat on the character, it applies to all targets.
// To handle target-specific ignore, we'd need a `ON_BEFORE_DAMAGE_CALCULATION` handler that checks the target's weakness and temporarily adds DEF ignore or modifies the damage context.
// Let's assume we will implement it using `ON_BEFORE_DAMAGE_CALCULATION` or similar if possible, OR just update the description if we can't do it perfectly yet.
// But the task is to implement it.

// Let's check if we can simulate an attack and see if logic triggers.
