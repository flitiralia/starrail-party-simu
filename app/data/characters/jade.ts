
import { Character, StatKey, SimulationLogEntry } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit, GeneralEvent, ActionEvent, BeforeDamageCalcEvent } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { getLeveledValue, calculateAbilityLevel } from '../../simulator/utils/abilityLevel';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';
import { createUnitId } from '../../simulator/engine/unitId';
import { advanceAction, delayAction } from '../../simulator/engine/utils';

// --- 定数定義 ---
const CHARACTER_ID = 'jade';

const EFFECT_IDS = {
    DEBT_COLLECTOR_TRACKER: 'jade-debt-collector-tracker', // ジェイド自身に付与（持続時間管理用）
    DEBT_COLLECTOR_BUFF: 'jade-debt-collector-buff',     // 味方に付与（効果用）
    PAWNED_ASSET: 'jade-pawned-asset',                   // 「質草」スタック
    BLIND_FEALTY: 'jade-blind-fealty',                   // 秘技「盲従」
    ULT_ENHANCE: 'jade-ult-enhance',                     // 必殺技による天賦強化
    CHARGE: 'jade-charge',                               // チャージ
    E4_DEF_IGNORE: 'jade-e4-def-ignore',                 // E4: 防御無視
    E1_DMG_BOOST: 'jade-e1-dmg-boost',                   // E1: 一時バフ
};

const TRACE_IDS = {
    A2_REVERSE_REPO: 'jade-trace-a2',
    A4_COLLATERAL: 'jade-trace-a4',
    A6_DEFECTED: 'jade-trace-a6',
};

// --- アビリティ値 (レベル別) ---
const ABILITY_VALUES = {
    // 通常攻撃: 単体倍率
    basicDmgMain: { 6: 0.90, 7: 0.99 } as Record<number, number>,
    // 通常攻撃: 隣接倍率
    basicDmgAdj: { 6: 0.30, 7: 0.33 } as Record<number, number>,

    // スキル: 付加ダメージ倍率, Lv10: 25%, Lv12: 27%
    skillAddDmg: { 10: 0.25, 12: 0.27 } as Record<number, number>,

    // 必殺技: 全体ダメージ倍率
    ultDmg: { 10: 2.40, 12: 2.64 } as Record<number, number>,
    // 必殺技: 天賦強化倍率
    ultEnhance: { 10: 0.80, 12: 0.88 } as Record<number, number>,

    // 天賦: 追加攻撃ダメージ倍率
    talentDmg: { 10: 1.20, 12: 1.32 } as Record<number, number>,
    // 天賦: 「質草」会心ダメージ上昇量
    talentCritDmg: { 10: 0.024, 12: 0.0264 } as Record<number, number>,
};

// その他定数
const SKILL_SPD_BOOST = 30;
const SKILL_HP_COST_PCT = 0.02;
const SKILL_DURATION = 3;
const MAX_CHARGES = 8;
const MAX_PAWNED_ASSET = 50;
const PAWNED_ASSET_ON_TALENT = 5;
const ULT_ENHANCE_STACKS = 2;
const E1_DMG_BOOST_VAL = 0.32;
const E2_CRIT_RATE = 0.18;
const E2_THRESHOLD = 15;
const E4_DEF_IGNORE_VAL = 0.12;
const E4_DURATION = 3;
const A6_ATK_PER_STACK = 0.005;

