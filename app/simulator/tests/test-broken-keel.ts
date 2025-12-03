
import { createInitialGameState } from '../engine/gameState';
import { createGenericRelicHandlerFactory } from '../engine/handlers/generic';
import { Character, Enemy, SimulationConfig, IAbility } from '@/app/types';
import { BROKEN_KEEL } from '@/app/data/ornaments/broken-keel';

const brokenKeel = BROKEN_KEEL;
console.log('Broken Keel Import:', brokenKeel);

// Mock Data
const mockCharacter: Character = {
    id: 'march-7th',
    name: 'March 7th',
    element: 'Ice',
    path: 'Preservation',
    maxEnergy: 120,
    baseStats: { hp: 1000, atk: 500, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5 },
    abilities: {
        basic: { id: 'basic', description: '', name: 'Basic', type: 'Basic ATK', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        skill: { id: 'skill', description: '', name: 'Skill', type: 'Skill', shield: { scaling: 'def', multiplier: 0.5, flat: 100 } } as IAbility,
        ultimate: { id: 'ult', description: '', name: 'Ult', type: 'Ultimate', damage: { scaling: 'atk', multiplier: 1.5 } } as IAbility,
        talent: { id: 'talent', description: '', name: 'Talent', type: 'Talent' } as IAbility,
        technique: { id: 'tech', description: '', name: 'Tech', type: 'Technique' } as IAbility,
    },
    traces: [],
    ornaments: [
        {
            type: 'Planar Sphere',
            level: 15,
            mainStat: { stat: 'ice_dmg_boost', value: 0.388 },
            subStats: [],
            set: brokenKeel,
        },
        {
            type: 'Link Rope',
            level: 15,
            mainStat: { stat: 'energy_regen_rate', value: 0.194 },
            subStats: [
                { stat: 'effect_res', value: 0.2 }, // Add 20% Effect RES substat
            ],
            set: brokenKeel,
        }
    ],
    relics: [],
};

const mockEnemy: Enemy = {
    id: 'trotter',
    name: 'Trotter',
    element: 'Physical',
    toughness: 30,
    baseStats: { hp: 10000, atk: 100, def: 100, spd: 100, critRate: 0.05, critDmg: 0.5 },
    baseRes: { Physical: 0, Fire: 0, Ice: 0, Lightning: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    abilities: {
        basic: { id: 'trot', description: '', name: 'Trot', type: 'Basic ATK' } as IAbility,
        skill: { id: 'skill', description: '', name: 'Skill', type: 'Skill' } as IAbility,
        ultimate: { id: 'ult', description: '', name: 'Ult', type: 'Ultimate' } as IAbility,
        talent: { id: 'talent', description: '', name: 'Talent', type: 'Talent' } as IAbility,
        technique: { id: 'tech', description: '', name: 'Tech', type: 'Technique' } as IAbility,
    },
};

const config: SimulationConfig = {
    characters: [mockCharacter],
    enemies: [mockEnemy],
    weaknesses: new Set(['Ice']),
    characterConfig: {
        'march-7th': {
            rotation: [],
            ultStrategy: 'always',
            ultCooldown: 0
        }
    },
    enemyConfig: { level: 80, maxHp: 10000, toughness: 30 },
    rounds: 1,
};

// Test
console.log('--- Starting Broken Keel Test ---');

// 1. Initialize State
const initialState = createInitialGameState(config);
const unit = initialState.units.find(u => u.id === 'march-7th');

if (!unit) {
    console.error('Character not found in state');
    process.exit(1);
}

console.log(`Initial Stats for ${unit.name}:`);
console.log(`Effect RES: ${unit.stats.effect_res}`);
console.log(`Crit DMG: ${unit.stats.crit_dmg}`);

// Check if Effect RES is >= 30%
// Base 0 + 10% (Set) + 20% (Substat) = 30%
// Note: calculateFinalStats should have applied the 10% set bonus.

if ((unit.stats.effect_res || 0) < 0.3) {
    console.warn('Effect RES is less than 30%. Buff should NOT apply.');
} else {
    console.log('Effect RES is >= 30%. Buff SHOULD apply.');
}

// 2. Run Handler
const factory = createGenericRelicHandlerFactory(brokenKeel);
const handler = factory('march-7th', 2);

// Simulate BATTLE_START event
const event = { type: 'ON_BATTLE_START', sourceId: 'system', value: 0 };
// @ts-ignore
const newState = handler.handlerLogic(event, initialState, handler.handlerMetadata.id);

// 3. Verify Result
const updatedUnit = newState.units.find(u => u.id === 'march-7th');
console.log(`\nUpdated Stats for ${updatedUnit?.name}:`);
console.log(`Crit DMG: ${updatedUnit?.stats.crit_dmg}`);

const diff = (updatedUnit?.stats.crit_dmg || 0) - (unit.stats.crit_dmg || 0);
console.log(`Crit DMG Change: ${diff}`);

// Check for localized effect name
const effect = updatedUnit?.effects.find(e => e.name === '折れた竜骨 (会心ダメ)');
if (effect) {
    console.log('SUCCESS: Localized effect name found.');
} else {
    console.error('FAILURE: Localized effect name NOT found.');
}

if (diff >= 0.099) { // Allow float error
    console.log('SUCCESS: Broken Keel buff applied.');
} else {
    console.error('FAILURE: Broken Keel buff NOT applied.');
}
