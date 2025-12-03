import { GameState, Unit } from '../engine/types';
import { createInitialGameState } from '../engine/gameState';
import { stepSimulation } from '../engine/simulation';
import { luocha } from '../../data/characters/luocha';
import { registry } from '../registry';
import { luochaHandlerFactory } from '../../data/characters/luocha-handler';
import { Enemy, Element } from '../../types';

// Register Luocha
registry.registerCharacter('luocha', luochaHandlerFactory);

// Mock Enemy
const mockEnemy: Enemy = {
    id: 'enemy-1',
    name: 'Mock Enemy',
    element: 'Imaginary',
    baseStats: { hp: 10000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 100 },
    baseRes: {},
    toughness: 100,
    abilities: {
        basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', description: '', targetType: 'single_enemy', toughnessReduction: 10 },
        skill: { id: 'skill', name: 'Skill', type: 'Skill', description: '', targetType: 'single_enemy', toughnessReduction: 20 },
        ultimate: { id: 'ult', name: 'Ult', type: 'Ultimate', description: '', targetType: 'single_enemy', toughnessReduction: 30 },
        talent: { id: 'talent', name: 'Talent', type: 'Talent', description: '', targetType: 'self', toughnessReduction: 0 },
        technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '', targetType: 'self', toughnessReduction: 0 }
    }
};

// Helper functions
function runSteps(state: GameState, count: number): GameState {
    let currentState = state;
    for (let i = 0; i < count; i++) {
        currentState = stepSimulation(currentState);
    }
    return currentState;
}

function getUnit(state: GameState, id: string): Unit {
    return state.units.find(u => u.id === id)!;
}

// Test 1: E1 Aura System - Field grants all allies ATK+20%
async function testE1AuraSystem() {
    console.log('--- Test 1: E1 Aura System (ATK+20% for all allies) ---');
    let state = createInitialGameState({
        characters: [luocha],
        enemies: [mockEnemy],
        weaknesses: new Set<Element>(['Imaginary']),
        enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
        rounds: 5,
        partyConfig: {
            members: [{ character: luocha, config: { rotation: ['Skill'], ultStrategy: 'cooldown' as const, ultCooldown: 0 }, enabled: true, eidolonLevel: 1 }]
        }
    });

    const luochaId = state.units.find(u => u.name === '羅刹')!.id;

    // Deploy Field (2 skills)
    console.log('Deploying Field with 2 Skills...');
    state = registry.getCharacterFactory('luocha')!(luochaId, 80, 1).handlerLogic(
        { type: 'ON_SKILL_USED', sourceId: luochaId, targetId: luochaId, value: 0 },
        state,
        'handler'
    );
    state = registry.getCharacterFactory('luocha')!(luochaId, 80, 1).handlerLogic(
        { type: 'ON_SKILL_USED', sourceId: luochaId, targetId: luochaId, value: 0 },
        state,
        'handler'
    );

    let unit = getUnit(state, luochaId);
    const field = unit.effects.find(e => e.id === 'luocha-field-buff');
    console.log(`Field active: ${!!field}`);
    if (!field) throw new Error('Field should be active');

    // Check E1 Buff (ATK +20%)
    const e1Buff = unit.effects.find(e => e.name === 'Luocha E1 ATK+20%');
    console.log(`E1 Buff present: ${!!e1Buff}`);
    if (!e1Buff) throw new Error('E1 Buff should be present');

    // Check modifier
    const atkModifier = unit.modifiers.find(m => m.source === 'Luocha E1');
    console.log(`ATK Modifier: ${atkModifier?.value}`);
    if (!atkModifier || atkModifier.value !== 0.20) throw new Error('ATK Modifier should be +20%');

    console.log('SUCCESS: E1 Aura System works correctly.');
}

