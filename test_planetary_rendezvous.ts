
import { createInitialGameState } from './app/simulator/engine/gameState';
import { createGenericLightConeHandlerFactory } from './app/simulator/engine/handlers/generic';
import { Character, Enemy, SimulationConfig, IAbility } from './app/types';
import { planetaryRendezvous } from './app/data/light-cones/planetary-rendezvous';

// Mock Data
const harmony: Character = {
    id: 'asta',
    name: 'Asta',
    element: 'Fire',
    path: 'Harmony',
    maxEnergy: 120,
    baseStats: { hp: 1000, atk: 500, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5 },
    abilities: {
        basic: { id: 'basic', description: '', name: 'Basic', type: 'Basic ATK', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        skill: { id: 'skill', description: '', name: 'Skill', type: 'Skill' } as IAbility,
        ultimate: { id: 'ult', description: '', name: 'Ult', type: 'Ultimate' } as IAbility,
        talent: { id: 'talent', description: '', name: 'Talent', type: 'Talent' } as IAbility,
        technique: { id: 'tech', description: '', name: 'Tech', type: 'Technique' } as IAbility,
    },
    traces: [],
    equippedLightCone: {
        lightCone: planetaryRendezvous,
        level: 80,
        superimposition: 5, // S5: 24% DMG Boost
    },
    ornaments: [],
    relics: [],
};

const fireDps: Character = {
    id: 'himeko',
    name: 'Himeko',
    element: 'Fire',
    path: 'Erudition',
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

const iceDps: Character = {
    id: 'jingliu',
    name: 'Jingliu',
    element: 'Ice',
    path: 'Destruction',
    maxEnergy: 140,
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
    characters: [harmony, fireDps, iceDps],
    enemies: [mockEnemy],
    weaknesses: new Set(['Fire', 'Ice']),
    characterConfig: {
        'asta': { rotation: [], ultStrategy: 'always', ultCooldown: 0 },
        'himeko': { rotation: [], ultStrategy: 'always', ultCooldown: 0 },
        'jingliu': { rotation: [], ultStrategy: 'always', ultCooldown: 0 },
    },
    enemyConfig: { level: 80, maxHp: 10000, toughness: 30 },
    rounds: 1,
};

// Test
console.log('--- Starting Planetary Rendezvous Test ---');

// 1. Initialize State
const initialState = createInitialGameState(config);
const asta = initialState.units.find(u => u.id === 'asta');
const himeko = initialState.units.find(u => u.id === 'himeko');
const jingliu = initialState.units.find(u => u.id === 'jingliu');

if (!asta || !himeko || !jingliu) {
    console.error('Characters not found in state');
    process.exit(1);
}

console.log(`Asta Element: ${asta.element}`);
console.log(`Himeko Element: ${himeko.element} (Should match Asta)`);
console.log(`Jingliu Element: ${jingliu.element} (Should NOT match Asta)`);

// 2. Run Handler
const factory = createGenericLightConeHandlerFactory(planetaryRendezvous, 5);
const { handlerMetadata, handlerLogic } = factory('asta', 80);

// Simulate BATTLE_START event
const event = { type: 'ON_BATTLE_START', sourceId: 'system', value: 0 };
// @ts-ignore
const newState = handlerLogic(event, initialState, handlerMetadata.id);

// 3. Verify Result
const updatedHimeko = newState.units.find(u => u.id === 'himeko');
const updatedJingliu = newState.units.find(u => u.id === 'jingliu');

// Himeko (Fire) should get buff
const himekoDmgBoost = updatedHimeko?.stats.fire_dmg_boost || 0;
console.log(`Himeko Fire DMG Boost: ${himekoDmgBoost}`);

// Jingliu (Ice) should NOT get buff
const jingliuDmgBoost = updatedJingliu?.stats.ice_dmg_boost || 0;
console.log(`Jingliu Ice DMG Boost: ${jingliuDmgBoost}`);

// Check for localized effect name
const effect = updatedHimeko?.effects.find(e => e.name === '惑星との出会い (与ダメ)');
if (effect) {
    console.log('SUCCESS: Localized effect name found.');
} else {
    console.log('FAILURE: Localized effect name NOT found.');
}

if (Math.abs(himekoDmgBoost - 0.24) < 0.001) {
    console.log('SUCCESS: Himeko received DMG boost.');
} else {
    console.error(`FAILURE: Himeko did NOT receive DMG boost. Expected 0.24, got ${himekoDmgBoost}`);
}

if (jingliuDmgBoost === 0) {
    console.log('SUCCESS: Jingliu did NOT receive DMG boost.');
} else {
    console.error(`FAILURE: Jingliu received DMG boost. Expected 0, got ${jingliuDmgBoost}`);
}
