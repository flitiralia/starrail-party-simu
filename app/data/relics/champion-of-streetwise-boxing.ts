import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

/**
 * 成り上がりチャンピオン
 * 2セット: 物理ダメージ+10%
 * 4セット: 装備キャラが攻撃を行う、または攻撃を受けた後、今回の戦闘中の攻撃力+5%、最大で5層累積できる
 */
export const CHAMPION_OF_STREETWISE_BOXING: RelicSet = {
    id: 'champion_of_streetwise_boxing',
    name: '成り上がりチャンピオン',
    setBonuses: [
        {
            pieces: 2,
            description: '物理ダメージ+10%。',
            passiveEffects: [
                {
                    stat: 'physical_dmg_boost',
                    value: 0.1,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: '装備キャラが攻撃を行う、または攻撃を受けた後、今回の戦闘中の攻撃力+5%、最大で5層累積できる。',
            eventHandlers: [
                {
                    // 攻撃時: ON_ATTACK / 被攻撃時: ON_BEFORE_HIT
                    events: ['ON_ATTACK', 'ON_BEFORE_HIT'],
                    handler: (event, state, sourceUnitId) => {
                        // 攻撃時: sourceが自分
                        // 被攻撃時: targetが自分
                        const isAttacker = event.type === 'ON_ATTACK' && event.sourceId === sourceUnitId;
                        const isTarget = event.type === 'ON_BEFORE_HIT' && event.targetId === sourceUnitId;

                        if (!isAttacker && !isTarget) return state;

                        const buff: IEffect = {
                            id: 'champion-stack',
                            name: '成り上がりチャンピオン',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'PERMANENT',
                            duration: 999,
                            stackCount: 1,
                            maxStacks: 5,
                            modifiers: [
                                {
                                    target: 'atk_pct',
                                    source: '成り上がりチャンピオン',
                                    type: 'add',
                                    value: 0.05
                                }
                            ],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        return addEffect(state, sourceUnitId, buff);
                    }
                }
            ],
        },
    ],
};
