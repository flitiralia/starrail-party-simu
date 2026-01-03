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
import { calculateTrueDamageWithBreakdown } from '../../simulator/damage';
import { createUnitId } from '../../simulator/engine/unitId';

// --- 定数定義 ---
const CHARACTER_ID = 'trailblazer-remembrance';
const SUMMON_ID_PREFIX = 'murion';
const CHARGE_KEY = 'チャージ';

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

// チャージ関連定数（0〜100のパーセント値）
const CHARGE_MAX = 100; // 最大チャージ
const CHARGE_ON_SKILL_REFRESH = 10; // スキル使用時（既存ミュリオン）
const CHARGE_ON_ULT = 40; // 必殺技使用時
const CHARGE_ON_SUMMON_A2 = 40; // A2: 初回召喚時
const CHARGE_ON_SPIRIT_ATTACK_A4 = 5; // A4: 精霊攻撃時
const CHARGE_PER_EP = 1; // 天賦: EP10回復ごとに1%
const CHARGE_ON_SUMMON_INITIAL = 50; // 精霊天賦: 召喚時50%

// 秘技
const TECHNIQUE_DMG_MULT = 1.0;
const TECHNIQUE_DELAY = 0.50;

// E1
const E1_CRIT_RATE_BUFF = 0.10;

// E2
const E2_EP_RECOVERY = 8;
const E2_COOLDOWN_TURNS = 1;

// E4
const E4_CHARGE_GAIN = 3; // E4: チャージ3%
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
            technique: { id: 'murion-tech', name: 'なし', type: 'Technique', description: 'なし' },
            // 隠しスキル: あたしが助ける！ (型定義外のためanyキャストで対応する場合があるが、ここではオブジェクトリテラル内なのでTSが厳格)
            // IUnitData['abilities'] に型を合わせる必要がある。一時的に as any で回避
            ...({
                'support-skill': {
                    id: 'murion-support-skill',
                    name: 'あたしが助ける！',
                    type: 'Skill',
                    description: '味方に「ミュリオンの応援」を付与',
                    targetType: 'ally',
                    damage: { type: 'simple', scaling: 'atk', hits: [] }
                }
            } as any)
        }
    };
}

// --- チャージ管理ヘルパー ---
function getMurionCharge(state: GameState, murionId: string): number {
    return getAccumulatedValue(state, murionId, CHARGE_KEY);
}

/**
 * ミュリオンにチャージを追加する
 * チャージが100%に達した場合：
 * 1. ミュリオンの行動順を100%短縮して即時行動させる
 * 2. ENHANCED_SKILLタグを付与して、次のスキルを「あたしが助ける！」に切り替える
 */
function addMurionCharge(
    state: GameState,
    murionId: string,
    amount: number,
    ownerId: string,
    eidolonLevel: number
): GameState {
    const beforeCharge = getMurionCharge(state, murionId);
    let newState = addAccumulatedValue(state, murionId, CHARGE_KEY, amount, CHARGE_MAX);
    const afterCharge = getMurionCharge(newState, murionId);

    // チャージが100%に達した場合
    if (beforeCharge < CHARGE_MAX && afterCharge >= CHARGE_MAX) {
        const murionBefore = newState.registry.get(createUnitId(murionId));
        console.log(`[Murion] チャージ100%到達 (${beforeCharge} -> ${afterCharge})`);
        console.log(`[Murion] 行動順短縮前 AV=${murionBefore?.actionValue?.toFixed(2)}, SPD=${murionBefore?.stats.spd}`);

        // 行動順100%短縮
        newState = advanceAction(newState, murionId, 1.0, 'percent');

        const murionAfter = newState.registry.get(createUnitId(murionId));
        console.log(`[Murion] 行動順短縮後 AV=${murionAfter?.actionValue?.toFixed(2)}`);

        // ENHANCED_SKILLタグを付与（スキルが「あたしが助ける！」に切り替わる）
        // スキル発動（consumeMurionCharge）時に削除される
        newState = addEffect(newState, murionId, {
            id: `murion-enhanced-skill-${murionId}`,
            name: 'あたしが助ける！準備',
            category: 'BUFF',
            sourceUnitId: murionId,
            durationType: 'TURN_END_BASED',
            skipFirstTurnDecrement: true,
            duration: 1,
            modifiers: [],
            tags: ['ENHANCED_SKILL'],
            onApply: (t: Unit, s: GameState) => s,
            onRemove: (t: Unit, s: GameState) => s
        });
    }

    return newState;
}

