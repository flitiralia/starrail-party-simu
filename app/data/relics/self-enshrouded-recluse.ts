import { RelicSet } from '../../types';
import { isShieldEffect } from '../../simulator/effect/utils';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

export const SELF_ENSHROUDED_RECLUSE: RelicSet = {
  id: 'self-enshrouded-recluse',
  name: '星の光を隠した隠者',
  setBonuses: [
    {
      pieces: 2,
      description: '付与するバリアの耐久値+10%。',
      passiveEffects: [
        {
          stat: 'shield_strength_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラが付与するバリアの耐久値+12%。装備キャラが付与したバリアを持つ味方の会心ダメージ+15%。',
      passiveEffects: [
        {
          stat: 'shield_strength_boost',
          value: 0.12,
          target: 'self'
        },
      ],
      eventHandlers: [
        {
          events: ['ON_EFFECT_APPLIED'],
          handler: (event, state, sourceUnitId) => {
            // ON_EFFECT_APPLIEDイベントのみ処理
            if (event.type !== 'ON_EFFECT_APPLIED') return state;

            const effectEvent = event as import('../../simulator/engine/types').IEffectEvent;
            const appliedEffect = effectEvent.effect;

            // シールドが装備者から付与されたか確認
            if (!isShieldEffect(appliedEffect) || appliedEffect.sourceUnitId !== sourceUnitId) {
              return state;
            }

            const targetId = effectEvent.targetId;

            // 会心ダメージバフを付与（シールドと連動）
            const critBuff: IEffect = {
              id: `hermit-crit-${targetId}-${appliedEffect.id}`,
              name: '星の光を隠した隠者',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'LINKED',
              linkedEffectId: appliedEffect.id,  // シールドIDと連動
              duration: 0,  // LINKEDの場合は無視される
              modifiers: [
                {
                  target: 'crit_dmg',
                  source: '星の光を隠した隠者',
                  type: 'add',
                  value: 0.15
                }
              ],
              apply: (t, s) => s,
              remove: (t, s) => s
            };

            return addEffect(state, targetId, critBuff);
          }
        }
      ],
    },
  ],
};
