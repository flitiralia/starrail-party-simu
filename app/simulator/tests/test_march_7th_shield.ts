import { createInitialGameState } from '../engine/gameState';
import { march7th } from '../../data/characters/march-7th';
import { march7thHandlerFactory } from '../../data/characters/march-7th';
import { registry } from '../registry/index';
import { dispatch } from '../engine/dispatcher';
import { Action, GameState } from '../engine/types';
import { Enemy, Element } from '../../types/index';

// Register March 7th
registry.registerCharacter('march-7th', march7thHandlerFactory);

// Mock Enemy
const mockEnemy: Enemy = {
    id: 'enemy-1',
    name: 'Mock Enemy',
    element: 'Ice',
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

function setupSimulation(eidolonLevel: number = 0): GameState {
    const march = { ...march7th, eidolonLevel };

    return createInitialGameState({
        characters: [march],
        enemies: [mockEnemy],
        weaknesses: new Set<Element>(['Ice']),
        enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
        rounds: 5,
        partyConfig: {
            members: [{ character: march, config: { rotation: ['Skill'], ultStrategy: 'cooldown' as const, ultCooldown: 0 }, enabled: true, eidolonLevel }]
        }
    });
}

async function testMarch7thShield() {
    console.log('--- Testing March 7th Shield (Skill & E2) ---');

    // 1. Test Skill Shield (E0)
    console.log('\n[Test 1] Skill Shield (E0)');
    let state = setupSimulation(0);
    const marchId = 'march-7th';

    // Execute Skill
    const skillAction: Action = {
        type: 'SKILL',
        sourceId: marchId,
        targetId: marchId, // Target self
    };

    const result = await dispatch(state, skillAction);
    state = result.state;

    // Check Shield
    const march = state.units.find(u => u.id === marchId)!;
    console.log(`March Shield: ${march.shield}`);

    // Check Stats
    const stats: any = (state.result as any).characterStats[marchId];
    console.log(`Shield Provided: ${stats?.shieldProvided}`);

    if (march.shield > 0 && stats && stats.shieldProvided > 0) {
        console.log('SUCCESS: Skill Shield applied and stats updated.');
    } else {
        console.error('FAILURE: Skill Shield not applied or stats not updated.');
    }

    // 2. Test E2 Shield (Battle Start)
    console.log('\n[Test 2] E2 Shield (Battle Start)');

    let stateE2 = setupSimulation(2);

    // Manually dispatch BATTLE_START
    const battleStartAction: Action = {
        type: 'BATTLE_START',
        sourceId: 'system',
        targetId: 'system'
    };

    const resultE2 = await dispatch(stateE2, battleStartAction);
    stateE2 = resultE2.state;

    const marchE2 = stateE2.units.find(u => u.id === marchId)!;
    console.log(`March Shield (E2): ${marchE2.shield}`);

    const statsE2: any = (stateE2.result as any).characterStats[marchId];
    console.log(`Shield Provided (E2): ${statsE2?.shieldProvided}`);

    if (marchE2.shield > 0 && statsE2 && statsE2.shieldProvided > 0) {
        console.log('SUCCESS: E2 Shield applied and stats updated.');
    } else {
        console.error('FAILURE: E2 Shield not applied or stats not updated.');
    }
}

testMarch7thShield().catch(console.error);
