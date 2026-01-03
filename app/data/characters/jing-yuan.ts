import { Character, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, GeneralEvent, ActionEvent, Unit } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage, publishEvent } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { createSummon, getActiveSummon, insertSummonAfterOwner } from '../../simulator/engine/summonManager';
import { FinalStats } from '../../types/stats';
import { calculateDamageWithCritInfo } from '../../simulator/damage';

// --- 定数 ---
const CHAR_ID = 'jing-yuan';
const LL_ID_SUFFIX = 'lightning-lord'; // 完全なID: jing-yuan-lightning-lord-{ownerId} (ownerIdが 'jing-yuan-1' の可能性があるため、接尾辞を追加)

const EFFECT_IDS = {
    LL_STACKS: 'jing-yuan-ll-stacks', // 神君ユニット上のスタック
    A2_CRIT_DMG: 'jing-yuan-a2-crit-dmg', // 神君ユニット上。神君の次のターンの会心ダメージ+25%
    A6_CRIT_RATE: 'jing-yuan-a6-crit-rate', // 景元上
    E2_DMG_BUFF: 'jing-yuan-e2-dmg-buff', // 景元上
    E6_VULN: 'jing-yuan-e6-vuln', // 敵上
};

const TRACE_IDS = {
    A2_BATTLIA_CRUSH: 'jing-yuan-a2',
    A4_SAVANT_PROVIDENCE: 'jing-yuan-a4',
    A6_WAR_MARSHAL: 'jing-yuan-a6',
};

const ABILITY_VALUES = {
    basicDmg: { 6: 1.0, 7: 1.1 } as Record<number, number>,
    skillDmg: { 10: 1.0, 12: 1.1 } as Record<number, number>,
    ultDmg: { 10: 2.0, 12: 2.16 } as Record<number, number>,
    llDmgMain: { 10: 0.66, 12: 0.726 } as Record<number, number>,
    llDmgAdjRatio: 0.25,
};

const LL_BASE_SPD = 60;
const LL_SPD_PER_STACK = 10;
const LL_BASE_STACKS = 3;
const LL_MAX_STACKS = 10;

// デフォルトステータスヘルパー
const DEFAULT_STATS: FinalStats = {
    hp: 1, atk: 0, def: 0, spd: 60, crit_rate: 0, crit_dmg: 0, aggro: 0,
    hp_pct: 0, atk_pct: 0, def_pct: 0, spd_pct: 0,
    break_effect: 0, effect_hit_rate: 0, effect_res: 0,
    energy_regen_rate: 1.0, max_ep: 0,
    outgoing_healing_boost: 0, incoming_heal_boost: 0,
    shield_strength_boost: 0,
    physical_dmg_boost: 0, fire_dmg_boost: 0, ice_dmg_boost: 0, lightning_dmg_boost: 0, wind_dmg_boost: 0, quantum_dmg_boost: 0, imaginary_dmg_boost: 0,
    all_type_dmg_boost: 0,
    physical_res_pen: 0, fire_res_pen: 0, ice_res_pen: 0, lightning_res_pen: 0, wind_res_pen: 0, quantum_res_pen: 0, imaginary_res_pen: 0,
    all_type_res_pen: 0,
    physical_res: 0, fire_res: 0, ice_res: 0, lightning_res: 0, wind_res: 0, quantum_res: 0, imaginary_res: 0,
    crowd_control_res: 0,
    bleed_res: 0, burn_res: 0, frozen_res: 0, shock_res: 0, wind_shear_res: 0, entanglement_res: 0, imprisonment_res: 0,
    all_type_vuln: 0, break_dmg_taken: 0, dot_dmg_taken: 0,
    physical_vuln: 0, fire_vuln: 0, ice_vuln: 0, lightning_vuln: 0, wind_vuln: 0, quantum_vuln: 0, imaginary_vuln: 0,
    def_reduction: 0, def_ignore: 0,
    break_efficiency_boost: 0, break_dmg_boost: 0, super_break_dmg_boost: 0,
    fua_dmg_boost: 0, fua_crit_dmg: 0, fua_vuln: 0, dot_dmg_boost: 0, dot_def_ignore: 0,
    all_dmg_dealt_reduction: 0, dmg_taken_reduction: 0,
    basic_atk_dmg_boost: 0, skill_dmg_boost: 0, ult_dmg_boost: 0
};

