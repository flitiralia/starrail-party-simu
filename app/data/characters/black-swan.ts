import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, DoTDamageEvent, EnemyDefeatedEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { SimulationLogEntry } from '../../types';

import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect, DoTEffect } from '../../simulator/effect/types';
import { calculateNormalDoTDamageWithBreakdown, calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';
import { applyUnifiedDamage, appendAdditionalDamage, publishEvent, checkDebuffSuccess } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';

// --- 内部型定義 ---
interface ArcanaEffect extends DoTEffect {
    isArcana: true;
}

interface EpiphanyEffect extends IEffect {
    isEpiphany: true;
    resetSkipUsed: boolean;
    epRecoveryUsed: boolean;  // E4用
}

// 型ガード
function isArcanaEffect(effect: IEffect): effect is ArcanaEffect {
    return 'isArcana' in effect && (effect as ArcanaEffect).isArcana === true;
}

function isEpiphanyEffect(effect: IEffect): effect is EpiphanyEffect {
    return 'isEpiphany' in effect && (effect as EpiphanyEffect).isEpiphany === true;
}

// --- 定数定義 ---
const CHARACTER_ID = 'black-swan';

const EFFECT_IDS = {
    ARCANA: (sourceId: string, targetId: string) => `blackswan-arcana-${sourceId}-${targetId}`,
    EPIPHANY: (sourceId: string, targetId: string) => `blackswan-epiphany-${sourceId}-${targetId}`,
    DEF_DOWN: (sourceId: string, targetId: string) => `blackswan-defdown-${sourceId}-${targetId}`,
    A4_ATTACK_COUNTER: (sourceId: string, attackerId: string, targetId: string) => `blackswan-a4-counter-${sourceId}-${attackerId}-${targetId}`,
} as const;

const TRACE_IDS = {
    A2: 'blackswan-trace-a2',  // 蠢く内臓
    A4: 'blackswan-trace-a4',  // チャリスの底の顛末
    A6: 'blackswan-trace-a6',  // ロウソクの影が示す予兆
} as const;

// アルカナ設定
const MAX_ARCANA_STACKS = 50;

// アビリティ値 (レベル別)
const ABILITY_VALUES = {
    // 通常攻撃
    basicMultiplier: { 6: 0.60, 7: 0.66 } as Record<number, number>,
    basicArcanaChance: { 6: 0.65, 7: 0.68 } as Record<number, number>,
    // スキル
    skillMultiplier: { 10: 0.90, 12: 0.99 } as Record<number, number>,
    skillDefDown: { 10: 0.208, 12: 0.22 } as Record<number, number>,
    // 必殺技
    ultDmgUpPct: { 10: 0.25, 12: 0.27 } as Record<number, number>,
    ultMultiplier: { 10: 1.20, 12: 1.296 } as Record<number, number>,
    // 天賦
    talentArcanaChance: { 10: 0.65, 12: 0.68 } as Record<number, number>,
    talentBaseDmgMult: { 10: 2.40, 12: 2.64 } as Record<number, number>,
    talentStackDmgMult: { 10: 0.12, 12: 0.132 } as Record<number, number>,
    talentAdjDmgMult: { 10: 1.80, 12: 1.98 } as Record<number, number>,
};

// 秘技
const TECHNIQUE_BASE_CHANCE = 1.50;
const TECHNIQUE_DECAY_RATE = 0.50;

// A4
const A4_BASE_CHANCE = 0.65;
const A4_MAX_STACKS_PER_ATTACK = 3;

// A6
const A6_EFF_HIT_TO_DMG_RATIO = 0.60;
const A6_MAX_DMG_BOOST = 0.72;

// E1
const E1_RES_DOWN = 0.25;

// E2
const E2_ARCANA_STACKS = 6;

// E4
const E4_EFFECT_RES_DOWN = 0.10;
const E4_EP_RECOVERY = 8;

// E6
const E6_ALLY_ARCANA_CHANCE = 0.65;
const E6_EXTRA_STACK_CHANCE = 0.50;

// --- Character定義 ---
export const blackSwan: Character = {
    id: CHARACTER_ID,
    name: 'ブラックスワン',
    path: 'Nihility',
    element: 'Wind',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1086,
        atk: 659,
        def: 485,
        spd: 102,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100
    },

    abilities: {
        basic: {
            id: 'blackswan-basic',
            name: '洞察、緘黙の黎明',
            type: 'Basic ATK',
            description: '指定した敵単体にブラックスワンの攻撃力60%分の風属性ダメージを与え、65%の基礎確率で「アルカナ」を1層付与する。風化、裂創、燃焼、または感電状態の敵に攻撃を行った後、それぞれ65%の基礎確率でさらに「アルカナ」を1層付与する。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 0.60, toughnessReduction: 10 }],
            },
            energyGain: 20,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'blackswan-skill',
            name: '失墜、偽神の黄昏',
            type: 'Skill',
            description: '指定した敵単体および隣接する敵にブラックスワンの攻撃力90%分の風属性ダメージを与え、100%の基礎確率でターゲットおよび隣接する敵に「アルカナ」を1層付与する。さらに、100%の基礎確率でターゲットおよび隣接する敵の防御力-20.8%、3ターン継続。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 0.90, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: 0.90, toughnessReduction: 10 }],
            },
            energyGain: 30,
            targetType: 'blast',
        },

        ultimate: {
            id: 'blackswan-ultimate',
            name: '彼方の抱擁に酔いしれて',
            type: 'Ultimate',
            description: '敵全体に「開示」状態を付与する、2ターン継続。「開示」状態の敵は自身のターンの被ダメージ+25%。敵全体にブラックスワンの攻撃力120%分の風属性ダメージを与える。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 1.20, toughnessReduction: 20 }],
            },
            energyGain: 5,
            targetType: 'all_enemies',
        },

        talent: {
            id: 'blackswan-talent',
            name: '果てなき運命の機織り',
            type: 'Talent',
            description: '敵のターンが回ってきた時に、その敵は持続ダメージを1回受けるたびに、65%の基礎確率で「アルカナ」を1層付与される。「アルカナ」状態の敵はターンが回ってくるたびにブラックスワンの攻撃力240%分の風属性持続ダメージを受ける、「アルカナ」1層につき、ダメージ倍率+12%。',
        },

        technique: {
            id: 'blackswan-technique',
            name: '真相を取り、表象を捨てる',
            type: 'Technique',
            description: '秘技を使用した後、次の戦闘開始時、150%の基礎確率で敵それぞれに「アルカナ」を1層付与する。また「アルカナ」の付与が成功した敵に、さらに「アルカナ」を1層付与する。その敵への「アルカナ」の付与は、失敗するまで繰り返される。付与が成功するたび、次に「アルカナ」を付与する基礎確率が前回の50%になる。',
        }
    },

    traces: [
        {
            id: TRACE_IDS.A2,
            name: '蠢く内臓',
            type: 'Bonus Ability',
            description: '風化、裂創、燃焼、または感電状態の敵単体に戦闘スキルを発動した後、それぞれ65%の基礎確率でさらに「アルカナ」を1層付与する。'
        },
        {
            id: TRACE_IDS.A4,
            name: 'チャリスの底の顛末',
            type: 'Bonus Ability',
            description: '戦闘に入る時、65%の基礎確率で敵に「アルカナ」を1層付与する。敵が味方単体の攻撃中に持続ダメージを1回受けるたびに、65%の基礎確率で「アルカナ」が1層付与される。1回の攻撃で最大3層付与される。'
        },
        {
            id: TRACE_IDS.A6,
            name: 'ロウソクの影が示す予兆',
            type: 'Bonus Ability',
            description: '自身の与ダメージが、効果命中の60%分アップする。最大で与ダメージ+72%。'
        },
        {
            id: 'blackswan-stat-atk',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct',
            value: 0.28
        },
        {
            id: 'blackswan-stat-wind',
            name: '風属性ダメージ',
            type: 'Stat Bonus',
            description: '風属性ダメージ+14.4%',
            stat: 'wind_dmg_boost',
            value: 0.144
        },
        {
            id: 'blackswan-stat-hit',
            name: '効果命中',
            type: 'Stat Bonus',
            description: '効果命中+10.0%',
            stat: 'effect_hit_rate',
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '知恵の七柱',
            description: 'ブラックスワンが戦闘可能状態の時、風化、裂創、燃焼、感電状態の敵に対応する風、物理、炎、雷属性の耐性がそれぞれ25%ダウンする。'
        },
        e2: {
            level: 2,
            name: '子羊よ、私のために泣くなかれ',
            description: '「アルカナ」状態の敵が倒された時、100%の基礎確率で隣接する敵に「アルカナ」を6層付与する。'
        },
        e3: {
            level: 3,
            name: '下界は上界に倣う',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                // スキル: 90% → 99%
                { abilityName: 'skill', param: 'damage.mainHits.0.multiplier', value: 0.99 },
                { abilityName: 'skill', param: 'damage.adjacentHits.0.multiplier', value: 0.99 },
            ]
        },
        e4: {
            level: 4,
            name: '涙もまた贈り物',
            description: '「開示」状態の敵の効果抵抗-10%。「開示」状態の敵のターンが回ってきた時、または倒された時、ブラックスワンのEPを8回復する。EP回復効果は「開示」状態の継続時間内に1回まで発動できる。再度「開示」状態を付与すると、発動可能回数がリセットされる。'
        },
        e5: {
            level: 5,
            name: '渡り鳥の道',
            description: '必殺技のLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                // 必殺技: 120% → 129.6%
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 1.296 },
                // 通常攻撃: 60% → 66%
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.66 },
            ]
        },
        e6: {
            level: 6,
            name: '神は善、苦役者は未だ知らず',
            description: 'ブラックスワン以外の味方が敵に攻撃を行った後、ブラックスワンは65%の基礎確率で敵に「アルカナ」を1層付与する。ブラックスワンが敵に「アルカナ」を付与する時、50%の固定確率でその回に付与する「アルカナ」の層数+1層。'
        }
    },

    defaultConfig: {
        lightConeId: 'reforged-remembrance',
        superimposition: 1,
        relicSetId: 'prisoner-in-deep-confinement',
        ornamentSetId: 'pan-cosmic-commercial-enterprise',
        mainStats: {
            body: 'effect_hit_rate',
            feet: 'spd',
            sphere: 'wind_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'effect_hit_rate', value: 0.30 },
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'spd', value: 6 },
            { stat: 'break_effect', value: 0.10 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// --- ヘルパー関数 ---

// DoT状態判定
function hasDoTState(target: Unit, dotType: 'WindShear' | 'Bleed' | 'Burn' | 'Shock'): boolean {
    return target.effects.some(e => {
        const dot = e as DoTEffect;
        // dotTypeを確認、または名前で判定
        return dot.dotType === dotType ||
            (dotType === 'WindShear' && e.name?.includes('風化')) ||
            (dotType === 'Bleed' && e.name?.includes('裂創')) ||
            (dotType === 'Burn' && e.name?.includes('燃焼')) ||
            (dotType === 'Shock' && e.name?.includes('感電'));
    });
}

// アルカナ層数取得
function getArcanaStacks(target: Unit, sourceId: string): number {
    const arcana = target.effects.find(e => e.id === EFFECT_IDS.ARCANA(sourceId, target.id));
    return arcana?.stackCount || 0;
}

// アルカナ作成
function createArcanaEffect(sourceId: string, targetId: string, stacks: number = 1): ArcanaEffect {
    return {
        id: EFFECT_IDS.ARCANA(sourceId, targetId),
        name: `アルカナ (${stacks}層)`,
        category: 'DEBUFF',
        type: 'DoT',
        dotType: 'Arcana',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        damageCalculation: 'multiplier',
        multiplier: 0,  // 動的計算
        stackCount: stacks,
        maxStacks: MAX_ARCANA_STACKS,
        isArcana: true,
        isCleansable: false,  // アルカナは解除不可


    };
}

// 開示エフェクト作成
function createEpiphanyEffect(sourceId: string, targetId: string, dmgUp: number, eidolonLevel: number): EpiphanyEffect {
    const modifiers = [{
        target: 'vulnerability' as StatKey,
        value: dmgUp,
        type: 'add' as const,
        source: '開示'
    }];

    // E4: 効果抵抗-10%
    if (eidolonLevel >= 4) {
        modifiers.push({
            target: 'effect_res' as StatKey,
            value: -E4_EFFECT_RES_DOWN,
            type: 'add' as const,
            source: '開示 (E4)'
        });
    }

    return {
        id: EFFECT_IDS.EPIPHANY(sourceId, targetId),
        name: '開示',
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: 2,
        skipFirstTurnDecrement: true,
        modifiers,
        isEpiphany: true,
        resetSkipUsed: false,
        epRecoveryUsed: false,


    };
}

// 防御力デバフ作成
function createDefDownEffect(sourceId: string, targetId: string, defDown: number): IEffect {
    return {
        id: EFFECT_IDS.DEF_DOWN(sourceId, targetId),
        name: '防御力ダウン',
        category: 'DEBUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_END_BASED',
        duration: 3,
        skipFirstTurnDecrement: true,
        modifiers: [{
            target: 'def_pct' as StatKey,
            value: -defDown,
            type: 'add' as const,
            source: '失墜、偽神の黄昏'
        }],


    };
}

// アルカナ付与（確率判定＋E6追加層処理込み）
function tryApplyArcana(
    state: GameState,
    sourceId: string,
    targetId: string,
    baseChance: number,
    eidolonLevel: number,
    stacksToAdd: number = 1
): GameState {
    const source = state.registry.get(createUnitId(sourceId));
    const target = state.registry.get(createUnitId(targetId));
    if (!source || !target) return state;

    // 効果命中/抵抗判定（checkDebuffSuccessを使用）
    // アルカナは特殊DoTなので'Debuff'として判定
    if (!checkDebuffSuccess(source, target, baseChance, 'Debuff')) {
        return state;
    }

    let actualStacks = stacksToAdd;

    // E6: 50%固定確率で+1層
    if (eidolonLevel >= 6 && Math.random() < E6_EXTRA_STACK_CHANCE) {
        actualStacks += 1;
    }

    return applyArcanaStacks(state, sourceId, targetId, actualStacks);
}

// アルカナ層数追加（確率判定なし）
function applyArcanaStacks(state: GameState, sourceId: string, targetId: string, stacks: number): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    const existingArcana = target.effects.find(e => e.id === EFFECT_IDS.ARCANA(sourceId, targetId));
    const currentStacks = existingArcana?.stackCount || 0;
    const newStacks = Math.min(currentStacks + stacks, MAX_ARCANA_STACKS);

    if (existingArcana) {
        // 既存のアルカナを更新
        const updatedEffect = {
            ...existingArcana,
            stackCount: newStacks,
            name: `アルカナ (${newStacks}層)`
        };
        const updatedEffects = target.effects.map(e =>
            e.id === existingArcana.id ? updatedEffect : e
        );
        return {
            ...state,
            registry: state.registry.update(createUnitId(targetId), u => ({ ...u, effects: updatedEffects }))
        };
    } else {
        // 新規アルカナ追加
        return addEffect(state, targetId, createArcanaEffect(sourceId, targetId, newStacks));
    }
}

// アルカナを1層にリセット
function resetArcanaToOne(state: GameState, sourceId: string, targetId: string): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    const existingArcana = target.effects.find(e => e.id === EFFECT_IDS.ARCANA(sourceId, targetId));
    if (!existingArcana) return state;

    const updatedEffect = {
        ...existingArcana,
        stackCount: 1,
        name: `アルカナ (1層)`
    };
    const updatedEffects = target.effects.map(e =>
        e.id === existingArcana.id ? updatedEffect : e
    );
    return {
        ...state,
        registry: state.registry.update(createUnitId(targetId), u => ({ ...u, effects: updatedEffects }))
    };
}

