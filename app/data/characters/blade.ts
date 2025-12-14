import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit } from '../../simulator/engine/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { applyHealing } from '../../simulator/engine/utils';
import { getLeveledValue } from '../../simulator/utils/abilityLevel';
import { calculateHeal } from '../../simulator/damage';

// --- 定数定義 ---
const CHARACTER_ID = 'blade';

// --- E3/E5パターン (非標準) ---
// E3: 必殺技Lv+2, 天賦Lv+2
// E5: スキルLv+2, 通常Lv+1

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 通常攻撃: E5でLv7に上昇
    basicMult: {
        6: 0.50,
        7: 0.55
    } as Record<number, number>,
    // 強化通常攻撃（メイン）: E5でLv7に上昇
    enhancedBasicMain: {
        6: 1.30,
        7: 1.43
    } as Record<number, number>,
    // 強化通常攻撃（隣接）: E5でLv7に上昇
    enhancedBasicAdj: {
        6: 0.52,
        7: 0.572
    } as Record<number, number>,
    // スキル与ダメージアップ: E5でLv12に上昇
    skillDmgBoost: {
        10: 0.40,
        12: 0.456
    } as Record<number, number>,
    // 必殺技HP倍率（メイン）: E3でLv12に上昇
    ultHpMult: {
        10: 1.50,
        12: 1.62
    } as Record<number, number>,
    // 必殺技失HP倍率（メイン）: E3でLv12に上昇
    ultLostHpMult: {
        10: 1.20,
        12: 1.296
    } as Record<number, number>,
    // 必殺技HP倍率（隣接）: E3でLv12に上昇
    ultAdjHpMult: {
        10: 0.60,
        12: 0.648
    } as Record<number, number>,
    // 必殺技失HP倍率（隣接）: E3でLv12に上昇
    ultAdjLostHpMult: {
        10: 0.60,
        12: 0.648
    } as Record<number, number>,
    // 天賦倍率: E3でLv12に上昇
    talentMult: {
        10: 1.30,
        12: 1.43
    } as Record<number, number>,
};

// HP消費
const ENHANCED_BASIC_HP_COST = 0.10; // 10%
const SKILL_HP_COST = 0.30; // 30%
const TECHNIQUE_HP_COST = 0.20; // 20%

// 天賦
const TALENT_HEAL_MULT = 0.25; // HP25%回復
const MAX_CHARGES = 5;
const E6_MAX_CHARGES = 4;

// 秘技
const TECHNIQUE_MULT = 0.40; // HP40%ダメージ

// 必殺技
const ULT_HP_SET = 0.50; // HP50%に固定
const LOST_HP_CAP = 0.90; // 失ったHP累計の上限（最大HP90%）

// 星魂
const E1_LOST_HP_DMG_BOOST = 1.50; // 失HP150%分ダメージアップ
const E2_CRIT_RATE_BOOST = 0.15; // 会心率+15%
const E4_HP_BOOST = 0.20; // HP+20%
const E4_MAX_STACKS = 2;
const E6_TALENT_HP_BONUS = 0.50; // HP50%分追加ダメージ

// 追加能力
const A2_LOST_HP_REMAIN = 0.50; // クリアされる累計値が50%に
const A4_HEAL_BOOST = 0.20; // 回復量+20%
const A4_LOST_HP_ADD = 0.25; // 回復量の25%を失ったHP累計に加算
const A6_TALENT_DMG_BOOST = 0.20; // 天賦ダメージ+20%
const A6_TALENT_EP = 15; // EP+15

// EP回復
const BASIC_EP = 20;
const ENHANCED_BASIC_EP = 30;
const ULT_EP = 5;
const TALENT_EP = 10;

// ヘイト
const HELLSCAPE_AGGRO_MULT = 10; // +1000% = 10倍