// --- ヘルパー関数 ---

function getLightningLordId(ownerId: string): string {
    return `${ownerId}-${LL_ID_SUFFIX}`;
}

// スタック数に基づいて神君の速度を計算するヘルパー
function calculateLightningLordSpeed(stacks: number): number {
    return LL_BASE_SPD + (stacks * LL_SPD_PER_STACK);
}

// 神君のスタックと速度を更新
function updateLightningLordStacks(state: GameState, ownerId: string, amount: number): GameState {
    let newState = state;
    const llId = getLightningLordId(ownerId);
    const llUnit = newState.registry.get(createUnitId(llId));

    // 神君が存在しない場合、無視するかエラーログを出力するかも？通常は戦闘開始時に作成される。
    if (!llUnit) return newState;

    const currentStackEffect = llUnit.effects.find(e => e.id === EFFECT_IDS.LL_STACKS);
    const currentStacks = currentStackEffect ? (currentStackEffect.stackCount || LL_BASE_STACKS) : LL_BASE_STACKS;

    let newStacks = currentStacks + amount;
    if (newStacks > LL_MAX_STACKS) newStacks = LL_MAX_STACKS;
    if (newStacks < LL_BASE_STACKS) newStacks = LL_BASE_STACKS; // 通常は3にリセットされるが、ロジックで減算する可能性があるか？いいえ、リセットで処理されます。

    // 新しい速度を計算
    const oldSpd = calculateLightningLordSpeed(currentStacks);
    const newSpd = calculateLightningLordSpeed(newStacks);
    const spdDiff = newSpd - oldSpd;

    const speedBonus = (newStacks - 3) * 10;

    // 効果を更新
    if (currentStackEffect) {
        newState = removeEffect(newState, llUnit.id, EFFECT_IDS.LL_STACKS);
    }

    const finalStackEffect: IEffect = {
        id: EFFECT_IDS.LL_STACKS,
        name: `攻撃段数 (${newStacks})`,
        category: 'BUFF',
        sourceUnitId: ownerId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: newStacks,
        modifiers: [
            { source: 'Lightning-Lord Stacks', target: 'spd', type: 'add', value: speedBonus, scalingStrategy: 'fixed' }
        ],

        /* remove removed */
    };

    newState = addEffect(newState, llUnit.id, finalStackEffect);

    // A2: If stacks >= 6, apply Crit DMG Buff (Duration 1)
    // Applied to LL. Expires at end of LL's turn.
    const owner = newState.registry.get(createUnitId(ownerId));

    if (owner && owner.traces?.some(t => t.id === TRACE_IDS.A2_BATTLIA_CRUSH) && newStacks >= 6) {
        // Remove existing A2 buff if any to refresh/ensure correct state
        if (llUnit.effects.some(e => e.id === EFFECT_IDS.A2_CRIT_DMG)) {
            newState = removeEffect(newState, llUnit.id, EFFECT_IDS.A2_CRIT_DMG);
        }

        const a2Buff: IEffect = {
            id: EFFECT_IDS.A2_CRIT_DMG,
            name: 'A2: 会心ダメージ上昇',
            category: 'BUFF',
            sourceUnitId: ownerId,
            durationType: 'TURN_END_BASED',
            duration: 1,
            modifiers: [
                { source: 'A2', target: 'crit_dmg', type: 'add', value: 0.25 }
            ],

            /* remove removed */
        };
        newState = addEffect(newState, llUnit.id, a2Buff);
    }

    return newState;
}

