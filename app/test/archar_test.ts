import { runSimulation } from '../simulator/engine/simulation';
import { SimulationConfig } from '../simulator/engine/types';
import { archar } from '../data/characters/archar';
import { registry } from '../simulator/registry';
import { archarHandlerFactory } from '../data/characters/archar';

// Register Archer
registry.registerCharacter('archar', archarHandlerFactory);

const config: SimulationConfig = {
    characters: [
        { ...archar, id: 'archar', level: 80, eidolonLevel: 0 },
        // Dummy ally to trigger talent
        {
            id: 'dummy-ally',
            name: 'Dummy Ally',
            rarity: 4,
            path: 'Harmony',
            element: 'Physical',
            maxEnergy: 100,
            baseStats: { hp: 1000, atk: 100, def: 100, spd: 200, critRate: 0.05, critDmg: 0.5, aggro: 100 },
            abilities: {
                basic: { id: 'dummy-basic', name: 'Basic', type: 'Basic ATK', targetType: 'single_enemy', damage: { type: 'simple', scaling: 'atk', multiplier: 1.0 }, energyGain: 20, hits: 1, toughnessReduction: 10, effects: [] },
                skill: { id: 'dummy-skill', name: 'Skill', type: 'Skill', targetType: 'ally', energyGain: 30, hits: 0, toughnessReduction: 0, effects: [] },
                ultimate: { id: 'dummy-ult', name: 'Ult', type: 'Ultimate', targetType: 'ally', energyGain: 5, hits: 0, toughnessReduction: 0, effects: [] },
                talent: { id: 'dummy-talent', name: 'Talent', type: 'Talent', description: '', targetType: 'self', hits: 0, toughnessReduction: 0, effects: [] },
                technique: { id: 'dummy-tech', name: 'Tech', type: 'Technique', description: '', targetType: 'self', hits: 0, toughnessReduction: 0, effects: [] }
            },
            traces: [],
            eidolons: {}
        } as any
    ],
    enemies: [
        {
            id: 'enemy1',
            name: 'Enemy 1',
            // level: 80, // Removed to fix lint error
            element: 'Physical',
            baseStats: { hp: 100000, atk: 100, def: 100, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 0 },
            baseRes: {},
            toughness: 300, // Added toughness
            abilities: {
                basic: { id: 'enemy-basic', name: 'Attack', type: 'Basic ATK', description: '' },
                skill: { id: 'enemy-skill', name: 'Skill', type: 'Skill', description: '' },
                ultimate: { id: 'enemy-ult', name: 'Ult', type: 'Ultimate', description: '' },
                talent: { id: 'enemy-talent', name: 'Talent', type: 'Talent', description: '' },
                technique: { id: 'enemy-tech', name: 'Tech', type: 'Technique', description: '' }
            }
        }
    ],
    weaknesses: new Set(['Quantum']),
    enemyConfig: { level: 80, maxHp: 100000, toughness: 300, spd: 100 },
    rounds: 5,
    partyConfig: {
        members: [
            {
                character: { ...archar, id: 'archar', level: 80 },
                config: { rotation: ['s', 's', 's', 's', 's'], ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0
            },
            {
                character: {
                    id: 'dummy-ally',
                    name: 'Dummy Ally',
                    rarity: 4,
                    path: 'Harmony',
                    element: 'Physical',
                    maxEnergy: 100,
                    baseStats: { hp: 1000, atk: 100, def: 100, spd: 200, critRate: 0.05, critDmg: 0.5, aggro: 100 },
                    abilities: {
                        basic: { id: 'dummy-basic', name: 'Basic', type: 'Basic ATK', targetType: 'single_enemy', damage: { type: 'simple', scaling: 'atk', multiplier: 1.0 }, energyGain: 20, hits: 1, toughnessReduction: 10, effects: [] },
                        skill: { id: 'dummy-skill', name: 'Skill', type: 'Skill', targetType: 'ally', energyGain: 30, hits: 0, toughnessReduction: 0, effects: [] },
                        ultimate: { id: 'dummy-ult', name: 'Ult', type: 'Ultimate', targetType: 'ally', energyGain: 5, hits: 0, toughnessReduction: 0, effects: [] },
                        talent: { id: 'dummy-talent', name: 'Talent', type: 'Talent', description: '', targetType: 'self', hits: 0, toughnessReduction: 0, effects: [] },
                        technique: { id: 'dummy-tech', name: 'Tech', type: 'Technique', description: '', targetType: 'self', hits: 0, toughnessReduction: 0, effects: [] }
                    },
                    traces: [],
                    eidolons: {}
                } as any,
                config: { rotation: ['b'], ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0
            }
        ]
    }
};

const result = runSimulation(config);

console.log('Simulation Result:');
console.log(`Total Damage: ${result.result.totalDamageDealt}`);
console.log(`Max SP: ${result.maxSkillPoints}`);

// Filter logs for Archer
// const archarLogs = result.log.filter(l => l.characterName === 'アーチャー');
console.log(`Total Actions: ${result.log.length}`);
result.log.forEach(l => {
    console.log(`[${l.actionTime?.toFixed(0) ?? '?'}] ${l.characterName} ${l.actionType}: SP=${l.skillPointsAfterAction}, Effects=${l.activeEffects?.map(e => e.name).join(', ')}`);
});
