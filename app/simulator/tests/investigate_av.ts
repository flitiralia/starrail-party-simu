import { runSimulation } from '../engine/simulation';
import { SimulationConfig, CharacterConfig, EnemyConfig } from '../engine/types';
import { Character, Enemy } from '@/app/types';
import { march7th } from '@/app/data/characters/march-7th';

// Setup March 7th with Speed 126
const march: Character = {
    ...march7th,
    baseStats: { ...march7th.baseStats, spd: 126 },
    stats: { ...march7th.baseStats, spd: 126 } as any // Simplified stat init
};

// Setup Enemy with Speed 100
const enemy: Enemy = {
    id: 'dummy-enemy',
    name: 'Dummy Enemy',
    level: 80,
    stats: {
        hp: 10000,
        atk: 1000,
        def: 1000,
        spd: 100,
        effect_res: 0,
        effect_hit_rate: 0,
        crit_rate: 0,
        crit_dmg: 0,
        break_effect: 0,
        energy_regen_rate: 0,
        ice_dmg_boost: 0
    } as any,
    abilities: {
        basic: {
            id: 'enemy-basic',
            name: 'Attack',
            type: 'Basic ATK',
            description: 'Attack',
            damage: { type: 'simple', multiplier: 1, scaling: 'atk' },
            targetType: 'single_enemy'
        }
    } as any,
    path: 'Destruction',
    element: 'Physical',
    maxEnergy: 0,
    baseStats: { spd: 100 } as any,
    baseRes: {} as any
};

const config: SimulationConfig = {
    characters: [march],
    enemies: [enemy],
    weaknesses: new Set(['Ice']),
    enemyConfig: { level: 80, maxHp: 10000, toughness: 100 },
    rounds: 2, // Run for a few rounds
    partyConfig: {
        characters: [march],
        members: [{ characterId: march.id, enabled: true }]
    } as any
};

// Inject config into characters for rotation
march.config = {
    rotation: ['b'], // Basic attack only
    ultStrategy: 'cooldown',
    ultCooldown: 0
};

console.log('Starting AV Investigation...');
const result = runSimulation(config);

console.log('\nSimulation Log (Action Times):');
result.log.forEach(entry => {
    console.log(`[Time: ${entry.actionTime.toFixed(1)}] ${entry.characterName} used ${entry.actionType}`);
});
