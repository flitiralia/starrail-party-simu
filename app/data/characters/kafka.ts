import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, DoTDamageEvent, EnemyDefeatedEvent, IAura, FollowUpAttackAction } from '../../simulator/engine/types';
import { SimulationLogEntry } from '../../types';

import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { addAura } from '../../simulator/engine/auraManager';
import { IEffect } from '../../simulator/effect/types';
import { recalculateUnitStats } from '../../simulator/statBuilder';
import { createCharacterShockEffect } from '../../simulator/effect/breakEffects';
import { calculateNormalDoTDamageWithBreakdown } from '../../simulator/damage';
import { applyUnifiedDamage, appendAdditionalDamage, checkDebuffSuccess } from '../../simulator/engine/dispatcher';
// 星魂対応ユーティリティ
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';

// --- 内部型定義 ---
interface DoTEffect extends IEffect {
    dotType?: string; // 'Shock', 'Bleed', etc. for legacy or new system
    damageCalculation?: 'multiplier' | 'fixed';
    multiplier?: number;
    baseDamage?: number;
}

// --- 定数定義 ---


const EFFECT_IDS = {
    TALENT_CHARGES: (sourceId: string) => `kafka-talent-charges-${sourceId}`,
    E2_AURA: (sourceId: string) => `kafka-e2-aura-${sourceId}`,
    TORTURE_BUFF: (sourceId: string, targetId: string) => `kafka-torture-buff-${sourceId}-${targetId}`,
    E1_DOT_VULN: (sourceId: string, targetId: string) => `kafka-e1-dotvuln-${sourceId}-${targetId}`,
} as const;

const TRACE_IDS = {
    TORTURE: 'kafka-trace-torture',
    PLUNDER: 'kafka-trace-plunder',
    THORNS: 'kafka-trace-thorns',
} as const;

// 必殺技
const ULT_DETONATE_MULT = 1.2;

// 天賦
const TALENT_DETONATE_MULT = 0.80; // いばら

// 秘技
const TECHNIQUE_DMG_MULT = 0.5;
const SKILL_ADJ_DETONATE_MULT = 0.50; // 隣接ターゲットDoT起爆倍率

// E2
const E2_DOT_BOOST = 0.33;

// 略奪
const PLUNDER_EP_RECOVERY = 5;

// 感電 (E6)
const E6_SHOCK_MULT_BONUS = 1.56;
const BASE_SHOCK_DURATION = 2;
// E3: スキルLv+2, 通常Lv+1
// E5: 必殺技Lv+2, 天賦Lv+2 → 感電倍率は必殺技の効果なのでE5でLv12

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 感電倍率: E5で必殺技Lv12に上昇
    shockMultiplier: {
        10: 2.9,
        12: 3.18
    } as Record<number, number>,
};

// スキル
const SKILL_DETONATE_MULT = 0.75;

const E6_SHOCK_DURATION = 3;

// スタック
const MAX_TALENT_CHARGES = 2;