// Create and Register Lightning-Lord
function spawnLightningLord(state: GameState, ownerId: string, eidolonLevel: number): GameState {
    let newState = state;
    const owner = newState.registry.get(createUnitId(ownerId));
    if (!owner) return newState;

    const llId = getLightningLordId(ownerId);

    // 既に存在するか確認
    if (getActiveSummon(newState, ownerId, CHAR_ID)) return newState;

    // 神君ユニットを定義 (summonManager の標準パターン)
    const llUnit = createSummon(owner, {
        idPrefix: CHAR_ID,
        name: '神君',
        element: 'Lightning',
        baseStats: {
            ...DEFAULT_STATS,
            spd: LL_BASE_SPD,
        } as FinalStats,
        baseSpd: LL_BASE_SPD,
        abilities: {
            basic: { id: 'll-attack', name: 'Lightning-Lord Attack', type: 'Talent', description: '' },
            skill: { id: 'll-skill', name: 'Lightning-Lord Skill', type: 'Talent', description: '' },
            ultimate: { id: 'll-ult', name: 'Lightning-Lord Ult', type: 'Talent', description: '' },
            talent: { id: 'll-talent', name: 'Lightning-Lord Talent', type: 'Talent', description: '' },
            technique: { id: 'll-tech', name: 'Lightning-Lord Tech', type: 'Technique', description: '' }
        },
        untargetable: true,
        debuffImmune: true
    });

    newState = {
        ...newState,
        registry: newState.registry.add(llUnit)
    };

    // オーナーの直後に挿入 (タイムライン管理の正確性向上)
    newState = insertSummonAfterOwner(newState, llUnit, ownerId);

    // スタックを初期化 (3)
    newState = updateLightningLordStacks(newState, ownerId, 0); // 3（基本）+ 0 効果に設定

    // A4: 戦闘開始時にEP15回復（景元）
    if (owner.traces?.some(t => t.id === TRACE_IDS.A4_SAVANT_PROVIDENCE)) {
        newState = addEnergyToUnit(newState, ownerId, 0, 15, false, { sourceId: ownerId, publishEventFn: publishEvent });
    }

    // 秘技: 最初のターンのスタック+3
    if (owner.config?.useTechnique !== false) {
        newState = updateLightningLordStacks(newState, ownerId, 3);
    }

    return newState;
}