export const jade: Character = {
    id: CHARACTER_ID,
    name: 'ジェイド',
    path: 'Erudition',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 140,
    baseStats: {
        hp: 1086,
        atk: 659,
        def: 509,
        spd: 103,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75,
    },
    abilities: {
        basic: {
            id: 'jade-basic',
            name: 'むしり取る鞭打ち',
            type: 'Basic ATK',
            description: '拡散攻撃。敵単体および隣接する敵に量子属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'blast',
                scaling: 'atk', // Blast logic will use hits below
                mainHits: [{ multiplier: 0.90, toughnessReduction: 10 }],
                adjacentHits: [{ multiplier: 0.30, toughnessReduction: 5 }],
            },
            energyGain: 20,
        },
        skill: {
            id: 'jade-skill',
            name: 'ほしいままに飲み込む買収',
            type: 'Skill',
            description: '味方単体を「債権回収者」にし、速度+30。',
            targetType: 'ally',
            energyGain: 30,
            effects: [], // ハンドラーで処理
        },
        ultimate: {
            id: 'jade-ultimate',
            name: '欲望の淵での地獄の契り',
            type: 'Ultimate',
            description: '敵全体に量子属性ダメージ。天賦の追加攻撃を強化。',
            targetType: 'self', // 全体攻撃
            energyGain: 5,
            effects: [],
        },
        talent: {
            id: 'jade-talent',
            name: '富を削ぐ毒牙',
            type: 'Talent',
            description: 'チャージが8に達すると追加攻撃を行う。「質草」を獲得し会心ダメージアップ。',
            targetType: 'self',
        },
        technique: {
            id: 'jade-technique',
            name: 'ハンターの視界',
            type: 'Technique',
            description: '敵を「盲従」状態にする。戦闘開始時、全体ダメージを与え「質草」獲得。',
        },
    },
    traces: [
        {
            id: TRACE_IDS.A2_REVERSE_REPO,
            name: 'リバースレポ',
            type: 'Bonus Ability',
            description: '敵出現時および「債権回収者」のターン時、「質草」を獲得。',
        },
        {
            id: TRACE_IDS.A4_COLLATERAL,
            name: '質札',
            type: 'Bonus Ability',
            description: '戦闘開始時、行動順が50%早まる。',
        },
        {
            id: TRACE_IDS.A6_DEFECTED,
            name: '流れ者',
            type: 'Bonus Ability',
            description: '「質草」層数に応じて攻撃力アップ。',
        },
        {
            id: 'jade-stat-quantum',
            name: '量子属性ダメージ強化',
            type: 'Stat Bonus',
            description: '量子属性ダメージ+22.4%',
            stat: 'quantum_dmg_boost',
            value: 0.224,
        },
        {
            id: 'jade-stat-atk',
            name: '攻撃力強化',
            type: 'Stat Bonus',
            description: '攻撃力+18.0%',
            stat: 'atk_pct',
            value: 0.18,
        },
        {
            id: 'jade-stat-res',
            name: '効果抵抗強化',
            type: 'Stat Bonus',
            description: '効果抵抗+10.0%',
            stat: 'effect_res',
            value: 0.10,
        },
    ],
    eidolons: {
        e1: { level: 1, name: '無私？それは交渉次第', description: '天賦ダメ+32%。債権回収者の攻撃ヒット数に応じてチャージ増加量アップ。' },
        e2: { level: 2, name: '道徳？謹んで捺印', description: '「質草」15層以上で会心率+18%。' },
        e3: { level: 3, name: '率直？質入れを待つのみ', description: 'スキルLv+2、天賦Lv+2' },
        e4: { level: 4, name: '誠実？契約に従っただけ', description: '必殺技発動時、防御無視12% (3ターン)。' },
        e5: { level: 5, name: '希望？すでに売り渡し済み', description: '必殺技Lv+2、通常攻撃Lv+1' },
        e6: { level: 6, name: '公平？なおも担保が必須', description: '量子耐性貫通+20%。ジェイドも「債権回収者」状態を得る。' },
    },
    defaultConfig: {
        lightConeId: 'yet-hope-is-priceless',
        superimposition: 1,
        relicSetId: 'genius_of_brilliant_stars',
        ornamentSetId: 'duran_dynasty_of_running_wolves',
        mainStats: {
            body: 'crit_rate',
            feet: 'atk_pct',
            sphere: 'quantum_dmg_boost',
            rope: 'atk_pct',
        },
        subStats: [
            { stat: 'crit_rate', value: 0.5 },
            { stat: 'crit_dmg', value: 1.0 },
        ],
        rotationMode: 'spam_skill',
    }
};

