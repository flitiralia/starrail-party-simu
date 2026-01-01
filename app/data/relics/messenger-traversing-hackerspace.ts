import { RelicSet } from '../../types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect } from '../../simulator/engine/effectManager';
import { Unit } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';

export const MESSENGER_TRAVERSING_HACKERSPACE: RelicSet = {
  id: 'messenger-traversing-hackerspace',
  name: '仮想空間を漫遊するメッセンジャー',
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
      description: '装備キャラが味方に対して必殺技を発動した時、味方全体の速度+12%、1ターン継続。この効果は累積できない。',
      eventHandlers: [
        {
          events: ['ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            const sourceUnit = state.registry.get(createUnitId(sourceUnitId));
            if (!sourceUnit) return state;

            // 必殺技が味方をターゲットにしているか確認
            const targetType = sourceUnit.abilities.ultimate.targetType;
            if (!targetType) return state;

            const allyTargetTypes: Array<'ally' | 'all_allies' | 'self'> = ['ally', 'all_allies', 'self'];
            const isAllyTarget = allyTargetTypes.includes(targetType as any);

            if (!isAllyTarget) return state;

            // 味方全体にバフを付与
            let currentState = state;
            currentState.registry.getAliveAllies().forEach((u: Unit) => {
              const effect: IEffect = {
                id: 'messenger-4pc-spd',
                name: '仮想空間を漫遊するメッセンジャー',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_END_BASED',
                skipFirstTurnDecrement: true,
                duration: 1,
                stackCount: 1,
                maxStacks: 1,
                modifiers: [
                  {
                    target: 'spd_pct',
                    source: '仮想空間を漫遊するメッセンジャー',
                    type: 'pct',
                    value: 0.12
                  }
                ],
                apply: (t, s) => s,
                remove: (t, s) => s
              };
              currentState = addEffect(currentState, u.id, effect);
            });

            return currentState;
          }
        }
      ],
    },
  ],
};
