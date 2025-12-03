import { runSimulation } from '../app/simulator/engine/simulation.js';
import { march7th } from '../app/data/characters/march-7th.js';
import { tribbie } from '../app/data/characters/tribbie.js';

console.log('--- March 7th Skill Turn Skip Test ---');

// Define Dummy Enemy locally to avoid import issues
const dummy: any = {
    id: 'enemy_dummy_01',
    name: 'テスト用ダミー',
    element: 'Physical',
    toughness: 180,
    baseRes: {},
    baseStats: {
        hp: 10000,
        atk: 500,
        def: 500,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.5,
    },
    abilities: {
        basic: {
            id: 'dummy_basic',
            name: '敵の通常攻撃',
            type: 'Basic ATK',
            targetType: 'single_enemy',
        }
    }
};

// Setup: March 7th with rotation 'sbb' (Skill, Basic, Basic)
let result: any;
try {
    console.log('Starting simulation...');
    result = runSimulation({
        party: [
            {
                character: march7th,
                config: {
                    rotation: ['s', 'b', 'b'], // First action should be Skill
                    ultStrategy: 'cooldown',
                },
                eidolonLevel: 0,
            },
            {
                character: tribbie,
                config: {
                    rotation: ['b'], // Basic only for comparison
                    ultStrategy: 'cooldown',
                },
                eidolonLevel: 0,
            }
        ],
        enemies: [
            {
                character: dummy,
                enemyConfig: {
                    maxHp: 10000,
                    spd: 100,
                },
                weaknesses: new Set(['Ice', 'Fire']),
            }
        ],
        maxTurns: 10, // Limit turns for testing
    });
    console.log('Simulation completed.');
} catch (error) {
    console.error('Simulation failed:', error);
    process.exit(1);
}

// Extract March 7th's actions
const marchActions = result.log.filter(entry => entry.characterName === '三月なのか');

console.log('\nMarch 7th Actions:');
marchActions.forEach((action, index) => {
    console.log(`${index + 1}. Time: ${action.actionTime.toFixed(2)}, Action: ${action.actionType}, rotationIndex: ?`);
});

// Check if second action is skipped
const actionTypes = marchActions.map(a => a.actionType);
console.log('\nAction sequence:', actionTypes.join(' -> '));

// Expected: SKILL -> BASIC_ATTACK -> BASIC_ATTACK
// If bug exists: SKILL -> (skip) -> BASIC_ATTACK
if (actionTypes.length >= 3) {
    const expected = ['SKILL', 'BASIC_ATTACK', 'BASIC_ATTACK'];
    const matches = actionTypes.slice(0, 3).every((type, i) => type === expected[i]);

    if (matches) {
        console.log('\n✅ PASS: March 7th executed Skill -> Basic -> Basic correctly');
    } else {
        console.log('\n❌ FAIL: Action sequence does not match expected pattern');
        console.log('Expected:', expected.join(' -> '));
        console.log('Actual:', actionTypes.slice(0, 3).join(' -> '));
    }
} else {
    console.log('\n⚠️ Not enough actions to verify (need at least 3)');
}
