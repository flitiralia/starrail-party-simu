import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const resolutionShinesAsPearlsOfSweat: ILightConeData = {
    id: 'resolution-shines-as-pearls-of-sweat',
    name: '決意は汗のように輝く',
    description: '装備キャラの攻撃が敵に命中した時、その敵が「陥落」状態でない場合、60%の基礎確率で敵を「陥落」状態にする。「陥落」状態の敵は防御力-12%、1ターン継続。',
    descriptionTemplate: '装備キャラの攻撃が敵に命中した時、その敵が「陥落」状態でない場合、{0}%の基礎確率で敵を「陥落」状態にする。「陥落」状態の敵は防御力-{1}%、1ターン継続。',
    descriptionValues: [
        ['60', '12'],
        ['70', '13'],
        ['80', '14'],
        ['90', '15'],
        ['100', '16']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'resolution-ensnared-apply',
            name: '振り返って（陥落付与）',
            events: ['ON_DAMAGE_DEALT'], // On Hit
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event)) return state;
                const targetId = event.targetId as string;

                const target = state.registry.get(createUnitId(targetId));
                if (!target) return state;

                // 「ターゲットがまだ陥落状態でない場合」
                // IDは特定的か：`resolution_ensnared_${targetId}`？
                // 待って、「陥落状態は累積しない」。「他の陥落効果と累積しない」？
                // 「重複しない」。
                // （他者からのものであっても）何らかの陥落効果が存在するか確認すべき。
                // 効果名 '陥落' またはID規則。
                // この光円錐を使用する全ユニットでID規則があると仮定：`resolution_ensnared` プレフィックスまたはロジック？
                // ユニット間での確認には効果名チェックが最も安全。
                const hasEnsnared = target.effects.some(e => e.name === '陥落');

                if (!hasEnsnared) {
                    const defShred = [0.12, 0.13, 0.14, 0.15, 0.16][superimposition - 1];
                    // 基礎確率はシミュレーターで処理される？ それともここで判定を通す？
                    // 検証されたランダムシードアクセスがない限り、通常の慣習に従ってRNGは無視する。

                    return addEffect(state, targetId, {
                        id: `resolution_ensnared_${targetId}_by_${unit.id}`, // 技術的にはソース固有だが、論理チェックでグローバルな「陥落」を処理する
                        name: '陥落',
                        category: 'DEBUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_END_BASED', // 1ターン。「1ターン継続」。
                        // 通常は「装備者の」次のターンまでを意味するか？ それとも「敵の」？
                        // 「敵の防御力-12%、1ターン継続」。通常は敵のターンを意味する。
                        duration: 1,
                        stackCount: 1,
                        modifiers: [
                            { target: 'def_pct', value: -defShred, type: 'add', source: '決意は汗のように輝く' }
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
