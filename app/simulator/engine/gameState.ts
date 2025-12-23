import { GameState, Unit, IEventHandlerLogic, IEventHandler, ActionContext, Action, BasicAttackAction, SkillAction, UltimateAction, BattleStartAction, RegisterHandlersAction, ActionAdvanceAction, FollowUpAttackAction, IEvent } from './types';
import { SimulationLogEntry, IAbility, Character, Enemy, CharacterConfig, EnemyConfig, PartyConfig, Element, ELEMENTS, StatKey, FinalStats, SimulationConfig, AbilityModifier } from '../../types/index';
import { calculateFinalStats, createEmptyStatRecord } from '../statBuilder';
import { initializeEnergy } from './energy';
import { registry } from '../registry/index';
import { IEffect } from '../effect/types';
import { addEffect } from './effectManager';
import { registerLightConeEventHandlers } from './lightConeHandlers';
import { UnitId, createUnitId } from './unitId';
import { UnitRegistry } from './unitRegistry';



/**
 * GameState内の特定のユニットのプロパティを更新し、新しいGameStateを返します。
 * これは不変性（Immutability）を保つためのヘルパーです。
 * @deprecated Use state.registry.update(id, updateFn) instead
 */

// createPlanetaryRendezvousEventHandler は自動登録に移行するため削除

/**
 * Creates the initial state of the game from character and enemy data.
 * @param characters The array of characters in the party.
 * @param enemies The array of enemies to fight.
 * @param weaknesses A set of elements the enemy is weak to.
 * @param enemyConfig The user-defined stats for the enemy.
 * @param config The simulation configuration.e object.
 */
