import { Character, Element, Path, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, DamageDealtEvent } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { calculateHeal } from '../../simulator/damage';
import { applyHealing, cleanse, applyShield, dispelBuffs } from '../../simulator/engine/utils';
// 星魂対応ユーティリティ
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { UnitRegistry } from '../../simulator/engine/unitRegistry';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';


// --- 定数定義 ---
const CHARACTER_ID = 'luocha';

const EFFECT_IDS = {
    ABYSS_FLOWER_STACK: (sourceId: string) => `luocha-abyss-flower-stack-${sourceId}`,
    FIELD_BUFF: (sourceId: string) => `luocha-field-buff-${sourceId}`,
    AUTO_SKILL_COOLDOWN: (sourceId: string) => `luocha-auto-skill-cooldown-${sourceId}`,
    E1_BUFF: (sourceId: string, targetId: string) => `luocha-e1-atk-buff-${sourceId}-${targetId}`,
    E4_DEBUFF: (sourceId: string, targetId: string) => `luocha-e4-dmg-reduction-${sourceId}-${targetId}`,
    E2_SHIELD: (targetId: string) => `luocha-e2-shield-${targetId}`,
    E6_RES_DOWN: (targetId: string) => `luocha-e6-res-down-${targetId}`,
} as const;

const TRACE_IDS = {
    CLEANSING_REVIVAL: 'luocha-trace-a2', // 滴水蘇生
    SANITIFIED_IN_ASH: 'luocha-trace-a4', // 清めし塵の身
    THROUGH_THE_VALLEY: 'luocha-trace-a6', // 幽谷を越え
} as const;

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
            energyGain: 0,
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
        lightConeId: 'echoes-of-the-coffin',
        superimposition: 1,
        relicSetId: 'warlord_of_blazing_sun_and_thunderous_roar',
        ornamentSetId: 'broken_keel',
        mainStats: {
            body: 'outgoing_healing_boost',
            feet: 'spd',
            sphere: 'atk_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'atk_pct', value: 0.15 },
            { stat: 'spd', value: 6 },
            { stat: 'hp_pct', value: 0.15 },
            { stat: 'def_pct', value: 0.15 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// --- ヘルパー関数 ---

// スキル効果を適用
function applyLuochaSkill(state: GameState, source: Unit, target: Unit): GameState {
    let newState = state;

    // E3でスキルLv+2 → calculateAbilityLevelを使用
    const skillLevel = calculateAbilityLevel(source.eidolonLevel || 0, 3, 'Skill');
    const skillHeal = getLeveledValue(ABILITY_VALUES.skillHeal, skillLevel);

    // E2: HP50%未満の場合、与回復+30%
    const additionalBoost = (source.eidolonLevel! >= 2 && (target.hp / target.stats.hp) < 0.5) ? E2_HEAL_BOOST : 0;

    newState = applyHealing(newState, source.id, target.id, {
        scaling: 'atk',
        multiplier: skillHeal.mult,
        flat: skillHeal.flat,
        additionalOutgoingBoost: additionalBoost
    }, '羅刹スキル回復', true);

    // 回復量を計算（ログ用）
    const appliedShieldValue = (source.eidolonLevel! >= 2 && (target.hp / target.stats.hp) >= 0.5)
        ? source.stats.atk * E2_SHIELD_MULT + E2_SHIELD_FLAT
        : 0;

    if (appliedShieldValue > 0) {
        newState = applyShield(newState, source.id, target.id, { scaling: 'atk', multiplier: E2_SHIELD_MULT, flat: E2_SHIELD_FLAT }, 2, 'TURN_START_BASED', 'Luocha E2 Shield', EFFECT_IDS.E2_SHIELD(target.id), true);
    }

    if (source.traces?.some(t => t.id === TRACE_IDS.CLEANSING_REVIVAL)) {
        newState = cleanse(newState, target.id, 1);
    }
    newState = addAbyssFlowerStack(newState, source.id);
    return newState;
}

// 白花の刻スタックを追加
function addAbyssFlowerStack(state: GameState, sourceId: string): GameState {
    const source = state.registry.get(createUnitId(sourceId));
    if (!source) return state;
    const fieldActive = source.effects.some(e => e.id === EFFECT_IDS.FIELD_BUFF(sourceId));
    if (fieldActive) return state;

    const stackEffect = source.effects.find(e => e.id === EFFECT_IDS.ABYSS_FLOWER_STACK(sourceId));
    let currentStacks = stackEffect ? (stackEffect.stackCount || 0) : 0;
    currentStacks++;

    if (currentStacks >= 2) {
        if (stackEffect) state = removeEffect(state, sourceId, EFFECT_IDS.ABYSS_FLOWER_STACK(sourceId));
        state = deployField(state, sourceId);
    } else {
        if (stackEffect) {
            const updatedEffect = { ...stackEffect, stackCount: currentStacks };
            const updatedEffects = source.effects.map(e => e.id === EFFECT_IDS.ABYSS_FLOWER_STACK(sourceId) ? updatedEffect : e);
            state = {
                ...state,
                registry: state.registry.update(createUnitId(sourceId), u => ({ ...u, effects: updatedEffects }))
            };
        } else {
            const newStackEffect: IEffect = {
                id: EFFECT_IDS.ABYSS_FLOWER_STACK(sourceId),
                name: '白花の刻',
                category: 'STATUS',
                sourceUnitId: sourceId,
                durationType: 'PERMANENT',
                duration: -1,
                stackCount: currentStacks,
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            state = addEffect(state, sourceId, newStackEffect);
        }
    }
    return state;
}

// 結界を展開
function deployField(state: GameState, sourceId: string): GameState {
    const source = state.registry.get(createUnitId(sourceId));
    if (!source) return state;

    const fieldEffect: IEffect = {
        id: EFFECT_IDS.FIELD_BUFF(sourceId), name: '白花の刻 (結界)', category: 'BUFF', sourceUnitId: sourceId, durationType: 'TURN_END_BASED', skipFirstTurnDecrement: true, duration: 2, tags: ['LUOCHA_FIELD'],
        onApply: (target, state) => {
            let newState = state;
            if (source.eidolonLevel! >= 1) {
                state.registry.getAliveAllies().forEach(u => {
                    const e1Buff: IEffect = {
                        id: EFFECT_IDS.E1_BUFF(sourceId, u.id), name: '羅刹 E1 攻撃力+20%', category: 'BUFF', sourceUnitId: sourceId, durationType: 'LINKED', duration: 0, linkedEffectId: EFFECT_IDS.FIELD_BUFF(sourceId),
                        onApply: (t, s) => {
                            const unit = s.registry.get(createUnitId(t.id));
                            if (!unit) return s;
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: [...unit.modifiers, { source: '羅刹 E1', target: 'atk_pct' as StatKey, type: 'add' as const, value: E1_ATK_BOOST }] }))
                            };
                        },
                        onRemove: (t, s) => {
                            const unit = s.registry.get(createUnitId(t.id));
                            if (!unit) return s;
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: unit.modifiers.filter(m => m.source !== '羅刹 E1') }))
                            };
                        },
                        apply: (t, s) => s, remove: (t, s) => s
                    };
                    newState = addEffect(newState, u.id, e1Buff);
                });
            }
            if (source.eidolonLevel! >= 4) {
                state.registry.getAliveEnemies().forEach(u => {
                    const e4Debuff: IEffect = {
                        id: EFFECT_IDS.E4_DEBUFF(sourceId, u.id), name: '羅刹 E4 与ダメージ-12%', category: 'DEBUFF', sourceUnitId: sourceId, durationType: 'LINKED', duration: 0, linkedEffectId: EFFECT_IDS.FIELD_BUFF(sourceId),
                        onApply: (t, s) => {
                            const unit = s.registry.get(createUnitId(t.id));
                            if (!unit) return s;
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: [...unit.modifiers, { source: '羅刹 E4', target: 'all_dmg_dealt_reduction' as StatKey, type: 'add' as const, value: E4_DMG_REDUCTION }] }))
                            };
                        },
                        onRemove: (t, s) => {
                            const unit = s.registry.get(createUnitId(t.id));
                            if (!unit) return s;
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: unit.modifiers.filter(m => m.source !== '羅刹 E4') }))
                            };
                        },
                        apply: (t, s) => s, remove: (t, s) => s
                    };
                    newState = addEffect(newState, u.id, e4Debuff);
                });
            }
            return newState;
        },
        apply: (t, s) => s, remove: (t, s) => s,
    };
    return addEffect(state, sourceId, fieldEffect);
}

