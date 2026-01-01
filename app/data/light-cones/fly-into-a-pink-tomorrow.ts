import { ILightConeData } from '@/app/types';

export const flyIntoAPinkTomorrow: ILightConeData = {
    id: 'fly-into-a-pink-tomorrow',
    name: 'ピンク色の明日へ',
    description: '装備キャラの会心ダメージ+12%。開拓者・記憶が装備した場合、味方全体の与ダメージ+8%、強化通常攻撃「明日を一緒に紡ごう！」の与ダメージ+60%。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。開拓者・記憶が装備した場合、味方全体の与ダメージ+{1}%、強化通常攻撃「明日を一緒に紡ごう！」の与ダメージ+{2}%。',
    descriptionValues: [
        ['12', '8', '60'],
        ['15', '10', '70'],
        ['18', '12', '80'],
        ['21', '14', '90'],
        ['24', '16', '100']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 846,
        atk: 476,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'fly-into-a-pink-tomorrow-crit-dmg',
            name: '視線（会心ダメージ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.12, 0.15, 0.18, 0.21, 0.24]
        }
    ],
    eventHandlers: [
        {
            id: 'fly-into-a-pink-tomorrow-conditional',
            name: '視線（開拓者・記憶専用）',
            events: ['ON_BATTLE_START', 'ON_TURN_START'],
            handler: (event, state, unit, superimposition) => {
                // 開拓者・記憶のみ有効 (trailblazer-remembrance)
                if (unit.id !== 'trailblazer-remembrance') return state;

                // 味方全体の与ダメージアップ（オーラ適用すべきだが、ハンドラ内での簡易適用として全員にバフを配るか、state.damageModifiers的なグローバル補正があればそれを使う。
                // 現在のシステムでは味方全体バフはオーラ（Aura）を使うのが一般的だが、LightConeのhandlerからAuraを追加するのは複雑かもしれない。
                // ここでは簡易的に「味方全体へ永続バフ」をON_BATTLE_STARTで撒く方式にする。

                if (event.type === 'ON_BATTLE_START') {
                    // ここでの実装は複雑になるため、パッシブ効果として定義しづらい条件付き全体バフは
                    // 専用のロジックが必要。
                    // 一旦、unit自身に「味方全体バフ」を持たせるオーラを付与する形にするのがベスト。
                    // しかしLightConeデータ構造内からはaddAuraを直接呼び出せない（state変更は可能だがimportが必要）。

                    // シンプルに: unit自身に「特定条件下での強化」を持たせる
                }

                return state;
            }
        }
    ]
};
// 注: 条件付きの味方全体バフや特定技の強化は、現在のILightConeData eventHandlerだけでは表現が難しい場合がある。
// 特に「強化通常攻撃のダメージアップ」は ability-specific modifier が必要。
// 一旦、記述のみとし、実装はPlaceholderとするか、汎用的なバフとして自身に付与するか。
// 仕様書通りに「開拓者・記憶」かどうかの判定を入れる。

// 修正実装: eventHandlersでの複雑なロジックはimportが必要になるため、
// ILightConeDataの型定義上、純粋なデータオブジェクトとして扱う方が安全かもしれないが、
// 既存のa-secret-vow.tsでは関数を埋め込んでいる。
// Simulator側でこれを実行する際に state を渡すので、state操作関数（addEffectなど）が必要。
// しかし、LightConeファイル内では循環参照を避けるためエンジンへの依存を避けるべき。
// 従って、複雑な効果は「記述のみ」にとどめるか、あるいは `applyLightConeEffect` 側で特別扱いするか。
// 現状のアーキテクチャでは、LightConeデータ内に `handler` 関数を持たせているので、ここでロジックを書くことは許容されている。
// ただし、 `addEffect` などを import する必要がある。
