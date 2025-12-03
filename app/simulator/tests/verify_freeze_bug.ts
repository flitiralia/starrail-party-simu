import { createInitialGameState } from '../engine/gameState';
import { stepSimulation } from '../engine/simulation';
import { Enemy, Element } from '../../types';
import { PartyConfig } from '../../types';
import { tribbie } from '../../data/characters/tribbie';
import { march7th } from '../../data/characters/march-7th';
import { dispatch } from '../engine/dispatcher';
import { UltimateAction } from '../engine/types';

// Mock Enemy
const enemy: Enemy = {
    id: 'enemy-1',
    name: 'Voidranger',
    element: 'Quantum',
    baseStats: {
        hp: 100000,
        atk: 1000,
        def: 1000,
        spd: 100,
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
            character: march7th,
            config: { rotation: ['basic'], ultStrategy: 'immediate', ultCooldown: 0 },
            enabled: true,
            eidolonLevel: 0
        }
    ]
};

const config = {
    characters: [march7th],
    enemies: [enemy],
    weaknesses: new Set(['Ice'] as Element[]),
    partyConfig: partyConfig,
    enemyConfig: { level: 80, maxHp: 100000, toughness: 300, spd: 100 },
    rounds: 5
};

let state = createInitialGameState(config);

// 1. Give March 7th full energy
const marchUnit = state.units.find(u => u.id === march7th.id)!;
state = {
    ...state,
    units: state.units.map(u => u.id === march7th.id ? { ...u, ep: u.stats.max_ep } : u)
};

console.log('--- Initial State ---');
console.log('Units:', state.units.map(u => `${u.name} (AV: ${u.actionValue.toFixed(1)})`));

// 2. March 7th uses Ultimate (Interrupt)
console.log('\n--- March 7th uses Ultimate ---');
const ultAction: UltimateAction = { type: 'ULTIMATE', sourceId: march7th.id, targetId: enemy.id }; // Target ID needed? March Ult is all_enemies but let's see
state = dispatch(state, ultAction);

// Check if Enemy is Frozen
const enemyAfterUlt = state.units.find(u => u.isEnemy)!;
const freezeEffect = enemyAfterUlt.effects.find(e => (e as any).statusType === 'Freeze');
console.log('Enemy Frozen?', !!freezeEffect);
if (freezeEffect) {
    console.log('Freeze Effect:', freezeEffect);
}

// 3. Run Simulation until Enemy Turn
console.log('\n--- Running Simulation ---');
// Force Enemy to be next by setting AV to 0 (just to be sure, though simulation should handle it)
// Actually, let's just step through.
// March just acted (Ult). Next should be someone.
// Initial AV: March (10000/101 = 99), Enemy (10000/100 = 100).
// So March should act first normally. But we want to test Enemy Turn Skip.
// Let's set Enemy AV to 0.
state = {
    ...state,
    units: state.units.map(u => u.id === enemy.id ? { ...u, actionValue: 0 } : u),
    actionQueue: [{ unitId: enemy.id, actionValue: 0 }]
};

console.log('Next Action Unit:', state.actionQueue[0].unitId);

// Run Step (Should be Enemy Turn Skip)
state = stepSimulation(state);

console.log('\n--- After Step ---');
const lastLog = state.log[state.log.length - 1];
console.log('Last Log Entry:', lastLog);

// Checks
const updatedEnemy = state.units.find(u => u.isEnemy)!;
const updatedMarch = state.units.find(u => u.id === march7th.id)!;

console.log('Enemy AV:', updatedEnemy.actionValue);
console.log('March AV:', updatedMarch.actionValue);

const wasSkipped = lastLog?.actionType === 'TurnSkipped';
const enemyDurationReduced = updatedEnemy.effects.find(e => e.id === freezeEffect?.id)?.duration === 0; // Should be 0 if it ticked down

console.log('Was Turn Skipped?', wasSkipped);
console.log('Enemy Duration Reduced?', !updatedEnemy.effects.find(e => e.id === freezeEffect?.id)); // Should be removed if duration 0

if (wasSkipped && lastLog.characterName === enemy.name) {
    console.log('SUCCESS: Enemy Turn was skipped.');
} else {
    console.error('FAILURE: Turn was NOT skipped correctly.');
    console.error('Log Character Name:', lastLog?.characterName);
}
