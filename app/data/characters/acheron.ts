import { Character, StatKey, HitDetail, IAbility } from '../../types';
import {
    IEventHandlerFactory,
    GameState,
    IEvent,
    Unit,
    GeneralEvent,
    ActionEvent,
    EnemyDefeatedEvent,
    IAura,
    DamageResult
} from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId, UnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage, publishEvent } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { SimulationLogEntry } from '../../types';
import { calculateDamageWithCritInfo } from '../../simulator/damage';

// =============================================================================
// 定数定義
// =============================================================================

const CHARACTER_ID = 'acheron';

// 残夢 (Zanmu) システム
const MAX_ZANMU_STACKS = 9;  // 必殺技発動に必要な層数

// 四相断我 (Shisou Danwa) 秘技
const MAX_SHISOU_DANWA_STACKS = 3;  // A2: 3層まで蓄積可能

// エフェクトID
const EFFECT_IDS = {
    /** 残夢スタック */
    // 残夢 (Zanmu) システム - EPとして扱うため削除
    // ZANMU_STACKS: (sourceId: string) => `acheron-zanmu-${sourceId}`,
    /** 集真赤デバフ */
    SHISHINAKA: (sourceId: string, targetId: string) => `acheron-shishinaka-${sourceId}-${targetId}`,
    /** 必殺技中の全耐性ダウン */
    ULT_RES_DOWN: (sourceId: string, targetId: string) => `acheron-ult-res-down-${sourceId}-${targetId}`,
    /** A6: 与ダメージ+30%バフ（3スタック） */
    A6_DMG_BOOST: (sourceId: string) => `acheron-a6-dmg-boost-${sourceId}`,
    /** E4: 必殺技被ダメ+8% */
    E4_ULT_VULN: (targetId: string) => `acheron-e4-ult-vuln-${targetId}`,
    /** 四相断我 */
    SHISOU_DANWA: (sourceId: string) => `acheron-shisou-danwa-${sourceId}`,
    /** 虚無シナジーバフ（A4） */
    A4_NIHILITY_SYNERGY: (sourceId: string) => `acheron-a4-nihility-${sourceId}`,
    /** 必殺技実行中フラグ */
    ULT_IN_PROGRESS: (sourceId: string) => `acheron-ult-in-progress-${sourceId}`,
} as const;

const TRACE_IDS = {
    /** 昇格2: 赤鬼 */
    A2_AKAKI: 'acheron-trace-a2',
    /** 昇格4: 奈落 */
    A4_NARAKU: 'acheron-trace-a4',
    /** 昇格6: 雷心 */
    A6_RAISHIN: 'acheron-trace-a6',
} as const;

// アビリティ値（レベル別）
const ABILITY_VALUES = {
    // 通常攻撃
    basicDmg: {
        6: 1.0,
        7: 1.1
    } as Record<number, number>,

    // 戦闘スキル
    skillDmg: {
        10: { main: 1.6, adj: 0.6 },
        12: { main: 1.76, adj: 0.66 }
    } as Record<number, { main: number; adj: number }>,

    // 必殺技
    ultDmg: {
        10: {
            singleTotal: 3.72,      // 単体総ダメージ
            othersTotal: 3.0,       // その他敵へのダメージ
            teisouFlat: 0.24,       // 啼沢斬り単体ダメージ倍率 (Z%)
            teisouAoe: 0.15,        // 啼沢斬り全体ダメージ倍率 (x%)
            teisouBonus: 0.60,      // 集真赤消去ボーナス (y%, 最大)
            yomigaeri: 1.20         // 黄泉返り全体ダメージ倍率 (z%)
        },
        12: {
            singleTotal: 4.0176,
            othersTotal: 3.24,
            teisouFlat: 0.2592,
            teisouAoe: 0.162,
            teisouBonus: 0.648,
            yomigaeri: 1.296
        }
    } as Record<number, {
        singleTotal: number;
        othersTotal: number;
        teisouFlat: number;
        teisouAoe: number;
        teisouBonus: number;
        yomigaeri: number;
    }>,

    // 天賦: 全耐性ダウン
    talentResDown: {
        10: 0.20,
        12: 0.22
    } as Record<number, number>,
};

// E6: A6追加ヒットダメージ倍率
const A6_ADDITIONAL_HIT_MULT = 0.25;
const A6_ADDITIONAL_HIT_COUNT = 6;

// E1: デバフ敵への会心率
const E1_CRIT_RATE_BONUS = 0.18;

// E4: 必殺技被ダメージアップ
const E4_ULT_VULN = 0.08;

// E6: 必殺技ダメージの全耐性貫通
const E6_RES_PEN = 0.20;

// A4: 虚無シナジー
const A4_NIHILITY_1 = 0.15;  // 115% -> +15%
const A4_NIHILITY_2 = 0.60;  // 160% -> +60%

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 必殺技ダメージをprimaryDamage.hitDetailsに追加する
 * @param state 現在のGameState
 * @param hitDetail 追加するヒット詳細
 * @returns 更新されたGameState
 */
