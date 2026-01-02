
import { describe, it, expect, beforeEach, test } from 'vitest';
import { saber, saberHandlerFactory } from '../saber';
import { GameState, ActionEvent, CurrentActionLog } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { Character, Enemy, SimulationConfig } from '../../../types/index';

describe('Saber Character Default Config Implementation', () => {
    let state: GameState;
    const sourceId = 'saber-test-id';
    const enemyId = 'enemy-test-id';

    beforeEach(() => {
        const saberUnit: Character = { ...saber, id: sourceId, name: 'Saber' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy',
            baseStats: { hp: 100000, atk: 500, def: 200, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Wind',
            toughness: 100,
            baseRes: {},
            abilities: {
                basic: { id: 'e-basic', name: 'Enemy Basic', type: 'Basic ATK', description: '' },
                skill: { id: 'e-skill', name: 'Enemy Skill', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: 'Enemy Ult', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: 'Enemy Talent', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Enemy Tech', type: 'Technique', description: '' }
            }
        };

        const config: SimulationConfig = {
            characters: [saberUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Wind']),
            partyConfig: {
                members: [{
                    character: saberUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register handlers manually
        const factory = saberHandlerFactory(sourceId, 80, 0);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;

        // Trigger Battle Start
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId } as any, state, factory.handlerMetadata.id);
    });

    test('Check Default Config IDs', () => {
        expect(saber.defaultConfig).toBeDefined();
        expect(saber.defaultConfig?.lightConeId).toBe('a-thankless-coronation');
        expect(saber.defaultConfig?.relicSetId).toBe('wavestrider-captain');
        expect(saber.defaultConfig?.ornamentSetId).toBe('rutilant-arena');
    });

    test('Skill usage and Reactor Core stacks', () => {
        const factory = saberHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Skill Used
        state = factory.handlerLogic({ type: 'ON_SKILL_USED', sourceId, targetId: enemyId } as ActionEvent, state, handlerId);

        const unit = state.registry.get(createUnitId(sourceId));
        const stacks = unit?.effects.find(e => e.id.includes('saber-reactor-core'))?.stackCount;

        // 戦闘開始時に1層、スキル（EP満タンにならない場合）で3層獲得。
        // addEffect内で加算ロジックが正常に働けば合計4層になる。
        expect(stacks).toBe(4);
    });

    test('Ultimate triggers Enhanced Basic flag', () => {
        const factory = saberHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;

        // Ult Used
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId } as ActionEvent, state, handlerId);

        const unit = state.registry.get(createUnitId(sourceId));
        const hasEnhancedField = unit?.effects.some(e => e.id.includes('saber-enhanced-basic'));
        expect(hasEnhancedField).toBe(true);
    });

    test('Ally skill triggers Reactor Core stacks', () => {
        const factory = saberHandlerFactory(sourceId, 80, 0);
        const handlerId = factory.handlerMetadata.id;
        const allyId = 'ally-test-id';

        // 初期状態で1層（onBattleStart呼出し済みと仮定）
        const unitBefore = state.registry.get(createUnitId(sourceId));
        const initialStacks = unitBefore?.effects.find(e => e.id.includes('saber-reactor-core'))?.stackCount || 0;

        // 味方がスキルを使用
        state = factory.handlerLogic({ type: 'ON_SKILL_USED', sourceId: allyId, targetId: enemyId } as ActionEvent, state, handlerId);

        const unitAfter = state.registry.get(createUnitId(sourceId));
        const finalStacks = unitAfter?.effects.find(e => e.id.includes('saber-reactor-core'))?.stackCount;

        // 初期1層 + 味方スキル3層 = 4層になるはず
        expect(finalStacks).toBe(4);
    });
});
