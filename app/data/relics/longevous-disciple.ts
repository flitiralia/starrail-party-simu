import { RelicSet } from '../../types';
import { Modifier } from '@/app/types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect } from '../../simulator/engine/effectManager';

export const LONGEVOUS_DISCIPLE: RelicSet = {
  id: 'longevous_disciple',
  name: '宝命長存の蒔者',
  setBonuses: [
    {
      pieces: 2,
      description: '最大HP+12%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'hp_pct',
          value: 0.12,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが攻撃を受ける、または味方によってHPを消費させられた時、会心率+8%、2ターン継続。最大2層累積できる。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_DAMAGE_DEALT'], // TODO: Add ON_HP_CONSUMED when engine supports HP costs
          handler: (event, state, sourceUnitId) => {
            // Check if wearer was hit (target of damage)
            if (event.targetId !== sourceUnitId) return state;

            const buffId = 'longevous-4pc-crit';

            const effect: IEffect = {
              id: buffId,
              name: 'Longevous Disciple 4pc Crit',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'DURATION_BASED', // "2 turns"
              duration: 2,
              stackCount: 1,
              maxStacks: 2,
              apply: (unit, gs) => {
                const stackCount = unit.effects.find(e => e.id === buffId)?.stackCount || 1;
                const mod: Modifier = {
                  target: 'crit_rate',
                  source: buffId,
                  type: 'add', // Crit Rate is usually additive (e.g. +8% = +0.08)
                  value: 0.08 * stackCount
                };
                return {
                  ...gs,
                  units: gs.units.map(u => u.id === unit.id ? { ...u, modifiers: [...u.modifiers, mod] } : u)
                };
              },
              remove: (unit, gs) => {
                return {
                  ...gs,
                  units: gs.units.map(u => u.id === unit.id ? { ...u, modifiers: u.modifiers.filter(m => m.source !== buffId) } : u)
                };
              }
            };

            return addEffect(state, sourceUnitId, effect);
          }
        }
      ],
    },
  ],
};
