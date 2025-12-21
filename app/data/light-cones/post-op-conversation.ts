import { ILightConeData } from '../../types';

export const postOpConversation: ILightConeData = {
  id: 'post-op-conversation',
  name: '手術後の会話',
  description: '装備キャラのEP回復効率+8%。必殺技を発動した時、治癒量+12%。',
  descriptionTemplate: '装備キャラのEP回復効率+{0}%。必殺技を発動した時、治癒量+{1}%。',
  descriptionValues: [
    ['8', '12'],
    ['10', '15'],
    ['12', '18'],
    ['14', '21'],
    ['16', '24']
  ],
  path: 'Abundance',
  baseStats: {
    hp: 1058,
    atk: 423,
    def: 330,
  },

  passiveEffects: [
    {
      id: 'post-op-err',
      name: '相互回復（EP効率）',
      category: 'BUFF',
      targetStat: 'energy_regen_rate',
      effectValue: [0.08, 0.10, 0.12, 0.14, 0.16]
    }
  ],

  // 「必殺技発動時の治癒量アップ」。
  // 特定のアクション中のバフとして実装可能か？
  // それとも `ON_BEFORE_ACTION` をリッスンするか？
  // より簡単な方法：条件付きパッシブ効果？ lightcone.ts の型は `condition` をサポートしているか？
  // `PassiveLightConeEffect` には `condition?: (stats) => boolean` がある。アクションタイプは認識しない。
  // `ON_BEFORE_ACTION` を使用して一時的なバフを追加し、`ON_ACTION_COMPLETE` で削除する。
  // あるいは動的修飾子で `state.currentActionLog.actionType` をチェックするか？
  // 現在のシミュレーターは `modifiers` でのアクションタイプ直接チェックをサポートしていない。
  // 最良のアプローチ：`ON_ULTIMATE_USED` イベントハンドラ？ いや、回復は必殺技中に発生する。
  // タイプが必殺技の場合に `ON_BEFORE_ACTION` を使用してバフを追加。`ON_ACTION_COMPLETE` で削除。
  // 実際、特定の能力ブーストの最も簡単な方法：
  // `ON_BEFORE_ACTION` が機能する場合。

  eventHandlers: [
    {
      id: 'post-op-heal-boost',
      name: '相互回復（必殺技治癒）',
      events: ['ON_ULTIMATE_USED', 'ON_ACTION_COMPLETE'],
      // 「必殺技中」をシミュレート。
      // ここでバフを追加すると、いつまで続く？
      // シミュレーターのイベントは順次処理される。
      // `ON_ULTIMATE_USED` は通常、必殺技の開始時に発火する。
      // つまり1ターンバフを追加するか？ しかし、必殺技が即時/ターン終了しない場合、後続のアクションに影響するのでは？
      // あるいは「アクションスコープ」バフ。
      // `addEffect` には「アクション期間」がない。
      // `ON_ACTION_COMPLETE` で期限切れになるバフを追加できる。
      handler: (event, state, unit, superimposition) => {
        // 「スコープ：アクション」がないと厄介だ。
        // ユーザーが `task_boundary` を使って質問すると仮定する？ いや、私が解決しなければならない。
        // 多くの光円錐には「スキル/必殺技使用時、ダメージアップ」がある。
        // 単純な `all_type_dmg_boost` として実装？ いや。
        // 通常、シミュレーションは動的に修正を適用する。
        // `ON_ACTION_COMPLETE` で自身を「削除」するバフを使用しよう。
        // しかし、ここでは `ON_ACTION_COMPLETE` を購読していない。
        // ハンドラが `ON_ULTIMATE_USED` と `ON_ACTION_COMPLETE` の両方を購読するようにする。

        if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === unit.id) {
          const boost = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];
          const { addEffect } = require('../../simulator/engine/effectManager');
          return addEffect(state, unit.id, {
            id: `post-op-buff-${unit.id}`,
            name: '相互回復（一時バフ）',
            category: 'BUFF',
            sourceUnitId: unit.id,
            durationType: 'PERMANENT', // 手動削除
            duration: -1,
            modifiers: [{ target: 'outgoing_healing_boost', value: boost, type: 'add', source: '手術後の会話' }],
            apply: (u: any, s: any) => s,
            remove: (u: any, s: any) => s
          });
        }

        if (event.type === 'ON_ACTION_COMPLETE' && event.sourceId === unit.id) {
          const { removeEffect } = require('../../simulator/engine/effectManager');
          return removeEffect(state, unit.id, `post-op-buff-${unit.id}`);
        }

        return state;
      },

    }
  ]
};

