import { GameState, Unit } from '../engine/types';

import { runSimulation } from '../engine/simulation';
import { kafka } from '../../data/characters/kafka';
import { createEnemy } from '../../data/enemies/dummy';
import { Element } from '../../types';

// テスト用設定
const config = {
    characters: [kafka],
    enemies: [
        createEnemy('dummy1', 80, 'Physical'), // 弱点: 物理（カフカは雷なので弱点撃破しない）
        createEnemy('dummy2', 80, 'Lightning'), // 弱点: 雷（カフカで弱点撃破可能）
        createEnemy('dummy3', 80, 'Wind')
    ],
    weaknesses: new Set<Element>(['Lightning']),
    partyConfig: {
        members: [
            {
                character: kafka,
                config: { rotation: ['e', 'q', 'a'], ultStrategy: 'immediate' as const, ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0
            }
        ]
    },
    enemyConfig: {
        level: 80,
        maxHp: 100000,
        toughness: 300,
        spd: 100
    },
    rounds: 3
};

// シミュレーション実行
console.log('Starting Kafka Verification Simulation...');
const resultState = runSimulation(config);

// 結果検証
console.log('Simulation Completed.');
console.log('Total Damage:', resultState.result.totalDamageDealt);

// ログから特定のイベントを確認
const dotDetonateLogs = resultState.log.filter(entry => entry.actionType === 'DOT_DETONATE');
console.log('DoT Detonate Events:', dotDetonateLogs.length);
dotDetonateLogs.forEach(log => {
    console.log(`- Time: ${log.actionTime}, Damage: ${log.damageDealt}, Details: ${log.details}`);
});

const shockLogs = resultState.log.filter(entry => entry.details?.includes('感電'));
console.log('Shock Application Events:', shockLogs.length);

const talentLogs = resultState.log.filter(entry => entry.details?.includes('追加攻撃'));
console.log('Talent Follow-up Events:', talentLogs.length);

// ユニットの状態確認
resultState.units.forEach(u => {
    if (u.isEnemy) {
        console.log(`Enemy ${u.id}: HP=${u.hp.toFixed(0)}, Effects=${u.effects.map(e => e.name).join(', ')}`);
    } else {
        console.log(`Character ${u.name}: EP=${u.ep}, Effects=${u.effects.map(e => e.name).join(', ')}`);
    }
});