// 開示のresetSkipUsedフラグを更新
function markEpiphanyResetUsed(state: GameState, sourceId: string, targetId: string): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    const epiphany = target.effects.find(e => e.id === EFFECT_IDS.EPIPHANY(sourceId, targetId));
    if (!epiphany || !isEpiphanyEffect(epiphany)) return state;

    const updatedEffect: EpiphanyEffect = { ...epiphany, resetSkipUsed: true };
    const updatedEffects = target.effects.map(e =>
        e.id === epiphany.id ? updatedEffect : e
    );
    return {
        ...state,
        registry: state.registry.update(createUnitId(targetId), u => ({ ...u, effects: updatedEffects }))
    };
}

// 開示のepRecoveryUsedフラグを更新
function markEpiphanyEpRecoveryUsed(state: GameState, sourceId: string, targetId: string): GameState {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    const epiphany = target.effects.find(e => e.id === EFFECT_IDS.EPIPHANY(sourceId, targetId));
    if (!epiphany || !isEpiphanyEffect(epiphany)) return state;

    const updatedEffect: EpiphanyEffect = { ...epiphany, epRecoveryUsed: true };
    const updatedEffects = target.effects.map(e =>
        e.id === epiphany.id ? updatedEffect : e
    );
    return {
        ...state,
        registry: state.registry.update(createUnitId(targetId), u => ({ ...u, effects: updatedEffects }))
    };
}