// ===============================
// ヘルパー関数
// ===============================

// 質草(Pawned Asset)のバフ効果を計算
function getPawnedAssetBuffValue(stacks: number, talentLevel: number, eidolonLevel: number): { critDmg: number, atkPct: number, critRate: number } {
    const critDmgPerStack = getLeveledValue(ABILITY_VALUES.talentCritDmg, talentLevel);
    let critDmg = stacks * critDmgPerStack;

    // A6: 攻撃力アップ (0.5% per stack)
    let atkPct = stacks * A6_ATK_PER_STACK;

    let critRate = 0;
    if (eidolonLevel >= 2 && stacks >= E2_THRESHOLD) {
        critRate = E2_CRIT_RATE;
    }

    return { critDmg, atkPct, critRate };
}

// 債権回収者バフを作成
function createDebtCollectorBuff(sourceId: string, targetId: string, eidolonLevel: number): IEffect {
    const isSelf = sourceId === targetId;
    const modifiers: any[] = []; // Type issue workaround if needed, but StatKey imported

    // ジェイド自身が債権回収者の場合、速度アップは無効
    if (!isSelf) {
        modifiers.push({
            source: '債権回収者',
            target: 'spd' as StatKey,
            type: 'add',
            value: SKILL_SPD_BOOST,
        });
    }

    return {
        id: `${EFFECT_IDS.DEBT_COLLECTOR_BUFF}-${targetId}`,
        name: '債権回収者',
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'LINKED',
        duration: 0,
        linkedEffectId: `${EFFECT_IDS.DEBT_COLLECTOR_TRACKER}-${sourceId}`,
        modifiers: modifiers,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

// 債権回収者トラッカー
function createDebtCollectorTracker(sourceId: string): IEffect {
    return {
        id: `${EFFECT_IDS.DEBT_COLLECTOR_TRACKER}-${sourceId}`,
        name: '債権回収者(管理)',
        category: 'OTHER',
        sourceUnitId: sourceId,
        durationType: 'TURN_START_BASED',
        duration: SKILL_DURATION,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
}

// ===============================
// ロジック関数
// ===============================

// 質草(Pawned Asset)追加
function addPawnedAsset(state: GameState, unitId: string, amount: number, talentLevel: number, eidolonLevel: number): GameState {
    let newState = state;
    const unit = newState.registry.get(createUnitId(unitId));
    if (!unit) return newState;

    const currentEffect = unit.effects.find(e => e.id === EFFECT_IDS.PAWNED_ASSET);
    let currentStacks = currentEffect ? (currentEffect.stackCount || 0) : 0;

    let newStacks = Math.min(currentStacks + amount, MAX_PAWNED_ASSET);

    if (currentEffect) {
        newState = removeEffect(newState, unitId, EFFECT_IDS.PAWNED_ASSET);
    }

    const { critDmg, atkPct, critRate } = getPawnedAssetBuffValue(newStacks, talentLevel, eidolonLevel);

    const newEffect: IEffect = {
        id: EFFECT_IDS.PAWNED_ASSET,
        name: `質草 (${newStacks})`,
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: newStacks,
        modifiers: [
            { source: '質草', target: 'crit_dmg' as StatKey, type: 'add', value: critDmg },
            { source: '質草', target: 'atk_pct' as StatKey, type: 'add', value: atkPct },
            ...(critRate > 0 ? [{ source: '質草', target: 'crit_rate' as StatKey, type: 'add' as const, value: critRate }] : [])
        ],
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    newState = addEffect(newState, unitId, newEffect);
    return newState;
}

// チャージ加算 & 天賦発動チェック
function addCharge(state: GameState, unitId: string, amount: number, eidolonLevel: number): GameState {
    let newState = state;
    const unit = newState.registry.get(createUnitId(unitId));
    if (!unit) return newState;

    let chargeEffect = unit.effects.find(e => e.id === EFFECT_IDS.CHARGE);
    let currentCharge = chargeEffect ? (chargeEffect.stackCount || 0) : 0;

    currentCharge += amount;

    // エフェクト更新
    if (chargeEffect) {
        newState = removeEffect(newState, unitId, EFFECT_IDS.CHARGE);
    }

    const newChargeEffect: IEffect = {
        id: EFFECT_IDS.CHARGE,
        name: `チャージ (${currentCharge})`,
        category: 'STATUS',
        sourceUnitId: unitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: currentCharge,
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, unitId, newChargeEffect);

    // 8以上で追加攻撃発動
    if (currentCharge >= MAX_CHARGES) {
        // 消費 (エフェクト入れ直し)
        currentCharge -= MAX_CHARGES;
        newState = removeEffect(newState, unitId, EFFECT_IDS.CHARGE); // Remove updated one
        newState = addEffect(newState, unitId, { ...newChargeEffect, name: `チャージ (${currentCharge})`, stackCount: currentCharge });

        // 追加攻撃発動
        newState = triggerTalentFollowUp(newState, unitId, eidolonLevel);
    }

    return newState;
}

// 天賦追加攻撃発動
function triggerTalentFollowUp(state: GameState, unitId: string, eidolonLevel: number): GameState {
    let newState = state;
    const unit = newState.registry.get(createUnitId(unitId));
    if (!unit) return newState;

    // 必殺技による強化チェック
    const enhanceEffect = unit.effects.find(e => e.id === EFFECT_IDS.ULT_ENHANCE);
    const isEnhanced = enhanceEffect && (enhanceEffect.stackCount || 0) > 0;

    const talentLevel = calculateAbilityLevel(eidolonLevel, 3, 'Talent');
    let dmgMult = getLeveledValue(ABILITY_VALUES.talentDmg, talentLevel);

    if (isEnhanced) {
        const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
        const enhanceVal = getLeveledValue(ABILITY_VALUES.ultEnhance, ultLevel);
        dmgMult += enhanceVal;
    }

    // E1: Damage Boost Temporary
    if (eidolonLevel >= 1) {
        const e1Mod = { source: 'E1', target: 'follow_up_dmg_boost' as StatKey, type: 'add' as const, value: E1_DMG_BOOST_VAL };
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(unitId), u => ({ ...u, modifiers: [...u.modifiers, e1Mod] }))
        };
    }

    const enemies = newState.registry.getAliveEnemies();
    enemies.forEach(enemy => {
        const res = applyUnifiedDamage(newState, unit, enemy, unit.stats.atk * dmgMult, {
            damageType: 'Follow-up', // triggers ON_FOLLOW_UP_ATTACK implicitly? No, damageType string. Log uses this.
            details: '天賦: 追加攻撃',
            breakdownMultipliers: { // Necessary?
                baseDmg: unit.stats.atk * dmgMult,
                critMult: 1 + unit.stats.crit_dmg,
                dmgBoostMult: 1,
                defMult: 0.5,
                resMult: 1.0,
                vulnMult: 1.0,
                brokenMult: 1.0 // Defaults, just to pass types
            }
        });
        newState = res.state;
    });

    if (eidolonLevel >= 1) {
        // Remove E1 Mod
        newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(unitId), u => ({ ...u, modifiers: u.modifiers.filter(m => m.source !== 'E1') }))
        };
    }

    // 質草獲得
    newState = addPawnedAsset(newState, unitId, PAWNED_ASSET_ON_TALENT, talentLevel, eidolonLevel);

    // 強化スタック消費
    if (isEnhanced) {
        const newCount = (enhanceEffect!.stackCount || 0) - 1;
        newState = removeEffect(newState, unitId, EFFECT_IDS.ULT_ENHANCE);
        if (newCount > 0) {
            newState = addEffect(newState, unitId, { ...enhanceEffect!, stackCount: newCount });
        }
    }

    return newState;
}

