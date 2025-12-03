import { createMockState, createMockUnit } from '../test_mechanics';
import { dispatch, publishEvent } from '../app/simulator/engine/dispatcher';
import { tribbie, tribbieHandlerFactory } from '../app/data/characters/tribbie';
import { registry } from '../app/simulator/registry/index';
import { createInitialGameState } from '../app/simulator/engine/gameState';
import { Character, Enemy } from '../app/types/index';

// Register Tribbie
registry.registerCharacter('tribbie', tribbieHandlerFactory);

function testTribbieStats() {
    console.log('--- Test: Tribbie Stats ---');
    const config: any = {
        characters: [tribbie],
        enemies: [],
        weaknesses: new Set(),
        characterConfig: {},
        partyConfig: { members: [{ characterId: 'tribbie', enabled: true }] },
        enemyConfig: { level: 80, maxHp: 10000, spd: 100, toughness: 100 }
    };
    const state = createInitialGameState(config);
    const u = state.units.find(unit => unit.id === 'tribbie');
    if (!u) throw new Error('Tribbie not found');

    if (u.baseStats.hp !== 1047) throw new Error(`HP mismatch: ${u.baseStats.hp}`);
    if (u.baseStats.atk !== 524) throw new Error(`ATK mismatch: ${u.baseStats.atk}`);
    if (u.baseStats.def !== 728) throw new Error(`DEF mismatch: ${u.baseStats.def}`);
    if (u.baseStats.spd !== 96) throw new Error(`SPD mismatch: ${u.baseStats.spd}`);

    console.log('PASS');
}

function testTribbieTechnique() {
    console.log('--- Test: Tribbie Technique ---');
    let state = createMockState([createMockUnit('tribbie', false)]);
    // Initialize handler
    const factory = registry.getCharacterFactory('tribbie');
    const handler = factory!('tribbie', 80, 0);
    state.eventHandlers.push({ id: handler.handlerMetadata.id, subscribesTo: handler.handlerMetadata.subscribesTo });
    state.eventHandlerLogics[handler.handlerMetadata.id] = handler.handlerLogic;

    state = publishEvent(state, { type: 'ON_BATTLE_START', sourceId: 'system' });

    const u = state.units.find(unit => unit.id === 'tribbie');
    const buff = u!.modifiers.find(m => m.source === 'Divine Revelation');
    if (!buff) throw new Error('Divine Revelation not applied');
    if (buff.value !== 0.24) throw new Error(`Res Pen mismatch: ${buff.value}`);

    console.log('PASS');
}

function testTribbieSkill() {
    console.log('--- Test: Tribbie Skill ---');
    // We need to use createInitialGameState to get the correct Ability structure with effects
    const config: any = {
        characters: [tribbie],
        enemies: [],
        weaknesses: new Set(),
        characterConfig: {},
        partyConfig: { members: [{ characterId: 'tribbie', enabled: true }] },
        enemyConfig: { level: 80, maxHp: 10000, spd: 100, toughness: 100 }
    };
    let state = createInitialGameState(config);

    // Initialize handler (needed for some logic, though Skill effect is handled by dispatcher)
    const factory = registry.getCharacterFactory('tribbie');
    const handler = factory!('tribbie', 80, 0);
    state.eventHandlers.push({ id: handler.handlerMetadata.id, subscribesTo: handler.handlerMetadata.subscribesTo });
    state.eventHandlerLogics[handler.handlerMetadata.id] = handler.handlerLogic;

    state = dispatch(state, { type: 'SKILL', sourceId: 'tribbie', targetId: 'tribbie' });

    const u = state.units.find(unit => unit.id === 'tribbie');
    const buff = u!.modifiers.find(m => m.source === 'Divine Revelation');
    if (!buff) throw new Error('Divine Revelation not applied by Skill');

    console.log('PASS');
}