// --- イベントハンドラー ---

// 戦闘開始時
const onBattleStart = (
    event: GeneralEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const blackSwanUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!blackSwanUnit) return state;

    let newState = state;
    const enemies = newState.registry.getAliveEnemies();

    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = blackSwanUnit.config?.useTechnique !== false;

    // A4: 戦闘開始時、65%の基礎確率で敵にアルカナ1層
    if (blackSwanUnit.traces?.some(t => t.id === TRACE_IDS.A4)) {
        enemies.forEach(enemy => {
            newState = tryApplyArcana(newState, sourceUnitId, enemy.id, A4_BASE_CHANCE, eidolonLevel, 1);
        });
    }

    // 秘技: 150%基礎確率でアルカナ、成功するたびに確率半減して再抽選
    if (useTechnique) {
        enemies.forEach(enemy => {
            let currentChance = TECHNIQUE_BASE_CHANCE;
            const source = newState.registry.get(createUnitId(sourceUnitId));
            const target = newState.registry.get(createUnitId(enemy.id));
            if (!source || !target) return;

            while (currentChance > 0.01) {  // 1%未満になったら終了
                // checkDebuffSuccessを使用（アルカナは特殊DoTなので'Debuff'として判定）
                if (!checkDebuffSuccess(source, target, currentChance, 'Debuff')) break;

                // 成功: アルカナ1層付与
                let stacksToAdd = 1;
                // E6: 50%固定確率で+1層
                if (eidolonLevel >= 6 && Math.random() < E6_EXTRA_STACK_CHANCE) {
                    stacksToAdd += 1;
                }
                newState = applyArcanaStacks(newState, sourceUnitId, enemy.id, stacksToAdd);

                // 次の確率を半減
                currentChance *= TECHNIQUE_DECAY_RATE;
            }
        });
    }

    return newState;
};

