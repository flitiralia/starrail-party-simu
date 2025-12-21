import { RelicSet } from '../../types';
import { addSkillPoints } from '../../simulator/effect/relicEffectHelpers';


export const PASSERBY_OF_WANDERING_CLOUD: RelicSet = {
  id: 'passerby_of_wandering_cloud',
  name: '流雲無痕の過客',
  setBonuses: [
    {
      pieces: 2,
      description: '治癒量+10%。',
      passiveEffects: [
        {
          stat: 'outgoing_healing_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '戦闘開始時、SPを1回復する。',
      eventHandlers: [
        {
          events: ['ON_BATTLE_START'],
          handler: (event, state, sourceUnitId) => {
            return addSkillPoints(state, 1);

            return state;
          }
        }
      ],
    },
  ],
};
