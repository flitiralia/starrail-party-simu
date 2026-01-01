import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { jiaoqiuHandlerFactory } from '../jiaoqiu';
import { createUnitId } from '../../../simulator/engine/unitId';
import { dispatch } from '../../../simulator/engine/dispatcher';
import { GameState, Action } from '../../../simulator/engine/types';
import { Character, Enemy, SimulationConfig } from '../../../types/index';
import { recalculateUnitStats } from '../../../simulator/statBuilder';

const JIAOQIU_ID = 'jiaoqiu';
const ENEMY_ID = 'enemy1';

describe('Jiaoqiu Character Implementation', () => {
    let state: GameState;

    beforeEach(() => {
        const jiaoqiu: Character = {
            id: JIAOQIU_ID,
            name: 'Jiaoqiu',
            path: 'Nihility',
            element: 'Fire',
            rarity: 5,
            maxEnergy: 100,
            baseStats: { hp: 1358, atk: 601, def: 509, spd: 98, critRate: 0.05, critDmg: 0.50, aggro: 100 },
            abilities: {
                basic: { id: 'j-basic', name: 'Basic', type: 'Basic ATK', description: '', targetType: 'single_enemy', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1.0, toughnessReduction: 10 }] } },
                skill: { id: 'j-skill', name: 'Skill', type: 'Skill', description: '', targetType: 'single_enemy', damage: { type: 'blast', scaling: 'atk', mainHits: [{ multiplier: 1.5, toughnessReduction: 20 }], adjacentHits: [{ multiplier: 0.75, toughnessReduction: 10 }] } },
                ultimate: { id: 'j-ult', name: 'Ult', type: 'Ultimate', description: '', targetType: 'all_enemies', damage: { type: 'aoe', scaling: 'atk', hits: [{ multiplier: 1.0, toughnessReduction: 20 }] } },
                talent: { id: 'j-talent', name: 'Talent', type: 'Talent', description: '', targetType: 'self' },
                technique: { id: 'j-tech', name: 'Tech', type: 'Technique', description: '', targetType: 'self' }
            },
            traces: [],
            effects: []
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
            characters: [jiaoqiu],
            enemies: [enemy],
            weaknesses: new Set(['Fire']),
            partyConfig: {
                members: [{
                    character: jiaoqiu,
                    config: { rotation: ['b', 's'], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 10000, toughness: 300, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Manually register Jiaoqiu's handler
        const { handlerMetadata, handlerLogic } = jiaoqiuHandlerFactory(JIAOQIU_ID, 0);
        state = dispatch(state, {
            type: 'REGISTER_HANDLERS',
            handlers: [{ metadata: handlerMetadata, logic: handlerLogic }]
        });

        // Start battle to initialize handlers properly
        state = dispatch(state, { type: 'BATTLE_START' });
    });

    it('should apply Ashen Roast on Basic Attack', () => {
        const action: Action = {
            type: 'BASIC_ATTACK',
            sourceId: JIAOQIU_ID,
            targetId: ENEMY_ID
        };

        state = dispatch(state, action);

        const enemy = state.registry.get(createUnitId(ENEMY_ID));
        const roast = enemy?.effects.find(e => e.id === 'jiaoqiu-ashen-roast');
        expect(roast).toBeDefined();
        expect(roast?.stackCount).toBeGreaterThanOrEqual(2); // 1 (Tech) + 1 (Basic Talent) = 2
    });

    it('should apply Ashen Roast on Skill', () => {
        const action: Action = {
            type: 'SKILL',
            sourceId: JIAOQIU_ID,
            targetId: ENEMY_ID
        };

        state = dispatch(state, action);

        const enemy = state.registry.get(createUnitId(ENEMY_ID));
        const roast = enemy?.effects.find(e => e.id === 'jiaoqiu-ashen-roast');
        expect(roast).toBeDefined();
        // Skill adds 1 stack + Talent adds 1 stack + Tech adds 1 stack = 3 stacks
        expect(roast?.stackCount).toBeGreaterThanOrEqual(3);
    });

    it('should trigger stack equalization on Ultimate', () => {
        const action: Action = {
            type: 'ULTIMATE',
            sourceId: JIAOQIU_ID,
            targetId: ENEMY_ID
        };

        state = dispatch(state, action);

        const jiaoqiu = state.registry.get(createUnitId(JIAOQIU_ID));
        const field = jiaoqiu?.effects.find(e => e.id === 'jiaoqiu-field');
        expect(field).toBeDefined();
        expect(field?.duration).toBe(3);
    });
});

describe('Jiaoqiu Advanced Mechanics', () => {
    it('should apply A4 ATK buff when EHR > 80%', () => {
        const jiaoqiu: Character = {
            id: JIAOQIU_ID,
            name: 'Jiaoqiu',
            path: 'Nihility',
            element: 'Fire',
            rarity: 5,
            maxEnergy: 100,
            baseStats: { hp: 1358, atk: 601, def: 509, spd: 98, critRate: 0.05, critDmg: 0.50, aggro: 100 },
            abilities: {
                basic: { id: 'b', name: 'B', type: 'Basic ATK', description: '', targetType: 'single_enemy' },
                skill: { id: 's', name: 'S', type: 'Skill', description: '', targetType: 'single_enemy' },
                ultimate: { id: 'u', name: 'U', type: 'Ultimate', description: '', targetType: 'all_enemies' },
                talent: { id: 't', name: 'T', type: 'Talent', description: '', targetType: 'self' },
                technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '', targetType: 'self' }
            },
            traces: [{ id: 'jiaoqiu-trace-a4', name: 'A4', type: 'Bonus Ability', description: '' }],
            effects: []
        };
        const enemy: Enemy = {
            id: ENEMY_ID, name: 'E',
            baseStats: { hp: 1000, atk: 10, def: 10, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            abilities: {
                basic: { id: 'e-basic', name: 'Enemy Basic', type: 'Basic ATK', description: '' },
                skill: { id: 'e-skill', name: 'Enemy Skill', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: 'Enemy Ult', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: 'Enemy Talent', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Enemy Tech', type: 'Technique', description: '' }
            },
            toughness: 100, element: 'Fire', baseRes: {}
        };

        const config: SimulationConfig = {
            characters: [jiaoqiu],
            enemies: [enemy],
            weaknesses: new Set(['Fire']),
            partyConfig: { members: [{ character: jiaoqiu, config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 0 }] },
            enemyConfig: { level: 80, maxHp: 1000, toughness: 100, spd: 100 },
            rounds: 1
        };

        let state = createInitialGameState(config);

        // Update EHR to +100%
        const uId = createUnitId(JIAOQIU_ID);
        let u = state.registry.get(uId)!;
        const mods = [...u.modifiers, { source: 'Test', target: 'effect_hit_rate' as const, type: 'add' as const, value: 1.0 }];
        u = { ...u, modifiers: mods };

        // Recalculate stats
        const newStats = recalculateUnitStats(u, state.registry.toArray());
        u = { ...u, stats: newStats };

        state = { ...state, registry: state.registry.update(uId, unit => u) };

        // Register Handler
        const { handlerMetadata, handlerLogic } = jiaoqiuHandlerFactory(JIAOQIU_ID, 0);
        state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: [{ metadata: handlerMetadata, logic: handlerLogic }] });

        // Battle Start (Triggers A4 check)
        state = dispatch(state, { type: 'BATTLE_START' });

        // Assert
        u = state.registry.get(uId)!;
        const a4Buff = u.modifiers.find(m => m.source === 'A4: 炊事');
        expect(a4Buff).toBeDefined();
        // Excess: 1.0 - 0.8 = 0.2. 
        // 0.2 / 0.15 = 1.333.
        // 1.333 * 0.60 = 0.80 (80%).
        expect(a4Buff?.value).toBeCloseTo(0.80, 2);
    });

    it('should apply E2 DoT multiplier increase', () => {
        const jiaoqiu: Character = {
            id: JIAOQIU_ID,
            name: 'Jiaoqiu',
            path: 'Nihility',
            element: 'Fire',
            rarity: 5,
            maxEnergy: 100,
            baseStats: { hp: 1358, atk: 601, def: 509, spd: 98, critRate: 0.05, critDmg: 0.50, aggro: 100 },
            abilities: {
                basic: { id: 'b', name: 'B', type: 'Basic ATK', description: '', targetType: 'single_enemy', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                skill: { id: 's', name: 'S', type: 'Skill', description: '', targetType: 'single_enemy' },
                ultimate: { id: 'u', name: 'U', type: 'Ultimate', description: '', targetType: 'all_enemies' },
                talent: { id: 't', name: 'T', type: 'Talent', description: '', targetType: 'self' },
                technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '', targetType: 'self' }
            },
            traces: [],
            effects: []
        };
        const enemy: Enemy = {
            id: ENEMY_ID, name: 'E',
            baseStats: { hp: 1000, atk: 10, def: 10, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            abilities: {
                basic: { id: 'e-basic', name: 'Enemy Basic', type: 'Basic ATK', description: '' },
                skill: { id: 'e-skill', name: 'Enemy Skill', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: 'Enemy Ult', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: 'Enemy Talent', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Enemy Tech', type: 'Technique', description: '' }
            },
            toughness: 100, element: 'Fire', baseRes: {}
        };

        const config: SimulationConfig = {
            characters: [jiaoqiu],
            enemies: [enemy],
            weaknesses: new Set(['Fire']),
            partyConfig: { members: [{ character: jiaoqiu, config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 2 }] },
            enemyConfig: { level: 80, maxHp: 1000, toughness: 100, spd: 100 },
            rounds: 1
        };

        let state = createInitialGameState(config);

        // Register Handler (E2)
        const { handlerMetadata, handlerLogic } = jiaoqiuHandlerFactory(JIAOQIU_ID, 2);
        state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: [{ metadata: handlerMetadata, logic: handlerLogic }] });

        // Battle Start
        state = dispatch(state, { type: 'BATTLE_START' });

        // Attack to apply Roast
        state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: JIAOQIU_ID, targetId: ENEMY_ID });

        // Verify
        const e = state.registry.get(createUnitId(ENEMY_ID))!;
        const roast = e.effects.find(eff => eff.id === 'jiaoqiu-ashen-roast');
        expect(roast).toBeDefined();

        const ashenRoast = roast as import('../../../simulator/effect/types').DoTEffect;
        expect(ashenRoast.multiplier).toBeGreaterThan(3.0);
    });
});
