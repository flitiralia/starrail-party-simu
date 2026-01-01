import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';

export const SACERDOS_RELIVED_ORDEAL: RelicSet = {
  id: 'sacerdos-relived-ordeal',
  name: '再び苦難の道を歩む司祭',
  setBonuses: [
    {
      pieces: 2,
      description: '速度+6%。',
      passiveEffects: [
        {
          stat: 'spd_pct',
          value: 0.06,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '味方単体に対して戦闘スキルまたは必殺技を発動する時、スキルターゲットの会心ダメージ+18%、2ターン継続。この効果は最大で2層累積できる。',
      eventHandlers: [
        {
          events: ['ON_SKILL_USED', 'ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (!event.targetId) return state;

            // ターゲットが味方かチェック
            const target = state.registry.get(createUnitId(event.targetId));
            if (!target || target.isEnemy) return state;

            // スタック可能なバフを付与
            const buff: IEffect = {
              id: 'priest-4pc-cd',
              name: '再び苦難の道を歩む司祭',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'TURN_END_BASED',
              skipFirstTurnDecrement: true,
              duration: 2,
              stackCount: 1,
              maxStacks: 2,
              modifiers: [
                {
                  target: 'crit_dmg',
                  source: '再び苦難の道を歩む司祭',
                  type: 'add',
                  value: 0.18
                }
              ],
              apply: (t, s) => s,
              remove: (t, s) => s
            };

            return addEffect(state, event.targetId, buff);
          }
        }
      ],
    },
  ],
};