export const kafka: Character = {
    id: 'kafka',
    name: 'カフカ',
    path: 'Nihility',
    element: 'Lightning',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1086,
        atk: 679,
        def: 485,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100
    },

    abilities: {
        basic: {
            id: 'kafka-basic',
            name: '止まない夜の喧騒',
            type: 'Basic ATK',
            description: '指定した敵単体にカフカの攻撃力の100%分の雷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.5, toughnessReduction: 5 },
                    { multiplier: 0.5, toughnessReduction: 5 }
                ],
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'kafka-skill',
            name: '月明かりが撫でる連綿',
            type: 'Skill',
            description: '指定した敵単体にカフカの攻撃力の160%分の雷属性ダメージを与え、隣接する敵にカフカの攻撃力の60%分の雷属性ダメージを与える。DoT状態の敵には全DoTを起爆。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [
                    { multiplier: 0.32, toughnessReduction: 5 },
                    { multiplier: 0.48, toughnessReduction: 5 },
                    { multiplier: 0.80, toughnessReduction: 10 }
                ],
                adjacentHits: [{ multiplier: 0.60, toughnessReduction: 10 }],
            },
            energyGain: 30,
            targetType: 'blast',
        },

        ultimate: {
            id: 'kafka-ultimate',
            name: '悲劇最果ての顫音',
            type: 'Ultimate',
            description: '敵全体にカフカの攻撃力の80%分の雷属性ダメージを与え、感電状態にし、DoTを起爆。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 0.8, toughnessReduction: 20 }],
            },
            energyGain: 5,
            targetType: 'all_enemies'
            // 感電付与はイベントハンドラで処理（type='DoT'形式）
        },

        talent: {
            id: 'kafka-talent',
            name: '優しさもまた残酷',
            type: 'Talent',
            description: '味方が通常攻撃を行った後、追加攻撃を発動（1ターンに1回）。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.21, toughnessReduction: 0.9 },
                    { multiplier: 0.21, toughnessReduction: 0.9 },
                    { multiplier: 0.21, toughnessReduction: 0.9 },
                    { multiplier: 0.21, toughnessReduction: 0.9 },
                    { multiplier: 0.21, toughnessReduction: 0.9 },
                    { multiplier: 0.35, toughnessReduction: 1.5 }
                ],
            },
            energyGain: 10,
            targetType: 'single_enemy'
            // 感電付与はイベントハンドラで処理（type='DoT'形式）
        },

        technique: {
            id: 'kafka-technique',
            name: '許しは慈悲に非ず',
            type: 'Technique',
            description: '戦闘開始時、敵全体にダメージを与え感電状態にする。',
        }
    },

    traces: [
        {
            id: 'kafka-trace-torture',
            name: '苛み',
            type: 'Bonus Ability',
            description: '味方の効果命中が75%以上の場合、その味方の攻撃力を100%アップさせる。'
        },
        {
            id: 'kafka-trace-plunder',
            name: '略奪',
            type: 'Bonus Ability',
            description: '感電状態の敵が倒された時、カフカはさらにEPを5回復する。'
        },
        {
            id: 'kafka-trace-thorns',
            name: 'いばら',
            type: 'Bonus Ability',
            description: '必殺技を発動した後、天賦による追加攻撃の発動可能回数を1回復する。天賦による追加攻撃を行うと、ターゲット付与されたすべての持続ダメージ系デバフが、即座に本来のダメージ80%分のダメージを発生させる。'
        },
        {
            id: 'kafka-stat-atk',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct',
            value: 0.28
        },
        {
            id: 'kafka-stat-hit',
            name: '効果命中',
            type: 'Stat Bonus',
            description: '効果命中+18.0%',
            stat: 'effect_hit_rate',
            value: 0.18
        },
        {
            id: 'kafka-stat-hp',
            name: 'HP',
            type: 'Stat Bonus',
            description: 'HP+10.0%',
            stat: 'hp_pct',
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '無窮に動く！',
            description: '天賦による追加攻撃を行う時、100%の基礎確率でターゲットの受ける持続ダメージ+30%、2ターン継続。'
        },
        e2: {
            level: 2,
            name: '狂想者の嗚咽',
            description: 'カフカがフィールド上にいる時、味方全体の持続ダメージ+33%。'
        },
        e3: {
            level: 3,
            name: '悲しき望郷の歌',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // スキル: 176% (32:48:80の比率で分散)
                { abilityName: 'skill', param: 'damage.mainHits.0.multiplier', value: 0.352 },
                { abilityName: 'skill', param: 'damage.mainHits.1.multiplier', value: 0.528 },
                { abilityName: 'skill', param: 'damage.mainHits.2.multiplier', value: 0.88 },
                { abilityName: 'skill', param: 'damage.adjacentHits.0.multiplier', value: 0.66 },
                // 通常: 110%
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.55 },
                { abilityName: 'basic', param: 'damage.hits.1.multiplier', value: 0.55 }
            ]
        },
        e4: {
            level: 4,
            name: 'この叙唱を',
            description: 'カフカが敵に付与した感電状態がダメージが発生する時、カフカのEPをさらに2回復する。'
        },
        e5: {
            level: 5,
            name: '響く愁緒の囁き',
            description: '必殺技のLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                // 必殺: 86%
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 0.86 },
                // 天賦: 159% (21:21:21:21:21:35の比率で分散)
                { abilityName: 'talent', param: 'damage.hits.0.multiplier', value: 0.238 },
                { abilityName: 'talent', param: 'damage.hits.1.multiplier', value: 0.238 },
                { abilityName: 'talent', param: 'damage.hits.2.multiplier', value: 0.238 },
                { abilityName: 'talent', param: 'damage.hits.3.multiplier', value: 0.238 },
                { abilityName: 'talent', param: 'damage.hits.4.multiplier', value: 0.238 },
                { abilityName: 'talent', param: 'damage.hits.5.multiplier', value: 0.4 }
            ]
        },
        e6: {
            level: 6,
            name: '回る、静かに',
            description: '必殺技、秘技、天賦による追加攻撃が敵に付与する感電状態のダメージ倍率+156%、感電状態の継続時間+1ターン。'
        }
    },

    defaultConfig: {
        lightConeId: 'patience-is-all-you-need',
        superimposition: 1,
        relicSetId: 'prisoner_in_deep_confinement',
        ornamentSetId: 'space_sealing_station',
        mainStats: {
            body: 'atk_pct',
            feet: 'spd',
            sphere: 'lightning_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'spd', value: 6 },
            { stat: 'effect_hit_rate', value: 0.20 },
            { stat: 'break_effect', value: 0.20 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// DoT起爆関数（ターン数は減少させない）
function detonateDoTs(
    state: GameState,
    targetId: string,
    detonateMultiplier: number,
    sourceId: string
): { state: GameState; totalDamage: number } {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return { state, totalDamage: 0 };

    const sourceUnit = state.registry.get(createUnitId(sourceId));
    if (!sourceUnit) return { state, totalDamage: 0 };

    let totalDamage = 0;
    let dotCount = 0;

    // 全てのDoTエフェクトを検索してダメージを合計
    target.effects.forEach(effect => {
        // DoT系のエフェクトタイプをチェック
        const dotEffect = effect as DoTEffect;
        const type = dotEffect.type || dotEffect.dotType; // Fallback for legacy

        if (type === 'DoT' || type === 'Shock' || type === 'Bleed' || type === 'Burn' || type === 'Wind Shear') {

            dotCount++;
            // console.log(`[detonateDoTs] Processing DoT #${dotCount}: ${effect.name}, ID: ${effect.id}`); // Removed verbose log

            // DoTの基礎ダメージを取得
            let baseDamage = 0;
            if (type === 'DoT') {
                // 新システム: 計算タイプに応じて処理
                if (dotEffect.damageCalculation === 'multiplier') {
                    // キャラクターDoT: 倍率 × 現在のATK
                    const multiplier = dotEffect.multiplier || 0;
                    baseDamage = sourceUnit.stats.atk * multiplier;
                } else {
                    // 弱点撃破DoT: 固定ダメージ
                    baseDamage = dotEffect.baseDamage || 0;
                }
            } else {
                // 旧システム（互換性）: baseDamageを直接使用
                baseDamage = dotEffect.baseDamage || 0;
            }

            // ★calculateNormalDoTDamageWithBreakdownを使用
            const dotResult = calculateNormalDoTDamageWithBreakdown(sourceUnit, target, baseDamage);
            const dotDamage = dotResult.damage;

            // 起爆倍率を適用
            const detonateDamage = dotDamage * detonateMultiplier;
            totalDamage += detonateDamage;

            // ★ ターン数は減少させない
        }
    });

    console.log(`[detonateDoTs] Total DoT count: ${dotCount}, totalDamage: ${totalDamage.toFixed(2)}`);

    // ★applyUnifiedDamageを使用してダメージを適用
    if (totalDamage > 0) {
        // breakdownを後で使用するために、DoT起爆全体のbreakdownを計算
        const overallBreakdown = calculateNormalDoTDamageWithBreakdown(
            sourceUnit,
            state.registry.get(createUnitId(targetId))!,
            totalDamage / (1 + (sourceUnit.stats.lightning_dmg_boost || 0) + (sourceUnit.stats.all_type_dmg_boost || 0) + (sourceUnit.stats.dot_dmg_boost || 0))
        );

        const result = applyUnifiedDamage(
            state,
            sourceUnit,
            state.registry.get(createUnitId(targetId))!,
            totalDamage,
            {
                damageType: 'DoT起爆',
                details: `DoT起爆 (${(detonateMultiplier * 100).toFixed(0)}%)`,
                skipLog: true,   // ★独立ログを出さない
                skipStats: false // 統計は更新
            }
        );

        // ★ additionalDamageとしてログに追加（breakdownMultipliers付き）
        let newState = result.state;
        newState = appendAdditionalDamage(newState, {
            source: sourceUnit.name,
            name: `DoT起爆 (${(detonateMultiplier * 100).toFixed(0)}%)`,
            damage: totalDamage,
            target: state.registry.get(createUnitId(targetId))!.name,
            damageType: 'dot',
            isCrit: false,
            breakdownMultipliers: {
                baseDmg: totalDamage / (overallBreakdown.breakdownMultipliers?.dmgBoostMult || 1) / (overallBreakdown.breakdownMultipliers?.defMult || 1) / (overallBreakdown.breakdownMultipliers?.resMult || 1) / (overallBreakdown.breakdownMultipliers?.vulnMult || 1) / (overallBreakdown.breakdownMultipliers?.brokenMult || 1),
                critMult: 1.0,
                dmgBoostMult: overallBreakdown.breakdownMultipliers?.dmgBoostMult || 1,
                defMult: overallBreakdown.breakdownMultipliers?.defMult || 1,
                resMult: overallBreakdown.breakdownMultipliers?.resMult || 1,
                vulnMult: overallBreakdown.breakdownMultipliers?.vulnMult || 1,
                brokenMult: overallBreakdown.breakdownMultipliers?.brokenMult || 1
            }
        });

        return { state: newState, totalDamage };
    }

    return { state, totalDamage: 0 };
}

// --- 分離されたハンドラー関数 ---

// 1. 戦闘開始時: 秘技 + 天賦チャージ + 苛み
const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const kafkaUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!kafkaUnit) return state;

    let newState = state;
    const enemies = newState.registry.getAliveEnemies();

    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = kafkaUnit.config?.useTechnique !== false;

    if (useTechnique) {
        // 秘技: 敵全体に感電を付与
        enemies.forEach(enemy => {
            // E5で必殺技Lv+2 → calculateAbilityLevelを使用
            const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
            let multiplier = getLeveledValue(ABILITY_VALUES.shockMultiplier, ultLevel);
            if (eidolonLevel >= 6) multiplier += E6_SHOCK_MULT_BONUS;
            const duration = eidolonLevel >= 6 ? E6_SHOCK_DURATION : BASE_SHOCK_DURATION;

            const shockEffect = createCharacterShockEffect(kafkaUnit, enemy, multiplier, duration);
            newState = addEffect(newState, enemy.id, shockEffect);
        });

        // 秘技ダメージ（applyUnifiedDamageを使用）
        enemies.forEach(enemy => {
            const freshEnemy = newState.registry.get(createUnitId(enemy.id));
            const freshKafka = newState.registry.get(createUnitId(sourceUnitId));
            if (!freshEnemy || !freshKafka) return;

            const techDamage = freshKafka.stats.atk * TECHNIQUE_DMG_MULT;
            const result = applyUnifiedDamage(
                newState,
                freshKafka,
                freshEnemy,
                techDamage,
                {
                    damageType: '秘技',
                    details: '許しは慈悲に非ず',
                    isKillRecoverEp: true
                }
            );
            newState = result.state;
        });
    }

    // 天賦追加攻撃チャージを作成 (これは秘技ではなく天賦なので常に発動)
    const talentCharges: IEffect = {
        id: EFFECT_IDS.TALENT_CHARGES(sourceUnitId),
        name: `追加攻撃 (${MAX_TALENT_CHARGES}回)`,
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: MAX_TALENT_CHARGES,
        maxStacks: MAX_TALENT_CHARGES,
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s,
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, talentCharges);

    // 苛み: 戦闘開始時に効果命中75%以上の味方にATKバフ (これも秘技ではなく軌跡なので常に発動)
    if (kafkaUnit.traces?.some(t => t.id === TRACE_IDS.TORTURE)) {
        newState = applyTortureBuffs(newState, sourceUnitId);
    }

    // E2: 味方全体の持続ダメージ+33% (オーラシステムで実装)
    // カフカがフィールド上にいる間のみ有効、死亡時に自動削除される
    if (eidolonLevel >= 2) {
        const e2Aura: IAura = {
            id: EFFECT_IDS.E2_AURA(sourceUnitId),
            name: '狂想者の嗚咽 (DoT+33%)',
            sourceUnitId: createUnitId(sourceUnitId),
            target: 'all_allies',
            modifiers: [{
                target: 'dot_dmg_boost' as StatKey,
                value: E2_DOT_BOOST,
                type: 'add',
                source: 'カフカE2'
            }]
        };
        newState = addAura(newState, e2Aura);
    }

    return newState;
};

// 2. スタック増加ヘルパー関数
// 2. スタック増加ヘルパー関数
const increaseTalentCharges = (state: GameState, sourceUnitId: string): GameState => {
    const currentKafka = state.registry.get(createUnitId(sourceUnitId));
    if (!currentKafka) return state;

    const talentCharges = currentKafka.effects.find(e => e.id === EFFECT_IDS.TALENT_CHARGES(sourceUnitId));
    if (!talentCharges) return state;

    const newStackCount = Math.min((talentCharges.stackCount || 0) + 1, MAX_TALENT_CHARGES);
    const updatedEffect = { ...talentCharges, stackCount: newStackCount, name: `追加攻撃 (${newStackCount}回)` };

    // updateUnitでエフェクトを更新
    const updatedEffects = currentKafka.effects.map(e => e.id === talentCharges.id ? updatedEffect : e);
    return {
        ...state,
        registry: state.registry.update(createUnitId(sourceUnitId), u => ({ ...u, effects: updatedEffects }))
    };
};

// 2.5 苛みバフ適用ヘルパー関数（動的更新対応）
const applyTortureBuffs = (state: GameState, sourceUnitId: string): GameState => {
    let newState = state;
    const allies = newState.registry.getAliveAllies();

    allies.forEach(ally => {
        // 最新のステータスを計算して効果命中判定に使用
        const currentStats = recalculateUnitStats(ally, newState.registry.toArray());
        const effectHit = currentStats.effect_hit_rate || 0;
        const buffId = EFFECT_IDS.TORTURE_BUFF(sourceUnitId, ally.id);
        const hasBuff = ally.effects.some(e => e.id === buffId);

        if (effectHit >= 0.75 && !hasBuff) {
            // 効果命中75%以上でバフがない場合、付与
            const tortureBuff: IEffect = {
                id: buffId,
                name: '苛み (ATK+100%)',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{ target: 'atk_pct' as StatKey, value: 1.0, type: 'add', source: '苛み' }],
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            newState = addEffect(newState, ally.id, tortureBuff);
        } else if (effectHit < 0.75 && hasBuff) {
            // 効果命中が75%未満になった場合、バフを削除
            newState = removeEffect(newState, ally.id, buffId);
        }
    });

    return newState;
};

// 2.6 ターン終了時: 天賦スタック+1回復
const onTurnEnd = (event: GeneralEvent, state: GameState, sourceUnitId: string): GameState => {
    // カフカのターン終了時のみ
    if (event.sourceId !== sourceUnitId) return state;

    return increaseTalentCharges(state, sourceUnitId);
};

// 3. 感電付与ヘルパー関数
const applyShockToEnemy = (state: GameState, source: Unit, target: Unit, eidolonLevel: number): GameState => {
    // 効果命中/抵抗判定（100%基礎確率）
    if (!checkDebuffSuccess(source, target, 1.0, 'Shock')) {
        return state;
    }

    // E5で必殺技Lv+2 → calculateAbilityLevelを使用
    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
    let multiplier = getLeveledValue(ABILITY_VALUES.shockMultiplier, ultLevel);
    if (eidolonLevel >= 6) multiplier += E6_SHOCK_MULT_BONUS;
    const duration = eidolonLevel >= 6 ? E6_SHOCK_DURATION : BASE_SHOCK_DURATION;

    const shockEffect = createCharacterShockEffect(source, target, multiplier, duration);
    return addEffect(state, target.id, shockEffect);
};

// 4. スキル使用時: DoT起爆（メイン75%、隣接50%）
const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string): GameState => {
    let newState = state;

    // メインターゲットDoT起爆（75%）
    const targetId = event.targetId;
    if (targetId) {
        const { state: afterDetonate } = detonateDoTs(newState, targetId, SKILL_DETONATE_MULT, sourceUnitId);
        newState = afterDetonate;
    }

    // 隣接ターゲットDoT起爆（50%）
    const adjacentIds = event.adjacentIds;
    if (adjacentIds && adjacentIds.length > 0) {
        adjacentIds.forEach(adjId => {
            const { state: afterAdjDetonate } = detonateDoTs(newState, adjId, SKILL_ADJ_DETONATE_MULT, sourceUnitId);
            newState = afterAdjDetonate;
        });
    }

    return newState;
};

