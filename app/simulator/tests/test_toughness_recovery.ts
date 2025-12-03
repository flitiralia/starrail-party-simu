import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { stepSimulation } from '../engine/simulation';
import { SimulationConfig, EnemyConfig } from '../../types/index';
import { registry } from '../registry/index';
import { march7thHandlerFactory } from '../../data/characters/march-7th';
import { IEffect } from '../effect/types';

// Register March (dummy)
registry.registerCharacter('march-7th', march7thHandlerFactory);

// Create March Character Object
const march7thCharacter = {
    id: 'march-7th',
    name: 'March 7th',
    element: 'Ice',
    path: 'Preservation',
    rarity: 4,
    maxEnergy: 120,
    baseStats: { hp: 1000, atk: 500, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 100 },
    abilities: { basic: { id: 'm-b', name: 'A', type: 'Basic ATK', targetType: 'single', damage: { type: 'simple', scaling: 'atk', multiplier: 1 } } } as any,
    traces: [],
} as any;

// Mock Enemy
const mockEnemy: EnemyConfig = {
    id: 'enemy-1',
    name: 'Mock Enemy',
    level: 80,
    baseStats: { hp: 10000, atk: 1000, def: 1000, spd: 200, effect_res: 0, critRate: 0.05, critDmg: 0.5, aggro: 100 },
    baseRes: {},
    maxToughness: 100,
    toughness: 100,
    abilities: { basic: { id: 'e-b', name: 'A', type: 'Basic ATK', targetType: 'single', damage: { type: 'simple', scaling: 'atk', multiplier: 1 } } },
    isEnemy: true,
} as any;

const config: SimulationConfig = {
    characters: [march7thCharacter],
    enemies: [mockEnemy],
    weaknesses: new Set(['Ice']),
    enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 200 },
    partyConfig: {
        members: [{
            character: march7thCharacter,
            config: { rotation: ['b'], ultStrategy: 'cooldown', ultCooldown: 0 },
            enabled: true,
            eidolonLevel: 0
        }]
    },
    rounds: 10,
};

function runTest(shouldSkip: boolean) {
    console.log(`\n--- Testing Toughness Recovery (Skip: ${shouldSkip}) ---`);
    let state = createInitialGameState(config);
    state = dispatch(state, { type: 'BATTLE_START' });

    // Set Toughness to 0
    state = {
        ...state,
        units: state.units.map(u => {
            if (u.id === 'enemy-1') {
                return { ...u, toughness: 0 };
            }
            return u;
        })
    };

    if (shouldSkip) {
        // Add Skip Effect
        const skipEffect: IEffect = {
            id: 'skip-recovery',
            name: 'Skip Recovery',
            category: 'DEBUFF',
            sourceUnitId: 'enemy-1',
            durationType: 'TURN_START_BASED',
            duration: 1,
            tags: ['SKIP_TOUGHNESS_RECOVERY'],
            onApply: (t, s) => s,
            onRemove: (t, s) => s,
            apply: (t, s) => s,
            remove: (t, s) => s,
        };
        state = {
            ...state,
            units: state.units.map(u => {
                if (u.id === 'enemy-1') {
                    return { ...u, effects: [skipEffect] };
                }
                return u;
            })
        };
    }

    console.log(`Initial Toughness: ${state.units.find(u => u.id === 'enemy-1')?.toughness}`);

    // Step Simulation
    state = stepSimulation(state);

    const finalToughness = state.units.find(u => u.id === 'enemy-1')?.toughness;
    console.log(`Final Toughness: ${finalToughness}`);

    if (shouldSkip) {
        if (finalToughness === 0) {
            console.log('SUCCESS: Toughness recovery skipped.');
        } else {
            console.error('FAILURE: Toughness recovered despite skip tag.');
        }
    } else {
        if (finalToughness === 100) {
            console.log('SUCCESS: Toughness recovered normally.');
        } else {
            console.error('FAILURE: Toughness did not recover.');
        }
    }
}

// Run Tests
runTest(false); // Should recover
runTest(true);  // Should skip
