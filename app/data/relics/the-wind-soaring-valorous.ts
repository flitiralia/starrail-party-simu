import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

/**
 * 風雲を薙ぎ払う勇烈
 * 2セット: 攻撃力+12%
 * 4セット: 装備キャラの会心率+6%。装備キャラが追加攻撃を行う時、必殺技によるダメージ+36%、1ターン継続
 */
export const THE_WIND_SOARING_VALOROUS: RelicSet = {
    id: 'the-wind-soaring-valorous',
    name: '風雲を薙ぎ払う勇烈',
    setBonuses: [
        {
            pieces: 2,
            description: '攻撃力+12%。',
            passiveEffects: [
                {
                    stat: 'atk_pct',
                    value: 0.12,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: '装備キャラの会心率+6%。装備キャラが追加攻撃を行う時、必殺技によるダメージ+36%、1ターン継続。',
            passiveEffects: [
                {
                    stat: 'crit_rate',
                    value: 0.06,
                    target: 'self'
                }
            ],
            eventHandlers: [
                {
                    events: ['ON_FOLLOW_UP_ATTACK'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        const buff: IEffect = {
                            id: 'valorous-ult-boost',
                            name: '風雲を薙ぎ払う勇烈',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            skipFirstTurnDecrement: true,
                            duration: 1,
                            modifiers: [
                                {
                                    target: 'ult_dmg_boost',
                                    source: '風雲を薙ぎ払う勇烈',
                                    type: 'add',
                                    value: 0.36
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
