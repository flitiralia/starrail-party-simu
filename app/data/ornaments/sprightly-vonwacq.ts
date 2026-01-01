import { OrnamentSet } from '../../types';
import { advanceAction } from '../../simulator/engine/utils';
import { createUnitId } from '../../simulator/engine/unitId';

export const SPRIGHTLY_VONWACQ: OrnamentSet = {
  id: 'sprightly-vonwacq',
  name: '生命のウェンワーク',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラのEP回復効率+5%。装備キャラの速度が120以上の場合、戦闘に入る時、行動順が40%早まる。',
      passiveEffects: [
        {
          stat: 'energy_regen_rate',
          value: 0.05,
          target: 'self'
        }
      ],
      eventHandlers: [
        {
          events: ['ON_BATTLE_START'],
          handler: (event, state, sourceUnitId) => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            // 速度120以上の場合、行動順40%加速
            if (unit.stats.spd < 120) return state;

            return advanceAction(state, sourceUnitId, 0.40);
          }
        }
      ],
    },
  ],
};

