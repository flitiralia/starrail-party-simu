import { Character, CharacterBaseStats } from '../../types/index';
import { IEventHandlerLogic, GameState, Unit } from '../../simulator/engine/types';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { FinalStats, Modifier } from '../../types/stats';
import { cleanse, advanceAction, applyShield } from '../../simulator/engine/utils';
// Generic Managers
import { createSummon, getActiveSummon } from '../../simulator/engine/summonManager';
import { addSkillPoints } from '../../simulator/effect/relicEffectHelpers';
import { addEnergyToUnit } from '../../simulator/engine/energy';
// 星魂対応ユーティリティ
import { getLeveledValue, BarrierValues, EnhancedAttackValues } from '../../simulator/utils/abilityLevel';

const CHARACTER_ID = 'dan-heng-permansor-terrae';
const SUMMON_ID_PREFIX = 'dragon-spirit';

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

// --- ロジック実装 ---

// 1. 戦闘スキル処理
const onSkillUsed: IEventHandlerLogic = (event, state, handlerId) => {
    const source = state.units.find(u => u.id === event.sourceId);
    const target = state.units.find(u => u.id === event.targetId) || source;
    if (!source || !target) return state;

    let newState = state;

    // 1. 「同袍」付与
    // 自身が付与した古い同袍を解除
    newState.units.forEach(u => {
        const old = u.effects.find(e => e.id === `comrade-${u.id}` && e.sourceUnitId === source.id);
        if (old) newState = removeEffect(newState, u.id, old.id);
    });

    const comradeModifiers: Modifier[] = [];
    // 軌跡「偉観」: 同袍に丹恒・騰荒のATKの15%を加算（動的参照）
    if (source.traces?.some(t => t.name === '偉観')) {
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
        id: `comrade-${target.id}`,
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
        const enemies = newState.units.filter(u => u.isEnemy);
        enemies.forEach(e => {
            // まだ付与されていなければ付与
            if (!e.effects.some(ef => ef.name === 'E6 Vuln')) {
                newState = addEffect(newState, e.id, {
                    id: `e6-vuln-${e.id}`, name: 'E6 Vuln', category: 'DEBUFF', type: 'Debuff',
                    sourceUnitId: source.id, duration: 100, durationType: 'TURN_END_BASED', skipFirstTurnDecrement: true,
                    modifiers: [{ target: 'all_type_vuln', value: 0.20, type: 'add', source: 'E6 Vuln' }],
                    apply: (t, s) => s, remove: (t, s) => s
                });
            }
        });
    }

    // 2. 龍霊の召喚・リンク更新
    let summon = getActiveSummon(newState, source.id, SUMMON_ID_PREFIX);
    if (!summon) {
        summon = createSummon(source, {
            idPrefix: SUMMON_ID_PREFIX,
            name: '龍霊',
            baseStats: { hp: 1, atk: 1, def: 1, spd: DRAGON_SPIRIT_BASE_SPD, crit_rate: 0, crit_dmg: 0 } as any as FinalStats,
            baseSpd: DRAGON_SPIRIT_BASE_SPD,
            element: 'Physical',
            abilities: {
                basic: { id: 'ds-basic', name: 'Wait', type: 'Basic ATK', description: 'Wait' },
                skill: { id: 'ds-action', name: 'Dragon Spirit Action', type: 'Talent', description: 'Dragon Spirit Action' },
                ultimate: { id: 'ds-ult', name: 'None', type: 'Ultimate', description: 'None' },
                talent: { id: 'ds-talent', name: 'None', type: 'Talent', description: 'None' },
                technique: { id: 'ds-tech', name: 'None', type: 'Technique', description: 'None' },
            }
        });
        // リンクID設定
        summon.linkedUnitId = target.id;
        newState = { ...newState, units: [...newState.units, summon] };
    } else {
        const s = summon!;
        s.linkedUnitId = target.id;
        newState = { ...newState, units: newState.units.map(u => u.id === s.id ? s : u) };
    }

    // 3. 味方全体バリア (E3でスキルLv12)
    const skillLevel = (source.eidolonLevel || 0) >= 3 ? 12 : 10;
    const skillBarrier = getLeveledValue(ABILITY_VALUES.skillBarrier, skillLevel);
    const barrierVal = skillBarrier.pct * source.stats.atk + skillBarrier.flat;
    const allies = newState.units.filter(u => !u.isEnemy && !u.isSummon);
    const skillCap = barrierVal * 3.0; // Skill Base * 3.0

    for (const ally of allies) {
        newState = applyShield(
            newState,
            source.id,
            ally.id,
            barrierVal,
            3,
            'TURN_END_BASED',
            'Dan Heng Shield',
            undefined,
            true, // skipLog: 統合ログに追記されるため
            { stackable: true, cap: skillCap }
        );
    }

    return newState;
};

