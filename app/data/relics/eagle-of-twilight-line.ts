import { RelicSet } from '../../types';
import { advanceAction } from '../../simulator/engine/utils';
import { appendEquipmentEffect } from '../../simulator/engine/dispatcher';
import { createUnitId } from '../../simulator/engine/unitId';

export const EAGLE_OF_TWILIGHT_LINE: RelicSet = {
  id: 'eagle-of-twilight-line',
  name: '昼夜の狭間を翔ける鷹',
  setBonuses: [
    {
      pieces: 2,
      description: '風属性ダメージ+10%。',
      passiveEffects: [
        {
          stat: 'wind_dmg_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが必殺技を発動した後、行動順が25%早まる。',
      eventHandlers: [
        {
          events: ['ON_ULTIMATE_USED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;

            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            // Action Advance 25%
            let newState = advanceAction(state, sourceUnitId, 0.25);

            // 装備効果をログに追加
            newState = appendEquipmentEffect(newState, {
              source: '昼夜の狭間を翔ける鷹',
              name: '行動順短縮 25%',
              target: unit.name,
              type: 'relic'
            });

            return newState;
          }
        }
      ],
    },
  ],
};

