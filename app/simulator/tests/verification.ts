import { dispatch } from '../engine/dispatcher';
import { GameState, Unit, Action } from '../engine/types';
import { Character, Enemy, Element, Path, IAbility } from '@/app/types';

// Mock Data
const mockAbility: IAbility = {
    id: 'skill-001',
    name: 'Glacial Cascade',
    type: 'Skill',
    description: 'Deals Ice DMG',
    damage: { type: 'simple', multiplier: 2.0, scaling: 'atk' },
    toughnessReduction: 20,
    effects: [
        {
            type: 'Freeze',
            baseChance: 1.0,
            target: 'target'
        }
    ]
};

const mockCharacter: Unit = {
    id: 'march-7th',
    name: 'March 7th',
    isEnemy: false,
    element: 'Ice',
    level: 80,
    abilities: {
        basic: { ...mockAbility, type: 'Basic ATK', damage: { type: 'simple', multiplier: 1.0, scaling: 'atk' }, toughnessReduction: 10 },
        skill: mockAbility,
        ultimate: { ...mockAbility, type: 'Ultimate', damage: { type: 'simple', multiplier: 3.0, scaling: 'atk' }, toughnessReduction: 30 },
        talent: { ...mockAbility, type: 'Talent' },
        technique: { ...mockAbility, type: 'Technique' }
    },
    stats: {
        hp: 3000,
        atk: 2000,
        def: 1000,
        spd: 100,
        crit_rate: 0.5,
        crit_dmg: 1.0,
        break_effect: 0.5,
        effect_hit_rate: 0.5,
        effect_res: 0,
        energy_regen_rate: 1.0,
        ice_dmg_boost: 0.2
    } as any,
    baseStats: {} as any,
    hp: 3000,
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
    ultCooldown: 0
};

const mockEnemy: Unit = {
    id: 'enemy-001',
    name: 'Voidranger',
    isEnemy: true,
    element: 'Quantum',
    level: 80,
    abilities: {} as any,
    stats: {
        hp: 10000,
        atk: 1000,
        def: 1000,
        spd: 100,
        effect_res: 0.2
    } as any,
    baseStats: {} as any,
    hp: 10000,
    ep: 0,
    shield: 0,
    toughness: 90,
    maxToughness: 90,
    weaknesses: new Set(['Ice']),
    modifiers: [],
    effects: [],
    actionValue: 0,
    actionPoint: 0,
    rotationIndex: 0,
    ultCooldown: 0
};

// Initial State
const initialState: GameState = {
    units: [mockCharacter, mockEnemy],
    skillPoints: 3,
    maxSkillPoints: 5,
    time: 0,
    log: [],
    eventHandlers: [],
    eventHandlerLogics: {},
    damageModifiers: {},
    cooldowns: {},
    pendingActions: [],
    actionQueue: []
};

// Simulation
console.log('Starting Simulation...');
let state = initialState;

// Action 1: Skill
console.log('\n--- Action 1: Skill ---');
const skillAction: Action = {
    type: 'SKILL',
    sourceId: mockCharacter.id,
    targetId: mockEnemy.id
};
state = dispatch(state, skillAction);

// Verify Log
const lastLog = state.log[state.log.length - 1];
console.log('Log:', JSON.stringify(lastLog, null, 2));

// Verify Damage (Approximate)
// Base = 2000 * 2.0 = 4000
// DmgBoost = 1 + 0.2 = 1.2
// Crit = 1 + (0.5 * 1.0) = 1.5 (Average) -> But simulation uses random? No, calculateCritMultiplier uses average if not specified?
// Wait, calculateCritMultiplier in damage.ts uses `1 + (critRate * critDmg)`. It's average damage.
// Def Mult = (100)/(100 + 100) = 0.5 (Approx, assuming level 80 vs 80)
// Res Mult = 1.0 (Weakness) -> Wait, Ice Weakness means 0% Res usually? Or 20% reduced?
// Standard Res is 20%. Weakness reduces by 20% -> 0%.
// So Res Mult = 1.0 - (0 - 0) = 1.0.
// Vuln = 1.0.
// Broken = 0.9 (Not broken yet).
// Expected = 4000 * 1.2 * 1.5 * 0.5 * 1.0 * 1.0 * 0.9 = 3240.
console.log(`Expected Damage (Approx): 3240`);
console.log(`Actual Damage: ${lastLog.damageDealt}`);

// Verify Freeze Application
const enemy = state.units.find(u => u.id === mockEnemy.id);
const frozen = enemy?.effects.find(e => e.name === 'Freeze');
console.log('Enemy Frozen:', !!frozen);

// Action 2: Ultimate (Should Break)
console.log('\n--- Action 2: Ultimate ---');
const ultAction: Action = {
    type: 'ULTIMATE',
    sourceId: mockCharacter.id,
    targetId: mockEnemy.id
};
state = dispatch(state, ultAction);

// Verify Break
const enemyAfterUlt = state.units.find(u => u.id === mockEnemy.id);
console.log('Enemy Toughness:', enemyAfterUlt?.toughness);
console.log('Enemy Broken:', enemyAfterUlt?.toughness === 0);

console.log('Simulation Complete.');
