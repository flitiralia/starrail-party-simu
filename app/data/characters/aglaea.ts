import { Character, StatKey, Unit } from '../../types/index';
import {
    IEventHandlerFactory,
    GameState,
    IEvent,
    ActionEvent,
    GeneralEvent,
    BeforeDamageCalcEvent,
    DamageResult
} from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { Modifier } from '../../types/stats';
import { createUnitId, UnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage, publishEvent, appendAdditionalDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { summonOrRefreshSpirit, getActiveSpirit, IMemorySpiritDefinition, dismissSpirit } from '../../simulator/engine/memorySpiritManager';
import { applyHealing, advanceAction } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { insertSummonAfterOwner, removeSummon, createSummon } from '../../simulator/engine/summonManager';
import { setUnitActionValue, updateActionQueue, calculateActionValue, adjustActionValueForSpeedChange } from '../../simulator/engine/actionValue';
import { calculateDamageWithCritInfo } from '../../simulator/damage';
import { IAbility } from '../../types/index';
import { recalculateUnitStats } from '../../simulator/statBuilder';

// =============================================================================
// 定数定義
// =============================================================================

const CHARACTER_ID = 'aglaea';
const SUMMON_ID_PREFIX = 'raftra';
const COUNTDOWN_ID_PREFIX = 'aglaea-countdown';

// 速度スタック
const MAX_SPEED_STACKS = 6;
const MAX_SPEED_STACKS_E4 = 7;

// エフェクトID
export const EFFECT_IDS = {
    /** 至高の姿状態 */
    SUPREME_STANCE: (sourceId: string) => `aglaea-supreme-stance-${sourceId}`,
    /** 隙を縫う糸デバフ */
    THREADING_PERIL: (sourceId: string) => `aglaea-threading-peril-${sourceId}`,
    /** ラフトラの速度スタック */
    SPEED_STACK: (spiritId: string) => `raftra-speed-stack-${spiritId}`,
    /** A4: 保持された速度スタック */
    PRESERVED_STACK: (sourceId: string) => `aglaea-preserved-stack-${sourceId}`,
    /** A2: 攻撃力バフ（至高の姿時） */
    A2_ATK_BUFF: (sourceId: string) => `aglaea-a2-atk-buff-${sourceId}`,
    /** E1: 被ダメージアップ */
    E1_VULN: (sourceId: string) => `aglaea-e1-vuln-${sourceId}`,
    /** E2: 防御無視スタック */
    E2_DEF_IGNORE: (sourceId: string) => `aglaea-e2-def-ignore-${sourceId}`,
    /** E6: 耐性貫通 */
    E6_RES_PEN: (sourceId: string) => `aglaea-e6-res-pen-${sourceId}`,
} as const;

const TRACE_IDS = {
    /** 昇格2: 短見への裁き */
    A2_JUDGEMENT: 'aglaea-trace-a2',
    /** 昇格4: 最後の織運 */
    A4_LAST_WEAVE: 'aglaea-trace-a4',
    /** 昇格6: 刹那の陽光 */
    A6_SUNLIGHT: 'aglaea-trace-a6',
} as const;

// アビリティ値（レベル別）
const ABILITY_VALUES = {
    // 通常攻撃
    basicDmg: {
        6: 1.0,
        7: 1.1
    } as Record<number, number>,

    // 強化通常攻撃「剣先より千の口付けを」
    enhancedBasicDmg: {
        6: { main: 2.0, adj: 0.9 },
        7: { main: 2.2, adj: 0.99 }
    } as Record<number, { main: number; adj: number }>,

    // スキル: ラフトラHP回復
    skillHeal: {
        10: 0.50,
        12: 0.55
    } as Record<number, number>,

    // 必殺技: 速度アップ倍率
    ultSpdBoost: {
        10: 0.15,
        12: 0.16
    } as Record<number, number>,

    // 天賦: ラフトラHP
    talentHp: {
        10: { mult: 0.66, flat: 720 },
        12: { mult: 0.704, flat: 828 }
    } as Record<number, { mult: number; flat: number }>,

    // 天賦: 付加ダメージ
    talentAdditionalDmg: {
        10: 0.30,
        12: 0.336
    } as Record<number, number>,

    // 精霊スキル「サイフォスの罠」
    spiritSkillDmg: {
        10: { main: 1.10, adj: 0.66 },
        12: { main: 1.21, adj: 0.726 }
    } as Record<number, { main: number; adj: number }>,

    // 精霊天賦: 速度アップ
    spiritTalentSpd: {
        10: 55,
        12: 57.2
    } as Record<number, number>,
};

// E1: 被ダメージアップ
const E1_VULN = 0.15;

// E2: 防御無視
const E2_DEF_IGNORE = 0.14;
const E2_MAX_STACKS = 3;

// E6: 耐性貫通
const E6_RES_PEN = 0.20;

// =============================================================================
// キャラクター定義
// =============================================================================

export const aglaea: Character = {
    id: 'aglaea',
    name: 'アグライア',
    path: 'Remembrance',
    element: 'Lightning',
    rarity: 5,
    maxEnergy: 350,

    baseStats: {
        hp: 1241,
        atk: 698,
        def: 485,
        spd: 102,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100  // 記憶標準
    },

    abilities: {
        basic: {
            id: 'aglaea-basic',
            name: 'サイフォスの蜜',
            type: 'Basic ATK',
            description: '指定した敵単体にアグライアの攻撃力100%分の雷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'aglaea-skill',
            name: '掲げよ、昇華せし名を',
            type: 'Skill',
            description: '「ラフトラ」のHPを回復する。ラフトラがいない場合、召喚し即座に行動する。',
            targetType: 'self',
            energyGain: 20,
            spCost: 1,
        },

        ultimate: {
            id: 'aglaea-ultimate',
            name: '共に舞え、運命のラフトラ',
            type: 'Ultimate',
            description: 'ラフトラを召喚し至高の姿に入る。通常攻撃が強化され、即座に行動する。',
            energyGain: 5,
            targetType: 'self',
        },

        talent: {
            id: 'aglaea-talent',
            name: '薔薇色の指先',
            type: 'Talent',
            description: 'ラフトラがいる時、攻撃で「隙を縫う糸」を付与。攻撃後に付加ダメージ。',
        },

        technique: {
            id: 'aglaea-technique',
            name: '星を纏いし烈剣',
            type: 'Technique',
            description: 'ラフトラを召喚し、敵全体に雷属性ダメージ。EP30回復。',
        },

        // 強化通常攻撃（至高の姿状態時）
        enhancedBasic: {
            id: 'aglaea-enhanced-basic',
            name: '剣先より千の口付けを',
            type: 'Basic ATK',
            description: 'アグライアとラフトラが連携攻撃。単体にアグライア攻撃力200%+ラフトラ攻撃力200%、隣接に90%+90%の雷属性ダメージ。SPを回復しない。',
            // ダメージはハンドラーで計算（アグライア+ラフトラの攻撃力を参照するため）
            // 注意: SPを回復しない（ディスパッチャーでnoSpRecoverフラグを使用）
            energyGain: 20,
            targetType: 'blast',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_JUDGEMENT,
            name: '短見への裁き',
            type: 'Bonus Ability',
            description: '「至高の姿」状態時、攻撃力がアグライアの速度720%+ラフトラの速度360%分アップ。'
        },
        {
            id: TRACE_IDS.A4_LAST_WEAVE,
            name: '最後の織運',
            type: 'Bonus Ability',
            description: 'ラフトラ退場時、速度スタックを最大1層保持。再召喚時に適用。'
        },
        {
            id: TRACE_IDS.A6_SUNLIGHT,
            name: '刹那の陽光',
            type: 'Bonus Ability',
            description: '戦闘開始時、EPが50%未満なら50%まで回復。'
        },
        {
            id: 'aglaea-stat-lightning',
            name: '雷ダメージ強化',
            type: 'Stat Bonus',
            description: '雷属性ダメージ+22.4%',
            stat: 'lightning_dmg_boost',
            value: 0.224
        },
        {
            id: 'aglaea-stat-crit',
            name: '会心率強化',
            type: 'Stat Bonus',
            description: '会心率+12.0%',
            stat: 'crit_rate',
            value: 0.12
        },
        {
            id: 'aglaea-stat-def',
            name: '防御力強化',
            type: 'Stat Bonus',
            description: '防御力+12.5%',
            stat: 'def_pct',
            value: 0.125
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '金の星の軌道を漂って',
            description: '「隙を縫う糸」状態の敵の受けるダメージ+15%。攻撃後EP+20。'
        },
        e2: {
            level: 2,
            name: '運命の瞼を行く舟',
            description: 'アグライアまたはラフトラ行動時、与ダメージが敵の防御力を14%無視（最大3層）。他ユニットスキル発動で解除。'
        },
        e3: {
            level: 3,
            name: '華麗な露の賜物',
            description: 'スキルLv+2、通常攻撃Lv+1、精霊天賦Lv+1。'
        },
        e4: {
            level: 4,
            name: '大理石の内なる輝き',
            description: '速度スタック上限+1層。アグライア攻撃後もラフトラが速度スタック獲得。'
        },
        e5: {
            level: 5,
            name: '漆黒の苦難の織り手',
            description: '必殺技Lv+2、天賦Lv+2、精霊スキルLv+1。'
        },
        e6: {
            level: 6,
            name: '空虚で無常なる金糸',
            description: '至高の姿時、雷属性耐性貫通+20%。速度に応じて連携攻撃ダメージアップ。'
        }
    },

    defaultConfig: {
        lightConeId: 'time-woven-into-gold',
        superimposition: 1,
        relicSetId: 'hero-of-triumphant-song',
        ornamentSetId: 'the-wondrous-bananamusement-park',
        mainStats: {
            body: 'crit_rate',
            feet: 'spd',
            sphere: 'lightning_dmg_boost',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.25 },
            { stat: 'crit_dmg', value: 0.50 },
            { stat: 'spd', value: 15 },
            { stat: 'atk_pct', value: 0.15 }
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * ラフトラ精霊定義を作成
 */
function createRaftraDefinition(owner: Unit, eidolonLevel: number): IMemorySpiritDefinition {
    // E5: 天賦Lv+2
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const talentValues = getLeveledValue(ABILITY_VALUES.talentHp, talentLevel);

    return {
        idPrefix: SUMMON_ID_PREFIX,
        name: 'ラフトラ',
        element: 'Lightning',
        hpMultiplier: talentValues.mult,
        baseAggro: 125, // 仕様通り（記憶標準100より高い）
        baseSpd: Math.floor(owner.stats.spd * 0.35),  // 天賦: 速度35%
        abilities: {
            basic: {
                id: 'raftra-basic',
                name: 'なし',
                type: 'Basic ATK',
                description: 'なし',
                damage: { type: 'simple', scaling: 'atk', hits: [] }
            },
            skill: {
                id: 'raftra-skill',
                name: 'サイフォスの罠',
                type: 'Skill',
                description: '拡散攻撃',
                targetType: 'blast',
                energyGain: 10,  // オーナーに付与
                damage: {
                    type: 'blast',
                    scaling: 'atk',
                    mainHits: [{ multiplier: 1.10, toughnessReduction: 10 }],
                    adjacentHits: [{ multiplier: 0.66, toughnessReduction: 5 }]
                }
            },
            ultimate: { id: 'raftra-ult', name: 'なし', type: 'Ultimate', description: 'なし' },
            talent: { id: 'raftra-talent', name: '涙で鍛えし匠の躯', type: 'Talent', description: '隙を縫う糸攻撃後、速度+55（最大6層）' },
            technique: { id: 'raftra-tech', name: 'なし', type: 'Technique', description: 'なし' }
        },
        debuffImmune: false,  // 至高の姿時のみ
        untargetable: false,
        initialDuration: 999  // カウントダウンで管理
    };
}

/**
 * 至高の姿状態かどうかをチェック
 */
const isInSupremeStance = (state: GameState, sourceUnitId: string): boolean => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return false;
    return unit.effects.some(e => e.id === EFFECT_IDS.SUPREME_STANCE(sourceUnitId));
};

/**
 * 隙を縫う糸のターゲットを取得
 */
const getThreadingPerilTarget = (state: GameState, sourceUnitId: string): string | undefined => {
    const enemies = state.registry.getAliveEnemies();
    for (const enemy of enemies) {
        if (enemy.effects.some(e => e.id === EFFECT_IDS.THREADING_PERIL(sourceUnitId))) {
            return enemy.id as string;
        }
    }
    return undefined;
};

/**
 * 隙を縫う糸を付与（排他性を維持）
 */
const applyThreadingPeril = (state: GameState, sourceUnitId: string, targetId: string, eidolonLevel: number): GameState => {
    let newState = state;

    // 既存のターゲットから削除
    const enemies = newState.registry.getAliveEnemies();
    for (const enemy of enemies) {
        const effectId = EFFECT_IDS.THREADING_PERIL(sourceUnitId);
        if (enemy.effects.some(e => e.id === effectId)) {
            newState = removeEffect(newState, enemy.id as string, effectId);
        }
    }

    // 新しいターゲットに付与
    const modifiers: Modifier[] = eidolonLevel >= 1 ? [{
        target: 'all_dmg_taken_boost' as StatKey,
        value: E1_VULN,
        type: 'add' as const,
        source: '隙を縫う糸 (E1)'
    }] : [];

    const threadingPerilEffect: IEffect = {
        id: EFFECT_IDS.THREADING_PERIL(sourceUnitId),
        name: '隙を縫う糸',
        category: 'DEBUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        modifiers,
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };

    return addEffect(newState, targetId, threadingPerilEffect);
};

/**
 * 速度スタックを取得
 */
const getSpeedStacks = (state: GameState, spiritId: string): number => {
    const spirit = state.registry.get(createUnitId(spiritId));
    if (!spirit) return 0;
    const effect = spirit.effects.find(e => e.id === EFFECT_IDS.SPEED_STACK(spiritId));
    return effect?.stackCount || 0;
};

/**
 * アグライアの至高の姿による速度バフを最新のスタック数で同期
 */
const syncAglaeaUltimateSpeed = (state: GameState, ownerId: string, stacks: number): GameState => {
    const owner = state.registry.get(createUnitId(ownerId));
    if (!owner) return state;

    const supremeStanceId = EFFECT_IDS.SUPREME_STANCE(ownerId);
    const supremeStance = owner.effects.find(e => e.id === supremeStanceId);
    if (!supremeStance) return state;

    // 必殺技レベルに基づき再計算
    const eidolonLevel = owner.eidolonLevel || 0;
    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
    const spdBoostPerStack = getLeveledValue(ABILITY_VALUES.ultSpdBoost, ultLevel);
    const totalSpdBoost = spdBoostPerStack * stacks;

    const newModifiers: Modifier[] = totalSpdBoost > 0 ? [{
        target: 'spd_pct' as StatKey,
        value: totalSpdBoost,
        type: 'add' as const,
        source: '至高の姿'
    }] : [];

    // エフェクト更新
    const updatedEffects = owner.effects.map(e => e.id === supremeStanceId ? { ...e, modifiers: newModifiers } : e);

    const oldSpd = owner.stats.spd;
    let updatedOwner = { ...owner, effects: updatedEffects };

    // ステータス再計算
    updatedOwner.stats = recalculateUnitStats(updatedOwner, state.registry.toArray());

    // 行動順調整
    if (oldSpd !== updatedOwner.stats.spd) {
        updatedOwner = adjustActionValueForSpeedChange(updatedOwner, oldSpd, updatedOwner.stats.spd);
    }

    return {
        ...state,
        registry: state.registry.update(createUnitId(ownerId), u => updatedOwner)
    };
};

/**
 * 速度スタックを加算
 */
const addSpeedStack = (state: GameState, spiritId: string, eidolonLevel: number): GameState => {
    const spirit = state.registry.get(createUnitId(spiritId));
    if (!spirit) return state;

    const maxStacks = eidolonLevel >= 4 ? MAX_SPEED_STACKS_E4 : MAX_SPEED_STACKS;
    const effectId = EFFECT_IDS.SPEED_STACK(spiritId);
    const existingEffect = spirit.effects.find(e => e.id === effectId);
    const currentStacks = existingEffect?.stackCount || 0;

    if (currentStacks >= maxStacks) return state;

    const newStacks = Math.min(currentStacks + 1, maxStacks);

    // E3: 精霊天賦Lv+1
    const spiritTalentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const spdPerStack = getLeveledValue(ABILITY_VALUES.spiritTalentSpd, spiritTalentLevel);

    const modifiers: Modifier[] = [{
        target: 'spd' as StatKey,
        value: spdPerStack,
        type: 'add' as const,
        source: '涙で鍛えし匠の躯'
    }];

    let newState = state;

    if (existingEffect) {
        const updatedEffect: IEffect = {
            ...existingEffect,
            stackCount: newStacks,
            name: `涙で鍛えし匠の躯 (${newStacks}/${maxStacks})`,
            modifiers
        };
        const updatedEffects = spirit.effects.map(e => e.id === effectId ? updatedEffect : e);

        // ★ 古い速度を先に取得（元のspiritから）
        const oldSpd = spirit.stats.spd;

        let updatedSpirit = { ...spirit, effects: updatedEffects };

        // Recalculate stats
        updatedSpirit.stats = recalculateUnitStats(updatedSpirit, state.registry.toArray());

        // Adjust AV if speed changed
        if (oldSpd !== updatedSpirit.stats.spd) {
            updatedSpirit = adjustActionValueForSpeedChange(updatedSpirit, oldSpd, updatedSpirit.stats.spd);
        }

        newState = {
            ...state,
            registry: state.registry.update(createUnitId(spiritId), u => updatedSpirit)
        };

        // ★ ActionQueue も同期
        newState = updateActionQueue(newState);
    } else {
        const speedStackEffect: IEffect = {
            id: effectId,
            name: `涙で鍛えし匠の躯 (${newStacks}/${maxStacks})`,
            category: 'BUFF',
            sourceUnitId: spiritId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: newStacks,
            maxStacks: maxStacks,
            modifiers,
            onApply: (t: Unit, s: GameState) => s,
            onRemove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(state, spiritId, speedStackEffect);
    }

    // ★ アグライア本体の速度バフも同期（更新後または新規作成後の newState を使用）
    if (spirit.ownerId) {
        const ownerIdStr = typeof spirit.ownerId === 'string' ? spirit.ownerId : (spirit.ownerId as any).id || JSON.stringify(spirit.ownerId);
        newState = syncAglaeaUltimateSpeed(newState, ownerIdStr, newStacks);
        newState = updateActionQueue(newState); // アグライアのAV変更を反映
    }

    return newState;
};

/**
 * カウントダウンIDを取得
 */
const getCountdownId = (sourceUnitId: string): string => {
    return `${COUNTDOWN_ID_PREFIX}-${sourceUnitId}`;
};

/**
 * カウントダウンを挿入
 * システムユニットとして他に干渉されないよう設定
 */
const insertCountdown = (state: GameState, sourceUnitId: string): GameState => {
    const countdownId = getCountdownId(sourceUnitId);
    const countdownAV = calculateActionValue(100);  // 速度100固定

    console.log(`[Aglaea Countdown] Inserting countdown. ID: ${countdownId}, AV: ${countdownAV}, CurrentTime: ${state.time}`);

    // 既存のカウントダウンがあれば何もしない
    if (state.registry.get(createUnitId(countdownId))) {
        console.log(`[Aglaea Countdown] Countdown already exists, skipping`);
        return state;
    }

    // システムユニットとして作成
    const countdownUnit: Unit = {
        id: createUnitId(countdownId),
        name: 'カウントダウン',
        element: 'Physical',
        path: 'Remembrance',
        stats: {
            hp: 1, atk: 0, def: 999999, spd: 100,
            crit_rate: 0, crit_dmg: 0, max_ep: 0,
            aggro: 0, break_effect: 0, effect_hit_rate: 0, effect_res: 0,
            energy_regen_rate: 0, outgoing_healing_boost: 0
        } as Unit['stats'],
        // ★baseStatsにもspdを設定（calculateFinalStats対策）
        baseStats: {
            hp: 1, atk: 0, def: 999999, spd: 100,
            crit_rate: 0, crit_dmg: 0, max_ep: 0,
            aggro: 0, break_effect: 0, effect_hit_rate: 0, effect_res: 0,
            energy_regen_rate: 0, outgoing_healing_boost: 0
        } as Unit['baseStats'],
        hp: 1,
        isEnemy: false,
        isSummon: false, // 召喚物ではなくカウントダウンとして扱う
        isCountdown: true,
        level: 80,
        ep: 0,
        effects: [],
        modifiers: [],
        shield: 0,
        toughness: 0,
        maxToughness: 0,
        weaknesses: new Set(),
        actionValue: countdownAV,
        abilities: {
            basic: { id: 'countdown-none', name: 'なし', type: 'Basic ATK', description: '' },
            skill: { id: 'countdown-none', name: 'なし', type: 'Skill', description: '' },
            ultimate: { id: 'countdown-none', name: 'なし', type: 'Ultimate', description: '' },
            talent: { id: 'countdown-none', name: 'なし', type: 'Talent', description: '' },
            technique: { id: 'countdown-none', name: 'なし', type: 'Technique', description: '' }
        },
        // リンク情報
        linkedUnitId: createUnitId(sourceUnitId),
        ownerId: createUnitId(sourceUnitId),
        untargetable: true,
        rotationIndex: 0,
        ultCooldown: 0
    };

    // カウントダウンをレジストリに追加
    let newState = insertSummonAfterOwner(state, countdownUnit, sourceUnitId);

    // レジストリにカウントダウンが追加されたか確認
    const insertedCountdown = newState.registry.get(createUnitId(countdownId));
    console.log(`[Aglaea Countdown] Countdown in registry: ${!!insertedCountdown}, AV: ${insertedCountdown?.actionValue}`);

    // actionQueueに追加
    newState = updateActionQueue(newState);

    // デバッグ: actionQueueを出力
    console.log(`[Aglaea Countdown] ActionQueue length: ${newState.actionQueue.length}`);
    const queueStr = newState.actionQueue.map((entry, idx) =>
        `${idx}: ${entry.unitId} (AV: ${entry.actionValue.toFixed(2)})`
    ).join(' | ');
    console.log(`[Aglaea Countdown] ActionQueue: ${queueStr}`);

    // カウントダウンがキューに含まれているか確認
    const countdownInQueue = newState.actionQueue.find(e => e.unitId === countdownId || e.unitId.toString().includes('countdown'));
    console.log(`[Aglaea Countdown] Countdown in queue: ${!!countdownInQueue}, ID searched: ${countdownId}`);

    return newState;
};

/**
 * カウントダウンを削除
 */
const removeCountdown = (state: GameState, sourceUnitId: string): GameState => {
    const countdownId = getCountdownId(sourceUnitId);
    return removeSummon(state, countdownId);
};

/**
 * カウントダウンをリセット
 */
const resetCountdown = (state: GameState, sourceUnitId: string): GameState => {
    const countdownId = getCountdownId(sourceUnitId);
    const countdownAV = calculateActionValue(100);  // 速度100固定

    return setUnitActionValue(state, countdownId, countdownAV);
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
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;

    // A6: EP50%未満なら50%まで回復
    if (unit.traces?.some(t => t.id === TRACE_IDS.A6_SUNLIGHT)) {
        const maxEp = unit.stats.max_ep;
        const halfEp = (maxEp ?? 0) * 0.5;
        if (unit.ep < halfEp) {
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(sourceUnitId), u => ({
                    ...u,
                    ep: halfEp
                }))
            };
        }
    }

    // 秘技「星を纏いし烈剣」
    const useTechnique = unit.config?.useTechnique !== false;
    if (useTechnique) {
        // 最新のユニット情報を取得
        const source = newState.registry.get(createUnitId(sourceUnitId));
        if (!source) return newState;

        // 1. EP30回復
        newState = addEnergyToUnit(newState, sourceUnitId, 30);

        // 2. ラフトラを召喚
        const definition = createRaftraDefinition(source, eidolonLevel);
        const summonResult = summonOrRefreshSpirit(newState, source, definition);
        newState = summonResult.state;

        // ★ Config設定: アクションループを使用させるため
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(summonResult.spirit.id), u => ({
                ...u,
                config: {
                    ...u.config,
                    rotation: ['s'],
                    rotationMode: 'spam_skill'
                } as any
            }))
        };
        const raftra = newState.registry.get(createUnitId(summonResult.spirit.id))!;

        if (summonResult.isNew) {
            // 精霊天賦「過ぎ去りし夏影」: 召喚時、行動順100%短縮
            newState = advanceAction(newState, raftra.id as string, 1.0, 'percent');

            // A4: 保持された速度スタックを適用
            const preservedEffect = source.effects.find(e => e.id === EFFECT_IDS.PRESERVED_STACK(sourceUnitId));
            if (preservedEffect && preservedEffect.stackCount && preservedEffect.stackCount > 0) {
                for (let i = 0; i < preservedEffect.stackCount; i++) {
                    newState = addSpeedStack(newState, raftra.id as string, eidolonLevel);
                }
                newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.PRESERVED_STACK(sourceUnitId));
            }
        }

        // 3. 敵全体に攻撃力100%分の雷属性ダメージを与える（削靭値20）
        const enemies = newState.registry.getAliveEnemies();
        const updatedSource = newState.registry.get(createUnitId(sourceUnitId));
        if (updatedSource) {
            const techniqueDmg = updatedSource.stats.atk * 1.0;  // 攻撃力100%

            for (const enemy of enemies) {
                // ダメージ適用
                const result = applyUnifiedDamage(newState, updatedSource, enemy, techniqueDmg, {
                    damageType: '秘技',
                    details: '星を纏いし烈剣'
                });
                newState = result.state;

                // 削靭値20を適用
                const breakEfficiency = updatedSource.stats.break_effect || 0;
                const toughnessReduction = 20 * (1 + breakEfficiency);
                const updatedEnemy = newState.registry.get(createUnitId(enemy.id as string));
                if (updatedEnemy && updatedEnemy.toughness > 0) {
                    const newToughness = Math.max(0, updatedEnemy.toughness - toughnessReduction);
                    newState = {
                        ...newState,
                        registry: newState.registry.update(createUnitId(enemy.id as string), e => ({
                            ...e,
                            toughness: newToughness
                        }))
                    };
                }
            }
        }

        // 4. ランダムな敵に「隙を縫う糸」を付与
        const aliveEnemies = newState.registry.getAliveEnemies();
        if (aliveEnemies.length > 0) {
            const randomIndex = Math.floor(Math.random() * aliveEnemies.length);
            const randomEnemy = aliveEnemies[randomIndex];
            newState = applyThreadingPeril(newState, sourceUnitId, randomEnemy.id as string, eidolonLevel);
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

    // 至高の姿時はスキル発動不可
    if (isInSupremeStance(state, sourceUnitId)) {
        return state;
    }

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // ラフトラ召喚/リフレッシュ
    const definition = createRaftraDefinition(source, eidolonLevel);
    const summonResult = summonOrRefreshSpirit(newState, source, definition);
    newState = summonResult.state;

    // ★ Config設定: アクションループを使用させるため
    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(summonResult.spirit.id), u => ({
            ...u,
            config: {
                ...u.config,
                rotation: ['s'],
                rotationMode: 'spam_skill'
            } as any
        }))
    };
    const raftra = newState.registry.get(createUnitId(summonResult.spirit.id))!;

    if (summonResult.isNew) {
        // 精霊天賦「過ぎ去りし夏影」: 召喚時、行動順100%短縮
        newState = advanceAction(newState, raftra.id as string, 1.0, 'percent');

        // A4: 保持された速度スタックを適用
        const preservedEffect = source.effects.find(e => e.id === EFFECT_IDS.PRESERVED_STACK(sourceUnitId));
        if (preservedEffect && preservedEffect.stackCount && preservedEffect.stackCount > 0) {
            // 保持されたスタック分を適用
            for (let i = 0; i < preservedEffect.stackCount; i++) {
                newState = addSpeedStack(newState, raftra.id as string, eidolonLevel);
            }
            // 保持スタックを消費
            newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.PRESERVED_STACK(sourceUnitId));
        }

        // 即座に行動（スキル後のアグライア行動）
        newState = advanceAction(newState, sourceUnitId, 1.0, 'percent');
    } else {
        // HP回復
        // E3: スキルLv+2
        const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
        const healMult = getLeveledValue(ABILITY_VALUES.skillHeal, skillLevel);
        newState = applyHealing(newState, sourceUnitId, raftra.id as string, {
            scaling: 'hp',
            multiplier: healMult,
            flat: 0
        }, 'スキル: ラフトラHP回復');
    }

    return newState;
};

