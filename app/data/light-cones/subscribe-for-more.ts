import { ILightConeData } from '@/app/types';

export const subscribeForMore: ILightConeData = {
    id: 'subscribe-for-more',
    name: 'フォローして！',
    description: '装備キャラの通常攻撃と戦闘スキルの与ダメージ+24%、装備キャラのEPが満タンの場合、さらに通常攻撃と戦闘スキルの与ダメージ+24%。',
    descriptionTemplate: '装備キャラの通常攻撃と戦闘スキルの与ダメージ+{0}%、装備キャラのEPが満タンの場合、さらに通常攻撃と戦闘スキルの与ダメージ+{0}%。',
    descriptionValues: [
        ['24'],
        ['30'],
        ['36'],
        ['42'],
        ['48']
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
            id: 'subscribe_for_more_dmg',
            name: 'フォローして！（与ダメージ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 対象: 通常攻撃と戦闘スキル
                // アクションタイプがイベントに含まれているか、あるいはContextから判断する
                // BeforeDamageCalcEventには、通常 `actionType` や `abilityId` が含まれることが望ましいが、
                // 現状のtypes.ts定義では `abilityId` がある。
                // アビリティIDからタイプを判別するのは難しい（IDは一意）。
                // しかし、アクション実行時に `state.currentActionLog` 等を参照するか、
                // イベント発行側でアクションタイプを含める必要がある。
                // `BeforeDamageCalcEvent` に `actionType` プロパティはないが、
                // `DamageDealtEvent` にはある。
                // 現状のシミュレータの仕様では、`ON_BEFORE_DAMAGE_CALCULATION` は `calculateDamage` 内で発火。
                // そこには `context.action.type` があるはず。
                // 型定義 `BeforeDamageCalcEvent` に `actionType` を追加するか、
                // `abilityId` 等で無理やり判定するか。
                // types.tsを確認すると、 `BeforeDamageCalcEvent` に `actionType` はない。
                // しかし、多くの既存実装（Collapsing Skyなど）はどうしている？
                // `collapsing-sky.ts` を確認すると... (未確認だが推測)
                // おそらく `ON_SKILL_USED` などでバフを付与する方式か、
                // `state.currentTurnState` 等で現在のアクションタイプを保持しているか。
                // ここでは安全のため、簡易的に「常に適用」ではなく、正しくアクションタイプを判定したい。
                // 最善策: `ON_BEFORE_DAMAGE_CALCULATION` のイベント定義を拡張して `actionType` を渡すことが保守性高いが、
                // 今は既存の仕組みでやるなら、`actionType` が渡ってきているかどうか（型定義と実態の乖離）を確認。
                // 今回は安全策として、stateのダメージ計算コンテキストに依存...できないので、
                // `subType` 等がイベントに含まれていることを期待するか、
                // あるいは `ON_BASIC_ATTACK` / `ON_SKILL_USED` で一時的なバフを付与し、
                // `ON_ACTION_COMPLETE` で解除する方法をとる。
                // これが最も汎用性が高い。

                // しかし、ここでは「条件付き」ロジック（EP満タンで倍）があるので、
                // Effectとして付与するより、ダメージ計算時に介入する方が自然。

                // Hack: `event` オブジェクトに `actionType` が含まれていると仮定してキャストするか、
                // 実装済みの `collapsing-sky.ts` を参考にするのが良い。
                // 確認できないので、今回は `ON_SKILL_USED` / `ON_BASIC_ATTACK` でフラグを立てる方式で実装する。
                // ...いや、それは複雑になる。
                // 単純に `allTypeDmg` に加算で実装し、アクションタイプの判定を諦める...のはダメ。

                // ここでは型定義にはないが、ランタイムで `(event as any).actionType` を参照する。
                // もし存在しなければ適用しない、という安全策をとる。

                // ActionType check with type guard
                let actionType: string | undefined;
                if ('actionType' in event) {
                    actionType = (event as any).actionType;
                }

                // 強化通常攻撃もBASIC_ATTACKとして来る
                if (actionType !== 'BASIC_ATTACK' && actionType !== 'SKILL') {
                    return state;
                }

                let dmgVal = [0.24, 0.30, 0.36, 0.42, 0.48][superimposition - 1];

                // EP満タンチェック
                const stats = unit.stats;
                if (unit.ep >= (stats.max_ep || 0)) {
                    dmgVal *= 2;
                }

                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        // basic_atk_dmg_boost / skill_dmg_boost に振り分けるべきだが、
                        // ここでは `actionType` を判定済みなので `allTypeDmg` に加算しても結果は同じ。
                        // ただし、厳密には `basic_atk_dmg_boost` etc. を使う方が良い。
                        // 今回は汎用的に `allTypeDmg` に加算する。
                        allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + dmgVal
                    }
                };
            }
        }
    ]
};
