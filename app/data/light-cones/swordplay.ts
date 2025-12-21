import { ILightConeData, createUnitId } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const swordplay: ILightConeData = {
    id: 'swordplay',
    name: '論剣',
    description: '装備キャラの攻撃が連続で同じ敵に命中するたびに、与ダメージ+8%、この効果は最大で5層累積できる。ターゲットが変わると、バフはリセットされる。',
    descriptionTemplate: '装備キャラの攻撃が連続で同じ敵に命中するたびに、与ダメージ+{0}%、この効果は最大で5層累積できる。ターゲットが変わると、バフはリセットされる。',
    descriptionValues: [
        ['8'],
        ['10'],
        ['12'],
        ['14'],
        ['16']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'swordplay_stack',
            name: '論剣（追撃）',
            events: ['ON_AFTER_HIT'], // ヒットごとにトリガーして「多段攻撃でスタック」を速くする
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event) || !event.targetId) return state;

                const targetId = event.targetId;
                const dmgBoostPerStack = [0.08, 0.10, 0.12, 0.14, 0.16][superimposition - 1];

                // 既存のトラッカーを確認
                // トラッカーID形式を仮定：`swordplay_buff_${unit.id}_${targetId}`
                // しかしアクティブなトラッカーは1つだけにしたい。
                // ユニット上の論剣バフを検索。
                const existingBuff = unit.effects.find(e => e.id.startsWith(`swordplay_buff_${unit.id}`));

                let currentStack = 0;
                const reset = false;

                if (existingBuff) {
                    // IDからターゲットIDを抽出
                    // ID: swordplay_buff_UNITID_TARGETID
                    // UNITIDにアンダースコアが含まれていると危険。
                    // より良い方法：existingBuff.id が `_${targetId}` で終わるか確認？
                    // または厳密な形式と一致させる。
                    // `swordplay_buff_${unit.id}_target_${targetId}` として構築すると仮定する。
                    const expectedId = `swordplay_buff_${unit.id}_target_${targetId}`;

                    if (existingBuff.id === expectedId) {
                        currentStack = existingBuff.stackCount || 1;
                    } else {
                        // ターゲットが変更された！ 古いバフを削除。
                        state = removeEffect(state, unit.id, existingBuff.id);
                        currentStack = 0; // 新しいターゲット、0から開始（以下で1追加）
                    }
                }

                if (currentStack < 5) {
                    return addEffect(state, unit.id, {
                        id: `swordplay_buff_${unit.id}_target_${targetId}`,
                        name: '論剣',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT', // ターゲットが変わるまで維持
                        duration: -1,
                        stackCount: currentStack + 1,
                        maxStacks: 5,
                        modifiers: [
                            {
                                target: 'all_type_dmg_boost',
                                source: '論剣',
                                type: 'add',
                                value: dmgBoostPerStack
                            }
                        ],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return state;
            }
        }
    ]
};