/**
 * 必殺技使用時
 */
const onUltimateUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 既に至高の姿中ならカウントダウンをリセット
    if (isInSupremeStance(newState, sourceUnitId)) {
        newState = resetCountdown(newState, sourceUnitId);
        return newState;
    }

    // ラフトラ召喚/HP全回復
    const definition = createRaftraDefinition(source, eidolonLevel);
    const existingRaftra = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);

    if (existingRaftra) {
        // HP全回復
        newState = applyHealing(newState, sourceUnitId, existingRaftra.id as string, {
            scaling: 'hp',
            multiplier: 1.0,
            flat: 0
        }, '必殺技: ラフトラHP全回復');
    } else {
        // 新規召喚
        const summonResult = summonOrRefreshSpirit(newState, source, definition);
        newState = summonResult.state;

        // ★ Config設定: アクションループを使用させるため
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(summonResult.spirit.id), u => ({
                ...u,
                config: {
                    ...u.config,
                    rotation: ['s'],
                    rotationMode: 'spam_skill'
                } as any
            }))
        };
        const raftra = newState.registry.get(createUnitId(summonResult.spirit.id))!;

        // 精霊天賦「過ぎ去りし夏影」: 召喚時、行動順100%短縮
        newState = advanceAction(newState, raftra.id as string, 1.0, 'percent');
    }

    // 至高の姿状態を付与
    const raftra = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);

    // E5: 必殺技Lv+2
    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
    const spdBoostPerStack = getLeveledValue(ABILITY_VALUES.ultSpdBoost, ultLevel);
    const speedStacks = raftra ? getSpeedStacks(newState, raftra.id as string) : 0;
    const totalSpdBoost = spdBoostPerStack * speedStacks;

    const spdModifiers: Modifier[] = totalSpdBoost > 0 ? [{
        target: 'spd_pct' as StatKey,
        value: totalSpdBoost,
        type: 'add' as const,
        source: '至高の姿'
    }] : [];

    const supremeStanceEffect: IEffect = {
        id: EFFECT_IDS.SUPREME_STANCE(sourceUnitId),
        name: '至高の姿',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        modifiers: spdModifiers,
        tags: ['ENHANCED_BASIC', 'SKILL_SILENCE'],  // 強化通常攻撃使用、スキル発動不可
        onApply: (t: Unit, s: GameState) => s,
        onRemove: (t: Unit, s: GameState) => s
    };
    newState = addEffect(newState, sourceUnitId, supremeStanceEffect);

    // ラフトラに行動制限系デバフ抵抗を付与（至高の姿中）
    if (raftra) {
        const ccImmuneEffect: IEffect = {
            id: `aglaea-raftra-cc-immune-${sourceUnitId}`,
            name: 'デバフ抵抗（至高の姿）',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: 0,
            linkedEffectId: EFFECT_IDS.SUPREME_STANCE(sourceUnitId),
            tags: ['CC_IMMUNE'],  // 行動制限系デバフに抵抗
            onApply: (t: Unit, s: GameState) => s,
            onRemove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, raftra.id as string, ccImmuneEffect);
    }

    // E6: 耐性貫通+20%
    if (eidolonLevel >= 6 && raftra) {
        const e6Modifiers: Modifier[] = [{
            target: 'lightning_res_pen' as StatKey,
            value: E6_RES_PEN,
            type: 'add' as const,
            source: 'E6'
        }];

        const e6Effect: IEffect = {
            id: EFFECT_IDS.E6_RES_PEN(sourceUnitId),
            name: '雷耐性貫通 (E6)',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'LINKED',
            duration: 0,
            linkedEffectId: EFFECT_IDS.SUPREME_STANCE(sourceUnitId),
            modifiers: e6Modifiers,
            onApply: (t: Unit, s: GameState) => s,
            onRemove: (t: Unit, s: GameState) => s
        };
        newState = addEffect(newState, sourceUnitId, e6Effect);

        // ラフトラにも適用
        newState = addEffect(newState, raftra.id as string, {
            ...e6Effect,
            id: `${e6Effect.id}-raftra`
        });
    }

    // カウントダウン挿入
    newState = insertCountdown(newState, sourceUnitId);

    // 即座に行動
    newState = advanceAction(newState, sourceUnitId, 1.0, 'percent');

    // ★デバッグ: advanceAction後のカウントダウン状態を確認
    const countdownId = getCountdownId(sourceUnitId);
    const countdownAfterAdvance = newState.registry.get(createUnitId(countdownId));
    console.log(`[Aglaea Ultimate] After advanceAction - Countdown AV in registry: ${countdownAfterAdvance?.actionValue}`);
    const countdownInQueue = newState.actionQueue.find(e => e.unitId.toString().includes('countdown'));
    console.log(`[Aglaea Ultimate] After advanceAction - Countdown AV in queue: ${countdownInQueue?.actionValue}`);

    return newState;
};

