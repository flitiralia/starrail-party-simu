import { Character, Element, Path, StatKey } from '../../types/index';
import { weAreTheWildfire } from '../light-cones/we-are-the-wildfire';
import { IEventHandlerFactory, GameState, IEvent } from '../../simulator/engine/types';

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
      damage: { type: 'simple', multiplier: 1.0, scaling: 'atk' }, // Lv 6
      energyGain: 20,
      toughnessReduction: 10,
      hits: 1,
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
      toughnessReduction: 0,
    },
    ultimate: {
      id: 'march-ultimate',
      name: '氷刻矢雨の時',
      type: 'Ultimate',
      description: '全体に氷属性ダメージと凍結のチャンス',
      targetType: 'all_enemies',
      damage: { type: 'simple', multiplier: 1.5, scaling: 'atk' }, // Lv 10
      energyGain: 5,
      toughnessReduction: 20,
      hits: 4,
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
      damage: { type: 'simple', multiplier: 1.0, scaling: 'atk' }, // Lv 10
      energyGain: 10,
      toughnessReduction: 10,
      hits: 1,
    },
    technique: {
      id: 'march-technique',
      name: '凍る寸前のサプライズ',
      type: 'Technique',
      description: '戦闘開始時に敵を凍結させる',
      toughnessReduction: 20,
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
        // Ultimate Lv.10 -> Lv.12
        { abilityName: 'ultimate', param: 'damage.multiplier', value: 1.62 }, // 150% -> 162%
        // Basic Lv.6 -> Lv.7
        { abilityName: 'basic', param: 'damage.multiplier', value: 1.10 },    // 100% -> 110%
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
        { abilityName: 'talent', param: 'damage.multiplier', value: 1.10 }, // 100% -> 110%
      ]
    },
    e6: {
      level: 6,
      name: 'このまま、ずっと…',
      description: 'バリアを持つ味方は毎ターン開始時、自身の最大HPの4%+106に相当する分のHPが回復する',
    },
  },

  // 装備光円錐
  equippedLightCone: {
    lightCone: weAreTheWildfire,
    level: 80,
    superimposition: 1,
  },
};