export const blade: Character = {
    id: CHARACTER_ID,
    name: '刃',
    path: 'Destruction',
    element: 'Wind',
    rarity: 5,
    maxEnergy: 130,
    baseStats: {
        hp: 1358,
        atk: 543,
        def: 485,
        spd: 97,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100
    },

    abilities: {
        basic: {
            id: 'blade-basic',
            name: '支離剣',
            type: 'Basic ATK',
            description: '指定した敵単体に刃の最大HP50%分の風属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'hp',
                hits: [
                    { multiplier: 0.25, toughnessReduction: 5 },
                    { multiplier: 0.25, toughnessReduction: 5 }
                ],
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'blade-skill',
            name: '地獄変',
            type: 'Skill',
            description: 'HP30%消費。与ダメージ+40%、通常攻撃が強化される。3ターン継続。ターン終了しない。',
            // ダメージなし、自己バフ
            energyGain: 0,
            targetType: 'self',
        },

        ultimate: {
            id: 'blade-ultimate',
            name: '大辟万死',
            type: 'Ultimate',
            description: 'HP50%に固定。敵単体にHP150%+失HP120%、隣接にHP60%+失HP60%ダメージ。',
            damage: {
                type: 'blast',
                scaling: 'hp',
                mainHits: [{ multiplier: 1.50, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: 0.60, toughnessReduction: 10 }],
            },
            energyGain: ULT_EP,
            targetType: 'blast',
        },

        talent: {
            id: 'blade-talent',
            name: '倏忽の恩賜',
            type: 'Talent',
            description: 'ダメージを受ける/HP消費時にチャージ+1。5層で追加攻撃。',
            damage: {
                type: 'aoe',
                scaling: 'hp',
                hits: [
                    { multiplier: 0.429, toughnessReduction: 3.33 },
                    { multiplier: 0.429, toughnessReduction: 3.33 },
                    { multiplier: 0.442, toughnessReduction: 3.34 }
                ],
            },
            energyGain: TALENT_EP,
            targetType: 'all_enemies'
        },

        technique: {
            id: 'blade-technique',
            name: '業途風',
            type: 'Technique',
            description: 'HP20%消費。敵全体にHP40%ダメージ。',
        },

        // 強化通常攻撃（地獄変状態時）
        enhancedBasic: {
            id: 'blade-enhanced-basic',
            name: '無間剣樹',
            type: 'Basic ATK',
            description: 'HP10%消費。敵単体にHP130%、隣接にHP52%の風属性ダメージ。',
            damage: {
                type: 'blast',
                scaling: 'hp',
                mainHits: [{ multiplier: 1.30, toughnessReduction: 15 }],
                adjacentHits: [{ multiplier: 0.52, toughnessReduction: 5 }],
            },
            energyGain: ENHANCED_BASIC_EP,
            targetType: 'blast',
        }
    },

    traces: [
        {
            id: 'blade-trace-a2',
            name: '無尽形寿',
            type: 'Bonus Ability',
            description: '必殺技発動時、クリアされる失ったHP累計値が50%になる。'
        },
        {
            id: 'blade-trace-a4',
            name: '百死耐忍',
            type: 'Bonus Ability',
            description: '回復量+20%。回復後、回復量の25%分を失ったHP累計に加算。'
        },
        {
            id: 'blade-trace-a6',
            name: '壊劫滅亡',
            type: 'Bonus Ability',
            description: '天賦による追加攻撃の与ダメージ+20%、EP+15。'
        },
        {
            id: 'blade-stat-hp',
            name: 'HP',
            type: 'Stat Bonus',
            description: '最大HP+28.0%',
            stat: 'hp_pct',
            value: 0.28
        },
        {
            id: 'blade-stat-crit',
            name: '会心率',
            type: 'Stat Bonus',
            description: '会心率+12.0%',
            stat: 'crit_rate',
            value: 0.12
        },
        {
            id: 'blade-stat-res',
            name: '効果抵抗',
            type: 'Stat Bonus',
            description: '効果抵抗+10.0%',
            stat: 'effect_res',
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '形寿記せし剣身 地獄変の如く',
            description: '強化通常攻撃と必殺技の与ダメージが失ったHP累計150%分アップ。'
        },
        e2: {
            level: 2,
            name: '支離の旧夢 万事が遺恨',
            description: '地獄変状態の時、会心率+15%。'
        },
        e3: {
            level: 3,
            name: '鍛造されし玄鋼 寒光放つ',
            description: '必殺技のLv.+2、天賦のLv.+2。',
            abilityModifiers: [
                // 必殺技Lv12
                { abilityName: 'ultimate', param: 'damage.mainHits.0.multiplier', value: 1.62 },
                { abilityName: 'ultimate', param: 'damage.adjacentHits.0.multiplier', value: 0.648 },
                // 天賦Lv12
                { abilityName: 'talent', param: 'damage.hits.0.multiplier', value: 0.4719 },
                { abilityName: 'talent', param: 'damage.hits.1.multiplier', value: 0.4719 },
                { abilityName: 'talent', param: 'damage.hits.2.multiplier', value: 0.4862 }
            ]
        },
        e4: {
            level: 4,
            name: '冥府の岐路越え 回生せし骸',
            description: 'HP50%超→50%以下になった時、最大HP+20%、最大2層。'
        },
        e5: {
            level: 5,
            name: '十王の大辟 懸かり照らす業鏡',
            description: '戦闘スキルのLv.+2、通常攻撃のLv.+1。',
            abilityModifiers: [
                // スキルLv12は与ダメ45.6%（ハンドラーで処理）
                // 通常攻撃Lv7
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.275 },
                { abilityName: 'basic', param: 'damage.hits.1.multiplier', value: 0.275 }
            ]
        },
        e6: {
            level: 6,
            name: '涸れし魂魄留まりて 此の身に戻る',
            description: 'チャージ上限が4層に。追加攻撃ダメージ+HP50%分。'
        }
    },

    // デフォルト設定
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'cruising-in-the-stellar-sea',
        superimposition: 1,
        relicSetId: 'longevous_disciple',
        ornamentSetId: 'silent_ossuary',
        mainStats: {
            body: 'crit_dmg',
            feet: 'spd',
            sphere: 'wind_dmg_boost',
            rope: 'hp_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.324 },
            { stat: 'crit_dmg', value: 0.648 },
            { stat: 'spd', value: 12 },
            { stat: 'effect_res', value: 0.216 },
        ],
        rotationMode: 'spam_skill',
        spamSkillTriggerSp: 6,
        ultStrategy: 'immediate',
    },
};

