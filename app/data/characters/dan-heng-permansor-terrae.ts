import { Character, CharacterBaseStats } from '../../types/index';
import { IEventHandlerLogic, GameState, Unit, IEventHandlerFactory, DamageDealtEvent, ActionEvent, GeneralEvent } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';

import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateDamageWithCritInfo } from '../../simulator/damage';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { FinalStats, Modifier } from '../../types/stats';
import { cleanse, advanceAction, applyShield } from '../../simulator/engine/utils';
// Generic Managers
import { createSummon, getActiveSummon } from '../../simulator/engine/summonManager';
import { addSkillPoints } from '../../simulator/effect/relicEffectHelpers';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';
// 星魂対応ユーティリティ
import { getLeveledValue, BarrierValues, EnhancedAttackValues, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';

const CHARACTER_ID = 'dan-heng-permansor-terrae';
const SUMMON_ID_PREFIX = 'dragon-spirit';

// --- 定数定義 ---
const EFFECT_IDS = {
    COMRADE: (targetId: string) => `comrade-${targetId}`,
    ENHANCED_DRAGON: (summonId: string) => `enhanced-dragon-${summonId}`,
    E1_RES_PEN: (targetId: string) => `e1-res-pen-${targetId}`,
    E6_VULN: (targetId: string) => `e6-vuln-${targetId}`,
} as const;

const TRACE_IDS = {
    WEI_GUAN: 'wei-guan', // 偉観
    BAI_HUA: 'bai-hua',   // 百花
    YI_LI: 'yi-li',       // 屹立
    ASC_4: 'asc-4',       // Asc4
} as const;

// --- E3/E5パターン ---
// E3: スキルLv+2, 通常Lv+1 → スキルバリアがLv12
// E5: 必殺技Lv+2, 天賦Lv+2 → 必殺技・強化攻撃・天賦バリアがLv12

/**
 * 丹恒・騰荒 (Dan Heng • Toukou)
 * 運命: 存護
 * 属性: 物理
 * レアリティ: 5
 * 最大EP: 135
 * 
 * 基礎ステータス (Lv.80):
 * HP: 1047
 * ATK: 582
 * DEF: 776
 * SPD: 97
 */

// --- 基礎ステータス ---
const BASE_STATS: CharacterBaseStats = {
    hp: 1047,
    atk: 582,
    def: 776,
    spd: 97,
    critRate: 0.05,
    critDmg: 0.5,
    aggro: 150,
};

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // スキル: E3でLv12に上昇
    skillBarrier: {
        10: { pct: 0.20, flat: 400 },
        12: { pct: 0.212, flat: 445 }
    } as Record<number, BarrierValues>,

    // 必殺技ダメージ: E5でLv12に上昇
    ultDamage: {
        10: 3.00,
        12: 3.30
    } as Record<number, number>,

    // 必殺技強化攻撃: E5でLv12に上昇
    enhancedAttack: {
        10: { dh: 0.80, comrade: 0.80 },
        12: { dh: 0.88, comrade: 0.88 }
    } as Record<number, EnhancedAttackValues>,

    // 天賦バリア: E5でLv12に上昇
    talentBarrier: {
        10: { pct: 0.10, flat: 200 },
        12: { pct: 0.106, flat: 222.5 }
    } as Record<number, BarrierValues>,
};

// 軌跡「屹立」: レベルに依存しない固定値
const YILI_BARRIER_PCT = 0.05;
const YILI_BARRIER_FLAT = 100;
const YILI_DMG_MULT = 0.40;

// --- 召喚ユニット定義 ---
const DRAGON_SPIRIT_BASE_SPD = 165;

// --- ヘルパー関数 ---

// バリア付与（共通処理）
function applyDanHengShield(state: GameState, source: Unit, targetId: string, multiplier: number, flat: number, skillCap: number): GameState {
    return applyShield(
        state,
        source.id,
        targetId,
        { scaling: 'atk', multiplier: multiplier, flat: flat },
        3,
        'TURN_END_BASED',
        'Dan Heng Shield',
        undefined,
        true,
        { stackable: true, cap: skillCap }
    );
}

