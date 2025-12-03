
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch } from './app/simulator/engine/dispatcher';
import { Character, Enemy, IAbility } from './app/types';
import { onTheFallOfAnAeon } from './app/data/light-cones/on-the-fall-of-an-aeon';
import { createGenericLightConeHandlerFactory } from './app/simulator/engine/handlers/generic';
import { SimulationConfig } from './app/simulator/engine/types';

// Mock Data
const mockCharacter: Character = {
    id: 'destruction-char',
    name: 'Destruction MC',
    path: 'Destruction',
    element: 'Physical',
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
        basic: {
            id: 'basic',
            name: 'Basic Atk',
            type: 'Basic ATK',
            description: 'Basic Attack',
            damage: { scaling: 'atk', multiplier: 1.0 },
            energyGain: 20,
            toughnessReduction: 30,
        } as IAbility,
        skill: {
            id: 'skill',
            name: 'Skill',
            type: 'Skill',
            description: 'Skill',
            damage: { scaling: 'atk', multiplier: 2.0 },
            energyGain: 30,
            toughnessReduction: 60,
        } as IAbility,
        ultimate: {
            id: 'ult',
            name: 'Ult',
            type: 'Ultimate',
            description: 'Ultimate',
            damage: { scaling: 'atk', multiplier: 3.0 },
            energyGain: 5,
            toughnessReduction: 90,
            targetType: 'all_enemies',
        } as IAbility,
        talent: {
            id: 'talent',
            name: 'Talent',
            type: 'Talent',
            description: 'Talent',
        } as IAbility,
        technique: {
            id: 'tech',
            name: 'Tech',
            type: 'Technique',
            description: 'Technique',
        } as IAbility,
    },
    equippedLightCone: {
        lightCone: onTheFallOfAnAeon,
        level: 80,
        superimposition: 1, // S1: 8% ATK, 12% DMG
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
    element: 'Physical', // Weak to Physical
    baseStats: {
        hp: 10000,
        atk: 100,
        def: 0,
        spd: 100,
        critRate: 0,
        critDmg: 0
    },
    abilities: {
        basic: { id: 'e_basic', name: 'Trot', type: 'Basic ATK', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        skill: { id: 'e_skill', name: 'Run', type: 'Skill', description: '' } as IAbility,
        ultimate: { id: 'e_ult', name: 'Flee', type: 'Ultimate', description: '' } as IAbility,
        talent: { id: 'e_talent', name: 'Hide', type: 'Talent', description: '' } as IAbility,
        technique: { id: 'e_tech', name: 'Start', type: 'Technique', description: '' } as IAbility,
    },
    toughness: 30, // Low toughness for easy break
    maxToughness: 30,
    weaknesses: new Set(['Physical']),
    currentHp: 10000,
    baseRes: {},
};

const config: SimulationConfig = {
    characters: [mockCharacter],
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
const factory = createGenericLightConeHandlerFactory(onTheFallOfAnAeon, 1);
const { handlerMetadata, handlerLogic } = factory(mockCharacter.id, 80);
state = dispatch(state, {
    type: 'REGISTER_HANDLERS',
    handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
});

console.log('Initial State created.');

// Helper to get ATK%
function getAtkPct(s: typeof state, unitId: string): number {
    const u = s.units.find(u => u.id === unitId);
    if (!u) return 0;
    const mod = u.modifiers.find(m => m.source === 'lc-aeon-atk');
    return mod ? mod.value : 0;
}

// Helper to get DMG%
function getDmgPct(s: typeof state, unitId: string): number {
    const u = s.units.find(u => u.id === unitId);
    if (!u) return 0;
    const mod = u.modifiers.find(m => m.source === 'lc-aeon-dmg');
    return mod ? mod.value : 0;
}

// 1. Test ATK Stacking
console.log('--- Test ATK Stacking ---');
console.log(`Initial ATK%: ${getAtkPct(state, mockCharacter.id)}`);

// Attack 1
console.log('Dispatching Attack 1...');
state = dispatch(state, {
    type: 'BASIC_ATTACK',
    sourceId: mockCharacter.id,
    targetId: mockEnemy.id,
});
console.log(`ATK% after 1 stack: ${getAtkPct(state, mockCharacter.id)}`);
// S1: 8% = 0.08
if (Math.abs(getAtkPct(state, mockCharacter.id) - 0.08) < 0.001) {
    console.log('SUCCESS: Stack 1 applied.');
} else {
    console.log('FAILURE: Stack 1 incorrect.');
}

// Attack 2
console.log('Dispatching Attack 2...');
state = dispatch(state, {
    type: 'SKILL', // Use skill to verify it also works
    sourceId: mockCharacter.id,
    targetId: mockEnemy.id,
});
console.log(`ATK% after 2 stacks: ${getAtkPct(state, mockCharacter.id)}`);
// S1: 16% = 0.16
if (Math.abs(getAtkPct(state, mockCharacter.id) - 0.16) < 0.001) {
    console.log('SUCCESS: Stack 2 applied.');
} else {
    console.log('FAILURE: Stack 2 incorrect.');
}

// 2. Test Weakness Break DMG Buff
console.log('--- Test Weakness Break DMG Buff ---');
// Reset enemy toughness (it might have broken already if 30 toughness and we did 30+60 dmg)
// Actually, Basic (30) + Skill (60) = 90 toughness dmg. Enemy has 30.
// So it should have broken on first attack.
// Let's check logs for break.
const breakLog = state.log.find(l => l.actionType === 'ON_WEAKNESS_BREAK' || (l.details && l.details.includes('Break')));
if (breakLog) {
    console.log('Enemy was broken.');
}

console.log(`DMG% after break: ${getDmgPct(state, mockCharacter.id)}`);
// S1: 12% = 0.12
if (Math.abs(getDmgPct(state, mockCharacter.id) - 0.12) < 0.001) {
    console.log('SUCCESS: DMG buff applied on break.');
} else {
    console.log('FAILURE: DMG buff missing or incorrect.');
}

// Check duration
const unit = state.units.find(u => u.id === mockCharacter.id);
const dmgEffect = unit?.effects.find(e => e.name === '火に飛び込む (与ダメ)');
if (dmgEffect && dmgEffect.duration === 2) {
    console.log('SUCCESS: DMG buff duration is 2.');
} else {
    console.log(`FAILURE: DMG buff duration is ${dmgEffect?.duration}.`);
}