// --- ヘルパー関数 ---

// HP消費（HPが足りない場合は1にする）
function consumeHp(state: GameState, unitId: string, hpCostRatio: number, description: string): { state: GameState; consumed: number } {
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return { state, consumed: 0 };

    const maxHp = unit.stats.hp;
    const costAmount = maxHp * hpCostRatio;
    let newHp: number;
    let actualConsumed: number;

    if (unit.hp <= costAmount) {
        // HP不足: HP=1にする
        actualConsumed = unit.hp - 1;
        newHp = 1;
    } else {
        actualConsumed = costAmount;
        newHp = unit.hp - costAmount;
    }

    const newState: GameState = {
        ...state,
        units: state.units.map(u => u.id === unitId ? { ...u, hp: newHp } : u),
        log: [...state.log, {
            characterName: unit.name,
            actionTime: state.time,
            actionType: 'HP消費',
            skillPointsAfterAction: state.skillPoints,
            damageDealt: 0,
            healingDone: 0,
            shieldApplied: 0,
            currentEp: unit.ep,
            details: `${description}: HP ${actualConsumed.toFixed(0)} 消費 (${(hpCostRatio * 100).toFixed(0)}%)`
        } as any]
    };

    return { state: newState, consumed: actualConsumed };
}

// 失ったHP累計を更新
function updateLostHp(state: GameState, unitId: string, amount: number): GameState {
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return state;

    const maxHp = unit.stats.hp;
    const cap = maxHp * LOST_HP_CAP;
    const effectId = `blade-lost-hp-${unitId}`;

    const existingEffect = unit.effects.find(e => e.id === effectId);
    const currentLostHp = (existingEffect as any)?.lostHpAmount || 0;
    const newLostHp = Math.min(currentLostHp + amount, cap);

    if (existingEffect) {
        // 既存エフェクトを更新
        const updatedEffect = { ...existingEffect, lostHpAmount: newLostHp, name: `失ったHP累計 (${(newLostHp / maxHp * 100).toFixed(1)}%)` } as any;
        return {
            ...state,
            units: state.units.map(u => u.id === unitId ? {
                ...u,
                effects: u.effects.map(e => e.id === effectId ? updatedEffect : e)
            } : u)
        };
    } else {
        // 新規エフェクト作成
        const lostHpEffect: IEffect = {
            id: effectId,
            name: `失ったHP累計 (${(newLostHp / maxHp * 100).toFixed(1)}%)`,
            category: 'STATUS',
            sourceUnitId: unitId,
            durationType: 'PERMANENT',
            duration: -1,
            lostHpAmount: newLostHp,
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        } as any;
        return addEffect(state, unitId, lostHpEffect);
    }
}

// 失ったHP累計を取得
function getLostHp(unit: Unit): number {
    const effect = unit.effects.find(e => e.id === `blade-lost-hp-${unit.id}`) as any;
    return effect?.lostHpAmount || 0;
}

