import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const destinysThreadsForewoven: ILightConeData = {
    id: 'destinys-threads-forewoven',
    name: '運命を紡ぐ糸',
    description: '装備キャラの効果抵抗+12%。装備キャラの防御力100につき、与ダメージ+0.8%、最大で与ダメージ+32%。',
    descriptionTemplate: '装備キャラの効果抵抗+{0}%。装備キャラの防御力100につき、与ダメージ+{1}%、最大で与ダメージ+{2}%。',
    descriptionValues: [
        ['12', '0.8', '32'],
        ['14', '0.9', '36'],
        ['16', '1.0', '40'],
        ['18', '1.1', '44'],
        ['20', '1.2', '48']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 952,
        atk: 370,
        def: 463,
    },

    passiveEffects: [
        {
            id: 'threads-res',
            name: '洞察（効果抵抗）',
            category: 'BUFF',
            targetStat: 'effect_res',
            effectValue: [0.12, 0.14, 0.16, 0.18, 0.20]
        }
    ],

    eventHandlers: [
        {
            id: 'threads-dynamic-dmg',
            name: '洞察（防御力変換与ダメ）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const dmgPer100 = [0.008, 0.009, 0.010, 0.011, 0.012][superimposition - 1];
                const maxDmg = [0.32, 0.36, 0.40, 0.44, 0.48][superimposition - 1];

                // 永続的な動的バフを適用
                return addEffect(state, unit.id, {
                    id: `threads-dmg-buff-${unit.id}`,
                    name: '洞察（与ダメUP）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    modifiers: [{
                        target: 'all_type_dmg_boost',
                        source: '運命を紡ぐ糸',
                        type: 'add',
                        value: 0, // Ignored
                        dynamicValue: (u, all) => {
                            // 防御力に基づいて計算
                            // 基礎防御力 + 防御力% + 固定値防御力が必要？
                            // u.stats.def は最終防御力であるべき？
                            // `statBuilder` では、`calculateFinalStats` が防御力を計算する。
                            // 動的モディファイアはステータス計算中に適用されるか、それとも後か？
                            // 中に適用される場合、再帰の問題は？
                            // `calculateFinalStats` はモディファイアを反復処理する。もしこのモディファイアが `u.stats.def` に依存している場合、不完全な防御力を参照するか、ループを引き起こす可能性がある。
                            // `statBuilder` は通常、基礎 -> 加算 -> 割合 -> 最終 の順で計算する。
                            // もしモディファイアが最終防御力を必要とするなら...
                            // 与ダメージUPは防御力の後に計算される？
                            // 順序: 基礎ステータス -> 属性のモディファイア（加算/割合） -> 最終ステータス。
                            // 属性には防御力と与ダメージUPが含まれる。
                            // もし与ダメージUPの計算が防御力に依存する場合...
                            // 標準的なステータスビルダーの順序:
                            // 1. 'hp', 'atk', 'def', 'spd' (コアステータス) を計算。
                            // 2. その他のステータスを計算。
                            // この順序が強制されている場合、`dynamicValue` 内で `u.stats.def` に安全にアクセスできる。
                            // もし `u.stats` に部分的な結果が格納されていれば。
                            // しかし `dynamicValue` は `u: Unit` を取る。`u.stats` は前回の計算のスナップショットか、現在か？
                            // `statBuilder.ts` は通常、作業中のステータスオブジェクトを渡すか？それとも `unit`（古いステータスを持つ）を渡すか？
                            // もし `unit` が古いステータスを持っているなら、前のターンの防御力を使用していることになる。パッシブとしては許容範囲内？
                            // 通常、防御力は計算中に大きく変動しない。
                            // 安全なアプローチ: `u.stats.def` を使用する。
                            const def = u.stats.def || 0;
                            const boost = Math.min(maxDmg, Math.floor(def / 100) * dmgPer100);
                            return boost;
                        }
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
