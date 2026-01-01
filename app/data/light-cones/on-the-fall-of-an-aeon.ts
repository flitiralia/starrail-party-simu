import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const onTheFallOfAnAeon: ILightConeData = {
  id: 'on-the-fall-of-an-aeon',
  name: 'とある星神の殞落を記す',
  description: '装備キャラが攻撃した時、今回の戦闘中、装備キャラの攻撃力+8%、最大で4回累積できる。装備キャラが弱点撃破した後、与ダメージ+12%、2ターン継続。',
  descriptionTemplate: '装備キャラが攻撃した時、今回の戦闘中、装備キャラの攻撃力+{0}%、最大で4回累積できる。装備キャラが弱点撃破した後、与ダメージ+{1}%、2ターン継続。',
  descriptionValues: [['8', '12'], ['10', '15'], ['12', '18'], ['14', '21'], ['16', '24']],
  path: 'Destruction',
  baseStats: {
    hp: 1058,
    atk: 529,
    def: 396,
  },

  eventHandlers: [
    {
      id: 'atk-percent-on-attack-stacking',
      name: '火に飛び込む（攻撃力スタック）',
      events: ['ON_BASIC_ATTACK', 'ON_SKILL_USED', 'ON_ULTIMATE_USED'],
      handler: (event, state, unit, superimposition) => {
        if (event.sourceId !== unit.id) return state;

        const atkValuePerStack = [0.08, 0.1, 0.12, 0.14, 0.16][superimposition - 1];

        return addEffect(state, unit.id, {
          id: `lc_aeon_atk_${unit.id}`,
          name: '火に飛び込む（攻撃力）',
          category: 'BUFF',
          sourceUnitId: unit.id,
          durationType: 'PERMANENT',
          duration: 0,
          stackCount: 1,
          maxStacks: 4,
          modifiers: [
            {
              target: 'atk_pct',
              source: 'とある星神の殞落を記す',
              type: 'add',
              value: atkValuePerStack
            }
          ],
          apply: (u, s) => s,
          remove: (u, s) => s
        });
      }
    },
    {
      id: 'dmg-percent-on-weakness-break',
      name: '火に飛び込む（与ダメバフ）',
      events: ['ON_WEAKNESS_BREAK'],
      handler: (event, state, unit, superimposition) => {
        if (event.sourceId !== unit.id) return state;

        const dmgBoostValue = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

        return addEffect(state, unit.id, {
          id: `lc_aeon_dmg_${unit.id}`,
          name: '火に飛び込む（与ダメバフ）',
          category: 'BUFF',
          sourceUnitId: unit.id,
          durationType: 'TURN_END_BASED',
          skipFirstTurnDecrement: true,
          duration: 2,
          modifiers: [
            {
              target: 'all_type_dmg_boost',
              source: 'とある星神の殞落を記す',
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
