import { RelicSet, Modifier } from '../../types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect } from '../../simulator/engine/effectManager';

export const MESSENGER_TRAVERSING_HACKERSPACE: RelicSet = {
  id: 'messenger_traversing_hackerspace',
  name: '仮想空間を漫遊するメッセンジャー',
  setBonuses: [
    {
      pieces: 2,
      description: '速度+6%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'spd_pct',
          value: 0.06,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが味方に対して必殺技を発動した時、味方全体の速度+12%、1ターン継続。この効果は累積できない。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            const sourceUnit = state.units.find(u => u.id === sourceUnitId);
            if (!sourceUnit) return state;

            // Check if ultimate targets ally (or self, or all allies)
            const ultimate = sourceUnit.abilities.ultimate;
            const targetType = ultimate.targetType;
            const isAllyTarget = targetType === 'ally' || targetType === 'all_allies' || targetType === 'self' || targetType === 'blast'; // Blast can target ally if main target is ally? Usually blast is for enemies.
            // For buffs, usually 'all_allies' or 'ally'.
            // Some ultimates might be 'single_enemy' but have a secondary effect on allies?
            // The description says "uses their Ultimate on an ally".
            // If it targets an enemy, it doesn't count.
            // So strictly checking targetType is probably safer.
            // But what if targetType is undefined? (e.g. older data)
            // We'll assume strict check for now.

            if (!isAllyTarget) return state;

            const buffId = 'messenger-4pc-spd';

            // Apply to all allies
            let currentState = state;
            state.units.forEach(u => {
              if (!u.isEnemy) {
                const effect: IEffect = {
                  id: buffId,
                  name: 'Messenger 4pc SPD Buff',
                  category: 'BUFF',
                  sourceUnitId: sourceUnitId,
                  durationType: 'DURATION_BASED',
                  duration: 1,
                  stackCount: 1,
                  maxStacks: 1,
                  apply: (unit, gs) => {
                    const mod: Modifier = {
                      target: 'spd_pct',
                      source: buffId,
                      type: 'pct',
                      value: 0.12
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
                currentState = addEffect(currentState, u.id, effect);
              }
            });

            return currentState;
          }
        }
      ],
    },
  ],
};
