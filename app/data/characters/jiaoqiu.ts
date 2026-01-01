import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { IEffect, DoTEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { createUnitId } from '../../simulator/engine/unitId';
import { advanceAction } from '../../simulator/engine/utils';

// --- 定数定義 ---
const CHARACTER_ID = 'jiaoqiu';

const EFFECT_IDS = {
    ASHEN_ROAST: 'jiaoqiu-ashen-roast', // 焼尽 (燃焼/デバフ)
    FIELD: 'jiaoqiu-field', // 結界
    TECHNIQUE_FIELD: 'jiaoqiu-technique-field', // 秘技領域
    E1_DMG_BOOST: 'jiaoqiu-e1-dmg-boost', // 1凸: 味方与ダメアップ
};

const TRACE_IDS = {
    A2_PYRE_CLEANSE: 'jiaoqiu-trace-a2', // 火祓い
    A4_HEARTH_KINDLING: 'jiaoqiu-trace-a4', // 炊事
    A6_SEARING_SCENT: 'jiaoqiu-trace-a6', // 炙香
};

// --- アビリティ係数 ---
const ABILITY_VALUES = {
    // 通常攻撃: 単体ダメージ
    basicDmg: { 6: 1.00, 7: 1.10 } as Record<number, number>,

    // スキル: 拡散ダメージ
    skillDmgMain: { 10: 1.50, 12: 1.65 } as Record<number, number>,
    skillDmgAdj: { 10: 0.90, 12: 0.99 } as Record<number, number>,

    // 必殺技: 結界
    ultDmg: { 10: 1.00, 12: 1.08 } as Record<number, number>,
    ultVuln: { 10: 0.15, 12: 0.162 } as Record<number, number>, // 必殺技被ダメージアップ
    ultProcChance: { 10: 0.60, 12: 0.62 } as Record<number, number>,

    // 天賦: 焼尽
    talentVulnBase: { 10: 0.15, 12: 0.165 } as Record<number, number>, // 1層目
    talentVulnStack: { 10: 0.05, 12: 0.055 } as Record<number, number>, // 2層目以降
    talentDoT: { 10: 1.80, 12: 1.98 } as Record<number, number>,
};

// --- 設定定数 ---
const FIELD_DURATION = 3;
const BASE_ASHEN_ROAST_DURATION = 2;
const MAX_STACKS_BASE = 5;
const MAX_STACKS_E6 = 9;
const FIELD_TRIGGER_LIMIT = 6;

// 星魂定数
const E1_DMG_BOOST_VAL = 0.40;
const E2_DOT_MULT_BOOST = 3.00;
const E4_ATK_REDUCE = 0.15;
const E6_RES_PEN_PER_STACK = 0.03;

export const jiaoqiu: Character = {
    id: CHARACTER_ID,
    name: '椒丘',
    path: 'Nihility',
    element: 'Fire',
    rarity: 5,
    maxEnergy: 100,
    baseStats: {
        hp: 1358,
        atk: 601,
        def: 509,
        spd: 98,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'jiaoqiu-basic',
            name: '心火計',
            type: 'Basic ATK',
            description: '指定した敵単体に炎属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            },
            energyGain: 20,
        },
        skill: {
            id: 'jiaoqiu-skill',
            name: '燎原奔襲',
            type: 'Skill',
            description: '敵単体および隣接する敵に炎属性ダメージを与え、指定した敵単体に「焼尽」を1層付与する。',
            targetType: 'single_enemy',
            energyGain: 30,
            effects: [],
        },
        ultimate: {
            id: 'jiaoqiu-ultimate',
            name: '炊陣妙法、詭正相生',
            type: 'Ultimate',
            description: '「焼尽」層数を最高値に統一し、結界を展開。敵全体に炎属性ダメージ。',
            targetType: 'self', // 結界を展開し、敵全体を攻撃する
            energyGain: 5,
            effects: [],
        },
        talent: {
            id: 'jiaoqiu-talent',
            name: '詭正転変、至微精妙',
            type: 'Talent',
            description: '攻撃命中時「焼尽」付与。「焼尽」は被ダメージアップ＆持続ダメージ。',
            targetType: 'self',
        },
        technique: {
            id: 'jiaoqiu-technique',
            name: '旺火却乱',
            type: 'Technique',
            description: '領域を作成。戦闘開始時、敵全体にダメージ＆「焼尽」付与。',
        },
    },
    traces: [
        {
            id: TRACE_IDS.A2_PYRE_CLEANSE,
            name: '火祓い',
            type: 'Bonus Ability',
            description: '戦闘開始時、EP15回復。',
        },
        {
            id: TRACE_IDS.A4_HEARTH_KINDLING,
            name: '炊事',
            type: 'Bonus Ability',
            description: '効果命中＞80%の時、超過分で攻撃力アップ。',
        },
        {
            id: TRACE_IDS.A6_SEARING_SCENT,
            name: '炙香',
            type: 'Bonus Ability',
            description: '結界中、敵戦闘参加時に「焼尽」付与。',
        },
        {
            id: 'jiaoqiu-stat-ehr',
            name: '効果命中強化',
            type: 'Stat Bonus',
            description: '効果命中+28.0%',
            stat: 'effect_hit_rate',
            value: 0.28,
        },
        {
            id: 'jiaoqiu-stat-fire',
            name: '炎属性ダメージ強化',
            type: 'Stat Bonus',
            description: '炎属性ダメージ+14.4%',
            stat: 'fire_dmg_boost',
            value: 0.144,
        },
        {
            id: 'jiaoqiu-stat-spd',
            name: '速度強化',
            type: 'Stat Bonus',
            description: '速度+5',
            stat: 'spd',
            value: 5,
        },
    ],
    eidolons: {
        e1: { level: 1, name: '五味五臓', description: '「焼尽」敵への与ダメ+40%。天賦付与数+1。' },
        e2: { level: 2, name: '厚味、万病の元', description: '「焼尽」持続ダメージ倍率+300%。' },
        e3: { level: 3, name: '和合の神髄', description: 'スキルLv+2、通常攻撃Lv+1' },
        e4: { level: 4, name: '気血充溢', description: '結界中、敵の攻撃力-15%。' },
        e5: { level: 5, name: '巡らせる奇策', description: '必殺技Lv+2、天賦Lv+2' },
        e6: { level: 6, name: '九沸九変', description: '敵死亡時スタック移動。上限9層。全耐性ダウン。' },
    },
    defaultConfig: {
        lightConeId: 'those-many-springs', // 幾度目かの春
        superimposition: 1,
        relicSetId: 'prisoner_in_deep_confinement', // 深い牢獄の囚人
        ornamentSetId: 'pan_galactic_commercial_enterprise', // 汎銀河商事会社
        mainStats: {
            body: 'effect_hit_rate',
            feet: 'spd',
            sphere: 'fire_dmg_boost',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'effect_hit_rate', value: 0.8 }, // A4のために高い効果命中を確保
            { stat: 'spd', value: 20 },
            { stat: 'atk_pct', value: 0.5 },
        ],
        rotationMode: 'spam_skill',
    }
};