// 5. 必殺技使用時: 感電付与、DoT起爆、いばら
const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const kafkaUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!kafkaUnit) return state;

    let newState = state;
    const enemies = newState.registry.getAliveEnemies();

    // 1. 敵全体に感電を付与
    enemies.forEach(enemy => {
        newState = applyShockToEnemy(newState, kafkaUnit, enemy, eidolonLevel);
    });

    // 2. 敵全体にDoT起爆（120%）
    enemies.forEach(enemy => {
        const { state: afterDetonate } = detonateDoTs(newState, enemy.id, ULT_DETONATE_MULT, sourceUnitId);
        newState = afterDetonate;
    });

    // 3. いばら: 天賦回数を+1
    if (kafkaUnit.traces?.some(t => t.id === TRACE_IDS.THORNS)) {
        newState = increaseTalentCharges(newState, sourceUnitId);
    }

    return newState;
};

// 6. ダメージ発生時: 味方攻撃時に天賦追加攻撃をトリガー
const onDamageDealt = (event: ActionEvent, state: GameState, sourceUnitId: string): GameState => {
    const sourceUnit = state.registry.get(createUnitId(event.sourceId));
    if (!sourceUnit || sourceUnit.isEnemy || event.sourceId === sourceUnitId) return state;

    const currentKafka = state.registry.get(createUnitId(sourceUnitId));
    if (!currentKafka) return state;

    const talentCharges = currentKafka.effects.find(e => e.id === EFFECT_IDS.TALENT_CHARGES(sourceUnitId));
    if (!talentCharges || (talentCharges.stackCount || 0) <= 0) return state;

    const targetId = event.targetId;
    if (!targetId) return state;

    // スタック数を減らす
    const newStackCount = (talentCharges.stackCount || 0) - 1;
    const updatedEffect = { ...talentCharges, stackCount: newStackCount, name: `追加攻撃 (${newStackCount}回)` };
    const updatedEffects = currentKafka.effects.map(e => e.id === talentCharges.id ? updatedEffect : e);

    const afterUpdateState = {
        ...state,
        registry: state.registry.update(createUnitId(sourceUnitId), u => ({ ...u, effects: updatedEffects }))
    };

    return {
        ...afterUpdateState,
        pendingActions: [...afterUpdateState.pendingActions, { type: 'FOLLOW_UP_ATTACK', sourceId: sourceUnitId, targetId, eidolonLevel: currentKafka.eidolonLevel || 0 } as FollowUpAttackAction]
    };
};

