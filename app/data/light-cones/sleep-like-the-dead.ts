import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const sleepLikeTheDead: ILightConeData = {
    id: 'sleep-like-the-dead',
    name: '泥の如き眠り',
    description: '装備キャラの会心ダメージ+30%。装備キャラの通常攻撃または戦闘スキルで、会心が発生しなかった時、自身の会心率+36%。1ターン継続。この効果は3ターンごとに1回発動できる。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。装備キャラの通常攻撃または戦闘スキルで、会心が発生しなかった時、自身の会心率+{1}%。1ターン継続。この効果は3ターンごとに1回発動できる。',
    descriptionValues: [
        ['30', '36'],
        ['35', '42'],
        ['40', '48'],
        ['45', '54'],
        ['50', '60']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'sleep_crit_dmg',
            name: '泥の如き眠り（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.30, 0.35, 0.40, 0.45, 0.50]
        }
    ],
    eventHandlers: [
        {
            id: 'sleep_crit_proc',
            name: '泥の如き眠り（会心率バフ）',
            events: ['ON_DAMAGE_DEALT'],
            // 効果によるカスタムクールダウン追跡
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // クールダウン効果を確認
                if (unit.effects.some(e => e.id === `sleep_cooldown_${unit.id}`)) {
                    return state;
                }

                // アクションタイプを確認（強化通常攻撃もBASIC_ATTACKとして来る）
                let actionType: string | undefined;
                if ('actionType' in event) actionType = (event as any).actionType;

                if (actionType !== 'BASIC_ATTACK' && actionType !== 'SKILL') {
                    return state;
                }

                // 条件確認：会心が発生しなかった
                // イベントは isCrit のために安全にキャストして確認可能
                let isCrit = true; // デフォルトtrue（プロパティがない場合はトリガーしない）
                if ('isCrit' in event) isCrit = !!(event as any).isCrit;

                if (isCrit) return state;

                // 発動！
                const critRateVal = [0.36, 0.42, 0.48, 0.54, 0.60][superimposition - 1];

                let newState = state;

                // バフ適用（1ターン）
                newState = addEffect(newState, unit.id, {
                    id: `sleep_buff_${unit.id}`,
                    name: '泥の如き眠り（会心率）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 1,
                    modifiers: [
                        { target: 'crit_rate', source: '泥の如き眠り', type: 'add', value: critRateVal }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                // クールダウン適用（3ターン）
                newState = addEffect(newState, unit.id, {
                    id: `sleep_cooldown_${unit.id}`,
                    name: '泥の如き眠り（クールダウン）',
                    category: 'STATUS',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 3,
                    modifiers: [],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                // 注：「...で、会心が発生しなかった時」。
                // 多段攻撃の場合：ヒット1が非会心 -> 発動。
                // ヒット2 -> クールダウン中 -> 状態変化なし。
                // 実質的に、最初の非会心ヒットがトリガーとなる。
                // 会心率60%で5回ヒットする場合。
                // ヒット1：会心。
                // ヒット2：非会心 -> 発動！
                // ヒット3：バフあり（+36%）。
                // これは予想される動作と一致する（「会心率+... 1ターン継続」）。
                // つまり、同じ攻撃内の後続ヒットも恩恵を受けるか？
                // はい、`addEffect` は状態を即座に更新し、後続ヒットの `calculateDamage` は新しい状態を読み取るため？
                // 汎用シミュレーターでは、`state` はヒット間でスレッド化される。
                // したがって、はい、後続ヒットも恩恵を受ける。

                return newState;
            }
        }
    ]
};
