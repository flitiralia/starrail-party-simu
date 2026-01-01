import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const longRoadLeadsHome: ILightConeData = {
    id: 'long-road-leads-home',
    name: '長途はやがて帰途へと続く',
    description: '装備キャラの撃破特効+60%。敵が弱点撃破される時、100%の基礎確率で「着火」状態を付与し、受ける弱点撃破ダメージ+18%。2ターン継続、最大2層累積できる。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%。敵が弱点撃破される時...「着火」...受ける弱点撃破ダメージ+{1}%...',
    descriptionValues: [
        ['60', '18'],
        ['70', '21'],
        ['80', '24'],
        ['90', '27'],
        ['100', '30']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 661,
    },
    passiveEffects: [
        {
            id: 'long-road-be',
            name: '新生（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.60, 0.70, 0.80, 0.90, 1.00]
        }
    ],
    eventHandlers: [
        {
            id: 'long-road-ignition',
            name: '新生（着火）',
            events: ['ON_WEAKNESS_BREAK'], // グローバル？ "敵が弱点撃破される時"
            // 装備キャラが存在する必要があるか？はい（装備済み）。
            // 装備キャラが撃破する必要があるか？「敵が弱点撃破される時」。"装備キャラが撃破する時"ではない。
            // テキスト：「敵が弱点撃破される時」。
            // グローバルリスナーを示唆する。
            handler: (event, state, unit, superimposition) => {
                // イベントのsourceIdは撃破者。targetIdは犠牲者。
                const targetId = (event as any).targetId;
                if (!targetId) return state;

                const val = [0.18, 0.21, 0.24, 0.27, 0.30][superimposition - 1];
                const maxStacks = 2;

                // 「着火」を適用（累積可能）
                // addEffect が単純に上書きする場合、スタックを手動で処理する必要がある。
                // 既存のスタックロジックを読み取るのが一般的。

                const existingName = '着火';
                const target = state.registry.get(targetId);
                const existing = target?.effects.find(e => e.name === existingName && e.sourceUnitId === unit.id);
                // ソース確認：装備者ごとまたはグローバル？
                // 通常はソースごと。

                const current = existing ? (existing.stackCount || 0) : 0;
                const next = Math.min(current + 1, maxStacks);

                return addEffect(state, targetId, {
                    id: `long_road_ignition_${targetId}_${unit.id}`,
                    name: existingName,
                    category: 'DEBUFF',
                    sourceUnitId: unit.id, // 装備者がソース
                    durationType: 'TURN_END_BASED', // 2ターン
                    duration: 2,
                    stackCount: next,
                    modifiers: [
                        { target: 'break_dmg_taken', value: val * next, type: 'add', source: '長途はやがて帰途へと続く' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
