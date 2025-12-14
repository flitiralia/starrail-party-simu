/**
 * エフェクト解除可能フラグ検証スクリプト
 * 
 * 検証項目:
 * 1. isCleansable: trueのDEBUFFのみがcleanse対象
 * 2. isDispellable: trueのBUFFのみがdispel対象
 * 3. STATUSカテゴリは解除対象外
 */

import { dispelBuffs, cleanse } from './app/simulator/engine/utils.js';
import { addEffect } from './app/simulator/engine/effectManager.js';
import { IEffect } from './app/simulator/effect/types.js';
import { GameState, Unit } from './app/simulator/engine/types.js';
import { createEmptyStatRecord } from './app/simulator/statBuilder.js';

// モックGameState作成
function createMockState(): GameState {
    const mockUnit: Unit = {
        id: 'test-enemy',
        name: 'テスト敵',
        isEnemy: true,
        element: 'Physical',
        level: 80,
        abilities: { basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', targetType: 'single_enemy', description: 'Test' } },
        stats: { ...createEmptyStatRecord(), hp: 10000, atk: 100, def: 100, spd: 100 },
        baseStats: { ...createEmptyStatRecord(), hp: 10000, atk: 100, def: 100, spd: 100 },
        hp: 10000,
        ep: 0,
        shield: 0,
        toughness: 100,
        maxToughness: 100,
        weaknesses: new Set(),
        modifiers: [],
        effects: [],
        actionValue: 100,
        actionPoint: 0,
        rotationIndex: 0,
        ultCooldown: 0,
    };

    return {
        units: [mockUnit],
        skillPoints: 3,
        maxSkillPoints: 5,
        time: 0,
        log: [],
        eventHandlers: [],
        eventHandlerLogics: {},
        damageModifiers: {},
        cooldowns: {},
        cooldownMetadata: {},
        pendingActions: [],
        actionQueue: [],
        result: {
            totalDamageDealt: 0,
            characterStats: {},
        },
    };
}

async function runTests() {
    console.log('=== エフェクト解除可能フラグ検証 ===\n');

    let passed = 0;
    let failed = 0;

    // テスト1: isCleansable: trueのみがcleanse対象
    console.log('【テスト1】isCleansable: trueのDEBUFFのみがcleanse対象');
    {
        let state = createMockState();
        const targetId = 'test-enemy';

        // 解除可能なデバフ
        const cleansableDebuff: IEffect = {
            id: 'cleansable-debuff', name: '解除可能デバフ', category: 'DEBUFF', sourceUnitId: targetId,
            durationType: 'TURN_END_BASED', duration: 3, isCleansable: true,
            apply: (t, s) => s, remove: (t, s) => s
        };
        // 解除不可のデバフ
        const uncleansableDebuff: IEffect = {
            id: 'uncleansable-debuff', name: '解除不可デバフ', category: 'DEBUFF', sourceUnitId: targetId,
            durationType: 'TURN_END_BASED', duration: 3, // isCleansable未設定
            apply: (t, s) => s, remove: (t, s) => s
        };

        state = addEffect(state, targetId, cleansableDebuff);
        state = addEffect(state, targetId, uncleansableDebuff);

        const beforeCount = state.units.find(u => u.id === targetId)!.effects.filter(e => e.category === 'DEBUFF').length;
        console.log(`  cleanse前デバフ数: ${beforeCount}`);

        state = cleanse(state, targetId, 2);  // 2つ解除しようとする

        const afterEffects = state.units.find(u => u.id === targetId)!.effects;
        const hasCleansable = afterEffects.some(e => e.id === 'cleansable-debuff');
        const hasUncleansable = afterEffects.some(e => e.id === 'uncleansable-debuff');
        console.log(`  解除可能デバフ残存: ${hasCleansable}`);
        console.log(`  解除不可デバフ残存: ${hasUncleansable}`);

        if (!hasCleansable && hasUncleansable) {
            console.log('  結果: ✅ PASS（解除可能のみ解除された）');
            passed++;
        } else {
            console.log('  結果: ❌ FAIL');
            failed++;
        }
    }

    console.log('');

    // テスト2: isDispellable: trueのみがdispel対象
    console.log('【テスト2】isDispellable: trueのBUFFのみがdispel対象');
    {
        let state = createMockState();
        const targetId = 'test-enemy';

        // 解除可能なバフ
        const dispellableBuff: IEffect = {
            id: 'dispellable-buff', name: '解除可能バフ', category: 'BUFF', sourceUnitId: targetId,
            durationType: 'TURN_END_BASED', duration: 3, isDispellable: true,
            apply: (t, s) => s, remove: (t, s) => s
        };
        // 解除不可のバフ（装備効果など）
        const undispellableBuff: IEffect = {
            id: 'undispellable-buff', name: '解除不可バフ', category: 'BUFF', sourceUnitId: targetId,
            durationType: 'TURN_END_BASED', duration: 3, // isDispellable未設定
            apply: (t, s) => s, remove: (t, s) => s
        };

        state = addEffect(state, targetId, dispellableBuff);
        state = addEffect(state, targetId, undispellableBuff);

        const beforeCount = state.units.find(u => u.id === targetId)!.effects.filter(e => e.category === 'BUFF').length;
        console.log(`  dispel前バフ数: ${beforeCount}`);

        state = dispelBuffs(state, targetId, 2);  // 2つ解除しようとする

        const afterEffects = state.units.find(u => u.id === targetId)!.effects;
        const hasDispellable = afterEffects.some(e => e.id === 'dispellable-buff');
        const hasUndispellable = afterEffects.some(e => e.id === 'undispellable-buff');
        console.log(`  解除可能バフ残存: ${hasDispellable}`);
        console.log(`  解除不可バフ残存: ${hasUndispellable}`);

        if (!hasDispellable && hasUndispellable) {
            console.log('  結果: ✅ PASS（解除可能のみ解除された）');
            passed++;
        } else {
            console.log('  結果: ❌ FAIL');
            failed++;
        }
    }

    console.log('');

    // テスト3: STATUSカテゴリはcleanse対象外
    console.log('【テスト3】STATUSカテゴリはcleanse/dispel対象外');
    {
        let state = createMockState();
        const targetId = 'test-enemy';

        // STATUSエフェクト
        const statusEffect: IEffect = {
            id: 'status-effect', name: 'ステータスエフェクト', category: 'STATUS', sourceUnitId: targetId,
            durationType: 'TURN_END_BASED', duration: 3,
            apply: (t, s) => s, remove: (t, s) => s
        };

        state = addEffect(state, targetId, statusEffect);

        state = cleanse(state, targetId, 1);
        state = dispelBuffs(state, targetId, 1);

        const hasStatus = state.units.find(u => u.id === targetId)!.effects.some(e => e.id === 'status-effect');

        if (hasStatus) {
            console.log('  結果: ✅ PASS（STATUSは解除されなかった）');
            passed++;
        } else {
            console.log('  結果: ❌ FAIL（STATUSが解除された）');
            failed++;
        }
    }

    console.log('');

    // テスト4: breakEffects.tsのDoTがisCleansable: trueを持つか確認
    console.log('【テスト4】breakEffects.tsのDoTがisCleansable: trueを持つか');
    {
        try {
            const { createBurnEffect } = await import('./app/simulator/effect/breakEffects.js');

            const mockSource: any = { id: 'source', stats: { break_effect: 0 } };
            const mockTarget: any = { id: 'target', stats: { hp: 10000 }, maxToughness: 100 };

            const burnEffect = createBurnEffect(mockSource, mockTarget);

            console.log(`  Burn isCleansable: ${burnEffect.isCleansable}`);

            if (burnEffect.isCleansable === true) {
                console.log('  結果: ✅ PASS');
                passed++;
            } else {
                console.log('  結果: ❌ FAIL');
                failed++;
            }
        } catch (e) {
            console.log(`  エラー: ${e}`);
            console.log('  結果: ❌ FAIL');
            failed++;
        }
    }

    console.log('');
    console.log('=== 検証完了 ===');
    console.log(`結果: ${passed} PASS / ${failed} FAIL`);
}

runTests().catch(console.error);
