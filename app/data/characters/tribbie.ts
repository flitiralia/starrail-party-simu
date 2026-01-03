import { Character, Element, Path, StatKey } from '../../types';
import { IEventHandlerFactory, GameState, IEvent, Unit, IHit, ActionContext } from '../../simulator/engine/types';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateNormalAdditionalDamageWithCritInfo, calculateTrueDamageWithBreakdown } from '../../simulator/damage';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
// 星魂対応ユーティリティ
import { getLeveledValue } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';


// --- 定数定義 ---
const CHARACTER_ID = 'tribbie';

// --- E3/E5パターン (非標準) ---
// E3: 必殺技Lv+2, 通常Lv+1
// E5: スキルLv+2, 天賦Lv+2 → スキル耐性貫通がLv12

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // スキル耐性貫通: E5でLv12に上昇
    skillResPen: {
        10: 0.24,
        12: 0.264
    } as Record<number, number>,
};

// 通常攻撃
const BASIC_MAIN_MULT = 0.30;
const BASIC_ADJ_MULT = 0.15;

// 必殺技
const ULT_MULT = 0.30;

// 天賦
const TALENT_MULT = 0.18;

// スキル
const SKILL_AURA_DURATION = 3;

// 結界
const FIELD_DURATION = 2;
const FIELD_ADDITIONAL_DMG_MULT = 0.12;

// 星魂
const E1_TRUE_DMG_PCT = 0.24;
const E2_DMG_MULT = 2.2;
const E4_DEF_IGNORE = 0.18;
const E6_DMG_BOOST = 7.29;

// 軌跡
const TRACE1_DMG_BOOST_PER_STACK = 0.72;
const TRACE2_HP_BOOST_PCT = 0.09;
const TRACE3_BATTLE_START_EP = 30;
const TRACE3_EP_PER_HIT = 1.5;