/**
 * ターン開始時
 */
const onTurnStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // カウントダウンのターンが来た場合
    const countdownId = getCountdownId(sourceUnitId);
    console.log(`[Aglaea onTurnStart] event.sourceId=${event.sourceId}, countdownId=${countdownId}, match=${event.sourceId === countdownId}, time=${state.time}`);
    if (event.sourceId === countdownId) {
        console.log(`[Aglaea onTurnStart] Countdown turn detected at time ${state.time}! Removing Supreme Stance.`);
        let newState = state;

        // ラフトラ退場
        const raftra = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);
        if (raftra) {
            // 精霊天賦「枯れ草の息吹」: EP20回復
            newState = addEnergyToUnit(newState, sourceUnitId, 20);

            // A4: 速度スタック1層保持
            const source = newState.registry.get(createUnitId(sourceUnitId));
            if (source?.traces?.some(t => t.id === TRACE_IDS.A4_LAST_WEAVE)) {
                const speedStacks = getSpeedStacks(newState, raftra.id as string);
                if (speedStacks > 0) {
                    const preserveEffect: IEffect = {
                        id: EFFECT_IDS.PRESERVED_STACK(sourceUnitId),
                        name: '保持された速度スタック',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: Math.min(1, speedStacks),
                        onApply: (t: Unit, s: GameState) => s,
                        onRemove: (t: Unit, s: GameState) => s
                    };
                    newState = addEffect(newState, sourceUnitId, preserveEffect);
                }
            }

            // ラフトラ削除
            newState = dismissSpirit(newState, raftra.id as string);
        }

        // 至高の姿解除
        newState = removeEffect(newState, sourceUnitId, EFFECT_IDS.SUPREME_STANCE(sourceUnitId));

        // カウントダウン削除
        newState = removeCountdown(newState, sourceUnitId);

        return newState;
    }

    return state;
};