// 龍霊召喚・更新
function ensureDragonSpirit(state: GameState, source: Unit, linkedTargetId: string): GameState {
    let newState = state;
    let summon = getActiveSummon(newState, source.id, SUMMON_ID_PREFIX);

    if (!summon) {
        summon = createSummon(source, {
            idPrefix: SUMMON_ID_PREFIX,
            name: '龍霊',
            baseStats: { hp: 1, atk: 1, def: 1, spd: DRAGON_SPIRIT_BASE_SPD, crit_rate: 0, crit_dmg: 0 } as unknown as FinalStats,
            baseSpd: DRAGON_SPIRIT_BASE_SPD,
            element: 'Physical',
            abilities: {
                basic: { id: 'ds-basic', name: '待機', type: 'Basic ATK', description: '待機' },
                skill: { id: 'ds-action', name: '龍霊の行動', type: 'Skill', description: '龍霊の行動', targetType: 'self' },
                ultimate: { id: 'ds-ult', name: 'None', type: 'Ultimate', description: 'None' },
                talent: { id: 'ds-talent', name: 'None', type: 'Talent', description: 'None' },
                technique: { id: 'ds-tech', name: 'None', type: 'Technique', description: 'None' },
            }
        });
        // リンクID設定
        summon.linkedUnitId = createUnitId(linkedTargetId);
        // スキル連打設定
        summon.config = {
            rotation: ['s'],
            rotationMode: 'spam_skill'
        } as any;
        newState = { ...newState, registry: newState.registry.add(summon) };
    } else {
        const s = summon!;
        if (s.linkedUnitId !== linkedTargetId) {
            newState = { ...newState, registry: newState.registry.update(createUnitId(s.id as string), u => ({ ...u, linkedUnitId: createUnitId(linkedTargetId) as any })) };
        }
    }
    return newState;
}


// --- ハンドラー関数 ---