export const tribbie: Character = {
    id: 'tribbie',
    name: 'トリビー',
    path: 'Harmony',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1047,
        atk: 524,
        def: 728,
        spd: 96,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'tribbie-basic',
            name: '百発分のピラヴロス',
            type: 'Basic ATK',
            description: '指定した敵単体および隣接する敵に量子属性ダメージを与える。',
            targetType: 'blast',
            damage: {
                type: 'blast',
                scaling: 'hp',
                mainHits: [{ multiplier: 0.3, toughnessReduction: 10 }],
                adjacentHits: [{ multiplier: 0.15, toughnessReduction: 5 }],
            },
            energyGain: 20,
        },
        skill: {
            id: 'tribbie-skill',
            name: 'プレゼントはどこ？',
            type: 'Skill',
            description: '味方全体に「神の啓示」を付与する。全属性耐性貫通+24%。3ターン継続。',
            targetType: 'self',
            energyGain: 30,
            effects: [] // Handled by Handler (Aura)
        },
        ultimate: {
            id: 'tribbie-ultimate',
            name: 'ここに住んでるのは誰でしょう！',
            type: 'Ultimate',
            description: '結界を展開し、敵全体に量子属性ダメージを与える。結界展開中、敵の被ダメージをアップさせる。また、味方の攻撃後、最もHPの高い敵に付加ダメージを与える。',
            targetType: 'all_enemies',
            energyGain: 5,
            damage: {
                type: 'aoe',
                scaling: 'hp',
                hits: [{ multiplier: 0.3, toughnessReduction: 20 }],
            },
            effects: [] // Field handled by handler
        },
        talent: {
            id: 'tribbie-talent',
            name: 'どたばたトリビー',
            type: 'Talent',
            description: '自身以外の味方が必殺技を発動した後、トリビーが追加攻撃を行い、敵全体に量子属性ダメージを与える。この効果は各味方につき1回まで発動可能で、トリビーが必殺技を発動すると回数がリセットされる。',
            targetType: 'all_enemies', // AoE Follow-up
            damage: {
                type: 'aoe',
                scaling: 'hp',
                hits: [{ multiplier: 0.18, toughnessReduction: 5 }],
            },
            energyGain: 5,
        },
        technique: {
            id: 'tribbie-technique',
            name: '楽しいなら手を叩こう',
            type: 'Technique',
            description: '戦闘開始時、味方全体に「神の啓示」を付与する。',
        }
    },
    traces: [
        {
            id: 'tribbie-trace-1',
            name: '壁の外の子羊…',
            type: 'Bonus Ability',
            description: '天賦の追加攻撃を行った後、トリビーの与ダメージ+72%。最大3層累積、3ターン継続。',
        },
        {
            id: 'tribbie-trace-2',
            name: '羽の生えたガラス玉！',
            type: 'Bonus Ability',
            description: '結界が展開されている間、トリビーの最大HPが「味方全体の最大HP合計値の9%分」アップする。',
        },
        {
            id: 'tribbie-trace-3',
            name: '分かれ道の傍の小石？',
            type: 'Bonus Ability',
            description: '戦闘開始時、EPを30回復する。トリビー以外の味方が攻撃を行った後、命中した敵1体につき、トリビーがEPを1.5回復する。',
        },
        {
            id: 'tribbie-stat-cd',
            name: '会心ダメージ',
            type: 'Stat Bonus',
            description: '会心ダメージ+37.3%',
            stat: 'crit_dmg',
            value: 0.373,
        },
        {
            id: 'tribbie-stat-cr',
            name: '会心率',
            type: 'Stat Bonus',
            description: '会心率+12.0%',
            stat: 'crit_rate',
            value: 0.12,
        },
        {
            id: 'tribbie-stat-hp',
            name: 'HP',
            type: 'Stat Bonus',
            description: 'HP+10.0%',
            stat: 'hp_pct',
            value: 0.10,
        }
    ],
    eidolons: {
        e1: {
            level: 1,
            name: '砂糖を拾い上げる祭典',
            description: '結界中、味方の攻撃後、付加ダメージを受けた敵に総ダメージの24%分の確定ダメージを与える。'
        },
        e2: {
            level: 2,
            name: '素敵な夢への案内人',
            description: '結界の付加ダメージ倍率120%UP。さらに1回付加ダメージを追加。'
        },
        e3: {
            level: 3,
            name: '朝焼けの宝物',
            description: '必殺技Lv.+2、通常攻撃Lv.+1',
            abilityModifiers: [
                // レベル12: 通常攻撃 33%/16.5%、必殺技 33%
                { abilityName: 'basic', param: 'damage.mainHits.0.multiplier', value: 0.33 },
                { abilityName: 'basic', param: 'damage.adjacentHits.0.multiplier', value: 0.165 },
                { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 0.33 },
            ]
        },
        e4: {
            level: 4,
            name: '心通い合う安らぎ',
            description: '「神の啓示」中、味方全体の防御無視+18%。'
        },
        e5: {
            level: 5,
            name: '奇跡を起こす時計',
            description: '戦闘スキルLv.+2、天賦Lv.+2',
            abilityModifiers: [
                // スキルの耐性貫通はgetSkillResPenValue関数で処理
                // レベル12: 天賦 19.8%
                { abilityName: 'talent', param: 'damage.hits.0.multiplier', value: 0.198 }
            ]
        },
        e6: {
            level: 6,
            name: '星が煌めく明日',
            description: '必殺技発動後、敵全体に天賦の追加攻撃を行う。ダメージ+729%。'
        }
    },

    defaultConfig: {
        lightConeId: 'if-time-were-a-flower',
        superimposition: 1,
        relicSetId: 'poet-of-mourning-collapse',
        ornamentSetId: 'bone-collections-serene-demesne',
        mainStats: {
            body: 'crit_rate',
            feet: 'hp_pct',
            sphere: 'hp_pct',
            rope: 'energy_regen_rate',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.324 },
            { stat: 'crit_dmg', value: 0.648 },
            { stat: 'hp_pct', value: 0.432 },
        ],
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate',
    }
};

