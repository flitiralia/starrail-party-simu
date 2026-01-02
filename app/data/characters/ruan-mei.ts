import { Character, Element, Path, StatKey, SimulationLogEntry } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateBreakDamageWithBreakdown } from '../../simulator/damage';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { delayAction } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';


// --- 定数定義 ---
const CHARACTER_ID = 'ruan-mei';

const EFFECT_IDS = {
    AURA_SKILL: 'ruan-mei-strings-aura',
    BUFF_SKILL: 'ruan-mei-strings-buff',
    FIELD_ULTIMATE: 'ruan-mei-field',
    BUFF_ULTIMATE: 'ruan-mei-field-buff',
    DEBUFF_ZANBAI: 'ruan-mei-zanbai',
    NO_REAPPLY_ZANBAI: 'ruan-mei-zanbai-no-reapply', // "残梅再付与不可"
    BUFF_TALENT_SPD: 'ruan-mei-talent-spd',
    BUFF_A2_BREAK: 'ruan-mei-trace-a2',
    BUFF_E4_BREAK: 'ruan-mei-e4-break',
};

const TRACE_IDS = {
    A2_BREATH: 'ruan-mei-trace-a2',
    A4_IMAGINATION: 'ruan-mei-trace-a4',
    A6_CANDLELIGHT: 'ruan-mei-trace-a6',
};

// --- E3/E5パターン (非標準) ---
// E3: 必殺技Lv+2, 天賦Lv+2 (Pattern 1 is standard for this, wait, check doc)
// The file comment says E3: Ult+2, Talent+2. This matches Pattern 1 (Standard) for Ult/Talent.
// The file comment says E5: Skill+2, Basic+1. This matches Pattern 1 (Standard) for Skill/Basic.
// So Ruan Mei follows Pattern 1.

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // スキル与ダメージアップ: E5でLv12に上昇
    skillDmgBoost: {
        10: 0.32,
        12: 0.352
    } as Record<number, number>,
    // 必殺技耐性貫通: E3でLv12に上昇
    ultResPen: {
        10: 0.25,
        12: 0.27
    } as Record<number, number>,
    // 必殺技撃破ダメージ倍率: E3でLv12に上昇
    ultBreakDmg: {
        10: 0.50,
        12: 0.54
    } as Record<number, number>,
    // 天賦速度バフ: E3でLv12に上昇
    talentSpd: {
        10: 0.10,
        12: 0.104
    } as Record<number, number>,
    // 天賦撃破ダメージ: E3でLv12に上昇
    talentBreakDmg: {
        10: 1.20,
        12: 1.32
    } as Record<number, number>,
};

// 通常攻撃
const BASIC_MULT_LV6 = 1.00;
const BASIC_MULT_LV7 = 1.10;
const BASIC_TOUGHNESS = 10;
const BASIC_EP = 20;

// スキル
const SKILL_BREAK_EFF = 0.50;
const SKILL_DURATION = 3;
const SKILL_EP = 30;

// 必殺技
const ULT_DURATION = 2;
const ULT_ACTION_DELAY_BASE = 0.10; // 10%基本遅延
const ULT_EP = 5;

// 軌跡
const TRACE_A2_BREAK_EFFECT = 0.20;
const TRACE_A4_EP_REGEN = 5;
const TRACE_A6_THRESHOLD = 1.20;
const TRACE_A6_BOOST_PER_10 = 0.06;
const TRACE_A6_MAX_BOOST = 0.36;

// 星魂
const E1_DEF_IGNORE = 0.20;
const E2_ATK_BOOST = 0.40;
const E4_BREAK_EFFECT = 1.00;
const E4_DURATION = 3;
const E6_TALENT_BONUS = 2.00;