const appendPrimaryHit = (state: GameState, hitDetail: HitDetail): GameState => {
    if (!state.currentActionLog) {
        console.warn('[appendPrimaryHit] currentActionLog is null, skipping hit:', hitDetail.targetName);
        return state;
    }

    const currentHitDetails = state.currentActionLog.primaryDamage.hitDetails;
    const currentTotalDamage = state.currentActionLog.primaryDamage.totalDamage;

    console.log(`[appendPrimaryHit] Adding hit: index=${hitDetail.hitIndex}, name=${hitDetail.targetName}, damage=${hitDetail.damage.toFixed(2)}, currentCount=${currentHitDetails.length}`);

    return {
        ...state,
        currentActionLog: {
            ...state.currentActionLog,
            primaryDamage: {
                hitDetails: [...currentHitDetails, hitDetail],
                totalDamage: currentTotalDamage + hitDetail.damage
            }
        }
    };
};

// =============================================================================
// キャラクター定義
// =============================================================================

export const acheron: Character = {
    id: 'acheron',
    name: '黄泉',
    path: 'Nihility',
    element: 'Lightning',
    rarity: 5,
    maxEnergy: 9,  // EPを使用（残夢システム）
    disableEnergyRecovery: true, // 通常のEP回復を無効化

    baseStats: {
        hp: 1125,
        atk: 698,
        def: 436,
        spd: 101,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100  // 虚無標準
    },

    abilities: {
        basic: {
            id: 'acheron-basic',
            name: '三途の枯木',
            type: 'Basic ATK',
            description: '指定した敵単体に黄泉の攻撃力100%分の雷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            },
            energyGain: 0,  // EP不使用
            targetType: 'single_enemy',
        },

        skill: {
            id: 'acheron-skill',
            name: '八雷渡り',
            type: 'Skill',
            description: '「残夢」を1層獲得。敵単体に「集真赤」を1層付与し、攻撃力160%分の雷属性ダメージ。隣接する敵に攻撃力60%分の雷属性ダメージ。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [
                    { multiplier: 0.40, toughnessReduction: 5 },
                    { multiplier: 0.40, toughnessReduction: 5 },
                    { multiplier: 0.40, toughnessReduction: 5 },
                    { multiplier: 0.40, toughnessReduction: 5 }
                ],
                adjacentHits: [{ multiplier: 0.60, toughnessReduction: 10 }]
            },
            energyGain: 0,
            targetType: 'blast',
            spCost: 1,
        },

        ultimate: {
            id: 'acheron-ultimate',
            name: '残夢染める繚乱の一太刀',
            type: 'Ultimate',
            description: '「啼沢斬り」を3回、「黄泉返り」を1回発動。指定した敵単体に最大で攻撃力372%分、その他の敵に最大で攻撃力300%分の雷属性ダメージ。',
            // ダメージはonUltimateUsedで手動処理するため無効化
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: []  // dispatcher自動処理を無効化
            },
            energyGain: 0,
            targetType: 'all_enemies',
        },

        talent: {
            id: 'acheron-talent',
            name: '紅葉に時雨、万里の空',
            type: 'Talent',
            description: '「残夢」が9層で必殺技発動可能。必殺技中は弱点無視で靭性削り、敵全体の全耐性-20%。スキル発動時にデバフ付与で「残夢」+1。',
        },

        technique: {
            id: 'acheron-technique',
            name: '四相断我',
            type: 'Technique',
            description: '敵全体に攻撃力200%分の雷属性ダメージ、弱点無視で靭性削り。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_AKAKI,
            name: '赤鬼',
            type: 'Bonus Ability',
            description: '戦闘開始時、「残夢」を5層獲得し、ランダムな敵1体に「集真赤」を5層付与。上限後は「四相断我」を獲得（最大3層）。'
        },
        {
            id: TRACE_IDS.A4_NARAKU,
            name: '奈落',
            type: 'Bonus Ability',
            description: 'パーティ内に黄泉以外の「虚無」の運命を歩むキャラクターが1名/2名存在する場合、与ダメージ115%/160%。'
        },
        {
            id: TRACE_IDS.A6_RAISHIN,
            name: '雷心',
            type: 'Bonus Ability',
            description: '必殺技の「啼沢斬り」が「集真赤」を持つ敵に命中時、与ダメージ+30%（最大3層、3ターン）。「黄泉返り」時に6ヒット追加（各25%）。'
        },
        {
            id: 'acheron-stat-atk',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct',
            value: 0.28
        },
        {
            id: 'acheron-stat-critdmg',
            name: '会心ダメージ',
            type: 'Stat Bonus',
            description: '会心ダメージ+24.0%',
            stat: 'crit_dmg',
            value: 0.24
        },
        {
            id: 'acheron-stat-lightning',
            name: '雷属性ダメージ',
            type: 'Stat Bonus',
            description: '雷属性ダメージ+8.0%',
            stat: 'lightning_dmg_boost',
            value: 0.08
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '高天寥落、真言始まる',
            description: 'デバフ状態の敵にダメージを与える時、会心率+18%。'
        },
        e2: {
            level: 2,
            name: '雷霆静まり、秋風止む',
            description: '「奈落」の効果最大値に必要な「虚無」キャラ数-1。自身ターン開始時、「残夢」+1、集真赤最多の敵に「集真赤」+1。'
        },
        e3: {
            level: 3,
            name: '永蟄を脅かす寒風',
            description: '必殺技Lv.+2（最大15）、通常攻撃Lv.+1（最大10）。',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.1 }
            ]
        },
        e4: {
            level: 4,
            name: '鏡中を照らす永焔',
            description: '戦闘に入った敵は必殺技被ダメージ+8%。'
        },
        e5: {
            level: 5,
            name: '盤石崩落、千身漂落',
            description: '戦闘スキルLv.+2（最大15）、天賦Lv.+2（最大15）。',
            abilityModifiers: [
                { abilityName: 'skill', param: 'damage.mainHits.0.multiplier', value: 0.44 },
                { abilityName: 'skill', param: 'damage.mainHits.1.multiplier', value: 0.44 },
                { abilityName: 'skill', param: 'damage.mainHits.2.multiplier', value: 0.44 },
                { abilityName: 'skill', param: 'damage.mainHits.3.multiplier', value: 0.44 },
                { abilityName: 'skill', param: 'damage.adjacentHits.0.multiplier', value: 0.66 }
            ]
        },
        e6: {
            level: 6,
            name: '束縛を解く災い',
            description: '必殺技ダメージの全耐性貫通+20%。通常攻撃・スキルも必殺技ダメージとみなし、弱点無視で靭性削り。'
        }
    },

    defaultConfig: {
        lightConeId: 'along-the-passing-shore',  // 流れ逝く岸を歩いて
        superimposition: 1,
        relicSetId: 'pioneer_diver_of_dead_waters',  // 死水に潜る先駆者
        ornamentSetId: 'izumo_gensei_and_takama_divine_realm',  // 顕世の出雲と高天の神国
        mainStats: {
            body: 'crit_dmg',
            feet: 'atk_pct',
            sphere: 'lightning_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.30 },
            { stat: 'crit_dmg', value: 0.40 },
            { stat: 'atk_pct', value: 0.15 },
            { stat: 'spd', value: 6 }
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 残夢スタックを取得
 */
const getZanmuStacks = (state: GameState, sourceUnitId: string): number => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return 0;
    return unit.ep;
};

/**
 * 残夢スタックを設定/更新
 */
const setZanmuStacks = (state: GameState, sourceUnitId: string, stacks: number): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const clampedStacks = Math.min(Math.max(0, stacks), MAX_ZANMU_STACKS);

    return {
        ...state,
        registry: state.registry.update(createUnitId(sourceUnitId), u => ({ ...u, ep: clampedStacks }))
    };
};

