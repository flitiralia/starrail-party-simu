import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';
import { publishEvent } from '@/app/simulator/engine/dispatcher';

export const solitudeAndHealing: ILightConeData = {
  id: 'solitary-healing',
  name: '孤独の癒し',
  description: '装備キャラの撃破特効+20%。装備キャラが必殺技を発動した時、装備キャラの持続与ダメージ+24%。2ターン継続。装備キャラに持続ダメージを付与された敵が倒された時、装備キャラのEPを4回復する。',
  descriptionTemplate: '装備キャラの撃破特効+{0}%。装備キャラが必殺技を発動した時、装備キャラの持続与ダメージ+{1}%。2ターン継続。装備キャラに持続ダメージを付与された敵が倒された時、装備キャラのEPを{2}回復する。',
  descriptionValues: [
    ['20', '24', '4.0'],
    ['25', '30', '4.5'],
    ['30', '36', '5.0'],
    ['35', '42', '5.5'],
    ['40', '48', '6.0']
  ],
  path: 'Nihility',
  baseStats: {
    hp: 1058,
    atk: 529,
    def: 396,
  },

  passiveEffects: [
    {
      id: 'break_effect_boost',
      name: '混沌の霊薬（撃破特効）',
      category: 'BUFF',
      targetStat: 'break_effect',
      effectValue: [0.2, 0.25, 0.3, 0.35, 0.4]
    }
  ],

  eventHandlers: [
    {
      id: 'dot_dmg_on_ultimate',
      name: '混沌の霊薬（持続ダメバフ）',
      events: ['ON_ULTIMATE_USED'],
      handler: (event, state, unit, superimposition) => {
        if (event.sourceId !== unit.id) return state;

        const dotDmgValue = [0.24, 0.3, 0.36, 0.42, 0.48][superimposition - 1];

        return addEffect(state, unit.id, {
          id: `solitude_and_healing_dot_${unit.id}`,
          name: '孤独の癒し（持続ダメバフ）',
          category: 'BUFF',
          sourceUnitId: unit.id,
          durationType: 'TURN_END_BASED',
          skipFirstTurnDecrement: true,
          duration: 2,
          modifiers: [
            {
              target: 'dot_dmg_boost',
              source: '孤独の癒し',
              type: 'add',
              value: dotDmgValue
            }
          ],
          apply: (u, s) => s,
          remove: (u, s) => s
        });
      }
    },
    {
      id: 'ep_regen_on_dot_kill',
      name: '混沌の霊薬（EP回復）',
      events: ['ON_ENEMY_DEFEATED'],
      handler: (event, state, unit, superimposition) => {
        if (event.type !== 'ON_ENEMY_DEFEATED') return state;
        // 倒された敵がDoTデバフを持っているか確認
        const defeatedEnemy = event.defeatedEnemy;
        if (!defeatedEnemy) return state;

        // type: 'DoT' でDoT判定（シンプル＆確実）
        const hasDoTFromWearer = defeatedEnemy.effects.some(effect =>
          effect.type === 'DoT' && effect.sourceUnitId === unit.id
        );

        if (!hasDoTFromWearer) return state;

        const epValue = [4.0, 4.5, 5.0, 5.5, 6.0][superimposition - 1];

        const newState = addEnergyToUnit(state, unit.id, epValue, 0, false, {
          sourceId: unit.id,
          publishEventFn: publishEvent
        });

        // EP回復は統合ログのresourceChangesで自動的に表示されるため、
        // 個別ログは削除（方針: 1アクションのログは統合）
        return newState;
      }
    }
  ]
};