export const ruanMei: Character = {
    id: 'ruan-mei',
    name: 'ルアン・メェイ',
    path: 'Harmony',
    element: 'Ice',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1086,
        atk: 659,
        def: 485,
        spd: 104,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'ruan-mei-basic',
            name: '幽蘭の調べ',
            type: 'Basic ATK',
            description: '指定した敵単体にルアン・メェイの攻撃力110%分の氷属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.00, toughnessReduction: 10 }], // Lv6基準、E5でLv7(1.10)
            },
            energyGain: 20,
        },
        skill: {
            id: 'ruan-mei-skill',
            name: '緩く捻りて',
            type: 'Skill',
            description: '「弦外の音」を獲得する。味方全体の与ダメージ+35.2%、弱点撃破効率+50%。3ターン継続。',
            targetType: 'self',
            energyGain: 30,
            effects: [], // Handled by Handler
        },
        ultimate: {
            id: 'ruan-mei-ultimate',
            name: '花に濡れても雫は払わず',
            type: 'Ultimate',
            description: '結界を展開し、味方全体の全耐性貫通+27%。味方攻撃後に敵へ「残梅」を付与。2ターン継続。',
            targetType: 'self',
            energyGain: 5,
            effects: [], // Field handled by handler
        },
        talent: {
            id: 'ruan-mei-talent',
            name: 'フラクタルの螺旋',
            type: 'Talent',
            description: '自身を除く味方全体の速度+10.4%。弱点撃破後、氷属性撃破ダメージ132%の追加ダメージ。',
            targetType: 'all_allies',
        },
        technique: {
            id: 'ruan-mei-technique',
            name: '琴拭い、霓裳撫でる',
            type: 'Technique',
            description: '戦闘開始時に自動でスキルを1回発動（SP消費なし）。',
        },
    },
    traces: [
        {
            id: 'ruan-mei-trace-a2',
            name: '呼吸の中',
            type: 'Bonus Ability',
            description: '味方全体の撃破特効+20%。',
        },
        {
            id: 'ruan-mei-trace-a4',
            name: '広がる想像',
            type: 'Bonus Ability',
            description: 'ルアン・メェイのターンが回ってきた時、自身のEPを5回復する。',
        },
        {
            id: 'ruan-mei-trace-a6',
            name: '水面を照らす燭火',
            type: 'Bonus Ability',
            description: '撃破特効120%超過10%につき、スキルの与ダメージアップ効果+6%、最大+36%。',
        },
        {
            id: 'ruan-mei-stat-break',
            name: '撃破強化',
            type: 'Stat Bonus',
            description: '撃破特効+37.3%',
            stat: 'break_effect',
            value: 0.373,
        },
        {
            id: 'ruan-mei-stat-def',
            name: '防御強化',
            type: 'Stat Bonus',
            description: '防御力+22.5%',
            stat: 'def_pct',
            value: 0.225,
        },
        {
            id: 'ruan-mei-stat-spd',
            name: '速度強化',
            type: 'Stat Bonus',
            description: '速度+5',
            stat: 'spd',
            value: 5,
        },
    ],
    eidolons: {
        e1: {
            level: 1,
            name: '神経刺繍図',
            description: '必殺技の結界発動中、味方全体がダメージを与えた時、敵の防御力を20%無視する。',
        },
        e2: {
            level: 2,
            name: '通りし芒の道',
            description: 'ルアン・メェイがフィールド上にいる場合、弱点撃破状態の敵に対する味方全体の攻撃力+40%。',
        },
        e3: {
            level: 3,
            name: '煙衫を綾取る緑意',
            description: '必殺技Lv.+2、天賦Lv.+2',
            abilityModifiers: [
                // E3で必殺技と天賦がLv12に（E3/E5パターン非標準タイプを使用）
            ],
        },
        e4: {
            level: 4,
            name: '銅鏡前にて神を探す',
            description: '敵が弱点撃破された時、ルアン・メェイの撃破特効+100%、3ターン継続。',
        },
        e5: {
            level: 5,
            name: '気怠く弄る玲瓏釵',
            description: '戦闘スキルLv.+2、通常攻撃Lv.+1',
            abilityModifiers: [
                // E5でスキルがLv12に、通常攻撃がLv7に
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 }, // Lv7
            ],
        },
        e6: {
            level: 6,
            name: '紗巾脱ぎかけ団扇に落ちる',
            description: '必殺技結界の継続時間+1ターン。天賦の撃破ダメージ倍率+200%。',
        },
    },
    defaultConfig: {
        lightConeId: 'past-self-in-mirror',
        superimposition: 1,
        relicSetId: 'watchmaker_master_of_dream_machinations',
        ornamentSetId: 'lusaka_by_the_sunken_sea',
        mainStats: {
            body: 'def_pct',
            feet: 'spd',
            sphere: 'hp_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'break_effect', value: 0.80 },
            { stat: 'spd', value: 20 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    },
};

// ===============================
// ヘルパー関数
// ===============================

/**
 * 「弦外の音」オーラを作成（スキル用）
 */
function createStringOutsideSoundAura(sourceId: string, duration: number, eidolonLevel: number): IEffect {
    // E5でスキルLv+2 → Lv12の与ダメージアップを使用
    // E5でスキルLv+2
    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
    const dmgBoostValue = getLeveledValue(ABILITY_VALUES.skillDmgBoost, skillLevel);

    // A6: 撃破特効120%超過時の追加ダメージアップ
    // 実際の計算はonApply時に行う

    return {
        id: `${EFFECT_IDS.AURA_SKILL}-${sourceId}`,
        name: '弦外の音オーラ',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: duration,
        onApply: (t, s) => {
            // 味方全体にリンクバフを付与
            let newState = s;
            const ruanMeiUnit = s.registry.get(createUnitId(sourceId));
            if (!ruanMeiUnit) return s;

            // A6計算: 撃破特効120%超過10%につき与ダメ+6%、最大36%
            let a6Bonus = 0;
            const trace6 = ruanMeiUnit.traces?.find(tr => tr.id === TRACE_IDS.A6_CANDLELIGHT);
            if (trace6) {
                const breakEffect = ruanMeiUnit.stats.break_effect || 0;
                if (breakEffect > TRACE_A6_THRESHOLD) {
                    const excess = breakEffect - TRACE_A6_THRESHOLD;
                    a6Bonus = Math.min(Math.floor(excess / 0.10) * TRACE_A6_BOOST_PER_10, TRACE_A6_MAX_BOOST);
                }
            }

            const totalDmgBoost = dmgBoostValue + a6Bonus;

            s.registry.getAliveAllies().forEach(u => {
                const buff: IEffect = {
                    id: `${EFFECT_IDS.BUFF_SKILL}-${sourceId}-${u.id}`,
                    name: '弦外の音',
                    category: 'BUFF',
                    sourceUnitId: sourceId,
                    durationType: 'LINKED',
                    duration: 0,
                    linkedEffectId: `${EFFECT_IDS.AURA_SKILL}-${sourceId}`,
                    onApply: (target, state) => {
                        const newModifiers = [...target.modifiers,
                        {
                            source: '弦外の音',
                            target: 'all_type_dmg_boost' as StatKey,
                            type: 'add' as const,
                            value: totalDmgBoost,
                        },
                        {
                            source: '弦外の音',
                            target: 'break_efficiency' as StatKey,
                            type: 'add' as const,
                            value: SKILL_BREAK_EFF,
                        }
                        ];
                        // イミュータブルに更新
                        return {
                            ...state,
                            registry: state.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                        };
                    },
                    onRemove: (target, state) => {
                        const newModifiers = target.modifiers.filter(m => m.source !== '弦外の音');
                        return {
                            ...state,
                            registry: state.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                        };
                    }
                };
                newState = addEffect(newState, u.id, buff);
            });
            return newState;
        },
        onRemove: (t, s) => {
            // リンクバフは自動削除されるが、念のため
            let newState = s;
            s.registry.getAliveAllies().forEach(u => {
                newState = removeEffect(newState, u.id, `${EFFECT_IDS.BUFF_SKILL}-${sourceId}-${u.id}`);
            });
            return newState;
        },


    };
}

/**
 * 結界エフェクトを作成（必殺技用）
 */
function createFieldEffect(sourceId: string, duration: number, eidolonLevel: number): IEffect {
    // E3で必殺技Lv+2 → Lv12の耐性貫通値を使用
    // E3で必殺技Lv+2
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const resPenValue = getLeveledValue(ABILITY_VALUES.ultResPen, ultLevel);

    return {
        id: `${EFFECT_IDS.FIELD_ULTIMATE}-${sourceId}`,
        name: '花に濡れても雫は払わず',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: duration,
        onApply: (t, s) => {
            // 味方全体に耐性貫通バフを付与
            let newState = s;
            s.registry.getAliveAllies().forEach(u => {
                const modifiers = [
                    {
                        source: '結界: 耐性貫通',
                        target: 'all_type_res_pen' as StatKey,
                        type: 'add' as const,
                        value: resPenValue,
                    }
                ];
                // E1: 結界中の防御無視+20%
                if (eidolonLevel >= 1) {
                    modifiers.push({
                        source: '結界: 防御無視 (E1)',
                        target: 'def_ignore' as StatKey,
                        type: 'add' as const,
                        value: E1_DEF_IGNORE,
                    });
                }

                const buff: IEffect = {
                    id: `${EFFECT_IDS.BUFF_ULTIMATE}-${sourceId}-${u.id}`,
                    name: '結界: 耐性貫通',
                    category: 'BUFF',
                    sourceUnitId: sourceId,
                    durationType: 'LINKED',
                    duration: 0,
                    linkedEffectId: `${EFFECT_IDS.FIELD_ULTIMATE}-${sourceId}`,
                    onApply: (target, state) => {
                        const newModifiers = [...target.modifiers, ...modifiers];
                        return {
                            ...state,
                            registry: state.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                        };
                    },
                    onRemove: (target, state) => {
                        const newModifiers = target.modifiers.filter(m =>
                            m.source !== '結界: 耐性貫通' && m.source !== '結界: 防御無視 (E1)'
                        );
                        return {
                            ...state,
                            registry: state.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                        };
                    }
                };
                newState = addEffect(newState, u.id, buff);
            });
            return newState;
        },
        onRemove: (t, s) => {
            let newState = s;
            s.registry.getAliveAllies().forEach(u => {
                newState = removeEffect(newState, u.id, `${EFFECT_IDS.BUFF_ULTIMATE}-${sourceId}-${u.id}`);
            });
            return newState;
        },


    };
}


// ===============================
// ハンドラー関数 (抽出)
// ===============================

// 戦闘開始時
const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    let newState = state;
    console.log('[Ruan Mei Handler] ON_BATTLE_START event received');

    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = unit.config?.useTechnique !== false;

    if (useTechnique) {
        // 秘技: 戦闘開始時に自動でスキル発動（SP消費なし）
        const skillAura = createStringOutsideSoundAura(sourceUnitId, SKILL_DURATION, eidolonLevel);
        newState = addEffect(newState, sourceUnitId, skillAura);

        // ログ記録
        newState = {
            ...newState,
            log: [...newState.log, {
                characterName: unit.name,
                actionTime: newState.time,
                actionType: '秘技',
                skillPointsAfterAction: newState.skillPoints,
                damageDealt: 0,
                healingDone: 0,
                shieldApplied: 0,
                currentEp: unit.ep,
                details: '秘技: 弦外の音を付与（SP消費なし）'
            } as SimulationLogEntry]
        };
    }

    // 天賦: 自身以外の味方全体に速度バフ（永続）
    // E3で天賦Lv+2
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const spdBoostValue = getLeveledValue(ABILITY_VALUES.talentSpd, talentLevel);

    const allies = newState.registry.getAliveAllies().filter(u => u.id !== sourceUnitId);
    allies.forEach(ally => {
        const spdBuff: IEffect = {
            id: `${EFFECT_IDS.BUFF_TALENT_SPD}-${sourceUnitId}-${ally.id}`,
            name: 'フラクタルの螺旋',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            onApply: (target, s) => {
                const newModifiers = [...target.modifiers, {
                    source: 'フラクタルの螺旋',
                    target: 'spd_pct' as StatKey,
                    type: 'add' as const,
                    value: spdBoostValue,
                }];
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                };
            },
            onRemove: (target, s) => {
                const newModifiers = target.modifiers.filter(m => m.source !== 'フラクタルの螺旋');
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                };
            },


        };
        newState = addEffect(newState, ally.id, spdBuff);
    });

    // A2 軌跡: 味方全体の撃破特効+20%（永続）
    const trace2 = unit.traces?.find(t => t.id === TRACE_IDS.A2_BREATH);
    if (trace2) {
        newState.registry.getAliveAllies().forEach(u => {
            const breakBuff: IEffect = {
                id: `${EFFECT_IDS.BUFF_A2_BREAK}-${sourceUnitId}-${u.id}`,
                name: '呼吸の中',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,
                onApply: (target, s) => {
                    const newModifiers = [...target.modifiers, {
                        source: '呼吸の中',
                        target: 'break_effect' as StatKey,
                        type: 'add' as const,
                        value: TRACE_A2_BREAK_EFFECT,
                    }];
                    return {
                        ...s,
                        registry: s.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                    };
                },
                onRemove: (target, s) => {
                    const newModifiers = target.modifiers.filter(m => m.source !== '呼吸の中');
                    return {
                        ...s,
                        registry: s.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                    };
                },


            };
            newState = addEffect(newState, u.id, breakBuff);
        });
    }

    console.log('[Ruan Mei Handler] Battle start effects applied');
    return newState;
};

