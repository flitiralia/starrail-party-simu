import { Character, Element, Path, StatKey } from '../../types/index';
import { weAreTheWildfire } from '../light-cones/we-are-wildfire';
import { IEventHandlerFactory, GameState, IEvent, Unit } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';

import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { applyUnifiedDamage, checkDebuffSuccess } from '../../simulator/engine/dispatcher';
import { applyShield } from '../../simulator/engine/utils';
import { IEffect } from '../../simulator/effect/types';

// --- 定数定義 ---
const CHARACTER_ID = 'march-7th';

// 通常攻撃
const BASIC_MULT = 1.0;

// スキル
const SKILL_SHIELD_PCT = 0.57;
const SKILL_SHIELD_FLAT = 760;
const SKILL_DURATION = 3;

// 必殺技
const ULT_MULT_PER_HIT = 0.375;
const ULT_FREEZE_CHANCE = 0.65;

// 天賦
const TALENT_MULT = 1.0;

// 秘技
const TECHNIQUE_FREEZE_CHANCE = 1.0;
const TECHNIQUE_DMG_MULT = 0.5;

// E2
const E2_SHIELD_PCT = 0.24;
const E2_SHIELD_FLAT = 320;

// E4
const E4_DEF_DMG_MULT = 0.30;

// E6
const E6_HEAL_PCT = 0.04;
const E6_HEAL_FLAT = 106;

// カウンター
const BASE_COUNTER_CHARGES = 2;
const E4_COUNTER_CHARGES = 3;

