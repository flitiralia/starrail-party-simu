import { runSimulation, stepSimulation } from '../engine/simulation';
import { SimulationConfig } from '../engine/types';
import { march7th, march7thHandlerFactory } from '../../data/characters/march-7th';
import { Character } from '../../types';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { registry } from '../registry';

// Mock Enemy: Super Fast (Spd 1000 -> AV 10)
const mockEnemy = {
    id: 'fast-enemy',
    name: 'Fast Enemy',
    level: 80,
    baseStats: { hp: 100000, atk: 100, def: 0, spd: 1000 },
    baseRes: {},
    abilities: { basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', targetType: 'single' } }
};

const marchConfig = {
    rotation: ['b'],
    ultStrategy: 'immediate',
    ultCooldown: 0
};

const config: SimulationConfig = {
    characters: [{ ...march7th, baseStats: { ...march7th.baseStats, spd: 101 } }],
    enemies: [mockEnemy as any],
    weaknesses: new Set(['Ice']),
    partyConfig: {
        members: [
            {
                characterId: 'march-7th',
                enabled: true,
                eidolonLevel: 6, // E6
                config: marchConfig
            }
        ]
    } as any,
    enemyConfig: { level: 80, maxHp: 100000, spd: 1000, toughness: 100 },
    rounds: 1
};

function reproduceFreezeMismatch() {
    console.log('--- Reproducing Freeze Mismatch Issue ---');

    registry.registerCharacter('march-7th', march7thHandlerFactory);

    let state = createInitialGameState(config);

    // Register handlers
    const factory = march7thHandlerFactory('march-7th', 80, 6);
    state = dispatch(state, {
        type: 'REGISTER_HANDLERS',
        handlers: [{ metadata: factory.handlerMetadata, logic: factory.handlerLogic }]
    });
    state = dispatch(state, { type: 'BATTLE_START' });

    // Force March EP to 0 initially
    state.units = state.units.map(u => u.id === 'march-7th' ? { ...u, ep: 0 } : u);

    // Ensure March has high EHR for test
    state.units = state.units.map(u => u.id === 'march-7th' ? { ...u, stats: { ...u.stats, effect_hit_rate: 10.0 } } : u);

    let steps = 0;
    while (state.time < 80 && steps < 6) {
        if (steps === 5) console.log(`\n[Step ${steps}] Time: ${state.time}`);

        // Hack: Just give March Max EP after 5 enemy turns (approx AV 50)
        if (steps === 5) {
            console.log('>>> Granting Max EP to March <<<');
            state.units = state.units.map(u => u.id === 'march-7th' ? { ...u, ep: 120 } : u);
        }

        state = stepSimulation(state);
        steps++;
    }

    // Check logs
    const logs = state.log;
    logs.forEach(l => {
        if (l.actionType === 'ULTIMATE' || l.actionType === '必殺技' || l.actionType === 'TurnSkipped' || l.characterName === 'Fast Enemy') {
            console.log(`[${l.actionTime?.toFixed(1)}] ${l.characterName}: ${l.actionType} ${l.details || ''}`);
        }
    });
}

reproduceFreezeMismatch();