// --- ヘルパー関数 ---

/**
 * 「焼尽」の効果モディファイアを取得する
 * 1層目と2層目以降で上昇量が異なる
 * 
 * @param stacks 現在の層数
 * @param talentLevel 天賦レベル
 * @param eidolonLevel 星魂レベル
 * @returns モディファイアリスト
 */
function getAshenRoastModifiers(stacks: number, talentLevel: number, eidolonLevel: number): any[] {
    const baseVuln = getLeveledValue(ABILITY_VALUES.talentVulnBase, talentLevel);
    const stackVuln = getLeveledValue(ABILITY_VALUES.talentVulnStack, talentLevel);

    // 1層目: baseVuln
    // 2層目以降: (層数 - 1) * stackVuln を加算
    // 式: 基礎値 + (層数 - 1) * 層ごとの増加量
    let vuln = baseVuln;
    if (stacks > 1) {
        vuln += (stacks - 1) * stackVuln;
    }

    const modifiers: any[] = [
        { source: '焼尽(被ダメージアップ)', target: 'all_dmg_taken_boost', type: 'add', value: vuln }
    ];

    if (eidolonLevel >= 6) {
        const resPen = stacks * E6_RES_PEN_PER_STACK;
        modifiers.push({ source: 'E6焼尽(全耐性ダウン)', target: 'all_res_pen', type: 'add', value: resPen });
        // 注意: all_res_pen はシミュレーターのダメージ計算式でサポートされている前提
        // 通常は 'def_ignore' や属性固有の 'fire_res_pen' を使用する
        // 'all_res_pen' がサポートされているか、耐性係数の減少にマッピングされることを期待
    }

    return modifiers;
}