// ターン開始時
const onTurnStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, _eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return state;

    // A4 軌跡: ターン開始時にEP+5
    const trace4 = unit.traces?.find(t => t.id === TRACE_IDS.A4_IMAGINATION);
    if (trace4) {
        return addEnergyToUnit(state, sourceUnitId, TRACE_A4_EP_REGEN, 0, false, {
            sourceId: sourceUnitId,
            publishEventFn: publishEvent
        });
    }
    return state;
};

// スキル使用時
const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    // 「弦外の音」オーラを付与/更新
    const skillAura = createStringOutsideSoundAura(sourceUnitId, SKILL_DURATION, eidolonLevel);
    return addEffect(state, sourceUnitId, skillAura);
};

// 必殺技使用時
const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (event.sourceId !== sourceUnitId) return state;

    // E6: 結界持続時間+1ターン
    const fieldDuration = eidolonLevel >= 6 ? ULT_DURATION + 1 : ULT_DURATION;

    // 結界エフェクトを付与
    const fieldEffect = createFieldEffect(sourceUnitId, fieldDuration, eidolonLevel);
    const newState = addEffect(state, sourceUnitId, fieldEffect);

    console.log('[Ruan Mei Handler] Ultimate field deployed, duration:', fieldDuration);
    return newState;
};

