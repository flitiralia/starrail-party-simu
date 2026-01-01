import { Character, CharacterBaseStats } from '../../types/index';
import { IEventHandlerLogic, GameState, Unit, IEventHandlerFactory, DamageDealtEvent, ActionEvent, GeneralEvent, IEvent } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { applyUnifiedDamage, publishEvent } from '../../simulator/engine/dispatcher';
import { calculateDamageWithCritInfo } from '../../simulator/damage';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { FinalStats, Modifier } from '../../types/stats';
import { advanceAction } from '../../simulator/engine/utils';
import { createSummon, getActiveSummon, insertSummonAfterOwner } from '../../simulator/engine/summonManager';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';

const CHARACTER_ID = 'topaz-and-numby';
const SUMMON_ID_PREFIX = 'numby'; // カブ（召喚物）

const EFFECT_IDS = {
    PROOF_OF_DEBT: 'topaz-proof-of-debt', // 負債証明
    ENHANCED_NUMBY: 'topaz-enhanced-numby', // 心躍る上昇幅！
    E1_DEBT_ENFORCEMENT: 'topaz-e1-debt-enforcement', // 強制執行
};

const TRACE_IDS = {
    OVERDRAFT: 'topaz-a2', // 貸越 (通常攻撃が追加攻撃扱い)
    FINANCIAL_TURMOIL: 'topaz-a4', // 金融不安 (炎弱点への与ダメ+15%)
    TECHNICAL_ADJUSTMENT: 'topaz-a6', // 技術的調整 (強化カブ攻撃後EP10回復)
};

const BASE_STATS: CharacterBaseStats = {
    hp: 931,
    atk: 620,
    def: 412,
    spd: 110,
    critRate: 0.05,
    critDmg: 0.5,
    aggro: 75,
};

const ABILITY_VALUES = {
    basicDmg: { 6: 1.0, 7: 1.1 } as Record<number, number>,
    skillFuaVuln: { 10: 0.50, 12: 0.55 } as Record<number, number>,
    skillDmg: { 10: 1.50, 12: 1.65 } as Record<number, number>,
    ultDmgBoost: { 10: 1.50, 12: 1.65 } as Record<number, number>,
    ultCritDmg: { 10: 0.25, 12: 0.275 } as Record<number, number>,
    talentDmg: { 10: 1.50, 12: 1.65 } as Record<number, number>,
};

// --- ヘルパー関数 ---

/**
 * 負債証明を付与する
 */
function applyProofOfDebt(state: GameState, sourceId: string, targetId: string, fuaVuln: number): GameState {
    let newState = state;

    // 既存の負債証明を全員から解除
    newState.registry.toArray().forEach(u => {
        if (u.effects.some(e => e.id === EFFECT_IDS.PROOF_OF_DEBT)) {
            newState = removeEffect(newState, u.id, EFFECT_IDS.PROOF_OF_DEBT);
            newState = removeEffect(newState, u.id, EFFECT_IDS.E1_DEBT_ENFORCEMENT);
        }
    });

    return addEffect(newState, targetId, {
        id: EFFECT_IDS.PROOF_OF_DEBT,
        name: '負債証明',
        category: 'DEBUFF',
        type: 'Debuff',
        sourceUnitId: sourceId,
        duration: -1,
        durationType: 'PERMANENT',
        modifiers: [
            { target: 'fua_vuln', value: fuaVuln, type: 'add', source: '負債証明' }
        ],
        apply: (t, s) => s,
        remove: (t, s) => s,
    });
}

function applyProofOfDebtToRandomEnemy(state: GameState, sourceId: string, fuaVuln: number): GameState {
    const enemies = state.registry.getAliveEnemies();
    if (enemies.length === 0) return state;
    const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
    return applyProofOfDebt(state, sourceId, randomEnemy.id, fuaVuln);
}

function spawnNumby(state: GameState, source: Unit): GameState    // カブを召喚
{
    const numby = createSummon(source, {
        idPrefix: SUMMON_ID_PREFIX,
        name: 'カブ',
        baseStats: { hp: 1, atk: source.stats.atk, def: 1, spd: 80, crit_rate: 0, crit_dmg: 0 } as unknown as FinalStats, // ATKは動的に計算するが、初期化用
        baseSpd: 80,
        element: 'Fire',
        abilities: {
            basic: { id: 'numby-basic', name: 'None', type: 'Basic ATK', description: 'None' },
            skill: {
                id: 'numby-skill',
                name: 'カブの攻撃',
                type: 'Skill',
                description: '負債証明状態の敵に炎属性ダメージを与える',
                targetType: 'single_enemy',
            },
            ultimate: { id: 'numby-ult', name: 'None', type: 'Ultimate', description: 'None' },
            talent: { id: 'numby-talent', name: 'None', type: 'Talent', description: 'None' },
            technique: { id: 'numby-tech', name: 'None', type: 'Technique', description: 'None' },
        },
        untargetable: true,
        debuffImmune: true
    });

    numby.config = {
        rotation: ['s'],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
        ultCooldown: 0
    };

    let newState = {
        ...state,
        registry: state.registry.add(numby)
    };
    return insertSummonAfterOwner(newState, numby, source.id);
}