export const march7th: Character = {
  id: 'march-7th',
  name: '三月なのか',
  path: 'Preservation',
  element: 'Ice',
  rarity: 4,

  // レベル80ステータス (Preservation)
  baseStats: {
    hp: 1058,
    atk: 511,
    def: 573,
    spd: 101,
    critRate: 0.05,
    critDmg: 0.5,
    aggro: 150
  },

  // 最大EP
  maxEnergy: 120,

  // スキルセット (Max Trace Levels: Basic 6, Others 10)
  abilities: {
    basic: {
      id: 'march-basic',
      name: '極寒の矢',
      type: 'Basic ATK',
      description: '単体に氷属性ダメージ',
      targetType: 'single_enemy',
      damage: {
        type: 'simple',
        scaling: 'atk',
        hits: [{ multiplier: 1.0, toughnessReduction: 10 }],
      },
      energyGain: 20,
    },
    skill: {
      id: 'march-skill',
      name: '可愛いは正義',
      type: 'Skill',
      description: '味方単体にバリアを付与',
      targetType: 'ally',
      shield: {
        scaling: 'def',
        multiplier: 0.57, // Lv 10
        flat: 760,
      },
      energyGain: 30,
    },
    ultimate: {
      id: 'march-ultimate',
      name: '氷刻矢雨の時',
      type: 'Ultimate',
      description: '全体に氷属性ダメージと凍結のチャンス',
      targetType: 'all_enemies',
      damage: {
        type: 'aoe',
        scaling: 'atk',
        hits: [
          { multiplier: 0.375, toughnessReduction: 5 },
          { multiplier: 0.375, toughnessReduction: 5 },
          { multiplier: 0.375, toughnessReduction: 5 },
          { multiplier: 0.375, toughnessReduction: 5 }
        ],
      },
      energyGain: 5,
      effects: [
        {
          type: 'Freeze',
          baseChance: 0.65, // Base 50% + 15% from Ice Spell trace
          target: 'target',
        }
      ]
    },
    talent: {
      id: 'march-talent',
      name: '少女の特権',
      type: 'Talent',
      description: 'バリアを持つ味方が攻撃されるとカウンター',
      damage: {
        type: 'simple',
        scaling: 'atk',
        hits: [{ multiplier: 1.0, toughnessReduction: 10 }],
      },
      energyGain: 10,
    },
    technique: {
      id: 'march-technique',
      name: '凍る寸前のサプライズ',
      type: 'Technique',
      description: '戦闘開始時に敵を凍結させる',
    },
  },

  // 軌跡 (Bonus Abilities & Stat Bonuses)
  traces: [
    {
      id: 'march-trace-purify',
      name: '純潔',
      type: 'Bonus Ability',
      description: 'スキルのバリアがデバフ解除効果を持つ',
    },
    {
      id: 'march-trace-reinforce',
      name: '加護',
      type: 'Bonus Ability',
      description: 'スキルのバリア継続時間+1ターン',
    },
    {
      id: 'march-trace-ice-spell',
      name: 'アイススペル',
      type: 'Bonus Ability',
      description: '必殺技の凍結基礎確率+15%',
    },
    {
      id: 'march-trace-stat-ice',
      name: '氷属性ダメージ',
      type: 'Stat Bonus',
      description: '氷属性ダメージ+22.4%',
      stat: 'ice_dmg_boost',
      value: 0.224,
    },
    {
      id: 'march-trace-stat-def',
      name: '防御力',
      type: 'Stat Bonus',
      description: '防御力+22.5%',
      stat: 'def_pct',
      value: 0.225,
    },
    {
      id: 'march-trace-stat-res',
      name: '効果抵抗',
      type: 'Stat Bonus',
      description: '効果抵抗+10%',
      stat: 'effect_res',
      value: 0.10,
    },
  ],

  // 星魂(Eidolon)
  eidolons: {
    e1: {
      level: 1,
      name: '記憶の中の君',
      description: '必殺技で凍結を発生させるとEPが6回復する',
    },
    e2: {
      level: 2,
      name: '記憶の中のあの子',
      description: '戦闘開始時、体力割合が最も低い味方に防御力の24%+320のバリアを付与する',
    },
    e3: {
      level: 3,
      name: '記憶の中の私',
      description: '必殺技のLv.+2、最大Lv.15\n通常攻撃のLv.+1、最大Lv.10',
      abilityModifiers: [
        // Ultimate Lv.10 -> Lv.12 (4 hits)
        { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 0.405 }, // 162% / 4
        { abilityName: 'ultimate', param: 'damage.hits.1.multiplier', value: 0.405 },
        { abilityName: 'ultimate', param: 'damage.hits.2.multiplier', value: 0.405 },
        { abilityName: 'ultimate', param: 'damage.hits.3.multiplier', value: 0.405 },
        // Basic Lv.6 -> Lv.7
        { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 },    // 100% -> 110%
      ]
    },
    e4: {
      level: 4,
      name: 'もう失いたくない',
      description: 'カウンター攻撃発動後、追加で自身の防御力の30%分の氷属性ダメージを与える',
      modifiesAbility: 'talent',
      // タレントのダメージ計算を変更
    },
    e5: {
      level: 5,
      name: '記憶の中のあの人',
      description: '戦闘スキルのLv.+2、最大Lv.15\n天賦のLv.+2、最大Lv.15',
      abilityModifiers: [
        // Skill Lv.10 -> Lv.12
        { abilityName: 'skill', param: 'shield.multiplier', value: 0.60 }, // 57% -> 60%
        { abilityName: 'skill', param: 'shield.flat', value: 845 },        // 760 -> 845
        // Talent Lv.10 -> Lv.12
        { abilityName: 'talent', param: 'damage.hits.0.multiplier', value: 1.10 }, // 100% -> 110%
      ]
    },
    e6: {
      level: 6,
      name: 'このまま、ずっと…',
      description: 'バリアを持つ味方は毎ターン開始時、自身の最大HPの4%+106に相当する分のHPが回復する',
    },
  },

  defaultConfig: {
    eidolonLevel: 6,
    lightConeId: 'day-one-of-my-new-life',
    superimposition: 5,
    relicSetId: 'knight-of-purity-palace',
    ornamentSetId: 'belobog-of-the-architects',
    mainStats: {
      body: 'effect_hit_rate',
      feet: 'spd',
      sphere: 'def_pct',
      rope: 'def_pct',
    },
    subStats: [
      { stat: 'def_pct', value: 0.20 },
      { stat: 'spd', value: 10 },
      { stat: 'effect_hit_rate', value: 0.15 },
      { stat: 'effect_res', value: 0.15 },
    ],
    rotationMode: 'spam_skill',
    ultStrategy: 'immediate',
  },
};


// --- 分離されたハンドラー関数 ---