/**
 * 残夢を加算
 */
const addZanmuStacks = (state: GameState, sourceUnitId: string, amount: number): GameState => {
    const currentStacks = getZanmuStacks(state, sourceUnitId);
    const newStacks = currentStacks + amount;

    let newState = setZanmuStacks(state, sourceUnitId, Math.min(newStacks, MAX_ZANMU_STACKS));

    // A2: 上限を超えた分は四相断我に変換
    const unit = newState.registry.get(createUnitId(sourceUnitId));
    if (unit?.traces?.some(t => t.id === TRACE_IDS.A2_AKAKI) && newStacks > MAX_ZANMU_STACKS) {
        const overflow = newStacks - MAX_ZANMU_STACKS;
        newState = addShisouDanwaStacks(newState, sourceUnitId, overflow);
    }

    return newState;
};

/**
 * 四相断我スタックを加算
 */
const addShisouDanwaStacks = (state: GameState, sourceUnitId: string, amount: number): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const effectId = EFFECT_IDS.SHISOU_DANWA(sourceUnitId);
    const existingEffect = unit.effects.find(e => e.id === effectId);
    const currentStacks = existingEffect?.stackCount || 0;
    const newStacks = Math.min(currentStacks + amount, MAX_SHISOU_DANWA_STACKS);

    if (existingEffect) {
        const updatedEffect = {
            ...existingEffect,
            stackCount: newStacks,
            name: `四相断我 (${newStacks}/${MAX_SHISOU_DANWA_STACKS})`
        };
        const updatedEffects = unit.effects.map(e => e.id === effectId ? updatedEffect : e);
        return {
            ...state,
            registry: state.registry.update(createUnitId(sourceUnitId), u => ({ ...u, effects: updatedEffects }))
        };
    } else {
        const shisouEffect: IEffect = {
            id: effectId,
            name: `四相断我 (${newStacks}/${MAX_SHISOU_DANWA_STACKS})`,
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: newStacks,
            maxStacks: MAX_SHISOU_DANWA_STACKS,
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        return addEffect(state, sourceUnitId, shisouEffect);
    }
};

/**
 * 集真赤スタックを取得
 */
const getShishinakaStacks = (state: GameState, sourceUnitId: string, targetId: string): number => {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return 0;
    const effect = target.effects.find(e => e.id === EFFECT_IDS.SHISHINAKA(sourceUnitId, targetId));
    return effect?.stackCount || 0;
};

/**
 * 集真赤を付与/加算
 */
