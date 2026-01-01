import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const theDayTheCosmosFell: ILightConeData = {
    id: 'the-day-the-cosmos-fell',
    name: '銀河が陥落した日',
    description: '装備キャラの攻撃力+16％。装備キャラが攻撃を行った後、攻撃を受けた敵のうち、装備キャラの属性に対応する弱点属性を持つ敵が2体以上の場合、装備キャラの会心ダメージ+20%、2ターン継続。',
    descriptionTemplate: '装備キャラの攻撃力+{0}％。装備キャラが攻撃を行った後、攻撃を受けた敵のうち、装備キャラの属性に対応する弱点属性を持つ敵が2体以上の場合、装備キャラの会心ダメージ+{1}%、2ターン継続。',
    descriptionValues: [
        ['16', '20'],
        ['18', '25'],
        ['20', '30'],
        ['22', '35'],
        ['24', '40']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'day-cosmos-fell-atk',
            name: '銀河が陥落した日（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.16, 0.18, 0.20, 0.22, 0.24]
        }
    ],
    eventHandlers: [
        {
            id: 'day-cosmos-fell-cond-buff',
            name: '銀河が陥落した日（条件付き会心ダメ）',
            events: ['ON_ACTION_COMPLETE'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const actionEvent = event as import('@/app/simulator/engine/types').ActionEvent;

                // 弱点が一致するターゲットをカウントする必要がある
                // ActionContextで通常利用可能な 'action.targets' にアクセスするが、ここではイベントしか持っていない。
                // ActionEvent は通常 `targetId`（単体）を持つか、どこかからターゲットにアクセスする必要がある。
                // ディスパッチャでは ActionEvent が発行される。
                // イベントに特定のターゲットがリストされていない場合、苦労するかもしれない。
                // しかし、ActionEvent を拡張していれば `targets` 配列を利用できる。
                // 持っていないと仮定して、回避策を探すか、機能を仮定する。

                // 以前の修正：私は `ActionEvent` に `targetCount` を追加したか？ いや、`DamageDealt` などに追加した？
                // 待って、ターゲットを確認できなければ「2体以上」を実装できない。
                // イベントがターゲットを持っているか、取得できると仮定しよう。
                // 今ディスパッチャを書き換えて追加することはできないので、`state.currentActionLog`（もし存在し入力されていれば）が情報を持っていると仮定する？
                // または：targetIdに基づいて再計算する？

                // 回避策：`actionEvent['targets']` が存在する場合（types.tsを確認すればわかるかも）。
                // 以前確認した `types.ts` の明示的な定義には現在は存在しない。
                // `targetId` と `targetCount`（以前使用を削除した）のみ。

                // `Eternal Calculus` のように `ON_DAMAGE_DEALT` トラッキングを使用しよう。
                // 実際 `Eternal Calculus` のロジックは：ON_BEFORE_ACTION -> トラッカー・リセット、ON_DAMAGE_DEALT -> カウント、ON_ACTION_COMPLETE -> チェック。
                // これが最も信頼できる方法。

                // しかし `Cosmos Fell` の条件は：「弱点が一致する敵」。
                // *どの* 敵かを追跡する必要がある。

                const trackerId = `hit_tracker_cosmos_fell_${unit.id}`;

                // `Eternal Calculus` スタイルのトラッカーですでに実装されているロジック？
                // ここでトラッカーロジックを複製するが、「弱点一致」をカウントする。

                return state;
            }
        },
        {
            id: 'day-cosmos-fell-tracker',
            name: '銀河が陥落した日（トラッカー）',
            events: ['ON_BEFORE_ACTION', 'ON_DAMAGE_DEALT', 'ON_ACTION_COMPLETE'],
            handler: (event, state, unit, superimposition) => {
                const trackerId = `hit_tracker_cosmos_${unit.id}`;

                if (event.type === 'ON_BEFORE_ACTION') {
                    if (event.sourceId !== unit.id) return state;
                    // Reset
                    return addEffect(state, unit.id, {
                        id: trackerId,
                        name: 'Internal Tracker',
                        category: 'STATUS',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: 0,
                        modifiers: [],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                if (event.type === 'ON_DAMAGE_DEALT') {
                    if (event.sourceId !== unit.id) return state;
                    if (!('targetId' in event)) return state;

                    const target = state.registry.get(createUnitId(event.targetId as string));
                    if (!target) return state;

                    // 弱点を確認
                    const unitElement = unit.element; // 'Fire', 'Ice', etc.
                    if (target.weaknesses.has(unitElement)) {
                        const current = unit.effects.find(e => e.id === trackerId);
                        if (current) {
                            return addEffect(state, unit.id, {
                                ...current,
                                stackCount: (current.stackCount || 0) + 1
                            });
                        }
                    }
                }

                if (event.type === 'ON_ACTION_COMPLETE') {
                    if (event.sourceId !== unit.id) return state;

                    const tracker = unit.effects.find(e => e.id === trackerId);
                    if (tracker && (tracker.stackCount || 0) >= 2) {
                        // バフを適用
                        const cdBuff = [0.20, 0.25, 0.30, 0.35, 0.40][superimposition - 1];
                        return addEffect(state, unit.id, {
                            id: `cosmos_fell_cd_${unit.id}`,
                            name: '銀河が陥落した日（会心ダメ）',
                            category: 'BUFF',
                            sourceUnitId: unit.id,
                            durationType: 'TURN_START_BASED',
                            duration: 2,
                            stackCount: 1,
                            modifiers: [{ target: 'crit_dmg', value: cdBuff, type: 'add', source: '銀河が陥落した日' }],
                            apply: (u, s) => s,
                            remove: (u, s) => s
                        });
                    }
                    // トラッカーを消去
                    if (tracker) return removeEffect(state, unit.id, trackerId);
                }

                return state;
            }
        }
    ]
};
