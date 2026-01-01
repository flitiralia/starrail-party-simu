import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const endlessReminiscence: ILightConeData = {
  id: 'memorys-curtain-never-falls',
  name: '尽きぬ追憶',
  description: '装備キャラの速度+8%。装備キャラが戦闘スキルを発動後、与ダメージが8%アップする、この効果は最大3層累積でき、続く戦闘スキル発動時に戦闘スキルによる与ダメージが8%アップする。',
  descriptionTemplate: '装備キャラの速度+{0}%。装備キャラが戦闘スキルを発動後、与ダメージが{1}%アップする、この効果は最大3層累積でき、続く戦闘スキル発動時に戦闘スキルによる与ダメージが{2}%アップする。',
  descriptionValues: [
    ['6', '8', '8'],
    ['7.5', '10', '10'],
    ['9', '12', '12'],
    ['10.5', '14', '14'],
    ['12', '16', '16']
  ],
  path: 'Remembrance',
  baseStats: {
    hp: 952,
    atk: 476,
    def: 330,
  },

  passiveEffects: [
    {
      id: 'spd-percent-boost',
      name: '徴収（速度）',
      category: 'BUFF',
      targetStat: 'spd_pct',
      effectValue: [0.06, 0.075, 0.09, 0.105, 0.12]
    }
  ],

  eventHandlers: [
    {
      id: 'dmg-boost-on-skill',
      name: '徴収（与ダメバフ）',
      events: ['ON_SKILL_USED'],
      handler: (event, state, unit, superimposition) => {
        if (event.sourceId !== unit.id) return state;

        const dmgBoostValue = [0.08, 0.10, 0.12, 0.14, 0.16][superimposition - 1];

        return addEffect(state, unit.id, {
          id: `endless_reminiscence_dmg_boost_${unit.id}`,
          name: '尽きぬ追憶（与ダメバフ）',
          category: 'BUFF',
          sourceUnitId: unit.id,
          durationType: 'TURN_END_BASED',
          skipFirstTurnDecrement: true,
          duration: 1,
          stackCount: 1,
          maxStacks: 3,
          modifiers: [
            {
              target: 'all_type_dmg_boost',
              source: '尽きぬ追憶',
              type: 'add',
              value: dmgBoostValue
            }
          ],
          apply: (u, s) => s,
          remove: (u, s) => s
        });
      }
    }
  ]
};
