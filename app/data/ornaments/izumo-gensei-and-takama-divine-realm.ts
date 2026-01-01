import { OrnamentSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

/**
 * 荒涼の惑星ツガンニヤ
 * 2セット: 会心率+4%。敵撃破時に会心ダメージ+4%(最大10層)。
 */
export const IZUMO_GENSEI_AND_TAKAMA_DIVINE_REALM: OrnamentSet = {
    id: 'izumo-gensei-and-takama-divine-realm',
    name: '荒涼の惑星ツガンニヤ',
    setBonuses: [
        {
            pieces: 2,
            description: '装備キャラの会心率+4%。敵が倒された時、装備キャラの会心ダメージ+4%、最大で10層累積できる。',
            passiveEffects: [
                {
                    stat: 'crit_rate',
                    value: 0.04,
                    target: 'self'
                }
            ],
            eventHandlers: [
                {
                    events: ['ON_ENEMY_DEFEATED'],
                    handler: (event, state, sourceUnitId) => {
                        const stackBuff: IEffect = {
                            id: 'izumo-cdmg-stack',
                            name: '荒涼の惑星ツガンニヤ',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'PERMANENT',
                            duration: 999,
                            stackCount: 1,
                            maxStacks: 10,
                            modifiers: [{
                                target: 'crit_dmg',
                                source: '荒涼の惑星ツガンニヤ',
                                type: 'add',
                                value: 0.04
                            }],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        return addEffect(state, sourceUnitId, stackBuff);
                    }
                }
            ],
        },
    ],
};
