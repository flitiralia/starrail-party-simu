import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, IEvent, GameState, Unit, DamageDealtEvent, ActionEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { BreakStatusEffect } from '../../simulator/effect/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { applyUnifiedDamage, publishEvent } from '../../simulator/engine/dispatcher';
import { calculateNormalAdditionalDamage } from '../../simulator/damage';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { TargetSelector } from '../../simulator/engine/selector';

// --- 定数定義 ---
const CHARACTER_ID = 'herta';

const EFFECT_IDS = {
    E6_ATK_BUFF: 'herta-e6-atk',
};

const TRACE_IDS = {
    A2_EFFICIENCY: 'herta-trace-efficiency',
    A4_PUPPET: 'herta-trace-puppet',
    A6_FREEZE: 'herta-trace-freeze',
};

// ... (skipping to config)

// in replace_file_content I can't skip lines in the middle if I want to replace a block.
// But the error was at the top. I should do two replacements? 
// No, I can use multi_replace for this.
// Or I can just fix the top line first, then do the config.
// Let's use multi_replace.

// --- E3/E5パターン ---
// E3: スキルLv+2, 通常Lv+1
// E5: 必殺技Lv+2, 天賦Lv+2

// 通常攻撃 (Lv6基準)
const BASIC_MULT = 1.0;  // Lv6: 100%, Lv7: 110%

// スキル (Lv10基準)
const SKILL_MULT = 1.0;  // Lv10: 100%, Lv12: 110%
const SKILL_HP_THRESHOLD = 0.5;  // HP50%以上条件
const SKILL_HIGH_HP_DMG_BOOST = 0.20;  // HP50%以上の敵への与ダメ+20%

// 必殺技 (Lv10基準)
const ULT_MULT = 2.0;  // Lv10: 200%, Lv12: 216%

// 天賦 (Lv10基準)
const TALENT_MULT = 0.40;  // Lv10: 40%, Lv12: 43%
const TALENT_HP_THRESHOLD = 0.5;  // HP50%以下条件

// 秘技
const TECHNIQUE_ATK_BUFF = 0.40;  // ATK+40%
const TECHNIQUE_DURATION = 3;  // 3ターン継続

// 軌跡
const TRACE_A2_SKILL_DMG_BOOST = 0.25;  // スキル与ダメ+25%
const TRACE_A6_FREEZE_DMG_BOOST = 0.20;  // 凍結敵への与ダメ+20%

// 星魂
const E1_BONUS_DMG_MULT = 0.40;  // E1: ATK40%の付加ダメージ
const E2_CRIT_RATE_PER_STACK = 0.03;  // E2: 会心率+3%/回
const E2_MAX_STACKS = 5;  // E2: 最大5回累積
const E4_TALENT_DMG_BOOST = 0.10;  // E4: 天賦与ダメ+10%
const E6_ATK_BUFF = 0.25;  // E6: 必殺技後ATK+25%
const E6_DURATION = 1;  // E6: 1ターン継続