/**
 * アクション完了後（天賦の付加ダメージ、速度スタック）
 */
const onActionComplete = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const raftra = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!raftra && event.sourceId !== sourceUnitId) return state;

    // アグライアまたはラフトラの攻撃かチェック
    // Action Completeでは subType は Action.type (BASIC_ATTACK, SKILL, etc)
    const subType = event.subType || '';
    const isAglaaeaAttack = event.sourceId === sourceUnitId &&
        (subType === 'BASIC_ATTACK' || subType === 'ENHANCED_BASIC_ATTACK' || subType === 'SKILL');
    const isRaftraAttack = raftra && event.sourceId === raftra.id;

    if (!isAglaaeaAttack && !isRaftraAttack) return state;

    let newState = state;

    // Note: Threading Peril application and Additional Damage logic moved to ON_ATTACK
    // because ON_ACTION_COMPLETE lacks targetId access.

    // E2: 防御無視スタック
    if (eidolonLevel >= 2 && (isAglaaeaAttack || isRaftraAttack)) {
        const source = newState.registry.get(createUnitId(sourceUnitId));
        if (source) {
            const effectId = EFFECT_IDS.E2_DEF_IGNORE(sourceUnitId);
            const existingEffect = source.effects.find(e => e.id === effectId);
            const currentStacks = existingEffect?.stackCount || 0;
            const newStacks = Math.min(currentStacks + 1, E2_MAX_STACKS);

            const defIgnoreModifiers: Modifier[] = [{
                target: 'def_ignore' as StatKey,
                value: E2_DEF_IGNORE,  // 1層あたりの値（statBuilderがstackCount倍を自動適用）
                type: 'add' as const,
                source: 'E2'
            }];

            if (existingEffect) {
                const updatedEffect: IEffect = {
                    ...existingEffect,
                    stackCount: newStacks,
                    name: `防御無視 (${newStacks}/${E2_MAX_STACKS})`,
                    modifiers: defIgnoreModifiers
                };
                const updatedEffects = source.effects.map(e => e.id === effectId ? updatedEffect : e);
                newState = {
                    ...newState,
                    registry: newState.registry.update(createUnitId(sourceUnitId), u => ({ ...u, effects: updatedEffects }))
                };
            } else {
                const defIgnoreEffect: IEffect = {
                    id: effectId,
                    name: `防御無視 (${newStacks}/${E2_MAX_STACKS})`,
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: newStacks,
                    maxStacks: E2_MAX_STACKS,
                    modifiers: defIgnoreModifiers,
                    onApply: (t: Unit, s: GameState) => s,
                    onRemove: (t: Unit, s: GameState) => s
                };
                newState = addEffect(newState, sourceUnitId, defIgnoreEffect);
            }

            // ラフトラにも防御無視を適用
            if (raftra) {
                const raftraEffectId = `${effectId}-raftra`;
                const raftraExistingEffect = raftra.effects.find(e => e.id === raftraEffectId);
                if (raftraExistingEffect) {
                    const updatedEffect: IEffect = {
                        ...raftraExistingEffect,
                        stackCount: newStacks,
                        modifiers: defIgnoreModifiers
                    };
                    const updatedEffects = raftra.effects.map(e => e.id === raftraEffectId ? updatedEffect : e);
                    newState = {
                        ...newState,
                        registry: newState.registry.update(createUnitId(raftra.id as string), u => ({ ...u, effects: updatedEffects }))
                    };
                } else {
                    const raftraDefIgnoreEffect: IEffect = {
                        id: raftraEffectId,
                        name: `防御無視 (${newStacks}/${E2_MAX_STACKS})`,
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: newStacks,
                        maxStacks: E2_MAX_STACKS,
                        modifiers: defIgnoreModifiers,
                        onApply: (t: Unit, s: GameState) => s,
                        onRemove: (t: Unit, s: GameState) => s
                    };
                    newState = addEffect(newState, raftra.id as string, raftraDefIgnoreEffect);
                }
            }
        }
    }

    return newState;
};

