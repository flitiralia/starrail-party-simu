import { RelicSet } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

/**
 * 溶岩で鍛造する火匠
 * 2セット: 炎属性ダメージ+10%
 * 4セット: 装備キャラの戦闘スキルの与ダメージ+12%。必殺技を発動した後、次の攻撃の炎属性与ダメージ+12%
 */
export const FIRESMITH_OF_LAVA_FORGING: RelicSet = {
    id: 'firesmith_of_lava_forging',
    name: '溶岩で鍛造する火匠',
    setBonuses: [
        {
            pieces: 2,
            description: '炎属性ダメージ+10%。',
            passiveEffects: [
                {
                    stat: 'fire_dmg_boost',
                    value: 0.1,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: '装備キャラの戦闘スキルの与ダメージ+12%。必殺技を発動した後、次の攻撃の炎属性与ダメージ+12%。',
            passiveEffects: [
                {
                    stat: 'skill_dmg_boost',
                    value: 0.12,
                    target: 'self'
                }
            ],
            eventHandlers: [
                {
                    // 必殺技発動後にバフ付与
                    events: ['ON_ULTIMATE_USED'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        const buff: IEffect = {
                            id: 'firesmith-fire-boost',
                            name: '溶岩で鍛造する火匠（炎ブースト）',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            skipFirstTurnDecrement: true,
                            duration: 1, // 次の攻撃で消費
                            modifiers: [
                                {
                                    target: 'fire_dmg_boost',
                                    source: '溶岩で鍛造する火匠',
                                    type: 'add',
                                    value: 0.12
                                }
                            ],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        return addEffect(state, sourceUnitId, buff);
                    }
                },
                {
                    // 攻撃後にバフ消費（必殺技以外）
                    events: ['ON_ATTACK'], // 攻撃を行った後
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        // 必殺技自体ではバフは消費しない（次の攻撃で消費）
                        if (event.subType === 'ULTIMATE') return state;

                        return removeEffect(state, sourceUnitId, 'firesmith-fire-boost');
                    }
                }
            ],
        },
    ],
};