// ===============================
// ハンドラー関数 (分離)
// ===============================

const onBattleStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const unit = state.registry.get(createUnitId(sourceUnitId));
    if (!unit) return newState;

    // A4: 行動順短縮
    if (unit.traces?.some(t => t.id === TRACE_IDS.A4_COLLATERAL)) {
        newState = advanceAction(newState, sourceUnitId, 0.50);
    }

    // 秘技使用時
    // 秘技使用時
    if (unit.config?.useTechnique !== false) {
        newState = addPawnedAsset(newState, sourceUnitId, 15, calculateAbilityLevel(eidolonLevel, 3, 'Talent'), eidolonLevel);
    }

    // E6: Quantum RES PEN +20% and Debt Collector state
    if (eidolonLevel >= 6) {
        // Quantum RES PEN
        const resPenEffect: IEffect = {
            id: 'jade-e6-res-pen',
            name: 'E6: Quantum PEN',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'PERMANENT',
            duration: -1,
            modifiers: [{ target: 'quantum_res_pen' as StatKey, value: 0.20, type: 'add' as const, source: 'E6' }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, resPenEffect);

        // Debt Collector state (Self, Permanent)
        const e6DebtBuff = createDebtCollectorBuff(sourceUnitId, sourceUnitId, eidolonLevel);
        const permanentDebtBuff = {
            ...e6DebtBuff,
            durationType: 'PERMANENT' as const, // Cast to literal type if needed
            duration: -1,
            linkedEffectId: undefined // Not linked to tracker
        };
        // Explicit cast durationType to match IEffect interface if strictly typed, but spread should work if 'PERMANENT' is valid.
        // Actually IEffect durationType is string enum. 'PERMANENT' is valid.
        // However, spread keeps original type. I'll just rely on overwrite.
        // Typescript might complain if durationType string doesn't match enum. 
        // Engine types.ts defines durationType as 'PERMANENT' | 'TURN_START_BASED' ...

        newState = addEffect(newState, sourceUnitId, permanentDebtBuff as IEffect);
    }

    return newState;
};