// ヘルパー: カウンターチャージエフェクトを作成
const createCounterChargesEffect = (sourceUnitId: string, eidolonLevel: number): IEffect => {
  const maxCharges = eidolonLevel >= 4 ? E4_COUNTER_CHARGES : BASE_COUNTER_CHARGES;
  return {
    id: `march-counter-charges-${sourceUnitId}`,
    name: `カウンター (${maxCharges}回)`,
    category: 'BUFF',
    sourceUnitId: sourceUnitId,
    durationType: 'TURN_END_BASED',
    skipFirstTurnDecrement: true,
    duration: 1,
    stackCount: maxCharges,
    onApply: (t: any, s: any) => s,
    onRemove: (t: any, s: any) => s
  };
};

// 1. 戦闘開始時: E2バリア + カウンター初期化 + 秘技（凍結）
const onBattleStart = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
  const marchUnit = state.registry.get(createUnitId(sourceUnitId));
  if (!marchUnit) return state;

  let newState = state;

  // E2: 最も低いHP割合の味方にバリア
  if (eidolonLevel >= 2) {
    const allies = newState.registry.getAliveAllies();
    if (allies.length > 0) {
      const lowestHpAlly = allies.reduce((lowest, current) =>
        (current.hp / current.stats.hp) < (lowest.hp / lowest.stats.hp) ? current : lowest
      );
      newState = applyShield(newState, sourceUnitId, lowestHpAlly.id, { scaling: 'def', multiplier: E2_SHIELD_PCT, flat: E2_SHIELD_FLAT }, 3, 'TURN_END_BASED', 'バリア (E2)');
    }
  }

  // カウンターチャージ初期化
  newState = addEffect(newState, sourceUnitId, createCounterChargesEffect(sourceUnitId, eidolonLevel));

  // 秘技使用フラグを確認 (デフォルト true)
  const useTechnique = marchUnit.config?.useTechnique !== false;

  if (useTechnique) {
    // 秘技: ランダムな敵を凍結
    const enemies = newState.registry.getAliveEnemies();
    if (enemies.length > 0) {
      const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];

      // 効果命中/抵抗判定（checkDebuffSuccessを使用）
      if (checkDebuffSuccess(marchUnit, randomEnemy, TECHNIQUE_FREEZE_CHANCE, 'Freeze')) {
        const techFreezeEffect: IEffect = {
          id: `freeze-${randomEnemy.id}`,
          name: '凍結 (秘技)',
          category: 'STATUS',
          sourceUnitId: sourceUnitId,
          durationType: 'TURN_END_BASED',
          skipFirstTurnDecrement: true,
          duration: 1,
          onApply: (t: any, s: any) => s,
          onRemove: (t: any, s: any) => s
        };
        newState = addEffect(newState, randomEnemy.id, techFreezeEffect);
        newState = {
          ...newState, log: [...newState.log, {
            characterName: marchUnit.name, actionTime: newState.time, actionType: '秘技',
            details: `秘技: ${randomEnemy.name}を凍結`
          } as any]
        };
      }
    }
  }

  return newState;
};

// 2. ターン開始時: E6回復 + 秘技凍結付加ダメージ + カウンター更新
const onTurnStart = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
  const marchUnit = state.registry.get(createUnitId(sourceUnitId));
  if (!marchUnit) return state;

  let newState = state;
  const activeUnit = newState.registry.get(createUnitId(event.sourceId));
  if (!activeUnit) return newState;

  // E6: バリアを持つ味方を回復
  if (eidolonLevel >= 6 && !activeUnit.isEnemy && activeUnit.hp > 0 && activeUnit.shield > 0) {
    const hasMarchShield = activeUnit.effects.some((e: IEffect) => e.sourceUnitId === sourceUnitId && (e as any).type === 'Shield');
    if (hasMarchShield) {
      const healAmount = activeUnit.stats.hp * E6_HEAL_PCT + E6_HEAL_FLAT;
      const newHp = Math.min(activeUnit.hp + healAmount, activeUnit.stats.hp);
      newState = {
        ...newState,
        registry: newState.registry.update(createUnitId(activeUnit.id), u => ({ ...u, hp: newHp }))
      };
    }
  }

  // 秘技凍結の付加ダメージ
  if (activeUnit.isEnemy) {
    const techFreeze = activeUnit.effects.find((e: IEffect) => e.id === `freeze-${activeUnit.id}` && e.sourceUnitId === sourceUnitId);
    if (techFreeze) {
      const baseDamage = marchUnit.stats.atk * TECHNIQUE_DMG_MULT;
      const result = applyUnifiedDamage(newState, marchUnit, activeUnit, baseDamage, { damageType: '付加ダメージ' });
      newState = result.state;
    }
  }

  // 三月なのか自身のターン開始時: カウンター更新
  if (event.sourceId === sourceUnitId) {
    const existingCounter = marchUnit.effects.find(e => e.id === `march-counter-charges-${sourceUnitId}`);
    if (existingCounter) {
      newState = removeEffect(newState, sourceUnitId, existingCounter.id);
    }
    newState = addEffect(newState, sourceUnitId, createCounterChargesEffect(sourceUnitId, eidolonLevel));
  }

  return newState;
};

