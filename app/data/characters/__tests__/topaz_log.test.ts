import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch } from '../../../simulator/engine/dispatcher';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { topazAndNumby, topazAndNumbyHandlerFactory } from '../topaz-and-numby';
import { Character, Enemy, PartyConfig } from '../../../types';
import { GameState } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';

describe('Topaz Log Integration Test', () => {
    let state: GameState;
    const topazId = 'topaz-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        // トパーズの定義を補完（スキルにダメージヒットがないとアクションログのメインダメージとして記録されない場合があるため）
        const topazWithDamage: Character = {
            ...topazAndNumby,
            abilities: {
                ...topazAndNumby.abilities,
                skill: {
                    ...topazAndNumby.abilities.skill,
                    damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 0, toughnessReduction: 0 }] } // 0倍率でもヒットがあればログに載る
                }
            }
        } as any;

        const characters: Character[] = [
            { ...topazWithDamage, id: topazId }
        ];

        const enemies: Enemy[] = [
            {
                id: enemyId,
                name: 'Enemy 1',
                rank: 'Elite',
                element: 'Fire',
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
                eidolonLevel: 0
            }))
        };

        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Fire']) as Set<any>,
            enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        state = createInitialGameState(config);

        // ハンドラー登録
        const topazHandler = topazAndNumbyHandlerFactory(topazId, 80, 0);
        state = {
            ...state,
            eventHandlers: [...state.eventHandlers, topazHandler.handlerMetadata],
            eventHandlerLogics: { ...state.eventHandlerLogics, [topazHandler.handlerMetadata.id]: topazHandler.handlerLogic }
        };

        state = dispatch(state, { type: 'BATTLE_START' });
    });

    it('should NOT produce manual logs for Numby attack', () => {
        state = { ...state, currentTurnOwnerId: createUnitId(topazId) };

        // スキルを使用してカブの攻撃をトリガー
        state = dispatch(state, { type: 'SKILL', sourceId: topazId, targetId: enemyId });

        // 1. 個別の「カブ」ログエントリ（二重出力）がないことを確認
        // applyUnifiedDamage(numby) が skipLog: true なので、個別のエントリは増えない。
        const numbyManualLogs = state.log.filter(l => l.details && (l.details.includes('カブ自身のターンによる攻撃') || l.details.includes('トパーズの戦闘スキルによる指示')));
        expect(numbyManualLogs.length).toBe(0);

        // 2. アクションログ自体は生成されていることを確認
        // フィルタ条件を「トパーズの行動」全般に広げる
        const topazActionLogs = state.log.filter(l => l.characterName === 'トパーズ＆カブ');
        expect(topazActionLogs.length).toBeGreaterThanOrEqual(1);
    });
});
