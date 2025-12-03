import { RelicSet } from '../../types';

export const PRIEST_WHO_WALKS_THE_PATH_OF_SUFFERING: RelicSet = {
  id: 'priest_who_walks_the_path_of_suffering',
  name: '再び苦難の道を歩む司祭',
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
      description: '味方単体に対して戦闘スキルまたは必殺技を発動する時、スキルターゲットの会心ダメージ+18%、2ターン継続。この効果は最大で2層累積できる。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_SKILL_USED', 'ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (!event.targetId) return state;

            // Check if target is ally (and not self? Description says "single ally". Usually includes self unless specified)
            // Assuming "single ally" means any ally target.
            const target = state.units.find(u => u.id === event.targetId);
            if (!target || target.isEnemy) return state;

            // Apply Stacking Buff
            const buffId = 'priest-4pc-cd';
            const existingStack = target.effects.find(e => e.id === buffId);
            let currentStacks = existingStack ? (existingStack as any).stackCount || 1 : 0;

            if (currentStacks < 2) {
              currentStacks++;
            }

            // Refresh duration even if max stacks
            const newEffect = {
              id: buffId,
              name: 'Priest Crit DMG Buff',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'TURN_BASED',
              duration: 2,
              stat: 'crit_dmg',
              value: 0.18 * currentStacks,
              isPercentage: true, // Crit DMG is percentage
              stackCount: currentStacks,
              apply: (u: any, s: any) => s,
              remove: (u: any, s: any) => s
            };

            const newEffects = [
              ...target.effects.filter(e => e.id !== buffId),
              newEffect
            ];

            return {
              ...state,
              units: state.units.map(u => u.id === target.id ? { ...u, effects: newEffects as any[] } : u)
            };
          }
        }
      ],
    },
  ],
};