// 通常攻撃後
const onBasicAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const targetId = event.targetId;
    if (!targetId) return state;

    const target = state.registry.get(createUnitId(targetId));
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!target || !source) return state;

    let newState = state;

    // 通常攻撃レベル
    const basicLevel = calculateAbilityLevel(eidolonLevel, 5, 'Basic');
    const arcanaChance = getLeveledValue(ABILITY_VALUES.basicArcanaChance, basicLevel);

    // 基本アルカナ付与
    newState = tryApplyArcana(newState, sourceUnitId, targetId, arcanaChance, eidolonLevel, 1);

    // 開示状態 + アルカナ状態 または DoT状態チェックで追加アルカナ
    const freshTarget = newState.registry.get(createUnitId(targetId));
    if (!freshTarget) return newState;

    const hasEpiphany = freshTarget.effects.some(e => isEpiphanyEffect(e));
    const hasArcana = freshTarget.effects.some(e => isArcanaEffect(e));

    // 開示+アルカナ状態なら4種類全てのDoTがあるとみなす
    const hasAllDoTsViaEpiphany = hasEpiphany && hasArcana;

    // 風化、裂創、燃焼、感電のそれぞれについて判定
    const dotTypes: Array<'WindShear' | 'Bleed' | 'Burn' | 'Shock'> = ['WindShear', 'Bleed', 'Burn', 'Shock'];
    dotTypes.forEach(dotType => {
        if (hasAllDoTsViaEpiphany || hasDoTState(freshTarget, dotType)) {
            newState = tryApplyArcana(newState, sourceUnitId, targetId, arcanaChance, eidolonLevel, 1);
        }
    });

    return newState;
};