// 1. 戦闘スキル処理
const onSkillUsed: IEventHandlerLogic = (event, state, _handlerId) => {
    const source = state.registry.get(createUnitId(event.sourceId));
    // Manual targeting handles event.targetId. Fallback to sourceId if missing (self-target) though usually skill has target.
    const target = state.registry.get(createUnitId((event as ActionEvent).targetId || event.sourceId));
    if (!source || !target) return state;

    let newState = state;

    // 1. 「同袍」付与
    // 自身が付与した古い同袍を解除
    newState.registry.toArray().forEach(u => {
        const old = u.effects.find(e => e.id === EFFECT_IDS.COMRADE(u.id) && e.sourceUnitId === source.id);
        if (old) newState = removeEffect(newState, u.id, old.id);
    });

    const comradeModifiers: Modifier[] = [];
    // 軌跡「偉観」: 同袍に丹恒・騰荒のATKの15%を加算（動的参照）
    if (source.traces?.some(t => t.id === TRACE_IDS.WEI_GUAN)) {
        const dhId = source.id; // クロージャで保持
        comradeModifiers.push({
            target: 'atk',
            value: 0, // 静的値は0（dynamicValueで計算）
            type: 'add',
            source: '偉観',
            sourceUnitId: dhId,
            dynamicValue: (_target, allUnits) => {
                const dh = allUnits.find(u => u.id === dhId);
                return dh ? dh.stats.atk * 0.15 : 0;
            }
        });
    }
    // E4: 同袍の被ダメージ -20%
    if ((source.eidolonLevel || 0) >= 4) {
        comradeModifiers.push({ target: 'all_type_vuln', value: -0.20, type: 'add', source: 'E4 Damage Reduction' });
    }
    // E6: 同袍の防御無視 12%
    if ((source.eidolonLevel || 0) >= 6) {
        comradeModifiers.push({ target: 'def_ignore', value: 0.12, type: 'add', source: 'E6 Def Ignore' });
    }

    newState = addEffect(newState, target.id, {
        id: EFFECT_IDS.COMRADE(target.id),
        name: '同袍',
        category: 'BUFF',
        type: 'Buff',
        sourceUnitId: source.id,
        duration: -1, // 永続
        durationType: 'PERMANENT',
        modifiers: comradeModifiers,
        apply: (t, s) => s,
        remove: (t, s) => s,
    });

    // E6 グローバルデバフ (敵全体の被ダメージアップ)
    if ((source.eidolonLevel || 0) >= 6) {
        const enemies = newState.registry.getAliveEnemies();
        enemies.forEach(e => {
            // まだ付与されていなければ付与
            if (!e.effects.some(ef => ef.id === EFFECT_IDS.E6_VULN(e.id))) {
                newState = addEffect(newState, e.id, {
                    id: EFFECT_IDS.E6_VULN(e.id), name: 'E6 Vuln', category: 'DEBUFF', type: 'Debuff',
                    sourceUnitId: source.id, duration: 100, durationType: 'TURN_END_BASED', skipFirstTurnDecrement: true,
                    modifiers: [{ target: 'all_type_vuln', value: 0.20, type: 'add', source: 'E6 Vuln' }],
                    apply: (t, s) => s, remove: (t, s) => s
                });
            }
        });
    }

    // 2. 龍霊の召喚・リンク更新
    newState = ensureDragonSpirit(newState, source, target.id);

    // 3. 味方全体バリア (E3でスキルLv12)
    const skillLevel = calculateAbilityLevel(source.eidolonLevel || 0, 3, 'Skill');
    const skillBarrier = getLeveledValue(ABILITY_VALUES.skillBarrier, skillLevel);
    const skillCap = (skillBarrier.pct * source.stats.atk + skillBarrier.flat) * 3.0;
    const allies = newState.registry.toArray().filter(u => !u.isEnemy && !u.isSummon);

    for (const ally of allies) {
        newState = applyDanHengShield(newState, source, ally.id, skillBarrier.pct, skillBarrier.flat, skillCap);
    }

    return newState;
};

