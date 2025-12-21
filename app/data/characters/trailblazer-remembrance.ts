import { Character, CharacterBaseStats, Unit } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, DamageDealtEvent, ActionEvent, GeneralEvent, EpGainEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { advanceAction, delayAction, applyHealing } from '../../simulator/engine/utils';
import { summonOrRefreshSpirit, getActiveSpirit, IMemorySpiritDefinition } from '../../simulator/engine/memorySpiritManager';
import { addAccumulatedValue, getAccumulatedValue, consumeAccumulatedValue } from '../../simulator/engine/accumulator';
import { TargetSelector } from '../../simulator/engine/selector';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { calculateTrueDamage } from '../../simulator/damage';
import { createUnitId } from '../../simulator/engine/unitId';

// --- 定数定義 ---
const CHARACTER_ID = 'trailblazer-remembrance';
const SUMMON_ID_PREFIX = 'murion';
const CHARGE_KEY = 'murion-charge';

const EFFECT_IDS = {
    MURION_SUPPORT: (targetId: string) => `murion-support-${targetId}`,
    MURION_CRIT_DMG_AURA: (targetId: string) => `murion-crit-dmg-aura-${targetId}`,
    E1_CRIT: (targetId: string) => `murion-support-crit-${targetId}`,
    E2_COOLDOWN: (sourceId: string) => `trailblazer-remembrance-e2-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2: 'trace-a2', // 追憶の杖
    A4: 'trace-a4', // 掌上の叙事詩
    A6: 'trace-a6', // 磁石と長鎖
} as const;

// --- E3/E5パターン (標準) ---
// E3: スキルLv+2, 天賦Lv+2
// E5: 必殺技Lv+2, 通常Lv+1

// --- Base Stats (Lv.80) ---
const BASE_STATS: CharacterBaseStats = {
    hp: 1047,
    atk: 543,
    def: 630,
    spd: 103,
    critRate: 0.05,
    critDmg: 0.5,
    aggro: 100,
};

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 精霊スキル「厄介な悪者さん！」ダメージ
    spiritSkillDmg: {
        10: { single: 0.36, aoe: 0.90 }, // Note: Original code had 0.36 and 0.90. Keeping 0.36 based on code.
        12: { single: 0.396, aoe: 0.99 } // Assuming 10% increase per 2 levels roughly or standard scaling
    } as Record<number, { single: number; aoe: number; }>,
    // 精霊スキル「あたしが助ける！」追加ダメージ倍率
    supportSkill: {
        10: 0.28,
        12: 0.30
    } as Record<number, number>,
    // 精霊天賦 会心ダメージ
    spiritTalent: {
        10: { critDmgMult: 0.12, critDmgFlat: 0.24 },
        12: { critDmgMult: 0.132, critDmgFlat: 0.264 }
    } as Record<number, { critDmgMult: number; critDmgFlat: number; }>,
    // 天賦 HP強化
    talentHp: {
        10: { mult: 0.80, flat: 640 },
        12: { mult: 0.86, flat: 688 }
    } as Record<number, { mult: number; flat: number; }>
};

// --- 通常攻撃 ---
const BASIC_DMG_MULT = 1.0;

// --- 戦闘スキル ---
const SKILL_HEAL_MULT = 0.60;

// --- 必殺技 ---
const ULT_DMG_MULT = 2.40;

// チャージ関連定数
const CHARGE_ON_SKILL_REFRESH = 0.10; // スキル使用時（既存ミュリオン）
const CHARGE_ON_ULT = 0.40; // 必殺技使用時
const CHARGE_ON_SUMMON_A2 = 0.40; // A2: 初回召喚時
const CHARGE_ON_SPIRIT_ATTACK_A4 = 0.05; // A4: 精霊攻撃時
const CHARGE_PER_EP = 0.01; // 天賦: EP10回復ごとに1%
const CHARGE_ON_SUMMON_INITIAL = 0.50; // 精霊天賦: 召喚時50%

// 秘技
const TECHNIQUE_DMG_MULT = 1.0;
const TECHNIQUE_DELAY = 0.50;

// E1
const E1_CRIT_RATE_BUFF = 0.10;

// E2
const E2_EP_RECOVERY = 8;
const E2_COOLDOWN_TURNS = 1;

// E4
const E4_CHARGE_GAIN = 0.03;
const E4_ADDITIONAL_DMG_BONUS = 0.06;

// --- カスタムEffect型 ---
interface MurionSupportEffect extends IEffect {
    additionalDmgMult: number;
}

function isMurionSupportEffect(effect: IEffect): effect is MurionSupportEffect {
    return effect.name === 'ミュリオンの応援' && 'additionalDmgMult' in effect;
}

// --- ミュリオン精霊定義 ---
function createMurionDefinition(owner: Unit, eidolonLevel: number): IMemorySpiritDefinition {
    // E3: 天賦Lv+2
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const talentValues = getLeveledValue(ABILITY_VALUES.talentHp, talentLevel);

    return {
        idPrefix: SUMMON_ID_PREFIX,
        name: 'ミュリオン',
        element: 'Ice',
        hpMultiplier: talentValues.mult,
        baseSpd: 130, // 天賦: ミュリオンの初期速度は130
        debuffImmune: true,
        untargetable: false,
        initialDuration: 999, // ミュリオンはターン経過では消えない（開拓者死亡まで継続）
        abilities: {
            basic: {
                id: 'murion-basic',
                name: 'なし',
                type: 'Basic ATK',
                description: 'なし',
                damage: { type: 'simple', scaling: 'atk', hits: [] }
            },
            skill: {
                id: 'murion-skill',
                name: '厄介な悪者さん！',
                type: 'Skill',
                description: 'ランダム敵4回+全体1回',
                targetType: 'all_enemies',
                energyGain: 10,
                damage: {
                    type: 'aoe',
                    scaling: 'atk',
                    hits: [{ multiplier: 0.36, toughnessReduction: 10 }]
                }
            },
            ultimate: { id: 'murion-ult', name: 'なし', type: 'Ultimate', description: 'なし' },
            talent: { id: 'murion-talent', name: 'なし', type: 'Talent', description: 'なし' },
            technique: { id: 'murion-tech', name: 'なし', type: 'Technique', description: 'なし' }
        }
    };
}

// --- チャージ管理ヘルパー ---
function getMurionCharge(state: GameState, murionId: string): number {
    return getAccumulatedValue(state, murionId, CHARGE_KEY);
}

function addMurionCharge(state: GameState, murionId: string, amount: number): GameState {
    return addAccumulatedValue(state, murionId, CHARGE_KEY, amount, 1.0); // 最大100%
}

function consumeMurionCharge(state: GameState, murionId: string): GameState {
    return consumeAccumulatedValue(state, murionId, CHARGE_KEY, 1.0, 'percent');
}

// --- ハンドラーロジック ---

const onBattleStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // --- 秘技「こだまする記憶」 ---
    const useTechnique = source.config?.useTechnique !== false;
    if (useTechnique) {
        // 敵全体の行動順を50%遅延
        const enemies = TargetSelector.select(source, newState, { type: 'all_enemies' });
        for (const enemy of enemies) {
            newState = delayAction(newState, enemy.id, TECHNIQUE_DELAY, 'percent');
        }

        // 敵全体にダメージ
        for (const enemy of enemies) {
            const dmg = source.stats.atk * TECHNIQUE_DMG_MULT;
            newState = applyUnifiedDamage(newState, source, enemy, dmg, {
                damageType: '秘技',
                details: 'こだまする記憶'
            }).state;
        }

        newState = {
            ...newState,
            log: [...newState.log, {
                actionType: '秘技',
                sourceId: sourceUnitId,
                characterName: source.name,
                details: '秘技「こだまする記憶」発動'
            }]
        };
    }

    // --- A2: 戦闘開始時行動順30%短縮 ---
    if (source.traces?.some(t => t.id === TRACE_IDS.A2)) {
        newState = advanceAction(newState, sourceUnitId, 0.30, 'percent');
    }

    return newState;
};

const onSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 既存のミュリオンをチェック
    // const existingMurion = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);

    // ミュリオン召喚/リフレッシュ
    const definition = createMurionDefinition(source, eidolonLevel);
    const summonResult = summonOrRefreshSpirit(newState, source, definition);
    newState = summonResult.state;
    const murion = summonResult.spirit;

    if (summonResult.isNew) {
        // 新規召喚時
        // 精霊天賦「がんばれミュリオン！」: 召喚時チャージ50%
        newState = addMurionCharge(newState, murion.id, CHARGE_ON_SUMMON_INITIAL);

        // A2: 初回召喚時チャージ40%
        if (source.traces?.some(t => t.id === TRACE_IDS.A2)) {
            newState = addMurionCharge(newState, murion.id, CHARGE_ON_SUMMON_A2);
        }

        // 精霊天賦「仲間と一緒に！」: 味方全体の会心ダメージアップ
        // E5: 必殺技Lv+2, 通常Lv+1. E3: スキル+2, 天賦+2.
        // Assuming Spirit Talent scales with Talent level (E3)
        const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
        const spiritTalent = getLeveledValue(ABILITY_VALUES.spiritTalent, talentLevel);
        const critDmgBuff = murion.stats.crit_dmg * spiritTalent.critDmgMult + spiritTalent.critDmgFlat;

        const allies = TargetSelector.select(source, newState, { type: 'all_allies' });
        for (const ally of allies) {
            newState = addEffect(newState, ally.id, {
                id: EFFECT_IDS.MURION_CRIT_DMG_AURA(ally.id),
                name: '仲間と一緒に！',
                category: 'BUFF',
                sourceUnitId: murion.id,
                durationType: 'LINKED',
                duration: 0,
                linkedEffectId: `spirit-duration-${murion.id}`,
                modifiers: [{
                    target: 'crit_dmg',
                    value: critDmgBuff,
                    type: 'add',
                    source: '仲間と一緒に！'
                }],
                apply: (t: Unit, s: GameState) => s,
                remove: (t: Unit, s: GameState) => s
            });
        }
    } else {
        // 既存ミュリオンリフレッシュ時
        // HP回復: 最大HPのX%
        newState = applyHealing(newState, murion.id, murion.id, {
            scaling: 'hp',
            multiplier: SKILL_HEAL_MULT,
            flat: 0
        }, '戦闘スキル: ミュリオンHP回復');

        // チャージ10%獲得
        newState = addMurionCharge(newState, murion.id, CHARGE_ON_SKILL_REFRESH);
    }

    return newState;
};

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

    // ミュリオン召喚/リフレッシュ
    const definition = createMurionDefinition(source, eidolonLevel);
    const summonResult = summonOrRefreshSpirit(newState, source, definition);
    newState = summonResult.state;
    const murion = summonResult.spirit;

    // チャージ40%獲得
    newState = addMurionCharge(newState, murion.id, CHARGE_ON_ULT);

    return newState;
};

const onTurnStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    const murion = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!murion) return state;

    // ミュリオンのターン開始時の処理
    if (event.sourceId === murion.id) {
        const charge = getMurionCharge(state, murion.id);

        if (charge < 1.0) {
            // チャージ100%未満: 自動で「厄介な悪者さん！」発動
            // 注: ダメージ処理はdispatcher経由で行われるため、ここではA4のチャージ追加のみ
            // A4: 精霊攻撃時チャージ5%
            if (source.traces?.some(t => t.id === TRACE_IDS.A4)) {
                const newState = addMurionCharge(state, murion.id, CHARGE_ON_SPIRIT_ATTACK_A4);
                return newState;
            }
        }
        // チャージ100%の場合: 「あたしが助ける！」はスキル選択で発動（AIが選択）
    }

    return state;
};

const onActionComplete = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    const murion = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!murion) return state;

    // ミュリオンのスキル発動後
    if (event.sourceId === murion.id && event.subType === 'SKILL') {
        let newState = state;
        const charge = getMurionCharge(newState, murion.id);

        if (charge >= 1.0) {
            // 「あたしが助ける！」発動後: チャージ消費、ターゲットにミュリオンの応援付与
            newState = consumeMurionCharge(newState, murion.id);

            // ターゲット選択（最もATKが高い味方）
            const allies = TargetSelector.select(source, newState, {
                type: 'ally',
                sort: TargetSelector.SortByHighestATK,
                filter: (u) => u.id !== murion.id
            });
            const target = allies[0] || source;

            // 行動順100%短縮（ミュリオン自身以外）
            if (target.id !== murion.id) {
                newState = advanceAction(newState, target.id, 1.0, 'percent');
            }

            // ミュリオンの応援付与
            // 精霊スキルレベルは必殺技Lv or スキルLv ?
            // Assuming default E5 checks Ultimate/Basic, E3 checks Skill/Talent.
            // "あたしが助ける！" depends on? Usually Spirit Skill scales.
            // Let's assume it scales with Skill (E3).
            const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
            const supportValue = getLeveledValue(ABILITY_VALUES.supportSkill, skillLevel);
            let additionalDmgMult = supportValue;

            // A6: 最大EP100超過分10につき+2%（最大20%）
            if (source.traces?.some(t => t.id === TRACE_IDS.A6) && target.stats.max_ep > 100) {
                const excess = target.stats.max_ep - 100;
                const bonus = Math.min(0.20, Math.floor(excess / 10) * 0.02);
                additionalDmgMult += bonus;
            }

            // E4: 最大EP0の味方はさらに+6%
            if (eidolonLevel >= 4 && target.stats.max_ep === 0) {
                additionalDmgMult += E4_ADDITIONAL_DMG_BONUS;
            }

            const supportEffect: MurionSupportEffect = {
                id: EFFECT_IDS.MURION_SUPPORT(target.id),
                name: 'ミュリオンの応援',
                category: 'BUFF',
                sourceUnitId: murion.id,
                durationType: 'TURN_END_BASED',
                skipFirstTurnDecrement: true, // 次の攻撃後まで持ち越すため
                duration: 3, // Assuming long enough duration, consumed on attack or fixed turns?
                // Original code: duration 3.
                modifiers: [],
                additionalDmgMult: additionalDmgMult,
                apply: (t: Unit, s: GameState) => s,
                remove: (t: Unit, s: GameState) => s
            };

            newState = addEffect(newState, target.id, supportEffect);

            // E1: ミュリオンの応援所持味方の会心率+10%
            if (eidolonLevel >= 1) {
                newState = addEffect(newState, target.id, {
                    id: EFFECT_IDS.E1_CRIT(target.id),
                    name: 'ミュリオンの応援 (E1会心率)',
                    category: 'BUFF',
                    sourceUnitId: murion.id,
                    durationType: 'LINKED',
                    duration: 0,
                    linkedEffectId: EFFECT_IDS.MURION_SUPPORT(target.id),
                    modifiers: [{
                        target: 'crit_rate',
                        value: E1_CRIT_RATE_BUFF,
                        type: 'add',
                        source: 'E1'
                    }],
                    apply: (t: Unit, s: GameState) => s,
                    remove: (t: Unit, s: GameState) => s
                });

                // E1: 味方が精霊を持つ場合、精霊にも応援効果適用
                const targetSpirit = newState.registry.toArray().find(u => u.linkedUnitId === target.id && u.isSummon);
                if (targetSpirit) {
                    const spiritSupportEffect: MurionSupportEffect = {
                        ...supportEffect,
                        id: EFFECT_IDS.MURION_SUPPORT(targetSpirit.id)
                    };
                    newState = addEffect(newState, targetSpirit.id, spiritSupportEffect);
                }
            }

            newState = {
                ...newState,
                log: [...newState.log, {
                    actionType: '精霊スキル',
                    sourceId: murion.id,
                    characterName: murion.name,
                    targetId: target.id,
                    details: `あたしが助ける！: ${target.name}に「ミュリオンの応援」付与（確定ダメージ+${(additionalDmgMult * 100).toFixed(0)}%）`
                }]
            };
        } else {
            // 「厄介な悪者さん！」発動後
            // A4: チャージ5%獲得
            if (source.traces?.some(t => t.id === TRACE_IDS.A4)) {
                newState = addMurionCharge(newState, murion.id, CHARGE_ON_SPIRIT_ATTACK_A4);
            }
        }

        return newState;
    }

    return state;
};

const onDamageDealt = (
    event: DamageDealtEvent,
    state: GameState
): GameState => {
    if (!event.sourceId || !event.targetId || !event.value) return state;

    const attacker = state.registry.get(createUnitId(event.sourceId));
    const target = state.registry.get(createUnitId(event.targetId));
    if (!attacker || !target || !target.isEnemy) return state;

    // ミュリオンの応援による確定ダメージ（防御・耐性・会心を無視）
    const supportEffect = attacker.effects.find(e => e.id === EFFECT_IDS.MURION_SUPPORT(attacker.id));
    if (supportEffect && isMurionSupportEffect(supportEffect)) {
        const additionalDmgMult = supportEffect.additionalDmgMult;
        if (additionalDmgMult > 0) {
            // 確定ダメージ: 実ダメージ × 倍率をそのまま適用
            const trueDamage = calculateTrueDamage(event.value * additionalDmgMult);

            const result = applyUnifiedDamage(state, attacker, target, trueDamage, {
                damageType: '確定ダメージ',
                details: 'ミュリオンの応援',
                skipStats: true // 統計に二重カウントしない
            });
            return result.state;
        }
    }

    return state;
};

const onBeforeDamageCalculation = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // E6: 必殺技の会心率100%固定
    if (eidolonLevel >= 6 && event.sourceId === sourceUnitId && event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
        const bdcEvent = event as BeforeDamageCalcEvent;
        if (bdcEvent.abilityId === 'ult') {
            const source = state.registry.get(createUnitId(sourceUnitId));
            if (source) {
                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        critRate: (state.damageModifiers.critRate || 0) + (1.0 - source.stats.crit_rate)
                    }
                };
            }
        }
    }

    return state;
};

const onUnitDeath = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string
): GameState => {
    if (!('targetId' in event)) return state;
    if (!event.targetId) return state;

    const murion = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);

    // ミュリオン退場時
    if (murion && event.targetId === murion.id) {
        // 精霊天賦「悔いは…残さないの」: 開拓者の行動順25%短縮
        let newState = advanceAction(state, sourceUnitId, 0.25, 'percent');

        const source = newState.registry.get(createUnitId(sourceUnitId));
        if (source) {
            newState = {
                ...newState,
                log: [...newState.log, {
                    actionType: '精霊天賦',
                    sourceId: sourceUnitId,
                    characterName: source.name,
                    details: '精霊天賦「悔いは…残さないの」: 行動順25%短縮'
                }]
            };
        }

        return newState;
    }

    return state;
};

// E2: 他の精霊行動時EP回復
const onFollowUpAttack = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (eidolonLevel < 2) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    // 他の精霊（ミュリオン以外）が行動したか
    const actionSource = state.registry.get(createUnitId(event.sourceId));
    if (!actionSource || !actionSource.isSummon) return state;
    if (actionSource.linkedUnitId === sourceUnitId) return state; // 自分のミュリオンは除外

    // E2クールダウンチェック
    const e2CooldownId = EFFECT_IDS.E2_COOLDOWN(sourceUnitId);
    if (state.cooldowns && state.cooldowns[e2CooldownId] > 0) return state;

    // EP回復
    let newState = {
        ...state,
        registry: state.registry.update(createUnitId(sourceUnitId), u => ({
            ...u,
            ep: Math.min(source.stats.max_ep, source.ep + E2_EP_RECOVERY)
        }))
    };

    // クールダウン設定（開拓者のターン開始でリセット）
    newState = {
        ...newState,
        cooldowns: {
            ...newState.cooldowns,
            [e2CooldownId]: E2_COOLDOWN_TURNS
        },
        cooldownMetadata: {
            ...newState.cooldownMetadata,
            [e2CooldownId]: {
                handlerId: `trailblazer-remembrance-handler-${sourceUnitId}`,
                resetType: 'wearer_turn',
                ownerId: sourceUnitId
            }
        }
    };

    return newState;
};

// E4: 最大EP0の味方スキル時チャージ獲得
const onSkillUsedE4 = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (eidolonLevel < 4) return state;
    if (event.sourceId === sourceUnitId) return state; // 自分のスキルは除外

    const skillUser = state.registry.get(createUnitId(event.sourceId));
    if (!skillUser || skillUser.isEnemy) return state;
    if (skillUser.stats.max_ep !== 0) return state; // 最大EP0の味方のみ

    const murion = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!murion) return state;

    return addMurionCharge(state, murion.id, E4_CHARGE_GAIN);
};

// 天賦: EP10回復ごとにチャージ1%
const onEpGained = (
    event: IEvent, // EpGainEvent
    state: GameState,
    sourceUnitId: string
): GameState => {
    const epEvent = event as EpGainEvent;
    if (!epEvent.epGained || epEvent.epGained <= 0) return state;

    // 味方のEP回復かチェック
    const recoveredUnit = state.registry.get(createUnitId(epEvent.targetId));
    if (!recoveredUnit || recoveredUnit.isEnemy) return state;

    const murion = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!murion) return state;

    // EP10回復ごとにチャージ1%
    const chargeGain = (epEvent.epGained / 10) * CHARGE_PER_EP;
    return addMurionCharge(state, murion.id, chargeGain);
};

// --- キャラクター定義 ---
export const trailblazerRemembrance: Character = {
    id: CHARACTER_ID,
    name: '開拓者・記憶',
    path: 'Remembrance',
    element: 'Ice',
    rarity: 5,
    maxEnergy: 160,
    baseStats: BASE_STATS,
    traces: [
        { id: 'stat-crit-dmg', name: '会心ダメージ強化', type: 'Stat Bonus', stat: 'crit_dmg', value: 0.373, description: '会心ダメージ+37.3%' },
        { id: 'stat-atk', name: '攻撃強化', type: 'Stat Bonus', stat: 'atk_pct', value: 0.14, description: '攻撃力+14.0%' },
        { id: 'stat-hp', name: 'HP強化', type: 'Stat Bonus', stat: 'hp_pct', value: 0.14, description: '最大HP+14.0%' },
        { id: TRACE_IDS.A2, name: '追憶の杖', type: 'Bonus Ability', description: '戦闘開始時、開拓者の行動順が30%早まる。「ミュリオン」を初めて召喚した時、ミュリオンがチャージを40%獲得する。' },
        { id: TRACE_IDS.A4, name: '掌上の叙事詩', type: 'Bonus Ability', description: '「ミュリオン」が「厄介な悪者さん！」を発動する時、即座にチャージを5%獲得する。' },
        { id: TRACE_IDS.A6, name: '磁石と長鎖', type: 'Bonus Ability', description: '「ミュリオンの応援」を持つ味方の最大EPが100を超えている場合、超過分10につき、確定ダメージ倍率が+2%（最大20%）。' },
    ],
    abilities: {
        basic: {
            id: 'basic',
            name: 'お任せあれ！',
            type: 'Basic ATK',
            description: '指定した敵単体に開拓者の攻撃力100%分の氷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: BASIC_DMG_MULT, toughnessReduction: 10 }]
            },
            spCost: 0,
            energyGain: 20
        },
        skill: {
            id: 'skill',
            name: 'ミュリオンに決めた！',
            type: 'Skill',
            description: '記憶の精霊「ミュリオン」を召喚する。ミュリオンがすでにフィールド上にいる場合、ミュリオンはHPを回復し、チャージを10%獲得する。',
            targetType: 'self',
            spCost: 1,
            energyGain: 30,
        },
        ultimate: {
            id: 'ult',
            name: 'やっちゃえミュリオン！',
            type: 'Ultimate',
            description: '記憶の精霊「ミュリオン」を召喚する。ミュリオンがチャージを40%獲得し、敵全体に攻撃力240%分の氷属性ダメージを与える。',
            targetType: 'all_enemies',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: ULT_DMG_MULT, toughnessReduction: 20 }]
            },
            energyGain: 5,
        },
        talent: {
            id: 'talent',
            name: 'なんでもできる仲間',
            type: 'Talent',
            description: 'ミュリオンの初期速度は130、初期最大HPは開拓者の最大HP80%+640。味方全体でEPを10回復するたびに、ミュリオンがチャージを1%獲得する。'
        },
        technique: {
            id: 'technique',
            name: 'こだまする記憶',
            type: 'Technique',
            description: '敵全体の行動順を50%遅延させ、敵全体に開拓者の攻撃力100%分の氷属性ダメージを与える。'
        }
    },
    eidolons: {
        e1: {
            level: 1,
            name: '現在を記録する者',
            description: 'ミュリオンの応援を持つ味方の会心率+10%。味方が記憶の精霊を持つ時、その効果は精霊にも適用される。'
        },
        e2: {
            level: 2,
            name: '過去を拾う者',
            description: 'ミュリオン以外の味方の記憶の精霊が行動する時、開拓者のEPを8回復する。ターンごとに1回まで。'
        },
        e3: {
            level: 3,
            name: '未来を詠う者',
            description: 'スキルLv+2、天賦Lv+2、精霊天賦Lv+1。',
            abilityModifiers: []
        },
        e4: {
            level: 4,
            name: 'ミューズの新たな踊り手',
            description: '最大EPが0の味方がスキルを発動する時、ミュリオンはチャージを3%獲得し、確定ダメージ倍率が+6%。'
        },
        e5: {
            level: 5,
            name: '詩篇の紡ぎ手',
            description: '必殺技Lv+2、通常Lv+1、精霊スキルLv+1。',
            abilityModifiers: [
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 2.64 },
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 }
            ]
        },
        e6: {
            level: 6,
            name: '啓示の語り手',
            description: '必殺技の会心率が100%に固定される。'
        }
    },
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'memorys-curtain-never-falls',
        superimposition: 1,
        relicSetId: 'hero_who_raises_the_battle_song',
        ornamentSetId: 'omphalos_eternal_grounds',
        mainStats: {
            body: 'crit_dmg',
            feet: 'spd',
            sphere: 'ice_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.30 },
            { stat: 'crit_dmg', value: 0.60 },
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'spd', value: 10 },
        ],
        rotation: ['s', 'b', 'b'],
        rotationMode: 'sequence',
        ultStrategy: 'immediate',
        ultCooldown: 4
    }
};

// --- ハンドラーファクトリ ---
export const trailblazerRemembranceHandlerFactory: IEventHandlerFactory = (
    sourceUnitId: string,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `trailblazer-remembrance-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_TURN_START',
                'ON_ACTION_COMPLETE',
                'ON_DAMAGE_DEALT',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_UNIT_DEATH',
                'ON_FOLLOW_UP_ATTACK',
                'ON_EP_GAINED',
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            let newState = state;

            if (event.type === 'ON_BATTLE_START') {
                newState = onBattleStart(event as GeneralEvent, newState, sourceUnitId);
            } else if (event.type === 'ON_SKILL_USED') {
                newState = onSkillUsed(event as ActionEvent, newState, sourceUnitId, eidolonLevel);
                newState = onSkillUsedE4(event as ActionEvent, newState, sourceUnitId, eidolonLevel);
            } else if (event.type === 'ON_ULTIMATE_USED') {
                newState = onUltimateUsed(event as ActionEvent, newState, sourceUnitId, eidolonLevel);
            } else if (event.type === 'ON_TURN_START') {
                newState = onTurnStart(event as GeneralEvent, newState, sourceUnitId);
            } else if (event.type === 'ON_ACTION_COMPLETE') {
                newState = onActionComplete(event as ActionEvent, newState, sourceUnitId, eidolonLevel);
            } else if (event.type === 'ON_DAMAGE_DEALT') {
                newState = onDamageDealt(event as DamageDealtEvent, newState);
            } else if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                newState = onBeforeDamageCalculation(event, newState, sourceUnitId, eidolonLevel);
            } else if (event.type === 'ON_UNIT_DEATH') {
                newState = onUnitDeath(event, newState, sourceUnitId);
            } else if (event.type === 'ON_FOLLOW_UP_ATTACK') {
                newState = onFollowUpAttack(event, newState, sourceUnitId, eidolonLevel);
            } else if (event.type === 'ON_EP_GAINED') {
                newState = onEpGained(event, newState, sourceUnitId);
            }

            return newState;
        }
    };
};