function testTribbieUltimateAndTalent() {
    console.log('--- Test: Tribbie Ultimate & Talent ---');
    const ally = createMockUnit('ally', false);
    const enemy = createMockUnit('enemy', true);
    enemy.hp = 10000;
    enemy.stats.hp = 10000;

    // Use createInitialGameState for Tribbie to get abilities
    const config: any = {
        characters: [tribbie],
        enemies: [], // We'll add enemy manually or via config
        weaknesses: new Set(),
        characterConfig: {},
        partyConfig: { members: [{ characterId: 'tribbie', enabled: true }] },
        enemyConfig: { level: 80, maxHp: 10000, spd: 100, toughness: 100 }
    };
    let state = createInitialGameState(config);
    // Add ally and enemy
    state.units.push(ally);
    state.units.push(enemy);

    // Initialize handler
    const factory = registry.getCharacterFactory('tribbie');
    const handler = factory!('tribbie', 80, 0);
    state.eventHandlers.push({ id: handler.handlerMetadata.id, subscribesTo: handler.handlerMetadata.subscribesTo });
    state.eventHandlerLogics[handler.handlerMetadata.id] = handler.handlerLogic;

    // 1. Tribbie Ultimate
    state = dispatch(state, { type: 'ULTIMATE', sourceId: 'tribbie', targetId: 'enemy' });

    const u = state.units.find(unit => unit.id === 'tribbie');
    const field = u!.effects.find(e => e.name === 'Who Lives Here!');
    if (!field) throw new Error('Field not applied');

    // 2. Ally Attack (Trigger Field Additional DMG)
    const hpBefore = state.units.find(u => u.id === 'enemy')!.hp;
    state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: 'ally', targetId: 'enemy' });
    const hpAfter = state.units.find(u => u.id === 'enemy')!.hp;

    // Ally Basic Attack deals 0 damage (mock unit has no stats/abilities set up for dmg usually, or default 0)
    // But Field Additional DMG should trigger.
    // Tribbie HP ~1047. Multiplier 0.12 (Lv.1). 
    // Wait, createInitialGameState uses Lv.80 stats.
    // Tribbie HP = 1047.
    // Damage = 1047 * 0.12 = 125.64.
    // Enemy HP should decrease by ~125.

    // Note: Mock Ally has 0 ATK usually so 0 dmg.
    if (hpAfter >= hpBefore) throw new Error(`Field Additional DMG did not trigger. HP: ${hpBefore} -> ${hpAfter}`);

    // 3. Ally Ultimate (Trigger Talent)
    const hpBeforeTalent = state.units.find(u => u.id === 'enemy')!.hp;
    state = dispatch(state, { type: 'ULTIMATE', sourceId: 'ally', targetId: 'enemy' });
    const hpAfterTalent = state.units.find(u => u.id === 'enemy')!.hp;

    // Check if Follow-up Attack executed
    // It should deal damage.
    // Tribbie Talent Multiplier 0.18 (Lv.10).
    // Damage = 1047 * 0.18 = 188.46.
    if (hpAfterTalent >= hpBeforeTalent) throw new Error(`Talent Follow-up did not trigger or deal damage. HP: ${hpBeforeTalent} -> ${hpAfterTalent}`);

    console.log('PASS');
}

function testTribbieE4() {
    console.log('--- Test: Tribbie E4 ---');
    const config: any = {
        characters: [tribbie],
        enemies: [],
        weaknesses: new Set(),
        characterConfig: {},
        partyConfig: { members: [{ characterId: 'tribbie', enabled: true, eidolonLevel: 4 }] },
        enemyConfig: { level: 80, maxHp: 10000, spd: 100, toughness: 100 }
    };
    let state = createInitialGameState(config);

    // Initialize handler
    const factory = registry.getCharacterFactory('tribbie');
    const handler = factory!('tribbie', 80, 4);
    state.eventHandlers.push({ id: handler.handlerMetadata.id, subscribesTo: handler.handlerMetadata.subscribesTo });
    state.eventHandlerLogics[handler.handlerMetadata.id] = handler.handlerLogic;

    // Skill
    state = dispatch(state, { type: 'SKILL', sourceId: 'tribbie', targetId: 'tribbie' });

    const u = state.units.find(unit => unit.id === 'tribbie');
    const buff = u!.modifiers.find(m => m.source === 'Divine Revelation' && m.target === 'all_type_res_pen');
    const defIgnore = u!.modifiers.find(m => m.source === 'Divine Revelation' && m.target === 'def_ignore');

    if (!buff) throw new Error('Divine Revelation (Res Pen) not applied');
    if (!defIgnore) throw new Error('E4 Def Ignore not applied');
    if (defIgnore.value !== 0.18) throw new Error(`E4 Def Ignore value mismatch: ${defIgnore.value}`);

    console.log('PASS');
}

function runTests() {
    try {
        testTribbieStats();
        testTribbieTechnique();
        testTribbieSkill();
        testTribbieUltimateAndTalent();
        testTribbieE4();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTests();
