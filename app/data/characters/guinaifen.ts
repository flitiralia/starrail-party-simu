import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, DoTDamageEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createCharacterDoTEffect } from '../../simulator/effect/breakEffects';
import { calculateNormalDoTDamageWithBreakdown, calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';
import { applyUnifiedDamage, appendAdditionalDamage, publishEvent, checkDebuffSuccess } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { advanceAction } from '../../simulator/engine/utils';

// --- 定数定義 ---
const CHARACTER_ID = 'guinaifen';

const EFFECT_IDS = {
    BURN: (sourceId: string, targetId: string) => `guinaifen-burn-${sourceId}-${targetId}`,
    FIREKISS: (sourceId: string, targetId: string) => `guinaifen-firekiss-${sourceId}-${targetId}`,
    E1_RES_DOWN: (sourceId: string, targetId: string) => `guinaifen-e1-res-down-${sourceId}-${targetId}`,
} as const;

const TRACE_IDS = {
    A2: 'guinaifen-trace-a2',  // 縁竿
    A4: 'guinaifen-trace-a4',  // 刃の輪くぐり
    A6: 'guinaifen-trace-a6',  // 裸足踏刀
} as const;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 通常攻撃倍率
    basicMult: { 6: 1.00, 7: 1.10 } as Record<number, number>,
    // スキルダメージ倍率
    skillMainMult: { 10: 1.20, 12: 1.32 } as Record<number, number>,
    skillAdjMult: { 10: 0.40, 12: 0.44 } as Record<number, number>,
    // スキル燃焼倍率
    skillBurnMult: { 10: 2.18, 12: 2.40 } as Record<number, number>,
    // 必殺技倍率
    ultMult: { 10: 1.20, 12: 1.296 } as Record<number, number>,
    // 必殺技燃焼起爆倍率
    ultDetonateMult: { 10: 0.92, 12: 0.96 } as Record<number, number>,
    // 天賦「火喰い」被ダメ増加
    talentFirekissVuln: { 10: 0.07, 12: 0.076 } as Record<number, number>,
};

// 基礎確率
const BASE_PROB_SKILL_BURN = 1.0;
const BASE_PROB_BASIC_BURN = 0.8;  // A2
const BASE_PROB_FIREKISS = 1.0;

// 燃焼継続ターン
const BURN_DURATION = 2;

// 火喰い
const FIREKISS_DURATION = 3;
const FIREKISS_MAX_STACKS = 3;

// 秘技
const TECHNIQUE_MULT = 0.50;
const TECHNIQUE_HITS = 4;

// E1
const E1_RES_DOWN_VALUE = 0.10;
const E1_RES_DOWN_DURATION = 2;

// E2
const E2_BURN_MULT_BONUS = 0.40;

// E4
const E4_EP_RECOVERY = 2;

// E6
const E6_FIREKISS_MAX_STACKS = 4;

// A4: 行動順前進
const A4_ADVANCE_PERCENT = 0.25;

// A6: 燃焼敵への与ダメ増加
const A6_DMG_BOOST = 0.20;

