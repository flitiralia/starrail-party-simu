import { RelicSet } from '../../types';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';

export const THIEF_OF_SHOOTING_METEOR: RelicSet = {
  id: 'thief-of-shooting-meteor',
  name: '流星の跡を追う怪盗',
  setBonuses: [
    {
      pieces: 2,
      description: '撃破特効+16%。',
      passiveEffects: [
        {
          stat: 'break_effect',
          value: 0.16,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラの撃破特効+16%。装備キャラが敵を弱点撃破した後、EPを3回復する。',
      passiveEffects: [
        {
          stat: 'break_effect',
          value: 0.16,
          target: 'self'
        }
      ],
      eventHandlers: [
        {
          events: ['ON_WEAKNESS_BREAK'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // 弱点撃破時にEPを3回復
            return addEnergyToUnit(state, sourceUnitId, 3, 0, false, {
              sourceId: sourceUnitId,
              publishEventFn: publishEvent
            });
          }
        }
      ],
    },
  ],
};
