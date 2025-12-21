import { ILightConeData } from '@/app/types';
import { advanceAction } from '@/app/simulator/engine/utils';
import { appendEquipmentEffect } from '@/app/simulator/engine/dispatcher';

export const danceDanceDance: ILightConeData = {
  id: 'dance-dance-dance',
  name: 'ダンス！ダンス！ダンス！',
  description: '装備キャラが必殺技を発動した後、味方全体の行動順が16%早まる。',
  descriptionTemplate: '装備キャラが必殺技を発動した後、味方全体の行動順が{0}%早まる。',
  descriptionValues: [['16'], ['18'], ['20'], ['22'], ['24']],
  path: 'Harmony',
  baseStats: {
    hp: 952,
    atk: 423,
    def: 396,
  },

  eventHandlers: [
    {
      id: 'action_forward_on_ultimate',
      name: '止まらないよぉ！',
      events: ['ON_ULTIMATE_USED'],
      handler: (event, state, unit, superimposition) => {
        // イベントソースチェック
        if (event.sourceId !== unit.id) return state;

        // 重畳ランクに応じた行動順加速値
        const advanceValue = [0.16, 0.18, 0.2, 0.22, 0.24][superimposition - 1];

        // 味方全体に行動順加速
        let newState = state;
        const allies = state.registry.getAliveAllies();
        allies.forEach(ally => {
          newState = advanceAction(newState, ally.id, advanceValue);
        });

        // 装備効果をログに追加
        newState = appendEquipmentEffect(newState, {
          source: 'ダンス！ダンス！ダンス！',
          name: `行動順短縮 ${advanceValue * 100}%（味方全体）`,
          type: 'lightcone'
        });

        return newState;
      }
    }
  ]
};
