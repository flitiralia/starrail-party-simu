import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

export const WATCHMAKER_MASTER_OF_DREAM_MACHINATIONS: RelicSet = {
  id: 'watchmaker_master_of_dream_machinations',
  name: '夢を弄ぶ時計屋',
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
      description:
        '装備キャラが味方に対して必殺技を発動した時、味方全体の撃破特効+30%、2ターン継続。この効果は累積できない。',
      eventHandlers: [
        {
          events: ['ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            // 必殺技が味方対象かチェック
            const sourceUnit = state.units.find(u => u.id === sourceUnitId);
            if (!sourceUnit) return state;

            const ult = sourceUnit.abilities.ultimate;
            if (!ult) return state;

            const isAllyTarget = ult.targetType === 'ally' || ult.targetType === 'all_allies';
            if (!isAllyTarget) return state;

            // 味方全体に撃破特効+30%バフを付与
            const allies = state.units.filter(u => !u.isEnemy);

            return allies.reduce((currentState, ally) => {
              const buff: IEffect = {
                id: 'watchmaker-4pc-be',
                name: '夢を弄ぶ時計屋',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_END_BASED',
                skipFirstTurnDecrement: true,
                duration: 2,
                modifiers: [
                  {
                    target: 'break_effect',
                    source: '夢を弄ぶ時計屋',
                    type: 'add',
                    value: 0.3
                  }
                ],
                apply: (t, s) => s,
                remove: (t, s) => s
              };

              return addEffect(currentState, ally.id, buff);
            }, state);
          }
        }
      ],
    },
  ],
};
