import { Character, CharacterBaseStats } from '../../types/index';
import { IEventHandlerFactory, IEventHandlerLogic, GameState, IEvent, Unit, ActionEvent, GeneralEvent, DamageDealtEvent } from '../../simulator/engine/types';
import { UnitRegistry } from '../../simulator/engine/unitRegistry';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { FinalStats, Modifier } from '../../types/stats';
import { cleanse, applyHealing } from '../../simulator/engine/utils';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';
import { getActiveSummon } from '../../simulator/engine/summonManager';
import { addAccumulatedValue, getAccumulatedValue, consumeAccumulatedValue } from '../../simulator/engine/accumulator';
import { advanceAction } from '../../simulator/engine/utils';
import { summonOrRefreshSpirit, reduceSpiritDuration, IMemorySpiritDefinition } from '../../simulator/engine/memorySpiritManager';
// 星魂対応ユーティリティ
import { getLeveledValue } from '../../simulator/utils/abilityLevel';

const CHARACTER_ID = 'hianshi';
const SUMMON_ID_PREFIX = 'ikarun';

// --- E3/E5パターン (非標準) ---
// E3: 必殺技Lv+2, 通常Lv+1, 精霊スキルLv+1 → 必殺技回復がLv12
// E5: スキルLv+2, 天賦Lv+2, 精霊天賦Lv+1 → スキル回復がLv12


// --- Base Stats (Lv.80) ---
const BASE_STATS: CharacterBaseStats = {
    hp: 1086,
    atk: 388,
    def: 630,
    spd: 110,
    critRate: 0.05,
    critDmg: 0.5,
    aggro: 100,
};

// --- アビリティ値 (レベル別) ---
interface HealValues { pct: number; flat: number; }

const ABILITY_VALUES = {
    // スキル回復(味方): E5でLv12に上昇 (非標準パターン)
    skillHealAlly: {
        10: { pct: 0.08, flat: 160 },
        12: { pct: 0.088, flat: 178 }
    } as Record<number, HealValues>,

    // スキル回復(イカルン): E5でLv12に上昇 (非標準パターン)
    skillHealIkarun: {
        10: { pct: 0.10, flat: 200 },
        12: { pct: 0.11, flat: 222.5 }
    } as Record<number, HealValues>,

    // 必殺技回復(味方): E3でLv12に上昇 (非標準パターン)
    ultHealAlly: {
        10: { pct: 0.10, flat: 200 },
        12: { pct: 0.11, flat: 222.5 }
    } as Record<number, HealValues>,

    // 必殺技回復(イカルン): E3でLv12に上昇 (非標準パターン)
    ultHealIkarun: {
        10: { pct: 0.12, flat: 240 },
        12: { pct: 0.132, flat: 267 }
    } as Record<number, HealValues>,
};

// 必殺技バフ (固定値)
const ULT_MAX_HP_BUFF_PCT = 0.30;
const ULT_MAX_HP_BUFF_FLAT = 600;

const SPIRIT_SKILL_DMG_PCT = 0.20;
const SPIRIT_SKILL_CLEAR_PCT = 0.50;

const TALENT_DMG_BUFF = 0.80;

const SPIRIT_TALENT_HEAL_PCT = 0.02;
const SPIRIT_TALENT_HEAL_FLAT = 20;
const SPIRIT_TALENT_COST_PCT = 0.04;

const BASIC_DMG_PCT = 0.50;

// --- イカルン定義生成関数 ---
/**
 * イカルンの精霊定義を生成する
 * @param owner ヒアンシー（オーナー）
 */
function createIkarunDefinition(owner: Unit): IMemorySpiritDefinition {
    return {
        idPrefix: SUMMON_ID_PREFIX,
        name: 'イカルン',
        element: 'Wind',
        hpMultiplier: 0.5,
        baseSpd: 1,  // 速度1: AV=10000なので通常は自発行動しない
        debuffImmune: true,
        untargetable: false,
        initialDuration: 2,
        abilities: {
            basic: {
                id: 'ikarun-basic',
                name: 'なし',
                type: 'Basic ATK',
                description: 'なし',
                damage: { type: 'simple', scaling: 'atk', hits: [] }
            },
            skill: {
                id: 'ikarun-skill',
                name: '黒雲退散',
                type: 'Skill',
                description: '蓄積回復ダメージ',
                targetType: 'all_enemies',
                energyGain: 5,
                damage: {
                    type: 'aoe',
                    scaling: 'accumulated_healing',
                    accumulatorOwnerId: owner.id,  // ヒアンシーの累計治療量を参照
                    hits: [{ multiplier: SPIRIT_SKILL_DMG_PCT, toughnessReduction: 10 }]
                }
            },
            ultimate: { id: 'ikarun-ult', name: 'なし', type: 'Ultimate', description: 'なし' },
            talent: { id: 'ikarun-talent', name: 'なし', type: 'Talent', description: 'なし' },
            technique: { id: 'ikarun-tech', name: 'なし', type: 'Technique', description: 'なし' }
        }
    };
}