// 2. 必殺技処理
const onUltimateUsed: IEventHandlerLogic = (event, state, handlerId) => {
    const source = state.units.find(u => u.id === event.sourceId);
    if (!source) return state;

    let newState = state;

    // 1. ダメージ (全体) (E5で必殺技Lv12)
    const enemies = newState.units.filter(u => u.isEnemy);
    const ultLevel = (source.eidolonLevel || 0) >= 5 ? 12 : 10;
    const ultDmgMult = getLeveledValue(ABILITY_VALUES.ultDamage, ultLevel);
    enemies.forEach(enemy => {
        newState = applyUnifiedDamage(newState, source, enemy, source.stats.atk * ultDmgMult, {
            damageType: '必殺技',
            // events: [{ type: 'ON_ULTIMATE_USED' }] // 再帰防止のため削除
        }).state;
    });

    // 2. 味方全体バリア (必殺技のバリアもスキルと同じ値) (E3でスキルLv12)
    const skillLevel = (source.eidolonLevel || 0) >= 3 ? 12 : 10;
    const skillBarrier = getLeveledValue(ABILITY_VALUES.skillBarrier, skillLevel);
    const barrierVal = skillBarrier.pct * source.stats.atk + skillBarrier.flat;
    const allies = newState.units.filter(u => !u.isEnemy && !u.isSummon);

    // Cap is based on SKILL Base Value (Not Ult Base Value, usually)
    // "Caps at 300% of Skill's max barrier value" -> Consistent Cap Logic needed.
    // Calculate Skill Base for Cap
    const skillBase = skillBarrier.pct * source.stats.atk + skillBarrier.flat;
    const skillCap = skillBase * 3.0;

    for (const ally of allies) {
        newState = applyShield(
            newState,
            source.id,
            ally.id,
            barrierVal,
            3,
            'TURN_END_BASED',
            'Dan Heng Shield',
            undefined,
            true,
            { stackable: true, cap: skillCap }
        );
    }

    // 3. 龍霊強化
    const summon = getActiveSummon(newState, source.id, SUMMON_ID_PREFIX);
    if (summon) {
        const e2 = (source.eidolonLevel || 0) >= 2;
        const count = e2 ? 4 : 2; // E2: 持続時間2倍 (4回行動)

        newState = addEffect(newState, summon.id, {
            id: `enhanced-dragon-${summon.id}`,
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
            const idx = newState.units.findIndex(u => u.id === summon.id);
            if (idx !== -1) {
                const u = newState.units[idx];
                newState = { ...newState, units: newState.units.map((unit, i) => i === idx ? { ...unit, actionPoint: 0 } : unit) };
            }
        }

        // E6: 同袍が敵全体に追加ダメージ
        if ((source.eidolonLevel || 0) >= 6 && summon.linkedUnitId) {
            const comrade = newState.units.find(u => u.id === summon.linkedUnitId);
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
        const comradeUnit = newState.units.find(u => u.effects.some(e => e.id === `comrade-${u.id}` && e.sourceUnitId === source.id));
        if (comradeUnit) {
            newState = addEffect(newState, comradeUnit.id, {
                id: `e1-res-pen-${comradeUnit.id}`, name: 'E1 Res Pen', category: 'BUFF', type: 'Buff',
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
    const source = state.units.find(u => u.id === event.sourceId);
    if (!source || !source.isSummon || source.ownerId !== handlerId) return state;

    let newState = state;
    const owner = state.units.find(u => u.id === handlerId);
    if (!owner) return newState;

    const allies = newState.units.filter(u => !u.isEnemy && !u.isSummon);

    // 1. デバフ解除 (Asc4で+1)
    const cleanseCount = (owner.traces?.some(t => t.name === 'Asc4') ? 2 : 1);
    for (const ally of allies) {
        newState = cleanse(newState, ally.id, cleanseCount);
    }

    // 2. 天賦バリア付与 + E2での倍化 (E5で天賦Lv12)
    const talentLevel = (owner.eidolonLevel || 0) >= 5 ? 12 : 10;
    const talentBarrierVals = getLeveledValue(ABILITY_VALUES.talentBarrier, talentLevel);
    let talentBarrier = talentBarrierVals.pct * owner.stats.atk + talentBarrierVals.flat;
    const enhancedBuff = source.effects.find(e => e.id === `enhanced-dragon-${source.id}`);
    const e2 = (owner.eidolonLevel || 0) >= 2;
    if (enhancedBuff && e2) {
        talentBarrier *= 2.0;
    }

    // Cap Calculation (Always 300% of SKILL Base) (E3でスキルLv12)
    const skillLevel = (owner.eidolonLevel || 0) >= 3 ? 12 : 10;
    const skillBarrier = getLeveledValue(ABILITY_VALUES.skillBarrier, skillLevel);
    const skillBase = skillBarrier.pct * owner.stats.atk + skillBarrier.flat;
    const skillCap = skillBase * 3.0;

    for (const ally of allies) {
        newState = applyShield(
            newState,
            source.id,
            ally.id,
            talentBarrier,
            3,
            'TURN_END_BASED',
            'Dan Heng Shield',
            undefined,
            true,
            { stackable: true, cap: skillCap }
        );
    }

    // 軌跡「屹立」: HP最低の味方に追加バリア
    if (owner.traces?.some(t => t.name === '屹立')) {
        let lowestUnit = allies[0];
        let minHpPct = 1.0;
        allies.forEach(a => {
            const pct = a.hp / a.stats.hp;
            if (pct < minHpPct) { minHpPct = pct; lowestUnit = a; }
        });
        if (lowestUnit) {
            const yiLiBarrier = YILI_BARRIER_PCT * owner.stats.atk + YILI_BARRIER_FLAT;
            newState = applyShield(
                newState,
                source.id,
                lowestUnit.id,
                yiLiBarrier,
                3,
                'TURN_END_BASED',
                'Dan Heng Shield',
                undefined,
                true,
                { stackable: true, cap: skillCap }
            );
        }
    }

    // 3. 強化時追加攻撃
    if (enhancedBuff) {
        const comradeId = source.linkedUnitId;
        const comrade = newState.units.find(u => u.id === comradeId);

        if (comrade) {
            const enemies = newState.units.filter(u => u.isEnemy);

            // 倍率 (E5で必殺技Lv12 → 強化攻撃もLv12)
            const ultLevel = (owner.eidolonLevel || 0) >= 5 ? 12 : 10;
            const enhancedMults = getLeveledValue(ABILITY_VALUES.enhancedAttack, ultLevel);
            const dhMult = enhancedMults.dh;
            // E2: 同袍分が2倍になる
            const cmMult = e2 ? enhancedMults.comrade * 2 : enhancedMults.comrade;

            for (const enemy of enemies) {
                // Hit 1: 丹恒攻撃力参照
                newState = applyUnifiedDamage(newState, source, enemy, owner.stats.atk * dhMult, {
                    damageType: 'FOLLOW_UP_ATTACK', events: [{ type: 'ON_FOLLOW_UP_ATTACK' }]
                }).state;
                // Hit 2: 同袍攻撃力参照
                newState = applyUnifiedDamage(newState, source, enemy, comrade.stats.atk * cmMult, {
                    damageType: 'FOLLOW_UP_ATTACK', events: [{ type: 'ON_FOLLOW_UP_ATTACK', payload: { element: comrade.element } }]
                }).state;
            }

            // 軌跡「屹立」: HP最大の敵に同袍攻撃力40%分の追加ダメージ
            if (owner.traces?.some(t => t.name === '屹立')) {
                let highestEnemy = enemies[0];
                let maxHp = -1;
                enemies.forEach(e => { if (e.hp > maxHp) { maxHp = e.hp; highestEnemy = e; } });

                if (highestEnemy) {
                    newState = applyUnifiedDamage(newState, source, highestEnemy, comrade.stats.atk * YILI_DMG_MULT, {
                        damageType: 'FOLLOW_UP_ATTACK', details: 'Yi Li Extra Dmg',
                        events: [{ type: 'ON_FOLLOW_UP_ATTACK', payload: { element: comrade.element } }]
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

    const source = newState.units.find(u => u.id === handlerId);
    if (!source) return newState;

    // 秘技使用フラグを確認 (デフォルト true)
    const useTechnique = source.config?.useTechnique !== false;

    if (useTechnique) {
        // 1. Technique: Evil-Breaking (Recover 30 EP)
        newState = addEnergyToUnit(newState, handlerId, 0, 30);  // flatEp=30, baseEp=0
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
            const skillTarget = newState.units.find(u => u.id === source.config!.skillTargetId);
            if (skillTarget && !skillTarget.isEnemy) {
                // 同裍付与（onSkillUsedのロジックを再利用）
                const skillEvent = { type: 'ON_SKILL_USED' as const, sourceId: handlerId, targetId: skillTarget.id };
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
    if (source.traces?.some(t => t.name === '百花')) {
        const itemIdx = newState.actionQueue.findIndex(i => i.unitId === handlerId);
        if (itemIdx !== -1) {
            newState = advanceAction(newState, handlerId, 0.40);
        }
    }

    return newState;
};

const onDamageDealt: IEventHandlerLogic = (event, state, handlerId) => {
    const dh = state.units.find(u => u.id === handlerId);
    if (!dh || !dh.traces?.some(t => t.name === '百花')) return state;

    const comradeEffect = state.units
        .flatMap(u => u.effects)
        .find(e => e.id.startsWith('comrade-') && e.sourceUnitId === handlerId);

    const comradeUnit = state.units.find(u => u.effects.some(e => e === comradeEffect));

    if (comradeUnit && event.sourceId === comradeUnit.id) {
        // EP回復
        let newState = addEnergyToUnit(state, handlerId, 6);

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
        { id: 'wei-guan', name: '偉観', type: 'Bonus Ability', description: '同袍 攻撃力+15%' },
        { id: 'bai-hua', name: '百花', type: 'Bonus Ability', description: '開幕AA 40%, 同袍攻撃時EP/龍霊AA' },
        { id: 'yi-li', name: '屹立', type: 'Bonus Ability', description: '龍霊 追加バリア/追加ダメージ' },
        { id: 'asc-4', name: 'Asc4', type: 'Bonus Ability', description: '龍霊 デバフ解除数+1' }
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
            id: 'ult', name: 'Ultimate', type: 'Ultimate', description: '全体攻撃 + バリア + 龍霊強化',
            targetType: 'all_enemies',
            damage: { type: 'aoe', scaling: 'atk', hits: [{ multiplier: ABILITY_VALUES.ultDamage[10], toughnessReduction: 20 }] },
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

export const danHengToukouHandlerFactory: import('../../simulator/engine/types').IEventHandlerFactory = (sourceUnitId, level, eidolonLevel = 0) => {
    return {
        handlerMetadata: {
            id: `dan-heng-permansor-terrae-handler-${sourceUnitId}`,
            subscribesTo: ['ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_BATTLE_START', 'ON_DAMAGE_DEALT']
        },
        handlerLogic: (event, state, handlerId) => {
            if (event.type === 'ON_SKILL_USED') {
                if (event.sourceId === sourceUnitId) return onSkillUsed(event, state, handlerId);
                const source = state.units.find(u => u.id === event.sourceId);
                if (source && source.isSummon && source.ownerId === sourceUnitId) return onDragonSpiritSkill(event, state, sourceUnitId);
            } else if (event.type === 'ON_ULTIMATE_USED') {
                if (event.sourceId === sourceUnitId) return onUltimateUsed(event, state, handlerId);
            } else if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, state, sourceUnitId);
            } else if (event.type === 'ON_DAMAGE_DEALT') {
                return onDamageDealt(event, state, handlerId);
            }
            return state;
        }
    };
};