const addShishinakaStacks = (state: GameState, sourceUnitId: string, targetId: string, amount: number): GameState => {
    const target = state.registry.get(createUnitId(targetId));
    if (!target || !target.isEnemy) return state;

    // 必殺技実行中は集真赤を付与できない
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (source?.effects.some(e => e.id === EFFECT_IDS.ULT_IN_PROGRESS(sourceUnitId))) {
        return state;
    }

    const effectId = EFFECT_IDS.SHISHINAKA(sourceUnitId, targetId);
    const existingEffect = target.effects.find(e => e.id === effectId);
    const currentStacks = existingEffect?.stackCount || 0;
    const newStacks = currentStacks + amount;  // 最大制限なし（仕様未定）

    if (existingEffect) {
        const updatedEffect = {
            ...existingEffect,
            stackCount: newStacks,
            name: `集真赤 (${newStacks})`
        };
        const updatedEffects = target.effects.map(e => e.id === effectId ? updatedEffect : e);
        return {
            ...state,
            registry: state.registry.update(createUnitId(targetId), u => ({ ...u, effects: updatedEffects }))
        };
    } else {
        const shishinakaEffect: IEffect = {
            id: effectId,
            name: `集真赤 (${newStacks})`,
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: newStacks,
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        return addEffect(state, targetId, shishinakaEffect);
    }
};

/**
 * 集真赤を消去（指定層数）
 */
const removeShishinakaStacks = (state: GameState, sourceUnitId: string, targetId: string, amount: number): { state: GameState; removed: number } => {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return { state, removed: 0 };

    const effectId = EFFECT_IDS.SHISHINAKA(sourceUnitId, targetId);
    const existingEffect = target.effects.find(e => e.id === effectId);
    if (!existingEffect) return { state, removed: 0 };

    const currentStacks = existingEffect.stackCount || 0;
    const removed = Math.min(currentStacks, amount);
    const newStacks = currentStacks - removed;

    if (newStacks <= 0) {
        return { state: removeEffect(state, targetId, effectId), removed };
    } else {
        const updatedEffect = {
            ...existingEffect,
            stackCount: newStacks,
            name: `集真赤 (${newStacks})`
        };
        const updatedEffects = target.effects.map(e => e.id === effectId ? updatedEffect : e);
        return {
            state: {
                ...state,
                registry: state.registry.update(createUnitId(targetId), u => ({ ...u, effects: updatedEffects }))
            },
            removed
        };
    }
};

/**
 * 集真赤を全消去
 */
const clearAllShishinaka = (state: GameState, sourceUnitId: string): GameState => {
    let newState = state;
    const enemies = newState.registry.getAliveEnemies();

    enemies.forEach(enemy => {
        const effectId = EFFECT_IDS.SHISHINAKA(sourceUnitId, enemy.id);
        if (enemy.effects.some(e => e.id === effectId)) {
            newState = removeEffect(newState, enemy.id, effectId);
        }
    });

    return newState;
};

/**
 * 集真赤が最も多い敵を取得
 */
const getEnemyWithMostShishinaka = (state: GameState, sourceUnitId: string): Unit | undefined => {
    const enemies = state.registry.getAliveEnemies();
    let maxEnemy: Unit | undefined;
    let maxStacks = 0;

    enemies.forEach(enemy => {
        const stacks = getShishinakaStacks(state, sourceUnitId, enemy.id);
        if (stacks > maxStacks) {
            maxStacks = stacks;
            maxEnemy = enemy;
        }
    });

    return maxEnemy;
};

/**
 * パーティ内の虚無キャラクター数を計算（黄泉を除く）
 */
const countNihilityAllies = (state: GameState, sourceUnitId: string): number => {
    const allies = state.registry.getAliveAllies();
    return allies.filter(ally =>
        ally.id !== sourceUnitId &&
        ally.path === 'Nihility'
    ).length;
};

/**
 * 必殺技発動可能かチェック
 */
const canUseUltimate = (state: GameState, sourceUnitId: string): boolean => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return false;
    return unit.ep >= (unit.stats.max_ep ?? 0);
};

// =============================================================================
// イベントハンドラー
// =============================================================================

/**
 * 戦闘開始時
 */
const onBattleStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const acheronUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!acheronUnit) return state;

    let newState = state;

    // A2: 戦闘開始時、残夢5層 + ランダムな敵に集真赤5層
    if (acheronUnit.traces?.some(t => t.id === TRACE_IDS.A2_AKAKI)) {
        newState = setZanmuStacks(newState, sourceUnitId, 5);

        const enemies = newState.registry.getAliveEnemies();
        if (enemies.length > 0) {
            const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
            newState = addShishinakaStacks(newState, sourceUnitId, randomEnemy.id, 5);
        }
    }

    // E4: 戦闘に入った敵は必殺技被ダメ+8%
    if (eidolonLevel >= 4) {
        const enemies = newState.registry.getAliveEnemies();
        enemies.forEach(enemy => {
            const e4Debuff: IEffect = {
                id: EFFECT_IDS.E4_ULT_VULN(enemy.id),
                name: '必殺技被ダメ+8%',
                category: 'DEBUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{
                    target: 'ult_dmg_taken' as StatKey,
                    value: E4_ULT_VULN,
                    type: 'add',
                    source: '黄泉E4'
                }],
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            newState = addEffect(newState, enemy.id, e4Debuff);
        });
    }

    // A4: 虚無シナジーオーラ
    if (acheronUnit.traces?.some(t => t.id === TRACE_IDS.A4_NARAKU)) {
        const nihilityCount = countNihilityAllies(newState, sourceUnitId);

        let dmgBoost = 0;
        // E2: 必要人数-1（虚無1名で160%効果発動）
        if (eidolonLevel >= 2) {
            if (nihilityCount >= 1) {
                dmgBoost = A4_NIHILITY_2;  // 160%
            } else {
                dmgBoost = A4_NIHILITY_1;  // 115%（E2の効果で0名でも発動）
            }
        } else {
            // E2なし: 通常の条件
            if (nihilityCount >= 2) {
                dmgBoost = A4_NIHILITY_2;  // 160%
            } else if (nihilityCount >= 1) {
                dmgBoost = A4_NIHILITY_1;  // 115%
            }
        }

        if (dmgBoost > 0) {
            const a4Buff: IEffect = {
                id: EFFECT_IDS.A4_NIHILITY_SYNERGY(sourceUnitId),
                name: `奈落 (与ダメ+${Math.round(dmgBoost * 100)}%)`,
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{
                    target: 'all_type_dmg_boost' as StatKey,
                    value: dmgBoost,
                    type: 'add',
                    source: '奈落'
                }],
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            newState = addEffect(newState, sourceUnitId, a4Buff);
        }
    }

    return newState;
};

