import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch } from '../../../simulator/engine/dispatcher';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { herta, hertaHandlerFactory } from '../herta';
import { Character, Enemy, PartyConfig } from '../../../types';
import { GameState } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';

describe('Herta Log Integration Test', () => {
    let state: GameState;
    const hertaId = 'herta-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        const characters: Character[] = [
            { ...herta, id: hertaId }
        ];

        const enemies: Enemy[] = [
            {
                id: enemyId,
                name: 'Enemy 1',
                rank: 'Elite',
                element: 'Ice',
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
                eidolonLevel: 1 // E1を有効化
            }))
        };

        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Ice']) as Set<any>,
            enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        state = createInitialGameState(config);

        // ハンドラー登録（手動。registryから自動登録される場合は不要だが明示的に行う）
        const hertaHandler = hertaHandlerFactory(hertaId, 80, 1);
        state = {
            ...state,
            eventHandlers: [...state.eventHandlers, hertaHandler.handlerMetadata],
            eventHandlerLogics: { ...state.eventHandlerLogics, [hertaHandler.handlerMetadata.id]: hertaHandler.handlerLogic }
        };

        state = dispatch(state, { type: 'BATTLE_START' });
    });

    it('should NOT produce manual logs for Follow-up Attack (Talent)', () => {
        // 敵のHPを50%以下に設定して天賦をトリガーしやすくする
        state.registry = state.registry.update(createUnitId(enemyId), u => ({ ...u, hp: 4000 })); // HP 40%

        // ヘルタのターン
        state = { ...state, currentTurnOwnerId: createUnitId(hertaId) };

        // 通常攻撃を実行。HPが50%以下なので天賦がトリガーされるはず
        state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: hertaId, targetId: enemyId });

        // ログ。修正前は 手動の「天賦」ログがあったはず。
        // 修正後は skipLog: true により追加攻撃は log エントリを増やさない（additionalDamageEntryに入る）
        const fuaLogs = state.log.filter(l => l.actionType === '天賦' || (l.details && l.details.includes('やっぱり私がやる')));
        expect(fuaLogs.length).toBe(0);
    });

    it('should NOT produce manual logs for E1 Additional Damage', () => {
        // 敵のHPを50%以下に設定
        state.registry = state.registry.update(createUnitId(enemyId), u => ({ ...u, hp: 4000 }));

        state = { ...state, currentTurnOwnerId: createUnitId(hertaId) };

        // 通常攻撃。E1が発動する
        state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: hertaId, targetId: enemyId });

        // E1のログ。修正前は個別のエントリがあった。
        const e1Logs = state.log.filter(l => l.details && l.details.includes('弱みは付け込み'));
        expect(e1Logs.length).toBe(0);
    });
});
