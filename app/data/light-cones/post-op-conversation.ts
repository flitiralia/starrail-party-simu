import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const postOpConversation: ILightConeData = {
  id: 'post-op-conversation',
  name: '手術後の会話',
  description: '装備キャラのEP回復効率+8%。装備キャラが必殺技を発動した後、治癒量が12%アップする、2ターン継続。',
  descriptionTemplate: '装備キャラのEP回復効率+{0}%。装備キャラが必殺技を発動した後、治癒量が{1}%アップする、2ターン継続。',
  descriptionValues: [['8', '12'], ['10', '15'], ['12', '18'], ['14', '21'], ['16', '24']],
  path: 'Abundance',
  baseStats: {
    hp: 952,
    atk: 423,
    def: 396,
  },

  passiveEffects: [
    {
      id: 'energy_regen_rate_boost',
      name: '相互回復（EP回復効率）',
      category: 'BUFF',
      targetStat: 'energy_regen_rate',
      effectValue: [0.08, 0.1, 0.12, 0.14, 0.16]
    }
  ],

  eventHandlers: [
    {
      id: 'healing_boost_on_ultimate',
      name: '相互回復（治癒量バフ）',
      events: ['ON_ULTIMATE_USED'],
      handler: (event, state, unit, superimposition) => {
        if (event.sourceId !== unit.id) return state;

        const healingBoostValue = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

        return addEffect(state, unit.id, {
          id: `post_op_conversation_healing_boost_${unit.id}`,
          name: '手術後の会話（治癒量バフ）',
          category: 'BUFF',
          sourceUnitId: unit.id,
          durationType: 'TURN_END_BASED',
          skipFirstTurnDecrement: true,
          duration: 2,
          modifiers: [
            {
              target: 'outgoing_healing_boost',
              source: '手術後の会話',
              type: 'add',
              value: healingBoostValue
            }
          ],
          apply: (u, s) => s,
          remove: (u, s) => s
        });
      }
    }
  ]
};