// 攻撃時（残梅付与チェック）
const onAttack = (event: ActionEvent, state: GameState, sourceUnitId: string): GameState => {
    const currentUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!currentUnit) return state;

    const hasField = currentUnit.effects.find(e => e.id === `${EFFECT_IDS.FIELD_ULTIMATE}-${sourceUnitId}`);
    if (hasField && event.targetId) {
        // 結界展開中：攻撃した敵に「残梅」を付与
        const targetEnemy = state.registry.get(createUnitId(event.targetId));
        if (targetEnemy && targetEnemy.isEnemy && targetEnemy.hp > 0) {
            // 残梅がまだ付与されていない かつ 再付与不可マーカーがない場合のみ付与
            const hasZanBai = targetEnemy.effects.find(e => e.id === `${EFFECT_IDS.DEBUFF_ZANBAI}-${sourceUnitId}-${targetEnemy.id}`);
            const hasNoReapply = targetEnemy.effects.find(e => e.id === `${EFFECT_IDS.NO_REAPPLY_ZANBAI}-${sourceUnitId}-${targetEnemy.id}`);
            if (!hasZanBai && !hasNoReapply) {
                const zanBaiEffect: IEffect = {
                    id: `${EFFECT_IDS.DEBUFF_ZANBAI}-${sourceUnitId}-${targetEnemy.id}`,
                    name: '残梅',
                    category: 'DEBUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'PERMANENT',
                    duration: -1,
                    tags: ['SKIP_TOUGHNESS_RECOVERY'], // 靳性回復スキップ
                    ignoreResistance: true, // 確定付与
                    onApply: (t, s) => s,
                    onRemove: (t, s) => s,


                };
                return addEffect(state, targetEnemy.id, zanBaiEffect);
            }
        }
    }
    return state;
};

