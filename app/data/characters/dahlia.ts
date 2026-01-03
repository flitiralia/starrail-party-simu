import { Character, Element, Path, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, DamageDealtEvent, ActionEvent, GeneralEvent } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage, publishEvent, appendAdditionalDamage } from '../../simulator/engine/dispatcher';
import { calculateSuperBreakDamageWithBreakdown } from '../../simulator/damage';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { advanceAction, reduceToughness } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { addSkillPoints } from '../../simulator/effect/relicEffectHelpers';
import { IAura } from '../../simulator/engine/types';
import { addAura, removeAura } from '../../simulator/engine/auraManager';

// --- 定数定義 ---
const CHARACTER_ID = 'dahlia';

const EFFECT_IDS = {
    BARRIER: (sourceId: string) => `${CHARACTER_ID}-barrier-${sourceId}`,
    DECADENCE: (targetId: string, sourceId: string) => `${CHARACTER_ID}-decadence-${sourceId}-${targetId}`,
    DANCE_PARTNER: (sourceId: string, targetId: string) => `${CHARACTER_ID}-partner-${sourceId}-${targetId}`,
    A2_BUFF: (sourceId: string, targetId: string) => `${CHARACTER_ID}-a2-buff-${sourceId}-${targetId}`,
    A6_SPD: (sourceId: string) => `${CHARACTER_ID}-a6-spd-${sourceId}`,
    E2_RES_AURA: (sourceId: string) => `${CHARACTER_ID}-e2-res-aura-${sourceId}`,
    E4_VULN: (targetId: string, sourceId: string) => `${CHARACTER_ID}-e4-vuln-${sourceId}-${targetId}`,
} as const;

const TRACE_IDS = {
    A2: `${CHARACTER_ID}-trace-a2`,
    A4: `${CHARACTER_ID}-trace-a4`,
    A6: `${CHARACTER_ID}-trace-a6`,
} as const;

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // スキル倍率
    skillDamage: {
        10: 1.60,
        12: 1.76
    } as Record<number, number>,
    // 必殺技倍率 & 防御ダウン
    ultDamage: {
        10: 3.00,
        12: 3.24
    } as Record<number, number>,
    ultDefDown: {
        10: 0.18,
        12: 0.20
    } as Record<number, number>,
    // 天賦: 超撃破倍率(X), 追撃倍率(Y), 追撃超撃破(Z)
    talentSuperBreakX: {
        10: 0.60,
        12: 0.66
    } as Record<number, number>,
    talentFuaDamage: {
        10: 0.30,
        12: 0.33
    } as Record<number, number>,
    talentSuperBreakZ: {
        10: 2.00,
        12: 2.20
    } as Record<number, number>,
};

// 通常攻撃
const BASIC_MULT_LV6 = 1.00;
const BASIC_MULT_LV7 = 1.10;
const BASIC_TOUGHNESS = 10;
const BASIC_EP = 20;

// スキル
const SKILL_DURATION = 3;
const SKILL_EP = 30;
const SKILL_TOUGHNESS_MAIN = 20;
const SKILL_TOUGHNESS_ADJ = 10;
const SKILL_BREAK_EFF_BOOST = 0.50;

// 必殺技
const ULT_DURATION = 4;
const ULT_EP = 5;

// 天賦
const TALENT_START_EP = 35;
const TALENT_FUA_HITS = 5;