// Lightning-Lord Attack Logic
function executeLightningLordAttack(state: GameState, llUnitId: string, ownerId: string, eidolonLevel: number): GameState {
    let newState = state;
    const llUnit = newState.registry.get(createUnitId(llUnitId));
    const owner = newState.registry.get(createUnitId(ownerId));
    if (!llUnit || !owner) return newState;

    // 行動制限デバフ（CC）を検証
    // ゲーム内: 景元がCC状態なら神君も実質的にCC状態。
    const isOwnerCC = owner.effects.some(e =>
        e.category === 'DEBUFF' && (
            e.name.includes('Freeze') || e.name.includes('Imprisonment') ||
            e.name.includes('Entanglement') || e.name.includes('Stun') ||
            e.name.includes('Dominated') || e.name.includes('Outrage') ||
            e.type === 'CrowdControl'
        )
    );

    if (isOwnerCC) {
        // Wiki: "神君のターンが来たときに景元がCC状態の場合、神君のターンはスキップされ攻撃しない。スタックはリセットされない。"
        return newState;
    }

    const stackEffect = llUnit.effects.find(e => e.id === EFFECT_IDS.LL_STACKS);
    const hits = stackEffect ? (stackEffect.stackCount || LL_BASE_STACKS) : LL_BASE_STACKS;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 5, 'Talent');
    const multiplierPerHit = getLeveledValue(ABILITY_VALUES.llDmgMain, talentLevel);

    // E6: メインターゲットへの脆弱付与
    const isE6 = (owner.eidolonLevel || 0) >= 6;

    const enemies = newState.registry.getAliveEnemies();
    if (enemies.length === 0) return newState;

    for (let i = 0; i < hits; i++) {
        // ランダムなターゲットを選択 (再現性が必要な場合はシード値を検討)
        const target = enemies[Math.floor(Math.random() * enemies.length)];
        if (!target) continue;

        if (isE6) {
            const e6Effect = target.effects.find(e => e.id === EFFECT_IDS.E6_VULN);
            const currentE6Stacks = e6Effect ? (e6Effect.stackCount || 0) : 0;
            if (currentE6Stacks < 3) {
                const newE6Stacks = currentE6Stacks + 1;
                const vulnEffect: IEffect = {
                    id: EFFECT_IDS.E6_VULN,
                    name: `E6脆弱(${newE6Stacks})`,
                    category: 'DEBUFF',
                    sourceUnitId: ownerId,
                    durationType: 'TURN_START_BASED',
                    duration: 1,
                    stackCount: newE6Stacks,
                    modifiers: [{ source: 'E6 Vulnerability', target: 'all_type_vuln' as StatKey, type: 'add', value: 0.12 * newE6Stacks }],

                    /* remove removed */
                };
                newState = addEffect(newState, target.id, vulnEffect);
            }
        }

        // E4: ヒットごとにEP回復
        if ((owner.eidolonLevel || 0) >= 4) {
            newState = addEnergyToUnit(newState, ownerId, 0, 2, false, { sourceId: ownerId, publishEventFn: publishEvent });
        }

        // A2: スタックが6以上の場合、このターンは会心ダメージ+25%
        const extraCritDmg = (owner.traces?.some(t => t.id === TRACE_IDS.A2_BATTLIA_CRUSH) && hits >= 6) ? 0.25 : 0;

        // ダメージ計算と適用
        const tempAbility: any = {
            damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: multiplierPerHit, toughnessReduction: 10 }] }
        };
        const { damage, isCrit, breakdownMultipliers } = calculateDamageWithCritInfo(
            owner,
            target,
            tempAbility,
            { type: 'FOLLOW_UP_ATTACK' } as any,
            { critDmg: extraCritDmg }
        );

        const damageResult = applyUnifiedDamage(newState, owner, target, damage, {
            damageType: 'Follow-up',
            details: `神君攻撃(${i + 1}/${hits})`,
            isCrit: isCrit,
            breakdownMultipliers: breakdownMultipliers
        });
        newState = damageResult.state;

        // 拡散（隣接）ダメージ
        const targetIndex = enemies.findIndex(e => e.id === target.id);
        const adjacentIndices = [targetIndex - 1, targetIndex + 1];

        adjacentIndices.forEach(idx => {
            if (idx >= 0 && idx < enemies.length) {
                const adjEnemy = enemies[idx];
                if (adjEnemy.hp > 0) {
                    let adjRatio = ABILITY_VALUES.llDmgAdjRatio; // 0.25
                    if ((owner.eidolonLevel || 0) >= 1) {
                        adjRatio += 0.25;
                    }

                    const adjDmgCalc = calculateDamageWithCritInfo(
                        owner,
                        adjEnemy,
                        { damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: multiplierPerHit * adjRatio, toughnessReduction: 0 }] } } as any,
                        { type: 'FOLLOW_UP_ATTACK' } as any,
                        { critDmg: extraCritDmg }
                    );

                    newState = applyUnifiedDamage(newState, owner, adjEnemy, adjDmgCalc.damage, {
                        damageType: 'Follow-up',
                        details: `神君拡散(${i + 1}/${hits})`,
                        isCrit: adjDmgCalc.isCrit,
                        breakdownMultipliers: adjDmgCalc.breakdownMultipliers
                    }).state;
                }
            }
        });
    }

    // スタックをリセット
    newState = updateLightningLordStacks(newState, ownerId, -100);

    // E2: 神君行動後、2ターンの間ダメージ+20%
    if ((owner.eidolonLevel || 0) >= 2) {
        const e2Buff: IEffect = {
            id: EFFECT_IDS.E2_DMG_BUFF,
            name: 'E2: 与ダメージ上昇',
            category: 'BUFF',
            sourceUnitId: ownerId,
            durationType: 'TURN_START_BASED',
            duration: 2,
            modifiers: [
                { source: 'E2', target: 'basic_atk_dmg_boost', type: 'add', value: 0.20 },
                { source: 'E2', target: 'skill_dmg_boost', type: 'add', value: 0.20 },
                { source: 'E2', target: 'ult_dmg_boost', type: 'add', value: 0.20 }
            ],

            /* remove removed */
        };
        newState = addEffect(newState, ownerId, e2Buff);
    }

    // 敵からE6脆弱をクリーンアップ
    if (isE6) {
        newState.registry.getAliveEnemies().forEach(e => {
            newState = removeEffect(newState, e.id, EFFECT_IDS.E6_VULN);
        });
    }

    return newState;
}

// --- ハンドラロジック ---

const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    return spawnLightningLord(state, sourceUnitId, eidolonLevel);
};

const onTurnStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    const llId = getLightningLordId(sourceUnitId);

    // 神君のターンの場合
    if (event.sourceId === llId) {
        // 攻撃を実行
        let newState = executeLightningLordAttack(state, llId, sourceUnitId, eidolonLevel);
        return newState;
    }

    // 景元のターンの場合（A2ロジックが単純ならここで処理できたが、A2は神君ターン時のスタックに依存する）
    return state;
};

const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;

    // ダメージを与える
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill'); // 最大10？仕様ではスキルE5で最大15
    const multiplier = getLeveledValue(ABILITY_VALUES.skillDmg, skillLevel);

    const targets = event.targetType === 'all_enemies' ? newState.registry.getAliveEnemies() :
        event.targetId ? [newState.registry.get(createUnitId(event.targetId))!] : [];

    targets.forEach(t => {
        const res = applyUnifiedDamage(newState, source, t, source.stats.atk * multiplier, {
            damageType: 'Skill',
            details: '紫霄の雷鳴',
            skipLog: true,
            skipStats: true,
            additionalDamageEntry: {
                source: source.name,
                name: '紫霄の雷鳴',
                damageType: 'additional'
            }
        });
        newState = res.state;
    });

    // スタック+2
    newState = updateLightningLordStacks(newState, sourceUnitId, 2);

    // A6: 2ターンの間、会心率+10%
    if (source.traces?.some(t => t.id === TRACE_IDS.A6_WAR_MARSHAL)) {
        const a6Buff: IEffect = {
            id: EFFECT_IDS.A6_CRIT_RATE,
            name: 'A6: 会心率上昇',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: 2,
            modifiers: [{ source: 'A6', target: 'crit_rate', type: 'add', value: 0.10 }],

            /* remove removed */
        };
        newState = addEffect(newState, sourceUnitId, a6Buff);
    }

    return newState;
};

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceUnitId));
    if (!source) return newState;

    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const multiplier = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);

    const targets = newState.registry.getAliveEnemies();
    targets.forEach(t => {
        const res = applyUnifiedDamage(newState, source, t, source.stats.atk * multiplier, {
            damageType: 'Ultimate',
            details: '我が身の輝き',
            skipLog: true,
            skipStats: true,
            additionalDamageEntry: {
                source: source.name,
                name: '我が身の輝き',
                damageType: 'additional'
            }
        });
        newState = res.state;
    });

    // スタック+3
    newState = updateLightningLordStacks(newState, sourceUnitId, 3);

    return newState;
};

const onUnitDeath = (event: GeneralEvent, state: GameState, sourceUnitId: string): GameState => {
    // 景元が戦闘不能になった場合、神君は消滅する
    if (event.targetId === sourceUnitId) { // ON_UNIT_DEATHにおいて、event.targetIdは死亡したユニットか？
        // イベント定義を確認。ON_UNIT_DEATHのsourceは恐らく死亡したユニット？
        // 型: targetId？ types.tsを再確認。
        // `export interface GeneralEvent ...type: 'ON_UNIT_DEATH'; targetId ?: string; `
        // 通常sourceIdはイベント発行者だが、死亡の場合は誰が発行する？

        // targetIdが死亡したユニットであると仮定。
        // 整合性のためにsourceIdも確認する。
        // より安全に：両方確認する。

        const isDead = event.targetId === sourceUnitId;
        if (isDead) {
            const llId = getLightningLordId(sourceUnitId);
            return {
                ...state,
                registry: state.registry.remove(createUnitId(llId))
            };
        }
    }
    return state;
}