/**
 * 他ユニットのスキル使用時（E2解除）
 */
const onOtherSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (eidolonLevel < 2) return state;
    if (event.sourceId === sourceUnitId) return state;

    const raftra = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (raftra && event.sourceId === raftra.id) return state;

    // E2: 防御無視スタック解除
    let newState = removeEffect(state, sourceUnitId, EFFECT_IDS.E2_DEF_IGNORE(sourceUnitId));
    if (raftra) {
        newState = removeEffect(newState, raftra.id as string, `${EFFECT_IDS.E2_DEF_IGNORE(sourceUnitId)}-raftra`);
    }

    return newState;
};

/**
 * 強化通常攻撃「剣先より千の口付けを」
 * アグライアとラフトラが連携攻撃を行う
 * ログ統合: すべてのダメージを統合ログに追記
 * 通常攻撃ダメージブースト適用: calculateDamageWithCritInfoを使用
 */
const onEnhancedBasicAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    const raftra = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!raftra) return state;

    let newState = state;

    // E3: 通常攻撃Lv+1
    const basicLevel = calculateAbilityLevel(eidolonLevel, 3, 'Basic');
    const dmgValues = getLeveledValue(ABILITY_VALUES.enhancedBasicDmg, basicLevel);

    // メインターゲット
    const mainTargetId = event.targetId;
    if (!mainTargetId) return state;

    const mainTarget = newState.registry.get(createUnitId(mainTargetId));
    if (!mainTarget) return state;

    // 強化通常攻撃アクション（通常攻撃ダメージブースト適用のため）
    const enhancedBasicAction = {
        type: 'ENHANCED_BASIC_ATTACK' as const,
        sourceId: sourceUnitId,
        targetId: mainTargetId
    };

    // 単体ダメージ: アグライア攻撃力200% + ラフトラ攻撃力200%
    // アグライアのダメージを計算（通常攻撃ダメージブースト適用）
    const aglaaeaMainAbility: IAbility = {
        id: 'aglaea-enhanced-basic-main',
        name: '剣先より千の口付けを',
        type: 'Basic ATK',
        description: '',
        damage: {
            type: 'simple',
            scaling: 'atk',
            hits: [{ multiplier: dmgValues.main, toughnessReduction: 0 }]
        }
    };
    const aglaaeaMainCalc = calculateDamageWithCritInfo(source, mainTarget, aglaaeaMainAbility, enhancedBasicAction);
    const aglaaeaResult = applyUnifiedDamage(newState, source, mainTarget, aglaaeaMainCalc.damage, {
        damageType: '強化通常攻撃',
        details: '剣先より千の口付けを（アグライア）',
        skipLog: true, // 統合ログに追記するため個別ログはスキップ
        additionalDamageEntry: {
            source: 'アグライア',
            name: '連携攻撃（単体）',
            damageType: 'normal',
            isCrit: aglaaeaMainCalc.isCrit,
            breakdownMultipliers: aglaaeaMainCalc.breakdownMultipliers
        }
    });
    newState = aglaaeaResult.state;

    // ラフトラのダメージを適用
    const updatedMainTarget = newState.registry.get(createUnitId(mainTargetId));
    if (updatedMainTarget && updatedMainTarget.hp > 0) {
        const raftraMainAbility: IAbility = {
            id: 'raftra-enhanced-basic-main',
            name: '剣先より千の口付けを',
            type: 'Basic ATK',
            description: '',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: dmgValues.main, toughnessReduction: 0 }]
            }
        };
        const raftraMainCalc = calculateDamageWithCritInfo(raftra, updatedMainTarget, raftraMainAbility, enhancedBasicAction);
        const raftraResult = applyUnifiedDamage(newState, raftra, updatedMainTarget, raftraMainCalc.damage, {
            damageType: '強化通常攻撃',
            details: '剣先より千の口付けを（ラフトラ）',
            skipLog: true, // 統合ログに追記するため個別ログはスキップ
            additionalDamageEntry: {
                source: 'ラフトラ',
                name: '連携攻撃（単体）',
                damageType: 'normal',
                isCrit: raftraMainCalc.isCrit,
                breakdownMultipliers: raftraMainCalc.breakdownMultipliers
            }
        });
        newState = raftraResult.state;
    }

    // 削靭値（単体20）
    const breakEfficiency = source.stats.break_effect || 0;
    const mainToughnessReduction = 20 * (1 + breakEfficiency);
    const freshMainTarget = newState.registry.get(createUnitId(mainTargetId));
    if (freshMainTarget && freshMainTarget.toughness > 0) {
        const newToughness = Math.max(0, freshMainTarget.toughness - mainToughnessReduction);
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(mainTargetId), e => ({
                ...e,
                toughness: newToughness
            }))
        };
    }

    // 隣接ターゲット
    const enemies = newState.registry.getAliveEnemies();
    const mainIndex = enemies.findIndex(e => e.id === mainTargetId);
    const adjacentIndices = [mainIndex - 1, mainIndex + 1].filter(i => i >= 0 && i < enemies.length);

    for (const adjIndex of adjacentIndices) {
        const adjEnemy = enemies[adjIndex];
        if (!adjEnemy) continue;

        // 隣接ダメージ: アグライア攻撃力90% + ラフトラ攻撃力90%
        // アグライアのダメージを計算（通常攻撃ダメージブースト適用）
        const aglaaeaAdjAbility: IAbility = {
            id: 'aglaea-enhanced-basic-adj',
            name: '剣先より千の口付けを',
            type: 'Basic ATK',
            description: '',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: dmgValues.adj, toughnessReduction: 0 }]
            }
        };
        const aglaaeaAdjCalc = calculateDamageWithCritInfo(source, adjEnemy, aglaaeaAdjAbility, enhancedBasicAction);
        const adjAglaaeaResult = applyUnifiedDamage(newState, source, adjEnemy, aglaaeaAdjCalc.damage, {
            damageType: '強化通常攻撃',
            details: '剣先より千の口付けを（アグライア・隣接）',
            skipLog: true, // 統合ログに追記するため個別ログはスキップ
            additionalDamageEntry: {
                source: 'アグライア',
                name: '連携攻撃（隣接）',
                damageType: 'normal',
                isCrit: aglaaeaAdjCalc.isCrit,
                breakdownMultipliers: aglaaeaAdjCalc.breakdownMultipliers
            }
        });
        newState = adjAglaaeaResult.state;

        // ラフトラのダメージ
        const updatedAdjEnemy = newState.registry.get(createUnitId(adjEnemy.id as string));
        if (updatedAdjEnemy && updatedAdjEnemy.hp > 0) {
            const raftraAdjAbility: IAbility = {
                id: 'raftra-enhanced-basic-adj',
                name: '剣先より千の口付けを',
                type: 'Basic ATK',
                description: '',
                damage: {
                    type: 'simple',
                    scaling: 'atk',
                    hits: [{ multiplier: dmgValues.adj, toughnessReduction: 0 }]
                }
            };
            const raftraAdjCalc = calculateDamageWithCritInfo(raftra, updatedAdjEnemy, raftraAdjAbility, enhancedBasicAction);
            const adjRaftraResult = applyUnifiedDamage(newState, raftra, updatedAdjEnemy, raftraAdjCalc.damage, {
                damageType: '強化通常攻撃',
                details: '剣先より千の口付けを（ラフトラ・隣接）',
                skipLog: true, // 統合ログに追記するため個別ログはスキップ
                additionalDamageEntry: {
                    source: 'ラフトラ',
                    name: '連携攻撃（隣接）',
                    damageType: 'normal',
                    isCrit: raftraAdjCalc.isCrit,
                    breakdownMultipliers: raftraAdjCalc.breakdownMultipliers
                }
            });
            newState = adjRaftraResult.state;
        }

        // 削靭値（隣接10）
        const adjToughnessReduction = 10 * (1 + breakEfficiency);
        const freshAdjEnemy = newState.registry.get(createUnitId(adjEnemy.id as string));
        if (freshAdjEnemy && freshAdjEnemy.toughness > 0) {
            const newToughness = Math.max(0, freshAdjEnemy.toughness - adjToughnessReduction);
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(adjEnemy.id as string), e => ({
                    ...e,
                    toughness: newToughness
                }))
            };
        }
    }

    return newState;
};

