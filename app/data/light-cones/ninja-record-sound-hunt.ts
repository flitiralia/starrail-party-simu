import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const ninjirokuOnritsukari: ILightConeData = {
  id: 'ninja-record-sound-hunt',
  name: '忍事録・音律狩猟',
  description: '装備キャラのHP上限+12%。装備キャラのHPが変化した後、会心ダメージ+18%、2ターン継続。',
  descriptionTemplate: '装備キャラのHP上限+{0}%。装備キャラのHPが変化した後、会心ダメージ+{1}%、2ターン継続。',
  descriptionValues: [['12', '18'], ['15', '22.5'], ['18', '27'], ['21', '31.5'], ['24', '36']],
  path: 'The Hunt',
  baseStats: {
    hp: 1058,
    atk: 582,
    def: 396,
  },

  passiveEffects: [
    {
      id: 'max_hp_percent_boost',
      name: '開演（最大HP）',
      category: 'BUFF',
      targetStat: 'hp_pct',
      effectValue: [0.12, 0.15, 0.18, 0.21, 0.24]
    }
  ],

  eventHandlers: [
    {
      id: 'crit_dmg_on_hp_change',
      name: '開演（会心ダメージバフ）',
      events: ['ON_UNIT_HEALED', 'ON_DAMAGE_DEALT'], // HP変化イベント（被弾はtargetIdで判定）
      cooldownResetType: 'wearer_turn', // 2ターン継続なので、1ターンに1回発動
      handler: (event, state, unit, superimposition) => {
        // 対象が自分自身かチェック
        if (event.targetId !== unit.id) return state;

        const critDmgValue = [0.18, 0.225, 0.27, 0.315, 0.36][superimposition - 1];

        return addEffect(state, unit.id, {
          id: `ninjiroku_crit_dmg_${unit.id}`,
          name: '忍事録・音律狩猟（会心ダメバフ）',
          category: 'BUFF',
          sourceUnitId: unit.id,
          durationType: 'TURN_END_BASED',
          skipFirstTurnDecrement: true,
          duration: 2,
          modifiers: [
            {
              target: 'crit_dmg',
              source: '忍事録・音律狩猟',
              type: 'add',
              value: critDmgValue
            }
          ],
          apply: (u, s) => s,
          remove: (u, s) => s
        });
      }
    }
  ]
};