// チャージを更新
function updateCharges(state: GameState, unitId: string, delta: number, eidolonLevel: number): GameState {
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return state;

    const maxCharges = eidolonLevel >= 6 ? E6_MAX_CHARGES : MAX_CHARGES;
    const effectId = `blade-charges-${unitId}`;

    const existingEffect = unit.effects.find(e => e.id === effectId);
    const currentCharges = existingEffect?.stackCount || 0;
    const newCharges = Math.min(Math.max(currentCharges + delta, 0), maxCharges);

    if (existingEffect) {
        const updatedEffect = { ...existingEffect, stackCount: newCharges, name: `チャージ (${newCharges}/${maxCharges})` };
        return {
            ...state,
            units: state.units.map(u => u.id === unitId ? {
                ...u,
                effects: u.effects.map(e => e.id === effectId ? updatedEffect : e)
            } : u)
        };
    } else {
        const chargesEffect: IEffect = {
            id: effectId,
            name: `チャージ (${newCharges}/${maxCharges})`,
            category: 'BUFF',
            sourceUnitId: unitId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: newCharges,
            maxStacks: maxCharges,
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        return addEffect(state, unitId, chargesEffect);
    }
}

// チャージを取得
function getCharges(unit: Unit): number {
    const effect = unit.effects.find(e => e.id === `blade-charges-${unit.id}`);
    return effect?.stackCount || 0;
}

// 地獄変状態かどうか
function isInHellscape(unit: Unit): boolean {
    return unit.effects.some(e => e.id === `blade-hellscape-${unit.id}`);
}

// --- ハンドラー関数 ---

// 戦闘開始時: 秘技
const onBattleStart = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const bladeUnit = state.units.find(u => u.id === sourceUnitId);
    if (!bladeUnit) return state;

    let newState = state;

    // チャージエフェクトを初期化
    newState = updateCharges(newState, sourceUnitId, 0, eidolonLevel);

    // A4: 百死耐忍 - 被回復量+20%（永続バフ）
    const hasA4 = bladeUnit.traces?.some(t => t.name === '百死耐忍');
    if (hasA4) {
        const a4HealBuff: IEffect = {
            id: `blade-a4-heal-boost-${sourceUnitId}`,
            name: '百死耐忍（被回復量+20%）',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            modifiers: [{ target: 'incoming_heal_boost' as StatKey, value: A4_HEAL_BOOST, type: 'add', source: 'A4' }],
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, sourceUnitId, a4HealBuff);
    }

    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = bladeUnit.config?.useTechnique !== false;

    if (useTechnique) {
        // 秘技: HP20%消費
        const { state: afterConsume, consumed } = consumeHp(newState, sourceUnitId, TECHNIQUE_HP_COST, '業途風');
        newState = afterConsume;

        // HP消費を失ったHP累計に加算
        newState = updateLostHp(newState, sourceUnitId, consumed);

        // HP消費でチャージ+1
        newState = updateCharges(newState, sourceUnitId, 1, eidolonLevel);

        // 敵全体にダメージ
        const enemies = newState.units.filter(u => u.isEnemy && u.hp > 0);
        const freshBlade = newState.units.find(u => u.id === sourceUnitId)!;
        const techDamage = freshBlade.stats.hp * TECHNIQUE_MULT;

        enemies.forEach(enemy => {
            const freshEnemy = newState.units.find(u => u.id === enemy.id);
            if (!freshEnemy) return;

            const result = applyUnifiedDamage(
                newState,
                freshBlade,
                freshEnemy,
                techDamage,
                {
                    damageType: '秘技',
                    details: '業途風',
                    isKillRecoverEp: true
                }
            );
            newState = result.state;
        });

        // 秘技ログ
        newState = {
            ...newState,
            log: [...newState.log, {
                characterName: bladeUnit.name,
                actionTime: newState.time,
                actionType: '秘技',
                skillPointsAfterAction: newState.skillPoints,
                damageDealt: techDamage * enemies.length,
                healingDone: 0,
                shieldApplied: 0,
                currentEp: 0,
                details: `業途風: 敵全体にHP${(TECHNIQUE_MULT * 100).toFixed(0)}%ダメージ`
            } as any]
        };
    }

    return newState;
};

