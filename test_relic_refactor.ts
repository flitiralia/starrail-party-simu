import { updatePassiveBuffs } from './app/simulator/effect/relicHandler';
import { GameState, Unit } from './app/simulator/engine/types';
import { BROKEN_KEEL } from './app/data/ornaments/broken-keel';
import { createEmptyStatRecord, calculateFinalStats } from './app/simulator/statBuilder';
import { Character, CharacterBaseStats } from './app/types';

// Mock Data
const mockBaseStats: CharacterBaseStats = {
    hp: 1000,
    atk: 500,
    def: 500,
    spd: 100,
    critRate: 0.05,
    critDmg: 0.5,
};

const mockCharacter: Character = {
    id: 'char1',
    name: 'Test Char',
    element: 'Ice',
    path: 'Preservation',
    baseStats: mockBaseStats,
    maxEnergy: 100,
    abilities: {
        basic: { id: 'b', name: 'Basic', type: 'Basic ATK', description: '' },
        skill: { id: 's', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'u', name: 'Ult', type: 'Ultimate', description: '' },
        talent: { id: 't', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '' },
    },
    traces: [],
    ornaments: [
        {
            set: BROKEN_KEEL,
            type: 'Planar Sphere',
            level: 15,
            mainStat: { stat: 'hp_pct', value: 0.432 },
            subStats: []
        },
        {
            set: BROKEN_KEEL,
            type: 'Link Rope',
            level: 15,
            mainStat: { stat: 'effect_res', value: 0.1 }, // +10% from main stat
            subStats: [] // Total Effect Res: Base 0 + Set 10% + Main 10% = 20% (Not enough for bonus)
        }
    ]
};

const mockUnit: Unit = {
    id: 'unit1',
    name: 'Test Unit',
    isEnemy: false,
    element: 'Ice',
    level: 80,
    abilities: mockCharacter.abilities,
    stats: createEmptyStatRecord(), // Will be calculated
    baseStats: createEmptyStatRecord(),
    hp: 1000,
    ep: 0,
    shield: 0,
    toughness: 0,
    maxToughness: 0,
    weaknesses: new Set(),
    modifiers: [],
    effects: [],
    actionValue: 0,
    actionPoint: 0,
    rotationIndex: 0,
    ultCooldown: 0,
    ornaments: mockCharacter.ornaments,
    relics: []
};

// Initialize State
let state: GameState = {
    units: [mockUnit],
    skillPoints: 3,
    maxSkillPoints: 5,
    time: 0,
    log: [],
    eventHandlers: [],
    eventHandlerLogics: {},
    damageModifiers: {
        defIgnore: 0,
        breakEfficiencyBoost: 0
    },
    cooldowns: {},
    pendingActions: []
};

// Test 1: Effect Res < 30%
console.log('--- Test 1: Effect Res < 30% ---');
// Initial calculation to set base stats
mockUnit.stats = calculateFinalStats(mockCharacter);
// Apply buffs
state = updatePassiveBuffs(state);

let unit = state.units[0];
let effectResMod = unit.modifiers.find(m => m.target === 'effect_res');
let critDmgMod = unit.modifiers.find(m => m.target === 'crit_dmg');

console.log('Effect Res Modifier:', effectResMod ? 'Found' : 'Not Found');
console.log('Crit DMG Modifier:', critDmgMod ? 'Found' : 'Not Found');

if (effectResMod && !critDmgMod) {
    console.log('PASS: Correctly applied only Effect Res buff.');
} else {
    console.log('FAIL: Incorrect buffs applied.');
}

// Test 2: Effect Res >= 30%
console.log('\n--- Test 2: Effect Res >= 30% ---');
// Add more Effect Res via sub-stats to reach 30%
// Current: 10% (Set) + 10% (Main) = 20%. Need +10%.
if (mockCharacter.ornaments) {
    mockCharacter.ornaments[1].subStats.push({ stat: 'effect_res', value: 0.15 });
}

// Recalculate stats (simulation loop would do this)
// Note: updatePassiveBuffs calculates stats internally based on modifiers, 
// but here we need to update the Unit's intrinsic stats (from relics) which calculateFinalStats does.
// However, updatePassiveBuffs uses calculateFinalStats internally on the unit passed in state.
// But wait, calculateFinalStats uses unit.relics/ornaments.
// So if we update mockCharacter.ornaments, we need to update mockUnit.ornaments too.
mockUnit.ornaments = mockCharacter.ornaments;

state = updatePassiveBuffs(state);
unit = state.units[0];

effectResMod = unit.modifiers.find(m => m.target === 'effect_res');
critDmgMod = unit.modifiers.find(m => m.target === 'crit_dmg');

console.log('Effect Res Modifier:', effectResMod ? 'Found' : 'Not Found');
console.log('Crit DMG Modifier:', critDmgMod ? 'Found' : 'Not Found');

if (effectResMod && critDmgMod) {
    console.log('PASS: Correctly applied both buffs.');
} else {
    console.log('FAIL: Incorrect buffs applied.');
}


