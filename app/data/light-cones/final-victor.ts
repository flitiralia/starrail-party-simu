import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const finalVictor: ILightConeData = {
    id: 'final-victor',
    name: '最後の勝者',
    description: '装備キャラの攻撃力+12%。装備キャラが敵に攻撃を行い、会心が発生した後、｢好運｣を1層獲得する、最大で4層累積できる。｢好運｣1層につき、装備キャラの会心ダメージ+8%。｢好運｣は装備キャラのターン終了時に解除される。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。装備キャラが敵に攻撃を行い、会心が発生した後、｢好運｣を1層獲得する、最大で4層累積できる。｢好運｣1層につき、装備キャラの会心ダメージ+{1}%。｢好運｣は装備キャラのターン終了時に解除される。',
    descriptionValues: [
        ['12', '8'],
        ['14', '9'],
        ['16', '10'],
        ['18', '11'],
        ['20', '12']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'final_victor_atk',
            name: '最後の勝者（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.12, 0.14, 0.16, 0.18, 0.20]
        }
    ],
    eventHandlers: [
        {
            id: 'final_victor_crit_stack',
            name: '最後の勝者（好運）',
            events: ['ON_AFTER_HIT'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // このイベントで会心ヒットをチェックする？
                // 'ON_AFTER_HIT' イベントは 'isCrit' を含んでいるか？
                // types.ts の調査に基づく：'BeforeActionEvent' または 'DamageDealtEvent'。
                // 'ON_AFTER_HIT' は 'BeforeActionEvent' である（逆説的な命名？それとも 'AfterHitEvent'？）。
                // types.ts によると：'ON_AFTER_HIT' は 'BeforeActionEvent' インターフェース内にある。
                // 待って、'BeforeActionEvent' は...の前に発生することを意味するが、いや、'ON_AFTER_HIT' は後にトリガーされる。
                // イベントペイロードは 'isCrit' を含んでいるか？
                // types.ts を確認：
                // export interface BeforeActionEvent extends BaseEvent { ... type: 'ON_AFTER_HIT' ... }
                // それは 'isCrit' を持っていない。
                // 'DamageDealtEvent' は 'isCrit' を持っている。
                // しかし 'DamageDealtEvent' はダメージパケット全体のためのものである。
                // 通常、'ON_AFTER_HIT' はヒットごとに発火される。ヒットごとの会心検出が必要な場合、HitDetailをチェックする？
                // あるいは 'ON_DAMAGE_DEALT' を購読するかもしれない。
                // "装備キャラが敵に攻撃を行い、会心が発生した後" -> すべての会心ヒット？
                // ヒット数は重要か？ "敵に攻撃を行い" は通常アクションを意味するが、"会心が発生した後" はヒットごとを示唆する。
                // "1層獲得...最大4層"。もしスキルが5回ヒットしてすべて会心なら、即座に4層獲得するか？
                // スターレイルの「好運」メカニズムは通常、会心ヒットごとに累積する。
                // したがって、(`isCrit`を持つ) 'ON_DAMAGE_DEALT' を購読する方が安全である。

                if (event.type !== 'ON_DAMAGE_DEALT') return state;
                if (!event.isCrit) return state;

                const critDmgPerStack = [0.08, 0.09, 0.10, 0.11, 0.12][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `final_victor_good_fortune_${unit.id}`,
                    name: '好運',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 1, // Ends at turn end
                    stackCount: 1,
                    maxStacks: 4,
                    modifiers: [
                        {
                            target: 'crit_dmg',
                            source: '最後の勝者',
                            type: 'add',
                            value: critDmgPerStack
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
