import { RelicSet } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

export const SCHOLAR_LOST_IN_ERUDITION: RelicSet = {
  id: 'scholar-lost-in-erudition',
  name: '知識の海に溺れる学者',
  setBonuses: [
    {
      pieces: 2,
      description: '会心率+8%。',
      passiveEffects: [
        {
          stat: 'crit_rate',
          value: 0.08,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '戦闘スキルおよび必殺技によるダメージ+20%。必殺技を発動した後、次に戦闘スキルを発動する時、与ダメージがさらに+25%。',
      passiveEffects: [
        {
          stat: 'skill_dmg_boost',
          value: 0.2,
          target: 'self'
        },
        {
          stat: 'ult_dmg_boost',
          value: 0.2,
          target: 'self'
        }
      ],
      eventHandlers: [
        {
          events: ['ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // 次のスキル使用時にダメージブーストを付与
            const buff: IEffect = {
              id: 'scholar-next-skill-boost',
              name: '知識の海に溺れる学者',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'PERMANENT',
              duration: 0,
              modifiers: [
                {
                  target: 'skill_dmg_boost',
                  source: '知識の海に溺れる学者',
                  type: 'add',
                  value: 0.25
                }
              ],
              apply: (t, s) => s,
              remove: (t, s) => s
            };

            return addEffect(state, sourceUnitId, buff);
          }
        },
        {
          events: ['ON_SKILL_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // バフを削除
            return removeEffect(state, sourceUnitId, 'scholar-next-skill-boost');
          }
        }
      ],
    },
  ],
};