// スキル使用後
const onSkillUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // スキルレベル
    const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill');
    const defDown = getLeveledValue(ABILITY_VALUES.skillDefDown, skillLevel);

    // メインターゲット
    const targetId = event.targetId;
    if (targetId) {
        const target = newState.registry.get(createUnitId(targetId));
        if (target) {
            // 100%基礎確率でアルカナ1層
            newState = tryApplyArcana(newState, sourceUnitId, targetId, 1.0, eidolonLevel, 1);
            // 100%基礎確率で防御力デバフ（効果命中/抵抗判定）
            if (checkDebuffSuccess(source, target, 1.0, 'Debuff')) {
                newState = addEffect(newState, targetId, createDefDownEffect(sourceUnitId, targetId, defDown));
            }
        }

        // A2: DoT状態の敵に追加アルカナ
        if (source.traces?.some(t => t.id === TRACE_IDS.A2)) {
            const target = newState.registry.get(createUnitId(targetId));
            if (target) {
                const hasEpiphany = target.effects.some(e => isEpiphanyEffect(e));
                const hasArcana = target.effects.some(e => isArcanaEffect(e));
                const hasAllDoTsViaEpiphany = hasEpiphany && hasArcana;

                const dotTypes: Array<'WindShear' | 'Bleed' | 'Burn' | 'Shock'> = ['WindShear', 'Bleed', 'Burn', 'Shock'];
                dotTypes.forEach(dotType => {
                    if (hasAllDoTsViaEpiphany || hasDoTState(target, dotType)) {
                        newState = tryApplyArcana(newState, sourceUnitId, targetId, A4_BASE_CHANCE, eidolonLevel, 1);
                    }
                });
            }
        }
    }

    // 隣接ターゲット
    const adjacentIds = event.adjacentIds || [];
    adjacentIds.forEach(adjId => {
        const adjTarget = newState.registry.get(createUnitId(adjId));
        if (adjTarget) {
            // 100%基礎確率でアルカナ1層
            newState = tryApplyArcana(newState, sourceUnitId, adjId, 1.0, eidolonLevel, 1);
            // 100%基礎確率で防御力デバフ（効果命中/抵抗判定）
            if (checkDebuffSuccess(source, adjTarget, 1.0, 'Debuff')) {
                newState = addEffect(newState, adjId, createDefDownEffect(sourceUnitId, adjId, defDown));
            }

            // A2: DoT状態の敵に追加アルカナ
            if (source.traces?.some(t => t.id === TRACE_IDS.A2)) {
                const freshTarget = newState.registry.get(createUnitId(adjId));
                if (freshTarget) {
                    const hasEpiphany = freshTarget.effects.some(e => isEpiphanyEffect(e));
                    const hasArcana = freshTarget.effects.some(e => isArcanaEffect(e));
                    const hasAllDoTsViaEpiphany = hasEpiphany && hasArcana;

                    const dotTypes: Array<'WindShear' | 'Bleed' | 'Burn' | 'Shock'> = ['WindShear', 'Bleed', 'Burn', 'Shock'];
                    dotTypes.forEach(dotType => {
                        if (hasAllDoTsViaEpiphany || hasDoTState(freshTarget, dotType)) {
                            newState = tryApplyArcana(newState, sourceUnitId, adjId, A4_BASE_CHANCE, eidolonLevel, 1);
                        }
                    });
                }
            }
        }
    });

    return newState;
};

