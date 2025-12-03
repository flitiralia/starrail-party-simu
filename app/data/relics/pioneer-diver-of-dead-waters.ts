import { RelicSet } from '../../types';

export const PIONEER_DIVER_OF_DEAD_WATERS: RelicSet = {
  id: 'pioneer_diver_of_dead_waters',
  name: '死水に潜る先駆者',
  setBonuses: [
    {
      pieces: 2,
      description: 'デバフ状態の敵への与ダメージ+12%。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (!event.targetId) return state;

            const target = state.units.find(u => u.id === event.targetId);
            if (!target) return state;

            // Check for debuffs
            const debuffCount = target.effects.filter(e => e.category === 'DEBUFF').length;
            if (debuffCount > 0) {
              return {
                ...state,
                damageModifiers: {
                  ...state.damageModifiers,
                  allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + 0.12
                }
              };
            }
            return state;
          }
        }
      ],
    },
    {
      pieces: 4,
      description:
        '会心率+4%。デバフが2/3つ以上ある敵に対する会心ダメージ+8%/12%。装備キャラが敵にデバフを付与した後、上記の効果は2倍になる、1ターン継続。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'crit_rate',
          value: 0.04,
          target: 'self'
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_DEBUFF_APPLIED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // Apply Pioneer Doubler Buff
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = state.units[unitIndex];
            const buff = {
              id: 'pioneer-doubler',
              name: 'Pioneer Doubler',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'TURN_BASED',
              duration: 1,
              apply: (u: any, s: any) => s,
              remove: (u: any, s: any) => s
            };

            const newEffects = [
              ...unit.effects.filter(e => e.id !== 'pioneer-doubler'),
              buff
            ];

            return {
              ...state,
              units: state.units.map((u, i) => i === unitIndex ? { ...u, effects: newEffects as any[] } : u)
            };
          }
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (!event.targetId) return state;

            const target = state.units.find(u => u.id === event.targetId);
            const source = state.units.find(u => u.id === sourceUnitId);
            if (!target || !source) return state;

            const debuffCount = target.effects.filter(e => e.category === 'DEBUFF').length;
            const isDoubled = source.effects.some(e => e.id === 'pioneer-doubler');
            const multiplier = isDoubled ? 2 : 1;

            // 2pc Effect (Re-implementing here if needed or separate?)
            // 2pc is DMG boost. 4pc is Crit Rate/DMG.
            // Wait, 4pc says "The above effects increase by 100%".
            // Does "above effects" include 2pc? Usually yes.
            // "After the wearer inflicts a debuff... the aforementioned effects increase by 100%".
            // "Aforementioned" usually refers to the 4pc effects (CR +4%, CD +8/12%).
            // But some sets double the 2pc too.
            // Wiki says: "CR +4%, CD +8%/12%... After wearer inflicts debuff, these effects increase by 100%".
            // It usually refers to the 4pc bonuses.
            // Let's assume it doubles CR and CD bonuses from 4pc.

            // Crit DMG Boost
            let cdBoost = 0;
            if (debuffCount >= 3) cdBoost = 0.12;
            else if (debuffCount >= 2) cdBoost = 0.08;

            cdBoost *= multiplier;

            // Crit Rate Boost (Doubling the passive 4%)
            // Since passive is already applied (+4%), we need to add another +4% if doubled.
            let crBoost = 0;
            if (isDoubled) crBoost = 0.04;

            // Apply to modifiers
            // Again, need DamageCalculationModifiers to support CR/CD or modify source stats temporarily.
            // damage.ts calculates damage. It uses source.stats.crit_dmg.
            // If I modify damageModifiers, I need to ensure calculateDamage uses them.
            // Currently damageModifiers has defIgnore.
            // I should add critRate and critDmg to DamageCalculationModifiers.

            return {
              ...state,
              damageModifiers: {
                ...state.damageModifiers,
                critDmg: (state.damageModifiers.critDmg || 0) + cdBoost,
                critRate: (state.damageModifiers.critRate || 0) + crBoost
              }
            };
          }
        }
      ],
    },
  ],
};
