
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch } from './app/simulator/engine/dispatcher';
import { Character, Enemy, IAbility } from './app/types';
import { danceDanceDance } from './app/data/light-cones/dance-dance-dance';
import { createGenericLightConeHandlerFactory } from './app/simulator/engine/handlers/generic';
import { SimulationConfig } from './app/simulator/engine/types';

// Mock Data
const mockHarmony: Character = {
    id: 'harmony-char',
    name: 'Harmony MC',
    path: 'Harmony',
    element: 'Imaginary',
    level: 80,
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
        ultimate: { id: 'ult', name: 'Ult', type: 'Ultimate', description: '', targetType: 'all_allies', energyGain: 5 } as IAbility,
        talent: { id: 'talent', name: 'Talent', type: 'Talent', description: '' } as IAbility,
        technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '' } as IAbility,
    },
    equippedLightCone: {
        lightCone: danceDanceDance,
        level: 80,
        superimposition: 1, // S1: 16% Advance
    },
    relics: [],
    traces: [],
    ornaments: [],
};

const mockAlly: Character = {
    id: 'ally-char',
    name: 'Ally DPS',
    path: 'The Hunt',
    element: 'Quantum',
    level: 80,
    maxEnergy: 100,
    baseStats: {
        hp: 1000,
        atk: 1000,
        def: 500,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.5
    },
    abilities: {
        basic: { id: 'a_basic', name: 'Basic', type: 'Basic ATK', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        skill: { id: 'a_skill', name: 'Skill', type: 'Skill', description: '' } as IAbility,
        ultimate: { id: 'a_ult', name: 'Ult', type: 'Ultimate', description: '' } as IAbility,
        talent: { id: 'a_talent', name: 'Talent', type: 'Talent', description: '' } as IAbility,
        technique: { id: 'a_tech', name: 'Tech', type: 'Technique', description: '' } as IAbility,
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
    baseStats: { hp: 10000, atk: 100, def: 0, spd: 100, critRate: 0, critDmg: 0 },
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
    characters: [mockHarmony, mockAlly],
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
const factory = createGenericLightConeHandlerFactory(danceDanceDance, 1);
const { handlerMetadata, handlerLogic } = factory(mockHarmony.id, 80);
state = dispatch(state, {
    type: 'REGISTER_HANDLERS',
    handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
});

console.log('Initial State created.');

// Helper to get Action Point
function getActionPoint(s: typeof state, unitId: string): number {
    const u = s.units.find(u => u.id === unitId);
    return u ? u.actionPoint : 0;
}

// 1. Test Action Advance on Ultimate
console.log('--- Test Action Advance on Ultimate ---');
const initialAP_Harmony = getActionPoint(state, mockHarmony.id);
const initialAP_Ally = getActionPoint(state, mockAlly.id);
console.log(`Initial AP - Harmony: ${initialAP_Harmony}, Ally: ${initialAP_Ally}`);

console.log('Dispatching Ultimate...');
state = dispatch(state, {
    type: 'ULTIMATE',
    sourceId: mockHarmony.id,
    targetId: mockHarmony.id, // Self or Ally doesn't matter for DDD trigger, but Ult usually targets
});

const finalAP_Harmony = getActionPoint(state, mockHarmony.id);
const finalAP_Ally = getActionPoint(state, mockAlly.id);
console.log(`Final AP - Harmony: ${finalAP_Harmony}, Ally: ${finalAP_Ally}`);

const advanceAmount = 10000 * 0.16; // 1600

if (Math.abs(finalAP_Harmony - (initialAP_Harmony + advanceAmount)) < 1) {
    console.log('SUCCESS: Harmony Advanced correctly.');
} else {
    console.log(`FAILURE: Harmony AP mismatch. Expected ${initialAP_Harmony + advanceAmount}, got ${finalAP_Harmony}`);
}

if (Math.abs(finalAP_Ally - (initialAP_Ally + advanceAmount)) < 1) {
    console.log('SUCCESS: Ally Advanced correctly.');
} else {
    console.log(`FAILURE: Ally AP mismatch. Expected ${initialAP_Ally + advanceAmount}, got ${finalAP_Ally}`);
}

// Check logs
const logEntry = state.log.find(l => l.details && l.details.includes('ダンス！ダンス！ダンス！発動'));
if (logEntry) {
    console.log('SUCCESS: Log entry found.');
} else {
    console.log('FAILURE: Log entry missing.');
}
