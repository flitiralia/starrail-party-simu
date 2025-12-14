/**
 * 羅刹実装検証スクリプト（簡易版）
 * 
 * 検証項目:
 * 1. dispelBuffs関数が正しく動作する
 * 2. luocha.tsの変更がコンパイルエラーなく適用されている
 */

import { dispelBuffs, applyHealing } from './app/simulator/engine/utils.js';
import { addEffect, removeEffect } from './app/simulator/engine/effectManager.js';
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
        abilities: { basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', targetType: 'single_enemy' } },
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

    const mockAlly: Unit = {
        id: 'test-ally',
        name: 'テスト味方',
        isEnemy: false,
        element: 'Imaginary',
        level: 80,
        abilities: { basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', targetType: 'single_enemy' } },
        stats: { ...createEmptyStatRecord(), hp: 5000, atk: 1000, def: 500, spd: 100 },
        baseStats: { ...createEmptyStatRecord(), hp: 5000, atk: 1000, def: 500, spd: 100 },
        hp: 5000,
        ep: 0,
        shield: 0,
        toughness: 0,
        maxToughness: 0,
        weaknesses: new Set(),
        modifiers: [],
        effects: [],
        actionValue: 100,
        actionPoint: 0,
        rotationIndex: 0,
        ultCooldown: 0,
    };

    return {
        units: [mockAlly, mockUnit],
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
    console.log('=== 羅刹実装検証（簡易版）===\n');

    let passed = 0;
    let failed = 0;

    // テスト1: dispelBuffs関数単体テスト
    console.log('【テスト1】dispelBuffs関数単体テスト');
    {
        let state = createMockState();
        const enemyId = 'test-enemy';

        // バフを追加
        const buff1: IEffect = {
            id: 'buff-1', name: 'バフ1', category: 'BUFF', sourceUnitId: enemyId,
            durationType: 'TURN_END_BASED', duration: 3, apply: (t, s) => s, remove: (t, s) => s
        };
        const buff2: IEffect = {
            id: 'buff-2', name: 'バフ2', category: 'BUFF', sourceUnitId: enemyId,
            durationType: 'TURN_END_BASED', duration: 3, apply: (t, s) => s, remove: (t, s) => s
        };
        state = addEffect(state, enemyId, buff1);
        state = addEffect(state, enemyId, buff2);

        const beforeCount = state.units.find(u => u.id === enemyId)!.effects.filter(e => e.category === 'BUFF').length;
        console.log(`  解除前バフ数: ${beforeCount}`);

        state = dispelBuffs(state, enemyId, 1);

        const afterCount = state.units.find(u => u.id === enemyId)!.effects.filter(e => e.category === 'BUFF').length;
        console.log(`  解除後バフ数: ${afterCount}`);

        const logHasDispel = state.log.some(l => l.actionType === 'バフ解除');
        console.log(`  バフ解除ログ: ${logHasDispel ? 'あり' : 'なし'}`);

        if (afterCount === beforeCount - 1 && logHasDispel) {
            console.log('  結果: ✅ PASS');
            passed++;
        } else {
            console.log('  結果: ❌ FAIL');
            failed++;
        }
    }

    console.log('');

    // テスト2: applyHealing関数がBattleResultに記録するか
    console.log('【テスト2】applyHealing関数がBattleResultに記録するか');
    {
        let state = createMockState();
        const allyId = 'test-ally';
        const healSourceId = 'healer';

        // healerユニットを追加
        const healer: Unit = {
            id: healSourceId,
            name: 'ヒーラー',
            isEnemy: false,
            element: 'Imaginary',
            level: 80,
            abilities: { basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', targetType: 'single_enemy' } },
            stats: { ...createEmptyStatRecord(), hp: 5000, atk: 1000, def: 500, spd: 100 },
            baseStats: { ...createEmptyStatRecord(), hp: 5000, atk: 1000, def: 500, spd: 100 },
            hp: 5000,
            ep: 0,
            shield: 0,
            toughness: 0,
            maxToughness: 0,
            weaknesses: new Set(),
            modifiers: [],
            effects: [],
            actionValue: 100,
            actionPoint: 0,
            rotationIndex: 0,
            ultCooldown: 0,
        };
        state = { ...state, units: [...state.units, healer] };

        // 対象のHPを減らす
        state = {
            ...state,
            units: state.units.map(u => u.id === allyId ? { ...u, hp: 2000 } : u)
        };

        const healAmount = 1000;
        state = applyHealing(state, healSourceId, allyId, healAmount, 'テスト回復');

        const healerStats = state.result.characterStats[healSourceId];
        console.log(`  記録された回復量: ${healerStats?.healingDealt || 0}`);

        const targetHp = state.units.find(u => u.id === allyId)!.hp;
        console.log(`  対象HP: 2000 → ${targetHp}`);

        if (healerStats?.healingDealt === healAmount && targetHp === 3000) {
            console.log('  結果: ✅ PASS');
            passed++;
        } else {
            console.log('  結果: ❌ FAIL');
            failed++;
        }
    }

    console.log('');

    // テスト3: シールドエフェクトがdispelBuffsで解除されないことを確認
    console.log('【テスト3】シールドエフェクトがdispelBuffsで除外されるか');
    {
        let state = createMockState();
        const enemyId = 'test-enemy';

        // シールドとバフを追加
        const shieldEffect: IEffect = {
            id: 'shield-1', name: 'シールド', category: 'BUFF', type: 'Shield', sourceUnitId: enemyId,
            durationType: 'TURN_END_BASED', duration: 3, apply: (t, s) => s, remove: (t, s) => s
        };
        const buff: IEffect = {
            id: 'buff-1', name: 'バフ', category: 'BUFF', sourceUnitId: enemyId,
            durationType: 'TURN_END_BASED', duration: 3, apply: (t, s) => s, remove: (t, s) => s
        };
        state = addEffect(state, enemyId, shieldEffect);
        state = addEffect(state, enemyId, buff);

        const beforeEffects = state.units.find(u => u.id === enemyId)!.effects;
        const hasShieldBefore = beforeEffects.some(e => e.type === 'Shield');
        const hasBuffBefore = beforeEffects.some(e => e.id === 'buff-1');
        console.log(`  解除前: シールド=${hasShieldBefore}, バフ=${hasBuffBefore}`);

        state = dispelBuffs(state, enemyId, 1);

        const afterEffects = state.units.find(u => u.id === enemyId)!.effects;
        const hasShieldAfter = afterEffects.some(e => e.type === 'Shield');
        const hasBuffAfter = afterEffects.some(e => e.id === 'buff-1');
        console.log(`  解除後: シールド=${hasShieldAfter}, バフ=${hasBuffAfter}`);

        if (hasShieldAfter && !hasBuffAfter) {
            console.log('  結果: ✅ PASS（シールドは残り、バフのみ解除）');
            passed++;
        } else {
            console.log('  結果: ❌ FAIL');
            failed++;
        }
    }

    console.log('');

    // テスト4: luocha.tsのインポート確認
    console.log('【テスト4】luocha.tsのインポート確認');
    {
        try {
            const { luocha, luochaHandlerFactory } = await import('./app/data/characters/luocha.js');

            console.log(`  キャラクターID: ${luocha.id}`);
            console.log(`  軌跡A6 crowd_control_res: ${luocha.traces?.find(t => t.id === 'luocha-trace-a6')?.value || '未設定'}`);
            console.log(`  E3に必殺技倍率: ${luocha.eidolons?.e3?.abilityModifiers?.some(m => m.abilityName === 'ultimate') ? 'あり' : 'なし'}`);
            console.log(`  E5に必殺技倍率: ${luocha.eidolons?.e5?.abilityModifiers?.some(m => m.abilityName === 'ultimate') ? 'あり' : 'なし'}`);

            const a6HasCCRes = luocha.traces?.find(t => t.id === 'luocha-trace-a6')?.value === 0.70;
            const e3NoUlt = !luocha.eidolons?.e3?.abilityModifiers?.some(m => m.abilityName === 'ultimate');
            const e5HasUlt = luocha.eidolons?.e5?.abilityModifiers?.some(m => m.abilityName === 'ultimate');

            if (a6HasCCRes && e3NoUlt && e5HasUlt) {
                console.log('  結果: ✅ PASS');
                passed++;
            } else {
                console.log('  結果: ❌ FAIL');
                console.log(`    a6HasCCRes=${a6HasCCRes}, e3NoUlt=${e3NoUlt}, e5HasUlt=${e5HasUlt}`);
                failed++;
            }
        } catch (e) {
            console.log(`  インポートエラー: ${e}`);
            console.log('  結果: ❌ FAIL');
            failed++;
        }
    }

    console.log('');
    console.log('=== 検証完了 ===');
    console.log(`結果: ${passed} PASS / ${failed} FAIL`);
}

runTests().catch(console.error);