// 必殺技使用後
const onUltimateUsed = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;
    const enemies = newState.registry.getAliveEnemies();

    // 必殺技レベル
    const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');
    const dmgUp = getLeveledValue(ABILITY_VALUES.ultDmgUpPct, ultLevel);

    // 全敵に開示付与
    enemies.forEach(enemy => {
        newState = addEffect(newState, enemy.id, createEpiphanyEffect(sourceUnitId, enemy.id, dmgUp, eidolonLevel));
    });

    return newState;
};

// DoTダメージ時（天賦: 他DoTでアルカナ付与 + アルカナダメージ処理）
const onDoTDamage = (
    event: DoTDamageEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const blackSwan = state.registry.get(createUnitId(sourceUnitId));
    if (!blackSwan) return state;

    const targetId = event.targetId;
    if (!targetId) return state;

    let newState = state;

    // 天賦: 敵が持続ダメージを1回受けるたびに、65%の基礎確率でアルカナを1層付与
    // ただしアルカナ自体のDoTは除外（アルカナダメージは別途処理）
    if (event.dotType !== 'Arcana') {
        const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
        const arcanaChance = getLeveledValue(ABILITY_VALUES.talentArcanaChance, talentLevel);
        newState = tryApplyArcana(newState, sourceUnitId, targetId, arcanaChance, eidolonLevel, 1);

        // A4: 味方の攻撃中にDoTダメージを受けた敵にアルカナ付与（最大3層/攻撃）
        // 現在のターンオーナーが味方（ブラック・スワン以外）の場合に発動
        if (blackSwan.traces?.some(t => t.id === TRACE_IDS.A4)) {
            const currentTurnOwner = newState.currentTurnOwnerId
                ? newState.registry.get(newState.currentTurnOwnerId)
                : null;
            if (currentTurnOwner && !currentTurnOwner.isEnemy) {
                // 攻撃者とターゲットごとのカウンターキー
                const counterKey = EFFECT_IDS.A4_ATTACK_COUNTER(sourceUnitId, currentTurnOwner.id, targetId);
                const currentCount = newState.cooldowns[counterKey] || 0;

                if (currentCount < A4_MAX_STACKS_PER_ATTACK) {
                    newState = tryApplyArcana(newState, sourceUnitId, targetId, A4_BASE_CHANCE, eidolonLevel, 1);
                    // カウンターを増加
                    newState = {
                        ...newState,
                        cooldowns: {
                            ...newState.cooldowns,
                            [counterKey]: currentCount + 1
                        }
                    };
                }
            }
        }

        return newState;
    }

    // 以下はアルカナダメージの処理
    if (event.sourceId !== sourceUnitId) return state;

    const source = state.registry.get(createUnitId(sourceUnitId));
    const target = state.registry.get(createUnitId(targetId));
    if (!source || !target) return state;

    // アルカナ層数取得
    const arcanaStacks = getArcanaStacks(target, sourceUnitId);
    if (arcanaStacks <= 0) return state;

    // 天賦レベル
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const baseMult = getLeveledValue(ABILITY_VALUES.talentBaseDmgMult, talentLevel);
    const stackMult = getLeveledValue(ABILITY_VALUES.talentStackDmgMult, talentLevel);
    const adjMult = getLeveledValue(ABILITY_VALUES.talentAdjDmgMult, talentLevel);
    const arcanaChance = getLeveledValue(ABILITY_VALUES.talentArcanaChance, talentLevel);

    // ダメージ計算: 基礎倍率 + (層数-1) × スタック倍率
    const totalMultiplier = baseMult + (stackMult * (arcanaStacks - 1));
    const baseDamage = source.stats.atk * totalMultiplier;

    // 7層以上: 防御力20%無視
    const defIgnore = arcanaStacks >= 7 ? 0.20 : 0;

    // DoTダメージ計算
    const dotResult = calculateNormalDoTDamageWithBreakdown(source, target, baseDamage, { defIgnore });

    // ダメージ適用
    const result = applyUnifiedDamage(
        newState,
        source,
        target,
        dotResult.damage,
        {
            damageType: 'DOT_DAMAGE',
            details: `アルカナ (${arcanaStacks}層)`,
            skipLog: true,
            skipStats: false
        }
    );
    newState = result.state;

    // ログに追加
    newState = appendAdditionalDamage(newState, {
        source: source.name,
        name: `アルカナ (${arcanaStacks}層)`,
        damage: dotResult.damage,
        target: target.name,
        damageType: 'dot',
        isCrit: false,
        breakdownMultipliers: dotResult.breakdownMultipliers
    });

    // 3層以上: 隣接にダメージ + アルカナ付与
    if (arcanaStacks >= 3) {
        const enemies = newState.registry.getAliveEnemies();
        const targetIndex = enemies.findIndex(e => e.id === targetId);
        const adjacentIndices = [targetIndex - 1, targetIndex + 1].filter(i => i >= 0 && i < enemies.length);

        adjacentIndices.forEach(adjIndex => {
            const adjEnemy = enemies[adjIndex];
            if (!adjEnemy) return;

            const adjBaseDamage = source.stats.atk * adjMult;
            const adjDotResult = calculateNormalDoTDamageWithBreakdown(source, adjEnemy, adjBaseDamage, { defIgnore });

            const adjResult = applyUnifiedDamage(
                newState,
                source,
                adjEnemy,
                adjDotResult.damage,
                {
                    damageType: 'DOT_DAMAGE',
                    details: 'アルカナ (隣接)',
                    skipLog: true,
                    skipStats: false
                }
            );
            newState = adjResult.state;

            // 隣接にアルカナ付与
            newState = tryApplyArcana(newState, sourceUnitId, adjEnemy.id, arcanaChance, eidolonLevel, 1);
        });
    }

    // E4: EP回復
    if (eidolonLevel >= 4) {
        const freshTarget = newState.registry.get(createUnitId(targetId));
        if (freshTarget) {
            const epiphany = freshTarget.effects.find(e => isEpiphanyEffect(e)) as EpiphanyEffect | undefined;
            if (epiphany && !epiphany.epRecoveryUsed) {
                newState = markEpiphanyEpRecoveryUsed(newState, sourceUnitId, targetId);
                newState = addEnergyToUnit(newState, sourceUnitId, E4_EP_RECOVERY, 0, false, {
                    sourceId: sourceUnitId,
                    publishEventFn: publishEvent
                });
            }
        }
    }

    // アルカナリセット判定
    const freshTarget = newState.registry.get(createUnitId(targetId));
    if (freshTarget) {
        const epiphany = freshTarget.effects.find(e => isEpiphanyEffect(e)) as EpiphanyEffect | undefined;
        if (epiphany && !epiphany.resetSkipUsed) {
            // 開示状態でリセットスキップ可能
            newState = markEpiphanyResetUsed(newState, sourceUnitId, targetId);
        } else {
            // 1層にリセット
            newState = resetArcanaToOne(newState, sourceUnitId, targetId);
        }
    }

    return newState;
};