// 2. 必殺技処理
const onUltimateUsed: IEventHandlerLogic = (event, state, _handlerId) => {
    const source = state.registry.get(createUnitId(event.sourceId));
    if (!source) return state;

    let newState = state;

    // 1. ダメージ (全体) (E5で必殺技Lv12)
    const enemies = newState.registry.getAliveEnemies();
    const ultLevel = calculateAbilityLevel(source.eidolonLevel || 0, 5, 'Ultimate');
    const ultDmgMult = getLeveledValue(ABILITY_VALUES.ultDamage, ultLevel);

    enemies.forEach((enemy, index) => {
        // 1. ダメージ計算
        const tempAbility: any = {
            damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: ultDmgMult, toughnessReduction: 20 }] }
        };
        const tempAction: any = { type: 'ULTIMATE' };

        const { damage, isCrit, breakdownMultipliers } = calculateDamageWithCritInfo(
            source,
            enemy,
            tempAbility,
            tempAction,
            {
                ultDmg: 0
            }
        );

        // 2. 靭性削り
        const breakEfficiency = (source.stats as any).break_efficiency || 0;
        const toughnessReduction = 20 * (1 + breakEfficiency);

        const currentEnemy = newState.registry.get(createUnitId(enemy.id));
        if (currentEnemy && currentEnemy.toughness > 0) {
            const newToughness = Math.max(0, currentEnemy.toughness - toughnessReduction);
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(enemy.id), u => ({ ...u, toughness: newToughness }))
            };
        }

        // 3. ダメージ適用
        const damageResult = applyUnifiedDamage(newState, source, enemy, damage, {
            damageType: '悔いなき亢龍、天地を拓く',
            skipLog: true,
            isCrit: isCrit,
            breakdownMultipliers: breakdownMultipliers
        });
        newState = damageResult.state;

        // 4. ログ記録 (プライマリダメージ)
        if (newState.currentActionLog) {
            newState.currentActionLog.primaryDamage.hitDetails.push({
                hitIndex: index,
                multiplier: ultDmgMult,
                damage: damage,
                isCrit: isCrit,
                targetName: enemy.name,
                breakdownMultipliers: breakdownMultipliers
            });
            newState.currentActionLog.primaryDamage.totalDamage += damage;
        }
    });

    // 2. 味方全体バリア (必殺技のバリアもスキルと同じ値) (E3でスキルLv12)
    const skillLevel = calculateAbilityLevel(source.eidolonLevel || 0, 3, 'Skill');
    const skillBarrier = getLeveledValue(ABILITY_VALUES.skillBarrier, skillLevel);
    const skillBase = skillBarrier.pct * source.stats.atk + skillBarrier.flat;
    const skillCap = skillBase * 3.0;
    const allies = newState.registry.toArray().filter(u => !u.isEnemy && !u.isSummon);

    for (const ally of allies) {
        newState = applyDanHengShield(newState, source, ally.id, skillBarrier.pct, skillBarrier.flat, skillCap);

        // バリアログ追加
        if (newState.currentActionLog) {
            newState.currentActionLog.shields.push({
                source: source.name,
                name: '悔いなき亢龍、天地を拓く (バリア)',
                amount: skillBase,
                target: ally.name,
                breakdownMultipliers: {
                    baseShield: skillBase,
                    scalingStat: 'ATK',
                    multiplier: skillBarrier.pct,
                    flat: skillBarrier.flat,
                    cap: skillCap
                }
            });
        }
    }

    // 3. 龍霊強化
    const summon = getActiveSummon(newState, source.id, SUMMON_ID_PREFIX);
    if (summon) {
        const e2 = (source.eidolonLevel || 0) >= 2;
        const count = e2 ? 4 : 2; // E2: 持続時間2倍 (4回行動)

        newState = addEffect(newState, summon.id, {
            id: EFFECT_IDS.ENHANCED_DRAGON(summon.id),
            name: 'Enhanced Dragon Spirit',
            category: 'BUFF',
            type: 'Buff',
            sourceUnitId: source.id,
            duration: count,
            durationType: 'TURN_END_BASED',
            skipFirstTurnDecrement: true,
            modifiers: [],
            apply: (t, s) => s,
            remove: (t, s) => s,
        });

        // E2: 味方全体行動順100%短縮 (即時行動)
        if (e2) {
            const summonUnit = newState.registry.get(createUnitId(summon.id));
            if (summonUnit) {
                // 行動順を0にする（即時行動）
                newState = {
                    ...newState,
                    registry: newState.registry.update(createUnitId(summonUnit.id), u => ({ ...u, actionPoint: 0 }))
                };
            }
        }

        // E6: 同袍が敵全体に追加ダメージ
        if ((source.eidolonLevel || 0) >= 6 && summon.linkedUnitId) {
            const comrade = newState.registry.get(createUnitId(summon.linkedUnitId));
            if (comrade) {
                enemies.forEach(enemy => {
                    newState = applyUnifiedDamage(newState, summon, enemy, comrade.stats.atk * 3.30, {
                        damageType: 'ULTIMATE',
                        details: 'E6 Comrade Damage',
                        events: [{ type: 'ON_ULTIMATE_USED', payload: { element: comrade.element } }]
                    }).state;
                });
            }
        }
    }

    // E1: SP1回復, 全属性耐性貫通18%
    if ((source.eidolonLevel || 0) >= 1) {
        newState = addSkillPoints(newState, 1);
        const comradeUnit = newState.registry.toArray().find(u => u.effects.some(e => e.id === EFFECT_IDS.COMRADE(u.id) && e.sourceUnitId === source.id));
        if (comradeUnit) {
            newState = addEffect(newState, comradeUnit.id, {
                id: EFFECT_IDS.E1_RES_PEN(comradeUnit.id), name: 'E1 Res Pen', category: 'BUFF', type: 'Buff',
                sourceUnitId: source.id, duration: 3, durationType: 'TURN_END_BASED', skipFirstTurnDecrement: true,
                modifiers: [{ target: 'all_type_res_pen', value: 0.18, type: 'add', source: 'E1' }],
                apply: (t, s) => s, remove: (t, s) => s
            });
        }
    }

    return newState;
};

