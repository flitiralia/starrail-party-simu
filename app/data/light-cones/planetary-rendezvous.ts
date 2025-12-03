import { ILightConeData } from '@/app/types';

export const planetaryRendezvous: ILightConeData = {
  id: 'planetary-rendezvous',
  name: '惑星との出会い',
  path: 'Harmony',
  baseStats: {
    hp: 1058,
    atk: 423,
    def: 330,
  },
  effects: [
    {
      id: 'same_element_dmg_boost',
      name: '旅立ち',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.12, 0.15, 0.18, 0.21, 0.24],
      customHandler: true,
      apply: (wearer, gameState) => {
        const modifierId = `lc-planetary-rendezvous-${wearer.id}-dmg-boost`;
        const effectId = `effect-planetary-rendezvous-${wearer.id}-dmg-boost`;
        const superimposition = wearer.equippedLightCone?.superimposition || 1;
        const value = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];
        const element = wearer.element;

        const newUnits = gameState.units.map(u => {
          if (u.isEnemy) return u;

          // Only apply to allies with the same element
          if (u.element !== element) return u;

          const existingMod = u.modifiers.find(m => m.source === modifierId);
          if (!existingMod) {
            const newUnit = { ...u, stats: { ...u.stats }, modifiers: [...u.modifiers], effects: [...u.effects] };

            const targetStat = `${element.toLowerCase()}_dmg_boost` as keyof typeof newUnit.stats; // e.g., fire_dmg_boost

            const newModifier = {
              target: targetStat,
              source: modifierId,
              type: 'pct' as const,
              value: value,
            };

            if (newUnit.stats[targetStat] === undefined) (newUnit.stats[targetStat] as number) = 0;
            (newUnit.stats[targetStat] as number) += value;

            newUnit.modifiers.push(newModifier);

            newUnit.effects.push({
              id: effectId,
              name: '惑星との出会い (与ダメ)',
              category: 'BUFF',
              sourceUnitId: wearer.id,
              durationType: 'PERMANENT',
              duration: -1,
              apply: (t, s) => s,
              remove: (t, s) => s
            });
            return newUnit;
          }
          return u;
        });

        return { ...gameState, units: newUnits };
      },
      remove: (wearer, gameState) => {
        const modifierId = `lc-planetary-rendezvous-${wearer.id}-dmg-boost`;
        const effectId = `effect-planetary-rendezvous-${wearer.id}-dmg-boost`;
        const superimposition = wearer.equippedLightCone?.superimposition || 1;
        const value = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];
        const element = wearer.element;

        const newUnits = gameState.units.map(u => {
          if (u.isEnemy) return u;
          if (u.element !== element) return u;

          const modIndex = u.modifiers.findIndex(m => m.source === modifierId);
          if (modIndex !== -1) {
            const newUnit = { ...u, stats: { ...u.stats }, modifiers: [...u.modifiers], effects: [...u.effects] };

            newUnit.modifiers.splice(modIndex, 1);

            const targetStat = `${element.toLowerCase()}_dmg_boost` as keyof typeof newUnit.stats;
            if (newUnit.stats[targetStat] !== undefined) {
              (newUnit.stats[targetStat] as number) -= value;
            }

            const effectIndex = newUnit.effects.findIndex(e => e.id === effectId);
            if (effectIndex !== -1) {
              newUnit.effects.splice(effectIndex, 1);
            }
            return newUnit;
          }
          return u;
        });

        return { ...gameState, units: newUnits };
      },
    },
  ],
};
