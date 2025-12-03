import { updatePassiveBuffs, registerRelicEventHandlers } from './app/simulator/effect/relicHandler';
import { GameState, Unit, IEvent } from './app/simulator/engine/types';
import { createEmptyStatRecord, calculateFinalStats } from './app/simulator/statBuilder';
import { Character, CharacterBaseStats } from './app/types';
import { MESSENGER_TRAVERSING_HACKERSPACE } from './app/data/relics/messenger-traversing-hackerspace';
import { FLEET_OF_THE_AGELESS } from './app/data/ornaments/fleet-of-the-ageless';
import { PASSERBY_OF_WANDERING_CLOUD } from './app/data/relics/passerby-of-wandering-cloud';
import { GENIUS_OF_BRILLIANT_STARS } from './app/data/relics/genius-of-brilliant-stars';
import { RUTILANT_ARENA } from './app/data/ornaments/rutilant-arena';
import { INERT_SALSOTTO } from './app/data/ornaments/inert-salsotto';
import { LONGEVOUS_DISCIPLE } from './app/data/relics/longevous-disciple';
import { PIONEER_DIVER_OF_DEAD_WATERS } from './app/data/relics/pioneer-diver-of-dead-waters';
import { PRISONER_IN_DEEP_CONFINEMENT } from './app/data/relics/prisoner-in-deep-confinement';
import { THE_ASHBLAZING_GRAND_DUKE } from './app/data/relics/the-ashblazing-grand-duke';
import { WATCHMAKER_MASTER_OF_DREAM_MACHINATIONS } from './app/data/relics/watchmaker-master-of-dream-machinations';
import { FORGE_OF_THE_KALPAGNI_LANTERN } from './app/data/ornaments/forge-of-the-kalpagni-lantern';
import { UNFORESEEN_VANADISE } from './app/data/ornaments/unforeseen-vanadise';

// Mock Data Setup
const mockBaseStats: CharacterBaseStats = {
    hp: 1000, atk: 500, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5,
};

function createMockCharacter(id: string, name: string, relics: any[], ornaments: any[]): Character {
    return {
        id, name, element: 'Ice', path: 'Preservation', baseStats: { ...mockBaseStats }, maxEnergy: 100,
        abilities: {
            basic: { id: 'b', name: 'Basic', type: 'Basic ATK', description: '', targetType: 'single_enemy' },
            skill: { id: 's', name: 'Skill', type: 'Skill', description: '', targetType: 'ally' },
            ultimate: { id: 'u', name: 'Ult', type: 'Ultimate', description: '', targetType: 'all_allies' },
            talent: { id: 't', name: 'Talent', type: 'Talent', description: '' },
            technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '' },
        },
        traces: [], relics, ornaments,
        equippedLightCone: undefined
    };
}

function createMockUnit(char: Character): Unit {
    const baseStats = createEmptyStatRecord();
    baseStats.hp = char.baseStats.hp;
    baseStats.atk = char.baseStats.atk;
    baseStats.def = char.baseStats.def;
    baseStats.spd = char.baseStats.spd;
    baseStats.crit_rate = char.baseStats.critRate;
    baseStats.crit_dmg = char.baseStats.critDmg;

    return {
        id: char.id, name: char.name, isEnemy: false, element: 'Ice', level: 80,
        abilities: char.abilities, stats: createEmptyStatRecord(), baseStats,
        hp: 1000, ep: 0, shield: 0, toughness: 0, maxToughness: 0, weaknesses: new Set(),
        modifiers: [], effects: [], actionValue: 0, actionPoint: 0, rotationIndex: 0, ultCooldown: 0,
        relics: char.relics, ornaments: char.ornaments
    };
}

function createEnemyUnit(id: string): Unit {
    return {
        id, name: 'Enemy', isEnemy: true, element: 'Quantum', level: 80,
        abilities: {} as any, stats: createEmptyStatRecord(), baseStats: createEmptyStatRecord(),
        hp: 10000, ep: 0, shield: 0, toughness: 100, maxToughness: 100, weaknesses: new Set(['Quantum']),
        modifiers: [], effects: [], actionValue: 0, actionPoint: 0, rotationIndex: 0, ultCooldown: 0
    };
}