// スキル使用時: 地獄変状態付与
const onSkillUsed = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const bladeUnit = state.units.find(u => u.id === sourceUnitId);
    if (!bladeUnit) return state;

    // 既に地獄変状態なら何もしない
    if (isInHellscape(bladeUnit)) return state;

    let newState = state;

    // HP30%消費
    const { state: afterConsume, consumed } = consumeHp(newState, sourceUnitId, SKILL_HP_COST, '地獄変');
    newState = afterConsume;

    // HP消費を失ったHP累計に加算
    newState = updateLostHp(newState, sourceUnitId, consumed);

    // HP消費でチャージ+1
    newState = updateCharges(newState, sourceUnitId, 1, eidolonLevel);

    // E5でスキルLv12
    const skillLevel = eidolonLevel >= 5 ? 12 : 10;
    const dmgBoost = getLeveledValue(ABILITY_VALUES.skillDmgBoost, skillLevel);

    // 地獄変状態エフェクト
    const hellscapeEffect: IEffect = {
        id: `blade-hellscape-${sourceUnitId}`,
        name: '地獄変',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_END_BASED',
        duration: 3,
        skipFirstTurnDecrement: true, // 発動ターンのduration減少をスキップ
        modifiers: [
            { target: 'all_type_dmg_boost' as StatKey, value: dmgBoost, type: 'add', source: '地獄変' },
            { target: 'aggro' as StatKey, value: 10.0, type: 'pct', source: '地獄変' } // +1000%
        ],
        tags: ['HELLSCAPE', 'PREVENT_TURN_END', 'SKILL_SILENCE', 'ENHANCED_BASIC'], // スキル使用不可、ターン終了しない、強化通常攻撃を使用
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, sourceUnitId, hellscapeEffect);

    // E2: 地獄変状態で会心率+15%
    if (eidolonLevel >= 2) {
        const e2CritBuff: IEffect = {
            id: `blade-e2-crit-${sourceUnitId}`,
            name: 'E2 会心率 (地獄変)',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: 0,
            linkedEffectId: `blade-hellscape-${sourceUnitId}`,
            modifiers: [{ target: 'crit_rate' as StatKey, value: E2_CRIT_RATE_BOOST, type: 'add', source: 'E2' }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, e2CritBuff);
    }

    // ログ出力はdispatcherで行われるため削除（重複防止）
    /*
    newState = {
        ...newState,
        log: [...newState.log, {
            characterName: bladeUnit.name,
            actionTime: newState.time,
            actionType: 'スキル',
            skillPointsAfterAction: newState.skillPoints,
            damageDealt: 0,
            healingDone: 0,
            shieldApplied: 0,
            currentEp: bladeUnit.ep,
            details: `地獄変: 与ダメージ+${(dmgBoost * 100).toFixed(1)}%、3ターン継続`
        } as any]
    };
    */

    return newState;
};

// 通常攻撃時: チャージ上限チェックのみ
const onBasicAttack = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    // ダメージ計算はパイプラインで処理される
    // ここではチャージ上限チェックのみ行う
    let newState = state;

    const freshBlade = newState.units.find(u => u.id === sourceUnitId)!;
    const maxCharges = eidolonLevel >= 6 ? E6_MAX_CHARGES : MAX_CHARGES;
    if (getCharges(freshBlade) >= maxCharges) {
        // 追加攻撃をトリガー
        newState = {
            ...newState,
            pendingActions: [...newState.pendingActions, {
                type: 'FOLLOW_UP_ATTACK',
                sourceId: sourceUnitId,
                targetId: undefined, // 全体攻撃
                eidolonLevel
            } as any]
        };
    }

    return newState;
};

// 強化通常攻撃時: HP消費、チャージ加算、E4チェック
const onEnhancedBasicAttack = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const bladeUnit = state.units.find(u => u.id === sourceUnitId);
    if (!bladeUnit) return state;

    let newState = state;

    // 1. HP10%消費
    const prevHpRatio = bladeUnit.hp / bladeUnit.stats.hp;
    const { state: afterConsume, consumed } = consumeHp(newState, sourceUnitId, ENHANCED_BASIC_HP_COST, '無間剣樹');
    newState = afterConsume;

    // E4チェック
    newState = checkE4Trigger(newState, sourceUnitId, prevHpRatio, eidolonLevel);

    // HP消費を失ったHP累計に加算
    newState = updateLostHp(newState, sourceUnitId, consumed);

    // HP消費でチャージ+1
    newState = updateCharges(newState, sourceUnitId, 1, eidolonLevel);

    // チャージ上限チェック
    const freshBlade = newState.units.find(u => u.id === sourceUnitId)!;
    const maxCharges = eidolonLevel >= 6 ? E6_MAX_CHARGES : MAX_CHARGES;
    if (getCharges(freshBlade) >= maxCharges) {
        // 追加攻撃をトリガー
        newState = {
            ...newState,
            pendingActions: [...newState.pendingActions, {
                type: 'FOLLOW_UP_ATTACK',
                sourceId: sourceUnitId,
                targetId: undefined, // 全体攻撃
                eidolonLevel
            } as any]
        };
    }

    return newState;
};