// --- Helper: Talent Stack ---
function addTalentStack(state: GameState, ikarunId: string, sourceId: string): GameState {
    const ikarun = state.registry.get(createUnitId(ikarunId));
    if (!ikarun) return state;

    const stackName = '世界療しの曙光';
    const existing = ikarun.effects.find(e => e.id === `talent - stack - ${ikarunId} `);
    let stacks = 0;
    if (existing) {
        stacks = (existing as any).value || 0;
    }

    if (stacks < 3) {
        stacks++;
        state = removeEffect(state, ikarunId, existing?.id || '');
        state = addEffect(state, ikarunId, {
            id: `talent - stack - ${ikarunId} `,
            name: stackName,
            category: 'BUFF',
            type: 'Buff',
            sourceUnitId: sourceId,
            duration: 2,
            durationType: 'TURN_END_BASED',
            skipFirstTurnDecrement: true,
            value: stacks,
            modifiers: [{ target: 'all_dmg_boost', value: TALENT_DMG_BUFF * stacks, type: 'add', source: 'Talent' }],
            apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
        } as any);
    }
    return state;
}

// --- Helper: Reduce Ikarun Duration ---
function reduceIkarunDuration(state: GameState, ikarunId: string): GameState {
    const ikarun = state.registry.get(createUnitId(ikarunId));
    if (!ikarun) return state;

    let newState = state;
    const expirations: string[] = [];
    const updatedEffects = ikarun.effects.map(e => {
        if (typeof e.duration === 'number' && e.duration > 0) {
            const newDuration = e.duration - 1;
            if (newDuration <= 0) {
                expirations.push(e.id);
            }
            return { ...e, duration: newDuration };
        }
        return e;
    });

    newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(ikarunId), u => ({ ...u, effects: updatedEffects }))
    };

    for (const effId of expirations) {
        newState = removeEffect(newState, ikarunId, effId);
    }

    return newState;
}

// --- Logic ---

