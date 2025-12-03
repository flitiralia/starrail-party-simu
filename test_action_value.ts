import { calculateActionValue, initializeActionQueue, advanceTimeline, actionAdvance } from './app/simulator/engine/actionValue';
import { GameState, Unit } from './app/simulator/engine/types';
import { createEmptyStatRecord } from './app/simulator/statBuilder';

// Mock Unit Helper
function createMockUnit(id: string, spd: number): Unit {
    const stats = createEmptyStatRecord();
    stats.spd = spd;
    return {
        id,
        name: `Unit ${id}`,
        isEnemy: false,
        element: 'Physical',
        level: 80,
        abilities: {} as any,
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
        actionValue: 0, // Will be calculated
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
function testCalculation() {
    const spd = 100;
    const av = calculateActionValue(spd);
    if (av !== 100) throw new Error(`Expected AV 100, got ${av}`);

    const spd2 = 160;
    const av2 = calculateActionValue(spd2);
    if (av2 !== 62.5) throw new Error(`Expected AV 62.5, got ${av2}`);
}

function testQueueInitialization() {
    const u1 = createMockUnit('u1', 100); // AV 100
    const u2 = createMockUnit('u2', 200); // AV 50
    const state = createMockState([u1, u2]);

    const queue = initializeActionQueue(state.units);

    if (queue.length !== 2) throw new Error('Queue length mismatch');
    if (queue[0].unitId !== 'u2') throw new Error('Expected u2 to be first');
    if (queue[0].actionValue !== 50) throw new Error('Expected u2 AV to be 50');
    if (queue[1].unitId !== 'u1') throw new Error('Expected u1 to be second');
    if (queue[1].actionValue !== 100) throw new Error('Expected u1 AV to be 100');
}

function testAdvanceTimeline() {
    const u1 = createMockUnit('u1', 100); // AV 100
    const u2 = createMockUnit('u2', 200); // AV 50
    let state = createMockState([u1, u2]);
    state.actionQueue = initializeActionQueue(state.units);

    // Advance by 50 (u2 acts)
    state = advanceTimeline(state, 50);

    const q = state.actionQueue;
    const u2Entry = q.find(e => e.unitId === 'u2');
    const u1Entry = q.find(e => e.unitId === 'u1');

    if (u2Entry?.actionValue !== 0) throw new Error(`Expected u2 AV 0, got ${u2Entry?.actionValue}`);
    if (u1Entry?.actionValue !== 50) throw new Error(`Expected u1 AV 50, got ${u1Entry?.actionValue}`);
    if (state.time !== 50) throw new Error(`Expected time 50, got ${state.time}`);
}

function testActionAdvance() {
    const u1 = createMockUnit('u1', 100); // Base AV 100
    let state = createMockState([u1]);
    state.actionQueue = initializeActionQueue(state.units); // AV 100

    // Advance action by 50%
    state = actionAdvance(state, 'u1', 0.5);

    const entry = state.actionQueue[0];
    // New AV = Current (100) - (Base (100) * 0.5) = 50
    if (entry.actionValue !== 50) throw new Error(`Expected AV 50, got ${entry.actionValue}`);
}

async function runTests() {
    await runTest('AV Calculation', testCalculation);
    await runTest('Queue Initialization', testQueueInitialization);
    await runTest('Advance Timeline', testAdvanceTimeline);
    await runTest('Action Advance', testActionAdvance);
}

runTests().catch(console.error);
