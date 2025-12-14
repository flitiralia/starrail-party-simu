import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

/**
 * 雪の密林の狩人
 * 2セット: 氷属性ダメージ+10%
 * 4セット: 装備キャラが必殺技を発動した時、会心ダメージ+25%、2ターン継続
 */
export const HUNTER_OF_GLACIAL_FOREST: RelicSet = {
    id: 'hunter_of_glacial_forest',
    name: '雪の密林の狩人',
    setBonuses: [
        {
            pieces: 2,
            description: '氷属性ダメージ+10%。',
            passiveEffects: [
                {
                    stat: 'ice_dmg_boost',
                    value: 0.1,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: '装備キャラが必殺技を発動した時、会心ダメージ+25%、2ターン継続。',
            eventHandlers: [
                {
                    events: ['ON_ULTIMATE_USED'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        const buff: IEffect = {
                            id: 'glacial-forest-cdmg',
                            name: '雪の密林の狩人',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            skipFirstTurnDecrement: true,
                            duration: 2,
                            modifiers: [
                                {
                                    target: 'crit_dmg',
                                    source: '雪の密林の狩人',
                                    type: 'add',
                                    value: 0.25
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