// --- ハンドラー関数 ---

function onAutoSkillCheck(event: GeneralEvent, state: GameState, sourceUnitId: string): GameState {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    const onCooldown = source.effects.some(e => e.id === EFFECT_IDS.AUTO_SKILL_COOLDOWN(sourceUnitId));
    if (!onCooldown) {
        const lowHpAlly = state.registry.getAliveAllies().find(u => (u.hp / u.stats.hp) <= 0.5);
        if (lowHpAlly) {
            state = applyLuochaSkill(state, source, lowHpAlly);
            const cooldownEffect: IEffect = {
                id: EFFECT_IDS.AUTO_SKILL_COOLDOWN(sourceUnitId),
                name: 'オートスキルクールダウン',
                category: 'STATUS',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_END_BASED',
                skipFirstTurnDecrement: true,
                duration: 2,
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            state = addEffect(state, sourceUnitId, cooldownEffect);
            state = { ...state, log: [...state.log, { actionType: 'オートスキル', sourceId: sourceUnitId, targetId: lowHpAlly.id, details: '羅刹オートスキル発動' }] };
        }
    }
    return state;
}

function onBattleStart(event: GeneralEvent, state: GameState, sourceUnitId: string): GameState {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

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
    return state;
}

function onSkillUsed(event: ActionEvent, state: GameState, sourceUnitId: string): GameState {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source || !event.targetId) return state;
    if (event.sourceId !== sourceUnitId) return state;

    const target = state.registry.get(createUnitId(event.targetId));
    if (target) state = applyLuochaSkill(state, source, target);
    return state;
}

