import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, IEvent, GameState, DoTDamageEvent } from '../../simulator/engine/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createCharacterShockEffect } from '../../simulator/effect/breakEffects';
import { calculateNormalDoTDamage } from '../../simulator/damage';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';

export const kafka: Character = {
    id: 'kafka',
    name: 'カフカ',
    path: 'Nihility',
    element: 'Lightning',
    rarity: 5,
    maxEnergy: 120,
    baseStats: {
        hp: 1086,
        atk: 679,
        def: 485,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 100
    },

    abilities: {
        basic: {
            id: 'kafka-basic',
            name: '止まない夜の喧騒',
            type: 'Basic ATK',
            description: '指定した敵単体にカフカの攻撃力の100%分の雷属性ダメージを与える。',
            damage: {
                type: 'simple',
                multiplier: 1.0,
                scaling: 'atk'
            },
            energyGain: 20,
            toughnessReduction: 10,
            hits: 2,
            targetType: 'single_enemy',
        },

        skill: {
            id: 'kafka-skill',
            name: '月明かりが撫でる連綿',
            type: 'Skill',
            description: '指定した敵単体にカフカの攻撃力の160%分の雷属性ダメージを与え、隣接する敵にカフカの攻撃力の60%分の雷属性ダメージを与える。DoT状態の敵には全DoTを起爆。',
            damage: {
                type: 'blast',
                mainMultiplier: 1.6,
                adjacentMultiplier: 0.6,
                scaling: 'atk'
            },
            energyGain: 30,
            toughnessReduction: { main: 20, adjacent: 10 },
            //spCost: 1,
            hits: 1,
            targetType: 'blast',
        },

        ultimate: {
            id: 'kafka-ultimate',
            name: '悲劇最果ての顫音',
            type: 'Ultimate',
            description: '敵全体にカフカの攻撃力の80%分の雷属性ダメージを与え、感電状態にし、DoTを起爆。',
            damage: {
                type: 'simple',
                multiplier: 0.8,
                scaling: 'atk'
            },
            energyGain: 5,
            toughnessReduction: 20,
            hits: 1,
            targetType: 'all_enemies',
            effects: [{
                type: 'Shock',
                baseChance: 1.0,
                target: 'target',
                duration: 2
            }]
        },

        talent: {
            id: 'kafka-talent',
            name: '優しさもまた残酷',
            type: 'Talent',
            description: '味方が通常攻撃を行った後、追加攻撃を発動（1ターンに1回）。',
            damage: {
                type: 'simple',
                multiplier: 1.4,
                scaling: 'atk'
            },
            energyGain: 10,
            toughnessReduction: 10,
            hits: 6,
            targetType: 'single_enemy',
            effects: [{
                type: 'Shock',
                baseChance: 1.0,
                target: 'target',
                duration: 2
            }]
        },

        technique: {
            id: 'kafka-technique',
            name: '許しは慈悲に非ず',
            type: 'Technique',
            description: '戦闘開始時、敵全体にダメージを与え感電状態にする。',
            toughnessReduction: 20
        }
    },

    traces: [
        {
            id: 'kafka-trace-torture',
            name: '苛み',
            type: 'Bonus Ability',
            description: '味方の効果命中が75%以上の場合、その味方の攻撃力を100%アップさせる。'
        },
        {
            id: 'kafka-trace-plunder',
            name: '略奪',
            type: 'Bonus Ability',
            description: '感電状態の敵が倒された時、カフカはさらにEPを5回復する。'
        },
        {
            id: 'kafka-trace-thorns',
            name: 'いばら',
            type: 'Bonus Ability',
            description: '必殺技を発動した後、天賦による追加攻撃の発動可能回数を1回復する。天賦による追加攻撃を行うと、ターゲット付与されたすべての持続ダメージ系デバフが、即座に本来のダメージ80%分のダメージを発生させる。'
        },
        {
            id: 'kafka-stat-atk',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct',
            value: 0.28
        },
        {
            id: 'kafka-stat-hit',
            name: '効果命中',
            type: 'Stat Bonus',
            description: '効果命中+18.0%',
            stat: 'effect_hit_rate',
            value: 0.18
        },
        {
            id: 'kafka-stat-hp',
            name: 'HP',
            type: 'Stat Bonus',
            description: 'HP+10.0%',
            stat: 'hp_pct',
            value: 0.10
        }
    ],

    eidolons: {
        e1: {
            level: 1,
            name: '無窮に動く！',
            description: '天賦による追加攻撃を行う時、100%の基礎確率でターゲットの受ける持続ダメージ+30%、2ターン継続。'
        },
        e2: {
            level: 2,
            name: '狂想者の嗚咽',
            description: 'カフカがフィールド上にいる時、味方全体の持続ダメージ+33%。'
        },
        e3: {
            level: 3,
            name: '悲しき望郷の歌',
            description: '戦闘スキルのLv.+2、最大Lv.15まで。通常攻撃のLv.+1、最大Lv.10まで。',
            abilityModifiers: [
                { abilityName: 'skill', param: 'damage.mainMultiplier', value: 1.76 },
                { abilityName: 'skill', param: 'damage.adjacentMultiplier', value: 0.66 },
                { abilityName: 'basic', param: 'damage.multiplier', value: 1.10 }
            ]
        },
        e4: {
            level: 4,
            name: 'この叙唱を',
            description: 'カフカが敵に付与した感電状態がダメージが発生する時、カフカのEPをさらに2回復する。'
        },
        e5: {
            level: 5,
            name: '響く愁緒の囁き',
            description: '必殺技のLv.+2、最大Lv.15まで。天賦のLv.+2、最大Lv.15まで。',
            abilityModifiers: [
                { abilityName: 'ultimate', param: 'damage.multiplier', value: 0.86 },
                { abilityName: 'talent', param: 'damage.multiplier', value: 1.59 }
            ]
        },
        e6: {
            level: 6,
            name: '回る、静かに',
            description: '必殺技、秘技、天賦による追加攻撃が敵に付与する感電状態のダメージ倍率+156%、感電状態の継続時間+1ターン。'
        }
    }
};

