
import { describe, it, expect, beforeEach } from 'vitest';
import { jingYuan, jingYuanHandlerFactory } from '../jing-yuan';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { GameState, ActionEvent, Action } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { Character, Enemy, SimulationConfig } from '../../../types/index';
import { initializeCurrentActionLog, finalizeSpiritTurnLog } from '../../../simulator/engine/dispatcher';

describe('Jing Yuan Log Integration', () => {
    let state: GameState;
    const sourceId = 'jing-yuan-test';
    const enemyId = 'enemy-test';

    beforeEach(() => {
        const jyUnit: Character = { ...jingYuan, id: sourceId, name: 'Jing Yuan' };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy 1',
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Lightning',
            toughness: 100,
            baseRes: {},
            abilities: { basic: { id: 'e-b', name: 'EB', type: 'Basic ATK', description: '' }, skill: { id: 'e-s', name: 'ES', type: 'Skill', description: '' }, ultimate: { id: 'e-u', name: 'EU', type: 'Ultimate', description: '' }, talent: { id: 'e-t', name: 'ET', type: 'Talent', description: '' }, technique: { id: 'e-tec', name: 'ETec', type: 'Technique', description: '' } }
        };

        const config: SimulationConfig = {
            characters: [jyUnit],
            enemies: [enemyUnit],
            weaknesses: new Set(['Lightning']),
            partyConfig: {
                members: [{
                    character: jyUnit,
                    config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 },
                    enabled: true,
                    eidolonLevel: 0
                }]
            },
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);
    });

    it('Skill should not produce duplicate logs and should use integrated log', () => {
        const factory = jingYuanHandlerFactory(sourceId, 0);
        const handlerId = factory.handlerMetadata.id;

        // 手動でアクションログを初期化（エンジンの挙動を模倣）
        state = initializeCurrentActionLog(state, sourceId, 'Jing Yuan', 'Skill', enemyId);

        // スキル使用
        const event: ActionEvent = { type: 'ON_SKILL_USED', sourceId, targetId: enemyId, targetType: 'all_enemies' };
        state = factory.handlerLogic(event, state, handlerId);

        // ログの重複チェック（この時点では state.log は増えていないはず。currentActionLogに蓄積される）
        // 修正前は applyUnifiedDamage が state.log.push していたため、ここでログが増えていた。
        expect(state.log.filter(l => l.actionType === 'Skill' || l.details === '紫霄の雷鳴').length).toBe(0);

        // 統合ログの蓄積チェック
        expect(state.currentActionLog?.additionalDamage.length).toBeGreaterThan(0);
        expect(state.currentActionLog?.additionalDamage[0].name).toBe('紫霄の雷鳴');

        // ログ最終化（エンジンの挙動を模倣）
        state = finalizeSpiritTurnLog(state);

        // 最終的なログが1つだけであることを確認
        const relevantLogs = state.log.filter(l => l.characterName === 'Jing Yuan' && l.actionType === 'Skill');
        expect(relevantLogs.length).toBe(1);
    });

    it('Ultimate should not produce duplicate logs and should use integrated log', () => {
        const factory = jingYuanHandlerFactory(sourceId, 0);
        const handlerId = factory.handlerMetadata.id;

        // 手動でアクションログを初期化
        state = initializeCurrentActionLog(state, sourceId, 'Jing Yuan', 'Ultimate');

        // 必殺技使用
        const event: ActionEvent = { type: 'ON_ULTIMATE_USED', sourceId };
        state = factory.handlerLogic(event, state, handlerId);

        // ログの重複チェック
        expect(state.log.filter(l => l.actionType === 'Ultimate' || l.details === '我が身の輝き').length).toBe(0);

        // 統合ログの蓄積チェック
        expect(state.currentActionLog?.additionalDamage.length).toBeGreaterThan(0);
        expect(state.currentActionLog?.additionalDamage[0].name).toBe('我が身の輝き');

        // ログ最終化
        state = finalizeSpiritTurnLog(state);

        // 最終的なログが1つだけであることを確認
        const relevantLogs = state.log.filter(l => l.characterName === 'Jing Yuan' && l.actionType === 'Ultimate');
        expect(relevantLogs.length).toBe(1);
    });
});