export function createInitialGameState(
  config: SimulationConfig,
): GameState {
  const { characters, enemies, weaknesses, partyConfig, enemyConfig } = config;

  const characterUnits: Unit[] = characters.map((char, index) => {
    const stats = calculateFinalStats(char, true); // Exclude conditional buffs for initial state (handled by handlers)

    // パーティ設定から個別キャラの設定を取得（なければデフォルトまたは後方互換用のcharacterConfigを使用）
    let charConfig: CharacterConfig | undefined;
    let eidolonLevel = 0; // 星魂レベル

    if (partyConfig && partyConfig.members[index]?.enabled) {
      const member = partyConfig.members[index];
      charConfig = member.config;
      eidolonLevel = member.eidolonLevel || 0; // 星魂レベルを取得
      console.log(`[createInitialGameState] Character ${char.id} Eidolon Level: ${eidolonLevel}`);
    }

    // Clone abilities to avoid mutating original data
    const abilities = JSON.parse(JSON.stringify(char.abilities));

    // Apply Eidolon Ability Modifiers
    if (char.eidolons) {
      Object.values(char.eidolons).forEach(eidolon => {
        if (eidolon && eidolon.level <= eidolonLevel && eidolon.abilityModifiers) {
          eidolon.abilityModifiers.forEach((mod: AbilityModifier) => {
            const { abilityName, param, value } = mod;
            if (abilities[abilityName]) {
              // param (例: "damage.multiplier") を解析して値を設定
              const parts = param.split('.');
              let current = abilities[abilityName];
              let validPath = true;

              for (let i = 0; i < parts.length - 1; i++) {
                if (current[parts[i]]) {
                  current = current[parts[i]];
                } else {
                  validPath = false;
                  break;
                }
              }

              if (validPath && current) {
                current[parts[parts.length - 1]] = value;
              }
            }
          });
        }
      });
    }

    const unit: Unit = {
      id: createUnitId(char.id),
      name: char.name,
      isEnemy: false,
      element: char.element,
      path: char.path,
      level: 80,
      abilities: abilities, // 調整後のabilitiesを使用
      stats: stats,
      baseStats: {
        ...createEmptyStatRecord(),
        hp: char.baseStats.hp + (char.equippedLightCone?.lightCone.baseStats.hp ?? 0),
        atk: char.baseStats.atk + (char.equippedLightCone?.lightCone.baseStats.atk ?? 0),
        def: char.baseStats.def + (char.equippedLightCone?.lightCone.baseStats.def ?? 0),
        spd: char.baseStats.spd,
        crit_rate: char.baseStats.critRate,
        crit_dmg: char.baseStats.critDmg,
        max_ep: char.maxEnergy,
        energy_regen_rate: 0,
        break_effect: 0,
        effect_hit_rate: 0,
        effect_res: 0,
        outgoing_healing_boost: 0,
        physical_dmg_boost: 0,
        fire_dmg_boost: 0,
        ice_dmg_boost: 0,
        lightning_dmg_boost: 0,
        wind_dmg_boost: 0,
        quantum_dmg_boost: 0,
        imaginary_dmg_boost: 0,
        basic_atk_dmg_boost: 0,
        skill_dmg_boost: 0,
        ult_dmg_boost: 0,
        fua_dmg_boost: 0,
        dot_dmg_boost: 0,
        all_type_dmg_boost: 0,
        physical_res_pen: 0,
        fire_res_pen: 0,
        ice_res_pen: 0,
        lightning_res_pen: 0,
        wind_res_pen: 0,
        quantum_res_pen: 0,
        imaginary_res_pen: 0,
        all_type_res_pen: 0,
        def_ignore: 0,
        def_reduction: 0,
        speed_boost: 0,
        break_efficiency_boost: 0,
        super_break_dmg_boost: 0,
        physical_res: 0,
        fire_res: 0,
        ice_res: 0,
        lightning_res: 0,
        wind_res: 0,
        quantum_res: 0,
        imaginary_res: 0,
        physical_vuln: 0,
        fire_vuln: 0,
        ice_vuln: 0,
        lightning_vuln: 0,
        wind_vuln: 0,
        quantum_vuln: 0,
        imaginary_vuln: 0,
        all_type_vuln: 0,
      } as FinalStats,
      hp: stats.hp,
      ep: 0, // Will be initialized below
      shield: 0,
      toughness: 0, // Characters don't have toughness
      maxToughness: 0,
      weaknesses: new Set(), // Characters don't have weaknesses
      modifiers: [],
      effects: char.effects || [], // CharacterDataのeffectsを初期値として設定
      actionValue: Math.floor(10000 / stats.spd),
      config: charConfig,
      rotationIndex: 0,
      ultCooldown: 0,
      equippedLightCone: char.equippedLightCone,
      eidolonLevel: eidolonLevel,
      relics: char.relics,
      ornaments: char.ornaments,
      traces: char.traces,
      disableEnergyRecovery: char.disableEnergyRecovery,
    };

    // Initialize Energy (50% start, or 0% if energy recovery is disabled)
    const initialEnergyRatio = unit.disableEnergyRecovery ? 0 : 0.5;
    const unitWithEnergy = initializeEnergy(unit, initialEnergyRatio);

    // Apply Character Mechanics (Traces, Eidolons that modify structure beyond simple params)
    return applyCharacterMechanics(unitWithEnergy);
  });

  const enemyUnits: Unit[] = enemies.map(enemy => {
    // Enemy stats are a mix of base data and user config
    const stats = {
      ...createEmptyStatRecord(),
      hp: enemyConfig.maxHp, // Override with user config
      atk: enemyConfig.atk ?? enemy.baseStats.atk, // Use config or base
      def: enemyConfig.def ?? enemy.baseStats.def, // Use config or base
      spd: enemyConfig.spd, // Override with user config
    };

    // Apply resistances based on weakness selection
    ELEMENTS.forEach(element => {
      const resKey = `${element.toLowerCase()}_res` as StatKey;
      const isWeak = weaknesses.has(element);
      // If weak, RES is 0. Otherwise, use base RES (defaulting to 20%).
      stats[resKey] = isWeak ? 0 : (enemy.baseRes[element] ?? 0.2);
    });

    const unit: Unit = {
      id: createUnitId(enemy.id),
      name: enemy.name,
      isEnemy: true,
      element: enemy.element,
      level: enemyConfig.level, // Override with user config
      abilities: enemy.abilities, // IUnitDataを継承したため、abilitiesはここに存在
      stats: stats,
      baseStats: { ...stats }, // Enemies usually have fixed stats, so base = initial
      hp: stats.hp,
      ep: 0,
      shield: 0,
      toughness: enemyConfig.toughness, // Override with user config
      maxToughness: enemyConfig.toughness, // Override with user config
      weaknesses: weaknesses, // Apply weaknesses from UI
      modifiers: [],
      effects: [],
      actionValue: Math.floor(10000 / stats.spd),
      rotationIndex: 0,
      ultCooldown: 0,
    };
    return unit;
  });

  // Check for Passerby of Wandering Cloud 4-pc bonus


  // Note: Event handlers are registered via dispatch in runSimulation.
  // We only initialize the GameState structure here.

  const allUnits = [...characterUnits, ...enemyUnits];

  let initialState: GameState = { // 明示的に GameState 型を指定
    registry: new UnitRegistry(allUnits),
    skillPoints: 3,
    maxSkillPoints: 5, // Default max SP
    time: 0,
    log: [],
    eventHandlers: [], // 初期ハンドラは空（registry経由で登録）
    eventHandlerLogics: {},
    damageModifiers: {}, // 新しく追加された一時修飾子を空で初期化
    cooldowns: {}, // クールダウンマップを空で初期化
    cooldownMetadata: {}, // クールダウンメタデータを空で初期化
    pendingActions: [], // アクションスタックを空で初期化
    actionQueue: [], // Will be initialized in simulation start or via helper
    result: {
      totalDamageDealt: 0,
      characterStats: {},
    },
    auras: [], // オーラを空で初期化
  };

  // 光円錐イベントハンドラー登録
  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const unitId = createUnitId(char.id);
    initialState = registerLightConeEventHandlers(initialState, char, unitId);
  }

  return initialState;
}

