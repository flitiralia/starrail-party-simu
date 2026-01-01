import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';

export const WARRIOR_GODDESS_OF_SUN_AND_THUNDER: RelicSet = {
  id: 'warrior-goddess-of-sun-and-thunder',
  name: '烈陽と雷鳴の武神',
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
      description: '装備キャラまたは記憶の精霊が、装備キャラおよびその記憶の精霊以外の味方を治癒した後、装備キャラは「慈雨」を獲得する。この効果は1ターンに最大1回まで発動でき、2ターン継続する。また、装備キャラが「慈雨」を持っている場合、速度+6%、味方全体の会心ダメージ+15%、この効果は累積できない。',
      passiveEffects: [
        // 装備キャラが「慈雨」を持っている場合、味方全体の会心ダメージ+15%
        {
          stat: 'crit_dmg',
          value: 0.15,
          target: 'other_allies', // 自分以外（自分は慈雨バフの効果として適用）
          condition: (stats, state, unitId) => {
            if (!state?.registry) return false;
            const unit = state.registry.get(createUnitId(unitId));
            return unit ? unit.effects.some(e => e.id === 'warlord-rain') : false;
          },
          evaluationTiming: 'dynamic'
        }
      ],
      eventHandlers: [
        {
          events: ['ON_UNIT_HEALED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (event.targetId === sourceUnitId) return state; // 自己回復は対象外

            // 他の味方を回復した時、「慈雨」を獲得
            const buff: IEffect = {
              id: 'warlord-rain',
              name: '慈雨',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'TURN_END_BASED',
              skipFirstTurnDecrement: true,
              duration: 2,
              modifiers: [
                {
                  target: 'spd_pct',
                  source: '慈雨',
                  type: 'pct',
                  value: 0.06
                }
                ,
                {
                  target: 'crit_dmg',
                  source: '慈雨',
                  type: 'pct',
                  value: 0.15
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
