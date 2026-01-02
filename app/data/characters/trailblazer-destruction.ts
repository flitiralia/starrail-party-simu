import { Character, StatKey, IAbility } from '../../types/index';
import { IEventHandlerFactory, IEvent, GameState, Unit } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';

// --- Constants ---
const CHARACTER_ID = 'trailblazer-destruction';

const EFFECT_IDS = {
    TALENT_ATK_BUFF: (sourceId: string) => `trailblazer-dest-talent-atk-${sourceId}`,
    A4_DEF_BUFF: (sourceId: string) => `trailblazer-dest-a4-def-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2_RESERVE: 'trailblazer-dest-trace-a2',
    A4_FORTIFIED: 'trailblazer-dest-trace-a4',
    A6_WILLPOWER: 'trailblazer-dest-trace-a6',
} as const;

// --- Ability Values ---
const ABILITY_VALUES = {
    basicMult: { 6: 1.00, 7: 1.10 } as Record<number, number>,
    skillMult: { 10: 1.25, 12: 1.375 } as Record<number, number>,
    ultSingleMult: { 10: 4.50, 12: 4.80 } as Record<number, number>,
    ultBlastMainMult: { 10: 2.70, 12: 2.88 } as Record<number, number>,
    ultBlastAdjMult: { 10: 1.62, 12: 1.728 } as Record<number, number>,
    talentAtkBoost: { 10: 0.20, 12: 0.22 } as Record<number, number>,
};

const BASIC_EP = 20;
const SKILL_EP = 30;
const ULT_EP_REFUND = 5;

export const trailblazerDestruction: Character = {
    id: CHARACTER_ID,
    name: '開拓者-壊滅',
    path: 'Destruction',
    element: 'Physical',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1203,
        atk: 620,
        def: 460,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 125 // Destruction Standard
    },

    abilities: {
        basic: {
            id: 'trailblazer-dest-basic',
            name: 'サヨナラ安打',
            type: 'Basic ATK',
            description: '指定した敵単体に開拓者の攻撃力100%分の物理ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }],
            },
            energyGain: BASIC_EP,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'trailblazer-dest-skill',
            name: '安息ホームラン',
            type: 'Skill',
            description: '指定した敵単体および隣接する敵に開拓者の攻撃力125%分の物理ダメージを与える。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: 1.25, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: 1.25, toughnessReduction: 10 }],
            },
            energyGain: SKILL_EP,
            spCost: 1,
            targetType: 'blast',
        },

        ultimate: {
            id: 'trailblazer-dest-ultimate',
            name: 'スターダストエース',
            type: 'Ultimate',
            description: '2つの攻撃モードの内の1つを選択し全力のバッティングをお見舞いする。',
            // Default to Single for structure, but logic will handle choice
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: 4.50, toughnessReduction: 30 }],
            },
            energyGain: ULT_EP_REFUND,
            targetType: 'single_enemy',
        },

        talent: {
            id: 'trailblazer-dest-talent',
            name: '盗塁牽制',
            type: 'Talent',
            description: '敵を弱点撃破した後、攻撃力+20%、最大で2回累積できる。',
            energyGain: 0,
        },

        technique: {
            id: 'trailblazer-dest-technique',
            name: '不滅三振',
            type: 'Technique',
            description: '秘技を使用した後、味方全体のHPをそれぞれの最大HP15%分回復する。',
        },
    },

    traces: [
        {
            id: TRACE_IDS.A2_RESERVE,
            name: '力溜め',
            type: 'Bonus Ability',
            description: '戦闘開始時、EPを15回復する。',
        },
        {
            id: TRACE_IDS.A4_FORTIFIED,
            name: '堅靭',
            type: 'Bonus Ability',
            description: '天賦効果1層につき、開拓者の防御力+10%。',
        },
        {
            id: TRACE_IDS.A6_WILLPOWER,
            name: '闘志',
            type: 'Bonus Ability',
            description: '戦闘スキルまたは必殺技「全勝・安息ホームラン」を発動した時、指定した敵に対して与ダメージ+25%。',
        },
        {
            id: 'trailblazer-dest-stat-atk-1',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct',
            value: 0.28
        },
        {
            id: 'trailblazer-dest-stat-hp-1',
            name: '最大HP',
            type: 'Stat Bonus',
            description: '最大HP+18.0%',
            stat: 'hp_pct',
            value: 0.18
        },
        {
            id: 'trailblazer-dest-stat-def-1',
            name: '防御力',
            type: 'Stat Bonus',
            description: '防御力+12.5%',
            stat: 'def_pct',
            value: 0.125
        }
    ],

    eidolons: {
        e1: { level: 1, name: '万界に墜臨した星芒', description: '必殺技で敵を倒した時、さらに開拓者のEPを10回復する。' },
        e2: { level: 2, name: '縁の下假合した人身', description: '攻撃を行った後、攻撃が命中した敵の弱点が物理の場合、開拓者の攻撃力5%分のHPを回復する。' },
        e3: { level: 3, name: '前路を示す言霊', description: '戦闘スキルのLv.+2、天賦のLv.+2' },
        e4: { level: 4, name: '毀滅の瞬間を凝視する瞳', description: '弱点撃破状態の敵に攻撃が命中した時、会心率+25%。' },
        e5: { level: 5, name: '災劫に燃える再生の希望', description: '必殺技のLv.+2、通常攻撃のLv.+1' },
        e6: { level: 6, name: '拓宇行天の意志', description: '開拓者が敵を倒した時も、天賦が発動する。' },
    },

    defaultConfig: {
        eidolonLevel: 6,
        lightConeId: 'on-the-fall-of-an-aeon',
        superimposition: 5,
        relicSetId: 'scholar-lost-in-erudition', // Text says "知識の海に溺れる学者"
        ornamentSetId: 'space-sealing-station',
        mainStats: {
            body: 'crit_rate',
            feet: 'atk_pct',
            sphere: 'physical_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.10 },
            { stat: 'crit_dmg', value: 0.50 },
            { stat: 'atk_pct', value: 0.20 },
            { stat: 'spd', value: 5 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    },
};

// --- Helper Functions ---

/**
 * 更新天賦 (攻撃力バフ) と A4 (防御力バフ)
 */
function updateTalentStacks(state: GameState, sourceId: string, stacks: number, eidolonLevel: number, hasA4: boolean): GameState {
    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    const atkBoost = getLeveledValue(ABILITY_VALUES.talentAtkBoost, talentLevel);

    const atkEffect: IEffect = {
        id: EFFECT_IDS.TALENT_ATK_BUFF(sourceId),
        name: '盗塁牽制',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: stacks,
        maxStacks: 2,
        modifiers: [{
            source: '盗塁牽制',
            target: 'atk_pct',
            type: 'add',
            value: atkBoost
        }],
       
        /* remove removed */
    };

    let newState = addEffect(state, sourceId, atkEffect);

    if (hasA4) {
        const defEffect: IEffect = {
            id: EFFECT_IDS.A4_DEF_BUFF(sourceId),
            name: '堅靭',
            category: 'BUFF',
            sourceUnitId: sourceId,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: stacks,
            maxStacks: 2,
            modifiers: [{
                source: '堅靭',
                target: 'def_pct',
                type: 'add',
                value: 0.10
            }],
           
            /* remove removed */
        };
        newState = addEffect(newState, sourceId, defEffect);
    }

    return newState;
}

// --- Handler Factory ---
export const trailblazerDestructionHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, param) => {
    return {
        handlerMetadata: {
            id: `trailblazer-dest-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_BREAK',
                'ON_ENEMY_DEFEATED',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_AFTER_HIT',
                'ON_ULTIMATE_USED'
            ],
        },
        handlerLogic: (event: IEvent, state: GameState) => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            const eidolonLevel = unit.eidolonLevel || 0;
            const hasA4 = unit.traces?.some(t => t.id === TRACE_IDS.A4_FORTIFIED) ?? false;
            let newState = state;

            // --- A2: 戦闘開始時 EP回復 ---
            if (event.type === 'ON_BATTLE_START') {
                const hasA2 = unit.traces?.some(t => t.id === TRACE_IDS.A2_RESERVE);
                if (hasA2) {
                    newState = addEnergyToUnit(newState, sourceUnitId, 15, 0, false, { sourceId: sourceUnitId });
                }
            }

            // --- 天賦: 弱点撃破時にスタック増加 ---
            if (event.type === 'ON_WEAKNESS_BREAK' && event.sourceId === sourceUnitId) {
                const currentEffect = unit.effects.find(e => e.id === EFFECT_IDS.TALENT_ATK_BUFF(sourceUnitId));
                const currentStacks = currentEffect?.stackCount || 0;
                if (currentStacks < 2) {
                    newState = updateTalentStacks(newState, sourceUnitId, currentStacks + 1, eidolonLevel, hasA4);
                }
            }

            // --- E6: 敵を倒した時も天賦発動 ---
            if (event.type === 'ON_ENEMY_DEFEATED' && event.sourceId === sourceUnitId) {
                if (eidolonLevel >= 6) {
                    const currentEffect = unit.effects.find(e => e.id === EFFECT_IDS.TALENT_ATK_BUFF(sourceUnitId));
                    const currentStacks = currentEffect?.stackCount || 0;
                    if (currentStacks < 2) {
                        newState = updateTalentStacks(newState, sourceUnitId, currentStacks + 1, eidolonLevel, hasA4);
                    }
                }

                // E1: 必殺技で敵を倒した時 EP回復
                const actionLog = state.currentActionLog;
                if (eidolonLevel >= 1 && actionLog?.primaryActionType === 'ULTIMATE') {
                    // 1回の攻撃で1回までなので、actionLog にフラグを立てて管理するのが望ましいが、簡易的に
                    newState = addEnergyToUnit(newState, sourceUnitId, 10, 0, false, { sourceId: sourceUnitId });
                }
            }

            // --- E4: 弱点撃破状態の敵への攻撃時 会心率+25% ---
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === sourceUnitId) {
                if (eidolonLevel >= 4 && event.targetId) {
                    const target = state.registry.get(createUnitId(event.targetId));
                    if (target && target.toughness <= 0) {
                        newState = {
                            ...newState,
                            damageModifiers: {
                                ...newState.damageModifiers,
                                critRate: (newState.damageModifiers.critRate || 0) + 0.25
                            }
                        };
                    }
                }

                // A6: スキルまたは必殺技(拡散)時に与ダメージ+25%
                const actionLog = state.currentActionLog;
                const hasA6 = unit.traces?.some(t => t.id === TRACE_IDS.A6_WILLPOWER);
                if (hasA6) {
                    const targetId = (event as any).targetId;
                    // TODO: 正確なメインターゲット判定が必要だが、現状は全属性に適用するか、
                    // actionLog 側の情報を補強する必要がある。
                    // 暫定的に、SKILL または特定の ULT モードの場合に適用。
                    // 全勝・安息ホームラン判定が必要だが、とりあえずSKILLとULT(拡散)で簡易実装
                    // 本来はULT側でどのモードを使ったか判別する必要がある
                    if (actionLog?.primaryActionType === 'SKILL' ||
                        (actionLog?.primaryActionType === 'ULTIMATE' && actionLog.details?.includes('安息ホームラン'))) {
                        newState = {
                            ...newState,
                            damageModifiers: {
                                ...newState.damageModifiers,
                                allTypeDmg: (newState.damageModifiers.allTypeDmg || 0) + 0.25
                            }
                        };
                    }
                }
            }

            // --- E2: 物理弱点の敵への命中時 回復 ---
            if (event.type === 'ON_AFTER_HIT' && event.sourceId === sourceUnitId) {
                if (eidolonLevel >= 2 && event.targetId) {
                    const target = state.registry.get(createUnitId(event.targetId));
                    // target.weaknesses は Set 型なので .has() を使用
                    const hasPhysicalWeakness = target?.weaknesses?.has('Physical');
                    if (hasPhysicalWeakness) {
                        const healAmount = unit.stats.atk * 0.05;
                        // TODO: 回復エンジンの実装に合わせてここを追加
                    }
                }
            }

            // --- 必殺技モード選択ロジック (ON_ULTIMATE_USED 前に実行されることが期待される) ---
            // 実際には UltimateAbility の定義内で動的にターゲットや倍率を変える必要があるが、
            // 現状のエンジンでは ON_ULTIMATE_USED イベントで詳細を上書きする形をとる。
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                const enemies: Unit[] = [];
                state.registry.forEach(u => {
                    if (u.isEnemy && u.hp > 0) enemies.push(u);
                });
                const targetId = event.targetId;
                const target = targetId ? state.registry.get(createUnitId(targetId)) : null;

                // 隣接する敵がいるか確認
                const adjEnemies = target ? enemies.filter(e => e.id !== target.id) : []; // 簡易判定

                const ultLevel = calculateAbilityLevel(eidolonLevel, 5, 'Ultimate');

                if (adjEnemies.length > 0) {
                    // 全勝・安息ホームラン (Diffusion)
                    (event as any).details = '全勝・安息ホームラン';
                    // エンジン側でダメージ処理を行う際、この情報を参照するようにする
                } else {
                    // 全勝・サヨナラ安打 (Single)
                    (event as any).details = '全勝・サヨナラ安打';
                }
            }

            return newState;
        }
    };
};