// 弱点撃破時
const onWeaknessBreak = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (!event.targetId) return state;

    const currentUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!currentUnit) return state;

    const brokenEnemy = state.registry.get(createUnitId(event.targetId));
    if (!brokenEnemy || !brokenEnemy.isEnemy) return state;

    let newState = state;

    // 天賦: 弱点撃破後の追加撃破ダメージ
    // E3で天賦Lv+2
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    let talentBreakMult = getLeveledValue(ABILITY_VALUES.talentBreakDmg, talentLevel);

    // E6: 天賦ダメージ+200%
    if (eidolonLevel >= 6) {
        talentBreakMult += E6_TALENT_BONUS;
    }

    // 撃破ダメージを計算
    const breakDamageResult = calculateBreakDamageWithBreakdown(currentUnit, brokenEnemy, {});
    const talentDamage = breakDamageResult.damage * talentBreakMult;

    if (talentDamage > 0) {
        const result = applyUnifiedDamage(
            newState,
            currentUnit,
            brokenEnemy,
            talentDamage,
            {
                damageType: '撃破ダメージ',
                details: 'フラクタルの螺旋: 弱点撃破追加ダメージ',
                skipLog: true,
                events: [],
                additionalDamageEntry: {
                    source: 'ルアン・メェイ',
                    name: '天賦撃破ダメージ',
                    damageType: 'break',
                    isCrit: breakDamageResult.isCrit,
                    breakdownMultipliers: breakDamageResult.breakdownMultipliers
                }
            }
        );
        newState = result.state;
    }

    // E4: 弱点撃破時に撃破特効+100%、3ターン
    if (eidolonLevel >= 4) {
        const e4Buff: IEffect = {
            id: `${EFFECT_IDS.BUFF_E4_BREAK}-${sourceUnitId}`,
            name: '銅鏡前にて神を探す',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: E4_DURATION,
            onApply: (t, s) => {
                const newModifiers = [...t.modifiers, {
                    source: '銅鏡前にて神を探す',
                    target: 'break_effect' as StatKey,
                    type: 'add' as const,
                    value: E4_BREAK_EFFECT,
                }];
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                };
            },
            onRemove: (t, s) => {
                const newModifiers = t.modifiers.filter(m => m.source !== '銅鏡前にて神を探す');
                return {
                    ...s,
                    registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                };
            },


        };
        newState = addEffect(newState, sourceUnitId, e4Buff);
    }

    return newState;
};