// ダメージを受けた時: チャージ+1
const onDamageTaken = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const targetId = (event as any).targetId;
    if (targetId !== sourceUnitId) return state;

    let newState = updateCharges(state, sourceUnitId, 1, eidolonLevel);

    // チャージ上限チェック
    const freshBlade = newState.units.find(u => u.id === sourceUnitId)!;
    const maxCharges = eidolonLevel >= 6 ? E6_MAX_CHARGES : MAX_CHARGES;
    if (getCharges(freshBlade) >= maxCharges) {
        // 追加攻撃をトリガー
        newState = {
            ...newState,
            pendingActions: [...newState.pendingActions, {
                type: 'FOLLOW_UP_ATTACK',
                sourceId: sourceUnitId,
                targetId: undefined,
                eidolonLevel
            } as any]
        };
    }

    return newState;
};

// 追加攻撃: 天賦
const onFollowUpAttack = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const bladeUnit = state.units.find(u => u.id === sourceUnitId);
    if (!bladeUnit) return state;

    let newState = state;

    // E3で天賦Lv12
    const talentLevel = eidolonLevel >= 3 ? 12 : 10;
    let talentMult = getLeveledValue(ABILITY_VALUES.talentMult, talentLevel);

    // A6: 与ダメージ+20%
    const hasA6 = bladeUnit.traces?.some(t => t.name === '壊劫滅亡');
    let dmgBonus = hasA6 ? A6_TALENT_DMG_BOOST : 0;

    // E6: さらにHP50%分追加ダメージ
    const e6Bonus = eidolonLevel >= 6 ? E6_TALENT_HP_BONUS : 0;

    // 敵全体にダメージ
    const enemies = newState.units.filter(u => u.isEnemy && u.hp > 0);
    const baseDamage = bladeUnit.stats.hp * talentMult * (1 + dmgBonus);
    const e6ExtraDamage = bladeUnit.stats.hp * e6Bonus;
    const totalDamage = baseDamage + e6ExtraDamage;

    enemies.forEach(enemy => {
        const freshEnemy = newState.units.find(u => u.id === enemy.id);
        const freshBlade = newState.units.find(u => u.id === sourceUnitId)!;
        if (!freshEnemy) return;

        const result = applyUnifiedDamage(
            newState,
            freshBlade,
            freshEnemy,
            totalDamage,
            {
                damageType: '追加攻撃',
                details: '倏忽の恩賜',
                isKillRecoverEp: true
            }
        );
        newState = result.state;
    });

    // 自己回復 HP25%（calculateHealで回復量ブーストを適用）
    const freshBlade = newState.units.find(u => u.id === sourceUnitId)!;
    const healAmount = calculateHeal(freshBlade, freshBlade, { scaling: 'hp', multiplier: TALENT_HEAL_MULT, flat: 0 });
    newState = applyHealing(newState, sourceUnitId, sourceUnitId, healAmount, '倏忽の恩賜: 自己回復', true);

    // A4: 回復量の25%を失ったHP累計に加算 -> onUnitHealedに移譲
    // const hasA4 = bladeUnit.traces?.some(t => t.name === '百死耐忍');
    // if (hasA4) {
    //     const lostHpAdd = healAmount * A4_LOST_HP_ADD;
    //     newState = updateLostHp(newState, sourceUnitId, lostHpAdd);
    // }

    // EP回復
    let epGain = TALENT_EP;
    if (hasA6) epGain += A6_TALENT_EP;
    newState = addEnergyToUnit(newState, sourceUnitId, epGain);

    // チャージをリセット
    newState = updateCharges(newState, sourceUnitId, -getCharges(freshBlade), eidolonLevel);

    // ログ（最新のEP値を取得）
    const finalBlade = newState.units.find(u => u.id === sourceUnitId)!;
    newState = {
        ...newState,
        log: [...newState.log, {
            characterName: bladeUnit.name,
            actionTime: newState.time,
            actionType: '追加攻撃',
            skillPointsAfterAction: newState.skillPoints,
            damageDealt: totalDamage * enemies.length,
            healingDone: healAmount,
            shieldApplied: 0,
            currentEp: finalBlade.ep,
            details: `倏忽の恩賜: 敵全体にHP${(talentMult * 100).toFixed(0)}%ダメージ、HP${(TALENT_HEAL_MULT * 100).toFixed(0)}%回復`
        } as any]
    };

    return newState;
};

