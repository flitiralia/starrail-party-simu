import {
  Character,
  CharacterStats,
  FinalStats,
  StatKey,
  STAT_KEYS,
  IRelicData,
  IOrnamentData,
} from '../types';
import { IStatEffect } from './effect/types';

/**
 * Creates an empty StatRecord with all stat values initialized to 0.
 * This ensures that all stats are accounted for, preventing runtime errors.
 * @returns A StatRecord object with all values set to 0.
 */
export function createEmptyStatRecord(): Record<StatKey, number> {
  return Object.fromEntries(STAT_KEYS.map(key => [key, 0])) as Record<StatKey, number>;
}

/**
 * Initializes a CharacterStats object with empty StatRecords.
 * @returns An empty CharacterStats object.
 */
function initializeCharacterStats(): CharacterStats {
  return {
    base: createEmptyStatRecord(),
    add: createEmptyStatRecord(),
    pct: createEmptyStatRecord(),
  };
}

/**
 * Calculates the final stats for a character based on their base stats,
 * light cone, relics, and ornaments.
 *
 * @param character The character object with all their equipment.
 * @returns The calculated FinalStats object.
 */
export function calculateFinalStats(character: Character, excludeConditional: boolean = false): FinalStats {
  const stats = initializeCharacterStats();

  // 1. Apply base stats from the character and their light cone
  const charBase = character.baseStats;
  stats.base.hp = charBase.hp;
  stats.base.atk = charBase.atk;
  stats.base.def = charBase.def;
  stats.base.spd = charBase.spd;
  stats.add.crit_rate = charBase.critRate;
  stats.add.crit_dmg = charBase.critDmg;
  stats.add.max_ep = character.maxEnergy;
  stats.add.energy_regen_rate = 0; // Base ERR is 0%

  if (character.equippedLightCone) {
    const lcBase = character.equippedLightCone.lightCone.baseStats;
    stats.base.hp += lcBase.hp;
    stats.base.atk += lcBase.atk;
    stats.base.def += lcBase.def;

    // Apply static light cone effects (only those with targetStat and number effectValue)
    const superimposition = character.equippedLightCone.superimposition;
    character.equippedLightCone.lightCone.effects.forEach(effect => {
      if (effect.customHandler) return; // Skip custom handlers
      if (effect.targetStat && Array.isArray(effect.effectValue)) {
        const statValue = effect.effectValue[superimposition - 1] || 0;
        const targetStatKey = effect.targetStat;

        if (STAT_KEYS.includes(targetStatKey)) {
          if (targetStatKey.endsWith('_pct')) {
            stats.pct[targetStatKey] += statValue;
          } else {
            stats.add[targetStatKey] += statValue;
          }
        }
      }
    });
  }

  // 2. Aggregate stats from relics and ornaments (main stats and sub-stats)
  const allRelics = [...(character.relics || []), ...(character.ornaments || [])];
  for (const relic of allRelics) {
    const allStats = [relic.mainStat, ...relic.subStats];
    for (const stat of allStats) {
      if (stat.stat.endsWith('_pct')) {
        stats.pct[stat.stat as StatKey] += stat.value;
      } else {
        stats.add[stat.stat as StatKey] += stat.value;
      }
    }
  }

  // 3. Aggregate stat bonuses from relic and ornament set effects
  const setCounts = new Map<string, number>();
  allRelics.forEach(r => {
    if (r.set) {
      setCounts.set(r.set.id, (setCounts.get(r.set.id) || 0) + 1);
    }
  });

  // ★ Apply Set Bonuses (2-set and 4-set) ★
  setCounts.forEach((count, setId) => {
    // Find the relic/ornament with this set
    const relicOrOrnament = allRelics.find(r => r.set?.id === setId);
    if (!relicOrOrnament?.set) return;

    const setBonuses = relicOrOrnament.set.setBonuses;

    // Apply bonuses based on equipped piece count
    setBonuses.forEach(bonus => {
      if (count >= bonus.pieces) {
        // Process each effect in the bonus
        bonus.effects.forEach(effect => {
          if (effect.type === 'PASSIVE_STAT') {
            // Apply passive stat bonus
            const stat = effect.stat;
            const value = effect.value;

            // Determine if this is a percentage or flat stat
            // Percentage stats: end with _pct, _boost, dmg, crit_rate, crit_dmg, ignore, pen, res
            if (stat.endsWith('_pct') || stat.endsWith('_boost') ||
              stat.includes('dmg') || stat === 'crit_rate' || stat === 'crit_dmg' ||
              stat.includes('ignore') || stat.includes('pen') || stat.includes('res')) {
              // Percentage/boost stats
              stats.pct[stat as StatKey] = (stats.pct[stat as StatKey] || 0) + value;
            } else {
              // Flat stats
              stats.add[stat as StatKey] = (stats.add[stat as StatKey] || 0) + value;
            }
          }
          // EVENT_TRIGGER effects are handled by event handlers (not here)
        });
      }
    });
  });

  // Helper function to apply Light Cone effects (Conditional)
  const applyLightConeEffects = (currentStats: CharacterStats, isSecondPass: boolean, preliminaryFinalStats?: FinalStats) => {
    if (!character.equippedLightCone) return;

    const superimposition = character.equippedLightCone.superimposition;
    character.equippedLightCone.lightCone.effects.forEach(effect => {
      if (effect.customHandler) return; // Skip custom handlers
      // Check if effect is applicable in this pass
      const hasCondition = !!effect.condition;
      if (isSecondPass !== hasCondition) return;

      // If excludeConditional is true, skip conditional effects
      if (excludeConditional && hasCondition) return;

      // If second pass, check condition against preliminary stats
      if (isSecondPass && effect.condition && preliminaryFinalStats) {
        if (!effect.condition(preliminaryFinalStats)) return;
      }

      // Apply effect
      if (effect.targetStat && Array.isArray(effect.effectValue)) {
        const statValue = effect.effectValue[superimposition - 1] || 0;
        const targetStatKey = effect.targetStat;

        if (STAT_KEYS.includes(targetStatKey)) {
          if (targetStatKey.endsWith('_pct')) {
            currentStats.pct[targetStatKey] += statValue;
          } else {
            currentStats.add[targetStatKey] += statValue;
          }
        }
      }
    });
  };

  // 3.5. Aggregate stat bonuses from Traces
  if (character.traces) {
    for (const trace of character.traces) {
      if (trace.type === 'Stat Bonus' && trace.stat && trace.value) {
        if (trace.stat.endsWith('_pct')) {
          stats.pct[trace.stat as StatKey] += trace.value;
        } else {
          stats.add[trace.stat as StatKey] += trace.value;
        }
      }
    }
  }

  // 4. Calculate Preliminary Final Stats (for conditional checks)
  const calculateStatsFromRecord = (record: CharacterStats): FinalStats => {
    const result = createEmptyStatRecord() as FinalStats;
    result.hp = record.base.hp * (1 + record.pct.hp_pct) + record.add.hp;
    result.atk = record.base.atk * (1 + record.pct.atk_pct) + record.add.atk;
    result.def = record.base.def * (1 + record.pct.def_pct) + record.add.def;
    for (const key of STAT_KEYS) {
      if (key !== 'hp' && key !== 'atk' && key !== 'def' && key !== 'spd') {
        result[key] = record.base[key] + record.add[key] + record.pct[key];
      }
    }
    result.spd = record.base.spd * (1 + record.pct.spd_pct) + record.add.spd;
    return result;
  };

  let finalStats = calculateStatsFromRecord(stats);

  // Second Pass: Conditional Bonuses
  applyLightConeEffects(stats, true, finalStats);

  // Recalculate Final Stats with Conditional Bonuses
  finalStats = calculateStatsFromRecord(stats);


  // 5. Apply dynamic effects from the character's active effects list
  for (const effect of character.effects || []) {
    // Currently, only handle IStatEffect
    if ('stat' in effect && 'value' in effect && 'isPercentage' in effect) {
      const statEffect = effect as IStatEffect;
      const statKey = statEffect.stat;

      if (statEffect.isPercentage) {
        // This is a simplification. A real implementation would need to distinguish
        // between base stat pct increases and final stat pct increases.
        // For now, we'll assume it modifies the final stat.
        if (statKey === 'hp_pct' || statKey === 'atk_pct' || statKey === 'def_pct') {
          const baseStatKey = statKey.split('_')[0] as 'hp' | 'atk' | 'def';
          finalStats[baseStatKey] *= (1 + statEffect.value);
        } else {
          finalStats[statKey as StatKey] += statEffect.value;
        }
      } else {
        finalStats[statKey as StatKey] += statEffect.value;
      }
    }
  }

  return finalStats;
}