const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 1. Summon/Refresh Ikarun (新マネージャ使用)
    const summonResult = summonOrRefreshSpirit(newState, source, createIkarunDefinition(source));
    newState = summonResult.state;
    let ikarun = summonResult.spirit;

    // 新規召喚時の追加処理
    if (summonResult.isNew) {
        // 初回召喚EP追加
        const isFirst = !source.effects.some(e => e.id === `first - ${source.id} `);
        let epGain = 15;
        if (isFirst) {
            epGain += 30;
            newState = addEffect(newState, source.id, {
                name: '初回召喚チェック',
                type: 'Buff',
                category: 'OTHER' as any,
                duration: -1,
                durationType: 'PERMANENT',
                id: `first - ${source.id} `,
                sourceUnitId: source.id,
                apply: (t: Unit, s: GameState) => s,
                remove: (t: Unit, s: GameState) => s,
                modifiers: []
            });
        }
        newState = addEnergyToUnit(newState, source.id, 0, epGain, false, {
            sourceId: source.id,
            publishEventFn: publishEvent
        });

        // E6: イカルン存在時、味方全体の全属性耐性貫通+20%
        if ((source.eidolonLevel || 0) >= 6) {
            const allies = newState.registry.getAliveAllies();
            allies.forEach(ally => {
                newState = addEffect(newState, ally.id, {
                    id: `e6 - res - pen - ${ally.id} `,
                    name: 'E6 全属性耐性貫通',
                    category: 'BUFF',
                    type: 'Buff',
                    sourceUnitId: source.id,
                    duration: -1,
                    durationType: 'PERMANENT',
                    modifiers: [{ target: 'all_type_res_pen', value: 0.20, type: 'add', source: 'E6' }],
                    apply: (t: Unit, s: GameState) => s,
                    remove: (t: Unit, s: GameState) => s
                });
            });
        }

        // 微笑む暗雲: イカルンにも会心率+100%
        if (source.traces?.some(t => t.name === '微笑む暗雲')) {
            newState = addEffect(newState, ikarun.id, {
                id: `trace - smiling - dark - cloud - ikarun - ${ikarun.id} `,
                name: '微笑む暗雲 (イカルン)',
                category: 'BUFF',
                type: 'Buff',
                sourceUnitId: source.id,
                duration: -1,
                durationType: 'PERMANENT',
                modifiers: [{ target: 'crit_rate', value: 1.0, type: 'add', source: 'Trace' }],
                apply: (t: Unit, s: GameState) => s,
                remove: (t: Unit, s: GameState) => s
            });
        }
    }

    // Refresh ikarun reference from state
    ikarun = newState.registry.get(createUnitId(ikarun.id))!;

    // 2. Clear Debuff
    if (source.traces?.some(t => t.name === '優しい雷雨')) {
        newState.registry.getAliveAllies().forEach(u => {
            newState = cleanse(newState, u.id, 1);
        });
    }

    // 3. Heal Allies
    const allies = newState.registry.getAliveAllies().filter(u => u.id !== ikarun.id);

    // 速度ブースト計算
    let baseMultiplier = 1.0;
    if (source.traces?.some(t => t.name === '凪いだ暴風')) {
        const excess = Math.max(0, Math.min(source.stats.spd - 200, 200));
        baseMultiplier += (excess * 0.01);
    }

    // E5でスキルLv+2 → Lv12の回復値を使用 (非標準パターン)
    const skillLevel = (source.eidolonLevel || 0) >= 5 ? 12 : 10;
    const skillHealAlly = getLeveledValue(ABILITY_VALUES.skillHealAlly, skillLevel);
    const skillHealIkarun = getLeveledValue(ABILITY_VALUES.skillHealIkarun, skillLevel);

    // Execute Heal
    allies.forEach(ally => {
        // 微笑む暗雲: HP50%以下の味方に回復量+25%
        const finalMultiplier = (source.traces?.some(t => t.name === '微笑む暗雲') && (ally.hp / ally.stats.hp) <= 0.5) ? 1.25 : 1.0;

        newState = applyHealing(newState, source.id, ally.id, {
            scaling: 'hp',
            multiplier: skillHealAlly.pct,
            flat: skillHealAlly.flat,
            baseMultiplier,
            finalMultiplier
        }, '戦闘スキル: 味方回復', true);

        // 蓄積値は実際の回復量を計算して追加
        const healAmount = (skillHealAlly.pct * source.stats.hp + skillHealAlly.flat) * baseMultiplier * finalMultiplier;
        newState = addAccumulatedValue(newState, source.id, 'healing', healAmount);
        newState = addTalentStack(newState, ikarun.id, source.id);
    });

    // Heal Ikarun
    const ikarunFinalMultiplier = (source.traces?.some(t => t.name === '微笑む暗雲') && (ikarun.hp / ikarun.stats.hp) <= 0.5) ? 1.25 : 1.0;
    newState = applyHealing(newState, source.id, ikarun.id, {
        scaling: 'hp',
        multiplier: skillHealIkarun.pct,
        flat: skillHealIkarun.flat,
        baseMultiplier,
        finalMultiplier: ikarunFinalMultiplier
    }, '戦闘スキル: イカルン回復', true);

    const ikarunHealAmount = (skillHealIkarun.pct * source.stats.hp + skillHealIkarun.flat) * baseMultiplier * ikarunFinalMultiplier;
    newState = addAccumulatedValue(newState, source.id, 'healing', ikarunHealAmount);
    newState = addTalentStack(newState, ikarun.id, source.id);

    return newState;
};

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // 1. Summon/Refresh Ikarun (新マネージャ使用)
    const summonResult = summonOrRefreshSpirit(newState, source, createIkarunDefinition(source));
    newState = summonResult.state;
    let ikarun = summonResult.spirit;

    // Refresh ikarun reference from state
    ikarun = newState.registry.get(createUnitId(ikarun.id))!;

    if (source.traces?.some(t => t.name === '優しい雷雨')) {
        newState.registry.getAliveAllies().forEach(u => newState = cleanse(newState, u.id, 1));
    }

    const allies = newState.registry.getAliveAllies().filter(u => u.id !== ikarun.id);

    // 速度ブースト計算
    let baseMultiplier = 1.0;
    if (source.traces?.some(t => t.name === '凪いだ暴風')) {
        const excess = Math.max(0, Math.min(source.stats.spd - 200, 200));
        baseMultiplier += (excess * 0.01);
    }
    // E3で必殺技Lv+2 → Lv12の回復値を使用 (非標準パターン)
    const ultLevel = (source.eidolonLevel || 0) >= 3 ? 12 : 10;
    const ultHealAlly = getLeveledValue(ABILITY_VALUES.ultHealAlly, ultLevel);
    const ultHealIkarun = getLeveledValue(ABILITY_VALUES.ultHealIkarun, ultLevel);

    allies.forEach(ally => {
        // 微笑む暗雲: HP50%以下の味方に回復量+25%
        const finalMultiplier = (source.traces?.some(t => t.name === '微笑む暗雲') && (ally.hp / ally.stats.hp) <= 0.5) ? 1.25 : 1.0;

        newState = applyHealing(newState, source.id, ally.id, {
            scaling: 'hp',
            multiplier: ultHealAlly.pct,
            flat: ultHealAlly.flat,
            baseMultiplier,
            finalMultiplier
        }, '必殺技: 味方回復', true);

        const healAmount = (ultHealAlly.pct * source.stats.hp + ultHealAlly.flat) * baseMultiplier * finalMultiplier;
        newState = addAccumulatedValue(newState, source.id, 'healing', healAmount);
        newState = addTalentStack(newState, ikarun.id, source.id);
    });

    const ikarunFinalMultiplier = (source.traces?.some(t => t.name === '微笑む暗雲') && (ikarun.hp / ikarun.stats.hp) <= 0.5) ? 1.25 : 1.0;
    newState = applyHealing(newState, source.id, ikarun.id, {
        scaling: 'hp',
        multiplier: ultHealIkarun.pct,
        flat: ultHealIkarun.flat,
        baseMultiplier,
        finalMultiplier: ikarunFinalMultiplier
    }, '必殺技: イカルン回復', true);

    const ikarunHealAmount = (ultHealIkarun.pct * source.stats.hp + ultHealIkarun.flat) * baseMultiplier * ikarunFinalMultiplier;
    newState = addAccumulatedValue(newState, source.id, 'healing', ikarunHealAmount);
    newState = addTalentStack(newState, ikarun.id, source.id);

    const afterRainId = `after - rain - ${source.id} `;
    newState = addEffect(newState, source.id, {
        id: afterRainId,
        name: '雨上がり',
        category: 'BUFF',
        type: 'Buff',
        sourceUnitId: source.id,
        duration: 3,
        durationType: 'TURN_START_BASED',
        modifiers: [],
        apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
    });

    const e1 = (source.eidolonLevel || 0) >= 1;
    const hpBuffPct = ULT_MAX_HP_BUFF_PCT * (e1 ? 1.5 : 1.0);
    const hpBuffFlat = ULT_MAX_HP_BUFF_FLAT * (e1 ? 1.5 : 1.0);
    const allAllies = newState.registry.getAliveAllies();
    allAllies.forEach(u => {
        newState = addEffect(newState, u.id, {
            id: `rain - hp - buff - ${u.id} `,
            name: 'HPバフ (雨上がり)',
            category: 'BUFF',
            type: 'Buff',
            sourceUnitId: source.id,
            duration: 1, // Dummy duration, reliant on Parent
            durationType: 'LINKED', // Changed to LINKED
            linkedEffectId: afterRainId, // Linked to Parent
            modifiers: [
                { target: 'hp_pct', value: hpBuffPct, type: 'add', source: 'Ult HP Buff' },
                { target: 'hp', value: hpBuffFlat, type: 'add', source: 'Ult HP Buff' }
            ],
            apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
        });
    });

    return newState;
};

