import { ILightConeData, createUnitId } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const swordplay: ILightConeData = {
    id: 'swordplay',
    name: '論剣',
    description: '装備キャラの攻撃が連続で同じ敵に命中するたびに、与ダメージ+8%、この効果は最大で5層累積できる。ターゲットが変わると、バフはリセットされる。',
    descriptionTemplate: '装備キャラの攻撃が連続で同じ敵に命中するたびに、与ダメージ+{0}%、この効果は最大で5層累積できる。ターゲットが変わると、バフはリセットされる。',
    descriptionValues: [
        ['8'],
        ['10'],
        ['12'],
        ['14'],
        ['16']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'swordplay-stack',
            name: '論剣（追撃）',
            events: ['ON_AFTER_HIT'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event) || !event.targetId) return state;

                const targetId = event.targetId;
                const dmgBoostPerStack = [0.08, 0.10, 0.12, 0.14, 0.16][superimposition - 1];
                const effectId = `swordplay_buff_${unit.id}`;

                // 既存のバフを確認
                const existingBuff = unit.effects.find(e => e.id === effectId);

                let currentStack = 0;
                let newState = state;

                if (existingBuff) {
                    // ターゲットが同じか確認
                    if (existingBuff.miscData?.currentTargetId === targetId) {
                        currentStack = existingBuff.stackCount || 1;
                    } else {
                        // ターゲットが変更された → バフをリセット
                        newState = removeEffect(newState, unit.id, effectId);
                        currentStack = 0;
                    }
                }

                if (currentStack < 5) {
                    return addEffect(newState, unit.id, {
                        id: effectId,
                        name: '論剣',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: currentStack + 1,
                        maxStacks: 5,
                        miscData: { currentTargetId: targetId },
                        modifiers: [
                            {
                                target: 'all_type_dmg_boost',
                                source: '論剣',
                                type: 'add',
                                value: dmgBoostPerStack * (currentStack + 1)
                            }
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
