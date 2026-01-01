import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { huohuoHandlerFactory } from '../huohuo';
import { createUnitId } from '../../../simulator/engine/unitId';
import { dispatch } from '../../../simulator/engine/dispatcher';
import { GameState, Action } from '../../../simulator/engine/types';
import { Character, Enemy, SimulationConfig, Element } from '../../../types/index';

const HUOHUO_ID = 'huohuo';
const ENEMY_ID = 'enemy1';

describe('Huohuo Character Implementation', () => {
    let state: GameState;

    beforeEach(() => {
        const huohuo: Character = {
            id: HUOHUO_ID,
            name: 'Huohuo',
            path: 'Abundance',
            element: 'Wind',
            rarity: 5,
            maxEnergy: 140,
            baseStats: { hp: 1358, atk: 601, def: 509, spd: 98, critRate: 0.05, critDmg: 0.50, aggro: 100 },
            abilities: {
                basic: { id: 'h-basic', name: 'Basic', type: 'Basic ATK', description: '', targetType: 'single_enemy', damage: { type: 'simple', scaling: 'hp', hits: [{ multiplier: 0.5, toughnessReduction: 10 }] } },
                skill: { id: 'h-skill', name: 'Skill', type: 'Skill', description: '', targetType: 'ally' },
                ultimate: { id: 'h-ult', name: 'Ult', type: 'Ultimate', description: '', targetType: 'all_allies' },
                talent: { id: 'h-talent', name: 'Talent', type: 'Talent', description: '', targetType: 'self' },
                technique: { id: 'h-tech', name: 'Tech', type: 'Technique', description: '', targetType: 'all_enemies' }
            },
            traces: [],
            eidolons: {},
            effects: [],
            defaultConfig: {
                lightConeId: 'night-of-fright',
                superimposition: 1,
                relicSetId: 'passerby_of_wandering_cloud',
                ornamentSetId: 'broken_keel',
                mainStats: { body: 'outgoing_healing_boost', feet: 'spd', sphere: 'hp_pct', rope: 'energy_regen_rate' },
                subStats: []
            }
        };

        const enemy: Enemy = {
            id: ENEMY_ID,
            name: 'Test Enemy',
            element: 'Physical',
            baseStats: { hp: 10000, atk: 500, def: 200, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            abilities: {
                basic: { id: 'e-basic', name: 'Enemy Basic', type: 'Basic ATK', description: '' },
                skill: { id: 'e-skill', name: 'Enemy Skill', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: 'Enemy Ult', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: 'Enemy Talent', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Enemy Tech', type: 'Technique', description: '' }
            },
            toughness: 300,
            baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 }
        };

        const config: SimulationConfig = {
            characters: [huohuo],
            enemies: [enemy],
            weaknesses: new Set(['Wind' as Element]),
            partyConfig: {
                members: [{
                    character: huohuo,
                    config: { rotation: ['s', 'b'], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 10000, toughness: 300, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Manually register Huohuo's handler
        const { handlerMetadata, handlerLogic } = huohuoHandlerFactory(HUOHUO_ID, 0, 0);
        state = dispatch(state, {
            type: 'REGISTER_HANDLERS',
            handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
        });
    });

    it('should grant Divine Provision on Skill use', () => {
        const action: Action = {
            type: 'SKILL',
            sourceId: HUOHUO_ID,
            targetId: HUOHUO_ID
        };

        state = dispatch(state, action);

        const huohuo = state.registry.get(createUnitId(HUOHUO_ID));
        const buff = huohuo?.effects.find(e => e.id.startsWith('huohuo-divine-provision'));
        expect(buff).toBeDefined();
        expect(buff?.duration).toBe(2);
    });
});