const onActionComplete = (event: ActionEvent, state: GameState, sourceUnitId: string): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    // 1. Auto Skill Logic (Hianshi's After Rain)
    if (event.type === 'ON_ACTION_COMPLETE' &&
        event.sourceId === sourceUnitId &&
        event.subType === 'SKILL'
    ) {
        if (source.effects.some(e => e.id === `after-rain-${source.id}`)) {
            const ikarun = getActiveSummon(state, sourceUnitId, SUMMON_ID_PREFIX);

            if (ikarun) {
                let newState = state;
                const accHeal = getAccumulatedValue(newState, sourceUnitId, 'healing');
                const dmg = accHeal * SPIRIT_SKILL_DMG_PCT;
                const enemies = newState.registry.getAliveEnemies();
                enemies.forEach(e => {
                    newState = applyUnifiedDamage(newState, ikarun!, e, dmg, {
                        damageType: 'スキル',
                        details: '精霊スキル (自動)'
                    }).state;
                });

                const clearRate = ((source.eidolonLevel || 0) >= 6) ? 0.12 : SPIRIT_SKILL_CLEAR_PCT;
                newState = consumeAccumulatedValue(newState, sourceUnitId, 'healing', clearRate, 'percent');

                newState = reduceIkarunDuration(newState, ikarun.id);

                return newState;
            }
        }
    }

    // 2. Manual Ikarun Skill Logic (サモン専用) - サンデーのスキル等でターンが回った時
    // ダメージ計算はdispatcherで行われるため、ここでは蓄積値消費と持続時間減少のみ
    const ikarunRef = getActiveSummon(state, sourceUnitId, SUMMON_ID_PREFIX);
    if (event.type === 'ON_ACTION_COMPLETE' &&
        event.subType === 'SKILL' &&
        ikarunRef &&
        event.sourceId === ikarunRef.id
    ) {
        let newState = state;

        // 蓄積値を消費
        const clearRate = ((source?.eidolonLevel || 0) >= 6) ? 0.12 : SPIRIT_SKILL_CLEAR_PCT;
        newState = consumeAccumulatedValue(newState, sourceUnitId, 'healing', clearRate, 'percent');

        // 持続時間を減少
        newState = reduceIkarunDuration(newState, ikarunRef.id);

        return newState;
    }

    return state;
};