// Helper to create the Aura Effect
function createDivineRevelationAura(sourceId: string, duration: number, eidolonLevel: number): IEffect {
    // E5でスキルLv+2 → Lv12の耐性貫通値を使用
    const skillLevel = eidolonLevel >= 5 ? 12 : 10;
    const resPenValue = getLeveledValue(ABILITY_VALUES.skillResPen, skillLevel);

    return {
        id: `divine-revelation-aura-${sourceId}`,
        name: '神の啓示オーラ',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: duration,
        onApply: (t, s) => {
            // Apply Buff to ALL allies (including self)
            let newState = s;
            s.registry.getAliveAllies().forEach(u => {
                const buff: IEffect = {
                    id: `divine-revelation-buff-${sourceId}-${u.id}`,
                    name: '神の啓示',
                    category: 'BUFF',
                    sourceUnitId: sourceId,
                    durationType: 'LINKED', // Changed to LINKED
                    duration: 0,
                    linkedEffectId: `divine-revelation-aura-${sourceId}`, // Linked to Parent Aura
                    onApply: (target, state) => {
                        const newModifiers = [...target.modifiers, {
                            source: '神の啓示',
                            target: 'all_type_res_pen' as StatKey,
                            type: 'add' as const,
                            value: resPenValue,
                        }];
                        if (eidolonLevel >= 4) {
                            newModifiers.push({
                                source: '神の啓示 (E4)',
                                target: 'def_ignore' as StatKey,
                                type: 'add' as const,
                                value: E4_DEF_IGNORE
                            });
                        }
                        return {
                            ...state,
                            registry: state.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                        };
                    },
                    onRemove: (target, state) => {
                        // "神の啓示" と "神の啓示 (E4)" を除外
                        const newModifiers = target.modifiers.filter(m => m.source !== '神の啓示' && m.source !== '神の啓示 (E4)');
                        return {
                            ...state,
                            registry: state.registry.update(createUnitId(target.id), u => ({ ...u, modifiers: newModifiers }))
                        };
                    },
                };
                newState = addEffect(newState, u.id, buff);
            });
            return newState;
        },
        onRemove: (t, s) => {
            // Remove Buff from ALL allies
            let newState = s;
            s.registry.getAliveAllies().forEach(u => {
                newState = removeEffect(newState, u.id, `divine-revelation-buff-${sourceId}-${u.id}`);
            });
            return newState;
        },

        /* remove removed */
    };
}

