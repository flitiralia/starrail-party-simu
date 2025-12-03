import { GameState, Unit, ActionContext } from './app/simulator/engine/types';
import { createEmptyStatRecord } from './app/simulator/statBuilder';
import { dispatch } from './app/simulator/engine/dispatcher';
import { calculateDoTDamage } from './app/simulator/damage';

// Mock Helper
export function createMockUnit(id: string, isEnemy: boolean = false): Unit {
    const stats = createEmptyStatRecord();
    return {
        id,
        name: id,
        isEnemy,
        element: 'Physical',
        level: 80,
        abilities: {
            basic: { id: 'b', name: 'Basic', type: 'Basic ATK', description: '', targetType: 'single_enemy' },
            skill: { id: 's', name: 'Skill', type: 'Skill', description: '', targetType: 'blast' }, // Blast Skill
            ultimate: { id: 'u', name: 'Ult', type: 'Ultimate', description: '', targetType: 'all_enemies' }, // AoE Ult
            talent: { id: 't', name: 'Talent', type: 'Talent', description: '', targetType: 'bounce', hits: 3 } // Bounce Talent
        } as any,
        stats,
        baseStats: stats,
        hp: 1000,
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

export function createMockState(units: Unit[]): GameState {
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
        actionQueue: [],
        result: { totalDamageDealt: 0, characterStats: {} }
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
function testBlastTargeting() {
    const u1 = createMockUnit('u1');
    const e1 = createMockUnit('e1', true);
    const e2 = createMockUnit('e2', true); // Center
    const e3 = createMockUnit('e3', true);
    let state = createMockState([u1, e1, e2, e3]);

    // Blast on e2 (Center)
    // Should hit e1, e2, e3
    state = dispatch(state, { type: 'SKILL', sourceId: 'u1', targetId: 'e2' });

    // Re-mock with damage
    u1.abilities.skill.damage = { type: 'simple', multiplier: 1, scaling: 'atk' };
    u1.abilities.talent.damage = { type: 'simple', multiplier: 1, scaling: 'atk' };
    u1.stats.atk = 100;

    state = dispatch(state, { type: 'SKILL', sourceId: 'u1', targetId: 'e2' });

    const e1State = state.units.find(u => u.id === 'e1');
    const e2State = state.units.find(u => u.id === 'e2');
    const e3State = state.units.find(u => u.id === 'e3');

    if (e1State!.hp >= 1000) throw new Error('e1 should take damage (Blast adjacent)');
    if (e2State!.hp >= 1000) throw new Error('e2 should take damage (Blast main)');
    if (e3State!.hp >= 1000) throw new Error('e3 should take damage (Blast adjacent)');
}

function testBounceTargeting() {
    const u1 = createMockUnit('u1');
    const e1 = createMockUnit('e1', true);
    let state = createMockState([u1, e1]);

    // Bounce on e1 (3 hits)
    u1.abilities.talent.damage = { type: 'bounce', scaling: 'atk', multipliers: [1, 1, 1] };
    u1.stats.atk = 100;
    u1.stats.crit_rate = 0; // Disable crit
    e1.weaknesses.add('Physical'); // Remove RES penalty (20% -> 0%)

    state = dispatch(state, { type: 'FOLLOW_UP_ATTACK', sourceId: 'u1', targetId: 'e1' });

    const e1State = state.units.find(u => u.id === 'e1');
    // 3 hits of 100 dmg
    // Def Multiplier (Lv80 vs Lv80) = 0.5
    // Res Multiplier (Weak) = 1.0
    // Toughness Multiplier (Not Broken) = 0.9
    // Total = 300 * 0.5 * 1.0 * 0.9 = 135
    // 1000 - 135 = 865
    if (e1State!.hp > 866 || e1State!.hp < 864) throw new Error(`e1 should take 135 damage, HP is ${e1State!.hp}`);
}

function testDoTBoost() {
    const u1 = createMockUnit('u1');
    const e1 = createMockUnit('e1', true);

    u1.stats.dot_dmg_boost = 0.5; // +50% DoT DMG

    const damage = calculateDoTDamage(u1, e1, 100);
    // Expected: 100 * (1 + 0.5) = 150
    // Note: Other multipliers are 1.0 by default

    // calculateDoTDamage(source, target, baseDmg)
    // baseDmg * (1+Break) * Def * Res * Vuln * (1+DoTBoost)
    // 100 * 1 * ~0.5 (Def) * 1 * 1 * 1.5
    // Def Multiplier for Lv 80 vs Lv 80 is 0.5

    const expected = 100 * 0.5 * 1.5; // 75

    if (Math.abs(damage - expected) > 1) throw new Error(`Expected ~${expected}, got ${damage}`);
}

async function runTests() {
    await runTest('Blast Targeting', testBlastTargeting);
    await runTest('Bounce Targeting', testBounceTargeting);
    await runTest('DoT Boost', testDoTBoost);
}

if (require.main === module) {
    runTests().catch(console.error);
}