/**
 * ダメージ計算前（A2: 攻撃力バフ）
 */
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    if (!isInSupremeStance(state, sourceUnitId)) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source?.traces?.some(t => t.id === TRACE_IDS.A2_JUDGEMENT)) return state;

    const raftra = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!raftra) return state;

    // A2: 攻撃力 = アグライア速度×720% + ラフトラ速度×360%
    const aglaaeaSpd = source.stats.spd;
    const raftraSpd = raftra.stats.spd;
    const atkBonus = aglaaeaSpd * 7.20 + raftraSpd * 3.60;

    // baseDmgAdd として追加（固定値として基礎ダメージに加算）
    return {
        ...state,
        damageModifiers: {
            ...state.damageModifiers,
            baseDmgAdd: (state.damageModifiers.baseDmgAdd || 0) + atkBonus
        }
    };
};

/**
 * 攻撃時（ターゲットが存在するタイミングでの処理）
 */
const onAttack = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const raftra = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);

    // Check Action Type
    const evt = event as any;
    const subType = evt.subType || '';

    // アグライアの攻撃: 通常、強化通常、スキル
    const isAglaaeaAttack = evt.sourceId === sourceUnitId &&
        (subType === 'BASIC_ATTACK' || subType === 'ENHANCED_BASIC_ATTACK' || subType === 'SKILL');

    // ラフトラの攻撃
    const isRaftraAttack = raftra && evt.sourceId === raftra.id;

    if (!isAglaaeaAttack && !isRaftraAttack) return state;

    let newState = state;

    // 1. 攻撃対象に隙を縫う糸を付与（アグライアの攻撃時）
    if (isAglaaeaAttack && evt.targetId) {
        const target = newState.registry.get(createUnitId(evt.targetId));
        if (target?.isEnemy) {
            newState = applyThreadingPeril(newState, sourceUnitId, evt.targetId, eidolonLevel);
        }
    }

    // 2. 隙を縫う糸ターゲット確認（付与後の状態を取得）
    const threadingPerilTargetId = getThreadingPerilTarget(newState, sourceUnitId);

    // 隙を縫う糸の敵を攻撃した場合
    if (threadingPerilTargetId && evt.targetId === threadingPerilTargetId) {
        // 天賦: 付加ダメージ
        // E5: 天賦Lv+2
        const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
        const additionalDmgMult = getLeveledValue(ABILITY_VALUES.talentAdditionalDmg, talentLevel);

        const source = newState.registry.get(createUnitId(evt.sourceId || sourceUnitId)); // Use actual source (Aglaea or Raftra) - Wait, spec says Aglaea deals DMG?
        // Spec: "Additionally deal Aglaea's ATK% Lightning Additional Dmg"
        // So source is Aglaea always for the damage calculation?
        // Line 995 in original: Check sourceUnitId
        const damageSource = newState.registry.get(createUnitId(sourceUnitId));

        if (damageSource) {
            const target = newState.registry.get(createUnitId(threadingPerilTargetId));
            if (target) {
                const additionalDmg = damageSource.stats.atk * additionalDmgMult;
                const result = applyUnifiedDamage(newState, damageSource, target, additionalDmg, {
                    damageType: '付加ダメージ',
                    details: '天賦: 薔薇色の指先',
                    skipLog: true  // 統合ログはappendAdditionalDamageで追加するためスキップ
                });
                newState = result.state;

                // ★ 統合ログに付加ダメージを追加
                newState = appendAdditionalDamage(newState, {
                    source: damageSource.name,
                    name: '薔薇色の指先',
                    damage: result.totalDamage,
                    target: target.name,
                    damageType: 'additional',
                    isCrit: result.isCrit,
                    breakdownMultipliers: result.breakdownMultipliers
                });
            }
        }

        // 精霊天賦: 速度スタック獲得（隙を縫う糸の敵を攻撃後）
        if (raftra && (isRaftraAttack || (isAglaaeaAttack && eidolonLevel >= 4))) {
            // E4: アグライア攻撃後もラフトラが速度スタック獲得
            newState = addSpeedStack(newState, raftra.id as string, eidolonLevel);
        }

        // E1: EP+20 (Aglaea or Raftra attacks)
        if (eidolonLevel >= 1) {
            newState = addEnergyToUnit(newState, sourceUnitId, 20);
        }
    }

    return newState;
};

