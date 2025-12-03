import { ILightConeData } from '@/app/types';
import { Unit, GameState } from '@/app/types';

export const perfectTiming: ILightConeData = {
  id: 'perfect-timing',
  name: '今が丁度',
  path: 'Abundance',
  baseStats: {
    hp: 952,
    atk: 423,
    def: 396,
  },
  effects: [
    {
      id: 'effect_res_boost',
      name: '屈折する視線 (効果抵抗)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.16, 0.2, 0.24, 0.28, 0.32],
      targetStat: 'effect_res',
      apply: (unit, gameState) => { return gameState; },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'healing_boost_from_effect_res',
      name: '屈折する視線 (治癒量)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.33, 0.36, 0.39, 0.42, 0.45], // 治癒量アップの乗数
      targetStat: 'outgoing_healing_boost', // Added for clarity, though custom handler handles it
      customHandler: true,
      apply: (wearer: Unit, gameState: GameState) => {
        const modifierId = `lc-perfect-timing-${wearer.id}-healing_boost`;
        const effectId = `effect-perfect-timing-${wearer.id}-healing_boost`;

        const equippedLc = wearer.equippedLightCone;
        if (!equippedLc || equippedLc.lightCone.id !== 'perfect-timing') return gameState;

        const s = equippedLc.superimposition;
        const conversionRate = [0.33, 0.36, 0.39, 0.42, 0.45][s - 1];
        const maxBoost = [0.15, 0.18, 0.21, 0.24, 0.27][s - 1];

        const effectRes = wearer.stats.effect_res || 0;
        const healingBoost = Math.min(effectRes * conversionRate, maxBoost);

        const unitIndex = gameState.units.findIndex(u => u.id === wearer.id);
        if (unitIndex === -1) return gameState;

        const newUnits = [...gameState.units];
        const updatedUnit = { ...newUnits[unitIndex] };

        const existingMod = updatedUnit.modifiers.find(m => m.source === modifierId);

        if (!existingMod) {
          updatedUnit.modifiers.push({
            target: 'outgoing_healing_boost',
            source: modifierId,
            type: 'pct',
            value: healingBoost
          });
          if (updatedUnit.stats.outgoing_healing_boost === undefined) updatedUnit.stats.outgoing_healing_boost = 0;
          updatedUnit.stats.outgoing_healing_boost += healingBoost;

          updatedUnit.effects.push({
            id: effectId,
            name: '屈折する視線 (治癒量)',
            category: 'BUFF',
            sourceUnitId: wearer.id,
            durationType: 'PERMANENT',
            duration: -1,
            apply: (t: Unit, s: GameState) => s,
            remove: (t: Unit, s: GameState) => s
          });
        } else {
          if (Math.abs(existingMod.value - healingBoost) > 0.0001) {
            const oldVal = existingMod.value;
            // Update modifier value in place (or replace object)
            const modIndex = updatedUnit.modifiers.findIndex(m => m.source === modifierId);
            updatedUnit.modifiers[modIndex] = { ...existingMod, value: healingBoost };

            updatedUnit.stats.outgoing_healing_boost = (updatedUnit.stats.outgoing_healing_boost || 0) - oldVal + healingBoost;
          }
        }

        newUnits[unitIndex] = updatedUnit;
        return { ...gameState, units: newUnits };
      },
      remove: (wearer: Unit, gameState: GameState) => {
        const modifierId = `lc-perfect-timing-${wearer.id}-healing_boost`;
        const effectId = `effect-perfect-timing-${wearer.id}-healing_boost`;

        const unitIndex = gameState.units.findIndex(u => u.id === wearer.id);
        if (unitIndex === -1) return gameState;

        const newUnits = [...gameState.units];
        const updatedUnit = { ...newUnits[unitIndex] };

        const modIndex = updatedUnit.modifiers.findIndex(m => m.source === modifierId);
        if (modIndex !== -1) {
          const val = updatedUnit.modifiers[modIndex].value;
          updatedUnit.modifiers.splice(modIndex, 1);
          if (updatedUnit.stats.outgoing_healing_boost !== undefined) {
            updatedUnit.stats.outgoing_healing_boost -= val;
          }
        }

        const effectIndex = updatedUnit.effects.findIndex(e => e.id === effectId);
        if (effectIndex !== -1) {
          updatedUnit.effects.splice(effectIndex, 1);
        }

        newUnits[unitIndex] = updatedUnit;
        return { ...gameState, units: newUnits };
      },
    },
  ],
};