// 7. 追加攻撃後: 感電付与、E1デバフ、いばらDoT起爆
const onFollowUpAttack = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const targetId = event.targetId;
    if (!targetId) return state;

    const target = state.registry.get(createUnitId(targetId));
    const currentKafka = state.registry.get(createUnitId(sourceUnitId));
    if (!target || !currentKafka) return state;

    let newState = state;

    // 感電を付与
    newState = applyShockToEnemy(newState, currentKafka, target, eidolonLevel);

    // E1: 受DoT+30%（効果命中/抵抗判定）
    if (eidolonLevel >= 1 && checkDebuffSuccess(currentKafka, target, 1.0, 'Debuff')) {
        const dotVulnDebuff: IEffect = {
            id: EFFECT_IDS.E1_DOT_VULN(sourceUnitId, targetId),
            name: '受DoT+30%',
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: 2,
            modifiers: [{ target: 'dot_taken' as StatKey, value: 0.30, type: 'add', source: 'E1' }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, targetId, dotVulnDebuff);
    }

    // いばら: DoT起爆80%
    if (currentKafka.traces?.some(t => t.id === TRACE_IDS.THORNS)) {
        const { state: afterDetonate } = detonateDoTs(newState, targetId, TALENT_DETONATE_MULT, sourceUnitId);
        newState = afterDetonate;
    }

    return newState;
};

