import { OrnamentSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

export const LUSAKA_BY_THE_SUNKEN_SEA: OrnamentSet = {
  id: 'lusaka_by_the_sunken_sea',
  name: '海に沈んだルサカ',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラのEP回復効率+5%。装備キャラがパーティの1枠目のキャラでない場合、1枠目のキャラの攻撃力+12%。',
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
            // 装備キャラが1枠目でなければ、1枠目に攻撃力+12%を付与
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1 || unitIndex === 0) return state;

            const target = state.units[0];
            const buff: IEffect = {
              id: 'lusaka-atk-buff',
              name: '海に沈んだルサカ',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'PERMANENT',
              duration: 0,
              modifiers: [
                {
                  target: 'atk_pct',
                  source: '海に沈んだルサカ',
                  type: 'add',
                  value: 0.12
                }
              ],
              apply: (t, s) => s,
              remove: (t, s) => s
            };

            return addEffect(state, target.id, buff);
          }
        }
      ],
    },
  ],
};

