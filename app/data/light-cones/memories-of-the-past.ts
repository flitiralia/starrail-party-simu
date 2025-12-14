import { ILightConeData } from '@/app/types';
import { addEnergy } from '@/app/simulator/engine/energy';

export const memoriesOfThePast: ILightConeData = {
  id: 'memories-of-the-past',
  name: '記憶の中の姿',
  description: '装備キャラの撃破特効+28%。装備キャラが攻撃を行った後、さらにEPを4回復する、この効果は1ターンに1回まで発動できる。',
  descriptionTemplate: '装備キャラの撃破特効+{0}%。装備キャラが攻撃を行った後、さらにEPを{1}回復する、この効果は1ターンに1回まで発動できる。',
  descriptionValues: [['28', '4'], ['35', '5'], ['42', '6'], ['49', '7'], ['56', '8']],
  path: 'Harmony',
  baseStats: {
    hp: 952,
    atk: 423,
    def: 396,
  },

  passiveEffects: [
    {
      id: 'break_effect_boost',
      name: '古い写真（撃破特効）',
      category: 'BUFF',
      targetStat: 'break_effect',
      effectValue: [0.28, 0.35, 0.42, 0.49, 0.56]
    }
  ],

  eventHandlers: [
    {
      id: 'ep_regen_on_attack',
      name: '古い写真（EP回復）',
      events: ['ON_DAMAGE_DEALT'], // ダメージを与えたとき（攻撃のみ、回復・バフスキルは除外）
      // cooldownResetType: 'wearer_turn' (デフォルト) - 1ターンに1回
      handler: (event, state, unit, superimposition) => {
        // 所持者が攻撃を行ったときのみ反応
        if (event.sourceId !== unit.id) return state;

        // 重畳ランクに応じたEP回復量
        const epValue = [4, 5, 6, 7, 8][superimposition - 1];

        // EP回復
        const unitIndex = state.units.findIndex(u => u.id === unit.id);
        if (unitIndex === -1) return state;

        const updatedUnit = addEnergy(state.units[unitIndex], epValue);
        const newUnits = [...state.units];
        newUnits[unitIndex] = updatedUnit;

        // ログ
        return {
          ...state,
          units: newUnits,
          log: [...state.log, {
            actionType: 'EP回復',
            sourceId: unit.id,
            characterName: unit.name,
            targetId: unit.id,
            details: `記憶の中の姿発動: EP +${epValue}`
          }]
        };
      }
    }
  ]
};