function executeNumbyAttack(state: GameState, numby: Unit, topaz: Unit, isFromTopazSkill: boolean = false): GameState {
    let newState = state;
    const target = newState.registry.toArray().find(u => u.isEnemy && u.effects.some(e => e.id === EFFECT_IDS.PROOF_OF_DEBT));
    if (!target) return newState;

    const talentLevel = calculateAbilityLevel(topaz.eidolonLevel || 0, 5, 'Talent');
    const baseMult = getLeveledValue(ABILITY_VALUES.talentDmg, talentLevel);

    let multiplier = baseMult;
    let critDmgBoost = 0;
    const enhancedStatus = numby.effects.find(e => e.id === EFFECT_IDS.ENHANCED_NUMBY);

    if (enhancedStatus) {
        const ultLevel = calculateAbilityLevel(topaz.eidolonLevel || 0, 3, 'Ultimate');
        multiplier += getLeveledValue(ABILITY_VALUES.ultDmgBoost, ultLevel);
        critDmgBoost = getLeveledValue(ABILITY_VALUES.ultCritDmg, ultLevel);
    }

    const tempAbility: any = {
        damage: {
            type: 'simple',
            scaling: 'atk',
            hits: [{ multiplier: multiplier, toughnessReduction: 20 }]
        }
    };

    const resReduction = (topaz.eidolonLevel || 0) >= 6 ? 0.10 : 0;

    const { damage, isCrit, breakdownMultipliers } = calculateDamageWithCritInfo(
        topaz,
        target,
        tempAbility,
        { type: 'FOLLOW_UP_ATTACK' } as any,
        {
            critDmg: critDmgBoost,
            resReduction: resReduction
        }
    );

    // 龍霊（召喚物）と同様に、ダメージの発生源はカブ(numby)とする
    newState = applyUnifiedDamage(newState, numby, target, damage, {
        damageType: 'FOLLOW_UP_ATTACK',
        details: isFromTopazSkill ? 'トパーズの戦闘スキルによる指示' : 'カブ自身のターンによる攻撃',
        events: [{ type: 'ON_FOLLOW_UP_ATTACK' }],
        additionalDamageEntry: {
            source: 'カブ',
            name: enhancedStatus ? '「心踊る上昇幅！」' : 'カブ',
            damageType: 'normal',
            isCrit: isCrit,
            breakdownMultipliers: breakdownMultipliers
        }
    }).state;

    if (enhancedStatus && topaz.traces?.some(t => t.id === TRACE_IDS.TECHNICAL_ADJUSTMENT)) {
        newState = addEnergyToUnit(newState, topaz.id, 0, 10, false, { sourceId: topaz.id, publishEventFn: publishEvent });
    }

    if ((topaz.eidolonLevel || 0) >= 2) {
        newState = addEnergyToUnit(newState, topaz.id, 0, 5, false, { sourceId: topaz.id, publishEventFn: publishEvent });
    }

    if (enhancedStatus) {
        const newStacks = (enhancedStatus.stackCount || 1) - 1;
        newState = removeEffect(newState, numby.id, EFFECT_IDS.ENHANCED_NUMBY);
        if (newStacks > 0) {
            newState = addEffect(newState, numby.id, {
                ...enhancedStatus,
                stackCount: newStacks
            });
        }
    }

    return newState;
}

// --- ハンドラーロジック ---

