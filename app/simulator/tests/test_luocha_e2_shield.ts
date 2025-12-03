import { createInitialGameState } from '../engine/gameState';
import { luocha } from '../../data/characters/luocha';
import { luochaHandlerFactory } from '../../data/characters/luocha-handler';
import { registry } from '../registry/index';
import { Enemy, Element } from '../../types/index';

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

async function testE2ShieldMaxHP() {
    console.log('--- Test: E2 Shield with Max HP Target ---');

    // Setup State with E2 Luocha
    let state = createInitialGameState({
        characters: [luocha],
        enemies: [mockEnemy],
        weaknesses: new Set<Element>(['Imaginary']),
        enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
        rounds: 5,
        partyConfig: {
            members: [{ character: luocha, config: { rotation: ['Skill'], ultStrategy: 'cooldown' as const, ultCooldown: 0 }, enabled: true, eidolonLevel: 2 }]
        }
    });

    const luochaId = state.units.find(u => u.name === '羅刹')!.id;

    // Check Luocha's HP (should be max)
    let luochaUnit = state.units.find(u => u.id === luochaId)!;
    console.log(`Luocha HP: ${luochaUnit.hp} / ${luochaUnit.stats.hp} (${(luochaUnit.hp / luochaUnit.stats.hp * 100).toFixed(1)}%)`);
    console.log(`Luocha Eidolon Level: ${luochaUnit.eidolonLevel}`);

    // Manually invoke Skill Handler (since dispatch doesn't work without full handler registration)
    console.log('Invoking Skill Handler (target self at max HP)...');
    state = registry.getCharacterFactory('luocha')!(luochaId, 80, 2).handlerLogic(
        { type: 'ON_SKILL_USED', sourceId: luochaId, targetId: luochaId, value: 0 },
        state,
        'handler'
    );

    // Check for E2 Shield
    luochaUnit = state.units.find(u => u.id === luochaId)!;
    const hasE2Shield = luochaUnit.effects.some(e => e.id === 'luocha-e2-shield');
    const shieldEffect = luochaUnit.effects.find(e => e.id === 'luocha-e2-shield');
    console.log(`HP after skill: ${luochaUnit.hp} / ${luochaUnit.stats.hp} (${(luochaUnit.hp / luochaUnit.stats.hp * 100).toFixed(1)}%)`);
    console.log(`Shield value on unit: ${luochaUnit.shield}`);
    console.log(`E2 Shield present: ${hasE2Shield}`);
    if (shieldEffect) {
        console.log(`Shield effect duration: ${shieldEffect.duration}`);
        console.log(`Shield effect value: ${(shieldEffect as any).value}`);
    }
    console.log(`All effects:`, luochaUnit.effects.map(e => e.name));

    // Check Log
    console.log('--- Simulation Log (Last 3 entries) ---');
    state.log.slice(-3).forEach(l => {
        console.log(JSON.stringify(l, null, 2));
    });

    // Check Statistics
    console.log('--- Battle Statistics ---');
    const stats = state.result.characterStats[luochaId];
    if (stats) {
        console.log(`Damage Dealt: ${stats.damageDealt}`);
        console.log(`Healing Dealt: ${stats.healingDealt}`);
        console.log(`Shield Provided: ${stats.shieldProvided}`);
    } else {
        console.log('No statistics found for Luocha.');
    }

    if (hasE2Shield && luochaUnit.shield > 0) {
        console.log('SUCCESS: E2 Shield was applied to max HP target.');
    } else {
        console.error('FAIL: E2 Shield was NOT applied correctly.');
        console.error(`  - Shield effect present: ${hasE2Shield}`);
        console.error(`  - Shield value on unit: ${luochaUnit.shield}`);
        process.exit(1);
    }
}

testE2ShieldMaxHP();
