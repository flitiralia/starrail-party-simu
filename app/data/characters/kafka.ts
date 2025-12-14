import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, IEventHandlerLogic, IEvent, GameState, DoTDamageEvent, Unit, IAura } from '../../simulator/engine/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { addAura } from '../../simulator/engine/auraManager';
import { IEffect } from '../../simulator/effect/types';
import { recalculateUnitStats } from '../../simulator/statBuilder';
import { createCharacterShockEffect } from '../../simulator/effect/breakEffects';
import { calculateNormalDoTDamage } from '../../simulator/damage';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
// 星魂対応ユーティリティ
import { getLeveledValue } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';

// --- 定数定義 ---
const CHARACTER_ID = 'kafka';

// --- E3/E5パターン ---
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

// 通常攻撃
const BASIC_MULT = 1.0; // 50% x 2 hits

// スキル
const SKILL_MAIN_MULT = 1.6;
const SKILL_ADJ_MULT = 0.6;
const SKILL_DETONATE_MULT = 0.75;

// 必殺技
const ULT_DMG_MULT = 0.8;
const ULT_DETONATE_MULT = 1.2;

// 天賦
const TALENT_MULT = 1.4; // 0.233 x 6 hits ≈ 1.4
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
        lightConeId: 'eyes-of-the-prey',
        superimposition: 5,
        relicSetId: 'prisoner_in_deep_confinement',
        ornamentSetId: 'sea_of_intoxication',
        mainStats: {
            body: 'effect_hit_rate',
            feet: 'spd',
            sphere: 'lightning_dmg_boost',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'atk_pct', value: 0.432 },
            { stat: 'effect_hit_rate', value: 0.324 },
            { stat: 'spd', value: 12 },
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
    const target = state.units.find(u => u.id === targetId);
    if (!target) return { state, totalDamage: 0 };

    const sourceUnit = state.units.find(u => u.id === sourceId);
    if (!sourceUnit) return { state, totalDamage: 0 };

    let totalDamage = 0;
    let dotCount = 0;

    // 全てのDoTエフェクトを検索してダメージを合計
    target.effects.forEach(effect => {
        // DoT系のエフェクトタイプをチェック
        // 新しいDoTシステム: type === 'DoT'
        // 古いシステム（互換性のため）: type === 'Shock' etc.
        if ((effect as any).type === 'DoT' ||
            (effect as any).type === 'Shock' ||
            (effect as any).type === 'Bleed' ||
            (effect as any).type === 'Burn' ||
            (effect as any).type === 'Wind Shear') {

            dotCount++;
            console.log(`[detonateDoTs] Processing DoT #${dotCount}: ${(effect as any).name || effect.id}, ID: ${effect.id}`);

            // DoTの基礎ダメージを取得
            let baseDamage = 0;
            if ((effect as any).type === 'DoT') {
                // 新システム: 計算タイプに応じて処理
                const dotEffect = effect as any;
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
                baseDamage = (effect as any).baseDamage || 0;
            }

            // ★calculateNormalDoTDamageを使用（キャラクター由来の持続ダメージ）
            const dotDamage = calculateNormalDoTDamage(sourceUnit, target, baseDamage);

            // 起爆倍率を適用
            const detonateDamage = dotDamage * detonateMultiplier;
            console.log(`[detonateDoTs] DoT #${dotCount}: dotDamage=${dotDamage.toFixed(2)}, multiplier=${detonateMultiplier}, detonateDamage=${detonateDamage.toFixed(2)}`);
            totalDamage += detonateDamage;

            // ★ ターン数は減少させない
        }
    });

    console.log(`[detonateDoTs] Total DoT count: ${dotCount}, totalDamage: ${totalDamage.toFixed(2)}`);

    // ★applyUnifiedDamageを使用してダメージを適用
    if (totalDamage > 0) {
        const result = applyUnifiedDamage(
            state,
            sourceUnit,
            state.units.find(u => u.id === targetId)!,
            totalDamage,
            {
                damageType: 'DoT起爆',
                details: `DoT起爆 (${(detonateMultiplier * 100).toFixed(0)}%)`,
                skipLog: false,  // ログを記録
                skipStats: false  // 統計を更新
            }
        );

        return { state: result.state, totalDamage };
    }

    return { state, totalDamage: 0 };
}

