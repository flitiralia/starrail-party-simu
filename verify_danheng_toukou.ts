
import { Character, CharacterBaseStats, Enemy } from './app/types/index';
import { GameState, SimulationConfig } from './app/simulator/engine/types';
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch } from './app/simulator/engine/dispatcher';
import { runSimulation, stepSimulation } from './app/simulator/engine/simulation';
import { danHengToukouHandlerFactory, DanHengToukou } from './app/data/characters/dan-heng-permansor-terrae';
import { initializeActionQueue } from './app/simulator/engine/actionValue';

// Note: Ensure all imports have .ts if required by environment.

// Mock Enemy
const enemy: Enemy = {
    id: 'enemy',
    name: 'Test Enemy',
    element: 'Physical',
    baseStats: {
        hp: 100000,
        atk: 100,
        def: 100,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    toughness: 100,
    baseRes: { Physical: 0 },
    abilities: {
        basic: { id: 'e-b', name: 'Basic', type: 'Basic ATK', description: '' },
        skill: { id: 'e-s', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'e-u', name: 'Ultimate', type: 'Ultimate', description: '' },
        talent: { id: 'e-t', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'e-te', name: 'Tech', type: 'Technique', description: '' },
    }
};

// Mock Ally (Target for Comrade)
const ally: Character = {
    ...DanHengToukou,
    id: 'ally-test',
    name: 'Ally',
    baseStats: { ...DanHengToukou.baseStats, atk: 2000 },
};

// Initialize State
const simConfig: SimulationConfig = {
    characters: [DanHengToukou, ally],
    enemies: [enemy],
    weaknesses: new Set(['Physical']),
    partyConfig: {
        members: [
            {
                character: DanHengToukou,
                config: {
                    rotation: ['s', 'b', 'b'],
                    rotationMode: 'sequence',
                    ultStrategy: 'immediate',
                    ultCooldown: 0
                },
                enabled: true,
                eidolonLevel: 6 // Testing Max Potential
            },
            {
                character: ally,
                config: { rotation: ['basic'], rotationMode: 'sequence', ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0
            }
        ]
    },
    enemyConfig: {
        level: 80,
        maxHp: 100000,
        spd: 100,
        toughness: 100
    },
    rounds: 2
};

let state = createInitialGameState(simConfig);
state = { ...state, skillPoints: 5 };

// Register Handlers
state.units.forEach(unit => {
    if (unit.id === DanHengToukou.id) {
        const { handlerMetadata, handlerLogic } = danHengToukouHandlerFactory(unit.id, unit.level, 6);
        state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: [{ metadata: handlerMetadata, logic: handlerLogic }] });
    }
});
state = dispatch(state, { type: 'BATTLE_START' });

if (state.actionQueue.length === 0) {
    state.actionQueue = initializeActionQueue(state.units);
}

console.log('--- START SIMULATION ---');

// Check Initial AV for Bai Hua (Forward 40%)
// Base SPD 97 -> AV 103.
// Reduced by 40% -> AV 61.8?
const initDhAV = state.actionQueue.find(i => i.unitId === DanHengToukou.id)?.actionValue;
console.log(`Initial Dan Heng AV: ${initDhAV?.toFixed(1)} (Expected ~61.8 with 40% Advance from 103)`);

// Check Technique EP
const dhUnit = state.units.find(u => u.id === DanHengToukou.id);
console.log(`Initial Dan Heng EP: ${dhUnit?.ep}/${DanHengToukou.maxEnergy} (Expected 30/135 from Technique assuming 0 start or 67.5 if half start is default?)`);
// Assuming 0 start usually? Unit default EP is usually 0 unless defined.
// Actually Simulation defaults often init at 50% or 0? 
// In types.ts/initializeUnit, it defaults to maxEnergy * 0.5 usually unless overridden.
// Let's see the log.

const techniqueLog = state.log.find(l => l.actionType === 'Technique' && l.sourceId === DanHengToukou.id);
if (techniqueLog) {
    console.log(`✅ Technique Triggered: ${techniqueLog.details}`);
} else {
    console.error(`❌ Technique NOT Triggered for Dan Heng`);
}

let summonCreated = false;
let summonId = '';

for (let i = 0; i < 25; i++) {
    const nextItem = state.actionQueue[0];
    const nextUnit = state.units.find(u => u.id === nextItem?.unitId);

    console.log(`[Step ${i}] Next: ${nextUnit?.name} (${nextItem?.unitId}) AV:${nextItem?.actionValue.toFixed(1)}`);

    // Force Ally attack to trigger Bai Hua
    if (nextUnit?.id === ally.id && summonCreated) {
        console.log('Simulating Ally Attack to trigger Bai Hua');
        // Dispatch happens within stepSimulation usually, but we need to ensure DAMAGE_DEALT fires.
        // It does if they use Basic Atk.
    }

    state = stepSimulation(state);

    // After step checkers
    const summons = state.units.filter(u => u.isSummon);
    if (!summonCreated && summons.length > 0) {
        console.log('✅ Summon Created!');
        summonCreated = true;
        summonId = summons[0].id;
    }

    // Check E6 Debuff on Enemy
    const e = state.units.find(u => u.id === 'enemy');
    if (e) {
        const hasE6 = e.effects.some(ef => ef.name === 'E6 Vuln');
        // E6 Vuln typically applied on Skill usage in my logic
        if (hasE6) console.log('✅ Enemy has E6 Vulnerability');
    }

    // Check Comrade Buffs on Ally
    const testAlly = state.units.find(u => u.id === ally.id);
    if (testAlly) {
        const comradeBuff = testAlly.effects.find(ef => ef.name === '同袍');
        if (comradeBuff) {
            const mods = comradeBuff.modifiers || [];
            if (mods.some(m => m.source === 'Trace: Wei Guan')) console.log('✅ Wei Guan ATK Buff Active');
            if (mods.some(m => m.source === 'E4 Damage Reduction')) console.log('✅ E4 Dmg Reduction Active');
            if (mods.some(m => m.source === 'E6 Def Ignore')) console.log('✅ E6 Def Ignore Active');
        }
    }
}

state.log.forEach((l, idx) => {
    if (l.actionType === 'Shield') {
        console.log(`[Log ${idx}] Shield: ${l.shieldApplied} details: ${l.details}`);
    }
    if (l.actionType === 'Ultimate' || l.sourceId?.includes('dragon')) {
        console.log(`[Log ${idx}] ${l.actionType} by ${l.sourceId}: ${l.details} Dmg:${l.damageDealt}`);
    }
});