// --- キャラクター定義 ---
export const guinaifen: Character = {
    id: CHARACTER_ID,
    name: '桂乃芬',
    path: 'Nihility',
    element: 'Fire',
    rarity: 4,
    maxEnergy: 120,
    baseStats: {
        hp: 882,
        atk: 582,
        def: 441,
        spd: 106,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100
    },

    abilities: {
        basic: {
            id: 'guinaifen-basic',
            name: '喝采満場',
            type: 'Basic ATK',
            description: '指定した敵単体に桂乃芬の攻撃力100%分の炎属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.00, toughnessReduction: 10 }],
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'guinaifen-skill',
            name: '出だし好調',
            type: 'Skill',
            description: '指定した敵単体に桂乃芬の攻撃力120%分の炎属性ダメージを与え、隣接する敵に桂乃芬の攻撃力40%分の炎属性ダメージを与える。100%の基礎確率で燃焼状態を付与。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 1.20, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: 0.40, toughnessReduction: 10 }],
            },
            energyGain: 30,
            targetType: 'blast',
        },

        ultimate: {
            id: 'guinaifen-ultimate',
            name: '十八番を披露するね',
            type: 'Ultimate',
            description: '敵全体に桂乃芬の攻撃力120%分の炎属性ダメージを与える。燃焼中の敵には燃焼ダメージの92%を即時発動。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 1.20, toughnessReduction: 20 }],
            },
            energyGain: 5,
            targetType: 'all_enemies',
        },

        talent: {
            id: 'guinaifen-talent',
            name: '古来、芸人は君子に頼る',
            type: 'Talent',
            description: '敵が燃焼状態によるダメージを受けた後、100%の基礎確率で「火喰い」状態にする。「火喰い」状態の敵の被ダメージ+7.0%。最大3層累積、3ターン継続。',
        },

        technique: {
            id: 'guinaifen-technique',
            name: '大道芸',
            type: 'Technique',
            description: '戦闘開始時、ランダムな敵にダメージを4回与え、100%の基礎確率で「火喰い」状態にする。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2,
            name: '縁竿',
            type: 'Bonus Ability',
            description: '通常攻撃は80%の基礎確率で敵に戦闘スキルが与えるものと同じ燃焼状態を付与する。'
        },
        {
            id: TRACE_IDS.A4,
            name: '刃の輪くぐり',
            type: 'Bonus Ability',
            description: '戦闘開始時、桂乃芬の行動順が25%早まる。'
        },
        {
            id: TRACE_IDS.A6,
            name: '裸足踏刀',
            type: 'Bonus Ability',
            description: '燃焼状態の敵に対する与ダメージ+20%。'
        },
        {
            id: 'guinaifen-stat-fire',
            name: '炎属性ダメージ強化',
            type: 'Stat Bonus',
            description: '炎属性ダメージ強化+22.4%',
            stat: 'fire_dmg_boost',
            value: 0.224
        },
        {
            id: 'guinaifen-stat-break',
            name: '撃破特効強化',
            type: 'Stat Bonus',
            description: '撃破特効+24.0%',
            stat: 'break_effect',
            value: 0.24
        },
        {
            id: 'guinaifen-stat-hit',
            name: '効果命中強化',
            type: 'Stat Bonus',
            description: '効果命中+10.0%',
            stat: 'effect_hit_rate',
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '逆立ち麺食い',
            description: '戦闘スキルを発動した時、100%の基礎確率で攻撃を受けた敵の効果抵抗-10%、2ターン継続。'
        },
        e2: {
            level: 2,
            name: '歯を磨きながら口笛を吹く',
            description: '敵が燃焼状態の時、桂乃芬の通常攻撃と戦闘スキルがその敵に付与する燃焼状態のダメージ倍率+40%。'
        },
        e3: {
            level: 3,
            name: '胸元で岩砕き',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // スキル: Lv10(120%) → Lv12(132%)
                { abilityName: 'skill', param: 'damage.mainHits.0.multiplier', value: 1.32 },
                { abilityName: 'skill', param: 'damage.adjacentHits.0.multiplier', value: 0.44 },
                // 通常: Lv6(100%) → Lv7(110%)
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 }
            ]
        },
        e4: {
            level: 4,
            name: '喉元で槍先受け止め',
            description: '桂乃芬が付与した燃焼状態がダメージを与えるたびに、桂乃芬のEPを2回復する。'
        },
        e5: {
            level: 5,
            name: '剣呑み',
            description: '必殺技のLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                // 必殺技: Lv10(120%) → Lv12(129.6%)
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 1.296 }
            ]
        },
        e6: {
            level: 6,
            name: '素手で銃弾つかみ',
            description: '「火喰い」の累積可能層数+1。'
        }
    },

    defaultConfig: {
        lightConeId: 'eyes-of-the-prey',
        superimposition: 5,
        relicSetId: 'prisoner_in_deep_confinement',
        ornamentSetId: 'pan_cosmic_commercial_enterprise',
        mainStats: {
            body: 'effect_hit_rate',
            feet: 'spd',
            sphere: 'fire_dmg_boost',
            rope: 'energy_regen_rate',
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

// --- ヘルパー関数 ---

// 燃焼付与関数
function applyBurnToEnemy(
    state: GameState,
    source: Unit,
    target: Unit,
    eidolonLevel: number
): GameState {
    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
    let burnMult = getLeveledValue(ABILITY_VALUES.skillBurnMult, skillLevel);

    // E2: 燃焼中の敵への燃焼倍率+40%
    if (eidolonLevel >= 2) {
        const hasBurn = target.effects.some(e =>
            e.id.startsWith('guinaifen-burn-') ||
            (e as any).dotType === 'Burn'
        );
        if (hasBurn) {
            burnMult += E2_BURN_MULT_BONUS;
        }
    }

    const burnEffect = createCharacterDoTEffect(source, target, 'Burn', burnMult, BURN_DURATION);
    // IDを桂乃芬固有のものに変更
    burnEffect.id = EFFECT_IDS.BURN(source.id, target.id);

    return addEffect(state, target.id, burnEffect);
}

// 敵が燃焼中かチェック
function hasBurnEffect(target: Unit): boolean {
    return target.effects.some(e =>
        e.id.includes('burn') ||
        (e as any).dotType === 'Burn'
    );
}

// 火喰い付与/スタック追加関数
function applyFirekiss(
    state: GameState,
    source: Unit,
    target: Unit,
    eidolonLevel: number
): GameState {
    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const vulnValue = getLeveledValue(ABILITY_VALUES.talentFirekissVuln, talentLevel);
    const maxStacks = eidolonLevel >= 6 ? E6_FIREKISS_MAX_STACKS : FIREKISS_MAX_STACKS;

    const existingFirekiss = target.effects.find(e =>
        e.id === EFFECT_IDS.FIREKISS(source.id, target.id)
    );

    if (existingFirekiss) {
        // スタック追加
        const currentStacks = existingFirekiss.stackCount || 1;
        const newStacks = Math.min(currentStacks + 1, maxStacks);

        const updatedEffect: IEffect = {
            ...existingFirekiss,
            stackCount: newStacks,
            name: `火喰い (${newStacks}層)`,
            duration: FIREKISS_DURATION,  // リセット
            modifiers: [{
                target: 'dmg_taken' as StatKey,
                value: vulnValue * newStacks,
                type: 'add',
                source: '火喰い'
            }]
        };

        const updatedEffects = target.effects.map(e =>
            e.id === existingFirekiss.id ? updatedEffect : e
        );

        return {
            ...state,
            registry: state.registry.update(createUnitId(target.id), u => ({ ...u, effects: updatedEffects }))
        };
    } else {
        // 新規付与
        const firekissEffect: IEffect = {
            id: EFFECT_IDS.FIREKISS(source.id, target.id),
            name: '火喰い (1層)',
            category: 'DEBUFF',
            sourceUnitId: source.id,
            durationType: 'TURN_END_BASED',
            duration: FIREKISS_DURATION,
            skipFirstTurnDecrement: true,
            stackCount: 1,
            maxStacks: maxStacks,
            modifiers: [{
                target: 'dmg_taken' as StatKey,
                value: vulnValue,
                type: 'add',
                source: '火喰い'
            }],

            /* remove removed */
        };

        return addEffect(state, target.id, firekissEffect);
    }
}

// --- イベントハンドラー ---

// 戦闘開始時: 秘技 + A4行動順前進
const onBattleStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const guinaifenUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!guinaifenUnit) return state;

    let newState = state;

    // A4: 戦闘開始時、行動順25%前進
    if (guinaifenUnit.traces?.some(t => t.id === TRACE_IDS.A4)) {
        newState = advanceAction(newState, sourceUnitId, A4_ADVANCE_PERCENT, 'percent');
    }

    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = guinaifenUnit.config?.useTechnique !== false;

    if (useTechnique) {
        const enemies = newState.registry.getAliveEnemies();

        // 秘技: ランダムな敵に4ヒット
        for (let hit = 0; hit < TECHNIQUE_HITS; hit++) {
            const freshGuin = newState.registry.get(createUnitId(sourceUnitId));
            if (!freshGuin) break;

            const aliveEnemies = newState.registry.getAliveEnemies();
            if (aliveEnemies.length === 0) break;

            // ランダムなターゲットを選択
            const randomIndex = Math.floor(Math.random() * aliveEnemies.length);
            const target = aliveEnemies[randomIndex];

            // ダメージ計算
            const baseDamage = freshGuin.stats.atk * TECHNIQUE_MULT;
            const dmgCalc = calculateNormalAdditionalDamageWithCritInfo(freshGuin, target, baseDamage);

            const result = applyUnifiedDamage(
                newState,
                freshGuin,
                target,
                dmgCalc.damage,
                {
                    damageType: '秘技',
                    details: `大道芸 (${hit + 1}/${TECHNIQUE_HITS})`,
                    isCrit: dmgCalc.isCrit,
                    breakdownMultipliers: dmgCalc.breakdownMultipliers,
                    isKillRecoverEp: true
                }
            );
            newState = result.state;

            // 火喰い付与 (100%基礎確率、効果命中/抵抗判定)
            const freshTarget = newState.registry.get(createUnitId(target.id));
            const freshSource = newState.registry.get(createUnitId(sourceUnitId));
            if (freshTarget && freshSource && checkDebuffSuccess(freshSource, freshTarget, BASE_PROB_FIREKISS, 'Debuff')) {
                newState = applyFirekiss(newState, freshSource, freshTarget, eidolonLevel);
            }
        }
    }

    return newState;
};