// 弱点撃破回復試行時 (残梅発動)
const onWeaknessBreakRecoveryAttempt = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    if (!event.targetId) return state;

    const currentUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!currentUnit) return state;

    const enemy = state.registry.get(createUnitId(event.targetId));
    if (!enemy || !enemy.isEnemy) return state;

    // この残梅ハンドラーの残梅を持っているか確認
    const zanBai = enemy.effects.find(e => e.id === `${EFFECT_IDS.DEBUFF_ZANBAI}-${sourceUnitId}-${enemy.id}`);
    if (!zanBai) return state;

    console.log(`[Ruan Mei] 残梅発動: ${enemy.name}`);

    let newState = state;

    // 1. 行動遅延: 撃破特効×20% + 10%
    const delayPercent = (currentUnit.stats.break_effect || 0) * 0.20 + ULT_ACTION_DELAY_BASE;
    newState = delayAction(newState, enemy.id, delayPercent, 'percent');

    // 2. 撃破ダメージ
    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const zanBaiMult = getLeveledValue(ABILITY_VALUES.ultBreakDmg, ultLevel);
    const breakDamageResult2 = calculateBreakDamageWithBreakdown(currentUnit, enemy, {});
    const zanBaiDamage = breakDamageResult2.damage * zanBaiMult;

    if (zanBaiDamage > 0) {
        const result = applyUnifiedDamage(
            newState,
            currentUnit,
            enemy,
            zanBaiDamage,
            {
                damageType: '撃破ダメージ',
                details: '残梅: 追加撃破ダメージ',
                skipLog: true,
                events: [],
                additionalDamageEntry: {
                    source: 'ルアン・メェイ',
                    name: '残梅撃破ダメージ',
                    damageType: 'break',
                    isCrit: breakDamageResult2.isCrit,
                    breakdownMultipliers: breakDamageResult2.breakdownMultipliers
                }
            }
        );
        newState = result.state;
    }

    // 3. 残梅を削除し、再付与不可マーカーを付与
    // 残梅を削除
    newState = removeEffect(newState, enemy.id, `${EFFECT_IDS.DEBUFF_ZANBAI}-${sourceUnitId}-${enemy.id}`);

    // 再付与不可マーカー
    const noReapplyEffect: IEffect = {
        id: `${EFFECT_IDS.NO_REAPPLY_ZANBAI}-${sourceUnitId}-${enemy.id}`,
        name: '残梅再付与不可',
        category: 'STATUS',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,

        /* remove removed */
    };
    newState = addEffect(newState, enemy.id, noReapplyEffect);

    return newState;
};

