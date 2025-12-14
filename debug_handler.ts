
import { Character, CharacterBaseStats, Enemy } from './app/types';
import { GameState, SimulationConfig } from './app/simulator/engine/types';
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch, publishEvent } from './app/simulator/engine/dispatcher';
import { danHengToukouHandlerFactory, DanHengToukou } from './app/data/characters/dan-heng-permansor-terrae';

// Mock Enemy and Ally
const enemy: Enemy = {
    id: 'enemy',
    name: 'Test Enemy',
    element: 'Physical',
    baseStats: { hp: 100000, atk: 100, def: 100, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 100 },
    toughness: 100,
    baseRes: { Physical: 0 },
    abilities: {
        basic: { id: 'e-b', name: 'Basic', type: 'Basic ATK', description: '' },
        skill: { id: 'e-s', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'e-u', name: 'Ultimate', type: 'Ultimate', description: '' },
        talent: { id: 'e-t', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'e-te', name: 'Tech', type: 'Technique', description: '' },
    }
};
const ally: Character = { ...DanHengToukou, id: 'ally-test', name: 'Ally' };

const simConfig: SimulationConfig = {
    characters: [DanHengToukou, ally],
    enemies: [enemy],
    weaknesses: new Set(['Physical']),
    partyConfig: {
        members: [
            { character: DanHengToukou, config: { rotation: ['s'], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 0 },
            { character: ally, config: { rotation: ['b'], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 0 }
        ]
    },
    enemyConfig: { level: 80, maxHp: 100000, spd: 100, toughness: 100 },
    rounds: 2
};

let state = createInitialGameState(simConfig);
console.log('Initial Handlers:', state.eventHandlers?.length || 0);

// Register
const factory = danHengToukouHandlerFactory(DanHengToukou.id, 80, 0);
state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: [{ metadata: factory.handlerMetadata, logic: factory.handlerLogic }] });

console.log('After Register Handlers:', state.eventHandlers?.length || 0);
state.eventHandlers?.forEach(h => console.log('Registered:', h.id));

// Dispatch Skill Event
console.log('Dispatching ON_SKILL_USED...');
state = publishEvent(state, {
    type: 'ON_SKILL_USED',
    sourceId: DanHengToukou.id,
    targetId: DanHengToukou.id,
    value: 0
});

// Check for Summon
const summon = state.units.find(u => u.isSummon);
if (summon) {
    console.log('✅ Summon Found:', summon.name);
} else {
    console.log('❌ Summon NOT Found');
}
