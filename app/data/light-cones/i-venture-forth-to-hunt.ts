import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const iVentureForthToHunt: ILightConeData = {
    id: 'i-venture-forth-to-hunt',
    name: '我が征く巡狩の道',
    description: '装備キャラの会心率+15%。装備キャラが追加攻撃を行う時、「流光」を1層獲得する。「流光」は最大で2層累積できる。「流光」が1層あるごとに、装備キャラの与える必殺技ダメージが敵の防御力を27%無視する。装備キャラのターン終了時、「流光」が1層解除される。',
    descriptionTemplate: '装備キャラの会心率+{0}%。装備キャラが追加攻撃を行う時、「流光」を1層獲得する。「流光」は最大で2層累積できる。「流光」が1層あるごとに、装備キャラの与える必殺技ダメージが敵の防御力を{1}%無視する。装備キャラのターン終了時、「流光」が1層解除される。',
    descriptionValues: [
        ['15.0', '27'],
        ['17.5', '30'],
        ['20.0', '33'],
        ['22.5', '36'],
        ['25.0', '39']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 952,
        atk: 635,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'venture-hunt-crit',
            name: '我が征く巡狩の道（会心率）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.15, 0.175, 0.20, 0.225, 0.25]
        }
    ],
    eventHandlers: [
        {
            id: 'venture-hunt-stack-gain',
            name: '我が征く巡狩の道（流光獲得）',
            events: ['ON_FOLLOW_UP_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 「流光」を1層獲得する
                // 「流光」は必殺技に防御無視を付与するバフ。
                // しかし `addEffect` は通常、静的なモディファイアのみをサポートする？
                // または `ON_BEFORE_DAMAGE_CALCULATION` で動的モディファイアロジックを使用できる。
                // ただし、「層」は自然に stackCount にマップされる。
                // スタックを追加するが、モディファイアは空にし、防御無視は別のイベントハンドラで適用するか？
                // いや、システムが `defIgnore` ロジック内で "Effect Stack Count" のチェックをサポートしているなら、効果でモディファイアを定義できる？
                // 現在 `modifiers` はステータスへの `add` または `pct` である。`def_ignore` はステータスか？はい、`def_ignore` または類似のもの。
                // 待って、`defIgnore` は通常 `damageModifiers` ロジックで処理される。
                // しかし `def_ignore` ステータスに追加する場合、それは*すべての*攻撃に適用されるか？
                // テキスト：「必殺技ダメージが敵の防御力を...無視する」。必殺技に限定される。
                // したがって、汎用的な `def_ignore` ステータスモディファイアは使用できない。
                // 必殺技とスタックをチェックするために `ON_BEFORE_DAMAGE_CALCULATION` が必要である。

                return addEffect(state, unit.id, {
                    id: `venture_hunt_luminous_${unit.id}`,
                    name: '流光',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // ターン終了時に手動で削除
                    duration: -1,
                    stackCount: 1,
                    maxStacks: 2,
                    modifiers: [], // パッシブステータスなし
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'venture-hunt-def-ignore',
            name: '我が征く巡狩の道（防御無視）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // `actionType` または類似のロジックを使用して必殺技かチェック
                let actionType: string | undefined;
                if ('actionType' in event) actionType = (event as any).actionType;

                if (actionType !== 'ULTIMATE') return state;

                const buff = unit.effects.find(e => e.id === `venture_hunt_luminous_${unit.id}`);
                if (!buff || !buff.stackCount) return state;

                const defIgnorePerStack = [0.27, 0.30, 0.33, 0.36, 0.39][superimposition - 1];
                const totalDefIgnore = defIgnorePerStack * buff.stackCount;

                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        defIgnore: (state.damageModifiers.defIgnore || 0) + totalDefIgnore
                    }
                };
            }
        },
        {
            id: 'venture-hunt-stack-decay',
            name: '我が征く巡狩の道（解除）',
            events: ['ON_TURN_END'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 「流光」を1層削除
                // `removeEffect` は通常、効果全体を削除する。
                // `effectManager` は "スタック減少" を直接公開していない？
                // 削除して再追加する必要があるか？
                // または現在のスタックを確認する。
                const buff = unit.effects.find(e => e.id === `venture_hunt_luminous_${unit.id}`);
                if (!buff || !buff.stackCount) return state;

                // スタックを減らす
                // 1なら -> 削除。
                // 2なら -> 1に設定。

                if (buff.stackCount <= 1) {
                    return removeEffect(state, unit.id, buff.id);
                } else {
                    // スタックを減らす。
                    // 状態は不変なので、効果リストを置き換えるか、新しいスタック数で再追加するか？
                    // `addEffect` は通常マージまたはインクリメントを行う。
                    // `updateEffect` または `decrementStack` が必要。
                    // 回避策：削除して追加（スタック1）。
                    // これにより期間があればリセットされるが、いずれにせよ PERMANENT である。

                    const newState = removeEffect(state, unit.id, buff.id);
                    return addEffect(newState, unit.id, {
                        ...buff,
                        stackCount: buff.stackCount - 1
                    });
                }
            }
        }
    ]
};