// 3. 龍霊の行動処理
const onDragonSpiritSkill: IEventHandlerLogic = (event, state, handlerId) => {
    const source = state.registry.get(createUnitId(event.sourceId));
    if (!source || !source.isSummon || source.ownerId !== handlerId) return state;

    let newState = state;
    const owner = state.registry.get(createUnitId(handlerId));
    if (!owner) return newState;



    const allies = newState.registry.toArray().filter(u => !u.isEnemy && !u.isSummon);

    // 1. デバフ解除 (Asc4で+1)
    const cleanseCount = (owner.traces?.some(t => t.id === TRACE_IDS.ASC_4) ? 2 : 1);
    for (const ally of allies) {
        newState = cleanse(newState, ally.id, cleanseCount);
    }

    // 2. 天賦バリア付与 + E2での倍化 (E5で天賦Lv12)
    const talentLevel = calculateAbilityLevel(owner.eidolonLevel || 0, 5, 'Talent');
    const talentBarrierVals = getLeveledValue(ABILITY_VALUES.talentBarrier, talentLevel);
    let talentMultiplier = talentBarrierVals.pct;
    let talentFlat = talentBarrierVals.flat;

    const enhancedBuff = source.effects.find(e => e.id === EFFECT_IDS.ENHANCED_DRAGON(source.id));

    const e2 = (owner.eidolonLevel || 0) >= 2;
    if (enhancedBuff && e2) {
        talentMultiplier *= 2.0;
        talentFlat *= 2.0;
    }

    // Cap Calculation (Always 300% of SKILL Base) (E3でスキルLv12)
    const skillLevel = calculateAbilityLevel(owner.eidolonLevel || 0, 3, 'Skill');
    const skillBarrier = getLeveledValue(ABILITY_VALUES.skillBarrier, skillLevel);
    const skillBase = skillBarrier.pct * owner.stats.atk + skillBarrier.flat;
    const skillCap = skillBase * 3.0;

    // バリア計算（ログ用）
    const baseBarrierAmount = owner.stats.atk * talentMultiplier + talentFlat;

    for (const ally of allies) {
        newState = applyDanHengShield(newState, source, ally.id, talentMultiplier, talentFlat, skillCap);

        // ログ詳細追加
        if (newState.currentActionLog) {
            newState.currentActionLog.shields.push({
                source: source.name,
                name: '龍霊の行動 (天賦バリア)',
                amount: baseBarrierAmount,
                target: ally.name,
                breakdownMultipliers: {
                    baseShield: baseBarrierAmount,
                    scalingStat: 'ATK',
                    multiplier: talentMultiplier,
                    flat: talentFlat,
                    cap: skillCap
                }
            });
        }
    }

    // 軌跡「屹立」: HP最低の味方に追加バリア
    if (owner.traces?.some(t => t.id === TRACE_IDS.YI_LI)) {
        let lowestUnit = allies[0];
        let minHpPct = 1.0;
        allies.forEach(a => {
            const pct = a.hp / a.stats.hp;
            if (pct < minHpPct) { minHpPct = pct; lowestUnit = a; }
        });
        if (lowestUnit) {
            const yiliAmount = owner.stats.atk * YILI_BARRIER_PCT + YILI_BARRIER_FLAT;
            newState = applyDanHengShield(newState, source, lowestUnit.id, YILI_BARRIER_PCT, YILI_BARRIER_FLAT, skillCap);

            // ログ詳細追加
            if (newState.currentActionLog) {
                newState.currentActionLog.shields.push({
                    source: source.name,
                    name: '屹立 (追加バリア)',
                    amount: yiliAmount,
                    target: lowestUnit.name,
                    breakdownMultipliers: {
                        baseShield: yiliAmount,
                        scalingStat: 'ATK',
                        multiplier: YILI_BARRIER_PCT,
                        flat: YILI_BARRIER_FLAT,
                        cap: skillCap
                    }
                });
            }
        }
    }

    // 3. 強化時追加攻撃
    if (enhancedBuff) {
        const comradeId = source.linkedUnitId;
        const comrade = comradeId ? newState.registry.get(createUnitId(comradeId)) : undefined;

        if (comrade) {
            const enemies = newState.registry.getAliveEnemies();

            // 倍率 (E5で必殺技Lv12 → 強化攻撃もLv12)
            const ultLevel = calculateAbilityLevel(owner.eidolonLevel || 0, 5, 'Ultimate');
            const enhancedMults = getLeveledValue(ABILITY_VALUES.enhancedAttack, ultLevel);
            const dhMult = enhancedMults.dh;
            // E2: 同袍分が2倍になる
            const cmMult = e2 ? enhancedMults.comrade * 2 : enhancedMults.comrade;

            for (const enemy of enemies) {
                // Hit 1: 丹恒攻撃力参照
                newState = applyUnifiedDamage(newState, source, enemy, owner.stats.atk * dhMult, {
                    damageType: 'FOLLOW_UP_ATTACK',
                    events: [{ type: 'ON_FOLLOW_UP_ATTACK' }],
                    skipLog: true,
                    additionalDamageEntry: {
                        source: source.name,
                        name: '龍霊の行動 (丹恒)',
                        damageType: 'normal'
                    }
                }).state;
                // Hit 2: 同袍攻撃力参照
                newState = applyUnifiedDamage(newState, source, enemy, comrade.stats.atk * cmMult, {
                    damageType: 'FOLLOW_UP_ATTACK',
                    events: [{ type: 'ON_FOLLOW_UP_ATTACK', payload: { element: comrade.element } }],
                    skipLog: true,
                    additionalDamageEntry: {
                        source: source.name,
                        name: '龍霊の行動 (同袍)',
                        damageType: 'normal'
                    }
                }).state;
            }

            // 軌跡「屹立」: HP最大の敵に同袍攻撃力40%分の追加ダメージ
            if (owner.traces?.some(t => t.id === TRACE_IDS.YI_LI)) {
                let highestEnemy = enemies[0];
                let maxHp = -1;
                enemies.forEach(e => { if (e.hp > maxHp) { maxHp = e.hp; highestEnemy = e; } });

                if (highestEnemy) {
                    newState = applyUnifiedDamage(newState, source, highestEnemy, comrade.stats.atk * YILI_DMG_MULT, {
                        damageType: 'FOLLOW_UP_ATTACK',
                        details: 'Yi Li Extra Dmg',
                        events: [{ type: 'ON_FOLLOW_UP_ATTACK', payload: { element: comrade.element } }],
                        skipLog: true,
                        additionalDamageEntry: {
                            source: source.name,
                            name: '屹立 (追加ダメージ)',
                            damageType: 'additional'
                        }
                    }).state;
                }
            }
        }
    }

    return newState;
};