const onTurnStart = (event: GeneralEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;

    // A2: 債権回収者のターン時、質草3層獲得
    if (event.sourceId !== sourceUnitId) { // Not Jade's turn
        const activeUnit = state.registry.get(createUnitId(event.sourceId));
        if (activeUnit) {
            const buff = activeUnit.effects.find(e => e.name === '債権回収者');
            if (buff && buff.sourceUnitId === sourceUnitId) {
                const jadeUnit = state.registry.get(createUnitId(sourceUnitId));
                if (jadeUnit && jadeUnit.traces?.some(t => t.id === TRACE_IDS.A2_REVERSE_REPO)) {
                    newState = addPawnedAsset(newState, sourceUnitId, 3, calculateAbilityLevel(eidolonLevel, 3, 'Talent'), eidolonLevel);
                }
            }
        }
    }
    return newState;
};

const onActionComplete = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const attackerId = event.sourceId;
    const attacker = state.registry.get(createUnitId(attackerId));
    if (!attacker) return newState;

    // 攻撃アクションであるか判定 (Attack, Skill, Ultimate, Follow-up)
    const attackTypes = ['ON_BASIC_ATTACK', 'ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_FOLLOW_UP_ATTACK', 'ON_ATTACK'];
    if (!attackTypes.includes(event.type)) return newState;

    const isJade = attackerId === sourceUnitId;
    const debtCollectorBuff = attacker.effects.find(e => e.name === '債権回収者' && e.sourceUnitId === sourceUnitId);

    if (!isJade && !debtCollectorBuff) return newState;

    // 1. チャージ獲得
    // Hit count logic using event.targetCount or assuming 1 if singular
    let hitCount = event.targetCount || 1;
    // If not set, try to infer? Usually engine sets it.

    let chargeGain = hitCount;

    if (debtCollectorBuff && eidolonLevel >= 1) {
        if (chargeGain === 1) chargeGain += 2;
        else if (chargeGain === 2) chargeGain += 1;
    }

    // 天賦自身の追加攻撃ではチャージを獲得しない
    // Check if this action is the Talent Follow-up
    // Currently relying on details/type. If event.type === 'ON_FOLLOW_UP_ATTACK' and source is Jade.
    // Need to distinguish Talent Follow-Up from other Follow-ups (if any, e.g. Elation path).
    // Assuming Jade only has Talent Follow-up.
    const isJadeTalentFollowUp = isJade && event.type === 'ON_FOLLOW_UP_ATTACK';

    if (!isJadeTalentFollowUp) {
        newState = addCharge(newState, sourceUnitId, chargeGain, eidolonLevel);
    }

    // 2. 債権回収者の攻撃時の追加効果
    if (debtCollectorBuff) {
        // 付加ダメージ
        const skillLevel = calculateAbilityLevel(eidolonLevel, 5, 'Skill');
        const addDmgMult = getLeveledValue(ABILITY_VALUES.skillAddDmg, skillLevel);
        const jadeUnit = state.registry.get(createUnitId(sourceUnitId));

        if (jadeUnit) {
            // ターゲット情報がない場合、直近のHitLog等から取る必要があるが、
            // ActionEventにtargetIdやtargetCountしかなく、誰に当たったか正確なリストがない場合がある。
            // しかしActionpipelineでは targets がある。
            // ここでは簡易的に event.targetId (Primary) に入れるか、あるいは範囲攻撃なら敵全体?
            // event.targetCount > 1 なら敵全体とみなすか？
            // Engine limitation: ActionEvent might not list all targets.
            // Hysilens used applyUnifiedDamage on enemies loop for AoE.

            // If targetId is present, apply to it. If it was AoE, ideally we Iterate all enemies?
            // But we only want to apply to HIT enemies.
            // If event.targetType === 'all_enemies', iterate all alive enemies.

            let targetsToHit: Unit[] = [];
            if (event.targetType === 'all_enemies') {
                targetsToHit = state.registry.getAliveEnemies();
            } else if (event.targetId) {
                const t = state.registry.get(createUnitId(event.targetId));
                if (t) targetsToHit.push(t);
                // If blast, add adjacent? event.adjacentIds not in ActionEvent type per my check?
                // Checking types.ts again: adjacentIds?: string[]; YES, it exists at line 318.
                if (event.adjacentIds) {
                    event.adjacentIds.forEach(aid => {
                        const at = state.registry.get(createUnitId(aid));
                        if (at) targetsToHit.push(at);
                    });
                }
            }

            targetsToHit.forEach(target => {
                const res = applyUnifiedDamage(newState, jadeUnit, target, jadeUnit.stats.atk * addDmgMult, {
                    damageType: 'Additional Damage',
                    details: '債権回収者: 付加ダメージ',
                    skipLog: true
                });
                newState = res.state;

                // Log additional damage manually if needed or allowed by engine
            });
        }

        // HP消費
        if (!isJade) {
            const consumeAmount = attacker.stats.hp * SKILL_HP_COST_PCT; // Use maxHp from input stats or base? Logic used maxHp
            const currentHp = attacker.hp;
            const newHp = Math.max(1, Math.floor(currentHp - consumeAmount));
            if (newHp < currentHp) {
                newState = {
                    ...newState,
                    registry: newState.registry.update(createUnitId(attacker.id), u => ({ ...u, hp: newHp }))
                };
                // HP Consumption event trigger?
                // publishEvent(newState, { type: 'ON_HP_CONSUMED', ... })
                // For now, direct update.
            }
        }
    }

    return newState;
};

const onSkillUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    if (!event.targetId) return newState;

    newState = removeEffect(newState, sourceUnitId, `${EFFECT_IDS.DEBT_COLLECTOR_TRACKER}-${sourceUnitId}`);

    // Remove old buff from anyone who has it? 
    // EffectManager does not automatically remove 'linked' effects if we remove tracker, yes it does on tick or check.
    // But immediate cleanup is cleaner.
    // Iterating all allies to remove 'jade-debt-collector-buff'.
    state.registry.getAliveAllies().forEach(ally => {
        const oldBuff = ally.effects.find(e => e.id.startsWith(EFFECT_IDS.DEBT_COLLECTOR_BUFF) && e.sourceUnitId === sourceUnitId);
        if (oldBuff) {
            newState = removeEffect(newState, ally.id, oldBuff.id);
        }
    });

    const tracker = createDebtCollectorTracker(sourceUnitId);
    newState = addEffect(newState, sourceUnitId, tracker);

    const buff = createDebtCollectorBuff(sourceUnitId, event.targetId, eidolonLevel);
    newState = addEffect(newState, event.targetId, buff);

    return newState;
};

const onUltimateUsed = (event: ActionEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
    let newState = state;
    const jadeUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!jadeUnit) return newState;

    const ultLevel = calculateAbilityLevel(eidolonLevel, 3, 'Ultimate');
    const ultMult = getLeveledValue(ABILITY_VALUES.ultDmg, ultLevel);

    if (eidolonLevel >= 4) {
        const e4Buff: IEffect = {
            id: EFFECT_IDS.E4_DEF_IGNORE,
            name: 'E4: 防御無視',
            category: 'BUFF',
            sourceUnitId: sourceUnitId,
            durationType: 'TURN_START_BASED',
            duration: E4_DURATION,
            modifiers: [{ source: 'E4防御無視', target: 'def_ignore' as StatKey, type: 'add' as const, value: E4_DEF_IGNORE_VAL }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceUnitId, e4Buff);
    }

    state.registry.getAliveEnemies().forEach(enemy => {
        const res = applyUnifiedDamage(newState, jadeUnit, enemy, jadeUnit.stats.atk * ultMult, {
            damageType: 'Ultimate',
            details: '必殺技ダメージ'
        });
        newState = res.state;
    });

    const enhanceBuff: IEffect = {
        id: EFFECT_IDS.ULT_ENHANCE,
        name: `天賦強化 (${ULT_ENHANCE_STACKS})`,
        category: 'BUFF',
        sourceUnitId: sourceUnitId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: ULT_ENHANCE_STACKS,
        apply: (t, s) => s,
        remove: (t, s) => s,
    };
    newState = addEffect(newState, sourceUnitId, enhanceBuff);

    return newState;
};