// 8. E4: 感電ダメージ発生時のEP回復
const onDotDamage = (event: DoTDamageEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (eidolonLevel < 4) return state;

    if (event.sourceId !== sourceUnitId || event.dotType !== 'Shock') return state;

    const currentKafka = state.registry.get(createUnitId(sourceUnitId));
    if (!currentKafka) return state;

    return addEnergyToUnit(state, sourceUnitId, 2, 0, false, {
        sourceId: sourceUnitId,
        publishEventFn: publishEvent
    });
};

// 9. 略奪: 感電状態の敵撃破時EP+5
const onEnemyDefeated = (event: EnemyDefeatedEvent, state: GameState, sourceUnitId: string): GameState => {
    const currentKafka = state.registry.get(createUnitId(sourceUnitId));
    if (!currentKafka) return state;

    // 略奪軌跡を持っているか確認
    if (!currentKafka.traces?.some(t => t.id === TRACE_IDS.PLUNDER)) return state;

    // 撃破された敵のエフェクトから感電状態を確認
    const defeatedEnemy = event.defeatedEnemy;
    if (!defeatedEnemy) return state;

    const hadShock = defeatedEnemy.effects.some(e => {
        const eff = e as DoTEffect;
        return eff.name?.includes('感電') ||
            eff.type === 'Shock' ||
            (eff.type === 'DoT' && eff.dotType === 'Shock');
    });

    if (hadShock) {
        const newState = addEnergyToUnit(state, sourceUnitId, PLUNDER_EP_RECOVERY, 0, false, {
            sourceId: sourceUnitId,
            publishEventFn: publishEvent
        });
        const updatedKafka = newState.registry.get(createUnitId(sourceUnitId))!;
        return {
            ...newState,
            log: [...newState.log, {
                characterName: currentKafka.name,
                actionTime: state.time,
                actionType: '略奪',
                skillPointsAfterAction: state.skillPoints,
                currentEp: updatedKafka.ep,
                details: `略奪: 感電敵撃破によりEP+${PLUNDER_EP_RECOVERY}`
            } as SimulationLogEntry]
        };
    }

    return state;
};