const onDamageDealt = (event: DamageDealtEvent, state: GameState, sourceUnitId: string): GameState => {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    let newState = state;

    // E1: 雨上がり状態で味方が攻撃後HP8%回復
    if ((source.eidolonLevel || 0) >= 1) {
        const afterRain = source.effects.find(e => e.id === `after - rain - ${source.id} `);
        const attacker = state.registry.get(createUnitId(event.sourceId));
        if (afterRain && attacker && !attacker.isEnemy && attacker.id !== sourceUnitId) {
            newState = applyHealing(newState, source.id, attacker.id, {
                scaling: 'hp',
                multiplier: 0.08,
                flat: 0
            }, 'E1 攻撃後回復', true);
        }
    }

    // 精霊天賦: リアクティブヒール
    if (event.targetId && newState.registry.toArray().some(u => u.id === event.targetId && !u.isEnemy && u.id !== `${SUMMON_ID_PREFIX} -${sourceUnitId} `)) {
        const ikarun = getActiveSummon(newState, sourceUnitId, SUMMON_ID_PREFIX);

        if (ikarun) {
            const cost = ikarun.stats.hp * SPIRIT_TALENT_COST_PCT;
            if (ikarun.hp > cost) {
                // HPコスト消費: updateUnitを使用
                let newState = {
                    ...state,
                    registry: state.registry.update(createUnitId(ikarun.id), u => ({ ...u, hp: ikarun.hp - cost }))
                };

                const source = state.registry.get(createUnitId(sourceUnitId))!;
                // 速度ブースト計算
                let baseMultiplier = 1.0;
                if (source.traces?.some(t => t.name === '凪いだ暴風')) {
                    const excess = Math.max(0, Math.min(source.stats.spd - 200, 200));
                    baseMultiplier += (excess * 0.01);
                }

                const target = newState.registry.get(createUnitId(event.targetId));
                if (target) {
                    // 微笑む暗雲: HP50%以下の味方に回復量+25%
                    const finalMultiplier = (source.traces?.some(t => t.name === '微笑む暗雲') && (target.hp / target.stats.hp) <= 0.5) ? 1.25 : 1.0;

                    newState = applyHealing(newState, ikarun.id, target.id, {
                        scaling: 'hp',
                        multiplier: SPIRIT_TALENT_HEAL_PCT,
                        flat: SPIRIT_TALENT_HEAL_FLAT,
                        baseMultiplier,
                        finalMultiplier
                    }, 'リアクティブヒール', true);

                    const allies = newState.registry.getAliveAllies();
                    allies.forEach(a => {
                        const allyFinalMultiplier = (source.traces?.some(t => t.name === '微笑む暗雲') && (a.hp / a.stats.hp) <= 0.5) ? 1.25 : 1.0;

                        // 本来applyHealingを使うべきだが、元コードに合わせてHP直接加算
                        const baseHeal = source.stats.hp * SPIRIT_TALENT_HEAL_PCT + SPIRIT_TALENT_HEAL_FLAT;
                        const aHeal = baseHeal * baseMultiplier * allyFinalMultiplier;
                        const newHp = Math.min(a.hp + aHeal, a.stats.hp);
                        newState = {
                            ...newState,
                            registry: newState.registry.update(createUnitId(a.id), u => ({ ...u, hp: newHp }))
                        };
                    });

                    if ((source.eidolonLevel || 0) >= 2) {
                        const tId = event.targetId!;
                        newState = addEffect(newState, tId, {
                            id: `e2 - spd - ${tId} -${Date.now()} `, name: 'E2 速度アップ', category: 'BUFF', type: 'Buff', sourceUnitId: source.id, duration: 2, durationType: 'TURN_END_BASED', skipFirstTurnDecrement: true,
                            modifiers: [{ target: 'spd_pct', value: 0.30, type: 'add', source: 'E2' }], apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
                        });
                    }

                    // Note: Counter attack removed per spec (not in hianshi.txt spirit talent description)
                }
                return newState;
            }
        }
    }

    return state;
};

