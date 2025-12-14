import { createInitialGameState } from './app/simulator/engine/gameState';
import { processActionQueue } from './app/simulator/engine/dispatcher';
import { blade } from './app/data/characters/blade';
import { SimulationConfig } from './app/simulator/engine/types';

// モックの敵データ (型エラー回避のためanyでキャストしつつ、必要なプロパティを網羅)
const mockEnemy: any = {
    id: 'enemy1',
    name: 'Test Enemy',
    isEnemy: true,
    element: 'Wind',
    stats: {
        hp: 100000,
        atk: 1000,
        def: 1000,
        spd: 100,
        max_hp: 100000,
        crit_rate: 0,
        crit_dmg: 0,
        aggro: 100
    },
    effects: [],
    abilities: {
        basic: { id: 'e-basic', name: 'Attack', type: 'Basic ATK', targetType: 'target', scaling: [], hits: [] },
        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', targetType: 'target', scaling: [], hits: [] },
        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', targetType: 'target', scaling: [], hits: [] },
    },
    actionValue: 0,
    actionPoint: 0,
    rotationIndex: 0,
    ultCooldown: 0,
    baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, critRate: 0, critDmg: 0, aggro: 100 },
    currentTurnOwnerId: undefined
};

const config: SimulationConfig = {
    characters: [blade],
    enemies: [mockEnemy],
    weaknesses: new Set(['Wind']),
    enemyConfig: { level: 80, maxHp: 100000, toughness: 300, spd: 100, atk: 1000, def: 1000 }, // atk/def追加
    rounds: 1
};

async function runTest() {
    console.log('--- Blade Repro Test Start ---');
    let state = createInitialGameState(config);

    // 刃のローテーションを「スキルのみ」に設定
    const bladeUnit = state.units.find(u => u.id === 'blade');
    if (bladeUnit) {
        bladeUnit.config = {
            rotation: ['skill', 'skill', 'skill', 'skill'], // 常にスキルを要求
            ultStrategy: 'cooldown',
            ultCooldown: 0
        };
    }

    console.log('Starting simulation loop...');
    // 最初の数アクションを実行
    for (let i = 0; i < 10; i++) {
        // processActionQueue は1アクション処理すると帰ってくる想定（実装によるが）
        // simulator.ts の実装を見ると while ループで回しているので、ここでは手動で step 実行する感じにしたいが
        // processActionQueue は通常、全アクション終わるまで走るか、ラウンド終了まで走る。
        // ここでは単純に processActionQueue を呼んで、ログを確認する。

        // 注: processActionQueueが非同期でない場合もあるが、通常は同期
        state = processActionQueue(state);

        if (state.result.outcome) break;
    }

    // ログ出力
    console.log('--- Battle Log (Skill Usage) ---');
    const skillLogs = state.log.filter(l => l.actionType === 'スキル' || l.details.includes('地獄変'));
    skillLogs.forEach(l => {
        console.log(`[${l.actionTime}] ${l.characterName}: ${l.details}`);
    });

    // 2重発動のチェック（同じタイムスタンプで複数回スキルがあるか）
    const timeMap = new Map<number, number>();
    skillLogs.forEach(l => {
        timeMap.set(l.actionTime, (timeMap.get(l.actionTime) || 0) + 1);
    });

    let doubleTriggerFound = false;
    timeMap.forEach((count, time) => {
        if (count > 1) {
            console.error(`[ERROR] Double skill trigger detected at time ${time}! Count: ${count}`);
            doubleTriggerFound = true;
        }
    });

    if (!doubleTriggerFound) {
        console.log('No double skill trigger detected in logs.');
    }

    // ローテーション無視チェック
    // 2ターン目以降（地獄変中）にスキルを使おうとしたか？
    // ログに「強化通常攻撃」ではなく「スキル」が出ていたらNG（スキルは使えないはずだがローテーションがスキルを指定しているので）
    // もしシミュレーターがスキルを使えないと判断して通常攻撃にしてくれていればOK

    const attackLogs = state.log.filter(l => l.characterName === '刃' && (l.actionType === '通常攻撃' || l.actionType === 'スキル'));
    console.log('--- Blade Actions ---');
    attackLogs.forEach((l, idx) => {
        console.log(`${idx + 1}: ${l.actionType} - ${l.details}`);
    });

    // 期待値: 1: スキル -> 2: 通常攻撃(強化) -> 3: 通常攻撃(強化) ...
    if (attackLogs.length >= 2) {
        if (attackLogs[1].actionType === 'スキル') {
            console.error('[ERROR] Blade used Skill in 2nd turn even though he should be in Hellscape!');
        } else {
            console.log('[OK] Blade used Normal Attack (presumably Enhanced) in 2nd turn.');
        }
    }
}

runTest();