function onUltimateUsed(event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source || event.sourceId !== sourceUnitId) return state;

    // バフ解除（全敵から1つずつ）
    state.registry.getAliveEnemies().forEach(enemy => {
        state = dispelBuffs(state, enemy.id, 1);
    });

    state = addAbyssFlowerStack(state, sourceUnitId);

    // E6: 全属性耐性ダウン
    if (source.eidolonLevel! >= 6) {
        const resElements: StatKey[] = ['physical_res', 'fire_res', 'ice_res', 'lightning_res', 'wind_res', 'quantum_res', 'imaginary_res'];
        state.registry.getAliveEnemies().forEach(enemy => {
            const resDownEffect: IEffect = {
                id: EFFECT_IDS.E6_RES_DOWN(enemy.id),
                name: '全属性耐性ダウン (E6)',
                category: 'DEBUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_END_BASED',
                skipFirstTurnDecrement: true,
                duration: 2,
                ignoreResistance: true,
                isCleansable: true,
                modifiers: resElements.map(key => ({ target: key, type: 'add' as const, value: -E6_RES_DOWN, source: '羅刹 E6' })),
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            state = addEffect(state, enemy.id, resDownEffect);
        });
    }
    return state;
}

function onFieldHeal(event: DamageDealtEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState {
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;

    const attacker = state.registry.get(createUnitId(event.sourceId));
    if (!attacker || attacker.isEnemy) return state; // 味方の攻撃のみ

    const fieldActive = source.effects.some(e => e.id === EFFECT_IDS.FIELD_BUFF(sourceUnitId));
    if (fieldActive) {
        // E5で天賦Lv+2 → calculateAbilityLevelを使用
        const talentLevel = calculateAbilityLevel(source.eidolonLevel || 0, 5, 'Talent');
        const talentHeal = getLeveledValue(ABILITY_VALUES.talentHeal, talentLevel);

        // 攻撃者への回復
        state = applyHealing(state, sourceUnitId, attacker.id, {
            scaling: 'atk',
            multiplier: talentHeal.mult,
            flat: talentHeal.flat
        }, '羅刹結界回復', true);

        // A4: 攻撃者以外の味方への回復
        if (source.traces?.some(t => t.id === TRACE_IDS.SANITIFIED_IN_ASH)) {
            const otherAllies = state.registry.getAliveAllies().filter(u => u.id !== attacker.id);
            for (const ally of otherAllies) {
                state = applyHealing(state, sourceUnitId, ally.id, {
                    scaling: 'atk',
                    multiplier: A4_MULT,
                    flat: A4_FLAT
                }, '羅刹A4回復', true);
            }
        }
    }
    return state;
}

// --- ハンドラーファクトリ ---
export const luochaHandlerFactory: IEventHandlerFactory = (sourceUnitId, level, eidolonLevel = 0) => {
    return {
        handlerMetadata: { id: `luocha-handler-${sourceUnitId}`, subscribesTo: ['ON_BATTLE_START', 'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_DAMAGE_DEALT', 'ON_TURN_START'] },
        handlerLogic: (event: IEvent, state: GameState, _handlerId: string): GameState => {
            const source = state.registry.get(createUnitId(sourceUnitId));
            if (!source) return state;

            let newState = state;

            // オートスキル
            if (event.type === 'ON_DAMAGE_DEALT' || event.type === 'ON_TURN_START') {
                newState = onAutoSkillCheck(event as GeneralEvent, newState, sourceUnitId);
            }

            // 秘技
            if (event.type === 'ON_BATTLE_START') {
                newState = onBattleStart(event as GeneralEvent, newState, sourceUnitId);
            }

            // スキル
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                newState = onSkillUsed(event as ActionEvent, newState, sourceUnitId);
            }

            // 必殺技
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                newState = onUltimateUsed(event as ActionEvent, newState, sourceUnitId, eidolonLevel);
            }

            // 結界回復 (ON_DAMAGE_DEALT is also used for autoskill check... check both?)
            // Note: onAutoSkillCheck is called first. newState is updated.
            if (event.type === 'ON_DAMAGE_DEALT') {
                newState = onFieldHeal(event as DamageDealtEvent, newState, sourceUnitId, eidolonLevel);
            }

            return newState;
        }
    };
};
