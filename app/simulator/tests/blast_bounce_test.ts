import { dispatch } from '../engine/dispatcher';
import { GameState, Unit, Action } from '../engine/types';
import { IAbility } from '@/app/types';

// Mock Data
const mockBlastAbility: IAbility = {
    id: 'blast-001',
    name: 'Blast Attack',
    type: 'Skill',
    description: 'Deals Blast DMG',
    targetType: 'blast',
    damage: {
        type: 'blast',
        scaling: 'atk',
        mainMultiplier: 2.0,
        adjacentMultiplier: 1.0
    },
    toughnessReduction: 20,
    effects: []
};

const mockBounceAbility: IAbility = {
    id: 'bounce-001',
    name: 'Bounce Attack',
    type: 'Skill', // Using Skill for simplicity, though usually Bounce is Talent/Ult
    description: 'Deals Bounce DMG',
    targetType: 'bounce',
    damage: {
        type: 'bounce',
        scaling: 'atk',
        multipliers: [0.5, 0.5, 0.5, 0.5] // 4 hits of 50%
    },
    hits: 4, // Used for effect calculation loop
    toughnessReduction: 10,
    effects: []
};

const mockCharacter: Unit = {
    id: 'hero',
    name: 'Hero',
    isEnemy: false,
    element: 'Fire',
    level: 80,
    abilities: {
        basic: { ...mockBlastAbility, type: 'Basic ATK', damage: { type: 'simple', multiplier: 1.0, scaling: 'atk' } },
        skill: mockBlastAbility, // Blast on Skill
        ultimate: mockBounceAbility, // Bounce on Ult
        talent: { ...mockBlastAbility, type: 'Talent' },
        technique: { ...mockBlastAbility, type: 'Technique' }
    },
    stats: {
        hp: 3000,
        atk: 1000, // Base ATK 1000 for easy calc
        def: 1000,
        spd: 100,
        crit_rate: 0, // No crit for deterministic test
        crit_dmg: 0,
        break_effect: 0,
        effect_hit_rate: 0,
        effect_res: 0,
        energy_regen_rate: 1.0,
        fire_dmg_boost: 0
    } as any,
    baseStats: {} as any,
    hp: 3000,
    ep: 100,
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

const createEnemy = (id: string, name: string): Unit => ({
    id,
    name,
    isEnemy: true,
    element: 'Ice',
    level: 80,
    abilities: {} as any,
    stats: {
        hp: 10000,
        atk: 1000,
        def: 1000, // 50% mitigation approx
        spd: 100,
        effect_res: 0
    } as any,
    baseStats: {} as any,
    hp: 10000,
    ep: 0,
    shield: 0,
    toughness: 100,
    maxToughness: 100,
    weaknesses: new Set(['Fire']),
    modifiers: [],
    effects: [],
    actionValue: 0,
    actionPoint: 0,
    rotationIndex: 0,
    ultCooldown: 0
});

// Initial State with 3 enemies
const initialState: GameState = {
    units: [
        mockCharacter,
        createEnemy('enemy-1', 'Enemy A'),
        createEnemy('enemy-2', 'Enemy B'),
        createEnemy('enemy-3', 'Enemy C')
    ],
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
console.log('Starting Blast/Bounce Simulation...');
let state = initialState;

// --- Test 1: Blast Attack on Enemy 2 (Middle) ---
console.log('\n--- Test 1: Blast Attack on Enemy B (Middle) ---');
// Expected: Enemy B takes Main Dmg (2000 * 0.5 = 1000), A and C take Adj Dmg (1000 * 0.5 = 500)
// Note: Def multiplier is approx 0.5 (1000 def vs 80 attacker? No, level based. 80 vs 80 is 0.5)
// Let's assume exactly 0.5 for simplicity in mental check, but code uses formula.
// Formula: 1 - (def / (def + 200 + 10 * level)) -> 1 - (1000 / (1000 + 200 + 800)) = 1 - 0.5 = 0.5. Correct.

const blastAction: Action = {
    type: 'SKILL',
    sourceId: mockCharacter.id,
    targetId: 'enemy-2'
};
state = dispatch(state, blastAction);

const log1 = state.log[state.log.length - 1];
console.log('Blast Log:', log1.damageDealt);
// Total Damage should be 1000 + 500 + 500 = 2000.

// Check individual HP
const enemy1 = state.units.find(u => u.id === 'enemy-1');
const enemy2 = state.units.find(u => u.id === 'enemy-2');
const enemy3 = state.units.find(u => u.id === 'enemy-3');

console.log(`Enemy A HP: ${enemy1?.hp} (Lost: ${10000 - (enemy1?.hp || 0)})`);
console.log(`Enemy B HP: ${enemy2?.hp} (Lost: ${10000 - (enemy2?.hp || 0)})`);
console.log(`Enemy C HP: ${enemy3?.hp} (Lost: ${10000 - (enemy3?.hp || 0)})`);


// --- Test 2: Bounce Attack (Random) ---
console.log('\n--- Test 2: Bounce Attack ---');
// 4 hits of 0.5 multiplier (500 dmg * 0.5 def = 250 dmg per hit)
// Total potential damage = 1000.
// Distributed randomly.

const bounceAction: Action = {
    type: 'ULTIMATE',
    sourceId: mockCharacter.id,
    targetId: 'enemy-2' // Target ID usually ignored for Bounce, or used as initial target?
    // Our implementation ignores targetId for Bounce target selection, but might use it for initial "main" check if needed?
    // stepGenerateHits for bounce uses random selection from all enemies.
};
state = dispatch(state, bounceAction);

const log2 = state.log[state.log.length - 1];
console.log('Bounce Log Total Damage:', log2.damageDealt);

// Check total HP lost across all enemies
const enemy1b = state.units.find(u => u.id === 'enemy-1');
const enemy2b = state.units.find(u => u.id === 'enemy-2');
const enemy3b = state.units.find(u => u.id === 'enemy-3');

const totalHpLost = (10000 - (enemy1b?.hp || 0)) + (10000 - (enemy2b?.hp || 0)) + (10000 - (enemy3b?.hp || 0));
// Previous lost was 2000.
// New lost should be 2000 + 1000 = 3000.
console.log(`Total HP Lost (Cumulative): ${totalHpLost}`);
console.log(`Bounce Damage Dealt: ${totalHpLost - 2000}`);

console.log('Simulation Complete.');
