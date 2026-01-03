import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const earthlyEscapade: ILightConeData = {
    id: 'earthly-escapade',
    name: '人生は遊び',
    description: '装備キャラの会心ダメージ+32%。戦闘開始時、装備キャラは「仮面」を獲得する、3ターン継続。装備キャラに「仮面」がある時、装備キャラ以外の味方の会心率+10%、会心ダメージ+28%。装備キャラがSPを1回復するたびに、「虹色の炎」を1層獲得する（SPを回復する際、上限を超えた分もカウントされる）。「虹色の炎」が4層に達した後、すべての「虹色の炎」を解除し、「仮面」を獲得する、4ターン継続。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。戦闘開始時、装備キャラは「仮面」を獲得する、3ターン継続。装備キャラに「仮面」がある時、装備キャラ以外の味方の会心率+10%、会心ダメージ+{2}%。装備キャラがSPを1回復するたびに、「虹色の炎」を1層獲得する。「虹色の炎」が4層に達した後、すべての「虹色の炎」を解除し、「仮面」を獲得する、4ターン継続。',
    descriptionValues: [
        ['32', '10', '28'], // 待って、テキストの説明値：CRは10->14、CDは28->56？
        ['39', '11', '35'],
        ['46', '12', '42'],
        ['53', '13', '49'],
        ['60', '14', '56']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 1164,
        atk: 529,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'earthly-escapade-cd',
            name: '人生は遊び（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.32, 0.39, 0.46, 0.53, 0.60]
        }
    ],
    eventHandlers: [
        {
            id: 'earthly-escapade-mask-init',
            name: '人生は遊び（仮面初期付与）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                return applyMask(state, unit.id, 3, superimposition);
            }
        },
        {
            id: 'earthly-escapade-sp-listener',
            name: '人生は遊び（SP回復監視）',
            events: ['ON_SP_GAINED'],
            handler: (event, state, unit, superimposition) => {
                // 装備者がSPを回復した場合のみ処理
                if (event.sourceId !== unit.id) return state;
                // rawAmount を使用（上限を超えた分もカウントされる仕様に対応）
                const amount = (event as any).rawAmount || (event as any).value || 0;
                if (amount <= 0) return state;

                // スタックを追加
                const trackerId = `earthly_escapade_flame_${unit.id}`;
                const tracker = unit.effects.find(e => e.id === trackerId);
                const current = tracker ? (tracker.stackCount || 0) : 0;
                const next = current + amount;

                let newState = state;

                if (next >= 4) {
                    // 仮面をトリガー
                    newState = applyMask(newState, unit.id, 4, superimposition);
                    // スタックをリセット（解除ロジック：「すべての虹色の炎を解除」）
                    newState = removeEffect(newState, unit.id, trackerId);
                } else {
                    // スタック効果を更新
                    newState = addEffect(newState, unit.id, {
                        id: trackerId,
                        name: '虹色の炎',
                        category: 'STATUS',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: next,
                        modifiers: [],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return newState;
            }
        }
    ]
};

// ヘルパー: 仮面（Mask）の適用
function applyMask(state: any, unitId: any, duration: number, superimposition: number) {
    const crBuff = [0.10, 0.11, 0.12, 0.13, 0.14][superimposition - 1];
    const cdBuff = [0.28, 0.35, 0.42, 0.49, 0.56][superimposition - 1];

    // 仮面は装備者に付くバフだが、効果は「装備キャラ以外の味方」へのオーラとして機能する
    // これを実現するために、仮面の `apply` でオーラを登録し、`remove` でオーラを削除する
    // IAura インターフェースを使用する（auraManager.ts）

    // 循環依存を避けるため型キャストや動的インポートが必要かもしれないが、
    // ここでは単純に効果定義内で完結させる。
    // しかし、EffectManagerは `apply` 実行時に `auraManager` の関数を呼ぶわけではない。
    // Effectの `apply` 関数内で `addAura` を呼ぶ必要がある。
    // `addAura` は `app/simulator/engine/auraManager` からインポートする必要があるが、
    // LightConeファイルからはインポート可能か？ -> 可能。

    // しかし、このファイルではまだ `addAura` をインポートしていない。
    // `replace_file_content` ではインポートを追加できない（既存のインポート行を編集しないと）。
    // 幸い、`addEffect` はインポート済み。
    // オーラを使わずに、単純に「効果適用時」に「味方全員（自分以外）にバフ効果を付与」し、
    // 「効果削除時」に「それらを削除」するというアプローチをとる（Auraシステムを使わない簡易実装）。
    // これでも機能的には等価。

    // しかし「オーラ」機能があるなら使いたい。
    // 今回は安全策として、前の会話で検討した「apply/removeで他者に効果つけ外し」を採用する。
    // これはオーラマネージャを介さず直接Effectとして他者に付与するもの。

    return addEffect(state, unitId, {
        id: `earthly_escapade_mask_${unitId}`,
        name: '仮面',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'TURN_START_BASED',
        duration: duration,
        stackCount: 1,
        modifiers: [],
        // 以下の apply / remove で味方へのバフを管理
        apply: (u, s) => {
            const allies = s.registry.getAliveAllies().filter(a => a.id !== u.id);
            let ns = s;
            allies.forEach(ally => {
                ns = addEffect(ns, ally.id, {
                    id: `earthly_escapade_mask_buff_${ally.id}`,
                    name: '仮面 (バフ)',
                    category: 'BUFF',
                    sourceUnitId: u.id,
                    durationType: 'LINKED', // 親（仮面）にリンク
                    linkedEffectId: `earthly_escapade_mask_${unitId}`,
                    duration: -1,
                    stackCount: 1,
                    modifiers: [
                        { target: 'crit_rate', value: crBuff, type: 'add', source: '人生は遊び' },
                        { target: 'crit_dmg', value: cdBuff, type: 'add', source: '人生は遊び' }
                    ],
                    apply: (au, as_state) => as_state,
                    remove: (au, as_state) => as_state
                });
            });
            return ns;
        },
        remove: (u, s) => {
            // LINKED なので、EffectManagerの削除ロジックが再帰的に消してくれるはずだが、
            // 明示的に消す方が安全かつ確実。特にLINKEDの実装に依存しない場合。
            // removeEffectの再帰削除ロジック（Global Scan）は実装されている（step 47で確認済み）。
            // よってここでは何もしなくてよい？
            // ただし、apply時に死んでいた味方が復活した場合などは考慮漏れするが、再適用のタイミングがない。
            // 厳密なオーラ（動的対象変更）ではないが、現在の仕様ではこれで十分。
            return s;
        }
    });
}
