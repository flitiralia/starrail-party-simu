import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch } from '../../../simulator/engine/dispatcher';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { silverWolf, silverWolfHandlerFactory } from '../silver-wolf';
import { Character, Enemy, PartyConfig } from '../../../types';
import { GameState } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';

describe('Silver Wolf Log Integration Test', () => {
    let state: GameState;
    const swId = 'sw-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        const characters: Character[] = [
            { ...silverWolf, id: swId }
        ];

        const enemies: Enemy[] = [
            {
                id: enemyId,
                name: 'Enemy 1',
                rank: 'Elite',
                element: 'Quantum',
                toughness: 100,
                baseRes: {},
                baseStats: { hp: 10000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                abilities: { basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' } as any } as any
            }
        ];

        const partyConfig: PartyConfig = {
            members: characters.map(char => ({
                character: char,
                config: { rotation: [], rotationMode: 'sequence', ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 4 // E4を有効化
            }))
        };

        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Quantum']) as Set<any>,
            enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        state = createInitialGameState(config);

        // ハンドラー登録
        const swHandler = silverWolfHandlerFactory(swId, 80, 4);
        state = {
            ...state,
            eventHandlers: [...state.eventHandlers, swHandler.handlerMetadata],
            eventHandlerLogics: { ...state.eventHandlerLogics, [swHandler.handlerMetadata.id]: swHandler.handlerLogic }
        };

        state = dispatch(state, { type: 'BATTLE_START' });
    });

    it('should NOT produce manual logs for E4 Bonus Damage', () => {
        // 敵にデバフを付与（E4発動用）
        state.registry = state.registry.update(createUnitId(enemyId), u => ({
            ...u,
            effects: [{ id: 'test-debuff', name: 'Test Debuff', category: 'DEBUFF', duration: 1, durationType: 'TURN_END_BASED', modifiers: [], sourceUnitId: swId }] as any
        }));

        state = { ...state, currentTurnOwnerId: createUnitId(swId) };

        // 必殺技を使用。E4が発動するはず
        state = dispatch(state, { type: 'ULTIMATE', sourceId: swId, targetId: enemyId });

        // ログの確認
        // E4の付加ダメージ(applyUnifiedDamage)は skipLog: true なので、個別のエントリは増えない。
        const e4Logs = state.log.filter(l => l.details && l.details.includes('E4 Bonus Damage'));
        expect(e4Logs.length).toBe(0);

        // 最終的なアクションログにアクションが記録されていることを確認
        const actionLogs = state.log.filter(l => l.characterName === '銀狼' && l.actionType === '必殺技');
        expect(actionLogs.length).toBe(1);
    });
});
