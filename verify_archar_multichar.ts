/**
 * アーチャーのスキル連打モードで他のキャラクターが動かなくなるバグを再現するテスト
 */
import { Enemy } from './app/types';
import { SimulationConfig } from './app/simulator/engine/types';
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch } from './app/simulator/engine/dispatcher';
import { stepSimulation } from './app/simulator/engine/simulation';
import { initializeActionQueue } from './app/simulator/engine/actionValue';
import { archarHandlerFactory, archar } from './app/data/characters/archar';
import { march7thHandlerFactory, march7th } from './app/data/characters/march-7th';

// ダミー敵
const enemy: Enemy = {
    id: 'enemy',
    name: 'Test Enemy',
    element: 'Physical',
    toughness: 100,

    baseStats: {
        hp: 100000,
        atk: 100,
        def: 100,
        spd: 80,  // 遅め
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,

    },
    baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },

    abilities: {
        basic: { id: 'e-b', name: 'Basic', type: 'Basic ATK', description: '' },
        skill: { id: 'e-s', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'e-u', name: 'Ultimate', type: 'Ultimate', description: '' },
        talent: { id: 'e-t', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'e-te', name: 'Tech', type: 'Technique', description: '' },
    },

};

// シミュレーション設定: アーチャー＋三月なのか
const simConfig: SimulationConfig = {
    characters: [archar, march7th],
    enemies: [enemy],
    weaknesses: new Set(['Quantum', 'Ice']),
    partyConfig: {
        members: [
            {
                character: { ...archar, id: 'archar' },
                config: {
                    rotation: ['b', 'b', 'b'],
                    rotationMode: 'spam_skill',
                    spamSkillTriggerSp: 4,
                    ultStrategy: 'immediate',
                    ultCooldown: 0
                },
                enabled: true,
                eidolonLevel: 0
            },
            {
                character: { ...march7th, id: 'march7th' },
                config: {
                    rotation: ['s', 'b', 'b'],
                    ultStrategy: 'immediate',
                    ultCooldown: 0,
                    skillTargetId: 'archar'
                },
                enabled: true,
                eidolonLevel: 0
            }
        ]
    },
    enemyConfig: {
        level: 80,
        maxHp: 100000,
        spd: 80,
        toughness: 100,

    },
    rounds: 5
};

let state = createInitialGameState(simConfig);

// SPを十分に設定
state = { ...state, skillPoints: 7, maxSkillPoints: 7 };
console.log(`Starting SP: ${state.skillPoints}`);

// ハンドラ登録
state.units.forEach(unit => {
    if (unit.id === 'archar') {
        const { handlerMetadata, handlerLogic } = archarHandlerFactory(unit.id, unit.level, 0);
        state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: [{ metadata: handlerMetadata, logic: handlerLogic }] });
    }
    if (unit.id === 'march7th') {
        const { handlerMetadata, handlerLogic } = march7thHandlerFactory(unit.id, unit.level, 0);
        state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: [{ metadata: handlerMetadata, logic: handlerLogic }] });
    }
});
state = dispatch(state, { type: 'BATTLE_START' });

// アクションキュー初期化
if (state.actionQueue.length === 0) {
    state.actionQueue = initializeActionQueue(state.units);
}

console.log('=== Initial Action Queue ===');
state.actionQueue.forEach((entry, idx) => {
    const unit = state.units.find(u => u.id === entry.unitId);
    console.log(`[${idx}] ${unit?.name || entry.unitId} (SPD: ${unit?.stats.spd}) AV: ${entry.actionValue.toFixed(1)}`);
});
console.log('');

// 20ステップ実行して各キャラクターの行動を追跡
console.log('=== Simulation Steps ===');
for (let i = 0; i < 20; i++) {
    const nextEntry = state.actionQueue[0];
    const nextUnit = state.units.find(u => u.id === nextEntry?.unitId);

    console.log(`\n[Step ${i + 1}] Next: ${nextUnit?.name || 'N/A'} (${nextEntry?.unitId}) AV: ${nextEntry?.actionValue.toFixed(1)}, SP: ${state.skillPoints}`);

    // PREVENT_TURN_END の確認
    if (nextUnit) {
        const preventTurnEnd = nextUnit.effects.some(e => e.tags?.includes('PREVENT_TURN_END'));
        if (preventTurnEnd) {
            console.log(`  [!] PREVENT_TURN_END active on ${nextUnit.name}`);
        }
    }

    const prevLogLength = state.log.length;
    state = stepSimulation(state);

    // 新しいログを表示
    for (let j = prevLogLength; j < state.log.length; j++) {
        const log = state.log[j];
        console.log(`  -> Log: ${log.actionType} by ${log.characterName || log.sourceId}`);
    }

    // 各キャラクターのAV確認
    console.log('  AQ:', state.actionQueue.map(e => {
        const u = state.units.find(u2 => u2.id === e.unitId);
        return `${u?.name?.substring(0, 6) || e.unitId}:${e.actionValue.toFixed(0)}`;
    }).join(', '));
}

console.log('\n=== Summary ===');

// キャラクターごとのアクション数をカウント
const archerActions = state.log.filter(l => l.sourceId === 'archar' && (l.actionType === 'スキル' || l.actionType === '通常攻撃' || l.actionType === '必殺技')).length;
// 三月なのかのIDは 'march-7th' (ハイフン付き)
const marchActions = state.log.filter(l => l.sourceId === 'march-7th' && (l.actionType === 'スキル' || l.actionType === '通常攻撃' || l.actionType === '必殺技')).length;
const enemyActions = state.log.filter(l => l.sourceId === 'enemy' && l.actionType === '通常攻撃').length;

console.log(`Archer actions: ${archerActions}`);
console.log(`March actions: ${marchActions}`);
console.log(`Enemy actions: ${enemyActions}`);

if (marchActions === 0 && archerActions > 0) {
    console.log('\n❌ BUG CONFIRMED: March did not act while Archer was spamming skills!');
} else if (marchActions > 0) {
    console.log('\n✅ March successfully took actions.');
} else {
    console.log('\n⚠ Unable to confirm the issue.');
}