// Test 2: E4 Aura System - Field applies DMG Dealt -12% debuff to all enemies
async function testE4AuraSystem() {
    console.log('--- Test 2: E4 Aura System (DMG Dealt -12% for all enemies) ---');
    let state = createInitialGameState({
        characters: [luocha],
        enemies: [mockEnemy],
        weaknesses: new Set<Element>(['Imaginary']),
        enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
        rounds: 5,
        partyConfig: {
            members: [{ character: luocha, config: { rotation: ['Skill'], ultStrategy: 'cooldown' as const, ultCooldown: 0 }, enabled: true, eidolonLevel: 4 }]
        }
    });

    const luochaId = state.units.find(u => u.name === '羅刹')!.id;
    const enemyId = state.units.find(u => u.isEnemy)!.id;

    // Deploy Field
    console.log('Deploying Field...');
    state = registry.getCharacterFactory('luocha')!(luochaId, 80, 4).handlerLogic(
        { type: 'ON_SKILL_USED', sourceId: luochaId, targetId: luochaId, value: 0 },
        state,
        'handler'
    );
    state = registry.getCharacterFactory('luocha')!(luochaId, 80, 4).handlerLogic(
        { type: 'ON_SKILL_USED', sourceId: luochaId, targetId: luochaId, value: 0 },
        state,
        'handler'
    );

    // Check E4 Debuff on enemy
    let enemy = getUnit(state, enemyId);
    const e4Debuff = enemy.effects.find(e => e.name === 'Luocha E4 DMG Dealt -12%');
    console.log(`E4 Debuff present on enemy: ${!!e4Debuff}`);
    if (!e4Debuff) throw new Error('E4 Debuff should be present on enemy');

    // Check modifier
    const dmgReductionModifier = enemy.modifiers.find(m => m.source === 'Luocha E4');
    console.log(`DMG Dealt Reduction Modifier: ${dmgReductionModifier?.value}`);
    if (!dmgReductionModifier || dmgReductionModifier.value !== 0.12) throw new Error('DMG Dealt Reduction should be 12%');

    console.log('SUCCESS: E4 Aura System works correctly.');
}

// Test 3: E6 Fixed Chance - ignoreResistance flag
async function testE6FixedChance() {
    console.log('--- Test 3: E6 Fixed Chance (ignoreResistance flag) ---');
    let state = createInitialGameState({
        characters: [luocha],
        enemies: [mockEnemy],
        weaknesses: new Set<Element>(['Imaginary']),
        enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
        rounds: 5,
        partyConfig: {
            members: [{ character: luocha, config: { rotation: ['Ultimate'], ultStrategy: 'immediate' as const, ultCooldown: 0 }, enabled: true, eidolonLevel: 6 }]
        }
    });

    const luochaId = state.units.find(u => u.name === '羅刹')!.id;
    const enemyId = state.units.find(u => u.isEnemy)!.id;

    // Use Ultimate
    console.log('Using Ultimate (E6)...');
    state = registry.getCharacterFactory('luocha')!(luochaId, 80, 6).handlerLogic(
        { type: 'ON_ULTIMATE_USED', sourceId: luochaId, value: 0 },
        state,
        'handler'
    );

    // Check E6 Debuff
    let enemy = getUnit(state, enemyId);
    const e6Debuff = enemy.effects.find(e => e.name === 'Res Down (E6)');
    console.log(`E6 Debuff present: ${!!e6Debuff}`);
    if (!e6Debuff) throw new Error('E6 Debuff should be present');

    // Check ignoreResistance flag
    console.log(`ignoreResistance flag: ${e6Debuff.ignoreResistance}`);
    if (e6Debuff.ignoreResistance !== true) throw new Error('ignoreResistance should be true');

    // Check modifiers (all resistances -20%)
    const resModifiers = e6Debuff.modifiers?.filter(m => m.source === 'Luocha E6');
    console.log(`Resistance modifiers count: ${resModifiers?.length}`);
    if (!resModifiers || resModifiers.length !== 7) throw new Error('Should have 7 resistance modifiers (all elements)');

    console.log('SUCCESS: E6 Fixed Chance works correctly.');
}

