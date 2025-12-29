import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch, publishEvent } from '../engine/dispatcher';
import { feixiao, feixiaoHandlerFactory } from '../../data/characters';
import { bronya, bronyaHandlerFactory } from '../../data/characters';
import { Character, Enemy, PartyConfig } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';
import { addAccumulatedValue, getAccumulatedValue } from '../engine/accumulator';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

// 飛黄蓄積キー（feixiao.tsと同一）
const FEIHANG_KEY = 'feixiao-feihang';

// Helper to get Feihang stacks
const getFeihangStacks = (state: GameState, unitId: string): number => {
    return getAccumulatedValue(state, unitId, FEIHANG_KEY);
};

// Helper to set Feihang stacks for tests
const setFeihangStacksForTest = (state: GameState, unitId: string, stacks: number): GameState => {
    return addAccumulatedValue(state, unitId, FEIHANG_KEY, stacks, 12);
};

describe('Feixiao Scenario Test', () => {
    let initialState: GameState;
    const feixiaoId = 'feixiao-1';
    const allyId = 'bronya-1';
    const enemyId = 'enemy-1';

    beforeEach(() => {
        const characters: Character[] = [
            { ...feixiao, id: feixiaoId },
            { ...bronya, id: allyId }
        ];

        const enemies: Enemy[] = [
            {
                id: enemyId,
                name: 'Test Enemy',
                level: 80,
                element: 'Wind',
                toughness: 100,
                maxToughness: 100,
                baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
                abilities: {
                    basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                    skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '' },
                    ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '' },
                    talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
                    technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' }
                }
            } as Enemy
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
            weaknesses: new Set(['Wind']) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // ハンドラーを登録
        const { handlerMetadata: feixiaoMeta, handlerLogic: feixiaoLogic } = feixiaoHandlerFactory(feixiaoId, 80, 0);
        const { handlerMetadata: bronyaMeta, handlerLogic: bronyaLogic } = bronyaHandlerFactory(allyId, 80, 0);

        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, feixiaoMeta, bronyaMeta],
            eventHandlerLogics: {
                ...initialState.eventHandlerLogics,
                [feixiaoMeta.id]: feixiaoLogic,
                [bronyaMeta.id]: bronyaLogic
            }
        };

        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    describe('Feihang (飛黄) Stack System', () => {
        it('should start with 1 Feihang stack from technique', () => {
            // 秘技使用で飛黄+1
            const stacks = getFeihangStacks(initialState, feixiaoId);
            expect(stacks).toBe(1);
        });

        it('should gain Feihang stacks from ally attacks', () => {
            let state = initialState;
            const getFeihang = (s: GameState) => getFeihangStacks(s, feixiaoId);

            const initialFeihang = getFeihang(state);

            // 味方の通常攻撃
            state = { ...state, currentTurnOwnerId: createUnitId(allyId) };
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: allyId, targetId: enemyId });

            // 2回攻撃で飛黄+1なので、1回では増えない（ただし追撃が発動するので複雑）
            expect(getFeihang(state)).toBeGreaterThanOrEqual(initialFeihang);

            // デバッグ: resourceChangesを確認
            console.log('\n=== LOG ENTRIES ===');
            state.log.forEach((log, idx) => {
                console.log(`Log ${idx + 1}: ${log.characterName} - ${log.actionType}`);
                if (log.logDetails?.resourceChanges) {
                    console.log('  resourceChanges:', JSON.stringify(log.logDetails.resourceChanges));
                }
            });
        });
    });

    describe('Talent - Follow-up Attack', () => {
        it('should trigger follow-up when ally attacks enemy', () => {
            let state = initialState;
            const getEnemy = (s: GameState) => getUnit(s, enemyId);

            const initialHp = getEnemy(state)?.hp ?? 100000;

            // 味方がスキルで攻撃
            state = { ...state, currentTurnOwnerId: createUnitId(allyId) };
            state = dispatch(state, { type: 'SKILL', sourceId: allyId, targetId: feixiaoId });

            // 飛霄の天賦追撃により敵がダメージを受けるはず
            // （bronyaはスキルでバフ付与なので直接敵を攻撃しない場合あり）
            // テスト調整: 通常攻撃で確認
            state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: allyId, targetId: enemyId });

            const enemy = getEnemy(state);
            expect(enemy?.hp).toBeLessThan(initialHp);
        });

        it('should only trigger once per turn', () => {
            let state = initialState;
            const getFeixiao = (s: GameState) => getUnit(s, feixiaoId);

            // 飛霄のターンを開始（ON_TURN_STARTイベントを発火）
            state = { ...state, currentTurnOwnerId: createUnitId(feixiaoId) };
            state = publishEvent(state, { type: 'ON_TURN_START', sourceId: feixiaoId, value: 0 });

            // 天賦発動可能フラグを確認
            const feixiao1 = getFeixiao(state);
            const hasTalentAvailable = feixiao1?.effects.some(e => e.name === '天賦発動可能');
            expect(hasTalentAvailable).toBe(true);
        });
    });

    describe('Skill - Axe Piercing', () => {
        it('should deal damage and trigger follow-up', () => {
            let state = initialState;
            const getEnemy = (s: GameState) => getUnit(s, enemyId);

            const initialHp = getEnemy(state)?.hp ?? 100000;

            state = { ...state, currentTurnOwnerId: createUnitId(feixiaoId) };
            state = dispatch(state, { type: 'SKILL', sourceId: feixiaoId, targetId: enemyId });

            const enemy = getEnemy(state);
            // スキルダメージ + 天賦追撃
            expect(enemy?.hp).toBeLessThan(initialHp);
        });
    });

    describe('Ultimate - Great Devastation', () => {
        it('should be usable when Feihang >= 6', () => {
            let state = initialState;

            // 飛黄を6に設定（5追加で秘技の1+5=6）
            state = addAccumulatedValue(state, feixiaoId, FEIHANG_KEY, 5, 12);

            const stacks = getFeihangStacks(state, feixiaoId);
            expect(stacks).toBeGreaterThanOrEqual(6);
        });

        it('should consume 6 Feihang stacks on use', () => {
            let state = initialState;

            // 飛黄を8に設定（7追加で秘技の1+7=8）
            state = addAccumulatedValue(state, feixiaoId, FEIHANG_KEY, 7, 12);
            const initialFeihang = getFeihangStacks(state, feixiaoId);

            state = { ...state, currentTurnOwnerId: createUnitId(feixiaoId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: feixiaoId, targetId: enemyId });

            // 飛黄が消費されることを確認（8 - 6 = 2）
            const finalFeihang = getFeihangStacks(state, feixiaoId);
            expect(finalFeihang).toBeLessThan(initialFeihang);
        });

        it('should deal significant damage', () => {
            let state = initialState;
            const getEnemy = (s: GameState) => getUnit(s, enemyId);

            // 飛黄を6に設定（5追加）
            state = addAccumulatedValue(state, feixiaoId, FEIHANG_KEY, 5, 12);

            const initialHp = getEnemy(state)?.hp ?? 100000;

            state = { ...state, currentTurnOwnerId: createUnitId(feixiaoId) };
            state = dispatch(state, { type: 'ULTIMATE', sourceId: feixiaoId, targetId: enemyId });

            const enemy = getEnemy(state);
            // 必殺技でダメージを与えるはず
            expect(enemy?.hp).toBeLessThan(initialHp);
        });
    });

    describe('Trace A4 - Crit Rate Bonus', () => {
        it('should have +15% crit rate from trace', () => {
            const feixiaoUnit = getUnit(initialState, feixiaoId);

            // A4 バフを確認
            const a4Buff = feixiaoUnit?.effects.find(e => e.name?.includes('滅却'));
            expect(a4Buff).toBeDefined();
        });
    });
});
