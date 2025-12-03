import { stepSimulation } from '../engine/simulation';
import { SimulationConfig } from '../engine/types';
import { march7th, march7thHandlerFactory } from '../../data/characters/march-7th';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { registry } from '../registry';

// Mock Enemy
const mockEnemy = {
    id: 'fast-enemy',
    name: 'Fast Enemy',
    level: 80,
    baseStats: { hp: 100000, atk: 100, def: 0, spd: 200 }, // Spd 200 -> AV 50
    baseRes: {},
    abilities: {
        basic: {
            id: 'e-basic',
            name: 'Atk',
            type: 'Basic ATK',
            targetType: 'single',
            damage: { type: 'simple', scaling: 'atk', multiplier: 1.0 }
        }
    }
};

const marchConfig = {
    rotation: ['b'],
    ultStrategy: 'immediate',
    ultCooldown: 0
};

const config: SimulationConfig = {
    characters: [{ ...march7th, baseStats: { ...march7th.baseStats, spd: 101 } }],
    enemies: [
        { ...mockEnemy, id: 'fast-enemy-1', name: 'Fast Enemy 1' } as any,
        {
            id: 'fast-enemy-2',
            name: 'Fast Enemy 2',
            level: 80,
            baseStats: { hp: 100000, atk: 100, def: 0, spd: 190 },
            baseRes: {},
            abilities: mockEnemy.abilities
        } as any
    ],
    weaknesses: new Set(['Ice']),
    partyConfig: {
        members: [
            {
                characterId: 'march-7th',
                enabled: true,
                eidolonLevel: 6,
                config: marchConfig
            }
        ]
    } as any,
    enemyConfig: { level: 80, maxHp: 100000, spd: 200, toughness: 100 },
    rounds: 1
};

function runTest() {
    console.log('--- Reproduction Test: Ultimate Delay after Counter ---');

    registry.registerCharacter('march-7th', march7thHandlerFactory);

    let state = createInitialGameState(config);

    // Hack E2 speed because createInitialGameState overrides it with enemyConfig
    state.units = state.units.map(u => {
        if (u.id === 'fast-enemy-2') {
            const newSpd = 190;
            return {
                ...u,
                stats: { ...u.stats, spd: newSpd },
                actionValue: 10000 / newSpd
            };
        }
        return u;
    });

    state.units.forEach(u => console.log(`[Unit] ${u.name} Spd: ${u.stats.spd} AV: ${u.actionValue}`));

    // Register handlers
    const factory = march7thHandlerFactory('march-7th', 80, 6);
    state = dispatch(state, {
        type: 'REGISTER_HANDLERS',
        handlers: [{ metadata: factory.handlerMetadata, logic: factory.handlerLogic }]
    });
    state = dispatch(state, { type: 'BATTLE_START' });

    // Setup:
    // 1. Give March 110 EP
    // 2. Give March a shield (so she counters)
    state.units = state.units.map(u => {
        if (u.id === 'march-7th') {
            return {
                ...u,
                ep: 110,
                shield: 1000,
                effects: [
                    ...u.effects,
                    {
                        id: 'dummy-shield',
                        name: 'バリア',
                        category: 'BUFF',
                        type: 'Shield',
                        sourceUnitId: u.id,
                        value: 1000,
                        duration: 3,
                        durationType: 'DURATION_BASED',
                        apply: (t: any, s: any) => s,
                        remove: (t: any, s: any) => s
                    } as any
                ]
            };
        }
        return u;
    });

    console.log(`[Start] March EP: ${state.units.find(u => u.id === 'march-7th')?.ep}`);

    // Run Simulation
    // Enemy (AV 50) acts first.
    // Enemy attacks March.
    // March counters.
    // March gains EP -> 120.
    // Ult should trigger at Time 50.

    let steps = 0;
    while (state.time < 80 && steps < 15) {
        console.log(`\n[Step ${steps}] Time: ${state.time}`);
        state = stepSimulation(state);
        steps++;
    }

    // Print logs
    console.log('\n--- Simulation Logs ---');
    state.log.forEach(l => {
        console.log(`[${l.actionTime?.toFixed(1)}] ${l.characterName}: ${l.actionType}`);
    });

    const ultLog = state.log.find(l => l.actionType === '必殺技' && l.characterName === '三月なのか');

    if (ultLog) {
        console.log(`[FOUND ULT] Time: ${ultLog.actionTime}`);
        // E1 acts at 50. Ult should be at 50.
        // E2 acts at ~52.6.
        if ((ultLog.actionTime || 0) <= 50.1) {
            console.log('SUCCESS: Ultimate triggered immediately at Time 50!');
        } else {
            console.log('FAILURE: Ultimate triggered late (likely at next action time)!');
        }
    } else {
        console.log('FAILURE: Ult not found.');
    }
}

runTest();
