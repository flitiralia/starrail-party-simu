import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch, publishEvent } from '../../../simulator/engine/dispatcher';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { topazAndNumby, topazAndNumbyHandlerFactory } from '../topaz-and-numby';
import { Character, Enemy, PartyConfig } from '../../../types';
import { GameState, Unit } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { herta } from '../herta';

const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Topaz & Numby Implementation Test', () => {
    let initialState: GameState;
    const topazId = 'topaz-1';
    const hertaId = 'herta-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        const characters: Character[] = [
            { ...topazAndNumby, id: topazId },
            { ...herta, id: hertaId }
        ];

        const enemies: Enemy[] = [
            {
                id: enemyId,
                name: 'Test Enemy',
                rank: 'Elite',
                element: 'Fire',
                toughness: 100,
                baseRes: {},
                baseStats: { hp: 500000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                abilities: { basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' } as any } as any
            }
        ];

        const partyConfig: PartyConfig = {
            members: characters.map(char => ({
                character: char,
                config: { rotation: ['s'], rotationMode: 'sequence', ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0
            }))
        };

        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Fire']) as Set<import('../../../types').Element>,
            enemyConfig: { level: 80, maxHp: 500000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // ハンドラーの手動登録
        const topazHandler = topazAndNumbyHandlerFactory(topazId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, topazHandler.handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [topazHandler.handlerMetadata.id]: topazHandler.handlerLogic }
        };

        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    it('should summon Numby and apply Proof of Debt on battle start', () => {
        const numby = initialState.registry.toArray().find(u => u.isSummon && u.ownerId === topazId);
        expect(numby).toBeDefined();
        expect(numby?.name).toBe('カブ');

        const enemy = getUnit(initialState, enemyId);
        const hasDebt = enemy?.effects.some(e => e.id === 'topaz-proof-of-debt');
        expect(hasDebt).toBe(true);
    });

    it('should advance Numby action when ally performs follow-up attack on Proof of Debt target', () => {
        const numbyBefore = initialState.registry.toArray().find(u => u.isSummon && u.ownerId === topazId);
        const initialAV = numbyBefore?.actionValue || 0;

        // ヘルタの追加攻撃をシミュレート
        const state = publishEvent(initialState, {
            type: 'ON_FOLLOW_UP_ATTACK',
            sourceId: hertaId,
            targetId: enemyId
        });

        const numbyAfter = state.registry.toArray().find(u => u.isSummon && u.ownerId === topazId);
        // 行動順が50%早まるはず
        expect(numbyAfter?.actionValue).toBeLessThan(initialAV);
    });

    it('should treat Topaz Basic ATK as Follow-up Attack (A2)', () => {
        const numbyBefore = initialState.registry.toArray().find(u => u.isSummon && u.ownerId === topazId);
        const initialAV = numbyBefore?.actionValue || 0;

        // トパーズの通常攻撃を実行
        const state = dispatch(initialState, {
            type: 'BASIC_ATTACK',
            sourceId: topazId,
            targetId: enemyId
        });

        const numbyAfter = state.registry.toArray().find(u => u.isSummon && u.ownerId === topazId);
        // A2により通常攻撃が追加攻撃扱いになり、カブが加速するはず
        expect(numbyAfter?.actionValue).toBeLessThan(initialAV);
    });

    it('should apply A4 damage boost against fire weak enemies', () => {
        // ON_BEFORE_DAMAGE_CALCULATION を通じて allTypeDmg が加算されるかチェック
        let state: any = { ...initialState, damageModifiers: { ...initialState.damageModifiers, allTypeDmg: 0 } };
        state = publishEvent(state, {
            type: 'ON_BEFORE_DAMAGE_CALCULATION',
            sourceId: topazId,
            targetId: enemyId
        } as any);

        expect(state.damageModifiers.allTypeDmg).toBe(0.15);
    });

    it('should apply extra damage from Numby when Using Skill', () => {
        const initialHp = getUnit(initialState, enemyId)?.hp || 0;

        let state = dispatch(initialState, {
            type: 'SKILL',
            sourceId: topazId,
            targetId: enemyId
        });

        const currentHp = getUnit(state, enemyId)?.hp || 0;
        expect(currentHp).toBeLessThan(initialHp);

        // ログにカブの攻撃が含まれているか確認
        // カブ自身がソース(characterName)または詳細に含まれているかチェック
        const logEntry = state.log.find(l => l.characterName === 'カブ' || l.details?.includes('カブ'));
        expect(logEntry).toBeDefined();
        // ダメージが0より大きいことを確認
        expect(logEntry?.damageDealt).toBeGreaterThan(0);
    });

    it('should enter enhanced state on Ultimate and Numby should deal more damage', () => {
        let state = initialState;

        // EPを満タンにする
        state = {
            ...state,
            registry: state.registry.update(createUnitId(topazId), u => ({ ...u, ep: 130 }))
        };

        state = dispatch(state, { type: 'ULTIMATE', sourceId: topazId });

        const numby = state.registry.toArray().find(u => u.isSummon && u.ownerId === topazId);
        const hasEnhanced = numby?.effects.some(e => e.id === 'topaz-enhanced-numby');
        expect(hasEnhanced).toBe(true);
    });
});
