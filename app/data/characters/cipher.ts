import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, DamageDealtEvent } from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { applyUnifiedDamage, appendAdditionalDamage, initializeCurrentActionLog, publishEvent, checkDebuffSuccess } from '../../simulator/engine/dispatcher';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateNormalAdditionalDamageWithCritInfo, calculateTrueDamageWithBreakdown } from '../../simulator/damage';
import { addAura } from '../../simulator/engine/auraManager';

// --- 定数定義 ---
const CHARACTER_ID = 'cipher';

const EFFECT_IDS = {
    CUSTOMER: (sourceId: string, targetId: string) => `cipher-customer-${sourceId}-${targetId}`,
    DMG_RECORD: (sourceId: string) => `cipher-damage-record-${sourceId}`,
    FOLLOW_UP_USED: (sourceId: string) => `cipher-follow-up-used-${sourceId}`,
    WEAKNESS: (sourceId: string, targetId: string) => `cipher-weakness-${sourceId}-${targetId}`,
    SKILL_ATK_BUFF: (sourceId: string) => `cipher-skill-atk-buff-${sourceId}`,
    E1_ATK_BUFF: (sourceId: string) => `cipher-e1-atk-buff-${sourceId}`,
    E2_DMG_TAKEN: (sourceId: string, targetId: string) => `cipher-e2-dmg-taken-${sourceId}-${targetId}`,
    A6_VULN: (sourceId: string) => `cipher-a6-vulnerability-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2: 'cipher-trace-a2', // 金のボテス
    A4: 'cipher-trace-a4', // 三百の義賊
    A6: 'cipher-trace-a6', // 世を欺く嘘
} as const;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 通常攻撃: E3でLv7に上昇
    basicMult: {
        6: 1.00,
        7: 1.10
    } as Record<number, number>,
    // 戦闘スキル: E5でLv12に上昇
    skillMain: {
        10: 2.00,
        12: 2.20
    } as Record<number, number>,
    skillAdj: {
        10: 1.00,
        12: 1.10
    } as Record<number, number>,
    // 必殺技: E3でLv12に上昇
    ultStage1: {
        10: 1.20,
        12: 1.32
    } as Record<number, number>,
    ultStage3: {
        10: 0.40,
        12: 0.44
    } as Record<number, number>,
    // 天賦: E5でLv12に上昇
    talentFollowUp: {
        10: 1.50,
        12: 1.65
    } as Record<number, number>,
};

// 通常攻撃
const BASIC_EP = 20;

// 戦闘スキル
const SKILL_WEAKNESS_CHANCE = 1.20; // 120%基礎確率
const SKILL_ENEMY_DMG_REDUCTION = 0.10; // 敵の与ダメ-10%
const SKILL_SELF_ATK_BOOST = 0.30; // 自身の攻撃力+30%
const SKILL_DURATION = 2;
const SKILL_EP = 30;

// 必殺技
const ULT_STAGE2_MULT = 0.25; // 記録値の25%を確定ダメージ
const ULT_STAGE3_MULT = 0.75; // 記録値の75%を確定ダメージ（全ターゲットに均等分配）
const ULT_EP = 5;

// 天賦
const TALENT_CUSTOMER_DMG_RECORD_PCT = 0.12; // お得意様へのダメージの12%を記録
const TALENT_OTHER_DMG_RECORD_PCT = 0.08; // それ以外の敵へのダメージの8%を記録（A4）
const TALENT_FOLLOW_UP_EP = 5;

// 秘技
const TECHNIQUE_MULT = 1.00; // 攻撃力100%
const TECHNIQUE_RECORD_BOOST = 2.00; // 記録値+200% (通常12%→36%)

// 追加能力
const A2_SPD_THRESHOLD_1 = 140;
const A2_SPD_THRESHOLD_2 = 170;
const A2_CRIT_RATE_1 = 0.25; // 速度140以上で会心率+25%
const A2_CRIT_RATE_2 = 0.50; // 速度170以上で会心率+50%
const A2_RECORD_BOOST_1 = 0.50; // 速度140以上で記録値+50%
const A2_RECORD_BOOST_2 = 1.00; // 速度170以上で記録値+100%
const A6_FOLLOW_UP_CRIT_DMG = 1.00; // 追加攻撃の会心ダメージ+100%
const A6_ENEMY_VULN = 0.40; // 敵全体の被ダメージ+40%

// 星魂
const E1_RECORD_MULT = 1.50; // 記録値が150%になる
const E1_ATK_BOOST = 0.80; // 攻撃力+80%
const E1_ATK_DURATION = 2;
const E2_CHANCE = 1.20; // 120%基礎確率
const E2_DMG_TAKEN = 0.30; // 被ダメージ+30%
const E2_DURATION = 2;
const E4_ADDITIONAL_DMG_MULT = 0.50; // 攻撃力50%の付加ダメージ
const E6_FOLLOW_UP_DMG_BOOST = 3.50; // 追加攻撃ダメージ+350%
const E6_RECORD_BONUS = 0.16; // 非超過ダメージの16%を追加記録
const E6_RECORD_REFUND = 0.20; // 記録値の20%を返還

// ヘイト
const AGGRO = 100; // 虚無標準

export const cipher: Character = {
    id: CHARACTER_ID,
    name: 'サフェル',
    path: 'Nihility',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 130,
    baseStats: {
        hp: 931,
        atk: 640,
        def: 509,
        spd: 106,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: AGGRO
    },

    abilities: {
        basic: {
            id: 'cipher-basic',
            name: 'おっと！魚は逃がさないよ',
            type: 'Basic ATK',
            description: '指定した敵単体にサフェルの攻撃力100%分の量子属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 1.00, toughnessReduction: 10 }
                ],
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'cipher-skill',
            name: 'へへっ！お宝いただき～！',
            type: 'Skill',
            description: '120%の基礎確率で指定した敵単体及び隣接する敵を虚弱状態にする。虚弱状態の敵の与ダメージ-10%、2ターン継続。同時に、サフェルの攻撃力+30%、2ターン継続。さらに、指定した敵単体にサフェルの攻撃力200%分の量子属性ダメージを与え、隣接する敵にサフェルの攻撃力100%分の量子属性ダメージを与える。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 2.00, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: 1.00, toughnessReduction: 10 }]
            },
            energyGain: SKILL_EP,
            targetType: 'blast',
            spCost: 1,
        },

        ultimate: {
            id: 'cipher-ultimate',
            name: '怪盗ニャンコ、参上！',
            type: 'Ultimate',
            description: '指定した敵単体にサフェルの攻撃力120%分の量子属性ダメージを与える。その後、指定した敵単体に現在の天賦ダメージ記録値25%分の確定ダメージを与える。さらに、指定した敵単体および隣接する敵にサフェルの攻撃力40%分の量子属性ダメージと現在の天賦ダメージ記録値75%分の確定ダメージを与える（この確定ダメージはすべてのスキルターゲットに均等に分けられる）。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    // 第1段階のみ（第2・第3段階はハンドラで処理）
                    { multiplier: 1.20, toughnessReduction: 30 }
                ],
            },
            energyGain: ULT_EP,
            targetType: 'blast',
        },

        talent: {
            id: 'cipher-talent',
            name: '親切なドロス人',
            type: 'Talent',
            description: 'フィールド上に「お得意様」状態の敵が存在しない場合、サフェルはフィールド上にいる最大HPが最も高い敵単体を「お得意様」にする。戦闘スキルまたは必殺技を発動する時、メインターゲットを「お得意様」にする。「お得意様」状態は最後に付与したターゲットにのみ有効。「お得意様」が他の味方の攻撃を受けた後、サフェルは即座に「お得意様」に追加攻撃を行い、自身の攻撃力150%分の量子属性ダメージを与える。この効果はターンが回ってくるたびに1回まで発動でき、サフェルのターンが回ってきた時に発動可能回数がリセットされる。サフェルは味方が「お得意様」に与えた確定ダメージ以外のダメージの12%分を記録する。なお、その際超過ダメージは記録しない。必殺技を発動した後、ダメージ記録値がクリアされる。',
            energyGain: 0,
            targetType: 'single_enemy'
        },

        technique: {
            id: 'cipher-technique',
            name: '長靴をはいた猫',
            type: 'Technique',
            description: '秘技を使用した後、15秒間継続する「ザグレウスの祝福」を獲得する。「ザグレウスの祝福」を持った状態で戦闘に入ると、敵全体にサフェルの攻撃力100%分の量子属性ダメージを与える。また、このダメージで獲得するダメージ記録値+200%。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2,
            name: '金のボテス',
            type: 'Bonus Ability',
            description: 'サフェルの速度が140/170以上の時、会心率+25%/50%、獲得するダメージ記録値+50%/100%。'
        },
        {
            id: TRACE_IDS.A4,
            name: '三百の義賊',
            type: 'Bonus Ability',
            description: 'サフェルは味方が「お得意様」以外の敵に与えた確定ダメージ以外のダメージの8%分を記録する。超過ダメージは記録しない。'
        },
        {
            id: TRACE_IDS.A6,
            name: '世を欺く嘘',
            type: 'Bonus Ability',
            description: '天賦による追加攻撃の会心ダメージ+100%。サフェルがフィールド上にいる場合、敵全体の受けるダメージ+40%。'
        },
        {
            id: 'cipher-stat-spd',
            name: '速度',
            type: 'Stat Bonus',
            description: '速度+14',
            stat: 'spd' as StatKey,
            value: 14
        },
        {
            id: 'cipher-stat-quantum',
            name: '量子属性ダメージ強化',
            type: 'Stat Bonus',
            description: '量子属性ダメージ強化+14.4%',
            stat: 'quantum_dmg_boost' as StatKey,
            value: 0.144
        },
        {
            id: 'cipher-stat-effect-hit',
            name: '効果命中強化',
            type: 'Stat Bonus',
            description: '効果命中強化+10.0%',
            stat: 'effect_hit_rate' as StatKey,
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '観察、機会を伺う',
            description: 'サフェルが記録するダメージ記録値が本来の150%になる。天賦による追加攻撃を発動する時、サフェルの攻撃力+80%、2ターン継続。'
        },
        e2: {
            level: 2,
            name: '焦燥、慌てる盗賊の手',
            description: 'サフェルの攻撃が敵に命中する時、120%の基礎確率でその敵が受けるダメージ+30%、2ターン継続。'
        },
        e3: {
            level: 3,
            name: '歪曲、無から有を生む',
            description: '必殺技のLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // 必殺技Lv12: 第1段階 132%
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 1.32 },
                // 通常攻撃Lv7: 110%
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 }
            ]
        },
        e4: {
            level: 4,
            name: '秘密、露わになれば煙の如く',
            description: '「お得意様」が味方の攻撃を受けた後、サフェルはその敵にサフェルの攻撃力50%分の量子属性付加ダメージを与える。'
        },
        e5: {
            level: 5,
            name: '狡知、逃げ足軽く飛ぶように',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                // 戦闘スキルLv12: メイン 220%, 隣接 110%
                { abilityName: 'skill', param: 'damage.mainHits.0.multiplier', value: 2.20 },
                { abilityName: 'skill', param: 'damage.adjacentHits.0.multiplier', value: 1.10 }
            ]
        },
        e6: {
            level: 6,
            name: '大盗、名も無き天地の間',
            description: 'サフェルの天賦による追加攻撃ダメージ+350%。なお、このダメージを記録する際、非超過ダメージの16%分を追加で記録する。必殺技を発動してダメージ記録値がクリアされた後、その回でクリアされたダメージ記録値の20%分が返還される。'
        }
    },

    // デフォルト設定
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'lies-dance-on-the-breeze',
        superimposition: 1,
        relicSetId: 'messenger_traversing_hackerspace',
        ornamentSetId: 'rutilant_arena',
        mainStats: {
            body: 'effect_hit_rate',
            feet: 'spd',
            sphere: 'quantum_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'spd', value: 17 },
            { stat: 'effect_hit_rate', value: 0.30 },
            { stat: 'crit_rate', value: 0.15 },
            { stat: 'crit_dmg', value: 0.30 },
            { stat: 'atk_pct', value: 0.15 },
        ],
        rotationMode: 'spam_skill',
        spamSkillTriggerSp: 4,
        ultStrategy: 'immediate',
    },
};

// --- ヘルパー関数 ---

// お得意様エフェクトのインターフェース
interface CustomerEffect extends IEffect {
    customerId: string;
}

// ダメージ記録エフェクトのインターフェース
interface DamageRecordEffect extends IEffect {
    recordedDamage: number;
}

// 型ガード: DamageRecordEffect
function isDamageRecordEffect(effect: IEffect): effect is DamageRecordEffect {
    return effect.id.startsWith('cipher-damage-record-') && 'recordedDamage' in effect;
}

// 型ガード: CustomerEffect
function isCustomerEffect(effect: IEffect): boolean {
    return effect.id.startsWith('cipher-customer-');
}

// お得意様を取得
function getCurrentCustomer(state: GameState, sourceId: string): string | null {
    // サフェル自身を取得
    const cipherUnit = state.registry.get(createUnitId(sourceId));
    if (!cipherUnit) return null;

    // お得意様エフェクトを探す
    const customerEffect = cipherUnit.effects.find((e: IEffect) => isCustomerEffect(e) && e.id.startsWith(`cipher-customer-${sourceId}-`));
    if (!customerEffect) return null;

    // エフェクトIDから対象IDを抽出
    const prefix = `cipher-customer-${sourceId}-`;
    const targetId = customerEffect.id.substring(prefix.length);

    // 検証: targetIdが実際に存在する敵かチェック
    const targetUnit = state.registry.get(createUnitId(targetId));
    return (targetUnit && targetUnit.isEnemy) ? targetId : null;
}

// お得意様を設定
function setCustomer(state: GameState, sourceId: string, targetId: string): GameState {
    let newState = state;

    // 既存のお得意様エフェクトを削除
    const oldCustomer = getCurrentCustomer(newState, sourceId);
    if (oldCustomer) {
        newState = removeEffect(newState, oldCustomer, EFFECT_IDS.CUSTOMER(sourceId, oldCustomer));
    }

    // 新しいお得意様エフェクトを付与
    const customerEffect: IEffect = {
        id: EFFECT_IDS.CUSTOMER(sourceId, targetId),
        name: 'お得意様',
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        tags: ['CUSTOMER'],
       
        /* remove removed */
    };

    newState = addEffect(newState, targetId, customerEffect);

    return newState;
}

// 最大HPの敵を取得
function getHighestHpEnemy(state: GameState): string | null {
    const enemies = state.registry.getAliveEnemies();
    if (enemies.length === 0) return null;

    let maxHp = 0;
    let targetId: string | null = null;

    enemies.forEach((enemy: Unit) => {
        if (enemy.stats.hp > maxHp) {
            maxHp = enemy.stats.hp;
            targetId = enemy.id;
        }
    });

    return targetId;
}

// ダメージ記録値を取得
function getDamageRecord(state: GameState, sourceId: string): number {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return 0;

    const recordEffect = unit.effects.find(e => e.id === EFFECT_IDS.DMG_RECORD(sourceId));
    if (recordEffect && isDamageRecordEffect(recordEffect)) {
        return recordEffect.recordedDamage;
    }
    return 0;
}

// ダメージ記録値を加算
function addDamageRecord(state: GameState, sourceId: string, amount: number, eidolonLevel: number): GameState {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return state;

    const effectId = EFFECT_IDS.DMG_RECORD(sourceId);
    const existingEffect = unit.effects.find(e => e.id === effectId);
    const currentRecord = (existingEffect && isDamageRecordEffect(existingEffect)) ? existingEffect.recordedDamage : 0;

    // E1: 記録値が150%になる
    let recordMult = 1.0;
    if (eidolonLevel >= 1) {
        recordMult = E1_RECORD_MULT;
    }

    const newRecord = currentRecord + (amount * recordMult);

    let newState = state;

    if (existingEffect && isDamageRecordEffect(existingEffect)) {
        const updatedEffect: DamageRecordEffect = {
            ...existingEffect,
            recordedDamage: newRecord,
            name: `ダメージ記録: ${Math.floor(newRecord)}`
        };
        const newEffects = unit.effects.map(e => e.id === effectId ? updatedEffect : e);
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(sourceId), u => ({ ...u, effects: newEffects }))
        };
    } else {
        const recordEffect: DamageRecordEffect = {
            id: effectId,
            name: `ダメージ記録: ${Math.floor(newRecord)}`,
            category: 'BUFF',
            sourceUnitId: sourceId,
            durationType: 'PERMANENT',
            duration: -1,
            recordedDamage: newRecord,
           
            /* remove removed */
        };
        newState = addEffect(newState, sourceId, recordEffect);
    }

    return newState;
}

// ダメージ記録値をクリア
function clearDamageRecord(state: GameState, sourceId: string, eidolonLevel: number): { state: GameState, clearedAmount: number } {
    const clearedAmount = getDamageRecord(state, sourceId);
    let newState = state;

    newState = removeEffect(newState, sourceId, EFFECT_IDS.DMG_RECORD(sourceId));

    // E6: 記録値の20%を返還
    if (eidolonLevel >= 6 && clearedAmount > 0) {
        const refundAmount = clearedAmount * E6_RECORD_REFUND;
        newState = addDamageRecord(newState, sourceId, refundAmount / (eidolonLevel >= 1 ? E1_RECORD_MULT : 1.0), eidolonLevel);
    }

    return { state: newState, clearedAmount };
}

// 追加攻撃カウンターを確認
function canUseFollowUp(state: GameState, sourceId: string): boolean {
    const unit = state.registry.get(createUnitId(sourceId));
    if (!unit) return false;

    return !unit.effects.some(e => e.id === EFFECT_IDS.FOLLOW_UP_USED(sourceId));
}

// 追加攻撃使用済みをマーク
function markFollowUpUsed(state: GameState, sourceId: string): GameState {
    const flagEffect: IEffect = {
        id: EFFECT_IDS.FOLLOW_UP_USED(sourceId),
        name: '追加攻撃使用済み',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: 1,
        skipFirstTurnDecrement: false,
       
        /* remove removed */
    };

    return addEffect(state, sourceId, flagEffect);
}

// A2: 速度による会心率とダメージ記録ボーナスを計算
function getA2Bonuses(unit: Unit): { critRate: number, recordBoost: number } {
    const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2);
    if (!hasA2) return { critRate: 0, recordBoost: 0 };

    const spd = unit.stats.spd;

    if (spd >= A2_SPD_THRESHOLD_2) {
        return { critRate: A2_CRIT_RATE_2, recordBoost: A2_RECORD_BOOST_2 };
    } else if (spd >= A2_SPD_THRESHOLD_1) {
        return { critRate: A2_CRIT_RATE_1, recordBoost: A2_RECORD_BOOST_1 };
    }

    return { critRate: 0, recordBoost: 0 };
}

// --- ハンドラー関数 ---

// 戦闘開始時
const onBattleStart = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;

    // ダメージ記録を初期化
    newState = addDamageRecord(newState, sourceUnitId, 0, eidolonLevel);

    // お得意様を初期化（最大HPの敵）
    const highestHpEnemy = getHighestHpEnemy(newState);
    if (highestHpEnemy) {
        newState = setCustomer(newState, sourceUnitId, highestHpEnemy);
    }

    // A6: 敵全体の被ダメージ+40%（オーラシステム）
    const unit = newState.registry.get(createUnitId(sourceUnitId));
    const hasA6 = unit?.traces?.some(t => t.id === TRACE_IDS.A6);
    if (hasA6) {
        // オーラを作成（サフェルがフィールドにいる限り、敵全体の被ダメージ+40%）
        const vulnAura: any = {
            id: EFFECT_IDS.A6_VULN(sourceUnitId),
            name: '世を欺く嘘',
            sourceUnitId: sourceUnitId,
            target: 'all_enemies', // 敵全体に適用
            modifiers: [{
                target: 'all_type_vuln' as StatKey,
                value: A6_ENEMY_VULN,
                type: 'add' as const,
                source: '世を欺く嘘'
            }]
        };
        newState = addAura(newState, vulnAura);
    }

    // 秘技処理（戦闘開始時に敵全体にダメージ）
    const enemies = newState.registry.getAliveEnemies();
    const cipherUnit = newState.registry.get(createUnitId(sourceUnitId));
    if (!cipherUnit) return newState;

    enemies.forEach((enemy: Unit) => {
        const baseDamage = cipherUnit.stats.atk * TECHNIQUE_MULT;
        const dmgCalcResult = calculateNormalAdditionalDamageWithCritInfo(
            cipherUnit,
            enemy,
            baseDamage
        );

        const result = applyUnifiedDamage(
            newState,
            cipherUnit,
            enemy,
            dmgCalcResult.damage,
            {
                damageType: 'TECHNIQUE_DAMAGE',
                details: '秘技：長靴をはいた猫',
                skipLog: true,
                isCrit: dmgCalcResult.isCrit,
                breakdownMultipliers: dmgCalcResult.breakdownMultipliers
            }
        );
        newState = result.state;

        // ダメージ記録（秘技は記録値+200%なので、通常の3倍 = 12% × 3 = 36%）
        const customer = getCurrentCustomer(newState, sourceUnitId);
        const isCustomer = customer === enemy.id;
        const baseRecordPct = isCustomer ? TALENT_CUSTOMER_DMG_RECORD_PCT : 0;

        // A2ボーナスを取得
        const freshUnit = newState.registry.get(createUnitId(sourceUnitId));
        const a2Bonuses = freshUnit ? getA2Bonuses(freshUnit) : { critRate: 0, recordBoost: 0 };

        const recordPct = baseRecordPct * (1 + a2Bonuses.recordBoost) * (1 + TECHNIQUE_RECORD_BOOST);

        if (recordPct > 0) {
            const actualDamage = Math.min(result.totalDamage, enemy.hp);
            const recordAmount = actualDamage * recordPct;
            newState = addDamageRecord(newState, sourceUnitId, recordAmount, eidolonLevel);
        }
    });

    return newState;
};

// ターン開始時
const onTurnStart = (event: IEvent, state: GameState, sourceUnitId: string): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    let newState = state;

    // 追加攻撃カウンターをリセット（既存のフラグは自動削除される）

    // お得意様が存在しない場合、最大HPの敵を設定
    const customer = getCurrentCustomer(newState, sourceUnitId);
    if (!customer) {
        const highestHpEnemy = getHighestHpEnemy(newState);
        if (highestHpEnemy) {
            newState = setCustomer(newState, sourceUnitId, highestHpEnemy);
        }
    }

    return newState;
};

// スキル使用時
const onSkillUsed = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const actionEvent = event as ActionEvent;
    if (!actionEvent.targetId) return state;

    let newState = state;

    const unit = newState.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // お得意様を設定
    newState = setCustomer(newState, sourceUnitId, actionEvent.targetId);

    // 虚弱デバフ付与（効果命中/抵抗判定）
    const mainTargetUnit = newState.registry.get(createUnitId(actionEvent.targetId));
    if (mainTargetUnit && checkDebuffSuccess(unit, mainTargetUnit, SKILL_WEAKNESS_CHANCE, 'Debuff')) {
        // 敵の与ダメージ-10%
        const weaknessDebuff: IEffect = {
            id: EFFECT_IDS.WEAKNESS(sourceUnitId, actionEvent.targetId),
            name: '虚弱',
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: SKILL_DURATION,
            modifiers: [
                { target: 'all_type_dmg' as StatKey, value: -SKILL_ENEMY_DMG_REDUCTION, type: 'add', source: '虚弱' }
            ],
           
            /* remove removed */
        };
        newState = addEffect(newState, actionEvent.targetId, weaknessDebuff);
    }

    // 隣接する敵にも虚弱デバフを付与（効果命中/抵抗判定）
    const actionEventTyped = actionEvent as any;
    const adjacentIds = actionEventTyped.adjacentIds || [];
    adjacentIds.forEach((adjId: string) => {
        const adjTarget = newState.registry.get(createUnitId(adjId));
        if (adjTarget && checkDebuffSuccess(unit, adjTarget, SKILL_WEAKNESS_CHANCE, 'Debuff')) {
            const weaknessDebuff: IEffect = {
                id: EFFECT_IDS.WEAKNESS(sourceUnitId, adjId),
                name: '虚弱',
                category: 'DEBUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_START_BASED',
                duration: SKILL_DURATION,
                modifiers: [
                    { target: 'all_type_dmg' as StatKey, value: -SKILL_ENEMY_DMG_REDUCTION, type: 'add', source: '虚弱' }
                ],
               
                /* remove removed */
            };
            newState = addEffect(newState, adjId, weaknessDebuff);
        }
    });

    // 自身の攻撃力+30%
    const atkBuff: IEffect = {
        id: EFFECT_IDS.SKILL_ATK_BUFF(sourceUnitId),
        name: 'スキル攻撃力バフ',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_START_BASED',
        duration: SKILL_DURATION,
        modifiers: [
            { target: 'atk_pct' as StatKey, value: SKILL_SELF_ATK_BOOST, type: 'add', source: 'スキル' }
        ],
       
        /* remove removed */
    };
    newState = addEffect(newState, sourceUnitId, atkBuff);

    return newState;
};

// 必殺技使用後
const onUltimateUsed = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number, level: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const actionEvent = event as ActionEvent;
    if (!actionEvent.targetId) return state;

    let newState = state;

    // お得意様を設定
    newState = setCustomer(newState, sourceUnitId, actionEvent.targetId);

    const unit = newState.registry.get(createUnitId(sourceUnitId));
    if (!unit) return newState;

    const mainTarget = newState.registry.get(createUnitId(actionEvent.targetId));
    if (!mainTarget) return newState;

    // ダメージ記録値を取得
    const recordedDamage = getDamageRecord(newState, sourceUnitId);

    // 第2段階: メインターゲットに記録値の25%を確定ダメージ
    const stage2Damage = recordedDamage * ULT_STAGE2_MULT;
    if (stage2Damage > 0) {
        const trueDmgResult = calculateTrueDamageWithBreakdown(stage2Damage);
        const result = applyUnifiedDamage(
            newState,
            unit,
            mainTarget,
            trueDmgResult.damage,
            {
                damageType: 'ULTIMATE_DAMAGE',
                details: '必殺技（第2段階：確定ダメージ）',
                skipLog: true,
                additionalDamageEntry: {
                    source: 'サフェル',
                    name: '必殺技確定ダメージ(25%)',
                    damageType: 'additional',
                    isCrit: trueDmgResult.isCrit,
                    breakdownMultipliers: trueDmgResult.breakdownMultipliers
                }
            }
        );
        newState = result.state;
    }

    // 第3段階: メインターゲット+隣接への通常ダメージ+確定ダメージ
    const actionEventTyped = actionEvent as any;
    const adjacentIds = actionEventTyped.adjacentIds || [];
    const allTargets = [mainTarget, ...adjacentIds.map((id: string) => newState.registry.get(createUnitId(id))).filter((t: Unit | undefined) => t !== undefined)];
    const targets = allTargets.filter((t: Unit | undefined) => t && t.hp > 0) as Unit[];

    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const stage3Mult = getLeveledValue(ABILITY_VALUES.ultStage3, ultLevel);

    targets.forEach(target => {
        // 通常ダメージ
        const baseDamage = unit.stats.atk * stage3Mult;
        const dmgCalcResult = calculateNormalAdditionalDamageWithCritInfo(
            unit,
            target,
            baseDamage
        );

        const normalResult = applyUnifiedDamage(
            newState,
            unit,
            target,
            dmgCalcResult.damage,
            {
                damageType: 'ULTIMATE_DAMAGE',
                details: '必殺技（第3段階：通常ダメージ）',
                skipLog: true,
                isCrit: dmgCalcResult.isCrit,
                breakdownMultipliers: dmgCalcResult.breakdownMultipliers
            }
        );
        newState = normalResult.state;

        // 削靭値20を適用（仕様書: 必殺技削靭値 30(単体), 20(隣接)）
        const updatedTarget = newState.registry.get(createUnitId(target.id));
        if (updatedTarget && updatedTarget.toughness > 0) {
            const breakEfficiency = unit.stats.break_effect || 0;
            const toughnessReduction = 20 * (1 + breakEfficiency);
            const newToughness = Math.max(0, updatedTarget.toughness - toughnessReduction);
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(target.id), u => ({ ...u, toughness: newToughness }))
            }

            // 確定ダメージ（全ターゲットに均等分配）
            const stage3TrueDamage = (recordedDamage * ULT_STAGE3_MULT) / targets.length;
            if (stage3TrueDamage > 0) {
                const trueDmgResult = calculateTrueDamageWithBreakdown(stage3TrueDamage);
                const trueResult = applyUnifiedDamage(
                    newState,
                    unit,
                    target,
                    trueDmgResult.damage,
                    {
                        damageType: 'ULTIMATE_DAMAGE',
                        details: '必殺技（第3段階：確定ダメージ）',
                        skipLog: true,
                        additionalDamageEntry: {
                            source: 'サフェル',
                            name: '必殺技確定ダメージ(75%)',
                            damageType: 'additional',
                            isCrit: trueDmgResult.isCrit,
                            breakdownMultipliers: trueDmgResult.breakdownMultipliers
                        }
                    }
                );
                newState = trueResult.state;
            }
        }
    });

    // ダメージ記録値をクリア
    const clearResult = clearDamageRecord(newState, sourceUnitId, eidolonLevel);
    newState = clearResult.state;

    return newState;
};

// ダメージ発生時（記録処理）
const onDamageDealt = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const dmgEvent = event as DamageDealtEvent;

    // サフェル自身のダメージは記録しない
    if (dmgEvent.sourceId === sourceUnitId) return state;

    // 確定ダメージは記録しない（subTypeで判定）
    const subType = (dmgEvent as any).subType;
    if (subType === 'TRUE_DAMAGE') return state;

    const targetId = dmgEvent.targetId;
    if (!targetId) return state;

    const target = state.registry.get(createUnitId(targetId));
    if (!target || !target.isEnemy) return state;

    // お得意様判定
    const customer = getCurrentCustomer(state, sourceUnitId);
    const isCustomer = customer === targetId;

    // A4: それ以外の敵にも記録
    const hasA4 = state.registry.get(createUnitId(sourceUnitId))?.traces?.some(t => t.id === TRACE_IDS.A4);

    let baseRecordPct = 0;
    if (isCustomer) {
        baseRecordPct = TALENT_CUSTOMER_DMG_RECORD_PCT;
    } else if (hasA4) {
        baseRecordPct = TALENT_OTHER_DMG_RECORD_PCT;
    }

    if (baseRecordPct === 0) return state;

    // A2ボーナスを取得
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    const a2Bonuses = getA2Bonuses(unit);
    const recordPct = baseRecordPct * (1 + a2Bonuses.recordBoost);

    // 超過ダメージを除外
    const dmgValue = dmgEvent.value || 0;
    const targetHpBefore = target.hp + dmgValue; // 簡易的な復元
    const actualDamage = Math.min(dmgValue, targetHpBefore);

    const recordAmount = actualDamage * recordPct;

    return addDamageRecord(state, sourceUnitId, recordAmount, eidolonLevel);
};

// アクション完了時（追加攻撃トリガー）
const onActionComplete = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number, level: number): GameState => {
    const actionEvent = event as ActionEvent;

    // サフェル自身のアクションは無視
    if (actionEvent.sourceId === sourceUnitId) return state;

    // ターゲットがお得意様か確認
    const customer = getCurrentCustomer(state, sourceUnitId);
    if (!customer || actionEvent.targetId !== customer) return state;

    // 追加攻撃カウンターを確認
    if (!canUseFollowUp(state, sourceUnitId)) return state;

    let newState = state;

    // 追加攻撃を実行
    newState = executeFollowUpAttack(newState, sourceUnitId, customer, eidolonLevel, level);

    // 追加攻撃使用済みをマーク
    newState = markFollowUpUsed(newState, sourceUnitId);

    // E4: 付加ダメージ
    if (eidolonLevel >= 4) {
        const unit = newState.registry.get(createUnitId(sourceUnitId));
        const target = newState.registry.get(createUnitId(customer));
        if (unit && target) {
            const additionalDamage = unit.stats.atk * E4_ADDITIONAL_DMG_MULT;
            const dmgCalcResult = calculateNormalAdditionalDamageWithCritInfo(
                unit,
                target,
                additionalDamage
            );

            const result = applyUnifiedDamage(
                newState,
                unit,
                target,
                dmgCalcResult.damage,
                {
                    damageType: 'ADDITIONAL_DAMAGE',
                    details: 'E4付加ダメージ',
                    skipLog: true,
                    isCrit: dmgCalcResult.isCrit,
                    breakdownMultipliers: dmgCalcResult.breakdownMultipliers
                }
            );
            newState = result.state;
        }
    }

    return newState;
};

// 追加攻撃を実行
const executeFollowUpAttack = (state: GameState, sourceUnitId: string, targetId: string, eidolonLevel: number, level: number): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    const target = state.registry.get(createUnitId(targetId));
    if (!unit || !target) return state;

    let newState = state;

    // アクションログを初期化
    newState = initializeCurrentActionLog(newState, sourceUnitId, unit.name, '追加攻撃');

    // 天賦レベルを計算
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    let followUpMult = getLeveledValue(ABILITY_VALUES.talentFollowUp, talentLevel);

    // E6: 追加攻撃ダメージ+350%
    if (eidolonLevel >= 6) {
        followUpMult += E6_FOLLOW_UP_DMG_BOOST;
    }

    // 4ヒット処理
    const hitCount = 4;
    const multPerHit = followUpMult / hitCount;

    for (let i = 0; i < hitCount; i++) {
        const baseDamage = unit.stats.atk * multPerHit;
        const dmgCalcResult = calculateNormalAdditionalDamageWithCritInfo(
            unit,
            target,
            baseDamage
        );

        const result = applyUnifiedDamage(
            newState,
            unit,
            target,
            dmgCalcResult.damage,
            {
                damageType: 'FOLLOW_UP_DAMAGE',
                details: `天賦追加攻撃（ヒット${i + 1}）`,
                skipLog: true,
                isCrit: dmgCalcResult.isCrit,
                breakdownMultipliers: dmgCalcResult.breakdownMultipliers
            }
        );
        newState = result.state;

        // 削靭値を適用（仕様書: 天賦削靭値20、4ヒットなので各5）
        const updatedTarget = newState.registry.get(createUnitId(target.id));
        if (updatedTarget && updatedTarget.toughness > 0) {
            const breakEfficiency = unit.stats.break_effect || 0;
            const toughnessPerHit = 20 / hitCount; // 20を4等分 = 5
            const toughnessReduction = toughnessPerHit * (1 + breakEfficiency);
            const newToughness = Math.max(0, updatedTarget.toughness - toughnessReduction);
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(target.id), u => ({ ...u, toughness: newToughness }))
            };
        }

        // E6: 追加攻撃ダメージを記録する際、非超過ダメージの16%を追加記録
        if (eidolonLevel >= 6) {
            const actualDamage = Math.min(result.totalDamage, target.hp);
            const additionalRecord = actualDamage * E6_RECORD_BONUS;
            newState = addDamageRecord(newState, sourceUnitId, additionalRecord / (eidolonLevel >= 1 ? E1_RECORD_MULT : 1.0), eidolonLevel);
        }
    }

    // E1: 攻撃力+80%バフ（ループ外で1回だけ適用）
    if (eidolonLevel >= 1) {
        const e1Buff: IEffect = {
            id: EFFECT_IDS.E1_ATK_BUFF(sourceUnitId),
            name: 'E1攻撃力バフ',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: E1_ATK_DURATION,
            modifiers: [
                { target: 'atk_pct' as StatKey, value: E1_ATK_BOOST, type: 'add', source: 'E1' }
            ],
           
            /* remove removed */
        };
        newState = addEffect(newState, sourceUnitId, e1Buff);
    }

    // EP回復（ループ外で1回だけ適用）
    newState = addEnergyToUnit(newState, sourceUnitId, TALENT_FOLLOW_UP_EP);

    return newState;
};

// ダメージ計算前（バフ・デバフ適用）
const onBeforeDamageCalculation = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;

    // A2: 速度による会心率ボーナス（サフェルが攻撃者の場合）
    if (event.sourceId === sourceUnitId) {
        const unit = newState.registry.get(createUnitId(sourceUnitId));
        if (unit) {
            const a2Bonuses = getA2Bonuses(unit);
            if (a2Bonuses.critRate > 0) {
                newState = {
                    ...newState,
                    damageModifiers: {
                        ...newState.damageModifiers,
                        critRate: (newState.damageModifiers.critRate || 0) + a2Bonuses.critRate
                    }
                };
            }
        }
    }

    // A6: 天賦追加攻撃の会心ダメージ+100%
    if (event.sourceId === sourceUnitId && (event as any).damageType === 'FOLLOW_UP_DAMAGE') {
        const unit = newState.registry.get(createUnitId(sourceUnitId));
        const hasA6 = unit?.traces?.some(t => t.id === TRACE_IDS.A6);
        if (hasA6) {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    critDmg: (newState.damageModifiers.critDmg || 0) + A6_FOLLOW_UP_CRIT_DMG
                }
            };
        }
    }


    return newState;
};

// 攻撃後（E2デバフ付与）
const onAfterHit = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    if (eidolonLevel < 2) return state;

    const hitEvent = event as any;
    const targetId = hitEvent.targetId;
    if (!targetId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    const target = state.registry.get(createUnitId(targetId));
    if (!unit || !target) return state;

    // 効果命中/抵抗判定（checkDebuffSuccessを使用）
    if (checkDebuffSuccess(unit, target, E2_CHANCE, 'Debuff')) {
        const e2Debuff: IEffect = {
            id: EFFECT_IDS.E2_DMG_TAKEN(sourceUnitId, targetId),
            name: 'E2被ダメージ増加',
            category: 'DEBUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: E2_DURATION,
            modifiers: [
                { target: 'all_type_vuln' as StatKey, value: E2_DMG_TAKEN, type: 'add', source: 'E2' }
            ],
           
            /* remove removed */
        };
        return addEffect(state, targetId, e2Debuff);
    }

    return state;
};

// --- ハンドラーファクトリ ---

export const cipherHandlerFactory: IEventHandlerFactory = (
    sourceUnitId: string,
    level: number = 10,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `cipher-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_DAMAGE_DEALT',
                'ON_ACTION_COMPLETE',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_AFTER_HIT',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_TURN_START') {
                return onTurnStart(event, state, sourceUnitId);
            }

            if (event.type === 'ON_SKILL_USED') {
                return onSkillUsed(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event, state, sourceUnitId, eidolonLevel, level);
            }

            if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ACTION_COMPLETE') {
                return onActionComplete(event, state, sourceUnitId, eidolonLevel, level);
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_AFTER_HIT') {
                return onAfterHit(event, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