// Test 4: Field Cleanup - E1/E4 buffs/debuffs removed when field ends
async function testFieldCleanup() {
    console.log('--- Test 4: Field Cleanup (E1/E4 removal) ---');
    let state = createInitialGameState({
        characters: [luocha],
        enemies: [mockEnemy],
        weaknesses: new Set<Element>(['Imaginary']),
        enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
        rounds: 5,
        partyConfig: {
            members: [{ character: luocha, config: { rotation: ['Skill'], ultStrategy: 'cooldown' as const, ultCooldown: 0 }, enabled: true, eidolonLevel: 4 }]
        }
    });

    const luochaId = state.units.find(u => u.name === '羅刹')!.id;
    const enemyId = state.units.find(u => u.isEnemy)!.id;

    // Deploy Field
    state = registry.getCharacterFactory('luocha')!(luochaId, 80, 4).handlerLogic(
        { type: 'ON_SKILL_USED', sourceId: luochaId, targetId: luochaId, value: 0 },
        state,
        'handler'
    );
    state = registry.getCharacterFactory('luocha')!(luochaId, 80, 4).handlerLogic(
        { type: 'ON_SKILL_USED', sourceId: luochaId, targetId: luochaId, value: 0 },
        state,
        'handler'
    );

    // Verify buffs/debuffs are present
    let luochaUnit = getUnit(state, luochaId);
    let enemyUnit = getUnit(state, enemyId);
    if (!luochaUnit.effects.find(e => e.name === 'Luocha E1 ATK+20%')) throw new Error('E1 Buff missing');
    if (!enemyUnit.effects.find(e => e.name === 'Luocha E4 DMG Dealt -12%')) throw new Error('E4 Debuff missing');

    console.log('Buffs/Debuffs present. Removing field manually...');

    // Remove field manually (simulate field expiration via onRemove)
    const field = luochaUnit.effects.find(e => e.id === 'luocha-field-buff');
    if (field && field.onRemove) {
        state = field.onRemove(luochaUnit, state);
    }

    // Verify buffs/debuffs are removed
    luochaUnit = getUnit(state, luochaId);
    enemyUnit = getUnit(state, enemyId);
    const e1BuffRemaining = luochaUnit.effects.find(e => e.name === 'Luocha E1 ATK+20%');
    const e4DebuffRemaining = enemyUnit.effects.find(e => e.name === 'Luocha E4 DMG Dealt -12%');

    console.log(`E1 Buff remaining: ${!!e1BuffRemaining}, E4 Debuff remaining: ${!!e4DebuffRemaining}`);
    if (e1BuffRemaining || e4DebuffRemaining) throw new Error('Buffs/Debuffs should be removed when field ends');

    console.log('SUCCESS: Field cleanup works correctly.');
}

// Run all tests
async function runTests() {
    // Test 5: Technique Activation - Field deployed at battle start
    async function testTechniqueActivation() {
        console.log('--- Test 5: Technique Activation ---');
        let state = createInitialGameState({
            characters: [luocha],
            enemies: [mockEnemy],
            weaknesses: new Set<Element>(['Imaginary']),
            enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
            rounds: 5,
            partyConfig: {
                members: [{ character: luocha, config: { rotation: ['Skill'], ultStrategy: 'cooldown' as const, ultCooldown: 0 }, enabled: true, eidolonLevel: 0 }]
            }
        });

        const luochaId = state.units.find(u => u.name === '羅刹')!.id;

        // Trigger ON_BATTLE_START
        state = registry.getCharacterFactory('luocha')!(luochaId, 80, 0).handlerLogic(
            { type: 'ON_BATTLE_START', sourceId: luochaId, value: 0 },
            state,
            'handler'
        );

        // Check Field
        let unit = getUnit(state, luochaId);
        const field = unit.effects.find(e => e.id === 'luocha-field-buff');
        console.log(`Field active at battle start: ${!!field}`);
        if (!field) throw new Error('Field should be active at battle start (Technique)');

        console.log('SUCCESS: Technique Activation works correctly.');
    }

    try {
        await testTechniqueActivation();
        await testE1AuraSystem();
        await testE4AuraSystem();
        await testE6FixedChance();
        await testFieldCleanup();
        console.log('\n=== ALL TESTS PASSED ===');
    } catch (e) {
        console.error('\n=== TEST FAILED ===');
        console.error(e);
        process.exit(1);
    }
}

runTests();