// 必殺技使用時
const onUltimateUsed = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const bladeUnit = state.units.find(u => u.id === sourceUnitId);
    if (!bladeUnit) return state;

    let newState = state;

    // HPを50%に固定
    const maxHp = bladeUnit.stats.hp;
    const targetHp = maxHp * ULT_HP_SET;
    const prevHpRatio = bladeUnit.hp / maxHp;
    const hpChange = bladeUnit.hp - targetHp;

    if (hpChange > 0) {
        // HPが50%超の場合、失ったHPを累計に加算
        newState = updateLostHp(newState, sourceUnitId, hpChange);
    }

    newState = {
        ...newState,
        units: newState.units.map(u => u.id === sourceUnitId ? { ...u, hp: targetHp } : u)
    };

    // E4チェック（HP変動後）
    newState = checkE4Trigger(newState, sourceUnitId, prevHpRatio, eidolonLevel);

    // E3で必殺技Lv12
    const ultLevel = eidolonLevel >= 3 ? 12 : 10;
    const hpMult = getLeveledValue(ABILITY_VALUES.ultHpMult, ultLevel);
    const lostHpMult = getLeveledValue(ABILITY_VALUES.ultLostHpMult, ultLevel);
    const adjHpMult = getLeveledValue(ABILITY_VALUES.ultAdjHpMult, ultLevel);
    const adjLostHpMult = getLeveledValue(ABILITY_VALUES.ultAdjLostHpMult, ultLevel);

    // 失ったHP累計を取得
    const freshBlade = newState.units.find(u => u.id === sourceUnitId)!;
    const lostHp = getLostHp(freshBlade);

    // E1: 失HP150%分ダメージアップ
    const e1Bonus = eidolonLevel >= 1 ? lostHp * E1_LOST_HP_DMG_BOOST : 0;

    // メインダメージ
    const mainDamage = maxHp * hpMult + lostHp * lostHpMult + e1Bonus;
    // 隣接ダメージ
    const adjDamage = maxHp * adjHpMult + lostHp * adjLostHpMult;

    // ターゲット取得
    const targetId = (event as any).targetId;
    const mainTarget = newState.units.find(u => u.id === targetId);
    if (mainTarget) {
        const result = applyUnifiedDamage(
            newState,
            freshBlade,
            mainTarget,
            mainDamage,
            {
                damageType: '必殺技',
                details: '大辟万死 (メイン)',
                isKillRecoverEp: true
            }
        );
        newState = result.state;
    }

    // 隣接ターゲット
    const adjacentIds = (event as any).adjacentIds as string[] | undefined;
    if (adjacentIds) {
        adjacentIds.forEach(adjId => {
            const adjTarget = newState.units.find(u => u.id === adjId);
            const freshBlade2 = newState.units.find(u => u.id === sourceUnitId)!;
            if (!adjTarget) return;

            const result = applyUnifiedDamage(
                newState,
                freshBlade2,
                adjTarget,
                adjDamage,
                {
                    damageType: '必殺技',
                    details: '大辟万死 (隣接)',
                    isKillRecoverEp: false
                }
            );
            newState = result.state;
        });
    }

    // 失ったHP累計をリセット（A2: 50%残留）
    const hasA2 = bladeUnit.traces?.some(t => t.name === '無尽形寿');
    const remainRatio = hasA2 ? A2_LOST_HP_REMAIN : 0;
    const remainLostHp = lostHp * remainRatio;

    // 失ったHP累計を更新
    const lostHpEffectId = `blade-lost-hp-${sourceUnitId}`;
    newState = removeEffect(newState, sourceUnitId, lostHpEffectId);
    if (remainLostHp > 0) {
        newState = updateLostHp(newState, sourceUnitId, remainLostHp);
    }

    return newState;
};