export const Hianshi: Character = {
    id: CHARACTER_ID,
    name: 'ヒアンシー',
    path: 'Remembrance',
    element: 'Wind',
    rarity: 5,
    maxEnergy: 140,
    baseStats: BASE_STATS,
    traces: [
        { id: 'stat-spd', name: '速度強化', type: 'Stat Bonus', stat: 'spd', value: 14, description: '' },
        { id: 'stat-effect-res', name: '効果抵抗強化', type: 'Stat Bonus', stat: 'effect_res', value: 0.18, description: '' },
        { id: 'stat-hp', name: '最大HP強化', type: 'Stat Bonus', stat: 'hp_pct', value: 0.10, description: '' },
        { id: 'smiling-dark-cloud', name: '微笑む暗雲', type: 'Bonus Ability', description: '会心率+100%、低HP時回復量+25%' },
        { id: 'gentle-thunderstorm', name: '優しい雷雨', type: 'Bonus Ability', description: '効果抵抗+50%、スキル/必殺技使用時デバフ解除' },
        { id: 'calm-storm', name: '凪いだ暴風', type: 'Bonus Ability', description: 'SPD>200時 HP+20%、回復量+1%/SPD' },
    ],
    abilities: {
        basic: {
            id: 'basic', name: '雲の愛撫', type: 'Basic ATK', description: 'HPスケーリング風属性ダメージ',
            damage: { type: 'simple', scaling: 'hp', hits: [{ multiplier: BASIC_DMG_PCT, toughnessReduction: 10 }] },
            spCost: 0, energyGain: 20
        },
        skill: {
            id: 'skill', name: '虹色の愛情を注ぐ', type: 'Skill', description: 'イカルン召喚、回復',
            targetType: 'ally', spCost: 1, energyGain: 30,
        },
        ultimate: {
            id: 'ult', name: '曙光に飛び込む', type: 'Ultimate', description: '召喚、回復、バフ、雨上がり',
            targetType: 'self',
            energyGain: 5,
        },
        talent: { id: 'talent', name: '世界療しの曙光', type: 'Talent', description: 'イカルンステータス、回復時ダメージアップ' },
        technique: { id: 'tech', name: 'お日様ぽかぽか', type: 'Technique', description: '戦闘開始時回復、HPバフ' }
    },
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'so-the-rainbow-doesnt-fade',
        superimposition: 1,
        relicSetId: 'warlord_of_blazing_sun_and_thunderous_roar',
        ornamentSetId: 'giant_tree_immersed_in_deep_thought',
        mainStats: {
            body: 'outgoing_healing_boost',
            feet: 'spd',
            sphere: 'hp_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'spd', value: 25 },
            { stat: 'hp_pct', value: 0.388 },
            { stat: 'crit_dmg', value: 0.648 },
            { stat: 'effect_res', value: 0.20 },
        ],
        rotation: ['s', 'b', 'b'],
        rotationMode: 'sequence',
        ultStrategy: 'immediate',
        ultCooldown: 4
    }
};

