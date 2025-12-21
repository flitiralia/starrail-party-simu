import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const baptismOfPureThought: ILightConeData = {
    id: 'baptism-of-pure-thought',
    name: '純粋なる思惟の洗礼',
    description: '装備キャラの会心ダメージ+20%。敵にあるデバフ1つにつき、装備キャラがその敵に与える会心ダメージ+8%、最大で3層累積できる。必殺技で敵を攻撃する時、装備キャラは「論弁」効果を獲得し、与ダメージ+36%、追加攻撃が敵の防御力を24%無視する、この効果は2ターン継続する。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。敵にあるデバフ1つにつき、装備キャラがその敵に与える会心ダメージ+{1}%、最大で3層累積できる。必殺技で敵を攻撃する時、装備キャラは「論弁」効果を獲得し、与ダメージ+{2}%、追加攻撃が敵の防御力を{3}%無視する、この効果は2ターン継続する。',
    descriptionValues: [
        ['20', '8', '36', '24'],
        ['23', '9', '42', '28'],
        ['26', '10', '48', '32'],
        ['29', '11', '54', '36'],
        ['32', '12', '60', '40']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 952,
        atk: 582,
        def: 529,
    },
    passiveEffects: [
        {
            id: 'baptism_crit_dmg',
            name: '純粋なる思惟の洗礼（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.20, 0.23, 0.26, 0.29, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'baptism_debuff_scaling',
            name: '純粋なる思惟の洗礼（デバフ条件）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // デバフスケーリング用ターゲットID取得
                let targetUnitId: string | undefined;
                if ('targetId' in event && event.targetId) {
                    targetUnitId = event.targetId;
                }

                if (!targetUnitId) return state;

                // createUnitIdはevent.targetIdが既にUnitIdであれば不要？
                // しかし型が不一致の場合は使用しても安全。
                // UnitId型が必要なため、createUnitIdを使用する。
                // import { createUnitId } from '@/app/simulator/engine/unitId'; が必要。
                // しかし、createUnitIdはこのファイルでインポートされていない可能性がある。
                // import文を確認する必要があるが、このファイルにはない。
                // 先頭でインポートする必要がある。
                // (ただし、このツール呼び出しはコンテキストにあるインポートを自動では追加しない)

                // 一旦ここでは `as any` で回避するか、`createUnitId` を使うか。
                // 正しい方法は `createUnitId`。
                // 既に他のファイルで使われているはず。
                // しかし、このファイルの冒頭は見ていないのでインポートがあるかわからない。
                // view_fileでLine 1-3を見ている。`import { ILightConeData, ...` と `import { addEffect } ...` のみ。
                // `createUnitId` をインポートする必要がある。

                // 待って、ユーザー要望は「as anyの削減」。
                // 正しく `createUnitId` を導入すべき。

                // ここでは `as any` に戻すのではなく、正しく直したいが、インポートがないとエラーになる。
                // 2手順踏む。1. インポート追加。 2. 修正。
                // まずは前の変更で壊れた箇所を修正する。
                // 前の変更で `targetUnitId` は string になった。
                // もともとは `event.targetId as any` だった。
                // 結局 `state.registry.get` が `UnitId` を要求している。

                // 今回はまず `as any` を一時的に残し（他の箇所を修正した後）、
                // 次のステップで `createUnitId` インポートと修正を行う。
                const target = state.registry.get(createUnitId(targetUnitId));
                let extraCritDmg = 0;
                if (target) {
                    const debuffCount = target.effects.filter(e => e.category === 'DEBUFF').length;
                    const stacks = Math.min(3, debuffCount);
                    const perStack = [0.08, 0.09, 0.10, 0.11, 0.12][superimposition - 1];
                    extraCritDmg = stacks * perStack;
                }

                // 論弁チェック
                let extraDmg = 0;
                let defIgnore = 0;
                const disputation = unit.effects.find(e => e.id === `baptism_disputation_${unit.id}`);

                if (disputation) {
                    const dmgBoost = [0.36, 0.42, 0.48, 0.54, 0.60][superimposition - 1];
                    extraDmg = dmgBoost;

                    // 追加攻撃での防御無視
                    let actionType: string | undefined;
                    if ('actionType' in event) actionType = (event as any).actionType;

                    if (actionType === 'FOLLOW_UP_ATTACK') {
                        const ignoreVal = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];
                        defIgnore = ignoreVal;
                    }
                }

                if (extraCritDmg === 0 && extraDmg === 0 && defIgnore === 0) return state;

                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        critDmg: (state.damageModifiers.critDmg || 0) + extraCritDmg,
                        allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + extraDmg,
                        defIgnore: (state.damageModifiers.defIgnore || 0) + defIgnore
                    }
                };
            }
        },
        {
            id: 'baptism_disputation_trigger',
            name: '純粋なる思惟の洗礼（論弁獲得）',
            events: ['ON_DAMAGE_DEALT'],
            // テキスト：「必殺技で敵を攻撃する時」
            // 通常ON_ULTIMATE_USEDは使用時に発火する。攻撃を意味するか？
            // ほとんどの巡狩の必殺技は攻撃する。
            // 非攻撃必殺技（例：トパーズのカブ強化など）の場合、カウントされない可能性が高い？
            // 「攻撃する時……」は'ON_ATTACK'をサブタイプ'ULTIMATE'でフックすべきか？
            // あるいは'ON_BEFORE_ATTACK'か？
            // ON_ULTIMATE_USEDの方が簡単である。
            // しかしトパーズの必殺技は「強化」であり、直接攻撃ではない（カブが後で攻撃する）。
            // メモによればトパーズは論弁を獲得できない：「トパーズは必殺技がダメージを与えないため論弁を獲得できない」。
            // つまり、`ON_ATTACK`または`ON_DAMAGE_DEALT`でタイプがUltimateのものを使用しなければならない。
            // `ON_ATTACK`はすべての攻撃で発火する。

            handler: (event, state, unit, superimposition) => {
                // "必殺技攻撃"を検出する必要がある。
                if (event.sourceId !== unit.id) return state;

                // イベントがON_ATTACK（汎用）のロジックの場合：
                // それが必殺技かどうかを知る必要がある。
                // ON_ATTACKのイベントペイロードにはアクション情報が含まれることが多い？
                // `CombatAction`はタイプを持つ。

                // 'ON_ULTIMATE_USED'を使うと、トパーズでも発火してしまう（これは間違い）。
                // `actionType == 'ULTIMATE'`で'ON_DAMAGE_DEALT'を使うと、ヒットごとに発火するか？
                // "論弁を獲得" -> バフ獲得。
                // ヒットごとだとしても、更新するだけなので問題ない。
                // "2ターン継続"。

                // `ON_DAMAGE_DEALT`を使用して`actionType === 'ULTIMATE'`を確認することにする。
                if (event.type !== 'ON_DAMAGE_DEALT') return state;

                let activeAction: string | undefined;
                if ('actionType' in event) activeAction = (event as any).actionType;

                if (activeAction !== 'ULTIMATE') return state;

                // 論弁を適用
                // 注：バフ自体はモディファイアを持たない。なぜなら効果が条件的だから（追加攻撃の防御無視）。
                // しかし、「与ダメージ+36%」はバフが有効な間は無条件である。
                // つまり、与ダメージアップをバフ自体に入れることができるか？
                // "論弁状態：与ダメージ+36%、追加攻撃の防御無視+24%"。
                // そう、与ダメージアップは状態に対して静的である。防御無視は追加攻撃に固有である。
                // したがって、`ON_BEFORE_DAMAGE_CALCULATION`での計算を省くためにここに与ダメージアップをモディファイアとして入れることができるが、
                // 上記の`ON_BEFORE_DAMAGE_CALCULATION`ロジックではすでに`extraDmg`を処理している。
                // ここでモディファイアに入れると、盲目的に上記で追加した場合に二重取りになってしまう。
                // 上記のロジックで二重取りを除去したか？
                // 上記ロジック：`if (disputation) extraDmg = 0.36`。
                // したがって、Effectはモディファイアを持たず、単なるマーカーであるべきである。

                return addEffect(state, unit.id, {
                    id: `baptism_disputation_${unit.id}`,
                    name: '論弁',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    modifiers: [], // ON_BEFORE_DAMAGE_CALCULATIONで処理される
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