export const jingYuanHandlerFactory: IEventHandlerFactory = (sourceUnitId: string, eidolonLevel: number) => {
    return {
        handlerMetadata: {
            id: `jing-yuan-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_UNIT_DEATH'
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            if (event.type === 'ON_BATTLE_START') return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_TURN_START') return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_UNIT_DEATH') return onUnitDeath(event as GeneralEvent, state, sourceUnitId);

            return state;
        }
    };
};

// --- キャラクター定義 ---

export const jingYuan: Character = {
    id: CHAR_ID,
    name: '景元',
    path: 'Erudition',
    element: 'Lightning',
    rarity: 5,
    maxEnergy: 130,
    baseStats: {
        hp: 1164,
        atk: 698,
        def: 485,
        spd: 99,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75,
    },
    abilities: {
        basic: {
            id: 'e-basic',
            name: '電光石火',
            type: 'Basic ATK',
            description: '単体攻撃。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk', // 拡散ロジックは以下のヒットを使用
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }] // 係数は必要ならハンドラで処理するが、通常攻撃はシンプル
            },
            energyGain: 20
        },
        skill: {
            id: 'e-skill',
            name: '紫霄の雷鳴',
            type: 'Skill',
            description: '全体攻撃。神君+2段。',
            targetType: 'all_enemies',
            energyGain: 30,
            effects: []
        },
        ultimate: {
            id: 'e-ultimate',
            name: '我が身の輝き',
            type: 'Ultimate',
            description: '全体攻撃。神君+3段。',
            targetType: 'all_enemies', // 自分？いいえ、敵にヒット。
            energyGain: 5,
            effects: []
        },
        talent: {
            id: 'e-talent',
            name: '退魔の形神',
            type: 'Talent',
            description: '神君を召喚する。',
            targetType: 'self'
        },
        technique: {
            id: 'e-technique',
            name: '摂召威霊',
            type: 'Technique',
            description: '神君の初期段数+3。'
        }
    },
    traces: [
        { id: TRACE_IDS.A2_BATTLIA_CRUSH, name: '破陣', type: 'Bonus Ability', description: '神君段数6以上で会心ダメ+25%' },
        { id: TRACE_IDS.A4_SAVANT_PROVIDENCE, name: '先見', type: 'Bonus Ability', description: '戦闘開始時EP15回復' },
        { id: TRACE_IDS.A6_WAR_MARSHAL, name: '遣将', type: 'Bonus Ability', description: 'スキル後会心率+10%' },
        // ステータスボーナスは簡潔さのために省略されているが、標準的なレイアウト
        { id: 'ji-stat-atk', name: '攻撃力', type: 'Stat Bonus', stat: 'atk_pct', value: 0.28, description: '攻撃力+28%' },
        { id: 'ji-stat-crit', name: '会心率', type: 'Stat Bonus', stat: 'crit_rate', value: 0.12, description: '会心率+12%' },
        { id: 'ji-stat-def', name: '防御力', type: 'Stat Bonus', stat: 'def_pct', value: 0.125, description: '防御力+12.5%' },
    ],
    eidolons: {
        e1: { level: 1, name: '流星雷霆 山をも砕く', description: '神君拡散ダメ倍率UP' },
        e2: { level: 2, name: '振るいし矛 地動かし天開く', description: '神君後、与ダメ+20%' },
        e3: { level: 3, name: '峰を移りし激雷 天穿つ', description: '必殺+2, 通常+1' },
        e4: { level: 4, name: '刃、雲を巻き 玉沙に落ちる', description: '神君攻撃毎にEP2回復' },
        e5: { level: 5, name: '百戦経て捨てし躯 生死軽んず', description: 'スキル+2, 天賦+2' },
        e6: { level: 6, name: '威光纏う神霊 敵屠る', description: '神君攻撃毎に敵へ被ダメデバフ' },
    },
    defaultConfig: {
        eidolonLevel: 0,
        lightConeId: 'before-dawn',
        superimposition: 1,
        relicSetIds: ['the-ashblazing-grand-duke', 'prisoner-in-deep-confinement'],
        ornamentSetId: 'inert-salsotto',
        mainStats: {
            body: 'crit_rate',
            feet: 'atk_pct', // 神君のSPDを景元が上げる必要がある場合もあるが、一般的には攻撃靴か速度靴。ここでは一旦攻撃靴。
            sphere: 'lightning_dmg_boost',
            rope: 'atk_pct'
        },
        subStats: [
            { stat: 'crit_rate', value: 0.10 },
            { stat: 'crit_dmg', value: 0.50 },
            { stat: 'atk_pct', value: 0.15 },
            { stat: 'spd', value: 10 },
        ],
        rotationMode: 'sequence',
        rotation: ['s'],
        ultStrategy: 'immediate',
    }
};