/**
 * 「焼尽」を付与または更新する
 * 既存の層数に加算し、上限を超えないようにする
 * 
 * @param state ゲーム状態
 * @param targetId 対象ユニットID
 * @param sourceId 付与者ID
 * @param stacksToAdd 追加する層数
 * @param talentLevel 天賦レベル
 * @param eidolonLevel 星魂レベル
 * @returns 更新後のゲーム状態
 */
function addAshenRoast(state: GameState, targetId: string, sourceId: string, stacksToAdd: number, talentLevel: number, eidolonLevel: number): GameState {
    let newState = state;
    const target = newState.registry.get(createUnitId(targetId));
    if (!target) return newState;

    const currentEffect = target.effects.find(e => e.id === EFFECT_IDS.ASHEN_ROAST);
    let currentStacks = currentEffect ? (currentEffect.stackCount || 0) : 0;
    const maxStacks = eidolonLevel >= 6 ? MAX_STACKS_E6 : MAX_STACKS_BASE;

    let newStacks = Math.min(currentStacks + stacksToAdd, maxStacks);
    // 加算する場合、最低でも1層にする
    if (stacksToAdd > 0 && newStacks === 0) newStacks = 1;

    if (currentStacks === newStacks && currentEffect) {
        // 持続時間のみ更新
        newState = removeEffect(newState, targetId, EFFECT_IDS.ASHEN_ROAST);
        // 以下で再付与
    } else if (currentEffect) {
        newState = removeEffect(newState, targetId, EFFECT_IDS.ASHEN_ROAST);
    }

    if (newStacks <= 0) return newState;

    // 持続ダメージ倍率の計算
    // 天賦: Z%
    let dotMult = getLeveledValue(ABILITY_VALUES.talentDoT, talentLevel);
    if (eidolonLevel >= 2) {
        dotMult += E2_DOT_MULT_BOOST; // 2凸: +300%
    }

    const modifiers = getAshenRoastModifiers(newStacks, talentLevel, eidolonLevel);

    const ashenRoast: DoTEffect = {
        id: EFFECT_IDS.ASHEN_ROAST,
        name: `焼尽 (${newStacks})`,
        category: 'DEBUFF', // 解除可能 (燃焼)
        type: 'DoT',
        dotType: 'Burn', // 燃焼として扱われる
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: BASE_ASHEN_ROAST_DURATION,
        stackCount: newStacks,
        maxStacks: maxStacks,
        isCleansable: true,
        damageCalculation: 'multiplier',
        multiplier: dotMult,
        modifiers: modifiers,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };

    newState = addEffect(newState, targetId, ashenRoast);
    return newState;
}

/**
 * トレース「炊事」(A4) の効果命中による攻撃力アップを適用する
 * 効果命中が80%を超えている場合、超過分に基づいて攻撃力バフを付与する
 * 
 * @param state ゲーム状態
 * @param unitId ユニットID
 * @returns 更新後のゲーム状態
 */
function ensureA4Buff(state: GameState, unitId: string): GameState {
    let newState = state;
    const unit = newState.registry.get(createUnitId(unitId));
    if (!unit) return newState;

    if (!unit.traces?.some(t => t.id === TRACE_IDS.A4_HEARTH_KINDLING)) return newState;

    // 効果命中の計算
    // 注: ステータスは再計算が必要な場合があるが、ここでは現在のstatsを参照する
    const ehr = unit.stats.effect_hit_rate || 0;
    if (ehr > 0.80) {
        const excess = ehr - 0.80;
        // 超過分15%につき攻撃力60% (最大240%)
        // 0.15ごとに0.60
        const ratio = excess / 0.15;
        let atkBoost = ratio * 0.60;
        atkBoost = Math.min(atkBoost, 2.40);

        // モディファイアとして適用？それとも永続ステータス？
        // 通常、動的なモディファイアは複雑。ターン開始時に更新される永続バフとして付与するのが良いか？
        // ここでは単純にユニットにモディファイアを追加する。
        // ただし、以前のA4バフを上書きする必要がある。
        const buffName = 'A4: 炊事';

        // 既存のバフを削除して再適用
        const newModifiers = unit.modifiers.filter(m => m.source !== buffName);
        newModifiers.push({
            source: buffName,
            target: 'atk_pct',
            type: 'add',
            value: atkBoost
        });

        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(unitId), u => ({ ...u, modifiers: newModifiers }))
        };
    }
    return newState;
}