export const dahlia: Character = {
    id: CHARACTER_ID,
    name: 'ダリア',
    path: 'Nihility',
    element: 'Fire',
    rarity: 5,
    maxEnergy: 130,
    baseStats: {
        hp: 1086,
        atk: 679,
        def: 606,
        spd: 96,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: `${CHARACTER_ID}-basic`,
            name: '翻弄…綻びを引き裂く記憶',
            type: 'Basic ATK',
            description: '指定した敵単体にダリアの攻撃力100%分の炎属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: BASIC_MULT_LV6, toughnessReduction: BASIC_TOUGHNESS }],
            },
            energyGain: BASIC_EP,
        },
        skill: {
            id: `${CHARACTER_ID}-skill`,
            name: '舐る…炎の舌を伸ばす背叛',
            type: 'Skill',
            description: '結界を展開する。3ターン継続。指定した敵単体および隣接する敵に、ダリアの攻撃力160%分の炎属性ダメージを与える。結界中、味方全体の弱点撃破効率+50%。非弱点撃破状態の敵にも超撃破ダメージを発生させる。',
            targetType: 'blast',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 1.60, toughnessReduction: SKILL_TOUGHNESS_MAIN }],
                adjacentHits: [{ multiplier: 1.60, toughnessReduction: SKILL_TOUGHNESS_ADJ }],
            },
            energyGain: SKILL_EP,
        },
        ultimate: {
            id: `${CHARACTER_ID}-ultimate`,
            name: '耽溺…墓場に舞い込む灰燼',
            type: 'Ultimate',
            description: '敵全体を「凋落」状態にする。4ターン継続。敵全体にダリアの攻撃力300%分の炎属性ダメージを与える（均等分担）。「凋落」状態の敵の防御力-18%、味方の属性を弱点として付与。',
            targetType: 'all_enemies',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 3.00, toughnessReduction: 20 }], // 削靭値は全体攻撃標準の20と想定
            },
            energyGain: ULT_EP,
        },
        talent: {
            id: `${CHARACTER_ID}-talent`,
            name: 'コンスタンスを恐れる者は？',
            type: 'Talent',
            description: '戦闘開始時にEP35回復。「共に舞う者」を設定。彼らが攻撃すると、ダリアが5ヒットの追加攻撃。',
        },
        technique: {
            id: `${CHARACTER_ID}-technique`,
            name: '心こそ至高の墓場',
            type: 'Technique',
            description: '特殊領域を展開。戦闘開始時にスキルの結界を即座に展開し、削靭値を60%分の超撃破ダメージに転換。',
            targetType: 'self',
        },
    },
    traces: [
        {
            id: TRACE_IDS.A2,
            name: '葬礼またひとつ',
            type: 'Bonus Ability',
            description: '戦闘開始時、自身以外の味方の撃破特攻アップ。治癒やバリアを受けた時も発動。',
        },
        {
            id: TRACE_IDS.A4,
            name: '故人に哀悼を',
            type: 'Bonus Ability',
            description: '天賦による追加攻撃が2回発動するたびにSPを1回復。',
        },
        {
            id: TRACE_IDS.A6,
            name: '古きを捨て、新しきに恋する',
            type: 'Bonus Ability',
            description: '弱点付与時に速度+30%。炎属性キャラが弱点付与時、追加削靭とEP回復。',
        },
        {
            id: `${CHARACTER_ID}-stat-break`,
            name: '撃破特効強化',
            type: 'Stat Bonus',
            description: '撃破特効+37.3%',
            stat: 'break_effect',
            value: 0.373,
        },
        {
            id: `${CHARACTER_ID}-stat-res`,
            name: '効果抵抗強化',
            type: 'Stat Bonus',
            description: '効果抵抗+18.0%',
            stat: 'effect_res',
            value: 0.18,
        },
        {
            id: `${CHARACTER_ID}-stat-spd`,
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
            name: '咲く時を待つ蕾',
            description: '「共に舞う者」の超撃破倍率を味方全体に適用し、倍率を40%アップ。攻撃後に最大靭性値25%分の追加削靭。',
        },
        e2: {
            level: 2,
            name: '新生、鮮麗、愛憐',
            description: '敵全体の全属性耐性-20%。敵が出現時に即座に「凋落」状態になる。',
        },
        e3: {
            level: 3,
            name: '蝉の羽の如く儚い花弁',
            description: '必殺技Lv.+2、通常攻撃Lv.+1',
            abilityModifiers: [
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: BASIC_MULT_LV7 },
            ],
        },
        e4: {
            level: 4,
            name: '虫に蝕まれた花蕊',
            description: '天賦による追加攻撃のヒット数+5。命中するたびに対象の被ダメージ+12%。',
        },
        e5: {
            level: 5,
            name: '凋落、腐敗、憎悪',
            description: '戦闘スキルLv.+2、天賦Lv.+2',
        },
        e6: {
            level: 6,
            name: 'されど危うく美しい',
            description: '「共に舞う者」の撃破特効+150%。追撃発動時に「ダンスパートナー」の行動順を20%早める。',
        },
    },
    defaultConfig: {
        lightConeId: 'never-forget-her-flame',
        superimposition: 1,
        relicSetId: 'iron-cavalry-against-scourge',
        ornamentSetId: 'forge-of-the-kalpagni-lantern',
        mainStats: {
            body: 'atk_pct',
            feet: 'spd',
            sphere: 'atk_pct',
            rope: 'break_effect',
        },
        subStats: [
            { stat: 'spd', value: 20 },
            { stat: 'break_effect', value: 0.8 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    },
};

// ===============================
// ハンドラーロジック
// ===============================

export const dahliaHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    // 内部状態管理用
    let fuaCountForSp = 0;
    const a2TriggeredThisTurn = { value: false };

    /**
     * 「共に舞う者」の更新
     */
    const updateDancePartners = (state: GameState): GameState => {
        let newState = state;
        const dahliaUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (!dahliaUnit) return newState;

        const currentPartners = newState.registry.getAliveAllies().filter(a =>
            a.effects.some(e => e.id === EFFECT_IDS.DANCE_PARTNER(sourceUnitId, a.id))
        );

        // 自分以外にパートナーがいない場合
        const others = currentPartners.filter(p => p.id !== sourceUnitId);
        if (others.length === 0) {
            const potentialPartners = newState.registry.getAliveAllies().filter(a => a.id !== sourceUnitId);
            if (potentialPartners.length > 0) {
                // 最も撃破特効が高い味方
                const bestPartner = potentialPartners.reduce((prev, curr) =>
                    (curr.stats.break_effect || 0) > (prev.stats.break_effect || 0) ? curr : prev
                );
                const partnerEffect: IEffect = {
                    id: EFFECT_IDS.DANCE_PARTNER(sourceUnitId, bestPartner.id),
                    name: '共に舞う者',
                    category: 'OTHER',
                    sourceUnitId: sourceUnitId,
                    durationType: 'PERMANENT',
                    duration: -1,


                };
                newState = addEffect(newState, bestPartner.id, partnerEffect);
            }
        }

        // ダリア自身をパートナーにする（常に）
        if (!dahliaUnit.effects.some(e => e.id === EFFECT_IDS.DANCE_PARTNER(sourceUnitId, sourceUnitId))) {
            const selfPartner: IEffect = {
                id: EFFECT_IDS.DANCE_PARTNER(sourceUnitId, sourceUnitId),
                name: '共に舞う者',
                category: 'OTHER',
                sourceUnitId: sourceUnitId,
                durationType: 'PERMANENT',
                duration: -1,


            };
            newState = addEffect(newState, sourceUnitId, selfPartner);
        }

        return newState;
    };

    /**
     * A2バフの適用
     */
    const applyA2Buff = (state: GameState, duration: number): GameState => {
        let newState = state;
        const dahliaUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (!dahliaUnit) return newState;

        const breakEffBonus = (dahliaUnit.stats.break_effect || 0) * 0.24 + 0.50;
        const allies = newState.registry.getAliveAllies().filter(a => a.id !== sourceUnitId);

        for (const ally of allies) {
            const effect: IEffect = {
                id: EFFECT_IDS.A2_BUFF(sourceUnitId, ally.id),
                name: '葬礼またひとつ',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_START_BASED',
                duration: duration,
                modifiers: [{
                    target: 'break_effect' as StatKey,
                    value: breakEffBonus,
                    type: 'add',
                    source: '追加能力: 葬礼またひとつ'
                }],


            };
            newState = addEffect(newState, ally.id, effect);
        }
        return newState;
    };

    /**
     * 弱点付与の共通処理 (必殺技など)
     */
    const applyWeaknessFromPartners = (state: GameState, targetId: string, sourceId: string, duration: number): GameState => {
        let newState = state;
        const target = newState.registry.get(createUnitId(targetId));
        if (!target || !target.isEnemy) return state;

        // パートナーたちの属性を取得
        const partners = newState.registry.getAliveAllies().filter(a =>
            a.effects.some(e => e.id === EFFECT_IDS.DANCE_PARTNER(sourceUnitId, a.id))
        );
        const elements = new Set(partners.map(p => p.element));

        Array.from(elements).forEach(element => {
            const effectId = `${CHARACTER_ID}-weakness-${element}-${sourceId}-${targetId}`;
            const weaknessEffect: IEffect = {
                id: effectId,
                name: `弱点付与: ${element}`,
                category: 'DEBUFF',
                sourceUnitId: sourceId,
                durationType: 'TURN_START_BASED',
                duration: duration,
                miscData: { element },
                onApply: (t, s) => {
                    t.weaknesses.add(element);
                    return s;
                },
                onRemove: (t, s) => {
                    t.weaknesses.delete(element);
                    return s;
                },
            };
            newState = addEffect(newState, targetId, weaknessEffect);
        });

        // A6: 味方が敵に弱点を付与した時
        const dahliaUnit = newState.registry.get(createUnitId(sourceUnitId));
        if (dahliaUnit?.traces?.some(t => t.id === TRACE_IDS.A6)) {
            const spdBuff: IEffect = {
                id: EFFECT_IDS.A6_SPD(sourceUnitId),
                name: '古きを捨て、新しきに恋する: 速度',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_START_BASED',
                duration: 2,
                modifiers: [{
                    target: 'spd' as StatKey,
                    value: 0.30,
                    type: 'pct',
                    source: '追加能力: A6'
                }],


            };
            newState = addEffect(newState, sourceUnitId, spdBuff);
        }

        return newState;
    };


    return {
        handlerMetadata: {
            id: `dahlia-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_WEAKNESS_BREAK',
                'ON_DAMAGE_DEALT',
                'ON_UNIT_HEALED',
                'ON_EFFECT_APPLIED',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
            const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');

            // --- ON_BATTLE_START ---
            if (event.type === 'ON_BATTLE_START') {
                let newState = state;
                newState = addEnergyToUnit(newState, sourceUnitId, TALENT_START_EP, 0, false, {
                    sourceId: sourceUnitId,
                    publishEventFn: publishEvent
                });
                newState = updateDancePartners(newState);
                if (unit.traces?.some(t => t.id === TRACE_IDS.A2)) {
                    newState = applyA2Buff(newState, 2);
                }
                if (eidolonLevel >= 2) {
                    const e2Aura: IAura = {
                        id: EFFECT_IDS.E2_RES_AURA(sourceUnitId),
                        name: '新生、鮮麗、愛憐',
                        sourceUnitId: createUnitId(sourceUnitId),
                        target: 'all_enemies',
                        modifiers: [
                            { target: 'all_res' as StatKey, value: -0.20, type: 'add', source: '星魂2' }
                        ]
                    };
                    newState = addAura(newState, e2Aura);
                }
                if (unit.config?.useTechnique !== false) {
                    const barrier: IEffect = {
                        id: EFFECT_IDS.BARRIER(sourceUnitId),
                        name: '結界',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_START_BASED',
                        duration: SKILL_DURATION,
                        modifiers: [{
                            target: 'break_efficiency_boost' as StatKey,
                            value: SKILL_BREAK_EFF_BOOST,
                            type: 'add',
                            source: '戦闘スキル: 結界'
                        }],


                    };
                    newState = addEffect(newState, sourceUnitId, barrier);
                }
                return newState;
            }

            // --- ON_TURN_START ---
            if (event.type === 'ON_TURN_START') {
                if (event.sourceId === sourceUnitId) {
                    a2TriggeredThisTurn.value = false;
                }
                return state;
            }

            // --- ON_SKILL_USED ---
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                const barrier: IEffect = {
                    id: EFFECT_IDS.BARRIER(sourceUnitId),
                    name: '結界',
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'TURN_START_BASED',
                    duration: SKILL_DURATION,
                    modifiers: [{
                        target: 'break_efficiency_boost' as StatKey,
                        value: SKILL_BREAK_EFF_BOOST,
                        type: 'add',
                        source: '戦闘スキル: 結界'
                    }],


                };
                let newState = addEffect(state, sourceUnitId, barrier);

                // 敵全体を「凋落」にする
                const defDown = getLeveledValue(ABILITY_VALUES.ultDefDown, ultLevel);
                const enemies = newState.registry.getAliveEnemies();
                for (const enemy of enemies) {
                    const decadence: IEffect = {
                        id: EFFECT_IDS.DECADENCE(enemy.id, sourceUnitId),
                        name: '凋落',
                        category: 'DEBUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_START_BASED',
                        duration: ULT_DURATION,
                        modifiers: [{
                            target: 'def_reduction' as StatKey,
                            value: defDown,
                            type: 'add',
                            source: '戦闘スキル: 凋落'
                        }],


                    };
                    newState = addEffect(newState, enemy.id, decadence);
                }
                return newState;
            }

            // --- ON_ULTIMATE_USED ---
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                let newState = state;
                const defDown = getLeveledValue(ABILITY_VALUES.ultDefDown, ultLevel);
                const enemies = newState.registry.getAliveEnemies();
                for (const enemy of enemies) {
                    const decadence: IEffect = {
                        id: EFFECT_IDS.DECADENCE(enemy.id, sourceUnitId),
                        name: '凋落',
                        category: 'DEBUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_START_BASED',
                        duration: ULT_DURATION,
                        modifiers: [{
                            target: 'def_reduction' as StatKey,
                            value: defDown,
                            type: 'add',
                            source: '必殺技: 凋落'
                        }],


                    };
                    newState = addEffect(newState, enemy.id, decadence);
                    newState = applyWeaknessFromPartners(newState, enemy.id, sourceUnitId, ULT_DURATION);
                }
                return newState;
            }

            // --- ON_UNIT_HEALED ---
            if (event.type === 'ON_UNIT_HEALED' && event.targetId === sourceUnitId) {
                if (unit.traces?.some(t => t.id === TRACE_IDS.A2) && !a2TriggeredThisTurn.value) {
                    a2TriggeredThisTurn.value = true;
                    return applyA2Buff(state, 3);
                }
            }

            // --- ON_EFFECT_APPLIED ---
            if (event.type === 'ON_EFFECT_APPLIED') {
                const effectEvent = event as import('../../simulator/engine/types').EffectEvent;
                let newState = state;
                if (effectEvent.targetId === sourceUnitId && !a2TriggeredThisTurn.value) {
                    if (effectEvent.effect.name.includes('バリア') || effectEvent.effect.name.includes('シールド')) {
                        if (unit.traces?.some(t => t.id === TRACE_IDS.A2)) {
                            a2TriggeredThisTurn.value = true;
                            newState = applyA2Buff(newState, 3);
                        }
                    }
                }
                if (effectEvent.effect.miscData?.element && effectEvent.sourceId !== sourceUnitId) {
                    const attacker = newState.registry.get(createUnitId(effectEvent.sourceId));
                    if (attacker && !attacker.isEnemy && unit.traces?.some(t => t.id === TRACE_IDS.A6)) {
                        const spdBuff: IEffect = {
                            id: EFFECT_IDS.A6_SPD(sourceUnitId),
                            name: '古きを捨て、新しきに恋する: 速度',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_START_BASED',
                            duration: 2,
                            modifiers: [{
                                target: 'spd' as StatKey,
                                value: 0.30,
                                type: 'pct',
                                source: '追加能力: A6'
                            }],


                        };
                        newState = addEffect(newState, sourceUnitId, spdBuff);

                        // 炎属性キャラの場合: 削靭20、EP 5% (Max 50%)
                        if (attacker.element === 'Fire' && effectEvent.targetId) {
                            const { state: stateAfterToughness } = reduceToughness(newState, sourceUnitId, effectEvent.targetId, 20, { ignoreWeakness: true });
                            newState = stateAfterToughness;

                            // EP回復 (属性付与時)
                            const maxEp = unit.stats.max_ep || 0;
                            const currentEp = unit.ep || 0;
                            const epCap = maxEp * 0.5;

                            if (currentEp < epCap) {
                                // 10%回復するが、50%を超えないようにクランプ
                                const epGain = Math.min(maxEp * 0.1, epCap - currentEp);
                                newState = addEnergyToUnit(newState, sourceUnitId, epGain, 0, false, {
                                    sourceId: sourceUnitId,
                                    publishEventFn: publishEvent
                                });
                            }
                        }

                    }
                }
                return newState;
            }

            // --- ON_DAMAGE_DEALT ---
            if (event.type === 'ON_DAMAGE_DEALT') {
                const damageEvent = event as DamageDealtEvent;
                let newState = state;
                const attacker = newState.registry.get(createUnitId(damageEvent.sourceId));
                const target = newState.registry.get(createUnitId(damageEvent.targetId));
                if (!attacker || !target || !target.isEnemy) return state;

                const hasBarrier = unit.effects.some(e => e.id === EFFECT_IDS.BARRIER(sourceUnitId));
                if (hasBarrier) {
                    const toughnessReduced = damageEvent.hitDetails?.reduce((sum, hit) => sum + (hit.toughnessReduction || 0), 0) || 0;
                    if (toughnessReduced > 0) {
                        // 重複防止: 既に超撃破ダメージとして処理されている場合は無視
                        // (ただし、自身の追加削靭などで無限ループしないように toughnessReduced > 0 で基本は弾ける)

                        let xMult = getLeveledValue(ABILITY_VALUES.talentSuperBreakX, talentLevel);
                        if (eidolonLevel >= 1) xMult += 0.40;

                        // calculateSuperBreakDamageは target.toughness > 0 の場合自動的に 0.9 倍を適用する
                        const superBreak = calculateSuperBreakDamageWithBreakdown(attacker, target, toughnessReduced, {
                            overrideSuperBreakMultiplier: xMult
                        });

                        if (superBreak.damage > 0) {
                            const result = applyUnifiedDamage(newState, attacker, target, superBreak.damage, {
                                damageType: '超撃破ダメージ',
                                details: 'ダリア: 結界超撃破',
                                skipLog: true,
                                isCrit: false,
                                breakdownMultipliers: superBreak.breakdownMultipliers
                            });
                            newState = result.state;
                        }
                    }
                }

                const isPartner = attacker.effects.some(e => e.id === EFFECT_IDS.DANCE_PARTNER(sourceUnitId, attacker.id));
                const isDahlia = attacker.id === sourceUnitId;

                // 追撃トリガー: ダリア以外のパートナーによる攻撃、かつ最初のヒットのみ判定
                const isFirstHit = damageEvent.hitDetails?.[0]?.hitIndex === 0;

                if (isPartner && !isDahlia && isFirstHit && damageEvent.damageType !== 'follow_up' && damageEvent.damageType !== 'super_break' && damageEvent.damageType !== 'additional') {
                    const fuaMult = getLeveledValue(ABILITY_VALUES.talentFuaDamage, talentLevel);
                    let hitCount = TALENT_FUA_HITS + (eidolonLevel >= 4 ? 5 : 0);
                    const enemies = newState.registry.getAliveEnemies();

                    // 攻撃後に最大靭性値25%分の追加削靭 (E1)
                    if (eidolonLevel >= 1 && target && target.isEnemy) {
                        const e1Reduction = target.maxToughness * 0.25;
                        const { state: stateAfterE1 } = reduceToughness(newState, sourceUnitId, target.id, e1Reduction, { ignoreWeakness: true });
                        newState = stateAfterE1;
                    }

                    for (let i = 0; i < hitCount; i++) {
                        const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                        if (!randomEnemy) continue;

                        newState = {
                            ...newState,
                            pendingActions: [
                                ...newState.pendingActions,
                                {
                                    type: 'FOLLOW_UP_ATTACK',
                                    sourceId: sourceUnitId,
                                    targetId: randomEnemy.id,
                                    abilityId: `${CHARACTER_ID}-talent-fua`,
                                    isAdditional: true
                                } as any
                            ]
                        };
                    }
                    if (unit.traces?.some(t => t.id === TRACE_IDS.A4)) {
                        fuaCountForSp++;
                        if (fuaCountForSp >= 2) {
                            newState = addSkillPoints(newState, 1);
                            fuaCountForSp = 0;
                        }
                    }
                    if (eidolonLevel >= 6) {
                        const partners = newState.registry.getAliveAllies().filter(a =>
                            a.effects.some(e => e.id === EFFECT_IDS.DANCE_PARTNER(sourceUnitId, a.id))
                        );
                        for (const p of partners) {
                            newState = advanceAction(newState, p.id, 0.20, 'percent');
                        }
                    }
                }
                return newState;
            }

            return state;
        }
    };
};
