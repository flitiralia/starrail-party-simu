import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const weWillMeetAgain: ILightConeData = {
    id: 'we-will-meet-again',
    name: 'またお会いしましょう',
    description: '装備キャラが通常攻撃または戦闘スキルを発動した後、攻撃を受けた敵からランダムに1体選択し、装備キャラの攻撃力48%分の付加ダメージを与える。',
    descriptionTemplate: '装備キャラが通常攻撃または戦闘スキルを発動した後、攻撃を受けた敵からランダムに1体選択し、装備キャラの攻撃力{0}%分の付加ダメージを与える。',
    descriptionValues: [
        ['48'],
        ['60'],
        ['72'],
        ['84'],
        ['96']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 846,
        atk: 529,
        def: 330,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'meet_again_damage',
            name: '交わす拳、言葉の如く',
            events: ['ON_BASIC_ATTACK', 'ON_SKILL_USED'], // 通常攻撃またはスキル
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // "使用後...攻撃を受けた敵の中からランダムな敵に付加ダメージを与える"。
                // メインターゲットは常に攻撃されていると仮定。
                // 簡略化：メインターゲットにダメージを与える。

                if (!('targetId' in event) || !event.targetId) return state;

                const multiplier = [0.48, 0.60, 0.72, 0.84, 0.96][superimposition - 1];

                // 付加ダメージをトリガーする必要がある。
                // `Action` フローを使用しない場合、ダメージの直接的な状態変更は難しい。
                // 通常、ログに `AdditionalDamage` エントリを追加するか、ヘルパーをトリガーする？
                // `dealDamage` ロジックが通常これを処理する。
                // しかし、ここでは reducer 内にいる。
                // "追加アクション" がキューに入れられた状態を返すか、単にログに記録する。
                // 「付加ダメージ」の現在のシミュレーターパターン：
                // ロジックが許せば、即時効果またはログエントリロジックとして実装されることが多い？
                // しかし `GameState` はダメージを実行しない。`dispatcher` が行う。
                // ダメージを与えたい場合、通常はイベントを発行するか、`followUpAction` を返す必要がある？
                // 「付加ダメージ」は追加攻撃ではない。追加ヒットである。
                // types の `AdditionalDamageEntry`。
                // `actionLog` などに追加すべきか？
                // 待って、`addEnergy` は効果的に行われた。
                // 実際のダメージには `calculateDamage` が必要。
                // 今のところ、ここから循環依存や複雑なモックなしに完全な `dealDamage` を簡単に呼び出すことはできないため、ダメージをシミュレートするログエントリを追加する。
                // または：`ON_DAMAGE_DEALT` で `publishEvent` を使用した？ いえ。

                // 妥協案：「保留中のダメージ」効果/フラグを追加？
                // または `solitary-healing` のEPロジックのように単にログに記録する。

                const dmg = unit.stats.atk * multiplier; // 簡易版（ここでは防御/耐性計算なし）

                // 統合ログに付加ダメージを追記
                const { appendAdditionalDamage } = require('@/app/simulator/engine/dispatcher');
                return appendAdditionalDamage(state, {
                    source: unit.name,
                    name: 'またお会いしましょう',
                    damage: dmg,
                    target: state.registry.get(require('@/app/simulator/engine/unitId').createUnitId(event.targetId))?.name || event.targetId,
                    damageType: 'additional',
                    isCrit: false
                });
            }
        }
    ]
};