// 味方攻撃時（A4, E6）
const onAttack = (
    event: ActionEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    // 自分自身の攻撃は除外（通常攻撃・スキルで処理済み）
    if (event.sourceId === sourceUnitId) return state;

    const blackSwan = state.registry.get(createUnitId(sourceUnitId));
    if (!blackSwan) return state;

    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker || attacker.isEnemy) return state;

    let newState = state;
    const targetId = event.targetId;
    if (!targetId) return state;

    // A4: 味方の攻撃中にDoTダメージを受けた敵にアルカナ（最大3層/攻撃）
    // 攻撃開始時にカウンターをリセット
    if (blackSwan.traces?.some(t => t.id === TRACE_IDS.A4)) {
        const enemies = newState.registry.getAliveEnemies();
        const updatedCooldowns = { ...newState.cooldowns };
        enemies.forEach(enemy => {
            const counterKey = EFFECT_IDS.A4_ATTACK_COUNTER(sourceUnitId, attacker.id, enemy.id);
            updatedCooldowns[counterKey] = 0;
        });
        newState = { ...newState, cooldowns: updatedCooldowns };
    }

    // E6: 味方攻撃時65%でアルカナ付与
    if (eidolonLevel >= 6) {
        newState = tryApplyArcana(newState, sourceUnitId, targetId, E6_ALLY_ARCANA_CHANCE, eidolonLevel, 1);

        // 隣接にも適用
        const adjacentIds = event.adjacentIds || [];
        adjacentIds.forEach(adjId => {
            newState = tryApplyArcana(newState, sourceUnitId, adjId, E6_ALLY_ARCANA_CHANCE, eidolonLevel, 1);
        });
    }

    return newState;
};

