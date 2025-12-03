
import { runSimulation } from '../engine/simulation';
import { SimulationConfig } from '../engine/types';
import { march7th } from '../../data/characters/march-7th';
import { Character } from '../../types';

// Mock Enemy
const sandbagEnemy = {
    id: 'sandbag',
    name: 'Sandbag',
    level: 80,
    baseStats: {
        hp: 100000,
        atk: 0,
        def: 0,
        spd: 1,
        crit_rate: 0,
        crit_dmg: 0,
        break_effect: 0,
        effect_hit_rate: 0,
        effect_res: 0,
        outgoing_healing_boost: 0,
        energy_regen: 0,
        damage_boost: {},
        res_pen: {},
    },
    baseRes: {},
    currentHp: 100000,
    maxToughness: 100,
    currentToughness: 100,
    weaknesses: ['Ice'],
    isEnemy: true,
    abilities: {
        basic: {
            id: 'sandbag-basic',
            name: 'Do Nothing',
            type: 'Basic ATK',
            targetType: 'single',
            damage: { type: 'simple', multiplier: 0, scaling: 'atk' }
        }
    }
};

// Override March's config for the test
const marchConfigImmediate = {
    rotation: ['s'], // Skill only
    ultStrategy: 'immediate',
    ultCooldown: 0
};

const marchConfigCooldown = {
    rotation: ['s'],
    ultStrategy: 'cooldown',
    ultCooldown: 0
};

// Test Configuration
const config: SimulationConfig = {
    characters: [march7th],
    enemies: [sandbagEnemy as any],
    weaknesses: new Set(['Ice']),
    partyConfig: {
        members: [
            {
                characterId: 'march-7th',
                level: 80,
                eidolon: 6, // Enable all eidolons
                superimposition: 1,
                lightConeId: 'we-are-the-wildfire',
                skills: { basic: 6, skill: 10, ultimate: 10, talent: 10 },
                traces: {},
                relics: [
                    {
                        id: 'mock-relic-spd',
                        setId: 'musketeer-of-wild-wheat',
                        type: 'HEAD',
                        mainStat: { key: 'hp', value: 705 },
                        subStats: [{ key: 'spd', value: 25 }] // 101 + 25 = 126
                    }
                ],
                ornaments: [],
                enabled: true,
                config: marchConfigImmediate
            }
        ]
    } as any,
    enemyConfig: {
        level: 80,
        maxHp: 100000,
        toughness: 100,
        spd: 132
    },
    rounds: 5
};

console.log('--- Testing Immediate Strategy ---');
const stateImmediate = runSimulation(config);

// Filter log for March's actions
const marchLogImmediate = stateImmediate.log.filter(l => l.characterName === '三月なのか');
marchLogImmediate.forEach(l => {
    // Find the unit state at this log entry if possible? 
    // The log doesn't store the full unit state.
    // But we can infer AV from time differences.
    console.log(`[Immediate] Time: ${l.actionTime?.toFixed(2)}, Action: ${l.actionType}, EP: ${l.currentEp}`);
});

console.log('\n--- Testing Cooldown Strategy ---');
// Modify config for Cooldown strategy
const configCooldown = {
    ...config,
    partyConfig: {
        members: [
            {
                characterId: 'march-7th',
                level: 80,
                eidolon: 6, // Enable all eidolons
                superimposition: 1,
                lightConeId: 'we-are-the-wildfire',
                skills: { basic: 6, skill: 10, ultimate: 10, talent: 10 },
                traces: {},
                relics: [],
                ornaments: [],
                enabled: true,
                config: marchConfigCooldown
            }
        ]
    } as any
};

const stateCooldown = runSimulation(configCooldown);
const marchLogCooldown = stateCooldown.log.filter(l => l.characterName === '三月なのか');
marchLogCooldown.forEach(l => {
    console.log(`[Cooldown] Time: ${l.actionTime?.toFixed(2)}, Action: ${l.actionType}, EP: ${l.currentEp}`);
});