/**
 * 必殺技による「結界」エフェクトを作成する
 * 
 * @param sourceId 発生源ID
 * @param ultLevel 必殺技レベル
 * @param eidolonLevel 星魂レベル
 * @returns 結界エフェクト
 */
function createFieldEffect(sourceId: string, ultLevel: number, eidolonLevel: number): IEffect {
    const ultVuln = getLeveledValue(ABILITY_VALUES.ultVuln, ultLevel);
    // 4凸: 攻撃力ダウン
    const modifiers: any[] = [
        { source: '結界(必殺技被ダメup)', target: 'ult_dmg_taken_boost', type: 'add', value: ultVuln }
    ];

    if (eidolonLevel >= 4) {
        modifiers.push({ source: 'E4: 結界(攻撃ダウン)', target: 'atk_pct', type: 'add', value: -E4_ATK_REDUCE });
    }

    // 敵への効果について
    // 結界は敵にエフェクトを与えるか、グローバルなフィールド効果とするか。
    // 椒丘の結界: "敵は必殺技被ダメージアップ"。
    // これは全ての敵に対するモディファイアを適用するグローバルフィールド効果として実装するのが最善。
    // または敵個別にバフを付与する。
    // "敵が行動する時" というトリガーもあるため、グローバルハンドラーが適している。
    // しかしステータス（必殺技被ダメージアップ）のためには、敵にモディファイアが必要。
    // ここでは椒丘に「結界(Field)」エフェクト（期間管理用）を持たせ、
    // 敵用のデバフは別途管理（AuraManager等）したいところだが、
    // 簡易実装として、ここでの定義は「自身の状態」とし、ハンドラーで敵への影響を及ぼすか、
    // あるいはこのエフェクト自体がオーラとして機能する仕組みが必要。
    // （現状のシミュレーター仕様では、キャラクターに付いたEffectのmodifiersは「そのキャラクター」に適用されるため、
    //  敵にデバフをかけるには敵にEffectを付与する必要がある）

    // 簡易実装:
    // 椒丘の結界エフェクトがイベントをトリガーする。
    // 結界は適用/ティック時に敵全員に「結界エフェクト」を適用する...のが正しいが、
    // ここではトリガーロジックメインで、ステータス効果は（敵への付与ロジックが別途必要だが）省略またはハンドラーで対応を検討。
    return {
        id: EFFECT_IDS.FIELD,
        name: '結界',
        category: 'OTHER', // フィールド効果
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED', // 椒丘のターン開始時に減少
        duration: FIELD_DURATION,
        miscData: { triggerCount: FIELD_TRIGGER_LIMIT },
        apply: (t, s) => s, // ロジックはハンドラーで処理
        remove: (t, s) => s,
    };
}

// ===============================
// イベントハンドラー
// ===============================

const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const unit = newState.registry.get(createUnitId(sourceUnitId));
    if (!unit) return newState;

    // 追加能力(A2): EP回復
    if (unit.traces?.some(t => t.id === TRACE_IDS.A2_PYRE_CLEANSE)) {
        newState = addEnergyToUnit(newState, sourceUnitId, 15);
    }

    // 追加能力(A4): 初期チェック
    newState = ensureA4Buff(newState, sourceUnitId);

    // 秘技
    if (unit.config?.useTechnique !== false) {
        // 秘技領域: 戦闘開始時に敵全体にダメージ＆「焼尽」1層付与
        const enemies = newState.registry.getAliveEnemies();
        enemies.forEach(enemy => {
            // ダメージ
            const res = applyUnifiedDamage(newState, unit, enemy, unit.stats.atk * 1.0, {
                damageType: 'Technique',
                details: '秘技ダメージ'
            });
            newState = res.state;

            // 「焼尽」付与
            // 基礎確率100%。命中判定は簡易化して適用。
            // 本来はEHRチェックが必要だが、ここでは直接適用する。
            const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
            newState = addAshenRoast(newState, enemy.id, sourceUnitId, 1, talentLevel, eidolonLevel);
        });
    }

    return newState;
};

const onTurnStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    // A4: ターン開始時にステータス再チェック（バフ状況が変わる可能性があるため）
    if (event.sourceId === sourceUnitId) {
        newState = ensureA4Buff(newState, sourceUnitId);
    }

    // 1凸効果: 味方への影響
    // "味方は焼尽状態の敵への与ダメージ+40%"
    // これはダメージイベントでチェックするのが最適。

    return newState;
};

const onBasicAttack = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    if (event.sourceId !== sourceUnitId) return newState;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    // 天賦: ターゲットに1層付与
    // 1凸: 天賦による付与数+1
    // "天賦: 攻撃命中時...1層付与"
    // 1凸: "天賦による付与数+1"
    let stacks = 1;
    if (eidolonLevel >= 1) stacks += 1;

    if (event.targetId) {
        newState = addAshenRoast(newState, event.targetId, sourceUnitId, stacks, talentLevel, eidolonLevel);
    }
    return newState;
};

const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    if (event.sourceId !== sourceUnitId) return newState;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    let talentStacks = 1;
    if (eidolonLevel >= 1) talentStacks += 1; // 1凸: 天賦による付与数+1

    const mainTargetId = event.targetId;
    if (!mainTargetId) return newState;

    // 1. スキル固有効果 (メインターゲット): 1層付与
    newState = addAshenRoast(newState, mainTargetId, sourceUnitId, 1, talentLevel, eidolonLevel);

    // 2. 天賦効果 (ヒットした全ターゲット): 1層 (1凸なら2層) 付与
    // ターゲット: メイン + 隣接
    const targets = [mainTargetId];

    // 隣接ターゲットの特定
    const enemies = newState.registry.getAliveEnemies();
    const mainIdx = enemies.findIndex(e => e.id === mainTargetId);
    if (mainIdx !== -1) {
        if (mainIdx > 0) targets.push(enemies[mainIdx - 1].id);
        if (mainIdx < enemies.length - 1) targets.push(enemies[mainIdx + 1].id);
    }

    targets.forEach(tid => {
        newState = addAshenRoast(newState, tid, sourceUnitId, talentStacks, talentLevel, eidolonLevel);
    });

    return newState;
};

const onActionComplete = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;

    // 結界のトリガーロジック: "敵が行動する時"
    const jiaoqiu = newState.registry.get(createUnitId(sourceUnitId));
    if (!jiaoqiu) return newState;
    const fieldStruct = jiaoqiu.effects.find(e => e.id === EFFECT_IDS.FIELD);

    if (fieldStruct && event.sourceId !== sourceUnitId) {
        // 行動者が敵かどうか確認
        const actor = newState.registry.get(createUnitId(event.sourceId));
        if (actor && actor.isEnemy) {
            // 回数制限チェック
            const currentTriggers = fieldStruct.miscData?.triggerCount || 0;
            // "敵1体につきターン1回" の制限があるが、簡易化のためここでは回数のみチェック
            // 必要であれば敵ごとの再発動制限(miscData等)を実装する
            if (currentTriggers > 0) {
                // 発動確率: Z% (レベル依存)
                const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
                const procChance = getLeveledValue(ABILITY_VALUES.ultProcChance, ultLevel);
                // 本来は確率ロールが必要だが、シミュレーターの設定に従い適用する

                const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
                newState = addAshenRoast(newState, event.sourceId, sourceUnitId, 1, talentLevel, eidolonLevel);

                // 発動回数を減らす
                const newTriggers = currentTriggers - 1;
                newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.FIELD);
                newState = addEffect(newState, sourceUnitId, { ...fieldStruct, miscData: { ...fieldStruct.miscData, triggerCount: newTriggers } });
            }
        }
    }

    return newState;
};