export const herta: Character = {
    id: 'herta',
    name: 'ヘルタ',
    path: 'Erudition',
    element: 'Ice',
    rarity: 4,
    maxEnergy: 110,
    baseStats: {
        hp: 952,
        atk: 582,
        def: 396,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75  // 知恵
    },

    abilities: {
        basic: {
            id: 'herta-basic',
            name: '何見てるの？',
            type: 'Basic ATK',
            description: '指定した敵単体にヘルタの攻撃力100%分の氷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: BASIC_MULT, toughnessReduction: 10 }],
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'herta-skill',
            name: '一度限りの取引',
            type: 'Skill',
            description: '敵全体にヘルタの攻撃力100%分の氷属性ダメージを与える。敵の残りHPが50%以上の場合、その敵に対して与ダメージ+20%。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.50, toughnessReduction: 5 },  // 50%, 削靭5
                    { multiplier: 0.50, toughnessReduction: 5 },  // 50%, 削靭5
                ],
            },
            energyGain: 30,
            targetType: 'all_enemies',
        },

        ultimate: {
            id: 'herta-ultimate',
            name: '私がかけた魔法だよ',
            type: 'Ultimate',
            description: '敵全体にヘルタの攻撃力200%分の氷属性ダメージを与える。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: ULT_MULT, toughnessReduction: 20 }],
            },
            energyGain: 5,
            targetType: 'all_enemies',
        },

        talent: {
            id: 'herta-talent',
            name: 'やっぱり私がやる',
            type: 'Talent',
            description: '味方の攻撃が敵の残りHPを50%以下にした時、ヘルタは追加攻撃を発動し、敵全体にダメージを与える。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: TALENT_MULT, toughnessReduction: 5 }],
            },
            energyGain: 5,  // 1ヒットあたり5EP
            targetType: 'all_enemies',
        },

        technique: {
            id: 'herta-technique',
            name: '改善すべきだよ',
            type: 'Technique',
            description: '秘技を使用した後、次の戦闘開始時、ヘルタの攻撃力+40%、3ターン継続。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2_EFFICIENCY,
            name: '効率',
            type: 'Bonus Ability',
            description: 'スキルを発動した時、さらに与ダメージ+25%。'
        },
        {
            id: TRACE_IDS.A4_PUPPET,
            name: '人形',
            type: 'Bonus Ability',
            description: '行動制限系デバフを抵抗する確率+35%。'
        },
        {
            id: TRACE_IDS.A6_FREEZE,
            name: '氷結',
            type: 'Bonus Ability',
            description: '必殺技を発動した時、凍結状態の敵に対する与ダメージ+20%。'
        },
        {
            id: 'herta-stat-ice-dmg',
            name: 'ダメージ強化・氷',
            type: 'Stat Bonus',
            description: '氷属性ダメージ+22.4%',
            stat: 'ice_dmg_boost',
            value: 0.224
        },
        {
            id: 'herta-stat-def',
            name: '防御強化',
            type: 'Stat Bonus',
            description: '防御力+22.5%',
            stat: 'def_pct',
            value: 0.225
        },
        {
            id: 'herta-stat-crit',
            name: '会心率強化',
            type: 'Stat Bonus',
            description: '会心率+6.7%',
            stat: 'crit_rate',
            value: 0.067
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '弱みは付け込み',
            description: '通常攻撃を行った時、指定した敵単体の残りHPが50%以下の場合、さらにヘルタの攻撃力40%分の氷属性付加ダメージを与える。'
        },
        e2: {
            level: 2,
            name: '勝てば追い打ち',
            description: '天賦が1回発動するごとに、自身の会心率+3%、この効果は最大で5回累積できる。'
        },
        e3: {
            level: 3,
            name: '私はこういう女なの',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // スキル: 110% (55:55分散)
                { abilityName: 'skill', param: 'damage.hits.0.multiplier', value: 0.55 },
                { abilityName: 'skill', param: 'damage.hits.1.multiplier', value: 0.55 },
                // 通常: 110%
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 }
            ]
        },
        e4: {
            level: 4,
            name: '面子は徹底的に潰す',
            description: '天賦発動時の与ダメージ+10%。'
        },
        e5: {
            level: 5,
            name: '欠点掴んで罵り倒す',
            description: '必殺技のLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                // 必殺技: 216%
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 2.16 },
                // 天賦: 43%
                { abilityName: 'talent', param: 'damage.hits.0.multiplier', value: 0.43 }
            ]
        },
        e6: {
            level: 6,
            name: '誰も私を裏切れない',
            description: '必殺技を発動した後、攻撃力+25%、1ターン継続。'
        }
    },

    defaultConfig: {
        lightConeId: 'before-dawn',
        superimposition: 1,
        relicSetId: 'the-ashblazing-grand-duke',
        ornamentSetId: 'izumo-gensei-and-takama-divine-realm',
        mainStats: {
            body: 'crit_rate',
            feet: 'atk_pct',
            sphere: 'ice_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.15 },
            { stat: 'crit_dmg', value: 0.30 },
            { stat: 'atk_pct', value: 0.15 },
            { stat: 'spd', value: 6 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// --- ヘルパー関数 ---

// 天賦発動時のダメージ処理（ヒット数は対象敵数に応じる）
const executeTalentAttack = (
    state: GameState,
    sourceUnitId: string,
    hitCount: number,
    eidolonLevel: number
): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    const enemies = TargetSelector.select(source, newState, { type: 'all_enemies' });
    if (enemies.length === 0) return newState;

    // E5で天賦Lv+2 → 倍率43%
    const talentMult = eidolonLevel >= 5 ? 0.43 : TALENT_MULT;

    // 各ヒットで敵全体にダメージ
    for (let hit = 0; hit < hitCount; hit++) {
        const currentSource = newState.registry.get(createUnitId(sourceUnitId));
        if (!currentSource) break;

        const currentEnemies = TargetSelector.select(currentSource, newState, { type: 'all_enemies' });

        for (const enemy of currentEnemies) {
            const currentEnemy = newState.registry.get(createUnitId(enemy.id));
            if (!currentEnemy || currentEnemy.hp <= 0) continue;

            // ダメージ計算
            let baseDamage = currentSource.stats.atk * talentMult;

            // E4: 天賦与ダメ+10%
            if (eidolonLevel >= 4) {
                baseDamage *= (1 + E4_TALENT_DMG_BOOST);
            }

            // applyUnifiedDamageを使用
            const result = applyUnifiedDamage(
                newState,
                currentSource,
                currentEnemy,
                baseDamage,
                {
                    damageType: '天賦',
                    details: `やっぱり私がやる (Hit ${hit + 1}/${hitCount})`,
                    isKillRecoverEp: true,
                    skipLog: true, // 統合ログに出力するため、個別のログ出力は抑制
                    additionalDamageEntry: {
                        source: 'ヘルタ',
                        name: '追加攻撃: やっぱり私がやる',
                        damageType: 'additional',
                        isCrit: false, // applyUnifiedDamage 内で計算されるが、ここでは基本情報を渡す
                    }
                }
            );
            newState = result.state;
        }

        // 各ヒットでEP+5
        newState = addEnergyToUnit(newState, sourceUnitId, 5, 0, false, {
            sourceId: sourceUnitId,
            publishEventFn: publishEvent
        });
    }

    return newState;
};

// E2スタック管理
const addE2Stack = (state: GameState, sourceUnitId: string): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    const effectId = `herta-e2-crit-${sourceUnitId}`;
    const existingEffect = source.effects.find(e => e.id === effectId);
    const currentStacks = existingEffect?.stackCount || 0;

    if (currentStacks >= E2_MAX_STACKS) return state;

    const newStacks = currentStacks + 1;

    // 既存エフェクトを削除して新しいものを追加
    let newState = state;
    if (existingEffect) {
        newState = removeEffect(newState, sourceUnitId, effectId);
    }

    const e2Effect: IEffect = {
        id: effectId,
        name: `勝てば追い打ち (会心率+${(newStacks * E2_CRIT_RATE_PER_STACK * 100).toFixed(0)}%)`,
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: newStacks,
        maxStacks: E2_MAX_STACKS,
        modifiers: [{
            target: 'crit_rate' as StatKey,
            value: newStacks * E2_CRIT_RATE_PER_STACK,
            type: 'add',
            source: 'ヘルタE2'
        }],

        /* remove removed */
    };

    return addEffect(newState, sourceUnitId, e2Effect);
};

// --- イベントハンドラー関数 ---

// 戦闘開始時: 秘技のATKバフ
const onBattleStart = (
    event: IEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = source.config?.useTechnique !== false;

    if (useTechnique) {
        // 秘技: ATK+40%、3ターン継続
        const techBuff: IEffect = {
            id: `herta-technique-buff-${sourceUnitId}`,
            name: '改善すべきだよ (ATK+40%)',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_END_BASED',
            skipFirstTurnDecrement: true,
            duration: TECHNIQUE_DURATION,
            modifiers: [{
                target: 'atk_pct' as StatKey,
                value: TECHNIQUE_ATK_BUFF,
                type: 'add',
                source: 'ヘルタ秘技'
            }],

            /* remove removed */
        };
        newState = addEffect(newState, sourceUnitId, techBuff);

        // ログ追加
        newState = {
            ...newState,
            log: [...newState.log, {
                characterName: source.name,
                actionTime: newState.time,
                actionType: '秘技',
                skillPointsAfterAction: newState.skillPoints,
                currentEp: source.ep,
                details: '改善すべきだよ: ATK+40%'
            } as any]
        };
    }

    return newState;
};

// ダメージ発生時: 天賦発動判定
const onDamageDealt = (
    event: DamageDealtEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const herta = state.registry.get(createUnitId(sourceUnitId));
    if (!herta || herta.hp <= 0) return state;

    // 自分の追加攻撃には反応しない（無限ループ防止）
    const actionType = event.actionType;
    if (actionType === '天賦' || actionType === 'FOLLOW_UP_ATTACK') return state;

    // 味方の攻撃のみ
    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker || attacker.isEnemy) return state;

    // ターゲットのHP変動を確認
    const targetId = event.targetId;
    const previousHpRatio = event.previousHpRatio;
    const currentHpRatio = event.currentHpRatio;

    if (!targetId || previousHpRatio === undefined || currentHpRatio === undefined) return state;

    // HP50%の境界を跨いだか確認
    if (previousHpRatio > TALENT_HP_THRESHOLD && currentHpRatio <= TALENT_HP_THRESHOLD) {
        // 天賦発動: 追加攻撃をpendingActionsに追加
        return {
            ...state,
            pendingActions: [
                ...state.pendingActions,
                {
                    type: 'FOLLOW_UP_ATTACK',
                    sourceId: sourceUnitId,
                    targetId: targetId,
                    eidolonLevel,
                    customData: { triggeredEnemyId: targetId }
                } as any
            ]
        };
    }

    return state;
};