// E4: HP50%超→50%以下になった時
const checkE4Trigger = (state: GameState, sourceUnitId: string, prevHpRatio: number, eidolonLevel: number): GameState => {
    if (eidolonLevel < 4) return state;

    const bladeUnit = state.units.find(u => u.id === sourceUnitId);
    if (!bladeUnit) return state;

    const currentHpRatio = bladeUnit.hp / bladeUnit.stats.hp;

    // HP50%超から50%以下になった場合
    if (prevHpRatio > 0.5 && currentHpRatio <= 0.5) {
        const e4EffectId = `blade-e4-hpboost-${sourceUnitId}`;
        const existingEffect = bladeUnit.effects.find(e => e.id === e4EffectId);
        const currentStacks = existingEffect?.stackCount || 0;

        if (currentStacks < E4_MAX_STACKS) {
            let newState = state;
            if (existingEffect) {
                // スタック増加
                const updatedEffect = { ...existingEffect, stackCount: currentStacks + 1, name: `E4 HP+20% (${currentStacks + 1}層)` };
                newState = {
                    ...newState,
                    units: newState.units.map(u => u.id === sourceUnitId ? {
                        ...u,
                        effects: u.effects.map(e => e.id === e4EffectId ? updatedEffect : e)
                    } : u)
                };
            } else {
                // 新規作成
                const e4Effect: IEffect = {
                    id: e4EffectId,
                    name: `E4 HP+20% (1層)`,
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    maxStacks: E4_MAX_STACKS,
                    modifiers: [{ target: 'hp_pct' as StatKey, value: E4_HP_BOOST, type: 'add', source: 'E4' }],
                    apply: (t, s) => s,
                    remove: (t, s) => s
                };
                newState = addEffect(newState, sourceUnitId, e4Effect);
            }
            return newState;
        }
    }

    return state;
};

// A4: 回復を受けた時
const onUnitHealed = (event: IEvent, state: GameState, sourceUnitId: string): GameState => {
    // 自分が回復を受けた場合
    const targetId = (event as any).targetId;
    if (targetId !== sourceUnitId) return state;

    const bladeUnit = state.units.find(u => u.id === sourceUnitId);
    if (!bladeUnit) return state;

    // A4: 回復量の25%を失ったHP累計に加算
    const hasA4 = bladeUnit.traces?.some(t => t.name === '百死耐忍');
    if (hasA4) {
        const healAmount = event.healingDone || event.value || 0;
        if (healAmount > 0) {
            const lostHpAdd = healAmount * A4_LOST_HP_ADD;
            return updateLostHp(state, sourceUnitId, lostHpAdd);
        }
    }

    return state;
};

// --- ハンドラーファクトリ ---
export const bladeHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    return {
        handlerMetadata: {
            id: `blade-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_SKILL_USED',
                'ON_BASIC_ATTACK',
                'ON_ENHANCED_BASIC_ATTACK', // 強化通常攻撃
                'ON_DAMAGE_DEALT', // ダメージを受けた時（targetIdチェック）
                'ON_FOLLOW_UP_ATTACK',
                'ON_ULTIMATE_USED',
                'ON_UNIT_HEALED' // A4: 回復を受けた時
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const bladeUnit = state.units.find(u => u.id === sourceUnitId);
            if (!bladeUnit) return state;

            // 戦闘開始時: 秘技
            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, state, sourceUnitId, eidolonLevel);
            }

            // スキル使用時: 地獄変
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                return onSkillUsed(event, state, sourceUnitId, eidolonLevel);
            }

            // 通常攻撃後
            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                return onBasicAttack(event, state, sourceUnitId, eidolonLevel);
            }

            // 強化通常攻撃時
            if (event.type === 'ON_ENHANCED_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                return onEnhancedBasicAttack(event, state, sourceUnitId, eidolonLevel);
            }

            // ダメージを受けた時（自分がターゲット）
            if (event.type === 'ON_DAMAGE_DEALT') {
                const targetId = (event as any).targetId;
                if (targetId === sourceUnitId) {
                    return onDamageTaken(event, state, sourceUnitId, eidolonLevel);
                }
            }

            // 追加攻撃
            if (event.type === 'ON_FOLLOW_UP_ATTACK' && event.sourceId === sourceUnitId) {
                return onFollowUpAttack(event, state, sourceUnitId, eidolonLevel);
            }

            // 必殺技
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event, state, sourceUnitId, eidolonLevel);
            }

            // A4: 回復を受けた時
            if (event.type === 'ON_UNIT_HEALED') {
                const targetId = (event as any).targetId;
                if (targetId === sourceUnitId) {
                    return onUnitHealed(event, state, sourceUnitId);
                }
            }

            return state;
        }
    };
};