// DoT起爆関数（ターン数は減少させない）
function detonateDoTs(
    state: GameState,
    targetId: string,
    detonateMultiplier: number,
    sourceId: string
): { state: GameState; totalDamage: number } {
    const target = state.units.find(u => u.id === targetId);
    if (!target) return { state, totalDamage: 0 };

    const sourceUnit = state.units.find(u => u.id === sourceId);
    if (!sourceUnit) return { state, totalDamage: 0 };

    let totalDamage = 0;
    let dotCount = 0;

    // 全てのDoTエフェクトを検索してダメージを合計
    target.effects.forEach(effect => {
        // DoT系のエフェクトタイプをチェック
        // 新しいDoTシステム: type === 'DoT'
        // 古いシステム（互換性のため）: type === 'Shock' etc.
        if ((effect as any).type === 'DoT' ||
            (effect as any).type === 'Shock' ||
            (effect as any).type === 'Bleed' ||
            (effect as any).type === 'Burn' ||
            (effect as any).type === 'Wind Shear') {

            dotCount++;
            console.log(`[detonateDoTs] Processing DoT #${dotCount}: ${(effect as any).name || effect.id}, ID: ${effect.id}`);

            // DoTの基礎ダメージを取得
            let baseDamage = 0;
            if ((effect as any).type === 'DoT') {
                // 新システム: 計算タイプに応じて処理
                const dotEffect = effect as any;
                if (dotEffect.damageCalculation === 'multiplier') {
                    // キャラクターDoT: 倍率 × 現在のATK
                    const multiplier = dotEffect.multiplier || 0;
                    baseDamage = sourceUnit.stats.atk * multiplier;
                } else {
                    // 弱点撃破DoT: 固定ダメージ
                    baseDamage = dotEffect.baseDamage || 0;
                }
            } else {
                // 旧システム（互換性）: baseDamageを直接使用
                baseDamage = (effect as any).baseDamage || 0;
            }

            // ★calculateNormalDoTDamageを使用（キャラクター由来の持続ダメージ）
            const dotDamage = calculateNormalDoTDamage(sourceUnit, target, baseDamage);

            // 起爆倍率を適用
            const detonateDamage = dotDamage * detonateMultiplier;
            console.log(`[detonateDoTs] DoT #${dotCount}: dotDamage=${dotDamage.toFixed(2)}, multiplier=${detonateMultiplier}, detonateDamage=${detonateDamage.toFixed(2)}`);
            totalDamage += detonateDamage;

            // ★ ターン数は減少させない
        }
    });

    console.log(`[detonateDoTs] Total DoT count: ${dotCount}, totalDamage: ${totalDamage.toFixed(2)}`);

    // ★applyUnifiedDamageを使用してダメージを適用
    if (totalDamage > 0) {
        const result = applyUnifiedDamage(
            state,
            sourceUnit,
            state.units.find(u => u.id === targetId)!,
            totalDamage,
            {
                damageType: 'DOT_DETONATE',
                details: `DoT起爆 (${(detonateMultiplier * 100).toFixed(0)}%)`,
                skipLog: false,  // ログを記録
                skipStats: false  // 統計を更新
            }
        );

        return { state: result.state, totalDamage };
    }

    return { state, totalDamage: 0 };
}

