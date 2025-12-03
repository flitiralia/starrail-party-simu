import { RelicSet } from '../../types';

export const GENIUS_OF_BRILLIANT_STARS: RelicSet = {
  id: 'genius_of_brilliant_stars',
  name: '星の如く輝く天才',
  setBonuses: [
    {
      pieces: 2,
      description: '量子属性ダメージ+10%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'quantum_dmg_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが敵にダメージを与えた時、敵の防御力を10%無視する。敵が量子属性弱点を持っている場合、さらに防御力を10%無視する。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'def_ignore',
          value: 0.1,
          target: 'self'
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // Check target weakness
            const targetId = event.targetId;
            if (!targetId) return state;

            const target = state.units.find(u => u.id === targetId);
            if (!target) return state;

            if (target.weaknesses.has('Quantum')) {
              return {
                ...state,
                damageModifiers: {
                  ...state.damageModifiers,
                  defIgnore: (state.damageModifiers.defIgnore || 0) + 0.1
                }
              };
            }

            return state;
          }
        }
      ],
    },
  ],
};