export const topazAndNumbyHandlerFactory: IEventHandlerFactory = (sourceId, _level, eidolonLevel = 0) => {
    return {
        handlerMetadata: {
            id: `topaz-handler-${sourceId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_BEFORE_ACTION',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_FOLLOW_UP_ATTACK',
                'ON_BASIC_ATTACK',
                'ON_ACTION_COMPLETE',
                'ON_BEFORE_DAMAGE_CALCULATION'
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            let newState = state;
            const topaz = newState.registry.get(createUnitId(sourceId));
            if (!topaz) return state;

            // A2: 通常攻撃を「追加攻撃」として扱う
            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceId && topaz.traces?.some(t => t.id === TRACE_IDS.OVERDRAFT)) {
                // アクションタイプを差し替える（擬似的に追加攻撃イベントを発行）
                newState = publishEvent(newState, {
                    type: 'ON_FOLLOW_UP_ATTACK',
                    sourceId: sourceId,
                    targetId: (event as ActionEvent).targetId,
                    actionType: 'BASIC_ATTACK'
                });
            }

            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceId && topaz.traces?.some(t => t.id === TRACE_IDS.FINANCIAL_TURMOIL)) {
                const target = newState.registry.get(createUnitId((event as any).targetId));
                if (target && target.weaknesses.has('Fire')) {
                    newState.damageModifiers.allTypeDmg = (newState.damageModifiers.allTypeDmg || 0) + 0.15;
                }
            }

            const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
            const fuaVuln = getLeveledValue(ABILITY_VALUES.skillFuaVuln, skillLevel);

            if (event.type === 'ON_BATTLE_START') {
                newState = spawnNumby(newState, topaz);
                newState = applyProofOfDebtToRandomEnemy(newState, sourceId, fuaVuln);

                if (topaz.config?.useTechnique !== false) {
                    newState = addEffect(newState, sourceId, {
                        id: 'topaz-technique-energy',
                        name: '秘技: EP回復',
                        category: 'BUFF',
                        type: 'Buff',
                        sourceUnitId: sourceId,
                        duration: -1,
                        durationType: 'PERMANENT',
                        modifiers: [],
                        apply: (t, s) => s,
                        remove: (t, s) => s,
                    });
                }
                return newState;
            }

            if (event.type === 'ON_TURN_START' || event.type === 'ON_BEFORE_ACTION') {
                const hasProof = newState.registry.getAliveEnemies().some(e => e.effects.some(ef => ef.id === EFFECT_IDS.PROOF_OF_DEBT));
                if (!hasProof) {
                    newState = applyProofOfDebtToRandomEnemy(newState, sourceId, fuaVuln);
                }
            }

            if (event.sourceId === sourceId) {
                if (event.type === 'ON_SKILL_USED') {
                    const actionEvent = event as ActionEvent;
                    if (actionEvent.targetId) {
                        newState = applyProofOfDebt(newState, sourceId, actionEvent.targetId, fuaVuln);
                    }
                    const numby = getActiveSummon(newState, sourceId, SUMMON_ID_PREFIX);
                    if (numby) {
                        newState = executeNumbyAttack(newState, numby, topaz, true);
                    }
                }

                if (event.type === 'ON_ULTIMATE_USED') {
                    const numby = getActiveSummon(newState, sourceId, SUMMON_ID_PREFIX);
                    if (numby) {
                        const ultStacks = (eidolonLevel >= 6) ? 3 : 2;
                        newState = addEffect(newState, numby.id, {
                            id: EFFECT_IDS.ENHANCED_NUMBY,
                            name: '心躍る上昇幅！',
                            category: 'BUFF',
                            type: 'Buff',
                            sourceUnitId: sourceId,
                            duration: -1,
                            durationType: 'PERMANENT',
                            stackCount: ultStacks,
                            modifiers: [],
                            apply: (t, s) => s,
                            remove: (t, s) => s,
                        });
                    }
                }
            }

            const numby = getActiveSummon(newState, sourceId, SUMMON_ID_PREFIX);
            const proofTarget = newState.registry.toArray().find(u => u.isEnemy && u.effects.some(e => e.id === EFFECT_IDS.PROOF_OF_DEBT));

            if (numby && proofTarget) {
                let shouldAdvance = false;
                const actionEvent = event as ActionEvent;

                if (event.type === 'ON_FOLLOW_UP_ATTACK' && actionEvent.targetId === proofTarget.id) {
                    if (event.sourceId !== numby.id) {
                        shouldAdvance = true;
                    }
                }

                const enhancedStatus = numby.effects.find(e => e.id === EFFECT_IDS.ENHANCED_NUMBY);
                if (enhancedStatus && actionEvent.targetId === proofTarget.id) {
                    if (event.type === 'ON_BASIC_ATTACK' || event.type === 'ON_SKILL_USED' || event.type === 'ON_ULTIMATE_USED') {
                        shouldAdvance = true;
                    }
                }

                if (shouldAdvance) {
                    newState = advanceAction(newState, numby.id, 0.50);
                }
            }

            if (numby && event.sourceId === numby.id && event.type === 'ON_SKILL_USED') {
                if ((topaz.eidolonLevel || 0) >= 4) {
                    newState = advanceAction(newState, topaz.id, 0.20);
                }
                newState = executeNumbyAttack(newState, numby, topaz, false);
            }

            if (event.type === 'ON_FOLLOW_UP_ATTACK' && event.sourceId === numby?.id) {
                if (topaz.effects.some(e => e.id === 'topaz-technique-energy')) {
                    newState = addEnergyToUnit(newState, sourceId, 0, 60, false, { sourceId: topaz.id, publishEventFn: publishEvent });
                    newState = removeEffect(newState, sourceId, 'topaz-technique-energy');
                }
            }

            if (eidolonLevel >= 1 && proofTarget && (event as ActionEvent).targetId === proofTarget.id && event.type === 'ON_FOLLOW_UP_ATTACK') {
                const currentE1 = proofTarget.effects.find(e => e.id === EFFECT_IDS.E1_DEBT_ENFORCEMENT);
                const stacks = (currentE1?.stackCount || 0) + 1;
                if (stacks <= 2) {
                    newState = removeEffect(newState, proofTarget.id, EFFECT_IDS.E1_DEBT_ENFORCEMENT);
                    newState = addEffect(newState, proofTarget.id, {
                        id: EFFECT_IDS.E1_DEBT_ENFORCEMENT,
                        name: '強制執行',
                        category: 'DEBUFF',
                        type: 'Debuff',
                        sourceUnitId: sourceId,
                        duration: -1,
                        durationType: 'PERMANENT',
                        stackCount: stacks,
                        modifiers: [
                            { target: 'fua_crit_dmg', value: 0.25 * stacks, type: 'add', source: 'E1: 強制執行' }
                        ],
                        apply: (t, s) => s,
                        remove: (t, s) => s,
                    });
                }
            }

            return newState;
        }
    };
};

// --- キャラクター定義 ---

export const topazAndNumby: Character = {
    id: CHARACTER_ID,
    name: 'トパーズ＆カブ',
    path: 'The Hunt',
    element: 'Fire',
    rarity: 5,
    maxEnergy: 130,
    baseStats: BASE_STATS,
    abilities: {
        basic: {
            id: 'basic', name: '赤字…', type: 'Basic ATK', description: '炎ダメージ。',
            targetType: 'single_enemy',
            damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1.0, toughnessReduction: 10 }] },
            energyGain: 20
        },
        skill: {
            id: 'skill', name: '支払困難？', type: 'Skill', description: '負債証明付与 & カブ攻撃。',
            targetType: 'single_enemy',
            energyGain: 30
        },
        ultimate: {
            id: 'ult', name: '赤字を黒字に！', type: 'Ultimate', description: 'カブ強化。',
            targetType: 'self',
            energyGain: 5
        },
        talent: { id: 'talent', name: 'ピッグ・マーケット！？', type: 'Talent', description: 'カブ召喚。' },
        technique: { id: 'tech', name: '公的支援金', type: 'Technique', description: '戦闘後EP回復。' }
    },
    traces: [
        { id: TRACE_IDS.OVERDRAFT, name: '貸越', type: 'Bonus Ability', description: '通常攻撃を追加攻撃として扱う。' },
        { id: TRACE_IDS.FINANCIAL_TURMOIL, name: '金融不安', type: 'Bonus Ability', description: '炎弱点への与ダメ+15%。' },
        { id: TRACE_IDS.TECHNICAL_ADJUSTMENT, name: '技術的調整', type: 'Bonus Ability', description: '強化カブ攻撃後EP回復。' },
        { id: 'topaz-stat-fire', name: '炎属性ダメージ', type: 'Stat Bonus', stat: 'fire_dmg_boost', value: 0.224, description: '' },
        { id: 'topaz-stat-crit', name: '会心率', type: 'Stat Bonus', stat: 'crit_rate', value: 0.12, description: '' },
        { id: 'topaz-stat-hp', name: '最大HP', type: 'Stat Bonus', stat: 'hp_pct', value: 0.10, description: '' },
    ],
    eidolons: {
        e1: { level: 1, name: 'フューチャーズマーケット', description: '強制執行デバフ' },
        e2: { level: 2, name: '友好的買収', description: 'カブ攻撃後EP回復' },
        e3: { level: 3, name: '大を掴み小を放つ', description: 'スキル+2, 通常+1' },
        e4: { level: 4, name: '迅速処理', description: 'カブ行動時トパーズ加速' },
        e5: { level: 5, name: '需要インフレ', description: '必殺+2, 天賦+2' },
        e6: { level: 6, name: 'インセンティブ', description: '強化カブ攻撃回数+1, 炎耐性貫通+10%' },
    },
    defaultConfig: {
        lightConeId: 'worrisome-blissful', // 悩んで笑って
        relicSetId: 'pioneer_diver_of_dead_waters', // 死水に潜る先駆者
        ornamentSetId: 'duran_salsotto_dynasty', // 奔狼の都藍王朝
        rotation: ['s'], rotationMode: 'spam_skill', ultStrategy: 'immediate', ultCooldown: 0,
        mainStats: {
            body: 'crit_rate',
            feet: 'spd',
            sphere: 'fire_dmg_boost',
            rope: 'atk_pct'
        }
    }
};