// 敵撃破時（E2, E4）
const onEnemyDefeated = (
    event: EnemyDefeatedEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const blackSwan = state.registry.get(createUnitId(sourceUnitId));
    if (!blackSwan) return state;

    const defeatedEnemy = event.defeatedEnemy;
    if (!defeatedEnemy) return state;

    let newState = state;

    // E2: アルカナ状態の敵撃破時、隣接に6層付与
    // 注意: EnemyDefeatedEventには敵のインデックス情報がないため、
    // 現時点では全敵にアルカナを付与する（ゲーム仕様の完全な再現には
    // イベントに敵インデックス情報を追加する必要がある）
    if (eidolonLevel >= 2) {
        const hadArcana = defeatedEnemy.effects.some(e => isArcanaEffect(e));
        if (hadArcana) {
            const enemies = newState.registry.getAliveEnemies();
            enemies.forEach(enemy => {
                newState = tryApplyArcana(newState, sourceUnitId, enemy.id, 1.0, eidolonLevel, E2_ARCANA_STACKS);
            });
        }
    }

    // E4: 開示状態の敵撃破時EP回復
    if (eidolonLevel >= 4) {
        const epiphany = defeatedEnemy.effects.find(e => isEpiphanyEffect(e)) as EpiphanyEffect | undefined;
        if (epiphany && !epiphany.epRecoveryUsed) {
            newState = addEnergyToUnit(newState, sourceUnitId, E4_EP_RECOVERY, 0, false, {
                sourceId: sourceUnitId,
                publishEventFn: publishEvent
            });
        }
    }

    return newState;
};

// ダメージ計算前（E1耐性ダウン, A6与ダメブースト）
const onBeforeDamageCalculation = (
    event: BeforeDamageCalcEvent,
    state: GameState,
    sourceUnitId: string,
    eidolonLevel: number
): GameState => {
    const blackSwan = state.registry.get(createUnitId(sourceUnitId));
    if (!blackSwan) return state;

    const attacker = state.registry.get(createUnitId(event.sourceId));
    const targetId = event.targetId;
    if (!targetId) return state;
    const target = state.registry.get(createUnitId(targetId));
    if (!attacker || !target || !target.isEnemy) return state;

    let newState = state;

    // A6: 自身の攻撃時、効果命中の60%を与ダメブーストに変換（最大72%）
    if (event.sourceId === sourceUnitId && blackSwan.traces?.some(t => t.id === TRACE_IDS.A6)) {
        const effectHit = blackSwan.stats.effect_hit_rate || 0;
        const dmgBoost = Math.min(effectHit * A6_EFF_HIT_TO_DMG_RATIO, A6_MAX_DMG_BOOST);
        newState = {
            ...newState,
            damageModifiers: {
                ...newState.damageModifiers,
                allTypeDmg: (newState.damageModifiers.allTypeDmg || 0) + dmgBoost
            }
        };
    }

    // E1: DoT状態の敵に対応属性耐性ダウン
    if (eidolonLevel >= 1) {
        const epiphany = target.effects.find(e => isEpiphanyEffect(e));

        // 風化 → 風耐性ダウン
        if ((epiphany || hasDoTState(target, 'WindShear')) && attacker.element === 'Wind') {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: (newState.damageModifiers.resReduction || 0) + E1_RES_DOWN
                }
            };
        }
        // 裂創 → 物理耐性ダウン
        if ((epiphany || hasDoTState(target, 'Bleed')) && attacker.element === 'Physical') {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: (newState.damageModifiers.resReduction || 0) + E1_RES_DOWN
                }
            };
        }
        // 燃焼 → 炎耐性ダウン
        if ((epiphany || hasDoTState(target, 'Burn')) && attacker.element === 'Fire') {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: (newState.damageModifiers.resReduction || 0) + E1_RES_DOWN
                }
            };
        }
        // 感電 → 雷耐性ダウン
        if ((epiphany || hasDoTState(target, 'Shock')) && attacker.element === 'Lightning') {
            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    resReduction: (newState.damageModifiers.resReduction || 0) + E1_RES_DOWN
                }
            };
        }
    }

    return newState;
};

// --- ハンドラーファクトリ ---
export const blackSwanHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `black-swan-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_BASIC_ATTACK',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_DOT_DAMAGE',
                'ON_ATTACK',
                'ON_ENEMY_DEFEATED',
                'ON_BEFORE_DAMAGE_CALCULATION',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const blackSwanUnit = state.registry.get(createUnitId(sourceUnitId));
            if (!blackSwanUnit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                return onBasicAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_DOT_DAMAGE') {
                return onDoTDamage(event as DoTDamageEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ATTACK') {
                return onAttack(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_ENEMY_DEFEATED') {
                return onEnemyDefeated(event as EnemyDefeatedEvent, state, sourceUnitId, eidolonLevel);
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