// 3. ダメージ発生時: カウンター発動
const onDamageDealt = (event: IEvent, state: GameState, sourceUnitId: string, eidolonLevel: number): GameState => {
  const marchUnit = state.registry.get(createUnitId(sourceUnitId));
  if (!marchUnit || marchUnit.hp <= 0) return state;

  if (!('targetId' in event)) return state;
  if (!event.targetId) return state;
  const targetUnit = state.registry.get(createUnitId(event.targetId));
  const sourceUnit = state.registry.get(createUnitId(event.sourceId));

  if (!targetUnit || !sourceUnit) return state;
  if (targetUnit.isEnemy) return state;  // ターゲットは味方でなければならない
  if (!sourceUnit.isEnemy) return state; // ソースは敵でなければならない
  if (targetUnit.shield <= 0) return state; // バリアを持っていなければならない

  // カウンターエフェクトを確認
  const counterEffect = marchUnit.effects.find((e: IEffect) => e.id === `march-counter-charges-${sourceUnitId}`);
  if (!counterEffect || (counterEffect.stackCount || 0) <= 0) return state;

  // スタック数を減らしてカウンター発動
  const newStackCount = (counterEffect.stackCount || 0) - 1;
  const updatedEffect = { ...counterEffect, stackCount: newStackCount, name: `カウンター (${newStackCount}回)` };
  const updatedMarch = { ...marchUnit, effects: marchUnit.effects.map((e: IEffect) => e.id === counterEffect.id ? updatedEffect : e) };

  return {
    ...state,
    registry: state.registry.update(createUnitId(sourceUnitId), () => updatedMarch),
    pendingActions: [...state.pendingActions, { type: 'FOLLOW_UP_ATTACK', sourceId: sourceUnitId, targetId: sourceUnit.id, eidolonLevel } as any]
  };
};

export const march7thHandlerFactory: IEventHandlerFactory = (sourceUnitId, level: number, eidolonLevel: number = 0) => {
  return {
    handlerMetadata: {
      id: `march-7th-talent-${sourceUnitId}`,
      subscribesTo: [
        'ON_DAMAGE_DEALT',
        'ON_TURN_START',
        'ON_BATTLE_START',    // E2用
        'ON_DEBUFF_APPLIED',  // E1用（凍結検知）
      ],
    },
    handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
      const marchUnit = state.registry.get(createUnitId(sourceUnitId));
      if (!marchUnit) return state;

      // 戦闘開始時: E2バリア + カウンター初期化 + 秘技
      if (event.type === 'ON_BATTLE_START') {
        return onBattleStart(event, state, sourceUnitId, eidolonLevel);
      }

      // ターン開始時: E6回復 + 秘技凍結付加ダメージ + カウンター更新
      if (event.type === 'ON_TURN_START') {
        return onTurnStart(event, state, sourceUnitId, eidolonLevel);
      }

      // ダメージ発生時: カウンター発動
      if (event.type === 'ON_DAMAGE_DEALT') {
        return onDamageDealt(event, state, sourceUnitId, eidolonLevel);
      }

      return state;
    }
  };
};
