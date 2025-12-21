import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

import { Unit } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';

export const weAreTheWildfire: ILightConeData = {
  id: 'we-are-wildfire',
  name: '我ら地炎',
  description: '戦闘開始時、味方全体の被ダメージ-8%、5ターン継続。味方全体のHPを、それぞれが失ったHP30%分回復する。',
  descriptionTemplate: '戦闘開始時、味方全体の被ダメージ-{0}%、5ターン継続。味方全体のHPを、それぞれが失ったHP{1}%分回復する。',
  descriptionValues: [['8', '30'], ['10', '35'], ['12', '40'], ['14', '45'], ['16', '50']],
  path: 'Preservation',
  baseStats: {
    hp: 740,
    atk: 476,
    def: 463,
  },

  passiveEffects: [],

  eventHandlers: [
    {
      id: 'dmg_reduction_on_start',
      name: '袖時雨（被ダメージ減少）',
      events: ['ON_BATTLE_START'],
      handler: (event, state, unit, superimposition) => {
        const dmgReduction = [0.08, 0.1, 0.12, 0.14, 0.16][superimposition - 1];

        // 味方全体にバフ付与
        let newState = state;
        const allies = state.registry.getAliveAllies();

        for (const ally of allies) {
          newState = addEffect(newState, ally.id, {
            id: `wildfire-dmg-reduction-${unit.id}-${ally.id}`,
            name: '我ら地炎（被ダメージ軽減）',
            category: 'BUFF',
            sourceUnitId: unit.id,
            durationType: 'TURN_END_BASED',
            skipFirstTurnDecrement: true,
            duration: 5,
            modifiers: [
              {
                target: 'dmg_taken_reduction', // 正しいStatKeyを使用
                source: '我ら地炎',
                type: 'add',
                value: dmgReduction
              }
            ],
            apply: (u, s) => s,
            remove: (u, s) => s
          });
        }

        return {
          ...newState,
          log: [...newState.log, {
            actionType: 'バフ',
            sourceId: unit.id,
            characterName: unit.name,
            targetId: 'all_allies',
            details: `我ら地炎発動: 被ダメージ -${dmgReduction * 100}% (5ターン)`
          }]
        };
      }
    },
    {
      id: 'heal_on_start_lost_hp',
      name: '袖時雨（HP回復）',
      events: ['ON_BATTLE_START'],
      handler: (event, state, unit, superimposition) => {
        const healPercent = [0.3, 0.35, 0.4, 0.45, 0.5][superimposition - 1];

        // 味方全体のHP回復
        let newState = state;
        state.registry.getAliveAllies().forEach((u: Unit) => {
          const lostHp = u.stats.hp - u.hp;
          const healAmount = lostHp * healPercent;
          if (healAmount <= 0) return;
          const newHp = Math.min(u.stats.hp, u.hp + healAmount);
          newState = {
            ...newState,
            registry: newState.registry.update(createUnitId(u.id), unit => ({ ...unit, hp: newHp }))
          };
        });

        return {
          ...newState,
          log: [...newState.log, {
            actionType: '回復',
            sourceId: unit.id,
            characterName: unit.name,
            targetId: 'all_allies',
            details: `我ら地炎発動: 失ったHP ${healPercent * 100}%分回復`
          }]
        };
      }
    }
  ]
};

