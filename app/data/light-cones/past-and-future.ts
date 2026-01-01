import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const pastAndFuture: ILightConeData = {
    id: 'past-and-future',
    name: '過去と未来',
    description: '装備キャラが戦闘スキルを発動した後、次に行動する味方の与ダメージ+16%、1ターン継続。',
    descriptionTemplate: '装備キャラが戦闘スキルを発動した後、次に行動する味方の与ダメージ+{0}%、1ターン継続。',
    descriptionValues: [
        ['16'],
        ['20'],
        ['24'],
        ['28'],
        ['32']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'past-future-watcher',
            name: '過去と未来（次行動監視）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // ウォッチャーを追加: 次の味方のアクションがバフをトリガー
                return addEffect(state, unit.id, {
                    id: `past_future_watcher_${unit.id}`,
                    name: '昔日の紙鳶（監視）',
                    category: 'STATUS', // トラッカーにSTATUSを使用
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    modifiers: [],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'past-future-trigger',
            name: '過去と未来（バフ適用）',
            events: ['ON_BEFORE_ACTION'],
            handler: (event, state, unit, superimposition) => {
                const watcher = unit.effects.find(e => e.id === `past_future_watcher_${unit.id}`);
                if (!watcher) return state;

                // "次に行動する味方"（自身も含む？ テキスト: "次に行動する味方"。通常、再行動すれば自身も含む？）
                // しかし通常ブローニャスタイルでは: 次の *他の* 味方？
                // "だが戦争は終わっていない" が "他の味方" を指定しているのとは異なり、これは "味方" と言っている。
                // ただし、通常 "次に行動する味方" は *次の* ターンを示唆する。
                // スキルを使用 -> 私のターン終了 -> 次の味方が行動。
                // だから自然に機能する。
                // スキルを使用 -> 再現（ゼーレ） -> これは "次の行動" か？
                // はい。

                // トリガーロジック
                const targetId = event.sourceId || '';
                if (!targetId) return state;

                const buffVal = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];

                // ウォッチャーを削除
                let newState = removeEffect(state, unit.id, watcher.id);

                // バフを適用
                newState = addEffect(newState, targetId, {
                    id: `past_future_buff_${targetId}`,
                    name: '昔日の紙鳶（与ダメ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 1,
                    stackCount: 1,
                    modifiers: [{ target: 'all_type_dmg_boost', value: buffVal, type: 'add', source: '過去と未来' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                return newState;
            }
        }
    ]
};
