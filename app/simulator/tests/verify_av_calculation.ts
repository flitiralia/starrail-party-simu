import { createInitialGameState } from '../engine/gameState';
import { stepSimulation } from '../engine/simulation';
import { Enemy, Element } from '../../types';
import { PartyConfig } from '../../types';
import { march7th } from '../../data/characters/march-7th';
import { IEffect } from '../effect/types';

// Mock Enemy
const enemy: Enemy = {
    id: 'enemy-1',
    name: 'Sandbag',
    element: 'Quantum',
    baseStats: {
        hp: 100000,
        atk: 1000,
        def: 1000,
        spd: 1, // Very slow to let March act multiple times
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
            character: {
                ...march7th,
                baseStats: { ...march7th.baseStats, spd: 126 } // Force Speed 126
            },
            config: { rotation: ['basic'], ultStrategy: 'immediate', ultCooldown: 0 },
            enabled: true,
            eidolonLevel: 0
        }
    ]
};

const config = {
    characters: [partyConfig.members[0].character],
    enemies: [enemy],
    weaknesses: new Set(['Ice'] as Element[]),
    partyConfig: partyConfig,
    enemyConfig: { level: 80, maxHp: 100000, toughness: 300, spd: 1 },
    rounds: 5
};

let state = createInitialGameState(config);

console.log('--- Initial State ---');
const march = state.units.find(u => u.id === march7th.id)!;
console.log(`March Speed: ${march.stats.spd}`);
console.log(`Expected Base AV: ${10000 / march.stats.spd}`);

// Run for 5 turns
for (let i = 0; i < 5; i++) {
    // Apply Freeze before Turn 2
    if (i === 1) {
        console.log('--- Applying Freeze ---');
        const marchUnit = state.units.find(u => u.id === march7th.id)!;
        const freezeEffect: IEffect = {
            id: 'freeze-test',
            name: 'Freeze',
            category: 'DEBUFF',
            sourceUnitId: 'enemy-1',
            durationType: 'DURATION_BASED',
            duration: 1,
            type: 'BreakStatus',
            statusType: 'Freeze',
            frozen: true,
            apply: (t: any, s: any) => s,
            remove: (t: any, s: any) => s
        } as any; // Cast to any to bypass strict checks for test
        state = {
            ...state,
            units: state.units.map(u => u.id === march7th.id ? { ...u, effects: [...u.effects, freezeEffect] } : u)
        };
    }

    state = stepSimulation(state);
    const lastLog = state.log[state.log.length - 1];
    if (lastLog) {
        console.log(`Turn ${i + 1}: Time=${lastLog.actionTime?.toFixed(2)}, Type=${lastLog.actionType}, Character=${lastLog.characterName}, Details=${lastLog.details}`);
    }

    const march = state.units.find(u => u.id === march7th.id)!;
    console.log(`March Next AV: ${march.actionValue.toFixed(2)}`);
}