// 4. 軌跡「百花」 (パッシブ/トリガー) + 秘技
const onBattleStart: IEventHandlerLogic = (event, state, handlerId) => {
    // Note: ON_BATTLE_START has sourceId='system', so do not check event.sourceId === handlerId
    let newState = state;

    const source = newState.registry.get(createUnitId(handlerId));
    if (!source) return newState;

    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = source.config?.useTechnique !== false;

    if (useTechnique) {
        // 1. Technique: Evil-Breaking (Recover 30 EP)
        newState = addEnergyToUnit(newState, handlerId, 0, 30, false, {  // flatEp=30, baseEp=0
            sourceId: handlerId,
            publishEventFn: publishEvent
        });
        // Log it
        newState.log.push({
            actionType: '秘技',
            sourceId: handlerId,
            characterName: source.name,
            targetId: handlerId,
            details: '「破邪の矛」: EP30回復'
        });

        // 3. 秘技: スキル対象に自動で戦闘スキル発動（SP消費なし）
        if (source.config?.skillTargetId) {
            const skillTarget = newState.registry.get(createUnitId(source.config!.skillTargetId));
            if (skillTarget && !skillTarget.isEnemy) {
                // 同袍付与（onSkillUsedのロジックを再利用）
                const skillEvent: ActionEvent = { type: 'ON_SKILL_USED', sourceId: handlerId, targetId: skillTarget.id };
                newState = onSkillUsed(skillEvent, newState, handlerId);
                newState.log.push({
                    actionType: '秘技',
                    sourceId: handlerId,
                    characterName: source.name,
                    targetId: skillTarget.id,
                    details: '「地割れ」: 戦闘スキル自動発動 (SP消費なし)'
                });
            }
        }
    }

    // 2. Trace: 百花 (Action Advance 40%) - これは秘技ではなくパッシブなので常に発動
    if (source.traces?.some(t => t.id === TRACE_IDS.BAI_HUA)) {
        const itemIdx = newState.actionQueue.findIndex(i => i.unitId === handlerId);
        if (itemIdx !== -1) {
            newState = advanceAction(newState, handlerId, 0.40);
        }
    }

    return newState;
};

