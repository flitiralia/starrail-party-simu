import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { march7th, march7thHandlerFactory } from '../../data/characters/march-7th';
import { Character, Enemy } from '../../types';
import { registry } from '../registry';

// Mock Enemy
const mockEnemy: Enemy = {
    id: 'sandbag',
    name: 'Sandbag',
    element: 'Physical',
    toughness: 30,
    baseRes: {},
    baseStats: { hp: 100000, atk: 100, def: 0, spd: 100, critRate: 0.05, critDmg: 0.5 },
    abilities: {
        basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: 'desc', targetType: 'single_enemy', damage: { type: 'simple', multiplier: 1, scaling: 'atk' }, hits: 1 },
        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: 'desc', targetType: 'single_enemy' },
        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: 'desc', targetType: 'single_enemy' },
        talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: 'desc' },
        technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: 'desc' }
    }
};

function reproduceEpOverwrite() {
    console.log('--- Reproducing EP Overwrite Issue ---');

    const march: Character = { ...march7th };
    const config = {
        characters: [march],
        enemies: [mockEnemy],
        weaknesses: new Set(['Ice']),
        partyConfig: {
            members: [
                { characterId: march.id, enabled: true, eidolonLevel: 0, config: { rotation: ['s'], ultStrategy: 'cooldown', ultCooldown: 0 } }
            ]
        },
        characterConfig: { rotation: ['s'], ultStrategy: 'cooldown', ultCooldown: 0 },
        enemyConfig: { level: 80, maxHp: 100000, spd: 100, toughness: 100 },
        rounds: 1
    } as any;

    registry.registerCharacter('march-7th', march7thHandlerFactory);

    let state = createInitialGameState(config);
    const factory = march7thHandlerFactory(march.id, 80, 0);
    state = dispatch(state, {
        type: 'REGISTER_HANDLERS',
        handlers: [{ metadata: factory.handlerMetadata, logic: factory.handlerLogic }]
    });

    const marchId = march.id;
    const enemyId = mockEnemy.id;

    // 1. Set EP to Max
    state.units = state.units.map(u => u.id === marchId ? { ...u, ep: 120 } : u);
    console.log(`Initial EP: ${state.units.find(u => u.id === marchId)!.ep}`);

    // 2. Use Ultimate
    console.log('Dispatching ULTIMATE...');
    state = dispatch(state, { type: 'ULTIMATE', sourceId: marchId, targetId: enemyId } as any);
    const epAfterUlt = state.units.find(u => u.id === marchId)!.ep;
    console.log(`EP after Ultimate: ${epAfterUlt}`);

    // 3. Use Basic Attack
    console.log('Dispatching BASIC_ATTACK...');
    state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: marchId, targetId: enemyId } as any);
    const epAfterBasic = state.units.find(u => u.id === marchId)!.ep;
    console.log(`EP after Basic Attack: ${epAfterBasic}`);

    // Expected: epAfterUlt + 20
    // Reported Bug: 20 (overwritten)
    const expected = epAfterUlt + 20;
    if (epAfterBasic === expected) {
        console.log('PASS: EP accumulated correctly');
    } else {
        console.error(`FAIL: EP mismatch. Expected ${expected}, got ${epAfterBasic}`);
    }
}

reproduceEpOverwrite();