// --- 分離されたハンドラー関数 ---

// 1. 戦闘開始時: 秘技 + 天賦チャージ + 苛み
const onBattleStart = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const kafkaUnit = state.units.find(u => u.id === sourceUnitId);
    if (!kafkaUnit) return state;

    let newState = state;
    const enemies = newState.units.filter(u => u.isEnemy && u.hp > 0);

    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = kafkaUnit.config?.useTechnique !== false;

    if (useTechnique) {
        // 秘技: 敵全体に感電を付与
        enemies.forEach(enemy => {
            // E5で必殺技Lv+2 → Lv12の感電倍率を使用
            const ultLevel = eidolonLevel >= 5 ? 12 : 10;
            let multiplier = getLeveledValue(ABILITY_VALUES.shockMultiplier, ultLevel);
            if (eidolonLevel >= 6) multiplier += E6_SHOCK_MULT_BONUS;
            const duration = eidolonLevel >= 6 ? E6_SHOCK_DURATION : BASE_SHOCK_DURATION;

            const shockEffect = createCharacterShockEffect(kafkaUnit, enemy, multiplier, duration);
            newState = addEffect(newState, enemy.id, shockEffect);
        });

        // 秘技ダメージ（applyUnifiedDamageを使用）
        enemies.forEach(enemy => {
            const freshEnemy = newState.units.find(u => u.id === enemy.id);
            const freshKafka = newState.units.find(u => u.id === sourceUnitId);
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
        id: `kafka-talent-charges-${sourceUnitId}`,
        name: `追加攻撃 (${MAX_TALENT_CHARGES}回)`,
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: MAX_TALENT_CHARGES,
        maxStacks: MAX_TALENT_CHARGES,
        onApply: (t: any, s: any) => s,
        onRemove: (t: any, s: any) => s,
        apply: (t: any, s: any) => s,
        remove: (t: any, s: any) => s
    };
    newState = addEffect(newState, sourceUnitId, talentCharges);

    // 苛み: 戦闘開始時に効果命中75%以上の味方にATKバフ (これも秘技ではなく軌跡なので常に発動)
    if (kafkaUnit.traces?.some(t => t.name === '苛み')) {
        newState = applyTortureBuffs(newState, sourceUnitId);
    }

    // E2: 味方全体の持続ダメージ+33% (オーラシステムで実装)
    // カフカがフィールド上にいる間のみ有効、死亡時に自動削除される
    if (eidolonLevel >= 2) {
        const e2Aura: IAura = {
            id: `kafka-e2-aura-${sourceUnitId}`,
            name: '狂想者の嗚咽 (DoT+33%)',
            sourceUnitId: sourceUnitId,
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
const increaseTalentCharges = (state: GameState, sourceUnitId: string): GameState => {
    const currentKafka = state.units.find(u => u.id === sourceUnitId);
    if (!currentKafka) return state;

    const talentCharges = currentKafka.effects.find(e => e.id === `kafka-talent-charges-${sourceUnitId}`);
    if (!talentCharges) return state;

    const newStackCount = Math.min((talentCharges.stackCount || 0) + 1, MAX_TALENT_CHARGES);
    const updatedEffect = { ...talentCharges, stackCount: newStackCount, name: `追加攻撃 (${newStackCount}回)` };
    const updatedKafka = { ...currentKafka, effects: currentKafka.effects.map(e => e.id === talentCharges.id ? updatedEffect : e) };

    return { ...state, units: state.units.map(u => u.id === sourceUnitId ? updatedKafka : u) };
};

// 2.5 苛みバフ適用ヘルパー関数（動的更新対応）
const applyTortureBuffs = (state: GameState, sourceUnitId: string): GameState => {
    let newState = state;
    const allies = newState.units.filter(u => !u.isEnemy && u.hp > 0);

    allies.forEach(ally => {
        // 最新のステータスを計算して効果命中判定に使用
        const currentStats = recalculateUnitStats(ally, newState.units);
        const effectHit = currentStats.effect_hit_rate || 0;
        const buffId = `kafka-torture-buff-${sourceUnitId}-${ally.id}`;
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
const onTurnEnd = (event: IEvent, state: GameState, sourceUnitId: string): GameState => {
    // カフカのターン終了時のみ
    if (event.sourceId !== sourceUnitId) return state;

    return increaseTalentCharges(state, sourceUnitId);
};

// 3. 感電付与ヘルパー関数
const applyShockToEnemy = (state: GameState, source: Unit, target: Unit, eidolonLevel: number): GameState => {
    // E5で必殺技Lv+2 → Lv12の感電倍率を使用
    const ultLevel = eidolonLevel >= 5 ? 12 : 10;
    let multiplier = getLeveledValue(ABILITY_VALUES.shockMultiplier, ultLevel);
    if (eidolonLevel >= 6) multiplier += E6_SHOCK_MULT_BONUS;
    const duration = eidolonLevel >= 6 ? E6_SHOCK_DURATION : BASE_SHOCK_DURATION;

    const shockEffect = createCharacterShockEffect(source, target, multiplier, duration);
    return addEffect(state, target.id, shockEffect);
};

// 4. スキル使用時: スタック+1、DoT起爆（メイン75%、隣接50%）
const onSkillUsed = (event: IEvent, state: GameState, sourceUnitId: string): GameState => {
    let newState = increaseTalentCharges(state, sourceUnitId);

    // メインターゲットDoT起爆（75%）
    const targetId = (event as any).targetId;
    if (targetId) {
        const { state: afterDetonate } = detonateDoTs(newState, targetId, SKILL_DETONATE_MULT, sourceUnitId);
        newState = afterDetonate;
    }

    // 隣接ターゲットDoT起爆（50%）
    const adjacentIds = (event as any).adjacentIds as string[] | undefined;
    if (adjacentIds && adjacentIds.length > 0) {
        adjacentIds.forEach(adjId => {
            const { state: afterAdjDetonate } = detonateDoTs(newState, adjId, SKILL_ADJ_DETONATE_MULT, sourceUnitId);
            newState = afterAdjDetonate;
        });
    }

    return newState;
};

// 5. 必殺技使用時: 感電付与、DoT起爆、いばら
const onUltimateUsed = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const kafkaUnit = state.units.find(u => u.id === sourceUnitId);
    if (!kafkaUnit) return state;

    let newState = state;
    const enemies = newState.units.filter(u => u.isEnemy && u.hp > 0);

    // 1. 敵全体に感電を付与
    enemies.forEach(enemy => {
        newState = applyShockToEnemy(newState, kafkaUnit, enemy, eidolonLevel);
    });

    // 2. 敵全体に120%起爆
    enemies.forEach(enemy => {
        const { state: afterDetonate } = detonateDoTs(newState, enemy.id, ULT_DETONATE_MULT, sourceUnitId);
        newState = afterDetonate;
    });

    // いばら: 天賦回数を+1
    if (kafkaUnit.traces?.some(t => t.name === 'いばら')) {
        newState = increaseTalentCharges(newState, sourceUnitId);
    }

    return newState;
};

// 6. ダメージ発生時: 味方攻撃時に天賦追加攻撃をトリガー
const onDamageDealt = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const sourceUnit = state.units.find(u => u.id === event.sourceId);
    if (!sourceUnit || sourceUnit.isEnemy || event.sourceId === sourceUnitId) return state;

    const currentKafka = state.units.find(u => u.id === sourceUnitId);
    if (!currentKafka) return state;

    const talentCharges = currentKafka.effects.find(e => e.id === `kafka-talent-charges-${sourceUnitId}`);
    if (!talentCharges || (talentCharges.stackCount || 0) <= 0) return state;

    const targetId = (event as any).targetId;
    if (!targetId) return state;

    // スタック数を減らす
    const newStackCount = (talentCharges.stackCount || 0) - 1;
    const updatedEffect = { ...talentCharges, stackCount: newStackCount, name: `追加攻撃 (${newStackCount}回)` };
    const updatedKafka = { ...currentKafka, effects: currentKafka.effects.map(e => e.id === talentCharges.id ? updatedEffect : e) };

    return {
        ...state,
        units: state.units.map(u => u.id === sourceUnitId ? updatedKafka : u),
        pendingActions: [...state.pendingActions, { type: 'FOLLOW_UP_ATTACK', sourceId: sourceUnitId, targetId, eidolonLevel } as any]
    };
};

// 7. 追加攻撃後: 感電付与、E1デバフ、いばらDoT起爆
const onFollowUpAttack = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const targetId = (event as any).targetId;
    if (!targetId) return state;

    const target = state.units.find(u => u.id === targetId);
    const currentKafka = state.units.find(u => u.id === sourceUnitId);
    if (!target || !currentKafka) return state;

    let newState = state;

    // 感電を付与
    newState = applyShockToEnemy(newState, currentKafka, target, eidolonLevel);

    // E1: 受DoT+30%
    if (eidolonLevel >= 1) {
        const dotVulnDebuff: IEffect = {
            id: `kafka-e1-dotvuln-${sourceUnitId}-${targetId}`,
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
    if (currentKafka.traces?.some(t => t.name === 'いばら')) {
        const { state: afterDetonate } = detonateDoTs(newState, targetId, TALENT_DETONATE_MULT, sourceUnitId);
        newState = afterDetonate;
    }

    return newState;
};

// 8. E4: 感電ダメージ発生時のEP回復
const onDotDamage = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (eidolonLevel < 4) return state;

    const dotEvent = event as DoTDamageEvent;
    if (dotEvent.sourceId !== sourceUnitId || dotEvent.dotType !== 'Shock') return state;

    const currentKafka = state.units.find(u => u.id === sourceUnitId);
    if (!currentKafka) return state;

    return addEnergyToUnit(state, sourceUnitId, 2);
};

// 9. 略奪: 感電状態の敵撃破時EP+5
const onEnemyDefeated = (event: IEvent, state: GameState, sourceUnitId: string): GameState => {
    const currentKafka = state.units.find(u => u.id === sourceUnitId);
    if (!currentKafka) return state;

    // 略奪軌跡を持っているか確認
    if (!currentKafka.traces?.some(t => t.name === '略奪')) return state;

    // 撃破された敵が感電状態だったか確認
    const defeatedEnemyId = (event as any).targetId;
    if (!defeatedEnemyId) return state;

    // 撃破された敵のエフェクトから感電状態を確認
    const defeatedEnemy = (event as any).defeatedEnemy as Unit | undefined;
    if (!defeatedEnemy) return state;

    const hadShock = defeatedEnemy.effects.some(e =>
        e.name?.includes('感電') ||
        (e as any).type === 'Shock' ||
        ((e as any).type === 'DoT' && (e as any).dotType === 'Shock')
    );

    if (hadShock) {
        const newState = addEnergyToUnit(state, sourceUnitId, PLUNDER_EP_RECOVERY);
        const updatedKafka = newState.units.find(u => u.id === sourceUnitId)!;
        return {
            ...newState,
            log: [...newState.log, {
                characterName: currentKafka.name,
                actionTime: state.time,
                actionType: '略奪',
                skillPointsAfterAction: state.skillPoints,
                currentEp: updatedKafka.ep,
                details: `略奪: 感電敵撃破によりEP+${PLUNDER_EP_RECOVERY}`
            } as any]
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
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const kafkaUnit = state.units.find(u => u.id === sourceUnitId);
            if (!kafkaUnit) return state;

            let newState = state;

            // 戦闘開始時: 秘技 + 天賦エフェクト + 苛み
            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, newState, sourceUnitId, eidolonLevel);
            }

            // カフカの通常攻撃後: スタック回復はターン終了時に行うので何もしない
            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                // 仕様: ターン終了時にスタック+1
                return newState;
            }

            // カフカのスキル使用時: DoT起爆（スタック回復はターン終了時）
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                return onSkillUsed(event, newState, sourceUnitId);
            }

            // カフカのターン終了時: 天賦スタック+1回復
            if (event.type === 'ON_TURN_END') {
                return onTurnEnd(event, newState, sourceUnitId);
            }

            // 必殺技使用時: 感電付与 + DoT起爆 + いばら
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event, newState, sourceUnitId, eidolonLevel);
            }

            // 味方が敵に攻撃した時: 天賦追加攻撃トリガー
            if (event.type === 'ON_ATTACK' && event.sourceId !== sourceUnitId) {
                const sourceUnit = newState.units.find(u => u.id === event.sourceId);
                const targetUnit = event.targetId ? newState.units.find(u => u.id === event.targetId) : undefined;

                // 発動条件: ソースが味方で、ターゲットが敵
                if (sourceUnit && !sourceUnit.isEnemy && targetUnit?.isEnemy) {
                    const currentKafka = newState.units.find(u => u.id === sourceUnitId);
                    if (!currentKafka) return newState;

                    const talentCharges = currentKafka.effects.find(e => e.id === `kafka-talent-charges-${sourceUnitId}`);
                    if (!talentCharges || (talentCharges.stackCount || 0) <= 0) return newState;

                    // スタック数を減らす
                    const newStackCount = (talentCharges.stackCount || 0) - 1;
                    const updatedEffect = { ...talentCharges, stackCount: newStackCount, name: `追加攻撃 (${newStackCount}回)` };
                    const updatedKafka = { ...currentKafka, effects: currentKafka.effects.map(e => e.id === talentCharges.id ? updatedEffect : e) };

                    return {
                        ...newState,
                        units: newState.units.map(u => u.id === sourceUnitId ? updatedKafka : u),
                        pendingActions: [...newState.pendingActions, { type: 'FOLLOW_UP_ATTACK', sourceId: sourceUnitId, targetId: event.targetId, eidolonLevel } as any]
                    };
                }
            }

            // 追加攻撃実行後: 感電付与、E1デバフ、DoT起爆
            if (event.type === 'ON_FOLLOW_UP_ATTACK' && event.sourceId === sourceUnitId) {
                return onFollowUpAttack(event, newState, sourceUnitId, eidolonLevel);
            }

            // E4: 感電ダメージ発生時のEP回復
            if (event.type === 'ON_DOT_DAMAGE') {
                return onDotDamage(event, newState, sourceUnitId, eidolonLevel);
            }

            // 略奪: 感電敵撃破時EP+5
            if (event.type === 'ON_ENEMY_DEFEATED') {
                return onEnemyDefeated(event, newState, sourceUnitId);
            }

            // 苛み: 効果命中バフ付与/解除時に動的更新
            if (event.type === 'ON_EFFECT_APPLIED' || event.type === 'ON_EFFECT_REMOVED') {
                const currentKafka = newState.units.find(u => u.id === sourceUnitId);
                if (currentKafka?.traces?.some(t => t.name === '苛み')) {
                    return applyTortureBuffs(newState, sourceUnitId);
                }
            }

            return newState;
        }
    };
};
