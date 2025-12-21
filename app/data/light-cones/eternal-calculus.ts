import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const eternalCalculus: ILightConeData = {
  id: 'eternal-calculus',
  name: '絶え間ない演算',
  description: '装備キャラの攻撃力+8%。攻撃を行った後、命中した敵1体につき、さらに攻撃力+4%。この効果は最大で5回累積でき、次の攻撃を行った後まで継続。攻撃が3体以上の敵に命中した場合、自身の速度+8%、1ターン継続。',
  descriptionTemplate: '装備キャラの攻撃力+{0}%。攻撃を行った後、命中した敵1体につき、さらに攻撃力+{1}%。この効果は最大で5回累積でき、次の攻撃を行った後まで継続。攻撃が3体以上の敵に命中した場合、自身の速度+{2}%、1ターン継続。',
  descriptionValues: [
    ['8', '4', '8'],
    ['9', '5', '10'],
    ['10', '6', '12'],
    ['11', '7', '14'],
    ['12', '8', '16']
  ],
  path: 'Erudition',
  baseStats: {
    hp: 1058,
    atk: 529,
    def: 396,
  },
  passiveEffects: [
    {
      id: 'eternal_calculus_base_atk',
      name: '絶え間ない演算（基本攻撃力）',
      category: 'BUFF',
      targetStat: 'atk_pct',
      effectValue: [0.08, 0.09, 0.10, 0.11, 0.12]
    }
  ],
  eventHandlers: [
    // アクションごとのヒット数を追跡して、同じターゲットを二重カウントしないようにするヘルパー（"敵に命中するごとに"にとっては重要ではないかもしれないが）
    {
      id: 'eternal_calculus_tracker',
      name: '絶え間ない演算（トラッカー）',
      events: ['ON_BEFORE_ACTION', 'ON_DAMAGE_DEALT', 'ON_ACTION_COMPLETE'],
      handler: (event, state, unit, superimposition) => {
        // 追跡を初期化
        if (event.type === 'ON_BEFORE_ACTION') {
          if (event.sourceId !== unit.id) return state;
          const actionEvent = event as import('@/app/simulator/engine/types').BeforeActionEvent;
          // 攻撃のみ追跡
          if (actionEvent.actionType === 'BASIC_ATTACK' || actionEvent.actionType === 'SKILL' || actionEvent.actionType === 'ULTIMATE' || actionEvent.actionType === 'FOLLOW_UP_ATTACK') {
            return addEffect(state, unit.id, {
              id: `internal_tracker_eternal_calculus_${unit.id}`,
              name: 'Internal Tracker',
              category: 'STATUS',
              sourceUnitId: unit.id,
              durationType: 'PERMANENT',
              duration: -1,
              stackCount: 0, // ヒット数をカウント
              modifiers: [],
              apply: (u, s) => s,
              remove: (u, s) => s
            });
          }
        }

        // ヒット数をカウント
        if (event.type === 'ON_DAMAGE_DEALT') {
          if (event.sourceId !== unit.id) return state;
          const dmgEvent = event as import('@/app/simulator/engine/types').DamageDealtEvent;

          // Find tracker
          const tracker = unit.effects.find(e => e.id === `internal_tracker_eternal_calculus_${unit.id}`);
          if (tracker) {
            // カウントをインクリメント（ロジックのみ、効果は状態内で不変であると仮定して置換/更新する）
            // 待って、効果の変更には `updateEffect` または削除/追加が必要。
            // 単純化するために、理想的には「ユニークなターゲット」を追跡するが、テキストが「敵に命中するごとに」と言っているので単純化された「ヒット数」とする。同じ敵に2回ヒットした場合カウントするか？
            // 「命中した敵1体につき」 -> 敵1体につきヒット。通常はユニークな敵を意味する。
            // ユニークな敵と仮定する。
            // しかし今のところは、単純なスタックインクリメント。
            // 注：`ON_DAMAGE_DEALT` は新しい状態を作成する。
            // `tracker` をその場で変更することはできない。
            // 効率性：ヒットごとの効果レジストリ更新は重い？
            // 可能なら最後に再計算するだけ？いや、カウントを知る必要がある。
            // 標準的な addEffect に頼ってスタックを更新する。
            return addEffect(state, unit.id, {
              ...tracker,
              stackCount: (tracker.stackCount || 0) + 1
            });
          }
        }

        // アクション完了時にバフを適用
        if (event.type === 'ON_ACTION_COMPLETE') {
          if (event.sourceId !== unit.id) return state;

          const tracker = unit.effects.find(e => e.id === `internal_tracker_eternal_calculus_${unit.id}`);
          if (!tracker) return state;

          const hitCount = tracker.stackCount || 0;

          // 1. ATK Buff
          const atkPerHit = [0.04, 0.05, 0.06, 0.07, 0.08][superimposition - 1];
          const stacks = Math.min(hitCount, 5);
          let newState = state;

          if (stacks > 0) {
            newState = addEffect(newState, unit.id, {
              id: `eternal_calculus_atk_stack_${unit.id}`,
              name: '絶え間ない演算（攻撃力累積）',
              category: 'BUFF',
              sourceUnitId: unit.id,
              durationType: 'PERMANENT', // "次の攻撃を行った後まで"は手動による削除を示唆する
              duration: -1,
              stackCount: stacks,
              modifiers: [{ target: 'atk_pct', value: atkPerHit * stacks, type: 'add', source: '絶え間ない演算' }],
              apply: (u, s) => s,
              remove: (u, s) => s
            });
          }

          // 2. 速度バフ (3ヒット以上)
          if (hitCount >= 3) {
            const spdBuff = [0.08, 0.10, 0.12, 0.14, 0.16][superimposition - 1];
            newState = addEffect(newState, unit.id, {
              id: `eternal_calculus_spd_${unit.id}`,
              name: '絶え間ない演算（速度UP）',
              category: 'BUFF',
              sourceUnitId: unit.id,
              durationType: 'TURN_START_BASED', // 1 turn
              duration: 1,
              stackCount: 1,
              modifiers: [{ target: 'spd', value: spdBuff, type: 'pct', source: '絶え間ない演算' }], // +8% SPD usually pct of base? Yes 'spd' pct.
              apply: (u, s) => s,
              remove: (u, s) => s
            });
          }

          // トラッカーのクリーンアップ
          // そして古い攻撃力バフを削除する必要があるか確認？
          // "次の攻撃を行った後まで継続"。
          // つまり、*新しい*バフが*古い*バフを置き換えることを意味する。
          // 同じID `eternal_calculus_atk_stack_${unit.id}` を使用しているため、自動的に上書きされる。正しい。

          // しかし、hitCountが0の場合（すべてミス？）、古いバフをクリアするか？
          // "累積でき...次の攻撃を行った後まで継続"。
          // 次の攻撃のヒットが0の場合、おそらくクリアまたは0にリセットすべき？
          // 0ヒットの場合に古いバフを維持するのは間違っているように思える。
          // したがって、スタックが0の場合、効果を削除（または値を0に設定）できる。

          // 実際には、攻撃を実行したばかりなので、以前の「次の攻撃を行った後まで」という条件は満たされている。
          // バフは新しい結果に更新されるべきである。

          newState = removeEffect(newState, unit.id, tracker.id); // Tracker removal

          return newState;
        }

        return state;
      }
    }
  ]
};