const onDamageDealt: IEventHandlerLogic = (event, state, handlerId) => {
    // event is a IEvent, need to cast or check if it's DamageDealtEvent. 
    // However, DamageDealtEvent structure: sourceId, targetId, damage, etc.
    const dmgEvent = event as DamageDealtEvent;

    const dh = state.registry.get(createUnitId(handlerId));
    if (!dh || !dh.traces?.some(t => t.id === TRACE_IDS.BAI_HUA)) return state;

    const comradeEffect = state.registry.toArray()
        .flatMap(u => u.effects)
        .find(e => e.id.startsWith('comrade-') && e.sourceUnitId === handlerId);

    const comradeUnit = state.registry.toArray().find(u => u.effects.some(e => e === comradeEffect));

    if (comradeUnit && dmgEvent.sourceId === comradeUnit.id) {
        // EP回復
        let newState = addEnergyToUnit(state, handlerId, 6, 0, false, {
            sourceId: handlerId,
            publishEventFn: publishEvent
        });

        // 龍霊 AA 15%
        const summon = getActiveSummon(newState, handlerId, SUMMON_ID_PREFIX);
        if (summon) {
            const idx = newState.actionQueue.findIndex(i => i.unitId === summon.id);
            if (idx !== -1) {
                newState = advanceAction(newState, summon.id, 0.15);
            }
        }
        return newState;
    }
    return state;
};


