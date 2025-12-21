import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

export const weavingTimeIntoGold: ILightConeData = {
    id: 'weaving-time-into-gold',
    name: '光陰を織り黄金と成す',
    description: '装備キャラの基礎速度+12。装備キャラまたはその記憶の精霊が攻撃を行った後、装備キャラに「錦を織って」を1層付与する。「錦を織って」1層につき、装備キャラおよびその記憶の精霊の会心ダメージ+9.0%、最大で6層累積できる。「錦を織って」の層数が上限に達すると、1層につき、追加で通常攻撃ダメージ+9.0%。',
    descriptionTemplate: '装備キャラの基礎速度+{0}。装備キャラまたはその記憶の精霊が攻撃を行った後、装備キャラに「錦を織って」を1層付与する。「錦を織って」1層につき、装備キャラおよびその記憶の精霊の会心ダメージ+{1}%、最大で6層累積できる。「錦を織って」の層数が上限に達すると、1層につき、追加で通常攻撃ダメージ+{2}%。',
    descriptionValues: [
        ['12', '9.0', '9.0'],
        ['14', '10.5', '10.5'],
        ['16', '12.0', '12.0'],
        ['18', '13.5', '13.5'],
        ['20', '15.0', '15.0']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 1058,
        atk: 635,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'weaving-base-spd',
            name: '設立（基礎速度）',
            category: 'BUFF',
            targetStat: 'spd',
            effectValue: [12, 14, 16, 18, 20],
            // 基礎ステータスを変更するために 'base' タイプを使用
            type: 'base',
        }
    ],
    eventHandlers: [
        {
            id: 'weaving-stack',
            name: '設立（スタック獲得）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                // トリガー：装備キャラまたは記憶の精霊が攻撃
                // 記憶の精霊チェック: unit.isSummon && unit.ownerId === wearer.id
                // 注：ハンドラに渡される一般的な 'unit' は光円錐の装備者。
                // イベントソースが装備者またはその精霊であるかを確認する必要がある。

                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source) return state;

                const isWearer = source.id === unit.id;
                const isMySpirit = source.isSummon && source.ownerId === unit.id;

                if (!isWearer && !isMySpirit) return state;

                // 装備キャラに「錦を織って」スタックを追加
                const critDmgBoost = [0.09, 0.105, 0.12, 0.135, 0.15][superimposition - 1];
                const basicAtkBoost = [0.09, 0.105, 0.12, 0.135, 0.15][superimposition - 1];
                const maxStacks = 6;

                // 通常攻撃バフが適用されるか判断するために現在のスタックを取得
                const existing = unit.effects.find(e => e.id === `weaving-stack-${unit.id}`);
                const currentStack = existing ? (existing.stackCount || 0) : 0;
                const nextStack = Math.min(currentStack + 1, maxStacks);

                // 通常攻撃バフは最大スタック時のみ有効？
                // テキスト：「『錦を織って』の層数が上限に達すると、1層につき、追加で通常攻撃ダメージ+X%」
                // 解釈：スタック == 6 の場合、+6 * X% 通常攻撃ダメージ。
                // それとも「上限に達したら、任意のスタックで通常攻撃ダメージを与える」？
                // 日本語：「『錦を織って』の層数が上限に達すると、1層につき、追加で通常攻撃ダメージ+9.0%。」
                // 英語（参考）: "When stack count reaches upper limit, for each 1 stack, additionally Basic ATK DMG +9.0%."
                // これは通常攻撃バフがスタックに依存するが、最大スタックに達した場合のみトリガーされることを意味する。
                // 実装：スタック数に基づく動的な値だが、スタック数 == 6 を条件とする。

                return addEffect(state, unit.id, {
                    id: `weaving-stack-${unit.id}`,
                    name: '錦を織って',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    type: 'BUFF',
                    // 戦闘終了まで永続？ テキストには持続時間の記載なし。永続と仮定。
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: nextStack,
                    maxStacks: maxStacks,
                    modifiers: [
                        {
                            target: 'crit_dmg',
                            value: critDmgBoost, // statBuilder内でスタック数で乗算される
                            type: 'add',
                            source: '光陰を織り黄金と成す'
                        },
                        {
                            target: 'basic_atk_dmg_boost',
                            value: 0, // プレースホルダー、動的に計算されるか dynamicValue を使用できる
                            type: 'add',
                            source: '光陰を織り黄金と成す',
                            dynamicValue: (target, allUnits) => {
                                // スタック数が最大の場合、値を返す。そうでなければ0。
                                // ターゲット上の効果を見つけてスタック数を取得する必要がある。
                                const eff = target.effects.find(e => e.id === `weaving-stack-${unit.id}`);
                                const stacks = eff ? (eff.stackCount || 1) : 1;
                                if (stacks >= maxStacks) {
                                    return basicAtkBoost;
                                }
                                return 0;
                            }
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