export const kafkaHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
    return {
        handlerMetadata: {
            id: `kafka-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_BASIC_ATTACK',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_TURN_START',
                'ON_DAMAGE_DEALT',  // 追加: 天賦追加攻撃のトリガー
                'ON_FOLLOW_UP_ATTACK',  // 追加: 追加攻撃後の処理
                'ON_DOT_DAMAGE'
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const kafkaUnit = state.units.find(u => u.id === sourceUnitId);
            if (!kafkaUnit) return state;

            let newState = state;

            // 戦闘開始時: 秘技 + 天賦エフェクト + 苛み
            if (event.type === 'ON_BATTLE_START') {
                // 秘技: 敵全体に感電を付与
                const enemies = newState.units.filter(u => u.isEnemy && u.hp > 0);
                enemies.forEach(enemy => {
                    // E5/E6による倍率調整
                    let multiplier = 2.9;
                    if (eidolonLevel >= 5) multiplier = 3.18;
                    if (eidolonLevel >= 6) multiplier += 1.56;

                    // E6による継続時間調整
                    const duration = eidolonLevel >= 6 ? 3 : 2;

                    const shockEffect = createCharacterShockEffect(
                        kafkaUnit,
                        enemy,
                        multiplier,
                        duration
                    );
                    console.log(`[Kafka Technique] Applying Shock to ${enemy.name}: duration=${duration}, effect.duration=${shockEffect.duration}`);
                    newState = addEffect(newState, enemy.id, shockEffect);
                });

                // 秘技ダメージ
                enemies.forEach(enemy => {
                    const techDamage = kafkaUnit.stats.atk * 0.5;
                    const newHp = Math.max(0, enemy.hp - techDamage);
                    newState = {
                        ...newState,
                        units: newState.units.map(u => u.id === enemy.id ? { ...u, hp: newHp } : u)
                    };

                    // ログに記録
                    newState = {
                        ...newState,
                        log: [...newState.log, {
                            characterName: kafkaUnit.name,
                            actionTime: newState.time,
                            actionType: 'TECHNIQUE',
                            skillPointsAfterAction: newState.skillPoints,
                            damageDealt: techDamage,
                            healingDone: 0,
                            shieldApplied: 0,
                            sourceHpState: `${kafkaUnit.hp.toFixed(0)}/${kafkaUnit.stats.hp.toFixed(0)}`,
                            targetHpState: `${newHp.toFixed(0)}/${enemy.stats.hp.toFixed(0)}`,
                            targetToughness: '',
                            currentEp: kafkaUnit.ep,
                            activeEffects: [],
                            details: `秘技: ${enemy.name}に${techDamage.toFixed(0)}ダメージ`
                        } as any]
                    };
                });

                // 天賦追加攻撃エフェクトを作成
                const talentCharges: IEffect = {
                    id: `kafka-talent-charges-${sourceUnitId}`,
                    name: '追加攻撃 (2回)',
                    category: 'BUFF',
                    sourceUnitId: sourceUnitId,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 2,  // 変更: 1 → 2
                    maxStacks: 2,  // 最大2スタックまで
                    onApply: (t: any, s: any) => s,
                    onRemove: (t: any, s: any) => s,
                    apply: (t: any, s: any) => s,
                    remove: (t: any, s: any) => s
                };
                console.log(`[Kafka Talent] Creating talent charges on BATTLE_START for ${sourceUnitId}`);
                newState = addEffect(newState, sourceUnitId, talentCharges);

                // 苛み: 効果命中75%以上の味方にATKバフ
                const tortureTrace = kafkaUnit.traces?.find(t => t.id === 'kafka-trace-torture');
                if (tortureTrace) {
                    newState.units.forEach(ally => {
                        if (!ally.isEnemy && ally.hp > 0) {
                            const effectHit = ally.stats.effect_hit_rate || 0;
                            if (effectHit >= 0.75) {
                                const tortureBuff: IEffect = {
                                    id: `kafka-torture-buff-${sourceUnitId}-${ally.id}`,
                                    name: '苛み (ATK+100%)',
                                    category: 'BUFF',
                                    sourceUnitId: sourceUnitId,
                                    durationType: 'PERMANENT',
                                    duration: 0,
                                    onApply: (t, s) => {
                                        const newModifiers = [...t.modifiers, {
                                            source: 'Kafka Torture',
                                            target: 'atk_pct' as StatKey,
                                            type: 'add' as const,
                                            value: 1.0
                                        }];
                                        return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                                    },
                                    onRemove: (t, s) => {
                                        const newModifiers = t.modifiers.filter(m => m.source !== 'Kafka Torture');
                                        return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                                    },
                                    apply: (t, s) => s,
                                    remove: (t, s) => s
                                };
                                newState = addEffect(newState, ally.id, tortureBuff);
                            }
                        }
                    });
                }

                return newState;
            }

            // カフカの通常攻撃後: スタック数+1
            if (event.type === 'ON_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
                console.log(`[Kafka Talent] ON_BASIC_ATTACK for ${sourceUnitId}, increasing talent charges`);
                const currentKafka = newState.units.find(u => u.id === sourceUnitId);
                if (currentKafka) {
                    const talentCharges = currentKafka.effects.find(e => e.id === `kafka-talent-charges-${sourceUnitId}`);
                    if (talentCharges) {
                        const newStackCount = Math.min((talentCharges.stackCount || 0) + 1, 2);  // 上限2
                        const updatedEffect = {
                            ...talentCharges,
                            stackCount: newStackCount,
                            name: `追加攻撃 (${newStackCount}回)`
                        };
                        const updatedKafka = {
                            ...currentKafka,
                            effects: currentKafka.effects.map(e => e.id === talentCharges.id ? updatedEffect : e)
                        };
                        newState = {
                            ...newState,
                            units: newState.units.map(u => u.id === sourceUnitId ? updatedKafka : u)
                        };
                        console.log(`[Kafka Talent] Talent charges increased to ${newStackCount} (Basic Attack)`);
                    }
                }
            }

            // カフカのスキル使用後: スタック数+1
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                console.log(`[Kafka Talent] ON_SKILL_USED for ${sourceUnitId}, increasing talent charges`);
                const currentKafka = newState.units.find(u => u.id === sourceUnitId);
                if (currentKafka) {
                    const talentCharges = currentKafka.effects.find(e => e.id === `kafka-talent-charges-${sourceUnitId}`);
                    if (talentCharges) {
                        const newStackCount = Math.min((talentCharges.stackCount || 0) + 1, 2);  // 上限2
                        const updatedEffect = {
                            ...talentCharges,
                            stackCount: newStackCount,
                            name: `追加攻撃 (${newStackCount}回)`
                        };
                        const updatedKafka = {
                            ...currentKafka,
                            effects: currentKafka.effects.map(e => e.id === talentCharges.id ? updatedEffect : e)
                        };
                        newState = {
                            ...newState,
                            units: newState.units.map(u => u.id === sourceUnitId ? updatedKafka : u)
                        };
                        console.log(`[Kafka Talent] Talent charges increased to ${newStackCount} (Skill)`);
                    }
                }
            }

            // 必殺技使用時: DoT起爆 + いばら
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                // 敵全体に120%起爆
                const enemies = newState.units.filter(u => u.isEnemy && u.hp > 0);
                enemies.forEach(enemy => {
                    const { state: afterDetonate } = detonateDoTs(newState, enemy.id, 1.2, sourceUnitId);
                    newState = afterDetonate;
                });

                // いばら: 天賦回数を+1
                const thornTrace = kafkaUnit.traces?.find(t => t.id === 'kafka-trace-thorns');
                if (thornTrace) {
                    const currentKafka = newState.units.find(u => u.id === sourceUnitId);
                    if (currentKafka) {
                        const talentCharges = currentKafka.effects.find(e => e.id === `kafka-talent-charges-${sourceUnitId}`);
                        if (talentCharges) {
                            const newStackCount = Math.min((talentCharges.stackCount || 0) + 1, 2);  // 上限2
                            const updatedEffect = {
                                ...talentCharges,
                                stackCount: newStackCount,
                                name: `追加攻撃 (${newStackCount}回)`
                            };

                            const updatedKafka = {
                                ...currentKafka,
                                effects: currentKafka.effects.map(e => e.id === talentCharges.id ? updatedEffect : e)
                            };

                            newState = {
                                ...newState,
                                units: newState.units.map(u => u.id === sourceUnitId ? updatedKafka : u)
                            };
                        }
                    }
                }
            }

            // 味方の通常攻撃後: 天賦追加攻撃（pendingActionsに追加）
            if (event.type === 'ON_DAMAGE_DEALT') {
                console.log(`[Kafka Talent] ON_DAMAGE_DEALT event: sourceId=${event.sourceId}, kafkaId=${sourceUnitId}`);
                const sourceUnit = newState.units.find(u => u.id === event.sourceId);
                if (sourceUnit && !sourceUnit.isEnemy && event.sourceId !== sourceUnitId) {
                    console.log(`[Kafka Talent] Ally attack detected: ${sourceUnit.name}`);
                    // 天賦エフェクトを確認
                    const currentKafka = newState.units.find(u => u.id === sourceUnitId);
                    if (currentKafka) {
                        const talentCharges = currentKafka.effects.find(e => e.id === `kafka-talent-charges-${sourceUnitId}`);
                        console.log(`[Kafka Talent] Talent charges found:`, talentCharges ? `stackCount=${talentCharges.stackCount}` : 'NOT FOUND');
                        if (talentCharges && (talentCharges.stackCount || 0) > 0) {
                            // 追加攻撃をpendingActionsに追加（即座に実行しない）
                            const targetId = (event as any).targetId;
                            if (targetId) {
                                const followUpAction: any = {
                                    type: 'FOLLOW_UP_ATTACK',
                                    sourceId: sourceUnitId,
                                    targetId: targetId,
                                    eidolonLevel: eidolonLevel  // E5でtalent.damageを調整するために渡す
                                };

                                console.log(`[Kafka Talent] Adding follow-up attack to pendingActions`);

                                // スタック数を減らす
                                const newStackCount = (talentCharges.stackCount || 0) - 1;
                                const updatedEffect = {
                                    ...talentCharges,
                                    stackCount: newStackCount,
                                    name: `追加攻撃 (${newStackCount}回)`
                                };

                                const updatedKafka = {
                                    ...currentKafka,
                                    effects: currentKafka.effects.map(e => e.id === talentCharges.id ? updatedEffect : e)
                                };

                                newState = {
                                    ...newState,
                                    units: newState.units.map(u => u.id === sourceUnitId ? updatedKafka : u),
                                    pendingActions: [...newState.pendingActions, followUpAction]
                                };
                            }
                        }
                    }
                }
            }

            // 追加攻撃実行後: 感電付与とDoT起爆
            if (event.type === 'ON_FOLLOW_UP_ATTACK' && event.sourceId === sourceUnitId) {
                console.log(`[Kafka Talent] ON_FOLLOW_UP_ATTACK for ${sourceUnitId}`);
                const targetId = (event as any).targetId;
                if (targetId) {
                    const target = newState.units.find(u => u.id === targetId);
                    const currentKafka = newState.units.find(u => u.id === sourceUnitId);
                    if (target && currentKafka) {
                        // 感電を付与
                        // E5/E6による倍率調整
                        let multiplier = 2.9;
                        if (eidolonLevel >= 5) multiplier = 3.18;
                        if (eidolonLevel >= 6) multiplier += 1.56;

                        // E6による継続時間調整
                        const duration = eidolonLevel >= 6 ? 3 : 2;

                        const shockEffect = createCharacterShockEffect(
                            currentKafka,
                            target,
                            multiplier,
                            duration
                        );
                        newState = addEffect(newState, targetId, shockEffect);
                        console.log(`[Kafka Talent] Applied Shock to ${target.name}`);

                        // E1: 受DoT+30%
                        if (eidolonLevel >= 1) {
                            const dotVulnDebuff: IEffect = {
                                id: `kafka-e1-dotvuln-${sourceUnitId}-${targetId}`,
                                name: '受DoT+30%',
                                category: 'DEBUFF',
                                sourceUnitId: sourceUnitId,
                                durationType: 'TURN_START_BASED',
                                duration: 2,
                                onApply: (t, s) => {
                                    const newModifiers = [...t.modifiers, {
                                        source: 'Kafka E1',
                                        target: 'dot_taken' as StatKey,
                                        type: 'add' as const,
                                        value: 0.30
                                    }];
                                    return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                                },
                                onRemove: (t, s) => {
                                    const newModifiers = t.modifiers.filter(m => m.source !== 'Kafka E1');
                                    return { ...s, units: s.units.map(u => u.id === t.id ? { ...u, modifiers: newModifiers } : u) };
                                },
                                apply: (t, s) => s,
                                remove: (t, s) => s
                            };
                            newState = addEffect(newState, targetId, dotVulnDebuff);
                            console.log(`[Kafka Talent] Applied E1 DoT Vulnerability to ${target.name}`);
                        }

                        // いばら: DoT起爆80%
                        const thornTrace = kafkaUnit.traces?.find(t => t.id === 'kafka-trace-thorns');
                        if (thornTrace) {
                            console.log(`[Kafka Talent] Detonating DoTs (80%)`);
                            const { state: afterDetonate } = detonateDoTs(newState, targetId, 0.80, sourceUnitId);
                            newState = afterDetonate;
                        }
                    }
                }
            }

            // E4: 感電ダメージ発生時のEP回復
            if (event.type === 'ON_DOT_DAMAGE' && eidolonLevel >= 4) {
                const dotEvent = event as DoTDamageEvent;

                // カフカが付与した感電のみ処理
                if (dotEvent.sourceId === sourceUnitId && dotEvent.dotType === 'Shock') {
                    const currentKafka = newState.units.find(u => u.id === sourceUnitId);
                    if (currentKafka) {
                        const newEp = Math.min(currentKafka.ep + 2, currentKafka.stats.max_ep || 120);
                        newState = {
                            ...newState,
                            units: newState.units.map(u =>
                                u.id === sourceUnitId ? { ...u, ep: newEp } : u
                            )
                        };
                    }
                }
            }

            return newState;
        }
    };
};
