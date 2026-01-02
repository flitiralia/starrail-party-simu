import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch } from '../../../simulator/engine/dispatcher';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { seele, seeleHandlerFactory } from '../seele';
import { Character, Enemy, PartyConfig } from '../../../types';
import { GameState } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';

describe('Seele Log Integration Test', () => {
    let state: GameState;
    const seeleId = 'seele-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        const characters: Character[] = [
            { ...seele, id: seeleId }
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
                eidolonLevel: 6 // E6を有効化
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
        const factory = seeleHandlerFactory(seeleId, 80, 6);
        state = {
            ...state,
            eventHandlers: [...state.eventHandlers, factory.handlerMetadata],
            eventHandlerLogics: { ...state.eventHandlerLogics, [factory.handlerMetadata.id]: factory.handlerLogic }
        };

        state = dispatch(state, { type: 'BATTLE_START' });
    });

    it('should NOT produce duplicate manual logs for E6 Butterfly Damage', () => {
        // 1. 必殺技を使用して「乱れ蝶」状態にする
        state = { ...state, currentTurnOwnerId: createUnitId(seeleId) };
        state = dispatch(state, { type: 'ULTIMATE', sourceId: seeleId, targetId: enemyId });

        // 2. 通常攻撃して付加ダメージをトリガー
        state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: seeleId, targetId: enemyId });

        // ログの確認
        // E6の付加ダメージ(applyUnifiedDamage)は skipLog: true なので、個別のエントリは増えない。
        // また appendAdditionalDamage の手動呼び出しも削除されている。
        const e6Logs = state.log.filter(l => l.details && l.details.includes('乱れ蝶・付加ダメージ'));
        expect(e6Logs.length).toBe(0);

        // アクションログに統合されていることを確認
        const actionLogs = state.log.filter(l => l.characterName === 'ゼーレ' && l.actionType === '通常攻撃');
        expect(actionLogs.length).toBe(1);
    });
});
