import { calculateEnergyGain, addEnergy, initializeEnergy } from './app/simulator/engine/energy';
import { GameState, Unit, ActionContext } from './app/simulator/engine/types';
import { createEmptyStatRecord } from './app/simulator/statBuilder';
import { dispatch } from './app/simulator/engine/dispatcher';

// Mock Unit Helper
function createMockUnit(id: string, maxEp: number, err: number = 0): Unit {
    const stats = createEmptyStatRecord();
    stats.max_ep = maxEp;
    stats.energy_regen_rate = err;
    return {
        id,
        name: `Unit ${id}`,
        isEnemy: false,
        element: 'Physical',
        level: 80,
        abilities: {
            basic: { id: 'b', name: 'Basic', type: 'Basic ATK', description: '', energyGain: 20 },
            skill: { id: 's', name: 'Skill', type: 'Skill', description: '', energyGain: 30 },
            ultimate: { id: 'u', name: 'Ult', type: 'Ultimate', description: '', energyGain: 5 },
            talent: { id: 't', name: 'Talent', type: 'Talent', description: '', energyGain: 10 }, // FuA
            technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '' }
        } as any,
        stats,
        baseStats: stats,
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
        ultCooldown: 0
    };
}

function createMockEnemy(id: string): Unit {
    const stats = createEmptyStatRecord();
    return {
        id,
        name: 'Enemy',
        isEnemy: true,
        element: 'Quantum',
        level: 80,
        abilities: {} as any,
        stats,
        baseStats: stats,
        hp: 100,
        ep: 0,
        shield: 0,
        toughness: 100,
        maxToughness: 100,
        weaknesses: new Set(),
        modifiers: [],
        effects: [],
        actionValue: 0,
        actionPoint: 0,
        rotationIndex: 0,
        ultCooldown: 0
    };
}

// Mock State Helper
function createMockState(units: Unit[]): GameState {
    return {
        units,
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
}

async function runTest(name: string, testFn: () => void) {
    console.log(`\n--- Test: ${name} ---`);
    try {
        testFn();
        console.log('PASS');
    } catch (e) {
        console.error('FAIL:', e);
    }
}

// Tests
function testERR() {
    // ERR 19.4%
    const u1 = createMockUnit('u1', 100, 0.194);

    // Basic ATK (20 Base)
    // Expected: 20 * 1.194 = 23.88
    const gain = calculateEnergyGain(20, u1.stats.energy_regen_rate!);
    if (Math.abs(gain - 23.88) > 0.001) throw new Error(`Expected 23.88, got ${gain}`);

    const u2 = addEnergy(u1, 20);
    if (Math.abs(u2.ep - 23.88) > 0.001) throw new Error(`Expected EP 23.88, got ${u2.ep}`);
}

function testInitialEP() {
    const u1 = createMockUnit('u1', 120);
    const u2 = initializeEnergy(u1, 0.5);

    if (u2.ep !== 60) throw new Error(`Expected Initial EP 60, got ${u2.ep}`);
}

function testHitEP() {
    const u1 = createMockUnit('u1', 100); // Target
    const e1 = createMockEnemy('e1'); // Attacker
    let state = createMockState([u1, e1]);

    // Enemy attacks Unit (Basic Attack)
    // We need to simulate damage application via dispatcher
    // Since we can't easily mock the whole pipeline without running dispatch,
    // let's try to run a minimal dispatch.

    // Mock enemy ability
    e1.abilities = {
        basic: { id: 'eb', name: 'EBasic', type: 'Basic ATK', description: '', damage: { multiplier: 1, scaling: 'atk' } }
    } as any;

    state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: 'e1', targetId: 'u1' });

    const target = state.units.find(u => u.id === 'u1');
    // Expected: 0 + 10 (Hit) = 10
    if (target?.ep !== 10) throw new Error(`Expected Hit EP 10, got ${target?.ep}`);
}

function testKillEP() {
    const u1 = createMockUnit('u1', 100); // Killer
    const e1 = createMockEnemy('e1'); // Victim
    e1.hp = 1; // Low HP
    let state = createMockState([u1, e1]);

    // Unit kills Enemy
    state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: 'u1', targetId: 'e1' });

    const killer = state.units.find(u => u.id === 'u1');
    // Expected: 
    // Basic ATK: 20
    // Kill: 10
    // Total: 30
    if (killer?.ep !== 30) throw new Error(`Expected Kill EP 30 (20+10), got ${killer?.ep}`);
}

function testFuAEP() {
    const u1 = createMockUnit('u1', 100);
    let state = createMockState([u1]);

    // Trigger FuA
    state = dispatch(state, { type: 'FOLLOW_UP_ATTACK', sourceId: 'u1', targetId: 'u1' }); // Target self for simplicity

    const unit = state.units.find(u => u.id === 'u1');
    // Expected: Talent Energy Gain 10
    if (unit?.ep !== 10) throw new Error(`Expected FuA EP 10, got ${unit?.ep}`);
}

async function runTests() {
    await runTest('ERR Calculation', testERR);
    await runTest('Initial EP', testInitialEP);
    await runTest('Hit EP', testHitEP);
    await runTest('Kill EP', testKillEP);
    await runTest('FuA EP', testFuAEP);
}

runTests().catch(console.error);
