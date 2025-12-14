import { OrnamentSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

export const FORGE_OF_THE_KALPAGNI_LANTERN: OrnamentSet = {
  id: 'forge_of_the_kalpagni_lantern',
  name: '劫火と蓮灯の鋳煉宮',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの速度+6%。装備キャラの攻撃が炎属性弱点を持つ敵に命中する時、撃破特効+40%、1ターン継続。',
      passiveEffects: [
        {
          stat: 'spd_pct',
          value: 0.06,
          target: 'self'
        }
      ],
      eventHandlers: [
        {
          events: ['ON_DAMAGE_DEALT'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (!event.targetId) return state;

            const target = state.units.find(u => u.id === event.targetId);
            if (!target) return state;

            // 炎属性弱点を持つ敵に命中した場合、撃破特効+40%
            if (!target.weaknesses.has('Fire')) return state;

            const buff: IEffect = {
              id: 'forge-be-buff',
              name: '劫火と蓮灯の鋳煉宮',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'TURN_END_BASED',
              skipFirstTurnDecrement: true,
              duration: 1,
              modifiers: [
                {
                  target: 'break_effect',
                  source: '劫火と蓮灯の鋳煉宮',
                  type: 'add',
                  value: 0.4
                }
              ],
              apply: (t, s) => s,
              remove: (t, s) => s
            };

            return addEffect(state, sourceUnitId, buff);
          }
        }
      ],
    },
  ],
};