/**
 * ターン開始時（E2）
 */
const onTurnStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    if (eidolonLevel < 2) return state;

    let newState = state;

    // E2: 残夢+1
    newState = addZanmuStacks(newState, sourceUnitId, 1);

    // E2: 集真赤最多の敵に+1
    const maxEnemy = getEnemyWithMostShishinaka(newState, sourceUnitId);
    if (maxEnemy) {
        newState = addShishinakaStacks(newState, sourceUnitId, maxEnemy.id, 1);
    } else {
        // 集真赤がない場合はランダムな敵に付与
        const enemies = newState.registry.getAliveEnemies();
        if (enemies.length > 0) {
            const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
            newState = addShishinakaStacks(newState, sourceUnitId, randomEnemy.id, 1);
        }
    }

    return newState;
};

/**
 * スキル使用時
 */
const onSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;

    // 残夢+1
    newState = addZanmuStacks(newState, sourceUnitId, 1);

    // ターゲットに集真赤+1
    const targetId = event.targetId;
    if (targetId) {
        newState = addShishinakaStacks(newState, sourceUnitId, targetId, 1);
    }

    return newState;
};

/**
 * デバフ付与検知（天賦）
 * 味方がスキルでデバフを付与した時、残夢+1（1アクションにつき1回のみ）
 * 注: 集真赤はシステムなので天賦のトリガーにならない
 */
const onEffectApplied = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    hasGainedZanmuThisAction: boolean
): { state: GameState; gained: boolean } => {
    // 既にこのアクションで残夢を獲得済みならスキップ
    if (hasGainedZanmuThisAction) return { state, gained: true };

    // 自身が必殺技実行中の場合はスキップ
    const acheronUnit = state.registry.get(createUnitId(sourceUnitId));
    if (acheronUnit?.effects.some(e => e.id === EFFECT_IDS.ULT_IN_PROGRESS(sourceUnitId))) {
        return { state, gained: false };
    }

    // @ts-ignore - IEventのeffect拡張
    const appliedEffect = event.effect as IEffect | undefined;
    if (!appliedEffect || appliedEffect.category !== 'DEBUFF') return { state, gained: false };

    // 集真赤はシステムなのでスキップ（天賦のトリガーにならない）
    if (appliedEffect.id.includes('shishinaka')) return { state, gained: false };

    // @ts-ignore - IEventのtargetId拡張
    const targetId = event.targetId as string | undefined;
    if (!targetId) return { state, gained: false };

    const target = state.registry.get(createUnitId(targetId));
    if (!target?.isEnemy) return { state, gained: false };

    let newState = state;

    // 残夢+1
    newState = addZanmuStacks(newState, sourceUnitId, 1);

    // 集真赤+1（最も集真赤が多い敵、または現在のターゲット）
    const maxEnemy = getEnemyWithMostShishinaka(newState, sourceUnitId);
    const shishinakaTarget = maxEnemy || target;
    newState = addShishinakaStacks(newState, sourceUnitId, shishinakaTarget.id, 1);

    return { state: newState, gained: true };
};

/**
 * 敵退場時の集真赤引継ぎ
 */
const onEnemyDefeated = (
    event: EnemyDefeatedEvent,
    state: GameState,
    sourceUnitId: string
): GameState => {
    const defeatedEnemy = event.defeatedEnemy;
    if (!defeatedEnemy) return state;

    // 退場した敵の集真赤スタックを取得
    const effectId = EFFECT_IDS.SHISHINAKA(sourceUnitId, defeatedEnemy.id);
    const shishinakaEffect = defeatedEnemy.effects.find(e => e.id === effectId);
    if (!shishinakaEffect || !shishinakaEffect.stackCount) return state;

    const stacksToTransfer = shishinakaEffect.stackCount;

    // 集真赤最多の敵に引継ぎ
    const maxEnemy = getEnemyWithMostShishinaka(state, sourceUnitId);
    if (maxEnemy) {
        return addShishinakaStacks(state, sourceUnitId, maxEnemy.id, stacksToTransfer);
    }

    // いなければランダムな生存敵へ
    const aliveEnemies = state.registry.getAliveEnemies();
    if (aliveEnemies.length > 0) {
        const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        return addShishinakaStacks(state, sourceUnitId, randomEnemy.id, stacksToTransfer);
    }

    return state;
};

/**
 * 必殺技使用時
 * 啼沢斬り×3回 + 黄泉返り のダメージを手動処理
 */
const onUltimateUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    let acheronUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!acheronUnit) return state;

    // デバッグログ: 関数の開始
    console.log(`[onUltimateUsed] Started, sourceId=${event.sourceId}, targetId=${event.targetId}`);

    let newState = state;

    // 必殺技実行中フラグを設定
    const ultInProgressFlag: IEffect = {
        id: EFFECT_IDS.ULT_IN_PROGRESS(sourceUnitId),
        name: '必殺技実行中',
        category: 'STATUS',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, sourceUnitId, ultInProgressFlag);

    // 残夢消費
    newState = setZanmuStacks(newState, sourceUnitId, 0);

    // 天賦効果: 全耐性ダウン
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const resDown = getLeveledValue(ABILITY_VALUES.talentResDown, talentLevel);

    let enemies = newState.registry.getAliveEnemies();
    enemies.forEach(enemy => {
        const resDownEffect: IEffect = {
            id: EFFECT_IDS.ULT_RES_DOWN(sourceUnitId, enemy.id),
            name: `全耐性-${Math.round(resDown * 100)}%`,
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',  // 必殺技終了時に削除
            duration: -1,
            modifiers: [
                { target: 'physical_res' as StatKey, value: -resDown, type: 'add', source: '黄泉天賦' },
                { target: 'fire_res' as StatKey, value: -resDown, type: 'add', source: '黄泉天賦' },
                { target: 'ice_res' as StatKey, value: -resDown, type: 'add', source: '黄泉天賦' },
                { target: 'lightning_res' as StatKey, value: -resDown, type: 'add', source: '黄泉天賦' },
                { target: 'wind_res' as StatKey, value: -resDown, type: 'add', source: '黄泉天賦' },
                { target: 'quantum_res' as StatKey, value: -resDown, type: 'add', source: '黄泉天賦' },
                { target: 'imaginary_res' as StatKey, value: -resDown, type: 'add', source: '黄泉天賦' },
            ],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, enemy.id, resDownEffect);
    });

    // ダメージ倍率を取得
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const ultValues = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel) as {
        singleTotal: number;
        othersTotal: number;
        teisouFlat: number;
        teisouAoe: number;
        teisouBonus: number;
        yomigaeri: number;
    };

    // 最新のユニット情報を取得
    acheronUnit = newState.registry.get(createUnitId(sourceUnitId))!;
    const atk = acheronUnit.stats.atk;

    // === 啼沢斬り × 3回 ===
    // targetIdがundefinedの場合は、集真赤が最も多い敵または最初の生存敵を選択
    let targetId = event.targetId;
    if (!targetId) {
        const primaryTarget = getEnemyWithMostShishinaka(newState, sourceUnitId);
        if (primaryTarget) {
            targetId = primaryTarget.id;
        } else {
            const aliveEnemies = newState.registry.getAliveEnemies();
            if (aliveEnemies.length > 0) {
                targetId = aliveEnemies[0].id;
            }
        }
    }
    console.log(`[onUltimateUsed] targetId=${targetId}, will execute teisou loop: ${!!targetId}`);

    const ultimateAction = {
        type: 'ULTIMATE' as const,
        sourceId: sourceUnitId,
        targetId: targetId ?? ''
    };

    if (targetId) {
        for (let i = 0; i < 3; i++) {
            console.log(`[onUltimateUsed] Teisou loop iteration ${i + 1}/3`);
            // 最新の状態を取得
            const targetUnit = newState.registry.get(createUnitId(targetId));
            acheronUnit = newState.registry.get(createUnitId(sourceUnitId))!;
            if (!targetUnit || targetUnit.hp <= 0) continue;

            // 1. 単体ダメージ (ATK × Z%)
            const teisouAbility: IAbility = {
                id: `acheron-ult-teisou-${i}`,
                name: `啼沢斬り${i + 1}回目`,
                type: 'Ultimate',
                description: '',
                damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: ultValues.teisouFlat, toughnessReduction: 0 }] }
            };

            const dmgCalcResult1 = calculateDamageWithCritInfo(
                acheronUnit,
                targetUnit,
                teisouAbility,
                ultimateAction
            );
            const result1 = applyUnifiedDamage(
                newState,
                acheronUnit,
                targetUnit,
                dmgCalcResult1.damage,
                {
                    damageType: 'ULTIMATE_DAMAGE',
                    details: `啼沢斬り${i + 1}回目`,
                    skipLog: true,
                    isCrit: dmgCalcResult1.isCrit,
                    breakdownMultipliers: dmgCalcResult1.breakdownMultipliers
                }
            );
            newState = result1.state;

            // ログに記録
            newState = appendPrimaryHit(newState, {
                hitIndex: i * 3,  // 各啼沢斬りの単体ダメージ
                multiplier: ultValues.teisouFlat,
                damage: result1.totalDamage,
                isCrit: result1.isCrit || false,
                targetName: `${targetUnit.name} - 啼沢斬り${i + 1}回目`,
                breakdownMultipliers: result1.breakdownMultipliers
            });

            // 2. 集真赤を最大3層消去
            const { state: afterRemove, removed } = removeShishinakaStacks(newState, sourceUnitId, targetId, 3);
            newState = afterRemove;

            // 3. 集真赤ボーナス単体ダメージ (removed × ATK × Y%)
            if (removed > 0) {
                const bonusMult = ultValues.teisouBonus * removed;
                const bonusAbility: IAbility = {
                    id: `acheron-ult-teisou-bonus-${i}`,
                    name: `啼沢斬り${i + 1}回目ボーナス`,
                    type: 'Ultimate',
                    description: '',
                    damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: bonusMult, toughnessReduction: 0 }] }
                };

                const updatedTarget = newState.registry.get(createUnitId(targetId));
                acheronUnit = newState.registry.get(createUnitId(sourceUnitId))!;
                if (updatedTarget && updatedTarget.hp > 0) {
                    const dmgCalcResult2 = calculateDamageWithCritInfo(
                        acheronUnit,
                        updatedTarget,
                        bonusAbility,
                        ultimateAction
                    );
                    const result2 = applyUnifiedDamage(
                        newState,
                        acheronUnit,
                        updatedTarget,
                        dmgCalcResult2.damage,
                        {
                            damageType: 'ULTIMATE_DAMAGE',
                            details: `啼沢斬り${i + 1}回目 集真赤ボーナス(${removed}層)`,
                            skipLog: true,
                            isCrit: dmgCalcResult2.isCrit,
                            breakdownMultipliers: dmgCalcResult2.breakdownMultipliers
                        }
                    );
                    newState = result2.state;

                    // ログに記録
                    newState = appendPrimaryHit(newState, {
                        hitIndex: i * 3 + 1,  // 集真赤ボーナス
                        multiplier: bonusMult,
                        damage: result2.totalDamage,
                        isCrit: result2.isCrit || false,
                        targetName: `${updatedTarget.name} - 啼沢斬り${i + 1}回目 集真赤ボーナス(${removed}層)`,
                        breakdownMultipliers: result2.breakdownMultipliers
                    });
                }

                // 4. 集真赤ボーナス全体ダメージ (removed × ATK × X%)
                const aoeBonusMult = ultValues.teisouAoe * removed;
                const aoeAbility: IAbility = {
                    id: `acheron-ult-teisou-aoe-${i}`,
                    name: `啼沢斬り${i + 1}回目全体`,
                    type: 'Ultimate',
                    description: '',
                    damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: aoeBonusMult, toughnessReduction: 0 }] }
                };

                enemies = newState.registry.getAliveEnemies();
                for (const enemy of enemies) {
                    acheronUnit = newState.registry.get(createUnitId(sourceUnitId))!;
                    const dmgCalcResult3 = calculateDamageWithCritInfo(
                        acheronUnit,
                        enemy,
                        aoeAbility,
                        ultimateAction
                    );
                    const result3 = applyUnifiedDamage(
                        newState,
                        acheronUnit,
                        enemy,
                        dmgCalcResult3.damage,
                        {
                            damageType: 'ULTIMATE_DAMAGE',
                            details: `啼沢斬り${i + 1}回目 全体追加`,
                            skipLog: true,
                            isCrit: dmgCalcResult3.isCrit,
                            breakdownMultipliers: dmgCalcResult3.breakdownMultipliers
                        }
                    );
                    newState = result3.state;

                    // ログに記録
                    newState = appendPrimaryHit(newState, {
                        hitIndex: i * 3 + 2,  // 全体追加ダメージ
                        multiplier: aoeBonusMult,
                        damage: result3.totalDamage,
                        isCrit: result3.isCrit || false,
                        targetName: `${enemy.name} - 啼沢斬り${i + 1}回目 全体追加`,
                        breakdownMultipliers: result3.breakdownMultipliers
                    });
                }
            }

            // A6: 集真赤持ちの敵に命中時、与ダメ+30%（最大3層、3ターン）
            // 注意: removed > 0 の条件は集真赤を持っていたことを意味する
            if (acheronUnit.traces?.some(t => t.id === TRACE_IDS.A6_RAISHIN) && removed > 0) {
                const a6EffectId = EFFECT_IDS.A6_DMG_BOOST(sourceUnitId);
                const existingA6 = newState.registry.get(createUnitId(sourceUnitId))?.effects.find(e => e.id === a6EffectId);
                const currentA6Stacks = existingA6?.stackCount || 0;
                const newA6Stacks = Math.min(currentA6Stacks + 1, 3);

                if (existingA6) {
                    const updatedA6 = {
                        ...existingA6,
                        stackCount: newA6Stacks,
                        duration: 3,
                        name: `雷心 与ダメ+${newA6Stacks * 30}%`,
                        modifiers: [{
                            target: 'all_type_dmg_boost' as StatKey,
                            value: 0.30 * newA6Stacks,
                            type: 'add' as const,
                            source: '雷心'
                        }]
                    };
                    const updatedEffects = newState.registry.get(createUnitId(sourceUnitId))!.effects.map(
                        e => e.id === a6EffectId ? updatedA6 : e
                    );
                    newState = {
                        ...newState,
                        registry: newState.registry.update(createUnitId(sourceUnitId), u => ({ ...u, effects: updatedEffects }))
                    };
                } else {
                    const a6Buff: IEffect = {
                        id: a6EffectId,
                        name: `雷心 与ダメ+30%`,
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_END_BASED',
                        duration: 3,
                        stackCount: 1,
                        maxStacks: 3,
                        modifiers: [{
                            target: 'all_type_dmg_boost' as StatKey,
                            value: 0.30,
                            type: 'add',
                            source: '雷心'
                        }],
                        apply: (t, s) => s,
                        remove: (t, s) => s
                    };
                    newState = addEffect(newState, sourceUnitId, a6Buff);
                }
            }
        }
    }

    // === 黄泉返り ===
    // 全体ダメージ (ATK × z%)
    // yomigaeriDamage変数は使用せず、倍率を直接使用
    const yomigaeriAbility: IAbility = {
        id: 'acheron-ult-yomigaeri',
        name: '黄泉返り',
        type: 'Ultimate',
        description: '',
        damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: ultValues.yomigaeri, toughnessReduction: 0 }] }
    };

    // アクション定義（ターゲットなし全体攻撃用、sourceIdのみ必須）
    const yomigaeriAction = {
        type: 'ULTIMATE' as const,
        sourceId: sourceUnitId,
        targetId: ''
    };

    enemies = newState.registry.getAliveEnemies();
    for (const enemy of enemies) {
        acheronUnit = newState.registry.get(createUnitId(sourceUnitId))!;
        const dmgCalcResult4 = calculateDamageWithCritInfo(
            acheronUnit,
            enemy,
            yomigaeriAbility,
            yomigaeriAction
        );
        const result4 = applyUnifiedDamage(
            newState,
            acheronUnit,
            enemy,
            dmgCalcResult4.damage,
            {
                damageType: 'ULTIMATE_DAMAGE',
                details: '黄泉返り',
                skipLog: true,
                isCrit: dmgCalcResult4.isCrit,
                breakdownMultipliers: dmgCalcResult4.breakdownMultipliers
            }
        );
        newState = result4.state;

        // ログに記録
        newState = appendPrimaryHit(newState, {
            hitIndex: 9,  // 黄泉返り（啼沢斬り3回×3=9の次）
            multiplier: ultValues.yomigaeri,
            damage: result4.totalDamage,
            isCrit: result4.isCrit || false,
            targetName: `${enemy.name} - 黄泉返り`,
            breakdownMultipliers: result4.breakdownMultipliers
        });
    }

    // 全集真赤クリア
    newState = clearAllShishinaka(newState, sourceUnitId);

    // 全耐性ダウン効果を削除
    const finalEnemies = newState.registry.getAliveEnemies();
    finalEnemies.forEach(enemy => {
        newState = removeEffect(newState, enemy.id, EFFECT_IDS.ULT_RES_DOWN(sourceUnitId, enemy.id));
    });

    // 必殺技実行中フラグを削除
    newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.ULT_IN_PROGRESS(sourceUnitId));

    // A2: 必殺技発動後、残夢+1 + 集真赤+1（四相断我スタックがある場合）
    const shisouDanwaEffect = newState.registry.get(createUnitId(sourceUnitId))?.effects.find(
        e => e.id === EFFECT_IDS.SHISOU_DANWA(sourceUnitId)
    );
    if (shisouDanwaEffect && (shisouDanwaEffect.stackCount || 0) > 0) {
        const stacksToUse = shisouDanwaEffect.stackCount || 0;
        newState = addZanmuStacks(newState, sourceUnitId, stacksToUse);

        // ランダムな敵に集真赤を付与
        const aliveEnemies = newState.registry.getAliveEnemies();
        for (let i = 0; i < stacksToUse && aliveEnemies.length > 0; i++) {
            const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            newState = addShishinakaStacks(newState, sourceUnitId, randomEnemy.id, 1);
        }

        // 四相断我スタックをクリア
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.SHISOU_DANWA(sourceUnitId));
    }

    return newState;
};

