import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const eternalCalculus: ILightConeData = {
  id: 'eternal-calculus',
  name: '絶え間ない演算',
  description: '装備キャラの攻撃力+8%。攻撃を行った後、命中した敵1体につき、さらに攻撃力+4%。この効果は最大で5回累積でき、次の攻撃を行った後まで継続。攻撃が3体以上の敵に命中した場合、自身の速度+8%、1ターン継続。',
  descriptionTemplate: '装備キャラの攻撃力+{0}%。攻撃を行った後、命中した敵1体につき、さらに攻撃力+{1}%。この効果は最大で5回累積でき、次の攻撃を行った後まで継続。攻撃が3体以上の敵に命中した場合、自身の速度+{2}%、1ターン継続。',
  descriptionValues: [
    ['8', '4', '8'],
    ['9', '5', '9'],
    ['10', '6', '10'],
    ['11', '7', '11'],
    ['12', '8', '12']
  ],
  path: 'Erudition',
  baseStats: {
    hp: 1058,
    atk: 529,
    def: 396,
  },

  passiveEffects: [
    {
      id: 'atk_percent_boost',
      name: '境界なき思考（攻撃力）',
      category: 'BUFF',
      targetStat: 'atk_pct',
      effectValue: [0.08, 0.09, 0.1, 0.11, 0.12]
    }
  ],

  eventHandlers: [
    {
      id: 'atk_percent_per_enemy_hit',
      name: '境界なき思考（敵命中）',
      events: ['ON_DAMAGE_DEALT'],
      handler: (event, state, unit, superimposition) => {
        // 所持者が攻撃を行ったときのみ反応
        if (event.sourceId !== unit.id) return state;

        // 命中した敵数（現在は1ダメージ=1敵と仮定）
        const hitCount = 1;

        // 重畳ランクに応じたATK増加値
        const atkPerHit = [0.04, 0.05, 0.06, 0.07, 0.08][superimposition - 1];
        const effectId = `eternal-calculus-atk-${unit.id}`;

        // 現在のスタック数を確認
        const currentUnit = state.units.find(u => u.id === unit.id);
        if (!currentUnit) return state;

        const existingEffect = currentUnit.effects.find(e => e.id === effectId);
        const currentStacks = existingEffect?.stackCount || 0;
        const newStacks = Math.min(5, currentStacks + hitCount);

        const newState = addEffect(state, unit.id, {
          id: effectId,
          name: '絶え間ない演算（ATK）',
          category: 'BUFF',
          sourceUnitId: unit.id,
          durationType: 'TURN_END_BASED', // NOTE: 実際は「次の攻撃まで」だが簡略化
          skipFirstTurnDecrement: true,
          duration: 1,
          stackCount: newStacks,
          maxStacks: 5,
          modifiers: [
            {
              target: 'atk_pct',
              source: '絶え間ない演算',
              type: 'add',
              value: atkPerHit * newStacks
            }
          ],
          apply: (t, s) => s,
          remove: (t, s) => s
        });

        return {
          ...newState,
          log: [...newState.log, {
            actionType: 'バフ',
            sourceId: unit.id,
            characterName: unit.name,
            targetId: unit.id,
            details: `絶え間ない演算発動: 攻撃力 +${(atkPerHit * newStacks * 100).toFixed(1)}% (${newStacks}層)`
          }]
        };
      }
    },
    {
      id: 'spd_percent_on_3_enemies',
      name: '境界なき思考（速度）',
      events: ['ON_DAMAGE_DEALT'],
      handler: (event, state, unit, superimposition) => {
        // 所持者が攻撃を行ったときのみ反応
        if (event.sourceId !== unit.id) return state;

        // 3体以上の敵に命中した場合の判定
        // NOTE: 実際のAOE判定にはevent.targetCountなどが必要
        // 現在の実装では省略（プレースホルダー）

        return state;
      }
    }
  ]
};