// 通常攻撃後: A2燃焼付与
const onBasicAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    // A2軌跡チェック
    if (!source.traces?.some(t => t.id === TRACE_IDS.A2)) return state;

    const targetId = event.targetId;
    if (!targetId) return state;

    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    // 80%基礎確率で燃焼付与（効果命中/抵抗判定）
    if (checkDebuffSuccess(source, target, BASE_PROB_BASIC_BURN, 'Burn')) {
        return applyBurnToEnemy(state, source, target, eidolonLevel);
    }

    return state;
};

// スキル使用後: 燃焼付与 + E1効果抵抗デバフ
const onSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // メインターゲットと隣接ターゲットに燃焼付与
    const targetId = event.targetId;
    const adjacentIds = event.adjacentIds || [];
    const allTargets = targetId ? [targetId, ...adjacentIds] : adjacentIds;

    for (const tId of allTargets) {
        const target = newState.registry.get(createUnitId(tId));
        const freshSource = newState.registry.get(createUnitId(sourceUnitId));
        if (!target || !freshSource) continue;

        // 100%基礎確率で燃焼付与（効果命中/抵抗判定）
        if (checkDebuffSuccess(freshSource, target, BASE_PROB_SKILL_BURN, 'Burn')) {
            newState = applyBurnToEnemy(newState, freshSource, target, eidolonLevel);
        }

        // E1: 効果抵抗-10%デバフ（効果命中/抵抗判定）
        if (eidolonLevel >= 1 && checkDebuffSuccess(freshSource, target, 1.0, 'Debuff')) {
            const resDownDebuff: IEffect = {
                id: EFFECT_IDS.E1_RES_DOWN(sourceUnitId, tId),
                name: '効果抵抗-10%',
                category: 'DEBUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_END_BASED',
                duration: E1_RES_DOWN_DURATION,
                skipFirstTurnDecrement: true,
                modifiers: [{
                    target: 'effect_res' as StatKey,
                    value: -E1_RES_DOWN_VALUE,
                    type: 'add',
                    source: 'E1'
                }],

                /* remove removed */
            };
            newState = addEffect(newState, tId, resDownDebuff);
        }
    }

    return newState;
};