/**
 * ラフトラのスキル使用時（アグライアのEP回復）
 */
const onRaftraSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string
): GameState => {
    // スキル使用者がアグライア自身の召喚物であることを確認
    const unit = state.registry.get(createUnitId(event.sourceId));
    if (unit && unit.isSummon && unit.ownerId === sourceUnitId) {
        // ラフトラのスキル使用時にアグライアのEPを10回復
        return addEnergyToUnit(state, sourceUnitId, 10);
    }
    return state;
};

// =============================================================================
// ハンドラーファクトリ
// =============================================================================

export const aglaeaHandlerFactory: IEventHandlerFactory = (
    sourceUnitId: string,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `aglaea-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_TURN_START',
                'ON_ACTION_COMPLETE',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_ATTACK',
                'ON_BASIC_ATTACK',  // 強化通常攻撃はisEnhancedフラグでチェック
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_SKILL_USED') {
                const actionEvent = event as ActionEvent;
                // 自分のスキル
                if (actionEvent.sourceId === sourceUnitId) {
                    return onSkillUsed(actionEvent, state, sourceUnitId, eidolonLevel);
                }
                // ラフトラのスキル（EP回復）
                let newState = onRaftraSkillUsed(actionEvent, state, sourceUnitId);
                // 他のスキル（E2解除）
                return onOtherSkillUsed(actionEvent, newState, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_TURN_START') {
                console.log(`[Aglaea Handler] ON_TURN_START received. sourceUnitId=${sourceUnitId}, event.sourceId=${(event as GeneralEvent).sourceId}`);
                return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ACTION_COMPLETE') {
                return onActionComplete(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ATTACK') {
                return onAttack(event, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BASIC_ATTACK') {
                // isEnhancedフラグで強化通常攻撃かどうかをチェック
                const basicEvent = event as ActionEvent & { isEnhanced?: boolean };
                if (basicEvent.isEnhanced) {
                    return onEnhancedBasicAttack(basicEvent, state, sourceUnitId, eidolonLevel);
                }
            }

            return state;
        }
    };
};