const onBattleStart: IEventHandlerLogic = (event, state, handlerId) => {
    // Note: ON_BATTLE_START has sourceId='system', so do not check event.sourceId === handlerId
    const source = state.registry.get(createUnitId(handlerId));
    if (!source) return state;

    let newState = state;

    // --- Passive Traces ---

    // 1. 微笑む暗雲: Crit Rate +100%
    if (source.traces?.some(t => t.name === '微笑む暗雲')) {
        newState = addEffect(newState, source.id, {
            id: `trace - smiling - dark - cloud - ${source.id} `,
            name: '微笑む暗雲 (パッシブ)',
            category: 'BUFF',
            type: 'Buff',
            sourceUnitId: source.id,
            duration: -1,
            durationType: 'PERMANENT',
            modifiers: [{ target: 'crit_rate', value: 1.0, type: 'add', source: 'Trace' }],
            apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
        });
    }

    // 2. 優しい雷雨: Effect Res +50%
    if (source.traces?.some(t => t.name === '優しい雷雨')) {
        newState = addEffect(newState, source.id, {
            id: `trace - gentle - thunderstorm - ${source.id} `,
            name: '優しい雷雨 (パッシブ)',
            category: 'BUFF',
            type: 'Buff',
            sourceUnitId: source.id,
            duration: -1,
            durationType: 'PERMANENT',
            modifiers: [{ target: 'effect_res', value: 0.5, type: 'add', source: 'Trace' }],
            apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
        });
    }

    // 3. 凪いだ暴風: SPD > 200 -> HP +20% (とイカルン), E4: 超過速度*2% 会心ダメージ
    if (source.traces?.some(t => t.name === '凪いだ暴風')) {
        if (source.stats.spd > 200) {
            const excessSpd = Math.min(source.stats.spd - 200, 200);

            // HP +20% for Hianshi
            newState = addEffect(newState, source.id, {
                id: `trace - calm - storm - ${source.id} `,
                name: '凪いだ暴風 (パッシブ)',
                category: 'BUFF',
                type: 'Buff',
                sourceUnitId: source.id,
                duration: -1,
                durationType: 'PERMANENT',
                modifiers: [{ target: 'hp_pct', value: 0.2, type: 'add', source: 'Trace' }],
                apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
            });

            // E4: 超過速度ごとに会心ダメージ+2%
            if ((source.eidolonLevel || 0) >= 4) {
                const critDmgBonus = excessSpd * 0.02;
                newState = addEffect(newState, source.id, {
                    id: `e4 - calm - storm - ${source.id} `,
                    name: 'E4 凪いだ暴風強化',
                    category: 'BUFF',
                    type: 'Buff',
                    sourceUnitId: source.id,
                    duration: -1,
                    durationType: 'PERMANENT',
                    modifiers: [{ target: 'crit_dmg', value: critDmgBonus, type: 'add', source: 'E4' }],
                    apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
                });
            }
        }
    }


    // --- Technique: Sunny Everyone ---
    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = source.config?.useTechnique !== false;

    if (useTechnique) {
        // 1. Heal: 30% MaxHP + 600
        const techHealPct = 0.30;
        const techHealFlat = 600;
        const healBase = techHealPct * source.stats.hp + techHealFlat;

        // 2. MaxHP Buff: +20%
        const hpBuffPct = 0.20;
        const hpBuffFlat = 0;

        const allies = newState.registry.getAliveAllies();

        allies.forEach(ally => {
            newState = applyHealing(newState, source.id, ally.id, {
                scaling: 'hp',
                multiplier: techHealPct,
                flat: techHealFlat
            }, '秘技「お日様ぽかぽか」: 回復', true);

            newState = addEffect(newState, ally.id, {
                id: `sunny - everyone - hp - ${ally.id} `,
                name: 'HPバフ (お日様ぽかぽか)',
                category: 'BUFF',
                type: 'Buff',
                sourceUnitId: source.id,
                duration: 2,
                durationType: 'TURN_END_BASED',
                skipFirstTurnDecrement: true,
                modifiers: [
                    { target: 'hp_pct', value: hpBuffPct, type: 'add', source: 'Sunny Everyone' },
                ],
                apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
            });
        });

        // Log Technique activation
        newState.log.push({
            actionType: '秘技',
            sourceId: handlerId,
            characterName: source.name,
            targetId: 'all_allies',
            details: '秘技「お日様ぽかぽか、輝くみんな！」発動'
        });
    }

    return newState;
};

const onUnitDeath = (event: GeneralEvent, state: GameState, sourceUnitId: string): GameState => {
    // Check if the dead unit is Ikarun related to this Hianshi
    if (!event.targetId) return state;

    // Check if it's Ikarun (Summon or Party Member)
    // Party Member ID: 'ikarun'
    // Summon ID: 'ikarun-hianshi' (prefix + sourceId)
    const isIkarun = event.targetId === 'ikarun' || event.targetId === `${SUMMON_ID_PREFIX} -${sourceUnitId} `;

    if (isIkarun) {
        // Hianshi Action Advance 30%
        // Verify sourceUnitId is Hianshi
        const hianshi = state.registry.get(createUnitId(sourceUnitId));
        if (hianshi) {
            let newState = advanceAction(state, sourceUnitId, 0.30);
            newState.log.push({
                actionType: '天賦',
                sourceId: sourceUnitId,
                characterName: hianshi.name,
                targetId: sourceUnitId,
                details: '精霊天賦: 退場時行動順短縮 (30%)'
            });
            return newState;
        }
    }
    return state;
};

