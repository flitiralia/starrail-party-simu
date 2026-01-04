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
export function calculateFinalStats(character: Character): FinalStats {
  const stats = initializeCharacterStats();

  // 1. Apply base stats from the character and their light cone
  const charBase = character.baseStats;
  stats.base.hp = charBase.hp;
  stats.base.atk = charBase.atk;
  stats.base.def = charBase.def;
  stats.base.spd = charBase.spd;
  stats.base.aggro = charBase.aggro; // Added aggro
  stats.add.crit_rate = charBase.critRate;
  stats.add.crit_dmg = charBase.critDmg;
  stats.add.max_ep = character.maxEnergy;
  stats.add.energy_regen_rate = 0; // Base ERR is 0%

  if (character.equippedLightCone) {
    const lcBase = character.equippedLightCone.lightCone.baseStats;
    stats.base.hp += lcBase.hp;
    stats.base.atk += lcBase.atk;
    stats.base.def += lcBase.def;

    const superimposition = character.equippedLightCone.superimposition;

    // 新形式のpassiveEffectsを優先的に処理
    if (character.equippedLightCone.lightCone.passiveEffects) {
      character.equippedLightCone.lightCone.passiveEffects.forEach(effect => {
        // 条件なし＆計算なし効果のみ処理
        if (effect.condition || effect.calculateValue) return;

        const statValue = effect.effectValue[superimposition - 1] || 0;
        const targetStatKey = effect.targetStat;

        if (effect.type === 'base') {
          stats.base[targetStatKey] += statValue;
        } else if (STAT_KEYS.includes(targetStatKey)) {
          if (targetStatKey.endsWith('_pct')) {
            stats.pct[targetStatKey] += statValue;
          } else {
            stats.add[targetStatKey] += statValue;
          }
        }
      });
    }
    // 後方互換性: passiveEffectsがなければ旧effectsを処理
    else if (character.equippedLightCone.lightCone.effects) {
      character.equippedLightCone.lightCone.effects.forEach(effect => {
        if (effect.customHandler) return; // Skip custom handlers
        if (effect.condition) return; // 条件付きはスキップ
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
        const allEffects = [
          ...(bonus.passiveEffects || []).map(e => ({ ...e, type: 'PASSIVE_STAT' } as any))
        ];

        allEffects.forEach(effect => {
          if (effect.type === 'PASSIVE_STAT') {
            // Apply passive stat bonus

            // If it has a condition, we must wait for the second pass (unless we are in the second pass?)
            // This function (calculateFinalStats) structure needs to be slightly refactored to handle conditional relics
            // consistent with how Light Cones are handled.
            // For now, let's just apply unconditional ones here, and handling conditional ones requires
            // moving this logic or using the deferred application.

            if (effect.condition) return; // Skip conditional effects in this first pass

            const stat = effect.stat;
            const value = effect.value;

            // Determine if this is a percentage or flat stat
            if (stat.endsWith('_pct') || stat.endsWith('_boost') ||
              stat.includes('dmg') || stat === 'crit_rate' || stat === 'crit_dmg' ||
              stat.includes('ignore') || stat.includes('pen') || stat.includes('res')) {
              stats.pct[stat as StatKey] = (stats.pct[stat as StatKey] || 0) + value;
            } else {
              stats.add[stat as StatKey] = (stats.add[stat as StatKey] || 0) + value;
            }
          }
        });
      }
    });
  });


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
    result.hp = record.base.hp * (1 + (record.pct.hp_pct ?? 0)) + (record.add.hp ?? 0);
    result.atk = record.base.atk * (1 + (record.pct.atk_pct ?? 0)) + (record.add.atk ?? 0);
    result.def = record.base.def * (1 + (record.pct.def_pct ?? 0)) + (record.add.def ?? 0);
    for (const key of STAT_KEYS) {
      if (key !== 'hp' && key !== 'atk' && key !== 'def' && key !== 'spd') {
        result[key] = (record.base[key] ?? 0) + (record.add[key] ?? 0) + (record.pct[key] ?? 0);
      }
    }
    result.spd = record.base.spd * (1 + (record.pct.spd_pct ?? 0)) + (record.add.spd ?? 0);
    return result;
  };

  let finalStats = calculateStatsFromRecord(stats);

  // 5. Apply dynamic effects from the character's active effects list
  for (const effect of character.effects || []) {
    // Handle IStatEffect (legacy)
    if ('stat' in effect && 'value' in effect && 'isPercentage' in effect) {
      const statEffect = effect as IStatEffect;
      const statKey = statEffect.stat;

      if (statEffect.isPercentage) {
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
    // Handle IEffect with modifiers (new/standard)
    if (effect.modifiers) {
      const stackCount = effect.stackCount || 1;
      for (const mod of effect.modifiers) {
        const effectiveStackCount = (mod.scalingStrategy === 'fixed') ? 1 : stackCount;
        const effectiveValue = mod.value * effectiveStackCount;

        if (mod.type === 'base') {
          // Note: modifying base in finalStats is tricky, but let's follow the simple addition for now
          // In a more complex builder, we'd need to re-run the calculation or handle tiers.
          // For final stat view, just add the value.
          finalStats[mod.target] += effectiveValue;
        } else if (mod.target.endsWith('_pct')) {
          // If it's a percentage modifier, apply it to the base
          const baseKey = mod.target.replace('_pct', '') as 'hp' | 'atk' | 'def' | 'spd';
          if (finalStats[baseKey] !== undefined) {
            const baseVal = stats.base[baseKey] || 0;
            finalStats[baseKey] += baseVal * effectiveValue;
          } else {
            // For other stats like crit_rate, just add the percentage
            finalStats[mod.target] += effectiveValue;
          }
        } else {
          finalStats[mod.target] += effectiveValue;
        }
      }
    }
  }

  return finalStats;
}

/**
 * Recalculates a Unit's stats based on their baseStats and current modifiers.
 * This is used to update stats dynamically during simulation.
 */
export function recalculateUnitStats(unit: import('./engine/types').Unit, allUnits?: import('./engine/types').Unit[]): FinalStats {
  // ★ Summon Logic: Inherit from Owner (except SPD)
  if (unit.isSummon && unit.ownerId && allUnits) {
    const owner = allUnits.find(u => u.id === unit.ownerId);
    if (owner) {
      // Ownerのステータスをコピー（参照ではなく値コピー）
      const finalStats = { ...owner.stats };
      // 速度はSummon固有のBase SPDを使用（固定）
      finalStats.spd = unit.baseStats.spd;

      // ★ Apply Modifiers to Summon (e.g. Speed Buffs)
      for (const mod of unit.modifiers) {
        const value = mod.value;
        if (mod.type === 'base' || mod.type === 'add') {
          finalStats[mod.target] += value;
        } else if (mod.type === 'pct') {
          // %バフは召喚ユニットのBaseステータスにかかると仮定
          // (HP/ATK/DEFなどはOwner依存だが、SPDなどは独自)
          const base = unit.baseStats[mod.target] || 0;
          finalStats[mod.target] += base * value;
        }
      }

      // ★ Apply Effect Modifiers to Summon
      for (const effect of unit.effects || []) {
        if ('modifiers' in effect && effect.modifiers) {
          const stackCount = effect.stackCount || 1;
          for (const mod of effect.modifiers as import('../types').Modifier[]) {
            let baseValue = mod.value;
            // dynamicValue対応
            if (mod.dynamicValue && allUnits) {
              try {
                baseValue = mod.dynamicValue(unit, allUnits);
              } catch (e) {
                baseValue = mod.value;
              }
            }
            // スケーリング戦略の確認
            const effectiveStackCount = (mod.scalingStrategy === 'fixed') ? 1 : stackCount;
            const effectiveValue = baseValue * effectiveStackCount;

            if (mod.type === 'base' || mod.type === 'add') {
              finalStats[mod.target] += effectiveValue;
            } else if (mod.type === 'pct') {
              const base = unit.baseStats[mod.target] || 0;
              finalStats[mod.target] += base * effectiveValue; // statBuilder.ts:326
            }
          }
        }
      }

      return finalStats;
    }
  }

  const stats = initializeCharacterStats();

  // 1. Base Stats (Char + LC)
  stats.base.hp = unit.baseStats.hp;
  stats.base.atk = unit.baseStats.atk;
  stats.base.def = unit.baseStats.def;
  stats.base.spd = unit.baseStats.spd;
  stats.base.aggro = unit.baseStats.aggro; // Added aggro


  // Note: unit.baseStats doesn't have crit/energy/etc breakdown, but they are usually 0 or fixed base.
  // Populate other stats from unit.baseStats (which acts as the starting point)
  for (const key of STAT_KEYS) {
    if (key !== 'hp' && key !== 'atk' && key !== 'def' && key !== 'spd') {
      stats.add[key] = unit.baseStats[key] || 0;
    }
  }

  // 1.5 Light Cone Passive Effects
  // NOTE: 光円錐パッシブ効果は lightConeHandlers.ts で IEffect として unit.effects に追加されるため、
  // ここでの直接適用は不要（二重適用防止）。modifiers 経由で statBuilder の 2.5 セクションで処理される。

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
    if (mod.type === 'base') {
      stats.base[mod.target] += mod.value;
    } else if (mod.type === 'pct') {
      stats.pct[mod.target] += mod.value;
    } else {
      stats.add[mod.target] += mod.value;
    }
  }

  // 5. Effect Modifiers (NEW: エフェクトが持つモディファイアも統合)
  for (const effect of unit.effects || []) {
    if ('modifiers' in effect && effect.modifiers) {
      // スタック数を取得（デフォルトは1）
      const stackCount = effect.stackCount || 1;

      for (const mod of effect.modifiers as import('../types').Modifier[]) {
        // 動的計算の評価: dynamicValueが存在する場合はそちらを使用
        let baseValue = mod.value;
        if (mod.dynamicValue && allUnits) {
          try {
            baseValue = mod.dynamicValue(unit, allUnits);
          } catch (e) {
            console.warn(`[StatBuilder] dynamicValue evaluation failed for ${mod.source}:`, e);
            baseValue = mod.value; // フォールバック
          }
        }

        // スケーリング戦略の確認
        const effectiveStackCount = (mod.scalingStrategy === 'fixed') ? 1 : stackCount;
        const effectiveValue = baseValue * effectiveStackCount;

        console.log(`[StatBuilder] Applying effect modifier: ${mod.target} += ${effectiveValue} (${mod.type}) from ${mod.source} (stack: ${stackCount})`);

        // Use target stat name to determine bucket, not mod.type
        // Stats ending in _pct (like hp_pct, atk_pct) go into pct bucket
        // Flat stats (like hp, atk, spd) go into add bucket
        if (mod.type === 'base') {
          stats.base[mod.target] += effectiveValue;
        } else if (mod.target.endsWith('_pct')) {
          stats.pct[mod.target] += effectiveValue;
        } else {
          stats.add[mod.target] += effectiveValue;
        }
      }
    }
  }

  // 6. Calculate Final
  const result = createEmptyStatRecord() as FinalStats;
  result.hp = stats.base.hp * (1 + (stats.pct.hp_pct ?? 0)) + (stats.add.hp ?? 0);
  result.atk = stats.base.atk * (1 + (stats.pct.atk_pct ?? 0)) + (stats.add.atk ?? 0);
  result.def = stats.base.def * (1 + (stats.pct.def_pct ?? 0)) + (stats.add.def ?? 0);

  for (const key of STAT_KEYS) {
    if (key !== 'hp' && key !== 'atk' && key !== 'def' && key !== 'spd' && key !== 'aggro') {
      result[key] = (stats.base[key] ?? 0) + (stats.add[key] ?? 0) + (stats.pct[key] ?? 0);
    }
  }
  result.spd = stats.base.spd * (1 + (stats.pct.spd_pct ?? 0)) + (stats.add.spd ?? 0);
  result.aggro = (stats.base.aggro ?? 0) * (1 + (stats.pct.aggro || 0)) + (stats.add.aggro || 0); // Calculate aggro separately if needed, or included in loop if treated normally. 
  // Ideally aggro is just base + add + pct like others, but let's stick to the pattern used for spd/hp/etc if it's special. 
  // Actually, aggro usually doesn't have a %. But let's follow the pattern.
  // Wait, the loop handles everything ELSE.
  // Let's add explicit calculation for aggro to be safe and clear.

  return result;
}
