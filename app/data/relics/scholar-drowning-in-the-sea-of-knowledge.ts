import { RelicSet } from '../../types';

export const SCHOLAR_DROWNING_IN_THE_SEA_OF_KNOWLEDGE: RelicSet = {
  id: 'scholar_drowning_in_the_sea_of_knowledge',
  name: '知識の海に溺れる学者',
  setBonuses: [
    {
      pieces: 2,
      description: '会心率+8%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'crit_rate',
          value: 0.08,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '戦闘スキルおよび必殺技によるダメージ+20%。必殺技を発動した後、次に戦闘スキルを発動する時、与ダメージがさらに+25%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'skill_dmg_boost',
          value: 0.2,
          target: 'self'
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'ult_dmg_boost',
          value: 0.2,
          target: 'self'
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // Apply "Next Skill Boost" buff
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = state.units[unitIndex];
            const buff = {
              id: 'scholar-next-skill-boost',
              name: 'Scholar Next Skill Boost',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'PERMANENT', // Until used
              duration: -1,
              stat: 'skill_dmg_boost',
              value: 0.25,
              isPercentage: true,
              apply: (u: any, s: any) => s,
              remove: (u: any, s: any) => s
            };

            const newEffects = [
              ...unit.effects.filter(e => e.id !== 'scholar-next-skill-boost'),
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
          events: ['ON_SKILL_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // Remove "Next Skill Boost" buff
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = state.units[unitIndex];
            const newEffects = unit.effects.filter(e => e.id !== 'scholar-next-skill-boost');

            return {
              ...state,
              units: state.units.map((u, i) => i === unitIndex ? { ...u, effects: newEffects } : u)
            };
          }
        }
      ],
    },
  ],
};