/**
 * チャージを追加するが、100%到達時の即時行動をトリガーしない（内部用）
 */
function addMurionChargeRaw(state: GameState, murionId: string, amount: number): GameState {
    return addAccumulatedValue(state, murionId, CHARGE_KEY, amount, CHARGE_MAX);
}

function consumeMurionCharge(state: GameState, murionId: string): GameState {
    // チャージを消費する（100%から0%に）
    // ENHANCED_SKILLエフェクトはTURN_END_BASEDでターン終了時に自動削除される
    return consumeAccumulatedValue(state, murionId, CHARGE_KEY, CHARGE_MAX, 'fixed');
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
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    // --- ミュリオンの行動処理 ---
    const activeMurion = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (activeMurion && event.sourceId === activeMurion.id) {
        // ENHANCED_SKILLタグがある場合 = 「あたしが助ける！」発動
        const hasEnhancedSkill = activeMurion.effects.some(e => e.tags?.includes('ENHANCED_SKILL'));
        const target = event.targetId ? state.registry.get(createUnitId(event.targetId)) : null;

        console.log(`[Murion onSkillUsed] hasEnhancedSkill=${hasEnhancedSkill}, targetId=${event.targetId}, target=${target?.name}`);

        if (hasEnhancedSkill && target && !target.isEnemy) {
            // 「あたしが助ける！」の処理
            console.log(`[Murion] 「あたしが助ける！」発動 -> ${target.name}`);

            let newState = state;

            // チャージ消費 (アクション実行時に消費)
            newState = consumeMurionCharge(newState, activeMurion.id);

            // 行動順100%短縮（ミュリオン自身以外）
            if (target.id !== activeMurion.id) {
                newState = advanceAction(newState, target.id, 1.0, 'percent');
            }

            // 精霊スキルレベル計算
            const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
            const supportValue = getLeveledValue(ABILITY_VALUES.supportSkill, skillLevel);
            let additionalDmgMult = supportValue;

            // A6: 最大EP100超過分10につき+2%（最大20%）
            // A6: 最大EP100超過分10につき+2%（最大20%）
            const targetMaxEp = target.stats.max_ep || 0;
            if (source.traces?.some(t => t.id === TRACE_IDS.A6) && targetMaxEp > 100) {
                const excess = targetMaxEp - 100;
                const bonus = Math.min(0.20, Math.floor(excess / 10) * 0.02);
                additionalDmgMult += bonus;
            }

            // E4: 最大EP0の味方はさらに+6%
            if (eidolonLevel >= 4 && targetMaxEp === 0) {
                additionalDmgMult += E4_ADDITIONAL_DMG_BONUS;
            }

            // ミュリオンの応援付与
            const supportEffect: MurionSupportEffect = {
                id: EFFECT_IDS.MURION_SUPPORT(target.id),
                name: 'ミュリオンの応援',
                category: 'BUFF',
                sourceUnitId: activeMurion.id,
                durationType: 'TURN_END_BASED',
                skipFirstTurnDecrement: true, // アクション直後に付与されるため
                duration: 3,
                modifiers: [],
                additionalDmgMult: additionalDmgMult,
                onApply: (t: Unit, s: GameState) => s,
                onRemove: (t: Unit, s: GameState) => s
            };

            newState = addEffect(newState, target.id, supportEffect);

            // E1: ミュリオンの応援所持味方の会心率+10%
            if (eidolonLevel >= 1) {
                newState = addEffect(newState, target.id, {
                    id: EFFECT_IDS.E1_CRIT(target.id),
                    name: 'ミュリオンの応援 (E1会心率)',
                    category: 'BUFF',
                    sourceUnitId: activeMurion.id,
                    durationType: 'LINKED',
                    duration: 0,
                    linkedEffectId: EFFECT_IDS.MURION_SUPPORT(target.id),
                    modifiers: [{
                        target: 'crit_rate',
                        value: E1_CRIT_RATE_BUFF,
                        type: 'add',
                        source: 'E1'
                    }],
                    onApply: (t: Unit, s: GameState) => s,
                    onRemove: (t: Unit, s: GameState) => s
                });

                // E1: 味方が精霊を持つ場合、精霊にも応援効果適用
                const targetSpirit = newState.registry.toArray().find(u => u.linkedUnitId === target!.id && u.isSummon);
                if (targetSpirit) {
                    const spiritSupportEffect: MurionSupportEffect = {
                        ...supportEffect,
                        id: EFFECT_IDS.MURION_SUPPORT(targetSpirit.id)
                    };
                    newState = addEffect(newState, targetSpirit.id, spiritSupportEffect);
                }
            }

            // 詳細情報をログに追加
            if (newState.currentActionLog) {
                const baseVal = supportValue;
                const targetMaxEpLog = target.stats.max_ep || 0;
                const a6Bonus = (source.traces?.some(t => t.id === TRACE_IDS.A6) && targetMaxEpLog > 100) ? Math.min(0.20, Math.floor((targetMaxEpLog - 100) / 10) * 0.02) : 0;
                const e4Bonus = (eidolonLevel >= 4 && targetMaxEpLog === 0) ? E4_ADDITIONAL_DMG_BONUS : 0;

                const prefix = newState.currentActionLog.details ? '\n' : '';
                newState.currentActionLog.details = (newState.currentActionLog.details || '') +
                    `${prefix}[ミュリオンの応援] バフ量: ${(additionalDmgMult * 100).toFixed(1)}% (基礎: ${(baseVal * 100).toFixed(1)}% + A6: ${(a6Bonus * 100).toFixed(1)}% + E4: ${(e4Bonus * 100).toFixed(1)}%)`;
            }

            return newState;
        }
        return state;
    }

    // --- 開拓者の通常スキル処理 ---
    if (event.sourceId !== sourceUnitId) return state;


    let newState = state;

    // 既存のミュリオンをチェック
    // const existingMurion = getActiveSpirit(newState, sourceUnitId, SUMMON_ID_PREFIX);

    // ミュリオン召喚/リフレッシュ
    const definition = createMurionDefinition(source, eidolonLevel);
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
    const murion = newState.registry.get(createUnitId(summonResult.spirit.id))!;

    if (summonResult.isNew) {
        // 新規召喚時
        // 精霊天賦「がんばれミュリオン！」: 召喚時チャージ50%
        newState = addMurionCharge(newState, murion.id, CHARGE_ON_SUMMON_INITIAL, sourceUnitId, eidolonLevel);

        // A2: 初回召喚時チャージ40%
        if (source.traces?.some(t => t.id === TRACE_IDS.A2)) {
            newState = addMurionCharge(newState, murion.id, CHARGE_ON_SUMMON_A2, sourceUnitId, eidolonLevel);
        }

        // 精霊天賦「仲間と一緒に！」: 味方全体の会心ダメージアップ
        // E5: 必殺技Lv+2, 通常Lv+1. E3: スキル+2, 天賦+2.
        // Assuming Spirit Talent scales with Talent level (E3)
        const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
        const spiritTalent = getLeveledValue(ABILITY_VALUES.spiritTalent, talentLevel);
        const critDmgBuff = (murion.stats.crit_dmg || 0) * spiritTalent.critDmgMult + spiritTalent.critDmgFlat;

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
                onApply: (t: Unit, s: GameState) => s,
                onRemove: (t: Unit, s: GameState) => s
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
        newState = addMurionCharge(newState, murion.id, CHARGE_ON_SKILL_REFRESH, sourceUnitId, eidolonLevel);
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
    const murion = newState.registry.get(createUnitId(summonResult.spirit.id))!;

    // チャージ40%獲得
    newState = addMurionCharge(newState, murion.id, CHARGE_ON_ULT, sourceUnitId, eidolonLevel);

    return newState;
};

const onTurnStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    const murion = getActiveSpirit(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (!murion) return state;

    // ミュリオンのターン開始時の処理
    if (event.sourceId === murion.id) {
        // チャージ100%の場合はENHANCED_SKILLタグにより自動で「あたしが助ける！」に切り替わる
        // チャージ100%未満の場合、通常の「厄介な悪者さん！」が発動（dispatcher経由）
        // A4チャージ追加は「厄介な悪者さん！」発動時（onActionComplete）で処理される
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
    // 「厄介な悪者さん！」発動時のA4処理
    // 「あたしが助ける！」発動時はA4をスキップ（ENHANCED_SKILLタグで判定）
    if (event.sourceId === murion.id && event.subType === 'SKILL') {
        // ENHANCED_SKILLタグがある場合は「あたしが助ける！」を発動したのでA4スキップ
        // （タグはTURN_END_BASEDでターン終了時に自動削除される）
        const hasEnhancedSkill = murion.effects.some(e => e.tags?.includes('ENHANCED_SKILL'));
        if (hasEnhancedSkill) {
            console.log(`[Murion A4] ENHANCED_SKILLタグありのためスキップ（あたしが助ける！発動）`);
            return state;
        }

        let newState = state;

        // A4: 「厄介な悪者さん！」発動時にチャージ5%獲得
        if (source.traces?.some(t => t.id === TRACE_IDS.A4)) {
            console.log(`[Murion A4] 厄介な悪者さん！発動後、チャージ+5%`);
            newState = addMurionCharge(newState, murion.id, CHARGE_ON_SPIRIT_ATTACK_A4, sourceUnitId, eidolonLevel);
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
            const trueDamageResult = calculateTrueDamageWithBreakdown(event.value * additionalDmgMult);

            const result = applyUnifiedDamage(state, attacker, target, trueDamageResult.damage, {
                damageType: '確定ダメージ',
                details: 'ミュリオンの応援',
                skipLog: true, // 統合ログに追記するため個別ログはスキップ
                skipStats: true, // 統計に二重カウントしない
                additionalDamageEntry: {
                    source: attacker.name,
                    name: 'ミュリオンの応援',
                    damageType: 'true_damage',
                    isCrit: trueDamageResult.isCrit,
                    breakdownMultipliers: trueDamageResult.breakdownMultipliers
                }
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
                        critRate: (state.damageModifiers.critRate || 0) + (1.0 - (source.stats.crit_rate || 0))
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
            ep: Math.min(source.stats.max_ep || 0, source.ep + E2_EP_RECOVERY)
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

    return addMurionCharge(state, murion.id, E4_CHARGE_GAIN, sourceUnitId, eidolonLevel);
};

// 天賦: EP10回復ごとにチャージ1%
const onEpGained = (
    event: IEvent, // EpGainEvent
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
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
    return addMurionCharge(state, murion.id, chargeGain, sourceUnitId, eidolonLevel);
};

// --- キャラクター定義 ---
export const trailblazerRemembrance: Character = {
    id: CHARACTER_ID,
    name: '開拓者-記憶',
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
            targetType: 'ally',
            manualTargeting: true, // 「あたしが助ける！」のターゲット指定
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
        lightConeId: 'fly-into-a-pink-tomorrow',
        superimposition: 1,
        relicSetId: 'world-remaking-deliverer',
        ornamentSetId: 'lushaka-the-sunken-seas',
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
                newState = onTurnStart(event as GeneralEvent, newState, sourceUnitId, eidolonLevel);
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
                newState = onEpGained(event, newState, sourceUnitId, eidolonLevel);
            }

            return newState;
        }
    };
};
