
import { Character, CharacterBaseStats, Enemy } from './app/types';
import { GameState, SimulationConfig } from './app/simulator/engine/types';
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch } from './app/simulator/engine/dispatcher';
import { runSimulation, stepSimulation } from './app/simulator/engine/simulation';
import { danHengToukouHandlerFactory, DanHengToukou } from './app/data/characters/dan-heng-permansor-terrae';
import { initializeActionQueue } from './app/simulator/engine/actionValue';

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

// Initialize State (SOLO DAN HENG)
const simConfig: SimulationConfig = {
    characters: [DanHengToukou],
    enemies: [enemy],
    weaknesses: new Set(['Physical']),
    partyConfig: {
        members: [
            {
                character: DanHengToukou,
                config: {
                    rotation: ['s', 'b', 'b', 'u'], // Use Skill first
                    rotationMode: 'sequence',
                    ultStrategy: 'immediate',
                    ultCooldown: 0
                },
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
        const { handlerMetadata, handlerLogic } = danHengToukouHandlerFactory(unit.id, unit.level, 0);
        state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: [{ metadata: handlerMetadata, logic: handlerLogic }] });
    }
});
state = dispatch(state, { type: 'BATTLE_START' });

if (state.actionQueue.length === 0) {
    state.actionQueue = initializeActionQueue(state.units);
}

console.log('--- START SOLOT SIMULATION ---');
console.log(`Registered Handlers: ${state.eventHandlers?.length || 0}`);
state.eventHandlers?.forEach(h => console.log(`- ${h.id}`));

let summonCreated = false;

for (let i = 0; i < 20; i++) {
    const nextUnitId = state.actionQueue[0]?.unitId;
    const nextUnit = state.units.find(u => u.id === nextUnitId);

    console.log(`[Step ${i}] Next: ${nextUnit?.name} (${nextUnitId}) AV:${state.actionQueue[0]?.actionValue.toFixed(1)}`);

    state = stepSimulation(state);

    // After step, check for Summon
    const summons = state.units.filter(u => u.isSummon);
    if (!summonCreated && summons.length > 0) {
        console.log('✅ Summon Created!');
        summonCreated = true;
    }
}

state.log.forEach((l, idx) => {
    if ((l.actionType === 'スキル' || l.actionType === 'SKILL') && l.sourceId === DanHengToukou.id) {
        console.log(`[Log ${idx}] Skill by Dan Heng. Details: ${l.details}, Shield: ${l.shieldApplied}`);
        // Effects applied?
        console.log(`  Effects on Dan Heng: ${state.units.find(u => u.id === DanHengToukou.id)?.effects.map(e => e.name).join(', ')}`);
    }
});

const summon = state.units.find(u => u.isSummon);
if (summon) {
    console.log('✅ Summon Found at end of sim');
} else {
    console.error('❌ Summon was NOT found at end of sim');
}