const onTurnStart: IEventHandlerLogic = (event, state, handlerId) => {
    const source = state.registry.get(createUnitId(handlerId));
    if (!source) return state;
    if (!source.traces?.some(t => t.name === '凪いだ暴風')) return state;

    let newState = state;
    const conditionMet = source.stats.spd > 200;
    const excessSpd = conditionMet ? Math.min(source.stats.spd - 200, 200) : 0;

    // ヒアンシー用バフの管理
    const hianshiBuff = source.effects.find(e => e.id === `trace - calm - storm - ${source.id} `);
    if (conditionMet && !hianshiBuff) {
        newState = addEffect(newState, source.id, {
            id: `trace - calm - storm - ${source.id} `,
            name: '凪いだ暴風 (パッシブ)',
            category: 'BUFF',
            type: 'Buff',
            sourceUnitId: source.id,
            duration: -1,
            durationType: 'PERMANENT',
            modifiers: [{ target: 'hp_pct', value: 0.2, type: 'add', source: 'Trace' }],
            apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
        });
    } else if (!conditionMet && hianshiBuff) {
        newState = removeEffect(newState, source.id, hianshiBuff.id);
    }

    // E4: ヒアンシー用会心ダメージバフの管理
    // effects取得方法を修正
    const sourceUnit = newState.registry.get(createUnitId(source.id));
    const hianshiE4Buff = sourceUnit?.effects.find(e => e.id === `e4 - calm - storm - ${source.id} `);
    if ((source.eidolonLevel || 0) >= 4) {
        if (conditionMet && !hianshiE4Buff) {
            const critDmgBonus = excessSpd * 0.02;
            newState = addEffect(newState, source.id, {
                id: `e4 - calm - storm - ${source.id} `,
                name: 'E4 凪いだ暴風強化',
                category: 'BUFF',
                type: 'Buff',
                sourceUnitId: source.id,
                duration: -1,
                durationType: 'PERMANENT',
                modifiers: [{ target: 'crit_dmg', value: critDmgBonus, type: 'add', source: 'E4' }],
                apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
            });
        } else if (!conditionMet && hianshiE4Buff) {
            newState = removeEffect(newState, source.id, hianshiE4Buff.id);
        }
    }

    // イカルン用バフの管理
    const ikarun = getActiveSummon(newState, source.id, SUMMON_ID_PREFIX);
    if (ikarun) {
        const ikarunBuff = ikarun.effects.find(e => e.id === `trace - calm - storm - ikarun - ${ikarun.id} `);
        if (conditionMet && !ikarunBuff) {
            newState = addEffect(newState, ikarun.id, {
                id: `trace - calm - storm - ikarun - ${ikarun.id} `,
                name: '凪いだ暴風 (イカルン)',
                category: 'BUFF',
                type: 'Buff',
                sourceUnitId: source.id,
                duration: -1,
                durationType: 'PERMANENT',
                modifiers: [{ target: 'hp_pct', value: 0.2, type: 'add', source: 'Trace' }],
                apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
            });
        } else if (!conditionMet && ikarunBuff) {
            newState = removeEffect(newState, ikarun.id, ikarunBuff.id);
        }

        // E4: イカルン用会心ダメージバフの管理
        const updatedIkarun = newState.registry.get(createUnitId(ikarun.id));
        const ikarunE4Buff = updatedIkarun?.effects.find(e => e.id === `e4 - calm - storm - ikarun - ${ikarun.id} `);
        if ((source.eidolonLevel || 0) >= 4) {
            if (conditionMet && !ikarunE4Buff) {
                const critDmgBonus = excessSpd * 0.02;
                newState = addEffect(newState, ikarun.id, {
                    id: `e4 - calm - storm - ikarun - ${ikarun.id} `,
                    name: 'E4 凪いだ暴風強化 (イカルン)',
                    category: 'BUFF',
                    type: 'Buff',
                    sourceUnitId: source.id,
                    duration: -1,
                    durationType: 'PERMANENT',
                    modifiers: [{ target: 'crit_dmg', value: critDmgBonus, type: 'add', source: 'E4' }],
                    apply: (t: Unit, s: GameState) => s, remove: (t: Unit, s: GameState) => s
                });
            } else if (!conditionMet && ikarunE4Buff) {
                newState = removeEffect(newState, ikarun.id, ikarunE4Buff.id);
            }
        }
    }

    return newState;
};

export const hianshiHandlerFactory: import('../../simulator/engine/types').IEventHandlerFactory = (sourceUnitId, level, eidolonLevel = 0) => {
    return {
        handlerMetadata: {
            id: `hianshi - handler - ${sourceUnitId} `,
            subscribesTo: ['ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_ACTION_COMPLETE', 'ON_DAMAGE_DEALT', 'ON_BATTLE_START', 'ON_UNIT_DEATH', 'ON_TURN_START']
        },
        handlerLogic: (event, state, handlerId) => {
            if (event.type === 'ON_SKILL_USED') {
                return onSkillUsed(event, state, sourceUnitId);
            } else if (event.type === 'ON_ULTIMATE_USED') {
                return onUltimateUsed(event, state, sourceUnitId);
            } else if (event.type === 'ON_ACTION_COMPLETE') {
                return onActionComplete(event, state, sourceUnitId);
            } else if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event, state, sourceUnitId);
            } else if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, state, sourceUnitId);
            } else if (event.type === 'ON_UNIT_DEATH') {
                return onUnitDeath(event, state, sourceUnitId);
            } else if (event.type === 'ON_TURN_START') {
                return onTurnStart(event, state, sourceUnitId);
            }
            return state;
        }
    };
};