export const DanHengToukou: Character = {
    id: CHARACTER_ID,
    name: '丹恒・騰荒',
    path: 'Preservation',
    element: 'Physical',
    rarity: 5,
    maxEnergy: 135,
    baseStats: BASE_STATS,
    traces: [
        { id: 'stat-atk-1', name: '攻撃強化', type: 'Stat Bonus', stat: 'atk_pct', value: 0.28, description: '' },
        { id: 'stat-def-1', name: '防御強化', type: 'Stat Bonus', stat: 'def_pct', value: 0.225, description: '' },
        { id: 'stat-spd-1', name: '速度強化', type: 'Stat Bonus', stat: 'spd', value: 5, description: '' },
        { id: TRACE_IDS.WEI_GUAN, name: '偉観', type: 'Bonus Ability', description: '同袍 攻撃力+15%' },
        { id: TRACE_IDS.BAI_HUA, name: '百花', type: 'Bonus Ability', description: '開幕AA 40%, 同袍攻撃時EP/龍霊AA' },
        { id: TRACE_IDS.YI_LI, name: '屹立', type: 'Bonus Ability', description: '龍霊 追加バリア/追加ダメージ' },
        { id: TRACE_IDS.ASC_4, name: 'Asc4', type: 'Bonus Ability', description: '龍霊 デバフ解除数+1' }
    ],
    abilities: {
        basic: {
            id: 'basic', name: '悪を鎮め、生を護る', type: 'Basic ATK', description: '指定した敵単体に丹恒・騰荒の攻撃力100%分の物理属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.30, toughnessReduction: 3 },
                    { multiplier: 0.70, toughnessReduction: 7 }
                ]
            },
            spCost: 0, energyGain: 20
        },
        skill: {
            id: 'skill', name: 'Skill', type: 'Skill',
            description: '指定した味方キャラ単体を「同袍」にし、味方全体に丹恒・騰荒の攻撃力20%+400の耐久値を持つバリアを付与する、3ターン継続。\n丹恒・騰荒のバリアを重複して獲得する時、バリア耐久値は累積される。このバリアの耐久値は、戦闘スキルが付与できるバリアの300%を超えない。\n「同袍」は丹恒・騰荒が最後に戦闘スキルを使用した対象にのみ有効。',
            targetType: 'ally',
            manualTargeting: true,
            spCost: 1, energyGain: 30,
        },
        ultimate: {
            id: 'ult', name: '悔いなき亢龍、天地を拓く', type: 'Ultimate', description: '全体攻撃 + バリア + 龍霊強化',
            targetType: 'all_enemies',
            energyGain: 5,
        },
        talent: { id: 'talent', name: 'Talent', type: 'Talent', description: '龍霊召喚' },
        technique: { id: 'tech', name: 'Technique', type: 'Technique', description: '戦闘開始時にスキル自動発動' }
    },
    defaultConfig: {
        lightConeId: 'we-are-wildfire',
        rotation: ['s', 'b', 'b'], rotationMode: 'sequence', ultStrategy: 'immediate', ultCooldown: 3,
        relicSetId: 'hermit_who_hid_the_light_of_the_stars',
        ornamentSetId: 'lusaka_by_the_sunken_sea',
        mainStats: {
            body: 'atk_pct',
            feet: 'spd',
            sphere: 'atk_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'atk_pct', value: 0.432 },
            { stat: 'spd', value: 12 },
            { stat: 'def_pct', value: 0.324 },
        ],
    }
};

export const danHengToukouHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, _eidolonLevel = 0) => {
    return {
        handlerMetadata: {
            id: `dan-heng-permansor-terrae-handler-${sourceUnitId}`,
            subscribesTo: ['ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_BATTLE_START', 'ON_DAMAGE_DEALT']
        },
        handlerLogic: (event, state, handlerId) => {
            if (event.type === 'ON_SKILL_USED') {
                if (event.sourceId === sourceUnitId) return onSkillUsed(event as ActionEvent, state, handlerId);

                const source = state.registry.get(createUnitId(event.sourceId));
                // Debug logging for summon skill detection
                if (source?.isSummon) {

                }

                if (source && source.isSummon && source.ownerId === sourceUnitId) return onDragonSpiritSkill(event as ActionEvent, state, sourceUnitId);
            } else if (event.type === 'ON_ULTIMATE_USED') {
                if (event.sourceId === sourceUnitId) return onUltimateUsed(event as ActionEvent, state, handlerId);
            } else if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event as GeneralEvent, state, sourceUnitId);
            } else if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event as DamageDealtEvent, state, handlerId);
            }
            return state;
        }
    };
};
