import { RelicSet } from '../../types';

import { createUnitId } from '../../simulator/engine/unitId';

/**
 * 吹雪と対峙する兵士
 * 2セット: 被ダメージ-8%
 * 4セット: ターンが回ってきた時、装備キャラの残りHPが50%以下の場合、HPを最大HP8%分回復し、EPを5回復する
 */
export const GUARD_OF_WUTHERING_SNOW: RelicSet = {
    id: 'guard_of_wuthering_snow',
    name: '吹雪と対峙する兵士',
    setBonuses: [
        {
            pieces: 2,
            description: '被ダメージ-8%。',
            passiveEffects: [
                {
                    stat: 'dmg_taken_reduction',
                    value: 0.08,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: 'ターンが回ってきた時、装備キャラの残りHPが50%以下の場合、HPを最大HP8%分回復し、EPを5回復する。',
            eventHandlers: [
                {
                    events: ['ON_TURN_START'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        const unit = state.registry.get(createUnitId(sourceUnitId));
                        if (!unit) return state;

                        // HP50%以下かチェック
                        const currentHp = unit.hp;
                        const maxHp = unit.stats.hp;
                        if (currentHp > maxHp * 0.5) return state;

                        // HP8%回復
                        const healAmount = maxHp * 0.08;
                        const newHp = Math.min(currentHp + healAmount, maxHp);

                        // EP5回復
                        const currentEp = unit.ep || 0;
                        const maxEp = unit.stats.max_ep || 120;
                        const newEp = Math.min(currentEp + 5, maxEp);

                        return {
                            ...state,
                            registry: state.registry.update(createUnitId(sourceUnitId), u => ({ ...u, hp: newHp, ep: newEp }))
                        };
                    }
                }
            ],
        },
    ],
};
