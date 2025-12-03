import { runSimulation } from '../engine/simulation';
import { SimulationConfig, EnemyConfig } from '../engine/types';
import { Character, Enemy, PartyConfig, PartyMember, Element } from '../../types/index';

console.log('Starting Entanglement Verification...');

// 簡易的な量子属性キャラクターを作成
const quantumChar: Character = {
    id: 'test-quantum',
    name: 'テスト量子',
    path: 'Destruction',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1000,
        atk: 800,
        def: 500,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100
    },
    abilities: {
        basic: {
            id: 'q-basic',
            name: '通常攻撃',
            type: 'Basic ATK',
            description: '単体攻撃',
            damage: { type: 'simple', multiplier: 1.0, scaling: 'atk' },
            energyGain: 20,
            toughnessReduction: 30,
            hits: 1,
            targetType: 'single_enemy',
        },
        skill: {
            id: 'q-skill',
            name: 'スキル',
            type: 'Skill',
            description: '単体攻撃',
            damage: { type: 'simple', multiplier: 2.0, scaling: 'atk' },
            energyGain: 30,
            toughnessReduction: 60,
            hits: 1,
            targetType: 'single_enemy',
        },
        ultimate: {
            id: 'q-ult',
            name: '必殺技',
            type: 'Ultimate',
            description: '全体攻撃',
            damage: { type: 'simple', multiplier: 3.0, scaling: 'atk' },
            energyGain: 5,
            toughnessReduction: 60,
            hits: 1,
            targetType: 'all_enemies',
        },
        talent: {
            id: 'q-talent',
            name: '天賦',
            type: 'Talent',
            description: '',
        },
        technique: {
            id: 'q-tech',
            name: '秘技',
            type: 'Technique',
            description: '',
        }
    },
    traces: [],
    eidolons: {}
};

const partyMember: PartyMember = {
    character: quantumChar,
    config: {
        rotation: ['s', 's', 's', 's', 's'], // スキル連打で弱点撃破を狙う
        ultStrategy: 'cooldown',
        ultCooldown: 0
    },
    enabled: true,
    eidolonLevel: 0
};

const partyConfig: PartyConfig = {
    members: [partyMember]
};

// 量子弱点の敵
const enemy: Enemy = {
    id: 'enemy1',
    name: 'Enemy',
    baseStats: {
        hp: 100000,
        atk: 1000,
        def: 500,
        spd: 95,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100
    },
    element: 'Physical',
    abilities: {
        basic: { id: 'e-basic', name: 'Attack', type: 'Basic ATK', description: '' },
        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '' },
        talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' }
    },
    toughness: 120,
    baseRes: {},
};

const enemyConfig: EnemyConfig = {
    level: 80,
    maxHp: 100000,
    toughness: 120,
    spd: 95
};

const config: SimulationConfig = {
    characters: [quantumChar],
    enemies: [enemy],
    weaknesses: new Set<Element>(['Quantum']), // 量子弱点
    partyConfig: partyConfig,
    enemyConfig: enemyConfig,
    rounds: 3
};

// シミュレーション実行
const result = runSimulation(config);

console.log('\n=== 検証結果 ===\n');

// 1. もつれダメージの発生確認
const entanglementDamageLogs = result.log.filter(entry => entry.actionType === 'ENTANGLEMENT_DAMAGE');
if (entanglementDamageLogs.length > 0) {
    console.log(`[PASS] もつれダメージが${entanglementDamageLogs.length}回発生しました。`);
    entanglementDamageLogs.forEach((log, index) => {
        console.log(`  もつれ #${index + 1}: ${log.damageDealt?.toFixed(2)} ダメージ, ${log.details}`);
    });
} else {
    console.error('[FAIL] もつれダメージが発生していません。');
}

// 2. 弱点撃破の確認
const weaknessBreakLogs = result.log.filter(entry =>
    entry.details?.includes('Weakness Break') || entry.actionType === 'WEAKNESS_BREAK'
);
console.log(`\n弱点撃破: ${weaknessBreakLogs.length}回`);

// 3. 全ログを表示（デバッグ用）
console.log(`\n全ログ (Total: ${result.log.length}):`);
result.log.forEach(l => {
    if (l.actionType === 'ENTANGLEMENT_DAMAGE' || l.details?.includes('もつれ')) {
        console.log(`[SimulationLog] Action: ${l.actionType}, Source: ${l.characterName}, Details: ${l.details}, Damage: ${l.damageDealt}`);
    }
});

console.log('\nVerification Complete.');