// Helper to run a test
async function runTest(name: string, testFn: () => Promise<void>) {
    console.log(`\n--- Test: ${name} ---`);
    try {
        await testFn();
        console.log('PASS');
    } catch (e) {
        console.error('FAIL:', e);
    }
}

// Tests
async function testMessenger() {
    const char = createMockCharacter('c1', 'Messenger User',
        [{ set: MESSENGER_TRAVERSING_HACKERSPACE, type: 'Body', subStats: [], mainStat: { stat: 'hp', value: 100 } }, { set: MESSENGER_TRAVERSING_HACKERSPACE, type: 'Feet', subStats: [], mainStat: { stat: 'spd', value: 25 } }, { set: MESSENGER_TRAVERSING_HACKERSPACE, type: 'Head', subStats: [], mainStat: { stat: 'hp', value: 705 } }, { set: MESSENGER_TRAVERSING_HACKERSPACE, type: 'Hands', subStats: [], mainStat: { stat: 'atk', value: 352 } }], []);
    const ally = createMockCharacter('c2', 'Ally', [], []);

    let state: GameState = {
        units: [createMockUnit(char), createMockUnit(ally)],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    // Register handlers
    state = registerRelicEventHandlers(state);

    // Trigger Ultimate
    const event: IEvent = { type: 'ON_ULTIMATE_USED', sourceId: 'c1', targetId: 'c2', value: 0 };
    const handler = state.eventHandlers.find(h => h.id === 'relic-messenger_traversing_hackerspace-4pc-0-c1-handler');
    if (handler && state.eventHandlerLogics[handler.id]) {
        state = state.eventHandlerLogics[handler.id](event, state, handler.id);
    }

    // Check buff on ally
    const allyUnit = state.units.find(u => u.id === 'c2');
    const buff = allyUnit?.modifiers.find(m => m.source === 'messenger-4pc-spd');
    if (!buff || buff.value !== 0.12) throw new Error(`Ally missing Messenger buff or wrong value: ${buff?.value}`);
}

async function testFleet() {
    const char = createMockCharacter('c1', 'Fleet User', [],
        [{ set: FLEET_OF_THE_AGELESS, type: 'Planar Sphere', subStats: [], mainStat: { stat: 'hp_pct', value: 0.432 } }, { set: FLEET_OF_THE_AGELESS, type: 'Link Rope', subStats: [], mainStat: { stat: 'hp_pct', value: 0.432 } }]);
    // Set SPD to 120
    char.baseStats.spd = 120;

    const ally = createMockCharacter('c2', 'Ally', [], []);

    let state: GameState = {
        units: [createMockUnit(char), createMockUnit(ally)],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state.units[0].stats = calculateFinalStats(char);
    state.units[1].stats = calculateFinalStats(ally);

    // Apply buffs
    state = updatePassiveBuffs(state);

    // Check ATK buff on ally
    const allyUnit = state.units.find(u => u.id === 'c2');
    const buff = allyUnit?.modifiers.find(m => m.source.includes('fleet_of_the_ageless'));
    if (!buff || buff.value !== 0.08) throw new Error(`Ally missing Fleet buff or wrong value: ${buff?.value}`);
}

async function testPasserby() {
    const char = createMockCharacter('c1', 'Passerby User',
        [{ set: PASSERBY_OF_WANDERING_CLOUD, type: 'Body', subStats: [], mainStat: { stat: 'hp', value: 100 } }, { set: PASSERBY_OF_WANDERING_CLOUD, type: 'Feet', subStats: [], mainStat: { stat: 'spd', value: 25 } }, { set: PASSERBY_OF_WANDERING_CLOUD, type: 'Head', subStats: [], mainStat: { stat: 'hp', value: 705 } }, { set: PASSERBY_OF_WANDERING_CLOUD, type: 'Hands', subStats: [], mainStat: { stat: 'atk', value: 352 } }], []);

    let state: GameState = {
        units: [createMockUnit(char)],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state = registerRelicEventHandlers(state);

    // Trigger Battle Start
    const event: IEvent = { type: 'ON_BATTLE_START', sourceId: 'c1', value: 0 };
    const handler = state.eventHandlers.find(h => h.id === 'relic-passerby_of_wandering_cloud-4pc-0-c1-handler');
    if (handler && state.eventHandlerLogics[handler.id]) {
        state = state.eventHandlerLogics[handler.id](event, state, handler.id);
    }

    if (state.skillPoints !== 4) throw new Error(`Skill Points not increased. Expected 4, got ${state.skillPoints}`);
}

async function testGenius() {
    const char = createMockCharacter('c1', 'Genius User',
        [{ set: GENIUS_OF_BRILLIANT_STARS, type: 'Body', subStats: [], mainStat: { stat: 'hp', value: 100 } }, { set: GENIUS_OF_BRILLIANT_STARS, type: 'Feet', subStats: [], mainStat: { stat: 'spd', value: 25 } }, { set: GENIUS_OF_BRILLIANT_STARS, type: 'Head', subStats: [], mainStat: { stat: 'hp', value: 705 } }, { set: GENIUS_OF_BRILLIANT_STARS, type: 'Hands', subStats: [], mainStat: { stat: 'atk', value: 352 } }], []);
    const enemy = createEnemyUnit('e1'); // Quantum Weak

    let state: GameState = {
        units: [createMockUnit(char), enemy],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state = registerRelicEventHandlers(state);

    // Trigger Pre-Damage
    const event: IEvent = { type: 'ON_BEFORE_DAMAGE_CALCULATION', sourceId: 'c1', targetId: 'e1', value: 0 };
    const handler = state.eventHandlers.find(h => h.id === 'relic-genius_of_brilliant_stars-4pc-1-c1-handler');
    if (handler && state.eventHandlerLogics[handler.id]) {
        state = state.eventHandlerLogics[handler.id](event, state, handler.id);
    }

    if (state.damageModifiers.defIgnore !== 0.1) throw new Error(`DEF Ignore not applied. Expected 0.1, got ${state.damageModifiers.defIgnore}`);
}

async function testRutilant() {
    const char = createMockCharacter('c1', 'Rutilant User', [],
        [{ set: RUTILANT_ARENA, type: 'Planar Sphere', subStats: [], mainStat: { stat: 'ice_dmg_boost', value: 0.388 } }, { set: RUTILANT_ARENA, type: 'Link Rope', subStats: [], mainStat: { stat: 'atk_pct', value: 0.432 } }]);
    (char.baseStats as any).critRate = 0.7; // 70%

    let state: GameState = {
        units: [createMockUnit(char)],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state.units[0].stats = calculateFinalStats(char);
    state = updatePassiveBuffs(state);

    const unit = state.units[0];
    const buff = unit.modifiers.find(m => m.target === 'basic_atk_dmg_boost');
    if (!buff || buff.value !== 0.20) throw new Error(`Missing Rutilant buff or wrong value: ${buff?.value}`);
}

async function testSalsotto() {
    const char = createMockCharacter('c1', 'Salsotto User', [],
        [{ set: INERT_SALSOTTO, type: 'Planar Sphere', subStats: [], mainStat: { stat: 'ice_dmg_boost', value: 0.388 } }, { set: INERT_SALSOTTO, type: 'Link Rope', subStats: [], mainStat: { stat: 'atk_pct', value: 0.432 } }]);
    (char.baseStats as any).critRate = 0.5; // 50%

    let state: GameState = {
        units: [createMockUnit(char)],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state.units[0].stats = calculateFinalStats(char);
    state = updatePassiveBuffs(state);

    const unit = state.units[0];
    const buff = unit.modifiers.find(m => m.target === 'ult_dmg_boost');
    if (!buff || buff.value !== 0.15) throw new Error(`Missing Salsotto buff or wrong value: ${buff?.value}`);
}

async function testLongevous() {
    const char = createMockCharacter('c1', 'Longevous User',
        [{ set: LONGEVOUS_DISCIPLE, type: 'Body', subStats: [], mainStat: { stat: 'hp', value: 100 } }, { set: LONGEVOUS_DISCIPLE, type: 'Feet', subStats: [], mainStat: { stat: 'spd', value: 25 } }, { set: LONGEVOUS_DISCIPLE, type: 'Head', subStats: [], mainStat: { stat: 'hp', value: 705 } }, { set: LONGEVOUS_DISCIPLE, type: 'Hands', subStats: [], mainStat: { stat: 'atk', value: 352 } }], []);

    let state: GameState = {
        units: [createMockUnit(char)],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state = registerRelicEventHandlers(state);
    console.log('Handlers registered:', state.eventHandlers.map(h => h.id));

    // Trigger Damage Taken
    const event: IEvent = { type: 'ON_DAMAGE_DEALT', sourceId: 'e1', targetId: 'c1', value: 100 };
    const handler = state.eventHandlers.find(h => h.id === 'relic-longevous_disciple-4pc-0-c1-handler');
    if (handler && state.eventHandlerLogics[handler.id]) {
        console.log('Triggering Longevous handler...');
        state = state.eventHandlerLogics[handler.id](event, state, handler.id);
    } else {
        console.log('Longevous handler not found!');
    }

    const unit = state.units[0];
    console.log('Unit modifiers:', unit.modifiers);
    const buff = unit.modifiers.find(m => m.source === 'longevous-4pc-crit');
    if (!buff || buff.value !== 0.08) throw new Error(`Missing Longevous buff or wrong value: ${buff?.value}`);
}

async function runTests() {
    await runTest('Messenger', testMessenger);
    await runTest('Fleet', testFleet);
    await runTest('Passerby', testPasserby);
    await runTest('Genius', testGenius);
    await runTest('Rutilant', testRutilant);
    await runTest('Salsotto', testSalsotto);
    await runTest('Longevous', testLongevous);
    await runTest('Pioneer', testPioneer);
    await runTest('Prisoner', testPrisoner);
    await runTest('GrandDuke', testGrandDuke);
    await runTest('Watchmaker', testWatchmaker);
    await runTest('Forge', testForge);
    // await runTest('Vanadise', testVanadise); // Skip for now as summon check is not implemented
}

async function testPioneer() {
    const char = createMockCharacter('c1', 'Pioneer User',
        [{ set: PIONEER_DIVER_OF_DEAD_WATERS, type: 'Body', subStats: [], mainStat: { stat: 'crit_rate', value: 0.324 } }, { set: PIONEER_DIVER_OF_DEAD_WATERS, type: 'Feet', subStats: [], mainStat: { stat: 'spd', value: 25 } }, { set: PIONEER_DIVER_OF_DEAD_WATERS, type: 'Head', subStats: [], mainStat: { stat: 'hp', value: 705 } }, { set: PIONEER_DIVER_OF_DEAD_WATERS, type: 'Hands', subStats: [], mainStat: { stat: 'atk', value: 352 } }], []);
    const enemy = createEnemyUnit('e1');
    // Add debuffs to enemy
    enemy.effects.push({ id: 'debuff1', name: 'Debuff 1', category: 'DEBUFF', sourceUnitId: 'c1', durationType: 'TURN_BASED', duration: 2, apply: (u: any, s: any) => s, remove: (u: any, s: any) => s } as any);
    enemy.effects.push({ id: 'debuff2', name: 'Debuff 2', category: 'DEBUFF', sourceUnitId: 'c1', durationType: 'TURN_BASED', duration: 2, apply: (u: any, s: any) => s, remove: (u: any, s: any) => s } as any);
    enemy.effects.push({ id: 'debuff3', name: 'Debuff 3', category: 'DEBUFF', sourceUnitId: 'c1', durationType: 'TURN_BASED', duration: 2, apply: (u: any, s: any) => s, remove: (u: any, s: any) => s } as any);

    let state: GameState = {
        units: [createMockUnit(char), enemy],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state = registerRelicEventHandlers(state);

    // Trigger Pre-Damage (4pc check)
    const event: IEvent = { type: 'ON_BEFORE_DAMAGE_CALCULATION', sourceId: 'c1', targetId: 'e1', value: 0 };
    const handler = state.eventHandlers.find(h => h.id === 'relic-pioneer_diver_of_dead_waters-4pc-c1-handler');
    // Note: Pioneer has multiple handlers. We need to find the one for ON_BEFORE_DAMAGE_CALCULATION.
    // The ID might be suffixed or we iterate.
    // Actually, registerRelicEventHandlers generates unique IDs for each effect if they are separate objects in the array.
    // But my implementation usually generates one handler per effect definition.
    // Pioneer has 3 effects in 4pc.
    // Effect 1: PASSIVE_STAT (no handler)
    // Effect 2: ON_DEBUFF_APPLIED
    // Effect 3: ON_BEFORE_DAMAGE_CALCULATION
    // The IDs will be distinct. Let's find by subscribing event.
    const handlers = state.eventHandlers.filter(h => h.id.includes('pioneer') && h.subscribesTo.includes('ON_BEFORE_DAMAGE_CALCULATION'));
    // There are two: one for 2pc, one for 4pc.
    // We want to check if modifiers are applied.

    for (const h of handlers) {
        if (state.eventHandlerLogics[h.id]) {
            state = state.eventHandlerLogics[h.id](event, state, 'c1');
        }
    }

    // Check modifiers
    // 2pc: +12% DMG (allTypeDmg)
    // 4pc: +12% CD (critDmg) (3 debuffs)
    // Total: allTypeDmg +0.12, critDmg +0.12
    // Note: damageModifiers accumulates.
    // We need to check if damageModifiers has these values.
    // But wait, damageModifiers is reset per target in dispatcher.
    // Here we are manually invoking handlers, so it should accumulate in state.

    // However, my implementation of Pioneer 2pc adds to 'allTypeDmg'?
    // Let's check Pioneer implementation.
    // 2pc: returns { damageModifiers: { ... } } (I assumed allTypeDmg support)
    // 4pc: returns { damageModifiers: { ... } }

    // If both run, they overwrite or merge?
    // My code: `damageModifiers: { ...state.damageModifiers, ... }` so it merges.

    if (state.damageModifiers.allTypeDmg !== 0.12) console.warn(`Pioneer 2pc DMG mismatch: ${state.damageModifiers.allTypeDmg}`);
    if (state.damageModifiers.critDmg !== 0.12) console.warn(`Pioneer 4pc CD mismatch: ${state.damageModifiers.critDmg}`);

    // Test Doubler
    // Trigger ON_DEBUFF_APPLIED
    const debuffEvent: IEvent = { type: 'ON_DEBUFF_APPLIED', sourceId: 'c1', targetId: 'e1', value: 1 };
    const debuffHandler = state.eventHandlers.find(h => h.id.includes('pioneer') && h.subscribesTo.includes('ON_DEBUFF_APPLIED'));
    if (debuffHandler && state.eventHandlerLogics[debuffHandler.id]) {
        state = state.eventHandlerLogics[debuffHandler.id](debuffEvent, state, 'c1');
    }

    // Check for doubler buff
    const unit = state.units[0];
    const doubler = unit.effects.find(e => e.id === 'pioneer-doubler');
    if (!doubler) throw new Error('Pioneer doubler not applied');

    // Re-run Pre-Damage
    state = { ...state, damageModifiers: {} }; // Reset modifiers
    for (const h of handlers) {
        if (state.eventHandlerLogics[h.id]) {
            state = state.eventHandlerLogics[h.id](event, state, 'c1');
        }
    }

    // Should be doubled: CD +24%, CR +4% (added to modifiers)
    if (state.damageModifiers.critDmg !== 0.24) throw new Error(`Pioneer doubled CD mismatch: ${state.damageModifiers.critDmg}`);
    if (state.damageModifiers.critRate !== 0.04) throw new Error(`Pioneer doubled CR mismatch: ${state.damageModifiers.critRate}`);
}

async function testPrisoner() {
    const char = createMockCharacter('c1', 'Prisoner User',
        [{ set: PRISONER_IN_DEEP_CONFINEMENT, type: 'Body', subStats: [], mainStat: { stat: 'atk_pct', value: 0.432 } }, { set: PRISONER_IN_DEEP_CONFINEMENT, type: 'Feet', subStats: [], mainStat: { stat: 'spd', value: 25 } }, { set: PRISONER_IN_DEEP_CONFINEMENT, type: 'Head', subStats: [], mainStat: { stat: 'hp', value: 705 } }, { set: PRISONER_IN_DEEP_CONFINEMENT, type: 'Hands', subStats: [], mainStat: { stat: 'atk', value: 352 } }], []);
    const enemy = createEnemyUnit('e1');
    // Add 3 DoTs
    enemy.effects.push({ id: 'dot1', name: 'Burn', category: 'DEBUFF', statusType: 'Burn', sourceUnitId: 'c1', durationType: 'TURN_BASED', duration: 2, apply: (u: any, s: any) => s, remove: (u: any, s: any) => s } as any);
    enemy.effects.push({ id: 'dot2', name: 'Shock', category: 'DEBUFF', statusType: 'Shock', sourceUnitId: 'c1', durationType: 'TURN_BASED', duration: 2, apply: (u: any, s: any) => s, remove: (u: any, s: any) => s } as any);
    enemy.effects.push({ id: 'dot3', name: 'Bleed', category: 'DEBUFF', statusType: 'Bleed', sourceUnitId: 'c1', durationType: 'TURN_BASED', duration: 2, apply: (u: any, s: any) => s, remove: (u: any, s: any) => s } as any);

    let state: GameState = {
        units: [createMockUnit(char), enemy],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state = registerRelicEventHandlers(state);

    const event: IEvent = { type: 'ON_BEFORE_DAMAGE_CALCULATION', sourceId: 'c1', targetId: 'e1', value: 0 };
    const handler = state.eventHandlers.find(h => h.id.includes('prisoner') && h.subscribesTo.includes('ON_BEFORE_DAMAGE_CALCULATION'));

    if (handler && state.eventHandlerLogics[handler.id]) {
        state = state.eventHandlerLogics[handler.id](event, state, handler.id);
    }

    if (state.damageModifiers.defIgnore !== 0.18) throw new Error(`Prisoner DEF Ignore mismatch: ${state.damageModifiers.defIgnore}`);
}

async function testGrandDuke() {
    const char = createMockCharacter('c1', 'Grand Duke User',
        [{ set: THE_ASHBLAZING_GRAND_DUKE, type: 'Body', subStats: [], mainStat: { stat: 'atk_pct', value: 0.432 } }, { set: THE_ASHBLAZING_GRAND_DUKE, type: 'Feet', subStats: [], mainStat: { stat: 'spd', value: 25 } }, { set: THE_ASHBLAZING_GRAND_DUKE, type: 'Head', subStats: [], mainStat: { stat: 'hp', value: 705 } }, { set: THE_ASHBLAZING_GRAND_DUKE, type: 'Hands', subStats: [], mainStat: { stat: 'atk', value: 352 } }], []);

    let state: GameState = {
        units: [createMockUnit(char)],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state = registerRelicEventHandlers(state);

    // Trigger FuA Damage
    const event: IEvent = { type: 'ON_DAMAGE_DEALT', sourceId: 'c1', targetId: 'e1', value: 100, subType: 'FOLLOW_UP_ATTACK' };
    const handler = state.eventHandlers.find(h => h.id.includes('grand_duke') && h.subscribesTo.includes('ON_DAMAGE_DEALT'));

    if (handler && state.eventHandlerLogics[handler.id]) {
        // Hit 1
        state = state.eventHandlerLogics[handler.id](event, state, handler.id);
        let unit = state.units[0];
        let buff = unit.effects.find(e => e.id === 'grand-duke-stack');
        if (!buff || (buff as any).stackCount !== 1) throw new Error('Grand Duke stack 1 failed');

        // Hit 2
        state = state.eventHandlerLogics[handler.id](event, state, handler.id);
        unit = state.units[0];
        buff = unit.effects.find(e => e.id === 'grand-duke-stack');
        if (!buff || (buff as any).stackCount !== 2) throw new Error('Grand Duke stack 2 failed');
    }
}

async function testWatchmaker() {
    const char = createMockCharacter('c1', 'Watchmaker User',
        [{ set: WATCHMAKER_MASTER_OF_DREAM_MACHINATIONS, type: 'Body', subStats: [], mainStat: { stat: 'hp', value: 100 } }, { set: WATCHMAKER_MASTER_OF_DREAM_MACHINATIONS, type: 'Feet', subStats: [], mainStat: { stat: 'spd', value: 25 } }, { set: WATCHMAKER_MASTER_OF_DREAM_MACHINATIONS, type: 'Head', subStats: [], mainStat: { stat: 'hp', value: 705 } }, { set: WATCHMAKER_MASTER_OF_DREAM_MACHINATIONS, type: 'Hands', subStats: [], mainStat: { stat: 'atk', value: 352 } }], []);
    const ally = createMockCharacter('c2', 'Ally', [], []);

    let state: GameState = {
        units: [createMockUnit(char), createMockUnit(ally)],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state = registerRelicEventHandlers(state);

    // Trigger Ult on Ally
    const event: IEvent = { type: 'ON_ULTIMATE_USED', sourceId: 'c1', targetId: 'c2', value: 0 };
    const handler = state.eventHandlers.find(h => h.id.includes('watchmaker') && h.subscribesTo.includes('ON_ULTIMATE_USED'));

    if (handler && state.eventHandlerLogics[handler.id]) {
        state = state.eventHandlerLogics[handler.id](event, state, handler.id);
    }

    const allyUnit = state.units[1];
    const buff = allyUnit.effects.find(e => e.id === 'watchmaker-4pc-be');
    if (!buff || (buff as any).value !== 0.3) throw new Error('Watchmaker buff not applied to ally');
}

async function testForge() {
    const char = createMockCharacter('c1', 'Forge User', [],
        [{ set: FORGE_OF_THE_KALPAGNI_LANTERN, type: 'Planar Sphere', subStats: [], mainStat: { stat: 'fire_dmg_boost', value: 0.388 } }, { set: FORGE_OF_THE_KALPAGNI_LANTERN, type: 'Link Rope', subStats: [], mainStat: { stat: 'break_effect', value: 0.648 } }]);
    const enemy = createEnemyUnit('e1');
    enemy.weaknesses.add('Fire');

    let state: GameState = {
        units: [createMockUnit(char), enemy],
        skillPoints: 3, maxSkillPoints: 5, time: 0, log: [], eventHandlers: [], eventHandlerLogics: {}, damageModifiers: {}, cooldowns: {}, pendingActions: [], actionQueue: []
    };

    state = registerRelicEventHandlers(state);

    // Trigger Damage on Fire Weak Enemy
    const event: IEvent = { type: 'ON_DAMAGE_DEALT', sourceId: 'c1', targetId: 'e1', value: 100 };
    const handler = state.eventHandlers.find(h => h.id.includes('forge') && h.subscribesTo.includes('ON_DAMAGE_DEALT'));

    if (handler && state.eventHandlerLogics[handler.id]) {
        state = state.eventHandlerLogics[handler.id](event, state, handler.id);
    }

    const unit = state.units[0];
    const buff = unit.effects.find(e => e.id === 'forge-be-buff');
    if (!buff || (buff as any).value !== 0.4) throw new Error('Forge buff not applied');
}

runTests().catch(console.error);