/**
 * Recalculates a Unit's stats based on their baseStats and current modifiers.
 * This is used to update stats dynamically during simulation.
 */
export function recalculateUnitStats(unit: import('./engine/types').Unit): FinalStats {
  const stats = initializeCharacterStats();

  // 1. Base Stats (Char + LC)
  stats.base.hp = unit.baseStats.hp;
  stats.base.atk = unit.baseStats.atk;
  stats.base.def = unit.baseStats.def;
  stats.base.spd = unit.baseStats.spd;

  // Note: unit.baseStats doesn't have crit/energy/etc breakdown, but they are usually 0 or fixed base.
  // Populate other stats from unit.baseStats (which acts as the starting point)
  for (const key of STAT_KEYS) {
    if (key !== 'hp' && key !== 'atk' && key !== 'def' && key !== 'spd') {
      stats.add[key] = unit.baseStats[key] || 0;
    }
  }

  // 2. Relics & Ornaments (Main & Sub Stats)
  const allRelics = [...(unit.relics || []), ...(unit.ornaments || [])];
  for (const relic of allRelics) {
    const allStats = [relic.mainStat, ...relic.subStats];
    for (const stat of allStats) {
      if (stat.stat.endsWith('_pct')) {
        stats.pct[stat.stat as StatKey] += stat.value;
      } else {
        stats.add[stat.stat as StatKey] += stat.value;
      }
    }
  }

  // 3. Traces
  if (unit.traces) {
    for (const trace of unit.traces) {
      if (trace.type === 'Stat Bonus' && trace.stat && trace.value) {
        if (trace.stat.endsWith('_pct')) {
          stats.pct[trace.stat as StatKey] += trace.value;
        } else {
          stats.add[trace.stat as StatKey] += trace.value;
        }
      }
    }
  }

  // 4. Modifiers (Buffs/Debuffs)
  for (const mod of unit.modifiers) {
    console.log(`[StatBuilder] Applying modifier: ${mod.target} += ${mod.value} (${mod.type}) from ${mod.source}`);
    if (mod.type === 'pct') {
      stats.pct[mod.target] += mod.value;
    } else {
      stats.add[mod.target] += mod.value;
    }
  }

  // 5. Effect Modifiers (NEW: エフェクトが持つモディファイアも統合)
  for (const effect of unit.effects || []) {
    if ('modifiers' in effect && effect.modifiers) {
      for (const mod of effect.modifiers as import('../types').Modifier[]) {
        console.log(`[StatBuilder] Applying effect modifier: ${mod.target} += ${mod.value} (${mod.type}) from ${mod.source}`);
        if (mod.type === 'pct') {
          stats.pct[mod.target] += mod.value;
        } else {
          stats.add[mod.target] += mod.value;
        }
      }
    }
  }

  // 6. Calculate Final
  const result = createEmptyStatRecord() as FinalStats;
  result.hp = stats.base.hp * (1 + stats.pct.hp_pct) + stats.add.hp;
  result.atk = stats.base.atk * (1 + stats.pct.atk_pct) + stats.add.atk;
  result.def = stats.base.def * (1 + stats.pct.def_pct) + stats.add.def;

  for (const key of STAT_KEYS) {
    if (key !== 'hp' && key !== 'atk' && key !== 'def' && key !== 'spd') {
      result[key] = stats.base[key] + stats.add[key] + stats.pct[key];
    }
  }
  result.spd = stats.base.spd * (1 + stats.pct.spd_pct) + stats.add.spd;

  return result;
}
