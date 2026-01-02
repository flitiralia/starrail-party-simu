import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const memorysCurtainNeverFalls: ILightConeData = {
  id: 'memorys-curtain-never-falls',
  name: '尽きぬ追憶',
  description: '装備キャラの速度+6.0%。装備キャラが戦闘スキルを発動した後、味方全体の与ダメージ+8%、3ターン継続。',
  descriptionTemplate: '装備キャラの速度+{0}%。装備キャラが戦闘スキルを発動した後、味方全体の与ダメージ+{1}%、3ターン継続。',
  descriptionValues: [
    ['6.0', '8'],
    ['7.5', '10'],
    ['9.0', '12'],
    ['10.5', '14'],
    ['12.0', '16']
  ],
  path: 'Remembrance',
  baseStats: {
    hp: 1058,
    atk: 529,
    def: 396,
  },
  passiveEffects: [
    {
      id: 'memorys-curtain-spd',
      name: '徴収（速度）',
      category: 'BUFF',
      targetStat: 'spd_pct',
      effectValue: [0.06, 0.075, 0.09, 0.105, 0.12]
    }
  ],
  eventHandlers: [
    {
      id: 'memorys-curtain-buff',
      name: '徴収（与ダメバフ）',
      events: ['ON_SKILL_USED'],
      handler: (event, state, unit, superimposition) => {
        if (event.sourceId !== unit.id) return state;

        const dmgBoost = [0.08, 0.10, 0.12, 0.14, 0.16][superimposition - 1];
        const allies = state.registry.getAliveAllies();

        let newState = state;
        for (const ally of allies) {
          newState = addEffect(newState, ally.id, {
            id: `memorys-curtain-buff-${unit.id}`,
            name: '徴収（与ダメージ）',
            category: 'BUFF',
            sourceUnitId: unit.id,
            durationType: 'TURN_START_BASED',
            duration: 3,
            modifiers: [{
              target: 'all_type_dmg_boost',
              value: dmgBoost,
              type: 'add',
              source: '尽きぬ追憶'
            }],
            apply: (u, s) => s,
            remove: (u, s) => s
          });
        }
        return newState;
      }
    }
  ]
};