// =============================================================================
// ハンドラーファクトリ
// =============================================================================

export const acheronHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    // 1アクションにつき残夢獲得1回のフラグ（アクション完了でリセット）
    let hasGainedZanmuThisAction = false;

    return {
        handlerMetadata: {
            id: `acheron-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_EFFECT_APPLIED',
                'ON_ENEMY_DEFEATED',
                'ON_ACTION_COMPLETE',
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const acheronUnit = state.registry.get(createUnitId(sourceUnitId));
            if (!acheronUnit) return state;

            // Debug: 全イベントログ出力
            if (event.sourceId === sourceUnitId || event.type === 'ON_SKILL_USED' || event.type === 'ON_ACTION_COMPLETE') {
                console.log(`[Acheron Debug] Event=${event.type}, Source=${event.sourceId}, MyID=${sourceUnitId}`);
            }

            // 戦闘開始時
            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            // ターン開始時 (E2)
            if (event.type === 'ON_TURN_START') {
                return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            // スキル使用時
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            // デバフ付与検知（1アクション1回制限）
            if (event.type === 'ON_EFFECT_APPLIED') {
                const result = onEffectApplied(event, state, sourceUnitId, hasGainedZanmuThisAction);
                hasGainedZanmuThisAction = result.gained;
                return result.state;
            }

            // アクション完了時にフラグリセット
            if (event.type === 'ON_ACTION_COMPLETE') {
                hasGainedZanmuThisAction = false;
                return state;
            }

            // 必殺技使用時
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            // 敵退場時
            if (event.type === 'ON_ENEMY_DEFEATED') {
                return onEnemyDefeated(event as EnemyDefeatedEvent, state, sourceUnitId);
            }

            return state;
        }
    };
};