import { calculateNormalAdditionalDamage } from '../../simulator/damage';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { ShieldEffect, BreakStatusEffect, IEffect } from '../../simulator/effect/types';
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { applyShield } from '../../simulator/engine/utils';

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
      const marchUnit = state.units.find(u => u.id === sourceUnitId);
      if (!marchUnit) return state;

      // ... (omitted)

      // E2: 戦闘開始時にバリア付与
      if (eidolonLevel >= 2 && event.type === 'ON_BATTLE_START') {
        const allies = state.units.filter(u => !u.isEnemy && u.hp > 0);
        if (allies.length > 0) {
          // 体力割合が最も低い味方を見つける
          const lowestHpAlly = allies.reduce((lowest, current) => {
            const lowestRatio = lowest.hp / lowest.stats.hp;
            const currentRatio = current.hp / current.stats.hp;
            return currentRatio < lowestRatio ? current : lowest;
          });

          const shieldValue = marchUnit.stats.def * 0.24 + 320;

          state = applyShield(
            state,
            sourceUnitId,
            lowestHpAlly.id,
            shieldValue,
            3,
            'DURATION_BASED',
            'バリア (E2)',
            `shield-e2-${sourceUnitId}-${lowestHpAlly.id}`
          );
        }
      }

      // 戦闘開始時にカウンターエフェクトを付与
      if (event.type === 'ON_BATTLE_START') {
        // カウンター回数を決定（E4で+1）
        const maxCharges = eidolonLevel >= 4 ? 3 : 2;

        // カウンター回数エフェクトを作成
        const counterCharges: IEffect = {
          id: `march-counter-charges-${sourceUnitId}`,
          name: `カウンター (${maxCharges}回)`,
          category: 'BUFF',
          sourceUnitId: sourceUnitId,
          durationType: 'TURN_END_BASED',
          duration: 1,  // 自分のターン終了まで
          stackCount: maxCharges,  // 残り回数
          onApply: (t: any, s: any) => s,
          onRemove: (t: any, s: any) => s,
          apply: (t: any, s: any) => s,
          remove: (t: any, s: any) => s
        };

        state = addEffect(state, sourceUnitId, counterCharges);
      }

      // 秘技: 戦闘開始時に敵単体を凍結
      if (event.type === 'ON_BATTLE_START') {
        const enemies = state.units.filter(u => u.isEnemy && u.hp > 0);
        if (enemies.length > 0) {
          const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];

          // Calculate Real Chance
          const baseChance = 1.0;
          const ehr = marchUnit.stats.effect_hit_rate || 0;
          const res = randomEnemy.stats.effect_res || 0;
          const debuffRes = (randomEnemy.stats as any).debuff_res || 0;
          const specificRes = (randomEnemy.stats as any).frozen_res || 0;

          const realChance = baseChance * (1 + ehr) * (1 - res) * (1 - debuffRes) * (1 - specificRes);

          // Roll
          if (Math.random() < realChance) {
            // Create Freeze Effect (Technique)
            const techFreezeEffect: any = { // Using 'any' to bypass strict type check for custom properties if needed, but BreakStatusEffect should suffice
              id: `freeze-${randomEnemy.id}`,
              name: '凍結 (秘技)',
              category: 'STATUS',
              type: 'BreakStatus',
              statusType: 'Freeze',
              sourceUnitId: sourceUnitId,
              durationType: 'DURATION_BASED',
              duration: 1,
              frozen: true,
              onApply: (t: any, s: any) => s,
              onRemove: (t: any, s: any) => s,
              onTick: (t: any, s: any) => s,
              apply: (t: any, s: any) => s,
              remove: (t: any, s: any) => s
            };

            state = addEffect(state, randomEnemy.id, techFreezeEffect);

            state.log.push({
              characterName: marchUnit.name,
              actionTime: state.time,
              actionType: 'Technique',
              skillPointsAfterAction: state.skillPoints,
              damageDealt: 0,
              healingDone: 0,
              shieldApplied: 0,
              sourceHpState: '',
              targetHpState: '',
              targetToughness: '',
              currentEp: marchUnit.ep,
              activeEffects: [],
              details: `秘技: ${randomEnemy.name}を凍結 (確率: ${(realChance * 100).toFixed(1)}%)`
            } as any);
          } else {
            state.log.push({
              characterName: marchUnit.name,
              actionTime: state.time,
              actionType: 'Technique',
              skillPointsAfterAction: state.skillPoints,
              damageDealt: 0,
              healingDone: 0,
              shieldApplied: 0,
              sourceHpState: '',
              targetHpState: '',
              targetToughness: '',
              currentEp: marchUnit.ep,
              activeEffects: [],
              details: `秘技: ${randomEnemy.name}への凍結付与失敗 (確率: ${(realChance * 100).toFixed(1)}%)`
            } as any);
          }
        }
      }

      // E6: ターン開始時、バリアを持つ味方を回復
      if (eidolonLevel >= 6 && event.type === 'ON_TURN_START') {
        const activeUnitId = event.sourceId;
        const activeUnit = state.units.find(u => u.id === activeUnitId);

        if (activeUnit && !activeUnit.isEnemy && activeUnit.hp > 0 && activeUnit.shield > 0) {
          // Check if shield is from March 7th
          const hasMarchShield = activeUnit.effects.some(e =>
            (e as any).type === 'Shield' && e.sourceUnitId === sourceUnitId
          );

          if (hasMarchShield) {
            const healAmount = activeUnit.stats.hp * 0.04 + 106;
            const newHp = Math.min(activeUnit.hp + healAmount, activeUnit.stats.hp);

            const updatedUnit = { ...activeUnit, hp: newHp };
            state = {
              ...state,
              units: state.units.map(u => u.id === activeUnitId ? updatedUnit : u)
            };

            // Log healing
            state.log.push({
              characterName: activeUnit.name,
              actionTime: state.time,
              actionType: 'Heal',
              skillPointsAfterAction: state.skillPoints,
              damageDealt: 0,
              healingDone: healAmount,
              shieldApplied: 0,
              sourceHpState: `${newHp.toFixed(0)}+${activeUnit.shield.toFixed(0)}/${activeUnit.stats.hp.toFixed(0)}`,
              targetHpState: '',
              targetToughness: '',
              currentEp: activeUnit.ep,
              activeEffects: [],
              details: 'E6: Turn Start Heal'
            } as any);
          }
        }
      }

      // 秘技: 凍結状態の敵に付加ダメージ
      if (event.type === 'ON_TURN_START') {
        const activeUnit = state.units.find(u => u.id === event.sourceId);
        if (activeUnit && activeUnit.isEnemy) {
          const techFreeze = activeUnit.effects.find(e => e.name === '凍結 (秘技)' && e.sourceUnitId === sourceUnitId);
          if (techFreeze) {
            const baseDamage = marchUnit.stats.atk * 0.5;
            const damageAmount = calculateNormalAdditionalDamage(marchUnit, activeUnit, baseDamage);

            const result = applyUnifiedDamage(
              state,
              marchUnit,
              activeUnit,
              damageAmount,
              {
                damageType: 'ADDITIONAL_DAMAGE',
                isKillRecoverEp: true,
                skipLog: false,
                skipStats: false,
                events: []
              }
            );
            state = result.state;

            // Log detail update (optional, applyUnifiedDamage logs basic info)
            // We can append a specific detail if needed, but applyUnifiedDamage log is usually sufficient.
            // If we want to add "Details: 秘技: 凍結時付加ダメージ", we might need to modify the last log entry or use a custom event.
            // For now, standard log is fine.
          }
        }
      }

      // タレント（カウンター）処理 - ターン開始時にエフェクト作成
      if (event.type === 'ON_TURN_START' && event.sourceId === sourceUnitId) {
        // カウンター回数を決定（E4で+1）
        const maxCharges = eidolonLevel >= 4 ? 3 : 2;

        // カウンター回数エフェクトを作成
        const counterCharges: IEffect = {
          id: `march-counter-charges-${sourceUnitId}`,
          name: `カウンター (${maxCharges}回)`,
          category: 'BUFF',
          sourceUnitId: sourceUnitId,
          durationType: 'TURN_END_BASED',
          duration: 1,  // 自分のターン終了まで
          stackCount: maxCharges,  // 残り回数
          onApply: (t: any, s: any) => s,
          onRemove: (t: any, s: any) => s,
          apply: (t: any, s: any) => s,
          remove: (t: any, s: any) => s
        };

        // 既存のカウンターエフェクトを削除してから新規作成
        let newState = state;
        const currentMarch = newState.units.find(u => u.id === sourceUnitId);
        if (currentMarch) {
          const existingCounter = currentMarch.effects.find(e => e.id === counterCharges.id);
          if (existingCounter) {
            newState = removeEffect(newState, sourceUnitId, counterCharges.id);
          }
          newState = addEffect(newState, sourceUnitId, counterCharges);
        }

        return newState;
      }

      // タレント（カウンター）発動
      if (event.type === 'ON_DAMAGE_DEALT') {
        const targetUnit = state.units.find(u => u.id === event.targetId);
        const sourceUnit = state.units.find(u => u.id === event.sourceId);

        if (!targetUnit || !sourceUnit) return state;
        if (targetUnit.isEnemy) return state; // Target must be ally
        if (!sourceUnit.isEnemy) return state; // Source must be enemy
        if (targetUnit.shield <= 0) return state; // Target must have shield
        if (marchUnit.hp <= 0) return state; // March must be alive

        // カウンター エフェクトを確認
        const currentMarch = state.units.find(u => u.id === sourceUnitId);
        if (!currentMarch) return state;

        const counterEffect = currentMarch.effects.find(e => e.id === `march-counter-charges-${sourceUnitId}`);
        if (!counterEffect || (counterEffect.stackCount || 0) <= 0) {
          return state;  // 回数が0なら発動しない
        }

        // Trigger Counter
        const counterAction: any = {
          type: 'FOLLOW_UP_ATTACK',
          sourceId: sourceUnitId,
          targetId: sourceUnit.id,
          eidolonLevel: eidolonLevel,
        };

        // スタック数を減らす
        const newStackCount = (counterEffect.stackCount || 0) - 1;
        const updatedEffect = {
          ...counterEffect,
          stackCount: newStackCount,
          name: `カウンター (${newStackCount}回)`  // 名前も更新
        };

        const updatedMarch = {
          ...currentMarch,
          effects: currentMarch.effects.map(e => e.id === counterEffect.id ? updatedEffect : e)
        };

        return {
          ...state,
          units: state.units.map(u => u.id === sourceUnitId ? updatedMarch : u),
          pendingActions: [...state.pendingActions, counterAction]
        };
      }
      return state;
    }
  };
};