export function applyCharacterMechanics(unit: Unit): Unit {
  console.log(`[applyCharacterMechanics] Called for ${unit.id}, Eidolon: ${unit.eidolonLevel}`);
  if (unit.id === 'march-7th') {
    let newUnit = { ...unit };
    const abilities = { ...unit.abilities };

    // Trace: Reinforce (Shield Duration +1)
    const reinforceTrace = unit.traces?.find(t => t.id === 'march-trace-reinforce');
    if (reinforceTrace && abilities.skill.shield) {
      abilities.skill = {
        ...abilities.skill,
        shield: {
          ...abilities.skill.shield,
          duration: (abilities.skill.shield.duration || 3) + 1
        }
      };
    }

    // Trace: Purify (Cleanse on Skill)
    const purifyTrace = unit.traces?.find(t => t.id === 'march-trace-purify');
    if (purifyTrace) {
      const existingEffects = abilities.skill.effects || [];
      abilities.skill = {
        ...abilities.skill,
        effects: [
          ...existingEffects,
          {
            type: 'Cleanse',
            target: 'target',
            baseChance: 1.0,
            description: 'Removes 1 debuff from an ally.'
          }
        ]
      };
    }

    // Eidolon 4: Counter deals additional DMG equal to 30% of DEF
    if ((unit.eidolonLevel || 0) >= 4) {
      const talent = abilities.talent;
      if (talent) {
        abilities.talent = {
          ...talent,
          additionalDamage: [
            ...(talent.additionalDamage || []),
            {
              type: 'simple',
              scaling: 'def',
              hits: [{ multiplier: 0.30, toughnessReduction: 0 }]
            }
          ]
        };
      }
    }

    newUnit.abilities = abilities;
    return newUnit;
  } else if (unit.id === 'tribbie') {
    let newUnit = { ...unit };
    const abilities = { ...unit.abilities };

    // Eidolon 4: Divine Revelation grants Def Ignore
    if ((unit.eidolonLevel || 0) >= 4) {
      const skill = abilities.skill;
      if (skill && skill.effects) {
        const divineRevelation = skill.effects.find(e => e.name === 'Divine Revelation');
        if (divineRevelation) {
          if (divineRevelation.modifiers) {
            // Check if already applied (to avoid duplicates if called multiple times, though usually called once)
            if (!divineRevelation.modifiers.find(m => m.target === 'def_ignore')) {
              divineRevelation.modifiers.push({
                target: 'def_ignore',
                source: 'Divine Revelation (E4)',
                type: 'add',
                value: 0.18
              });
            }
          } else {
            // Divine Revelation has no modifiers array
          }
        } else {
          // Divine Revelation effect not found
        }
      }
    }

    newUnit.abilities = abilities;
    return newUnit;
  }
  return unit;
}
