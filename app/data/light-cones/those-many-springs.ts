import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const thoseManySprings: ILightConeData = {
    id: 'those-many-springs',
    name: '幾度目かの春',
    description: '装備キャラの効果命中+60%。装備キャラが通常攻撃、戦闘スキル、または必殺技を発動して敵に攻撃した後、60%の基礎確率で「甲卸」状態にする。「甲卸」状態の敵の受けるダメージ+10%、2ターン継続。ターゲットが装備キャラによって持続ダメージ系デバフを付与されている場合、60%の基礎確率で装備キャラが付与した「甲卸」状態を「窮寇」状態に強化し、さらに敵の受けるダメージ+14%、2ターン継続。敵に「窮寇」状態がある時、装備キャラはその敵に「甲卸」状態を付与できない。',
    descriptionTemplate: '装備キャラの効果命中+{0}%...「甲卸」状態の敵の受けるダメージ+{1}%...「窮寇」状態に強化し、さらに敵の受けるダメージ+{2}%...',
    descriptionValues: [
        ['60', '10', '14'],
        ['70', '12', '16'],
        ['80', '14', '18'],
        ['90', '16', '20'],
        ['100', '18', '22']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 952,
        atk: 582,
        def: 529,
    },
    passiveEffects: [
        {
            id: 'springs-ehr',
            name: '世事は跡を残さず（効果命中）',
            category: 'BUFF',
            targetStat: 'effect_hit_rate',
            effectValue: [0.60, 0.70, 0.80, 0.90, 1.00]
        }
    ],
    eventHandlers: [
        {
            id: 'springs-debuff-application',
            name: '世事は跡を残さず（デバフ付与）',
            events: ['ON_ATTACK'], // 攻撃後
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event)) return state;

                const targetId = event.targetId as string;
                const target = state.registry.get(createUnitId(targetId));
                if (!target) return state;

                let newState = state;

                // Values
                const baseDmgTaken = [0.10, 0.12, 0.14, 0.16, 0.18][superimposition - 1];
                const extraDmgTaken = [0.14, 0.16, 0.18, 0.20, 0.22][superimposition - 1];

                // Check states
                // ID: 
                // 甲卸: `springs_unarmed_${targetId}`
                // 窮寇: `springs_cornered_${targetId}`

                const hasCornered = target.effects.some(e => e.id === `springs_cornered_${targetId}`);
                if (hasCornered) {
                    return state;
                }

                // 装備キャラによる持続ダメージを確認
                const hasDoT = target.effects.some(e => e.type === 'DoT' && e.sourceUnitId === unit.id);

                if (hasDoT) {
                    // 甲卸が存在する場合削除
                    newState = removeEffect(newState, targetId, `springs_unarmed_${targetId}`);
                    // 窮寇を適用
                    newState = addEffect(newState, targetId, {
                        id: `springs_cornered_${targetId}`,
                        name: '窮寇',
                        category: 'DEBUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED', // 2ターン
                        duration: 2,
                        stackCount: 1,
                        modifiers: [
                            { target: 'all_type_vuln', value: baseDmgTaken + extraDmgTaken, type: 'add', source: '幾度目かの春' }
                        ],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                } else {
                    // 甲卸を適用
                    newState = addEffect(newState, targetId, {
                        id: `springs_unarmed_${targetId}`,
                        name: '甲卸',
                        category: 'DEBUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 2,
                        stackCount: 1,
                        modifiers: [
                            { target: 'all_type_vuln', value: baseDmgTaken, type: 'add', source: '幾度目かの春' }
                        ],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return newState;
            }
        }
    ]
};