export const tribbieHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    return {
        handlerMetadata: {
            id: `tribbie-handler-${sourceUnitId}`,
            subscribesTo: ['ON_DAMAGE_DEALT', 'ON_TURN_START', 'ON_BATTLE_START', 'ON_ULTIMATE_USED', 'ON_ATTACK', 'ON_FOLLOW_UP_ATTACK', 'ON_ENEMY_SPAWNED'],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const tribbieUnit = state.registry.get(createUnitId(sourceUnitId));
            if (!tribbieUnit) return state;

            let newState = state;

            // Technique: Battle Start
            if (event.type === 'ON_BATTLE_START') {
                console.log('[Tribbie Handler] ON_BATTLE_START event received');

                // 秘技使用フラグを確認 (デフォルト true)
                const useTechnique = tribbieUnit.config?.useTechnique !== false;

                if (useTechnique) {
                    // Apply Aura
                    const aura = createDivineRevelationAura(sourceUnitId, 3, eidolonLevel);
                    newState = addEffect(newState, sourceUnitId, aura);

                    console.log('[Tribbie Handler] After addEffect, tribbie effects:',
                        newState.registry.get(createUnitId(sourceUnitId))?.effects.length);

                    // Log Technique Activation (イミュータブル更新)
                    newState = {
                        ...newState,
                        log: [...newState.log, {
                            characterName: tribbieUnit.name,
                            actionTime: newState.time,
                            actionType: '秘技',
                            skillPointsAfterAction: newState.skillPoints,
                            damageDealt: 0,
                            healingDone: 0,
                            shieldApplied: 0,
                            sourceHpState: `${tribbieUnit.hp.toFixed(0)}/${tribbieUnit.stats.hp.toFixed(0)}`,
                            targetHpState: '',
                            targetToughness: '',
                            currentEp: tribbieUnit.ep,
                            activeEffects: [],
                            details: '秘技: 神の啓示を付与'
                        } as any]
                    };
                }

                // 天賦「どたばたトリビー」: 全味方（自身除く）に発動可能エフェクトを付与
                // これは秘技ではなく天賦なので常に発動
                const battleStartAllies = newState.registry.getAliveAllies().filter(u => u.id !== sourceUnitId);
                battleStartAllies.forEach(ally => {
                    const talentReadyEffect: IEffect = {
                        id: `tribbie-talent-ready-${sourceUnitId}-${ally.id}`,
                        name: 'どたばたトリビー',
                        category: 'STATUS',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,
                        onApply: (t, s) => s,
                        onRemove: (t, s) => s,

                        /* remove removed */
                    };
                    newState = addEffect(newState, ally.id, talentReadyEffect);
                });

                // Trace 3: Energy Regen at Battle Start (これも秘技ではなく軌跡なので常に発動)
                const pebbleTrace = tribbieUnit.traces?.find(t => t.id === 'tribbie-trace-3');
                if (pebbleTrace) {
                    newState = addEnergyToUnit(newState, sourceUnitId, TRACE3_BATTLE_START_EP, 0, false, {
                        sourceId: sourceUnitId,
                        publishEventFn: publishEvent
                    });
                }

                console.log('[Tribbie Handler] Returning state, tribbie effects:',
                    newState.registry.get(createUnitId(sourceUnitId))?.effects.length,
                    newState.registry.get(createUnitId(sourceUnitId))?.effects.map(e => e.name));

                return newState;
            }

            // Skill: Apply Aura
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                const aura = createDivineRevelationAura(sourceUnitId, 3, eidolonLevel);
                newState = addEffect(newState, sourceUnitId, aura);
            }

            // Ultimate Field Logic
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                // 結界のID（LINKEDデバフ用に固定）
                const fieldEffectId = `tribbie-field-${sourceUnitId}`;

                // Apply Field to Tribbie (Duration 2)
                const fieldEffect: IEffect = {
                    id: fieldEffectId,
                    name: 'ここに住んでるのは誰でしょう！',
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'TURN_START_BASED',
                    duration: FIELD_DURATION,
                    onApply: (t, s) => {
                        // Trace 2: Max HP Boost
                        let totalMaxHp = 0;
                        s.registry.toArray().forEach(u => {
                            if (!u.isEnemy) totalMaxHp += u.stats.hp;
                        });

                        const trace2 = tribbieUnit.traces?.find(tr => tr.id === 'tribbie-trace-2');
                        let hpBoost = 0;
                        if (trace2) {
                            hpBoost = totalMaxHp * TRACE2_HP_BOOST_PCT;
                        }

                        const newModifiers = [...t.modifiers];
                        if (hpBoost > 0) {
                            newModifiers.push({
                                source: 'ここに住んでるのは誰でしょう！ (形跡 2)',
                                target: 'hp' as StatKey,
                                type: 'add' as const,
                                value: hpBoost
                            });
                        }

                        return {
                            ...s,
                            registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                        };
                    },
                    onRemove: (t, s) => {
                        const newModifiers = t.modifiers.filter(m => m.source !== 'ここに住んでるのは誰でしょう！ (形跡 2)');
                        return {
                            ...s,
                            registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                        };
                    },

                    /* remove removed */
                };
                newState = addEffect(newState, sourceUnitId, fieldEffect);

                // 結界: 敵全体に被ダメージ増加デバフを付与（LINKEDで結界終了時に自動削除）
                const enemies = newState.registry.getAliveEnemies();
                enemies.forEach(enemy => {
                    const vulnDebuff: IEffect = {
                        id: `tribbie-field-vuln-${sourceUnitId}-${enemy.id}`,
                        name: '結界: 被ダメージ増加',
                        category: 'DEBUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'LINKED',
                        duration: 0,
                        linkedEffectId: fieldEffectId,
                        modifiers: [{
                            source: '結界: 被ダメージ増加',
                            target: 'all_type_vuln' as StatKey,
                            type: 'add' as const,
                            value: 0.30
                        }],
                        onApply: (t, s) => {
                            const newModifiers = [...t.modifiers, {
                                source: '結界: 被ダメージ増加',
                                target: 'all_type_vuln' as StatKey,
                                type: 'add' as const,
                                value: 0.30
                            }];
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                            };
                        },
                        onRemove: (t, s) => {
                            const newModifiers = t.modifiers.filter(m => m.source !== '結界: 被ダメージ増加');
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                            };
                        },

                        /* remove removed */
                    };
                    newState = addEffect(newState, enemy.id, vulnDebuff);
                });


                // E6: Trigger Talent Follow-up
                if (eidolonLevel >= 6) {
                    const followUpAction: any = {
                        type: 'FOLLOW_UP_ATTACK',
                        sourceId: sourceUnitId,
                        targetId: newState.registry.getAliveEnemies()[0]?.id, // 便宜上最初の敵を指定
                    };

                    const e6Buff: IEffect = {
                        id: `tribbie-e6-buff-${Date.now()}`,
                        name: 'E6ダメージアップ',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_END_BASED',
                        skipFirstTurnDecrement: true,
                        duration: 1,
                        onApply: (t, s) => {
                            const newModifiers = [...t.modifiers, {
                                source: 'E6ダメージアップ',
                                target: 'all_type_dmg_boost' as StatKey,
                                type: 'add' as const,
                                value: 7.29
                            }];
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                            };
                        },
                        onRemove: (t, s) => {
                            const newModifiers = t.modifiers.filter(m => m.source !== 'E6ダメージアップ');
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                            };
                        },

                        /* remove removed */
                    };
                    newState = addEffect(newState, sourceUnitId, e6Buff);
                    newState = {
                        ...newState,
                        pendingActions: [...newState.pendingActions, followUpAction]
                    };
                }

                // 天賦「どたばたトリビー」リセット: 全味方（自身除く）にエフェクトを再付与
                const ultAllies = newState.registry.getAliveAllies().filter(u => u.id !== sourceUnitId);
                ultAllies.forEach(ally => {
                    // 既存を削除してから再付与（重複防止）
                    const talentReadyEffectId = `tribbie-talent-ready-${sourceUnitId}-${ally.id}`;
                    newState = removeEffect(newState, ally.id, talentReadyEffectId);

                    const talentReadyEffect: IEffect = {
                        id: talentReadyEffectId,
                        name: 'どたばたトリビー',
                        category: 'STATUS',
                        sourceUnitId: sourceUnitId,
                        durationType: 'PERMANENT',
                        duration: -1,
                        onApply: (t, s) => s,
                        onRemove: (t, s) => s,

                        /* remove removed */
                    };
                    newState = addEffect(newState, ally.id, talentReadyEffect);
                });
            }

            // Additional Damage Logic (Field) & Trace 3 Energy Regen
            // ON_ATTACKは攻撃アクション時のみ発火（回復・バフスキルでは発火しない）
            // 仕様: 「敵が味方の攻撃を受けた後」なのでトリビー自身の攻撃も含む
            if (event.type === 'ON_ATTACK') {
                const sourceAlly = newState.registry.get(createUnitId(event.sourceId));
                if (sourceAlly && !sourceAlly.isEnemy) {
                    // 攻撃対象数を取得（イベントから）
                    const targetsHit = event.targetCount ?? 1;

                    // Trace 3: Energy Regen on Ally Attack
                    const pebbleTrace = tribbieUnit.traces?.find(t => t.id === 'tribbie-trace-3');
                    if (pebbleTrace) {
                        const energyGain = 1.5 * targetsHit;
                        newState = addEnergyToUnit(newState, sourceUnitId, energyGain, 0, false, {
                            sourceId: sourceUnitId,
                            publishEventFn: publishEvent
                        });
                    }

                    // Field Logic: 攻撃を受けた敵1体につき1回発動
                    const currentTribbie = newState.registry.get(createUnitId(sourceUnitId))!;
                    const hasField = currentTribbie.effects.find(e => e.id === `tribbie-field-${sourceUnitId}`);
                    if (hasField) {
                        // 攻撃対象数分だけ付加ダメージを発動
                        for (let hitIndex = 0; hitIndex < targetsHit; hitIndex++) {
                            const enemies = newState.registry.getAliveEnemies();
                            if (enemies.length === 0) break;

                            // 最もHPが高い敵を選択
                            const target = enemies.reduce((prev, current) => (prev.hp > current.hp) ? prev : current);

                            let baseMult = 0.12;
                            if (eidolonLevel >= 3) baseMult = 0.132;

                            let multiplier = 1.0;
                            if (eidolonLevel >= 2) multiplier = 2.2; // 120% UP = 2.2x

                            const latestTribbie = newState.registry.get(createUnitId(sourceUnitId))!;
                            const baseDamage = latestTribbie.stats.hp * baseMult * multiplier;
                            const damageResult = calculateNormalAdditionalDamageWithCritInfo(latestTribbie, target, baseDamage);

                            const result1 = applyUnifiedDamage(
                                newState,
                                latestTribbie,
                                target,
                                damageResult.damage,
                                {
                                    damageType: '付加ダメージ',
                                    details: '「ここに住んでるのは誰でしょう！」 結界ダメージ',
                                    skipLog: true,
                                    events: [{
                                        type: 'ON_DAMAGE_DEALT',
                                        payload: {
                                            subType: 'ADDITIONAL_DAMAGE',
                                            targetCount: 1
                                        }
                                    }],
                                    additionalDamageEntry: {
                                        source: 'トリビー',
                                        name: '結界付加ダメージ',
                                        damageType: 'additional',
                                        isCrit: damageResult.isCrit,
                                        breakdownMultipliers: damageResult.breakdownMultipliers
                                    }
                                }
                            );
                            newState = result1.state;
                            let totalDamageDealt = result1.totalDamage;

                            // E2: Extra Hit
                            if (eidolonLevel >= 2) {
                                const updatedTarget = newState.registry.get(createUnitId(target.id));
                                if (updatedTarget && updatedTarget.hp > 0) {
                                    const damageResult2 = calculateNormalAdditionalDamageWithCritInfo(latestTribbie, updatedTarget, baseDamage);

                                    const result2 = applyUnifiedDamage(
                                        newState,
                                        latestTribbie,
                                        updatedTarget,
                                        damageResult2.damage,
                                        {
                                            damageType: '付加ダメージ',
                                            details: '「ここに住んでるのは誰でしょう！」 結界ダメージ (E2追加)',
                                            skipLog: true,
                                            events: [{
                                                type: 'ON_DAMAGE_DEALT',
                                                payload: {
                                                    subType: 'ADDITIONAL_DAMAGE',
                                                    targetCount: 1
                                                }
                                            }],
                                            additionalDamageEntry: {
                                                source: 'トリビー',
                                                name: '結界付加ダメージ (E2)',
                                                damageType: 'additional',
                                                isCrit: damageResult2.isCrit,
                                                breakdownMultipliers: damageResult2.breakdownMultipliers
                                            }
                                        }
                                    );
                                    newState = result2.state;
                                    totalDamageDealt += result2.totalDamage;
                                }
                            }

                            if (eidolonLevel >= 1 && totalDamageDealt > 0) {
                                // E1: その回の攻撃の総ダメージの24%分の確定ダメージ（防御・耐性・会心を無視）
                                // 総ダメージ = 味方攻撃ダメージ(event.value) + 結界付加ダメージ + E2追加ダメージ
                                const allyAttackDamage = event.value || 0;
                                const totalAttackDamage = allyAttackDamage + totalDamageDealt;
                                const trueDamageResult = calculateTrueDamageWithBreakdown(totalAttackDamage * E1_TRUE_DMG_PCT);
                                const updatedTarget = newState.registry.get(createUnitId(target.id));
                                if (updatedTarget && updatedTarget.hp > 0) {
                                    const resultE1 = applyUnifiedDamage(
                                        newState,
                                        latestTribbie,
                                        updatedTarget,
                                        trueDamageResult.damage,
                                        {
                                            damageType: '確定ダメージ',
                                            details: '「ここに住んでるのは誰でしょう！」 E1確定ダメージ',
                                            skipLog: true,
                                            events: [{
                                                type: 'ON_DAMAGE_DEALT',
                                                payload: {
                                                    subType: 'TRUE_DAMAGE',
                                                    targetCount: 1
                                                }
                                            }],
                                            additionalDamageEntry: {
                                                source: 'トリビー',
                                                name: 'E1確定ダメージ',
                                                damageType: 'true_damage',
                                                isCrit: trueDamageResult.isCrit,
                                                breakdownMultipliers: trueDamageResult.breakdownMultipliers
                                            }
                                        }
                                    );
                                    newState = resultE1.state;
                                }
                            }
                        }
                    }
                }
            }

            // Talent: Follow-up on Ally Ultimate (発動制限あり)
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId !== sourceUnitId) {
                const sourceAlly = newState.registry.get(createUnitId(event.sourceId));
                if (sourceAlly && !sourceAlly.isEnemy) {
                    // 発動可能チェック（「どたばたトリビー」エフェクトがあれば発動可能）
                    const talentReadyEffectId = `tribbie-talent-ready-${sourceUnitId}-${sourceAlly.id}`;
                    const talentReady = sourceAlly.effects.find(e => e.id === talentReadyEffectId);

                    if (talentReady) {
                        const followUpAction: any = {
                            type: 'FOLLOW_UP_ATTACK',
                            sourceId: sourceUnitId,
                            // AoE攻撃のため、実行時に生存している敵全員が対象となる。
                            // ここでのターゲット指定は便宜上のもの。
                            targetId: newState.registry.getAliveEnemies()[0]?.id,
                        };

                        newState = {
                            ...newState,
                            pendingActions: [...newState.pendingActions, followUpAction]
                        };

                        // エフェクトを削除（使用済み）
                        newState = removeEffect(newState, sourceAlly.id, talentReadyEffectId);
                    }
                }
            }

            // Trace 1: DMG Boost after Talent
            if (event.type === 'ON_FOLLOW_UP_ATTACK' && event.sourceId === sourceUnitId) {
                const trace1 = tribbieUnit.traces?.find(t => t.id === 'tribbie-trace-1');
                if (trace1) {
                    const buffId = `tribbie-trace1-${sourceUnitId}`;
                    const existingBuff = tribbieUnit.effects.find(e => e.id === buffId);
                    let stackCount = (existingBuff as any)?.stackCount || 0;
                    if (stackCount < 3) stackCount++;

                    const buff: IEffect = {
                        id: buffId,
                        name: '形跡 1 ダメージアップ',
                        category: 'BUFF',
                        sourceUnitId: sourceUnitId,
                        durationType: 'TURN_END_BASED',
                        skipFirstTurnDecrement: true,
                        duration: 3,
                        onApply: (t, s) => {
                            // Remove old modifier if exists to update value
                            const cleanModifiers = t.modifiers.filter(m => m.source !== '形跡 1 ダメージアップ');
                            const newModifiers = [...cleanModifiers, {
                                source: '形跡 1 ダメージアップ',
                                target: 'all_type_dmg_boost' as StatKey,
                                type: 'add' as const,
                                value: TRACE1_DMG_BOOST_PER_STACK  // stackCountによる自動乗算
                            }];
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                            };
                        },
                        onRemove: (t, s) => {
                            const newModifiers = t.modifiers.filter(m => m.source !== '形跡 1 ダメージアップ');
                            return {
                                ...s,
                                registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                            };
                        },

                        /* remove removed */
                    };
                    (buff as any).stackCount = stackCount; // Hack to store stack count

                    newState = addEffect(newState, sourceUnitId, buff);
                }
            }

            // 敵生成時: 結界が存在する場合、新規敵に被ダメージ増加デバフを付与
            if (event.type === 'ON_ENEMY_SPAWNED' && event.targetId) {
                const currentTribbie = newState.registry.get(createUnitId(sourceUnitId));
                if (currentTribbie) {
                    const fieldEffectId = `tribbie-field-${sourceUnitId}`;
                    const hasField = currentTribbie.effects.find(e => e.id === fieldEffectId);

                    if (hasField) {
                        const newEnemy = newState.registry.get(createUnitId(event.targetId));
                        if (newEnemy && newEnemy.isEnemy && newEnemy.hp > 0) {
                            const vulnDebuff: IEffect = {
                                id: `tribbie-field-vuln-${sourceUnitId}-${newEnemy.id}`,
                                name: '結界: 被ダメージ増加',
                                category: 'DEBUFF',
                                sourceUnitId: sourceUnitId,
                                durationType: 'LINKED',
                                duration: 0,
                                linkedEffectId: fieldEffectId,
                                modifiers: [{
                                    source: '結界: 被ダメージ増加',
                                    target: 'all_type_vuln' as StatKey,
                                    type: 'add' as const,
                                    value: 0.30
                                }],
                                onApply: (t, s) => {
                                    const newModifiers = [...t.modifiers, {
                                        source: '結界: 被ダメージ増加',
                                        target: 'all_type_vuln' as StatKey,
                                        type: 'add' as const,
                                        value: 0.30
                                    }];
                                    return {
                                        ...s,
                                        registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                                    };
                                },
                                onRemove: (t, s) => {
                                    const newModifiers = t.modifiers.filter(m => m.source !== '結界: 被ダメージ増加');
                                    return {
                                        ...s,
                                        registry: s.registry.update(createUnitId(t.id), u => ({ ...u, modifiers: newModifiers }))
                                    };
                                },

                                /* remove removed */
                            };
                            newState = addEffect(newState, newEnemy.id, vulnDebuff);
                        }
                    }
                }
            }

            return newState;
        }
    };
};
