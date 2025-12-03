import { createMockState, createMockUnit } from '../test_mechanics';
import { dispatch, publishEvent } from '../app/simulator/engine/dispatcher';
import { march7th, march7thHandlerFactory } from '../app/data/characters/march-7th';
import { registry } from '../app/simulator/registry';

// Register March 7th (if not already)
registry.registerCharacter('march-7th', march7thHandlerFactory);

function testMarch7thE2() {
    console.log('--- Test: March 7th E2 (Start Battle Shield) ---');
    let march = createMockUnit('march', false);
    // Merge march7th data into mock unit. Cast to any to avoid strict type checks on partial stats.
    march = {
        ...march,
        ...march7th,
        id: 'march',
        stats: { ...march.stats, ...march7th.baseStats, def: 1000 },
        baseStats: { ...march.baseStats, ...march7th.baseStats }
    } as any;

    let ally = createMockUnit('ally', false);
    ally.hp = 500;
    ally.stats.hp = 1000; // 50% HP

    let ally2 = createMockUnit('ally2', false);
    ally2.hp = 1000;
    ally2.stats.hp = 1000; // 100% HP

    let state = createMockState([march, ally, ally2]);

    // Initialize handlers
    const factory = registry.getCharacterFactory('march-7th');
    if (factory) {
        const handler = factory('march', 80, 2); // Level 80, E2
        state.eventHandlers.push({ id: handler.handlerMetadata.id, subscribesTo: handler.handlerMetadata.subscribesTo });
        state.eventHandlerLogics[handler.handlerMetadata.id] = handler.handlerLogic;
    }

    // Dispatch Battle Start
    state = dispatch(state, { type: 'BATTLE_START' });

    const allyState = state.units.find(u => u.id === 'ally');
    const ally2State = state.units.find(u => u.id === 'ally2');

    // Expected Shield: 1000 * 0.24 + 320 = 240 + 320 = 560
    if (allyState!.shield !== 560) throw new Error(`Ally should have 560 shield, has ${allyState!.shield}`);
    if (ally2State!.shield !== 0) throw new Error(`Ally2 should have 0 shield, has ${ally2State!.shield}`);

    // Verify ShieldEffect
    const shieldEffect = allyState!.effects.find(e => (e as any).type === 'Shield');
    if (!shieldEffect) throw new Error('Ally should have ShieldEffect');
    if ((shieldEffect as any).value !== 560) throw new Error('ShieldEffect value should be 560');

    console.log('PASS');
}

function testMarch7thCounter() {
    console.log('--- Test: March 7th Counter ---');
    let march = createMockUnit('march', false);
    march = {
        ...march,
        ...march7th,
        id: 'march',
        stats: { ...march.stats, ...march7th.baseStats, atk: 1000 },
        baseStats: { ...march.baseStats, ...march7th.baseStats }
    } as any;

    let ally = createMockUnit('ally', false);
    ally.shield = 100; // Has shield

    let enemy = createMockUnit('enemy', true);

    let state = createMockState([march, ally, enemy]);

    // Initialize handlers (E0)
    const factory = registry.getCharacterFactory('march-7th');
    if (factory) {
        const handler = factory('march', 80, 0);
        state.eventHandlers.push({ id: handler.handlerMetadata.id, subscribesTo: handler.handlerMetadata.subscribesTo });
        state.eventHandlerLogics[handler.handlerMetadata.id] = handler.handlerLogic;
    }

    // Enemy attacks Ally
    state = publishEvent(state, { type: 'ON_DAMAGE_DEALT', sourceId: 'enemy', targetId: 'ally', value: 10 });

    // Check pending actions
    const pending = state.pendingActions.find(a => a.type === 'FOLLOW_UP_ATTACK' && (a as any).sourceId === 'march');
    if (!pending) throw new Error('Counter should be triggered');

    console.log('PASS');
}

function testMarch7thSkillOverwrite() {
    console.log('--- Test: March 7th Skill Overwrite ---');
    let march = createMockUnit('march', false);
    march = {
        ...march,
        ...march7th,
        id: 'march',
        stats: { ...march.stats, ...march7th.baseStats, def: 1000 },
        baseStats: { ...march.baseStats, ...march7th.baseStats },
        abilities: { ...march.abilities, skill: { ...march.abilities.skill, shield: { scaling: 'def', multiplier: 0.5, flat: 0 } } }
    } as any;

    let ally = createMockUnit('ally', false);
    let state = createMockState([march, ally]);

    // 1. First Skill Use
    // Shield = 1000 * 0.5 = 500
    state = dispatch(state, { type: 'SKILL', sourceId: 'march', targetId: 'ally' });
    let allyState = state.units.find(u => u.id === 'ally');

    if (allyState!.shield !== 500) throw new Error(`First shield failed: ${allyState!.shield}`);
    if (allyState!.effects.length !== 1) throw new Error(`First effect count failed: ${allyState!.effects.length}`);

    // 2. Second Skill Use (Overwrite)
    // Should still be 500 (or updated value if stats changed, but here stats same)
    // Should NOT stack to 1000
    state = dispatch(state, { type: 'SKILL', sourceId: 'march', targetId: 'ally' });
    allyState = state.units.find(u => u.id === 'ally');

    if (allyState!.shield !== 500) throw new Error(`Overwrite failed: Shield is ${allyState!.shield}, expected 500`);
    if (allyState!.effects.length !== 1) throw new Error(`Overwrite failed: Count is ${allyState!.effects.length}, expected 1`);

    console.log('PASS');
}

function runTests() {
    try {
        testMarch7thE2();
        testMarch7thCounter();
        testMarch7thSkillOverwrite();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTests();
