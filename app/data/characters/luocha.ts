import { Character, Element, Path, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { calculateHeal } from '../../simulator/damage';
import { applyHealing, cleanse, applyShield, dispelBuffs } from '../../simulator/engine/utils';
// 星魂対応ユーティリティ
import { getLeveledValue } from '../../simulator/utils/abilityLevel';

// --- 定数定義 ---
const CHARACTER_ID = 'luocha';
const ABYSS_FLOWER_STACK_ID = 'luocha-abyss-flower-stack';
const FIELD_BUFF_ID = 'luocha-field-buff';
const AUTO_SKILL_COOLDOWN_ID = 'luocha-auto-skill-cooldown';

// --- E3/E5パターン ---
// E3: スキルLv+2, 通常Lv+1 → スキル回復がLv12
// E5: 必殺技Lv+2, 天賦Lv+2 → 天賦回復がLv12


// --- アビリティ値 (レベル別) ---
interface HealValues { mult: number; flat: number; }

const ABILITY_VALUES = {
    // スキル回復: E3でLv12に上昇
    skillHeal: {
        10: { mult: 0.60, flat: 800 },
        12: { mult: 0.64, flat: 890 }
    } as Record<number, HealValues>,

    // 天賦(フィールド)回復: E5でLv12に上昇
    talentHeal: {
        10: { mult: 0.18, flat: 240 },
        12: { mult: 0.192, flat: 267 }
    } as Record<number, HealValues>,
};

// 軌跡A4 (固定値)
const A4_MULT = 0.07;
const A4_FLAT = 93;

// 星魂 (固定値)
const E1_ATK_BOOST = 0.20;
const E2_HEAL_BOOST = 0.30;
const E2_SHIELD_MULT = 0.18;
const E2_SHIELD_FLAT = 240;
const E4_DMG_REDUCTION = 0.12;
const E6_RES_DOWN = 0.20;

export const luocha: Character = {
    id: 'luocha',
    name: '羅刹',
    path: 'Abundance',
    element: 'Imaginary',
    rarity: 5,
    maxEnergy: 100,
    baseStats: {
        hp: 1280,
        atk: 756,
        def: 363,
        spd: 101,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'luocha-basic',
            name: '黒淵の棘',
            type: 'Basic ATK',
            description: '指定した敵単体に羅刹の攻撃力100%分の虚数属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [
                    { multiplier: 0.30, toughnessReduction: 3 },
                    { multiplier: 0.30, toughnessReduction: 3 },
                    { multiplier: 0.40, toughnessReduction: 4 }
                ],
            },
            energyGain: 20,
        },
        skill: {
            id: 'luocha-skill',
            name: '白花の祈望',
            type: 'Skill',
            description: '指定した味方単体のHPを回復し、「白花の刻」を1層獲得する。',
            targetType: 'ally',
            energyGain: 30
        },
        ultimate: {
            id: 'luocha-ult',
            name: '帰葬の成就',
            type: 'Ultimate',
            description: '敵全体のバフを1つ解除し、ダメージを与え、「白花の刻」を1層獲得する。',
            targetType: 'all_enemies',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: 2.0, toughnessReduction: 20 }],
            },
            energyGain: 5,
        },
        talent: {
            id: 'luocha-talent',
            name: '生者のサイクル',
            type: 'Talent',
            description: '「白花の刻」が2層になると結界を展開する。',
            targetType: 'self',
            energyGain: 0,
        },
        technique: {
            id: 'luocha-technique',
            name: '愚者の悲憫',
            type: 'Technique',
            description: '戦闘開始時、天賦の結界を即座に発動する。',
            targetType: 'self',
        }
    },
    traces: [
        { id: 'luocha-trace-a2', name: '滴水蘇生', type: 'Bonus Ability', description: '戦闘スキルの効果発動時、指定した味方単体のデバフを1つ解除する。' },
        { id: 'luocha-trace-a4', name: '清めし塵の身', type: 'Bonus Ability', description: '結界内の敵を味方が攻撃した時、攻撃者以外の味方も回復する。' },
        { id: 'luocha-trace-a6', name: '幽谷を越え', type: 'Bonus Ability', description: '行動制限系デバフを抵抗する確率+70%。', stat: 'crowd_control_res', value: 0.70 },
        { id: 'stat-atk', name: '攻撃力', type: 'Stat Bonus', description: '攻撃力+28.0%', stat: 'atk_pct', value: 0.28 },
        { id: 'stat-hp', name: 'HP', type: 'Stat Bonus', description: 'HP+18.0%', stat: 'hp_pct', value: 0.18 },
        { id: 'stat-def', name: '防御力', type: 'Stat Bonus', description: '防御力+12.5%', stat: 'def_pct', value: 0.125 },
    ],
    eidolons: {
        e1: { level: 1, name: '生者による浄化', description: '結界発動中、味方全体の攻撃力+20%。' },
        e2: { level: 2, name: '純庭の礼賜', description: 'スキル発動時、対象のHPが50%未満なら治癒量+30%。50%以上ならバリアを付与。' },
        e3: {
            level: 3, name: '愚者の模索', description: 'スキルLv+2, 通常攻撃Lv+1',
            abilityModifiers: [
                // レベル7: 110% (30:30:40の比率で分散)
                { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 0.33 },
                { abilityName: 'basic', param: 'damage.hits.1.multiplier', value: 0.33 },
                { abilityName: 'basic', param: 'damage.hits.2.multiplier', value: 0.44 },
            ]
        },
        e4: { level: 4, name: '荊の審判', description: '結界発動中、敵を虚弱状態にし、与ダメージ-12%。' },
        e5: {
            level: 5, name: '受難の痕', description: '必殺技Lv+2, 天賦Lv+2',
            abilityModifiers: [
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 2.16 },
            ]
        },
        e6: { level: 6, name: '皆灰燼に帰す', description: '必殺技発動時、敵全体の全属性耐性-20%(2ターン)。' }
    },

    defaultConfig: {
        lightConeId: 'perfect-timing',
        superimposition: 5,
        relicSetId: 'warlord_of_blazing_sun_and_thunderous_roar',
        ornamentSetId: 'broken_keel',
        mainStats: {
            body: 'outgoing_healing_boost',
            feet: 'spd',
            sphere: 'atk_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'atk_pct', value: 0.432 },
            { stat: 'hp_pct', value: 0.324 },
            { stat: 'effect_res', value: 0.216 },
            { stat: 'spd', value: 12 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// --- ヘルパー関数 ---

// スキル効果を適用
function applyLuochaSkill(state: GameState, source: Unit, target: Unit): GameState {
    let newState = state;
    let healBoost = 0;
    if (source.eidolonLevel! >= 2 && (target.hp / target.stats.hp) < 0.5) healBoost = E2_HEAL_BOOST;

    let effectiveSource = source;
    if (healBoost > 0) {
        effectiveSource = { ...source, stats: { ...source.stats, outgoing_healing_boost: (source.stats.outgoing_healing_boost || 0) + healBoost } };
    }

    // E3でスキルLv+2 → Lv12の回復値を使用
    const skillLevel = (source.eidolonLevel || 0) >= 3 ? 12 : 10;
    const skillHeal = getLeveledValue(ABILITY_VALUES.skillHeal, skillLevel);
    const finalHeal = calculateHeal(effectiveSource, target, { scaling: 'atk', multiplier: skillHeal.mult, flat: skillHeal.flat });

    newState = applyHealing(newState, source.id, target.id, finalHeal, '羅刹スキル回復', true);

    const freshTarget = newState.units.find(u => u.id === target.id)!;
    let appliedShieldValue = 0;
    if (source.eidolonLevel! >= 2 && (target.hp / target.stats.hp) >= 0.5) {
        const shieldValue = source.stats.atk * E2_SHIELD_MULT + E2_SHIELD_FLAT;
        appliedShieldValue = shieldValue;
        newState = applyShield(newState, source.id, target.id, shieldValue, 2, 'TURN_START_BASED', 'Luocha E2 Shield', `luocha-e2-shield`, true);
    }

    newState = cleanse(newState, target.id, 1);
    newState = addAbyssFlowerStack(newState, source.id);
    newState = { ...newState, log: [...newState.log, { actionType: 'スキル', sourceId: source.id, targetId: target.id, healingDone: finalHeal, shieldApplied: appliedShieldValue > 0 ? appliedShieldValue : undefined, details: appliedShieldValue > 0 ? '羅刹スキル (回復 + E2シールド)' : '羅刹スキル (回復)' }] };
    return newState;
}

// 白花の刻スタックを追加
function addAbyssFlowerStack(state: GameState, sourceId: string): GameState {
    const source = state.units.find(u => u.id === sourceId);
    if (!source) return state;
    const fieldActive = source.effects.some(e => e.id === FIELD_BUFF_ID);
    if (fieldActive) return state;

    const stackEffect = source.effects.find(e => e.id === ABYSS_FLOWER_STACK_ID);
    let currentStacks = stackEffect ? (stackEffect.stackCount || 0) : 0;
    currentStacks++;

    if (currentStacks >= 2) {
        if (stackEffect) state = removeEffect(state, sourceId, ABYSS_FLOWER_STACK_ID);
        state = deployField(state, sourceId);
    } else {
        if (stackEffect) {
            state = { ...state, units: state.units.map(u => u.id === sourceId ? { ...u, effects: u.effects.map(e => e.id === ABYSS_FLOWER_STACK_ID ? { ...e, stackCount: currentStacks } : e) } : u) };
        } else {
            const newStackEffect: IEffect = { id: ABYSS_FLOWER_STACK_ID, name: '白花の刻', category: 'STATUS', sourceUnitId: sourceId, durationType: 'PERMANENT', duration: -1, stackCount: currentStacks, apply: (t, s) => s, remove: (t, s) => s };
            state = addEffect(state, sourceId, newStackEffect);
        }
    }
    return state;
}

// 結界を展開
function deployField(state: GameState, sourceId: string): GameState {
    const source = state.units.find(u => u.id === sourceId);
    if (!source) return state;

    const fieldEffect: IEffect = {
        id: FIELD_BUFF_ID, name: '白花の刻 (結界)', category: 'BUFF', sourceUnitId: sourceId, durationType: 'TURN_END_BASED', skipFirstTurnDecrement: true, duration: 2, tags: ['LUOCHA_FIELD'],
        onApply: (target, state) => {
            let newState = state;
            if (source.eidolonLevel! >= 1) {
                state.units.forEach(u => {
                    if (!u.isEnemy && u.hp > 0) {
                        const e1Buff: IEffect = {
                            id: `luocha-e1-atk-buff-${sourceId}-${u.id}`, name: '羅刹 E1 攻撃力+20%', category: 'BUFF', sourceUnitId: sourceId, durationType: 'LINKED', duration: 0, linkedEffectId: FIELD_BUFF_ID,
                            onApply: (t, s) => ({ ...s, units: s.units.map(unit => unit.id === t.id ? { ...unit, modifiers: [...unit.modifiers, { source: '羅刹 E1', target: 'atk_pct' as StatKey, type: 'add' as const, value: E1_ATK_BOOST }] } : unit) }),
                            onRemove: (t, s) => ({ ...s, units: s.units.map(unit => unit.id === t.id ? { ...unit, modifiers: unit.modifiers.filter(m => m.source !== '羅刹 E1') } : unit) }),
                            apply: (t, s) => s, remove: (t, s) => s
                        };
                        newState = addEffect(newState, u.id, e1Buff);
                    }
                });
            }
            if (source.eidolonLevel! >= 4) {
                state.units.forEach(u => {
                    if (u.isEnemy && u.hp > 0) {
                        const e4Debuff: IEffect = {
                            id: `luocha-e4-dmg-reduction-${sourceId}-${u.id}`, name: '羅刹 E4 与ダメージ-12%', category: 'DEBUFF', sourceUnitId: sourceId, durationType: 'LINKED', duration: 0, linkedEffectId: FIELD_BUFF_ID,
                            onApply: (t, s) => ({ ...s, units: s.units.map(unit => unit.id === t.id ? { ...unit, modifiers: [...unit.modifiers, { source: '羅刹 E4', target: 'all_dmg_dealt_reduction' as StatKey, type: 'add' as const, value: E4_DMG_REDUCTION }] } : unit) }),
                            onRemove: (t, s) => ({ ...s, units: s.units.map(unit => unit.id === t.id ? { ...unit, modifiers: unit.modifiers.filter(m => m.source !== '羅刹 E4') } : unit) }),
                            apply: (t, s) => s, remove: (t, s) => s
                        };
                        newState = addEffect(newState, u.id, e4Debuff);
                    }
                });
            }
            return newState;
        },
        apply: (t, s) => s, remove: (t, s) => s,
    };
    return addEffect(state, sourceId, fieldEffect);
}

// --- ハンドラーファクトリ ---
export const luochaHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, eidolonLevel = 0) => {
    return {
        handlerMetadata: { id: `luocha-handler-${sourceUnitId}`, subscribesTo: ['ON_BATTLE_START', 'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_DAMAGE_DEALT', 'ON_TURN_START'] },
        handlerLogic: (event, state, handlerId) => {
            const source = state.units.find(u => u.id === sourceUnitId);
            if (!source) return state;

            // オートスキル
            if (event.type === 'ON_DAMAGE_DEALT' || event.type === 'ON_TURN_START') {
                const onCooldown = source.effects.some(e => e.id === AUTO_SKILL_COOLDOWN_ID);
                if (!onCooldown) {
                    const lowHpAlly = state.units.find(u => !u.isEnemy && u.hp > 0 && (u.hp / u.stats.hp) <= 0.5);
                    if (lowHpAlly) {
                        state = applyLuochaSkill(state, source, lowHpAlly);
                        const cooldownEffect: IEffect = { id: AUTO_SKILL_COOLDOWN_ID, name: 'オートスキルクールダウン', category: 'STATUS', sourceUnitId: sourceUnitId, durationType: 'TURN_END_BASED', skipFirstTurnDecrement: true, duration: 2, apply: (t, s) => s, remove: (t, s) => s };
                        state = addEffect(state, sourceUnitId, cooldownEffect);
                        state = { ...state, log: [...state.log, { actionType: 'オートスキル', sourceId: sourceUnitId, targetId: lowHpAlly.id, details: '羅刹オートスキル発動' }] };
                    }
                }
            }

            // 秘技
            if (event.type === 'ON_BATTLE_START') {
                // 秘技使用フラグを確認 (デフォルト true)
                const useTechnique = source.config?.useTechnique !== false;

                if (useTechnique) {
                    state = deployField(state, sourceUnitId);
                    state = {
                        ...state,
                        log: [...state.log, {
                            characterName: source.name,
                            actionTime: state.time,
                            actionType: '秘技',
                            details: '秘技: 結界を展開'
                        }]
                    };
                }
            }

            // スキル
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId && event.targetId) {
                const target = state.units.find(u => u.id === event.targetId);
                if (target) state = applyLuochaSkill(state, source, target);
            }

            // 必殺技
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                // バフ解除（全敵から1つずつ）
                state.units.filter(u => u.isEnemy && u.hp > 0).forEach(enemy => {
                    state = dispelBuffs(state, enemy.id, 1);
                });

                state = addAbyssFlowerStack(state, sourceUnitId);

                // E6: 全属性耐性ダウン
                if (source.eidolonLevel! >= 6) {
                    const resElements: StatKey[] = ['physical_res', 'fire_res', 'ice_res', 'lightning_res', 'wind_res', 'quantum_res', 'imaginary_res'];
                    state.units.filter(u => u.isEnemy && u.hp > 0).forEach(enemy => {
                        const resDownEffect: IEffect = { id: `luocha-e6-res-down-${enemy.id}-${Date.now()}`, name: '全属性耐性ダウン (E6)', category: 'DEBUFF', sourceUnitId: sourceUnitId, durationType: 'TURN_END_BASED', skipFirstTurnDecrement: true, duration: 2, ignoreResistance: true, isCleansable: true, modifiers: resElements.map(key => ({ target: key, type: 'add' as const, value: -E6_RES_DOWN, source: '羅刹 E6' })), apply: (t, s) => s, remove: (t, s) => s };
                        state = addEffect(state, enemy.id, resDownEffect);
                    });
                }
            }

            // 結界回復
            if (event.type === 'ON_DAMAGE_DEALT' && !state.units.find(u => u.id === event.sourceId)?.isEnemy) {
                const fieldActive = source.effects.some(e => e.id === FIELD_BUFF_ID);
                if (fieldActive && event.sourceId) {
                    const attacker = state.units.find(u => u.id === event.sourceId);
                    if (attacker) {
                        // E5で天賦Lv+2 → Lv12の回復値を使用
                        const talentLevel = (source.eidolonLevel || 0) >= 5 ? 12 : 10;
                        const talentHeal = getLeveledValue(ABILITY_VALUES.talentHeal, talentLevel);
                        const healAmount = calculateHeal(source, attacker, { scaling: 'atk', multiplier: talentHeal.mult, flat: talentHeal.flat });

                        // 攻撃者への回復（applyHealing使用、統合ログへの追記はapplyHealing内で自動）
                        state = applyHealing(state, sourceUnitId, attacker.id, healAmount, '羅刹結界回復', true);

                        // A4: 攻撃者以外の味方への回復
                        const a4HealAmount = calculateHeal(source, attacker, { scaling: 'atk', multiplier: A4_MULT, flat: A4_FLAT });
                        const otherAllies = state.units.filter(u => !u.isEnemy && u.id !== attacker.id && u.hp > 0);
                        for (const ally of otherAllies) {
                            state = applyHealing(state, sourceUnitId, ally.id, a4HealAmount, '羅刹A4回復', true);
                        }
                    }
                }
            }

            return state;
        }
    };
};