// ===============================
// Factory
// ===============================

export const jadeHandlerFactory: IEventHandlerFactory = (sourceUnitId: string, eidolonLevel: number) => {
    return {
        handlerMetadata: {
            id: `jade-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
                'ON_ULTIMATE_USED',
                'ON_ATTACK',
                'ON_BASIC_ATTACK',
                'ON_FOLLOW_UP_ATTACK',
                'ON_ACTION_COMPLETE' // Trying to use this for general "After Attack"
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            if (event.type === 'ON_BATTLE_START') return onBattleStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);
            if (event.type === 'ON_TURN_START') return onTurnStart(event as GeneralEvent, state, sourceUnitId, eidolonLevel);

            // Dispatch to specific action handlers
            if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
                return onSkillUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            // Check Action Complete for "After Attack" logic (Charge, etc.)
            // Note: ON_ACTION_COMPLETE is generic. We need to check if it was an attack.
            if ((event.type === 'ON_SKILL_USED' || event.type === 'ON_BASIC_ATTACK' || event.type === 'ON_ULTIMATE_USED' || event.type === 'ON_FOLLOW_UP_ATTACK')) {
                // Trigger Action Complete logic immediately? 
                // Usually ON_ACTION_COMPLETE is fired at the end. 
                // But my logic handles hit count which is in the event.
                // let's use the specific event directly as "Action Complete" equivalent for logic
                return onActionComplete(event as ActionEvent, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
