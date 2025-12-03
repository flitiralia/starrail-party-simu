import { createInitialGameState } from '../engine/gameState';
import { Enemy, Element } from '../../types';
import { PartyConfig } from '../../types';
import { tribbie } from '../../data/characters/tribbie';
import { march7th } from '../../data/characters/march-7th';

// Mock Enemy
const enemy: Enemy = {
    id: 'enemy-1',
    name: 'Voidranger',
    element: 'Quantum',
    baseStats: {
        hp: 100000,
        atk: 1000,
        def: 1000,
        spd: 100, // Base Speed
        critRate: 0.05,
        critDmg: 0.5,
    },
    abilities: {
        basic: { id: 'e-basic', name: 'Attack', type: 'Basic ATK', description: '' },
        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '' },
        talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' },
    },
    toughness: 300,
    baseRes: {}
};

// Party Config
const partyConfig: PartyConfig = {
    members: [
        {
            character: tribbie,
            config: { rotation: ['basic'], ultStrategy: 'immediate', ultCooldown: 0 },
            enabled: true,
            eidolonLevel: 0
        }
    ]
};

// Test Case 1: Default Speed (if not provided, though it's required now)
// We skip this as spd is required in our new type definition.

// Test Case 2: Configured Speed
const targetSpeed = 150;
const config = {
    characters: [tribbie],
    enemies: [enemy],
    weaknesses: new Set(['Quantum'] as Element[]),
    partyConfig: partyConfig,
    enemyConfig: { level: 80, maxHp: 100000, toughness: 300, spd: targetSpeed },
    rounds: 1
};

const state = createInitialGameState(config);
const enemyUnit = state.units.find(u => u.isEnemy);

if (enemyUnit) {
    console.log(`Enemy Base Speed: ${enemy.baseStats.spd}`);
    console.log(`Configured Speed: ${targetSpeed}`);
    console.log(`Actual Enemy Speed in State: ${enemyUnit.stats.spd}`);

    if (enemyUnit.stats.spd === targetSpeed) {
        console.log('SUCCESS: Enemy speed matches configured value.');
    } else {
        console.error('FAILURE: Enemy speed does not match configured value.');
        process.exit(1);
    }
} else {
    console.error('FAILURE: Enemy unit not found in state.');
    process.exit(1);
}
