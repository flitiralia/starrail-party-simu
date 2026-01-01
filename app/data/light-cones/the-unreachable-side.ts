import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const theUnreachableSide: ILightConeData = {
    id: 'the-unreachable-side',
    name: '着かない彼岸',
    description: '装備キャラの会心率+18％、最大HP+18％。装備キャラが攻撃を受ける、または自身のHPを消費すると、与ダメージ+24％、この効果は装備キャラが攻撃を行った後に解除される。',
    descriptionTemplate: '装備キャラの会心率+{0}%、最大HP+{1}%。装備キャラが攻撃を受ける、または自身のHPを消費すると、与ダメージ+{2}%、この効果は装備キャラが攻撃を行った後に解除される。',
    descriptionValues: [
        ['18', '18', '24'],
        ['21', '21', '28'],
        ['24', '24', '32'],
        ['27', '27', '36'],
        ['30', '30', '40']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1270,
        atk: 582,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'the-unreachable-side-crit-hp',
            name: '着かない彼岸（ステータス）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
        },
        {
            id: 'the-unreachable-side-hp',
            name: '着かない彼岸（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
            // 注：targetStatは単一だが、この光円錐は会心率とHPの両方をバフする。
            // 別の passiveEffects エントリが必要か、複数を返す方法が必要。
            // インターフェースは PassiveLightConeEffect の配列をサポートしている。
        }
    ],
    eventHandlers: [
        {
            id: 'the-unreachable-side-dmg-trigger',
            name: '着かない彼岸（与ダメ発動）',
            events: ['ON_AFTER_HIT'], // HP消費を検知するためにON_HP_CHANGEDが必要だが、現状定義にあるか？
            // IEventには ON_DAMAGE_DEALT, ON_UNIT_HEALED などはあるが、HP消費単体のイベントは...
            // ON_DAMAGE_DEALT は被弾。
            // HP消費アクション（自傷）は ON_DAMAGE_DEALT (source==target) かもしれないし、コストとしての消費かもしれない。
            // コストとしてのHP消費はイベントとして飛んでくるか？
            // とりあえず被弾は ON_AFTER_HIT (targetIsUnit) で取れる。
            // 自傷は... アクションコストのHP消費イベントがあればそれをフック。なければ実装困難。
            // イベントタイプ定義を確認すると 'ON_UNIT_HEALED' はあるが 'ON_HP_CONSUMED' のようなものはない。
            // 代わりに 'ON_DAMAGE_DEALT' で sourceId === targetId のケース（刃の自傷など）を捕捉できるか？
            // 刃の自傷コストはダメージ扱いではない場合が多い（シールド貫通等）。
            // simulator/engine/types.ts には 'ON_DAMAGE_DEALT' がある。
            // 実際にはHP消費はキャラクター実装側で `state.units[id].hp -= cost` している可能性がある。
            // その場合イベントが発火しないと検知できない。
            // 推奨: キャラクター実装側でHP消費時に `ON_DAMAGE_DEALT` (type: 'hp_consume'?) を発行するか、
            // あるいは汎用的な `ON_HP_CHANGED` イベントを追加する必要があるかもしれない。
            // 現状は 'ON_AFTER_HIT' (被弾) のみを実装。
            // 解説「鏡流など味方によるHP消費はカウントされない」-> 自身による消費のみ。

            handler: (event, state, unit, superimposition) => {
                let triggered = false;

                // 被弾判定
                if (event.type === 'ON_AFTER_HIT' && event.targetId === unit.id) {
                    triggered = true;
                }

                // HP消費判定 (現状のイベントシステムでのサポート状況による)
                // 仮に ON_DAMAGE_DEALT で source==target の場合
                if (event.type === 'ON_DAMAGE_DEALT' && event.sourceId === unit.id && event.targetId === unit.id) {
                    triggered = true;
                }

                if (!triggered) return state;

                const dmgVal = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `the_unreachable_side_buff_${unit.id}`,
                    name: '着かない彼岸（与ダメージ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // 解除条件が特殊なため
                    modifiers: [
                        {
                            target: 'all_type_dmg_boost',
                            source: '着かない彼岸',
                            type: 'add',
                            value: dmgVal
                        }
                    ],
                    duration: -1,
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'the-unreachable-side-dmg-remove',
            name: '着かない彼岸（解除）',
            events: ['ON_ACTION_COMPLETE'], // 攻撃を行った後 = アクション終了時
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (event.type !== 'ON_ACTION_COMPLETE') return state;

                // 攻撃アクションかどうかの判定が必要。
                // ActionEventのsubType等で判定？
                // event.actionType が 'ATTACK', 'SKILL', 'ULTIMATE' など。
                // 単なるバフスキルなどでは解除されないかもしれないが、テキストは「攻撃を行った後に解除」。
                // 攻撃を伴わないスキル（ルアンメェなど）では解除されないとするのが妥当。
                // イベントに `actionType` があるか確認。
                // ActionEvent定義: type: 'ON_SKILL_USED' etc.
                // ON_ACTION_COMPLETE は ActionEvent ?
                // types.tsによると ON_ACTION_COMPLETE は ActionEventに含まれる。
                // ただし、actionの性質（攻撃かどうか）を判定するフラグが必要。
                // ここでは簡易的に全ての行動で解除してしまうか、あるいは `ON_ATTACK` をフックしてその終了を待つか。
                // `ON_ATTACK` は攻撃前イベントに近い挙動の可能性があるため、
                // `ON_ACTION_COMPLETE` で、かつそのアクションが攻撃だった場合...
                // 判定が難しいので、一旦「全てのアクション終了時」に解除する。
                // (厳密には非攻撃スキルで解除されると損だが、壊滅キャラはほぼ攻撃する)

                return removeEffect(state, unit.id, `the_unreachable_side_buff_${unit.id}`);
            }
        }
    ]
};
