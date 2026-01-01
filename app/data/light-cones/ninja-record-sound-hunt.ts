import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';
import { advanceUnitAction } from '@/app/simulator/engine/actionValue';

export const ninjaRecordSoundHunt: ILightConeData = {
  id: 'ninja-record-sound-hunt',
  name: '忍法帖・繚乱破魔',
  description: '装備キャラの撃破特効+60%。戦闘に入る時EPを30回復し、装備キャラが必殺技を発動した後「雷遁」を獲得する。通常攻撃を2回行った後、「雷遁」の効果を解除し、装備キャラの行動順を50%早める。なお、装備キャラが必殺技を発動すると「雷遁」はリセットされる。',
  descriptionTemplate: '装備キャラの撃破特効+{0}%。戦闘に入る時EPを{1}回復し、装備キャラが必殺技を発動した後「雷遁」を獲得する。通常攻撃を2回行った後、「雷遁」の効果を解除し、装備キャラの行動順を{2}%早める。なお、装備キャラが必殺技を発動すると「雷遁」はリセットされる。',
  descriptionValues: [
    ['60', '30', '50'],
    ['70', '32.5', '55'],
    ['80', '35', '60'],
    ['90', '37.5', '65'],
    ['100', '40', '70']
  ],
  path: 'Erudition',
  baseStats: {
    hp: 952,
    atk: 582,
    def: 529,
  },
  passiveEffects: [
    {
      id: 'ninja-record-be',
      name: '忍法帖・繚乱破魔（撃破特効）',
      category: 'BUFF',
      targetStat: 'break_effect',
      effectValue: [0.60, 0.70, 0.80, 0.90, 1.00]
    }
  ],
  eventHandlers: [
    {
      id: 'ninja-record-battle-start-ep',
      name: '忍法帖・繚乱破魔（開幕EP）',
      events: ['ON_BATTLE_START'],
      handler: (event, state, unit, superimposition) => {
        const epGain = [30, 32.5, 35, 37.5, 40][superimposition - 1];
        return addEnergyToUnit(state, unit.id, epGain, 0, false, { sourceId: unit.id }); // addEnergyToUnit は GameState を直接返す
      }
    },
    {
      id: 'ninja-record-raiton-listener',
      name: '忍法帖・繚乱破魔（雷遁管理）',
      events: ['ON_ULTIMATE_USED', 'ON_BASIC_ATTACK'],
      handler: (event, state, unit, superimposition) => {
        const aaVal = [0.50, 0.55, 0.60, 0.65, 0.70][superimposition - 1];

        if (event.type === 'ON_ULTIMATE_USED') {
          if (event.sourceId !== unit.id) return state;

          // 雷遁をリセット/獲得（カウンター0）
          return addEffect(state, unit.id, {
            id: `ninja_record_raiton_${unit.id}`,
            name: '雷遁',
            category: 'BUFF',
            sourceUnitId: unit.id,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: 0, // 攻撃回数0
            modifiers: [],
            apply: (u, s) => s,
            remove: (u, s) => s
          });
        }

        if (event.type === 'ON_BASIC_ATTACK') {
          if (event.sourceId !== unit.id) return state;

          const raiton = unit.effects.find(e => e.id === `ninja_record_raiton_${unit.id}`);
          if (!raiton) return state;

          const newCount = (raiton.stackCount || 0) + 1;

          if (newCount >= 2) {
            // 雷遁を削除 & 行動順短縮
            let newState = removeEffect(state, unit.id, raiton.id);
            newState = advanceUnitAction(newState, unit.id, aaVal);
            return newState;
          } else {
            // 雷遁を更新
            return addEffect(state, unit.id, {
              ...raiton,
              stackCount: newCount
            });
          }
        }

        return state;
      }
    }
  ]
};
