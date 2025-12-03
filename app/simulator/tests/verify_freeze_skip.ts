import { createInitialGameState } from '../engine/gameState';
import { stepSimulation } from '../engine/simulation';
import { Enemy, Element } from '../../types';
import { PartyConfig } from '../../types';
import { tribbie } from '../../data/characters/tribbie';
import { march7th } from '../../data/characters/march-7th';
import { BreakStatusEffect } from '../effect/types';
import { addEffect } from '../engine/effectManager';

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

// Force Enemy to be next (AV 0)
const enemyUnit = state.units.find(u => u.isEnemy)!;
state = {
    ...state,
    actionQueue: [{ unitId: enemyUnit.id, actionValue: 0 }]
};

// Apply Freeze Effect manually
const freezeEffect: BreakStatusEffect = {
    id: 'test-freeze',
    name: 'Freeze',
    category: 'DEBUFF',
    sourceUnitId: march7th.id,
    durationType: 'DURATION_BASED',
    duration: 1,
    type: 'BreakStatus',
    statusType: 'Freeze',
    frozen: true,
    apply: (t, s) => s,
    remove: (t, s) => s
};
state = addEffect(state, enemyUnit.id, freezeEffect);

console.log('--- Before Step ---');
console.log('Next Action Unit:', state.actionQueue[0].unitId);
console.log('Enemy Effects:', state.units.find(u => u.isEnemy)?.effects.map(e => e.name));

// Run Step
state = stepSimulation(state);

console.log('--- After Step ---');
const lastLog = state.log[state.log.length - 1];
console.log('Last Log Entry:', lastLog);

// Checks
const updatedEnemy = state.units.find(u => u.isEnemy)!;
const wasSkipped = lastLog?.actionType === 'TurnSkipped' || lastLog?.details?.includes('Frozen');
const durationReduced = updatedEnemy.effects.find(e => e.id === 'test-freeze')?.duration === 0; // Should be 0 if it ticked down

console.log('Was Turn Skipped?', wasSkipped);
console.log('Duration Reduced?', !updatedEnemy.effects.find(e => e.id === 'test-freeze')); // Should be removed if duration 0

if (wasSkipped) {
    console.log('SUCCESS: Turn was skipped.');
} else {
    console.error('FAILURE: Turn was NOT skipped (or not logged).');
}
