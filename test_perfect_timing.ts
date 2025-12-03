
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch } from './app/simulator/engine/dispatcher';
import { Character, Enemy, IAbility } from './app/types';
import { perfectTiming } from './app/data/light-cones/perfect-timing';
import { createGenericLightConeHandlerFactory } from './app/simulator/engine/handlers/generic';
import { SimulationConfig } from './app/simulator/engine/types';

// Mock Data
const mockAbundance: Character = {
    id: 'abundance-char',
    name: 'Abundance MC',
    path: 'Abundance',
    element: 'Imaginary',
    maxEnergy: 100,
    baseStats: {
        hp: 1000,
        atk: 500,
        def: 500,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.5
    },
    abilities: {
        basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        skill: { id: 'skill', name: 'Skill', type: 'Skill', description: '' } as IAbility,
        ultimate: { id: 'ult', name: 'Ult', type: 'Ultimate', description: '' } as IAbility,
        talent: { id: 'talent', name: 'Talent', type: 'Talent', description: '' } as IAbility,
        technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '' } as IAbility,
    },
    equippedLightCone: {
        lightCone: perfectTiming,
        level: 80,
        superimposition: 1, // S1: 33% of RES, Max 15%
    },
    relics: [],
    traces: [],
    ornaments: [],
};

const mockEnemy: Enemy = {
    id: 'trotter',
    name: 'Trotter',
    level: 80,
    isEnemy: true,
    element: 'Physical',
    baseStats: { hp: 10000, atk: 100, def: 0, spd: 100, critRate: 0.05, critDmg: 0.5 },
    abilities: {
        basic: { id: 'e_basic', name: 'Trot', type: 'Basic ATK', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        skill: { id: 'e_skill', name: 'Run', type: 'Skill', description: '' } as IAbility,
        ultimate: { id: 'e_ult', name: 'Flee', type: 'Ultimate', description: '' } as IAbility,
        talent: { id: 'e_talent', name: 'Hide', type: 'Talent', description: '' } as IAbility,
        technique: { id: 'e_tech', name: 'Start', type: 'Technique', description: '' } as IAbility,
    },
    toughness: 30,
    maxToughness: 30,
    weaknesses: new Set(['Physical']),
    currentHp: 10000,
    baseRes: {},
};

const config: SimulationConfig = {
    characters: [mockAbundance],
    enemies: [mockEnemy],
    weaknesses: new Set(['Physical']),
    characterConfig: {
        rotation: ['basic'],
        ultStrategy: 'immediate',
        ultCooldown: 3,
    },
    enemyConfig: {
        level: 80,
        maxHp: 10000,
        toughness: 30
    },
    rounds: 1,
};

// Setup
let state = createInitialGameState(config);

// Register handlers manually
const factory = createGenericLightConeHandlerFactory(perfectTiming, 1);
const { handlerMetadata, handlerLogic } = factory(mockAbundance.id, 80);
state = dispatch(state, {
    type: 'REGISTER_HANDLERS',
    handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
});

console.log('Initial State created.');

// Helper to get Outgoing Healing Boost
function getHealingBoost(s: typeof state, unitId: string): number {
    const u = s.units.find(u => u.id === unitId);
    return u?.stats.outgoing_healing_boost || 0;
}

// Helper to set Effect RES (hacky, directly modifying state for test)
function setEffectRes(s: typeof state, unitId: string, res: number): typeof state {
    const uIndex = s.units.findIndex(u => u.id === unitId);
    if (uIndex === -1) return s;
    const u = { ...s.units[uIndex] };
    u.stats = { ...u.stats, effect_res: res };
    const newUnits = [...s.units];
    newUnits[uIndex] = u;
    return { ...s, units: newUnits };
}

// 1. Initial Check (Effect RES should be base + LC passive)
// Base 0. LC passive gives 16% (S1). Total 0.16.
// Healing Boost = 0.16 * 0.33 = 0.0528.
console.log('--- Test Initial Healing Boost ---');
state = dispatch(state, { type: 'BATTLE_START' });

const initialRes = state.units.find(u => u.id === mockAbundance.id)?.stats.effect_res || 0;
console.log(`Initial Effect RES: ${initialRes}`);
const initialBoost = getHealingBoost(state, mockAbundance.id);
console.log(`Initial Healing Boost: ${initialBoost}`);

if (Math.abs(initialBoost - (0.16 * 0.33)) < 0.001) {
    console.log('SUCCESS: Initial Healing Boost correct.');
} else {
    console.log(`FAILURE: Initial Healing Boost incorrect. Expected ${0.16 * 0.33}, got ${initialBoost}`);
}

// 2. Increase Effect RES and Check Update
console.log('--- Test Dynamic Update ---');
state = setEffectRes(state, mockAbundance.id, 0.5);
console.log('Effect RES set to 0.5.');

state = dispatch(state, {
    type: 'BASIC_ATTACK',
    sourceId: mockAbundance.id,
    targetId: mockEnemy.id
});

const updatedBoost = getHealingBoost(state, mockAbundance.id);
console.log(`Updated Healing Boost: ${updatedBoost}`);

// Check effect name in log/state
const unit = state.units.find(u => u.id === mockAbundance.id);
const effect = unit?.effects.find(e => e.name === '屈折する視線 (治癒量)');
if (effect) {
    console.log('SUCCESS: Effect name is localized.');
} else {
    console.log('FAILURE: Effect name not found or not localized.');
}

if (Math.abs(updatedBoost - 0.15) < 0.001) {
    console.log('SUCCESS: Healing Boost capped at 15%.');
} else {
    console.log(`FAILURE: Healing Boost incorrect. Expected 0.15, got ${updatedBoost}`);
}

// 3. Lower Effect RES
console.log('--- Test Lowering RES ---');
state = setEffectRes(state, mockAbundance.id, 0.2);
console.log('Effect RES set to 0.2.');

state = dispatch(state, {
    type: 'BASIC_ATTACK',
    sourceId: mockAbundance.id,
    targetId: mockEnemy.id
});

const loweredBoost = getHealingBoost(state, mockAbundance.id);
console.log(`Lowered Healing Boost: ${loweredBoost}`);

if (Math.abs(loweredBoost - 0.066) < 0.001) {
    console.log('SUCCESS: Healing Boost updated downwards.');
} else {
    console.log(`FAILURE: Healing Boost incorrect. Expected 0.066, got ${loweredBoost}`);
}
