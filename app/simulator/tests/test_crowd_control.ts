import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { stepSimulation } from '../engine/simulation';
import { SimulationConfig, EnemyConfig } from '../../types/index';
import { registry } from '../registry/index';
import { march7thHandlerFactory } from '../../data/characters/march-7th';
import { IEffect } from '../effect/types';

// Register March (dummy)
registry.registerCharacter('march-7th', march7thHandlerFactory);

// Mock Enemy
const mockEnemy: EnemyConfig = {
    id: 'enemy-1',
    name: 'Mock Enemy',
    level: 80,
    baseStats: { hp: 10000, atk: 1000, def: 1000, spd: 100, effect_res: 0 },
    baseRes: {},
    maxToughness: 100,
    toughness: 100,
    abilities: { basic: { id: 'e-b', name: 'A', type: 'Basic ATK', targetType: 'single', damage: { type: 'simple', scaling: 'atk', multiplier: 1 } } },
    isEnemy: true,
};

const config: SimulationConfig = {
    characters: [],
    enemies: [mockEnemy],
    weaknesses: new Set(['Ice']),
    enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
    partyConfig: { members: [] },
    rounds: 10,
};

// Helper to run test for a specific CC type
function runCCTest(ccType: 'Entanglement' | 'Imprisonment' | 'Freeze') {
    console.log(`\n--- Testing ${ccType} ---`);
    let state = createInitialGameState(config);
    state = dispatch(state, { type: 'BATTLE_START' });

    const ccEffect: IEffect = {
        id: `cc-${ccType}`,
        name: ccType,
        category: 'STATUS',
        type: 'BreakStatus',
        sourceUnitId: 'enemy-1',
        durationType: 'TURN_START_BASED',
        duration: 1,
        onApply: (t, s) => s,
        onRemove: (t, s) => s,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
    (ccEffect as any).statusType = ccType;
    if (ccType === 'Entanglement') {
        (ccEffect as any).baseDamagePerStack = 100;
        (ccEffect as any).stackCount = 1;
    }

    // Add effect
    state = {
        ...state,
        units: state.units.map(u => {
            if (u.id === 'enemy-1') {
                return { ...u, effects: [ccEffect] };
            }
            return u;
        })
    };

    // Step Simulation
    state = stepSimulation(state);

    // Check Log
    const turnSkipLog = state.log.find(l => l.actionType === 'TurnSkipped');
    if (turnSkipLog && turnSkipLog.details.includes(ccType)) {
        console.log(`SUCCESS: ${ccType} caused TurnSkipped.`);
    } else {
        console.error(`FAILURE: ${ccType} did NOT cause TurnSkipped.`);
        console.log('Last Log:', state.log[state.log.length - 1]);
    }

    // Check Duration Decrease (should be 0 and removed)
    const enemy = state.units.find(u => u.id === 'enemy-1');
    const effect = enemy?.effects.find(e => e.name === ccType);
    if (!effect) {
        console.log(`SUCCESS: ${ccType} effect removed (duration 0).`);
    } else {
        console.error(`FAILURE: ${ccType} effect still exists with duration ${effect.duration}.`);
    }
}

// Run Tests
runCCTest('Entanglement');
runCCTest('Imprisonment');
runCCTest('Freeze');
