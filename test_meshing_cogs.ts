
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch } from './app/simulator/engine/dispatcher';
import { createGenericLightConeHandlerFactory } from './app/simulator/engine/handlers/generic';
import { SimulationConfig } from './app/simulator/engine/types';
import { Character, Enemy, IAbility } from './app/types';
import { meshingCogs } from './app/data/light-cones/meshing-cogs';

// Mock Character with Meshing Cogs
const tingyun: Character = {
    id: 'tingyun',
    name: 'Tingyun',
    element: 'Lightning',
    path: 'Harmony',
    baseStats: { hp: 1000, atk: 500, def: 300, spd: 100, critRate: 0.05, critDmg: 0.5 },
    abilities: {
        basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', description: '', damage: { scaling: 'atk', multiplier: 1 }, energyGain: 20 } as IAbility,
        skill: { id: 'skill', name: 'Skill', type: 'Skill', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        ultimate: { id: 'ult', name: 'Ultimate', type: 'Ultimate', description: '', damage: { scaling: 'atk', multiplier: 1 }, targetType: 'ally' } as IAbility,
        talent: { id: 'talent', name: 'Talent', type: 'Talent', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        technique: { id: 'tech', name: 'Technique', type: 'Technique', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
    },
    equippedLightCone: {
        lightCone: meshingCogs,
        superimposition: 5,
        level: 80,
    },
    relics: [],
    ornaments: [],
    traces: [],
    maxEnergy: 130,
};

const enemy: Enemy = {
    id: 'enemy1',
    name: 'Trotter',
    element: 'Quantum',
    toughness: 30,
    isEnemy: true,
    maxToughness: 30,
    currentHp: 10000,
    baseStats: { hp: 10000, atk: 100, def: 100, spd: 100, critRate: 0.05, critDmg: 0.5 },
    baseRes: {},
    abilities: {
        basic: { id: 'basic', name: 'Trot', type: 'Basic ATK', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        skill: { id: 'skill', name: 'Skill', type: 'Skill', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        ultimate: { id: 'ult', name: 'Ultimate', type: 'Ultimate', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        talent: { id: 'talent', name: 'Talent', type: 'Talent', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
        technique: { id: 'tech', name: 'Technique', type: 'Technique', description: '', damage: { scaling: 'atk', multiplier: 1 } } as IAbility,
    },
    weaknesses: new Set(['Lightning']),
};

const config: SimulationConfig = {
    characters: [tingyun],
    enemies: [enemy],
    weaknesses: new Set(['Lightning']),
    characterConfig: {
        rotation: ['basic'],
        ultStrategy: 'immediate',
        ultCooldown: 0,
    },
    enemyConfig: {
        level: 80,
        maxHp: 10000,
        toughness: 30,
    },
    rounds: 1,
};

let state = createInitialGameState(config);

// Register Handler
const factory = createGenericLightConeHandlerFactory(meshingCogs, 5);
const { handlerMetadata, handlerLogic } = factory(tingyun.id, 80);
state = dispatch(state, {
    type: 'REGISTER_HANDLERS',
    handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
});

console.log('Initial State created.');

// 1. Test Attack (Basic ATK)
console.log('Dispatching Basic Attack...');
const initialEp = state.units.find(u => u.id === tingyun.id)?.ep || 0;
state = dispatch(state, {
    type: 'BASIC_ATTACK',
    sourceId: tingyun.id,
    targetId: enemy.id,
});

const afterAttackEp = state.units.find(u => u.id === tingyun.id)?.ep || 0;
// Basic ATK gives 20 EP. Meshing Cogs S5 gives 8 EP. Total 28.
console.log(`EP after attack: ${afterAttackEp} (Initial: ${initialEp})`);

const logEntry = state.log.find(l => l.details && l.details.includes('輪契発動'));
if (logEntry) {
    console.log('SUCCESS: Meshing Cogs triggered on attack.');
} else {
    console.log('FAILURE: Meshing Cogs did not trigger on attack.');
}

// 2. Test Cooldown (Attack again immediately)
console.log('Dispatching Second Attack (should be on cooldown)...');
const epBeforeSecondAttack = afterAttackEp;
// Clear log to check new entry
state = { ...state, log: [] };

state = dispatch(state, {
    type: 'BASIC_ATTACK',
    sourceId: tingyun.id,
    targetId: enemy.id,
});

const epAfterSecondAttack = state.units.find(u => u.id === tingyun.id)?.ep || 0;
// Should only gain 20 EP from Basic ATK, no Meshing Cogs (8 EP).
const gain = epAfterSecondAttack - epBeforeSecondAttack;
console.log(`EP gain on second attack: ${gain}`);

const logEntry2 = state.log.find(l => l.details && l.details.includes('輪契発動'));
if (!logEntry2 && gain === 20) {
    console.log('SUCCESS: Meshing Cogs respected cooldown.');
} else {
    console.log('FAILURE: Meshing Cogs triggered despite cooldown or wrong EP gain.');
}

// 3. Test Getting Hit (Reset cooldown first)
// Manually reset cooldown to simulate new turn
const handlerId = `lc-meshing-cogs-${tingyun.id}`;
state = { ...state, cooldowns: { ...state.cooldowns, [handlerId]: 0 } };
console.log('Cooldown reset manually.');

console.log('Dispatching Enemy Attack (Getting Hit)...');
const epBeforeHit = state.units.find(u => u.id === tingyun.id)?.ep || 0;
state = { ...state, log: [] };

// Enemy attacks Tingyun
state = dispatch(state, {
    type: 'BASIC_ATTACK',
    sourceId: enemy.id,
    targetId: tingyun.id,
});

const epAfterHit = state.units.find(u => u.id === tingyun.id)?.ep || 0;
const logEntry3 = state.log.find(l => l.details && l.details.includes('輪契発動'));
if (logEntry3) {
    console.log('SUCCESS: Meshing Cogs triggered on getting hit.');
    console.log(`EP gain: ${epAfterHit - epBeforeHit}`);
} else {
    console.log('FAILURE: Meshing Cogs did not trigger on getting hit.');
}
