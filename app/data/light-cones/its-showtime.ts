import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const itsShowtime: ILightConeData = {
    id: 'its-showtime',
    name: 'ショーの始まり',
    description: '装備キャラが敵にデバフを付与した後、「トリック」を1層獲得する。「トリック」1層につき、装備キャラの与ダメージ+6%、1ターン継続、最大で3層累積できる。装備キャラの効果命中が80%以上の時、攻撃力+20%。',
    descriptionTemplate: '装備キャラが敵にデバフを付与した後、「トリック」を1層獲得する。「トリック」1層につき、装備キャラの与ダメージ+{0}%...装備キャラの効果命中が80%以上の時、攻撃力+{1}%。',
    descriptionValues: [
        ['6', '20'],
        ['7', '24'],
        ['8', '28'],
        ['9', '32'],
        ['10', '36']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 1058,
        atk: 476,
        def: 264,
    },
    passiveEffects: [
        // 効果命中が80%以上の場合の攻撃力アップ
        // 動的なチェックが必要。条件付きでパッシブにできるか。
        // シミュレータは通常、`modifiers` が単純な場合のみ `passiveEffects` を無条件の静的バフとして扱う。
        // "効果命中 >= 80%" という条件が必要な場合、イベントリスナー（ON_TURN_START?）または `dynamic` モディファイアのサポートが必要。
        // 最も安全：ON_TURN_START/ON_ACTION または利用可能であれば永続的なウォッチャーロジックを使用する。
        // 既存のパターン：`onTurnStart` で条件をチェックする効果を使用する？いいえ。
        // 最善策：`ON_BEFORE_DAMAGE` と `ON_BEFORE_ACTION` をチェックして動的なステータスを追加する？
        // または単に厳密なイベントリスナー。
        // テキスト："効果命中が80%以上の時"。
        // `ON_BEFORE_DAMAGE_CALCULATION` を使用してダメージ計算時に一時的に攻撃力アップを追加する？
        // しかし攻撃力は持続ダメージ（DoT）のスケーリングに影響し、スナップショットされる可能性がある。
        // 理想的：ステータスに基づいてターンごとに更新される永続的なバッファー効果？
        // `ON_TURN_START` を介して実装する。
        {
            id: 'showtime-atk-check',
            name: '独りの娯楽（攻撃力チェック）',
            category: 'OTHER', // Logic only
            targetStat: 'atk_pct', // Metadata
            effectValue: [0.20, 0.24, 0.28, 0.32, 0.36] // Metadata
        }
    ],
    eventHandlers: [
        // 1. Trick Stacks (On Debuff Applied)
        {
            id: 'showtime-trick-stack',
            name: '独りの娯楽（トリック）',
            events: ['ON_DEBUFF_APPLIED'], // このイベントが型で存在/復元されていると仮定
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // "デバフを付与した後"。
                // 「トリック」を1層追加。

                const maxStacks = 3;

                const buffId = `showtime_trick_${unit.id}`;
                const existing = unit.effects.find(e => e.id === buffId);
                const currentStacks = existing ? (existing.stackCount || 0) : 0;
                const nextStacks = Math.min(currentStacks + 1, maxStacks);

                const bonusPerStack = [0.06, 0.07, 0.08, 0.09, 0.10][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: buffId,
                    name: 'トリック',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 1,
                    stackCount: nextStacks,
                    modifiers: [
                        { target: 'all_type_dmg_boost', value: bonusPerStack * nextStacks, type: 'add', source: 'ショーの始まり' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        // 2. ATK Boost (Logic)
        {
            id: 'showtime-atk-logic',
            name: '独りの娯楽（攻撃力）',
            events: ['ON_BATTLE_START', 'ON_TURN_START'],
            handler: (event, state, unit, superimposition) => {
                // 効果命中をチェック
                const ehr = unit.stats.effect_hit_rate || 0;
                const atkBonus = [0.20, 0.24, 0.28, 0.32, 0.36][superimposition - 1];
                const buffId = `showtime_atk_buff_${unit.id}`;

                if (ehr >= 0.80) {
                    return addEffect(state, unit.id, {
                        id: buffId,
                        name: 'ショーの始まり（攻撃力）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT', // チェック失敗まで持続？
                        // 実際には1ターンにするか、永続にして失敗時に削除するのが良いか？
                        // 永続を使用し、削除/追加を行う。
                        duration: -1,
                        stackCount: 1,
                        modifiers: [
                            { target: 'atk_pct', value: atkBonus, type: 'add', source: 'ショーの始まり' }
                        ],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                } else {
                    const { removeEffect } = require('@/app/simulator/engine/effectManager');
                    return removeEffect(state, unit.id, buffId);
                }
            }
        }
    ]
};
