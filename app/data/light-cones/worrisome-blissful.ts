import { ILightConeData, createUnitId } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const worrisomeBlissful: ILightConeData = {
    id: 'worrisome-blissful',
    name: '悩んで笑って',
    description: '装備キャラの会心率+18%、追加攻撃の与ダメージ+30%。装備キャラが追加攻撃を行った後、敵を「従順」状態にする。この効果は最大で2層累積できる。味方の攻撃が「従順」状態の敵に命中した時、「従順」1層につき与える会心ダメージ+12%。',
    descriptionTemplate: '装備キャラの会心率+{0}%、追加攻撃の与ダメージ+{1}%。装備キャラが追加攻撃を行った後、敵を「従順」状態にする。この効果は最大で2層累積できる。味方の攻撃が「従順」状態の敵に命中した時、「従順」1層につき与える会心ダメージ+{2}%。',
    descriptionValues: [
        ['18', '30', '12'],
        ['21', '35', '14'],
        ['24', '40', '16'],
        ['27', '45', '18'],
        ['30', '50', '20']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'worrisome_stats',
            name: '悩んで笑って（ステータス）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
        },
        {
            id: 'worrisome_fua_dmg',
            name: '悩んで笑って（追撃与ダメ）',
            category: 'BUFF',
            targetStat: 'fua_dmg_boost',
            effectValue: [0.30, 0.35, 0.40, 0.45, 0.50]
        }
    ],
    eventHandlers: [
        // 「従順」付与の処理
        {
            id: 'worrisome_apply_tame',
            name: '悩んで笑って（従順付与）',
            events: ['ON_FOLLOW_UP_ATTACK'], // "追加攻撃を行った後" -> ON_FOLLOW_UP_ATTACK で動作する
            handler: (event, state, unit, _superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // ターゲットに「従順」を付与。
                // イベントは targetId を持っているはず？
                // types の `FollowUpAttackAction` は `targetId`（単体）を使用するか、時には暗黙的なターゲットを使用する。
                // `event` が `targetId` を持っていると仮定する。
                // 待って、`ON_FOLLOW_UP_ATTACK` の `ActionEvent` には `targetId` がある。
                // しかし、追加攻撃は範囲攻撃（景元）の場合がある。
                // 範囲攻撃の場合、すべてに適用されるか？ 「追加攻撃を行った後、敵を「従順」状態にする」。
                // トパーズは単体攻撃。
                // テキスト：「敵を「従順」状態にする」。
                // ヒットが範囲攻撃の場合、 `actionType='FOLLOW_UP_ATTACK'` で `ON_DAMAGE_DEALT` が必要になるかもしれない。
                // これにより、すべてのターゲットにヒットすることが保証される。
                // `ON_DAMAGE_DEALT` を使用する方が、複数ターゲットの追加攻撃シナリオでは安全である。
                // しかしテキストは「...後」と言っており、アクションごとに1回であることを示唆している？
                // 「追加攻撃を行う時、従順を付与」。
                // カブ（多段ヒット）を使用する場合、1スタック付与されるか、即座に最大スタックになるか？
                // 通常、「攻撃後」はアクションごと、またはターゲットごとに1回を意味する。
                // トパーズはヒット時に従順を付与する。
                // より安全なターゲティングのために `ON_DAMAGE_DEALT` を使用しよう。

                return state;
            }
        },
        {
            id: 'worrisome_apply_tame_on_hit',
            name: '悩んで笑って（従順付与詳細）',
            events: ['ON_DAMAGE_DEALT'],
            handler: (event, state, unit, _superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const actionType = (event as import('@/app/simulator/engine/types').DamageDealtEvent).actionType;
                if (actionType !== 'FOLLOW_UP_ATTACK') return state;
                if (!('targetId' in event) || !event.targetId) return state;

                const targetId = createUnitId(event.targetId);

                // 「従順」を付与/累積
                return addEffect(state, targetId, {
                    id: `worrisome_tame_${unit.id}`,
                    name: '従順',
                    category: 'DEBUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    maxStacks: 2,
                    modifiers: [], // ロジックは計算で処理される
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        // 「従順」効果の処理（被会心ダメージ）
        {
            id: 'worrisome_tame_effect',
            name: '悩んで笑って（会心ダメ加算）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                // このハンドラはすべてのダメージ計算で実行され、従順が適用されるか確認する。
                // しかしハンドラはユニット（光円錐の装備者）にアタッチされている。
                // そのため、これは光円錐の所有者がイベントの一部である場合にのみ実行される... 待って。
                // `ON_BEFORE_DAMAGE_CALCULATION` はグローバルか？
                // いえ、ディスパッチャがハンドラを呼び出す。
                // ディスパッチャはイベントに対して登録されたすべてのハンドラを呼び出すか？
                // イベントハンドラロジック：
                // `state.eventHandlers` -> イテレータ。
                // つまり、YES、このハンドラはゲーム内のすべての単一ダメージイベントに対して実行される。
                // `event.targetId` に「従順」が適用されているか確認する（自身によって、または誰によって？）。
                // 「味方の攻撃が...命中した時」。任意の味方。
                // そのため `event.targetId` を確認するのは正しい。

                if (!('targetId' in event) || !event.targetId) return state;

                // ターゲットを取得
                const target = state.registry.get(createUnitId(event.targetId));
                if (!target) return state;

                // 従順デバフを見つける
                const tameBuff = target.effects.find(e => e.id === `worrisome_tame_${unit.id}`);
                if (!tameBuff || !tameBuff.stackCount) return state;

                // ボーナスを計算
                const critDmgBoost = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];
                const totalBoost = critDmgBoost * tameBuff.stackCount;

                // 現在のダメージコンテキストに適用
                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        critDmg: (state.damageModifiers.critDmg || 0) + totalBoost
                    }
                };
            }
        }
    ]
};