// ダメージ計算前処理 (E2)
const onBeforeDamageCalculation = (event: BeforeDamageCalcEvent, state: GameState, eidolonLevel: number): GameState => {
    if (eidolonLevel < 2) return state;
    if (!event.targetId) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    // 弱点撃破状態（toughness <= 0）の敵に対する攻撃の場合
    if (target && target.isEnemy && target.toughness <= 0) {
        // damageModifiers.atkBoostを追加
        const newState = {
            ...state,
            damageModifiers: {
                ...state.damageModifiers,
                atkBoost: (state.damageModifiers.atkBoost || 0) + E2_ATK_BOOST
            }
        };
        // console.log(`[Ruan Mei E2] 弱点撃破状態の敵への攻撃: ATK+${E2_ATK_BOOST * 100}%`); // Log too verbose
        return newState;
    }
    return state;
};

// ===============================
// ハンドラーファクトリ
// ===============================

export const ruanMeiHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    return {
        handlerMetadata: {
            id: `ruan-mei-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_ATTACK',
                'ON_WEAKNESS_BREAK',
                'ON_WEAKNESS_BREAK_RECOVERY_ATTEMPT',
                'ON_BEFORE_DAMAGE_CALCULATION', // E2: 弱点撃破状態の敵への攻撃力+40%
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            switch (event.type) {
                case 'ON_BATTLE_START':
                    return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_TURN_START':
                    return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_SKILL_USED':
                    return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_ULTIMATE_USED':
                    return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_ATTACK':
                    // ON_ATTACK is typically generic, checks if source is Ruan Mei inside
                    if (event.sourceId === sourceUnitId) {
                        return onAttack(event as ActionEvent, state, sourceUnitId);
                    }
                    return state;
                case 'ON_WEAKNESS_BREAK':
                    return onWeaknessBreak(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_WEAKNESS_BREAK_RECOVERY_ATTEMPT':
                    return onWeaknessBreakRecoveryAttempt(event as ActionEvent, state, sourceUnitId, eidolonLevel);
                case 'ON_BEFORE_DAMAGE_CALCULATION':
                    return onBeforeDamageCalculation(event as BeforeDamageCalcEvent, state, eidolonLevel);
                default:
                    return state;
            }
        }
    };
};