export const kafkaHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    return {
        handlerMetadata: {
            id: `kafka-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_ATTACK',  // 味方が敵に攻撃した時（天賦トリガー）
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_TURN_END',  // 天賦スタック回復
                'ON_FOLLOW_UP_ATTACK',  // 追加攻撃後の処理
                'ON_DOT_DAMAGE',
                'ON_ENEMY_DEFEATED',  // 略奪: 感電敵撃破時EP回復
                'ON_EFFECT_APPLIED',  // 苛み: 効果命中バフ付与時の動的更新
                'ON_EFFECT_REMOVED'   // 苛み: 効果命中バフ解除時の動的更新
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const kafkaUnit = state.registry.get(createUnitId(sourceUnitId));
            if (!kafkaUnit) return state;

            const newState = state;

            // 戦闘開始時: 秘技 + 天賦エフェクト + 苛み
            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, newState, sourceUnitId, eidolonLevel);
            }

            // カフカの通常攻撃後: スタック回復はターン終了時に行うので何もしない
            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                // 仕様: ターン終了時にスタック+1
                return newState;
            }

            // カフカのスキル使用時: DoT起爆（スタック回復はターン終了時）
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                return onSkillUsed(event as ActionEvent, newState, sourceUnitId);
            }

            // カフカのターン終了時: 天賦スタック+1回復
            if (event.type === 'ON_TURN_END') {
                return onTurnEnd(event as GeneralEvent, newState, sourceUnitId);
            }

            // 必殺技使用時: 感電付与 + DoT起爆 + いばら
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event as ActionEvent, newState, sourceUnitId, eidolonLevel);
            }

            // 味方が敵に攻撃した時: 天賦追加攻撃トリガー
            if (event.type === 'ON_ATTACK' && event.sourceId !== sourceUnitId) {
                return onDamageDealt(event as ActionEvent, newState, sourceUnitId);
            }

            // 追加攻撃実行後: 感電付与、E1デバフ、DoT起爆
            if (event.type === 'ON_FOLLOW_UP_ATTACK' && event.sourceId === sourceUnitId) {
                return onFollowUpAttack(event as ActionEvent, newState, sourceUnitId, eidolonLevel);
            }

            // E4: 感電ダメージ発生時のEP回復
            if (event.type === 'ON_DOT_DAMAGE') {
                return onDotDamage(event as DoTDamageEvent, newState, sourceUnitId, eidolonLevel);
            }

            // 略奪: 感電敵撃破時EP+5
            if (event.type === 'ON_ENEMY_DEFEATED') {
                return onEnemyDefeated(event as EnemyDefeatedEvent, newState, sourceUnitId);
            }

            // 苛み: 効果命中バフ付与/解除時に動的更新
            if (event.type === 'ON_EFFECT_APPLIED' || event.type === 'ON_EFFECT_REMOVED') {
                const currentKafka = newState.registry.get(createUnitId(sourceUnitId));
                if (currentKafka?.traces?.some(t => t.id === TRACE_IDS.TORTURE)) {
                    return applyTortureBuffs(newState, sourceUnitId);
                }
            }

            return newState;
        }
    };
};