// 必殺技使用後: 燃焼起爆
const onUltimateUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;
    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
    const detonateMult = getLeveledValue(ABILITY_VALUES.ultDetonateMult, ultLevel);

    const enemies = newState.registry.getAliveEnemies();

    for (const enemy of enemies) {
        // 燃焼中の敵のみ
        if (!hasBurnEffect(enemy)) continue;

        const freshSource = newState.registry.get(createUnitId(sourceUnitId));
        const freshEnemy = newState.registry.get(createUnitId(enemy.id));
        if (!freshSource || !freshEnemy) continue;

        // 燃焼エフェクトを探す
        const burnEffect = freshEnemy.effects.find(e =>
            e.id.includes('burn') ||
            (e as any).dotType === 'Burn'
        ) as any;

        if (!burnEffect) continue;

        // 燃焼ダメージ計算
        let baseDamage = 0;
        if (burnEffect.damageCalculation === 'multiplier') {
            baseDamage = freshSource.stats.atk * (burnEffect.multiplier || 0);
        } else {
            baseDamage = burnEffect.baseDamage || 0;
        }

        const dotResult = calculateNormalDoTDamageWithBreakdown(freshSource, freshEnemy, baseDamage);
        const detonateDamage = dotResult.damage * detonateMult;

        if (detonateDamage > 0) {
            const result = applyUnifiedDamage(
                newState,
                freshSource,
                freshEnemy,
                detonateDamage,
                {
                    damageType: '燃焼起爆',
                    details: `燃焼起爆 (${(detonateMult * 100).toFixed(0)}%)`,
                    skipLog: true,
                    skipStats: false
                }
            );
            newState = result.state;

            newState = appendAdditionalDamage(newState, {
                source: freshSource.name,
                name: `燃焼起爆 (${(detonateMult * 100).toFixed(0)}%)`,
                damage: detonateDamage,
                target: freshEnemy.name,
                damageType: 'dot',
                isCrit: false,
                breakdownMultipliers: dotResult.breakdownMultipliers
            });
        }
    }

    return newState;
};

