import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

export const POET_WHO_SINGS_OF_THE_SORROW_OF_THE_FALLEN_KINGDOM: RelicSet = {
  id: 'poet_who_sings_of_the_sorrow_of_the_fallen_kingdom',
  name: '亡国の悲哀を詠う詩人',
  setBonuses: [
    {
      pieces: 2,
      description: '量子属性ダメージ+10%。',
      passiveEffects: [
        {
          stat: 'quantum_dmg_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラの速度-8%。戦闘に入る前、装備キャラの速度が110/95を下回る時、装備キャラの会心率+20%/32％。この効果は装備キャラの記憶の精霊にも有効。',
      passiveEffects: [
        {
          stat: 'spd_pct',
          value: -0.08,
          target: 'self'
        }
        // 会心率バフはイベントハンドラで処理（evaluationTiming: 'battle_start' は正しく動作しないため）
      ],
      eventHandlers: [
        {
          events: ['ON_BATTLE_START'],
          handler: (event, state, sourceUnitId) => {
            const unit = state.units.find(u => u.id === sourceUnitId);
            if (!unit) return state;

            // 速度を取得（-8%は既に適用済み）
            const effectiveSpd = unit.stats.spd;

            let critRateBoost = 0;
            if (effectiveSpd < 95) {
              critRateBoost = 0.32;
            } else if (effectiveSpd < 110) {
              critRateBoost = 0.20;
            }

            if (critRateBoost === 0) return state;

            const buff: IEffect = {
              id: `poet-4pc-crit-${sourceUnitId}`,
              name: '亡国の悲哀を詠う詩人（会心率）',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'PERMANENT',
              duration: -1,
              modifiers: [{
                target: 'crit_rate',
                source: '亡国の悲哀を詠う詩人',
                type: 'add',
                value: critRateBoost
              }],
              apply: (t, s) => s,
              remove: (t, s) => s
            };

            return addEffect(state, sourceUnitId, buff);
          }
        }
      ]
    },
  ],
};