// 追加攻撃実行
const onFollowUpAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source || source.hp <= 0) return state;

    let newState = state;

    // HP50%以下の敵の数をカウント（ヒット数決定）
    const enemies = TargetSelector.select(source, newState, { type: 'all_enemies' });
    const lowHpEnemyCount = enemies.filter(e => {
        const maxHp = e.stats.hp;
        return e.hp / maxHp <= TALENT_HP_THRESHOLD;
    }).length;

    const hitCount = Math.max(1, lowHpEnemyCount);

    // 天賦ログ (統合ログシステムがハンドルするため、ここでは手動ログを抑制または情報を渡す形式にする)
    // 既存の手動ログは削除し、統合ログシステムに任せる

    // 天賦攻撃実行
    newState = executeTalentAttack(newState, sourceUnitId, hitCount, eidolonLevel);

    // E2: 会心率スタック追加
    if (eidolonLevel >= 2) {
        newState = addE2Stack(newState, sourceUnitId);
    }

    return newState;
};

// 通常攻撃後: E1の付加ダメージ
const onBasicAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId || eidolonLevel < 1) return state;

    const targetId = event.targetId;
    if (!targetId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    const target = state.registry.get(createUnitId(targetId));
    if (!source || !target || target.hp <= 0) return state;

    // E1: 敵HP≤50%で付加ダメージ
    const hpRatio = target.hp / target.stats.hp;
    if (hpRatio > TALENT_HP_THRESHOLD) return state;

    const baseDamage = source.stats.atk * E1_BONUS_DMG_MULT;
    const finalDamage = calculateNormalAdditionalDamage(source, target, baseDamage);

    const result = applyUnifiedDamage(
        state,
        source,
        target,
        finalDamage,
        {
            damageType: '付加ダメージ',
            details: '弱みは付け込み (E1)',
            isKillRecoverEp: true,
            skipLog: true,
            additionalDamageEntry: {
                source: 'ヘルタ',
                name: '付加ダメージ: 弱みは付け込み (E1)',
                damageType: 'additional',
            }
        }
    );

    return result.state;
};

