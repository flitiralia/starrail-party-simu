
import { SimulationConfig } from './app/simulator/engine/types';
import { runSimulation } from './app/simulator/engine/simulation';
import { DanHengToukou } from './app/data/characters/dan-heng-toukou';
import { Hianshi } from './app/data/characters/hianshi';
import { Character, CharacterRotationConfig, PartyConfig, PartyMember } from './app/types/index';
import { FinalStats } from './app/types/stats';
import { Enemy } from './app/types/index';

// Disable console.log during verification
// Disable console.log during verification
// const originalLog = console.log;
// console.log = () => { };
const originalLog = console.log;

// Mock Enemies
const mockEnemy: Enemy = {
    id: 'enemy-1',
    name: 'Mock Enemy',
    level: 80,
    baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, aggro: 0, crit_rate: 0, crit_dmg: 0 } as unknown as FinalStats,
    baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    maxToughness: 120,
    element: 'Quantum',
    abilities: {
        basic: { id: 'e-basic', name: 'Basic', type: 'Basic ATK', description: '', damage: { type: 'simple', scaling: 'atk', hits: [] } },
        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '', damage: { type: 'simple', scaling: 'atk', hits: [] } },
        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '', damage: { type: 'aoe', scaling: 'atk', hits: [] } },
        talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '', damage: { type: 'simple', scaling: 'atk', hits: [] } },
        technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '', damage: { type: 'simple', scaling: 'atk', hits: [] } },
    },
    actions: [],
    rewards: { exp: 0, credits: 0, materials: [] }
};

// Setup Party
// Slot 1: Dan Heng Toukou
// Slot 2: Hianshi
const toukou = { ...DanHengToukou, id: 'dan-heng-toukou' };
const hianshi = { ...Hianshi, id: 'hianshi' };

const toukouConfig: CharacterRotationConfig = {
    rotation: ['s', 'b', 'b'],
    rotationMode: 'sequence',
    ultStrategy: 'immediate',
    ultCooldown: 3,
    skillTargetId: 'hianshi' // Target Hianshi by ID
};

const hianshiConfig: CharacterRotationConfig = {
    rotation: ['b', 'b', 'b'],
    rotationMode: 'sequence',
    ultStrategy: 'immediate',
    ultCooldown: 3
};

const partyMembers: PartyMember[] = [
    { character: toukou, config: toukouConfig, enabled: true, eidolonLevel: 0 },
    { character: hianshi, config: hianshiConfig, enabled: true, eidolonLevel: 0 },
    // Fill remaining slots
    { character: null as any, config: null as any, enabled: false, eidolonLevel: 0 },
    { character: null as any, config: null as any, enabled: false, eidolonLevel: 0 }
];

const partyConfig: PartyConfig = {
    members: partyMembers
};

const config: SimulationConfig = {
    characters: [toukou, hianshi],
    enemies: [mockEnemy],
    weaknesses: new Set(),
    enemyConfig: { level: 80, maxHp: 100000, toughness: 120, spd: 100, atk: 1000, def: 1000 },
    partyConfig: partyConfig,
    rounds: 1
};

try {
    const result = runSimulation(config);

    // Check logs for Toukou's skill Usage
    // Look for Action: SKILL, Source: toukou-1, Target: hianshi-1
    // Toukou's skill applies 'Comrade' (同袍)

    const skillLog = result.log.find(l =>
        (l.actionType === 'Action' && l.details?.includes('SKILL') && l.sourceId === 'toukou-1') ||
        (l.actionType === 'Buff' && l.details?.includes('同袍') && l.sourceId === 'toukou-1')
    );

    let foundTargeting = false;

    // We can verify targeting explicitly by checking the 'targetId' in the log entry for the Action
    // But actionType='Action' logs often don't have targetId in generic 'Action' entry unless added?
    // Dispatcher usually logs "Action: [Source] used [Type] on [Target]".
    // Let's check the messages.

    // Or check if Hianshi got the 'Comrade' buff
    // (Log check removed, checking unit effects directly below)

    const hianshiUnit = result.units.find(u => u.id === 'hianshi');
    const toukouUnit = result.units.find(u => u.id === 'dan-heng-toukou');

    console.log("Hianshi Effects:", hianshiUnit?.effects.map(e => e.name).join(', '));
    console.log("Toukou Effects:", toukouUnit?.effects.map(e => e.name).join(', '));

    const hianshiGotComrade = hianshiUnit?.effects.some(e => e.name === '同袍') || false;
    const toukouGotComrade = toukouUnit?.effects.some(e => e.name === '同袍') || false;

    console.log = originalLog;
    console.log("Verification Results:");
    console.log(`Hianshi received Comrade buff: ${hianshiGotComrade}`);
    console.log(`Toukou received Comrade buff: ${toukouGotComrade}`);

    if (hianshiGotComrade && !toukouGotComrade) {
        console.log("SUCCESS: Toukou targeted Hianshi as configured.");
    } else if (toukouGotComrade) {
        console.log("FAILURE: Toukou targeted Self (Default behavior).");
    } else {
        console.log("FAILURE: Comrade buff not found or unclear.");
    }

} catch (e) {
    console.log = originalLog;
    console.error("Verification crashed:", e);
}
