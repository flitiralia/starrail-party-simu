import { RelicSet } from '../../types';

export const THE_ASHBLAZING_GRAND_DUKE: RelicSet = {
  id: 'the_ashblazing_grand_duke',
  name: '灰燼を燃やし尽くす大公',
  setBonuses: [
    {
      pieces: 2,
      description: '追加攻撃の与ダメージ+20%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'fua_dmg_boost',
          value: 0.2,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが追加攻撃を行った時、追加攻撃のヒット数に応じて、ダメージを与えるたびに装備者の攻撃力+6%、最大8回まで累積でき、3ターン継続。この効果は、装備キャラが次の追加攻撃を行った時に解除される。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_FOLLOW_UP_ATTACK'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // Reset stacks on new FuA usage
            // Remove 'grand-duke-stack' effect
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = state.units[unitIndex];
            const newEffects = unit.effects.filter(e => e.id !== 'grand-duke-stack');

            return {
              ...state,
              units: state.units.map((u, i) => i === unitIndex ? { ...u, effects: newEffects } : u)
            };
          }
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_DAMAGE_DEALT'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (event.subType !== 'FOLLOW_UP_ATTACK') return state;

            // Add Stack
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = state.units[unitIndex];
            const existingStack = unit.effects.find(e => e.id === 'grand-duke-stack');
            let currentStacks = existingStack ? (existingStack as any).stackCount || 1 : 0;

            if (currentStacks < 8) {
              currentStacks++;

              const newEffect = {
                id: 'grand-duke-stack',
                name: 'Grand Duke ATK Buff',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_BASED',
                duration: 3,
                stat: 'atk_pct',
                value: 0.06 * currentStacks,
                isPercentage: true,
                stackCount: currentStacks,
                apply: (u: any, s: any) => s,
                remove: (u: any, s: any) => s
              };

              const newEffects = [
                ...unit.effects.filter(e => e.id !== 'grand-duke-stack'),
                newEffect
              ];

              return {
                ...state,
                units: state.units.map((u, i) => i === unitIndex ? { ...u, effects: newEffects as any[] } : u)
              };
            }

            return state;
          }
        }
      ],
    },
  ],
};