// 必殺技使用後: E6のATKバフ
const onUltimateUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId || eidolonLevel < 6) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    // E6: ATK+25%、1ターン継続
    const e6Buff: IEffect = {
        id: `${EFFECT_IDS.E6_ATK_BUFF}-${sourceUnitId}`,
        name: '誰も私を裏切れない (ATK+25%)',
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'TURN_END_BASED',
        skipFirstTurnDecrement: true,
        duration: E6_DURATION,
        modifiers: [{
            target: 'atk_pct' as StatKey,
            value: E6_ATK_BUFF,
            type: 'add',
            source: 'ヘルタE6'
        }],

        /* remove removed */
    };

    return addEffect(state, sourceUnitId, e6Buff);
};

// ダメージ計算前: スキルの条件付きダメージ、A2/A6軌跡
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    const targetId = event.targetId;
    const target = targetId ? state.registry.get(createUnitId(targetId)) : null;
    const abilityId = event.abilityId;

    if (!source || !target) return state;

    let newState = state;
    let dmgBoost = 0;

    // スキル使用時
    if (abilityId === 'herta-skill') {
        // スキル: HP50%以上の敵への与ダメ+20%
        const hpRatio = target.hp / target.stats.hp;
        if (hpRatio >= SKILL_HP_THRESHOLD) {
            dmgBoost += SKILL_HIGH_HP_DMG_BOOST;
        }

        // A2軌跡: スキル与ダメ+25%
        if (source.traces?.some(t => t.id === TRACE_IDS.A2_EFFICIENCY)) {
            dmgBoost += TRACE_A2_SKILL_DMG_BOOST;
        }
    }

    // 必殺技使用時
    if (abilityId === 'herta-ultimate') {
        // A6軌跡: 凍結状態の敵への与ダメ+20%
        if (source.traces?.some(t => t.id === TRACE_IDS.A6_FREEZE)) {
            const isFrozen = target.effects.some(e =>
                e.name?.includes('凍結') ||
                (e.type === 'BreakStatus' && (e as BreakStatusEffect).statusType === 'Freeze')
            );
            if (isFrozen) {
                dmgBoost += TRACE_A6_FREEZE_DMG_BOOST;
            }
        }
    }

    // ダメージブーストを適用
    if (dmgBoost > 0) {
        newState = {
            ...newState,
            damageModifiers: {
                ...newState.damageModifiers,
                allTypeDmg: (newState.damageModifiers?.allTypeDmg || 0) + dmgBoost
            }
        };
    }

    return newState;
};

// --- ハンドラーファクトリ ---
export const hertaHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `herta-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',  // 秘技
                'ON_DAMAGE_DEALT',  // 天賦発動判定
                'ON_FOLLOW_UP_ATTACK',  // 天賦実行
                'ON_BASIC_ATTACK',  // E1付加ダメージ
                'ON_ULTIMATE_USED',  // E6 ATKバフ
                'ON_BEFORE_DAMAGE_CALCULATION',  // スキルHP条件、A2/A6軌跡
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            // 戦闘開始時
            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, state, sourceUnitId, eidolonLevel);
            }

            // ダメージ発生時 (天賦発動判定)
            if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event, state, sourceUnitId, eidolonLevel);
            }

            // 追加攻撃実行
            if (event.type === 'ON_FOLLOW_UP_ATTACK' && event.sourceId === sourceUnitId) {
                return onFollowUpAttack(event, state, sourceUnitId, eidolonLevel);
            }

            // 通常攻撃後 (E1)
            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                return onBasicAttack(event, state, sourceUnitId, eidolonLevel);
            }

            // 必殺技使用後 (E6)
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event, state, sourceUnitId, eidolonLevel);
            }

            // ダメージ計算前
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceUnitId) {
                return onBeforeDamageCalculation(event, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