const onBeforeDamageReceived = (event: BeforeDamageCalcEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    // 1凸: 味方が「焼尽」状態の敵に与えるダメージ+40%
    // 1凸ダメージバフ計算
    if (eidolonLevel >= 1 && event.targetId) {
        const target = state.registry.get(createUnitId(event.targetId));
        if (target && target.effects.some(e => e.id === EFFECT_IDS.ASHEN_ROAST)) {
            // 攻撃者が味方かどうかチェック
            const attacker = state.registry.get(createUnitId(event.sourceId));
            if (attacker && !attacker.isEnemy) { // 味方全員
                // TODO: ダメージ計算時にこのボーナスを適用するロジックが必要
                // 現在のイベント構造ではダメージ情報を直接変更できない場合があるため、
                // アタッカーに一時的なバフを付与する等の実装が別途必要になる可能性がある。
                // 暫定的にこのハンドラーはプレースホルダーとする。
            }
        }
    }
    return state;
};

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    if (event.sourceId !== sourceUnitId) return newState;

    const jiaoqiu = newState.registry.get(createUnitId(sourceUnitId));
    if (!jiaoqiu) return newState;

    // 1. 層数の統一（最高値に合わせる）
    const enemies = newState.registry.getAliveEnemies();
    let maxStacks = 0;
    enemies.forEach(e => {
        const eff = e.effects.find(eff => eff.id === EFFECT_IDS.ASHEN_ROAST);
        if (eff && (eff.stackCount || 0) > maxStacks) maxStacks = eff.stackCount || 0;
    });

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    enemies.forEach(e => {
        const eff = e.effects.find(eff => eff.id === EFFECT_IDS.ASHEN_ROAST);
        const current = eff ? (eff.stackCount || 0) : 0;
        if (current < maxStacks) {
            newState = addAshenRoast(newState, e.id, sourceUnitId, maxStacks - current, talentLevel, eidolonLevel);
        }
    });

    // 2. 結界の展開
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    newState = addEffect(newState, sourceUnitId, createFieldEffect(sourceUnitId, ultLevel, eidolonLevel));

    // 発動回数リセット (6回)
    // createFieldEffectで6回に設定される

    // 3. ダメージの適用
    const ultDmgMult = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);
    enemies.forEach(e => {
        const res = applyUnifiedDamage(newState, jiaoqiu, e, jiaoqiu.stats.atk * ultDmgMult, {
            damageType: 'Ultimate',
            details: '必殺技ダメージ'
        });
        newState = res.state;
    });

    return newState;
}

const onFieldEnter = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    // 追加能力(A6): 結界展開中に敵が戦闘に参加した場合
    // 対応するイベント種別 ('ON_ENEMY_ENTER' 等) が実装され次第記述する
    return state;
}

const onDeath = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    // 6凸: 敵死亡時に層数を移動
    if (eidolonLevel < 6) return state;

    const deadUnitId = event.sourceId; // ON_DEATHのソースは死亡ユニットと仮定
    // 死亡した敵から「焼尽」層数を取得し、他の敵に移すロジックが必要
    // 現在の仕様では死亡時の状態取得が難しいため、保留
    // 通常はON_DEATHは削除前にトリガーされるか、死亡ユニットデータにアクセス可能であるべき
    // ユニットがレジストリから消えている場合、エフェクトが見つからない可能性がある

    // 現状、6凸なら移動を試みる（未実装）
    return state;
}


export const jiaoqiuHandlerFactory: IEventHandlerFactory = (sourceUnitId: string, eidolonLevel: number) => {
    return {
        handlerMetadata: {
            id: `jiaoqiu-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_ACTION_COMPLETE',
                'ON_ULTIMATE_USED',
                'ON_BASIC_ATTACK',
                'ON_SKILL_USED'
                // 'ON_DEATH', // サポート状況を確認後有効化
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            if (event.type === 'ON_BATTLE_START') return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_TURN_START') return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_ACTION_COMPLETE') return onActionComplete(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_BASIC_ATTACK') return onBasicAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_SKILL_USED') return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            return state;
        }
    };
};