// DoTダメージ発生後: 天賦「火喰い」付与 + E4 EP回復
const onDotDamage = (
    event: DoTDamageEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 燃焼ダメージのみ対象
    if (event.dotType !== 'Burn') return state;

    // 桂乃芬がソースの燃焼のみ
    if (event.sourceId !== sourceUnitId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 天賦: 火喰い付与（効果命中/抵抗判定）
    const targetId = event.targetId;
    if (targetId) {
        const target = newState.registry.get(createUnitId(targetId));
        if (target && checkDebuffSuccess(source, target, BASE_PROB_FIREKISS, 'Debuff')) {
            newState = applyFirekiss(newState, source, target, eidolonLevel);
        }
    }

    // E4: EP+2
    if (eidolonLevel >= 4) {
        newState = addEnergyToUnit(newState, sourceUnitId, E4_EP_RECOVERY, 0, false, {
            sourceId: sourceUnitId,
            publishEventFn: publishEvent
        });
    }

    return newState;
};

// ダメージ計算前: A6「裸足踏刀」燃焼敵への与ダメ+20%
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string
): GameState => {
    // 桂乃芬自身の攻撃のみ
    if (event.sourceId !== sourceUnitId) return state;
    if (!event.targetId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    // A6軌跡チェック
    if (!source.traces?.some(t => t.id === TRACE_IDS.A6)) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    if (!target || !target.isEnemy) return state;

    // 燃焼中の敵かチェック
    if (!hasBurnEffect(target)) return state;

    // 与ダメ+20%を追加
    return {
        ...state,
        damageModifiers: {
            ...state.damageModifiers,
            allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + A6_DMG_BOOST
        }
    };
};

// --- ハンドラーファクトリ ---
export const guinaifenHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `guinaifen-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_BASIC_ATTACK',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_DOT_DAMAGE',
                'ON_BEFORE_DAMAGE_CALCULATION',
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const guinaifenUnit = state.registry.get(createUnitId(sourceUnitId));
            if (!guinaifenUnit) return state;

            // 戦闘開始時: 秘技 + A4
            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            // 通常攻撃後: A2燃焼付与
            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                return onBasicAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            // スキル使用後: 燃焼付与 + E1
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            // 必殺技使用後: 燃焼起爆
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            // DoTダメージ発生: 天賦 + E4
            if (event.type === 'ON_DOT_DAMAGE') {
                return onDotDamage(event as DoTDamageEvent, state, sourceUnitId, eidolonLevel);
            }

            // ダメージ計算前: A6
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId);
            }

            return state;
        }
    };
};
