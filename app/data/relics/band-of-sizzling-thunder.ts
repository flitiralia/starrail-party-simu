import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

/**
 * 雷鳴轟くバンド
 * 2セット: 雷属性ダメージ+10%
 * 4セット: 装備キャラが戦闘スキルを発動した時、装備キャラの攻撃力+20%、1ターン継続
 */
export const BAND_OF_SIZZLING_THUNDER: RelicSet = {
    id: 'band-of-sizzling-thunder',
    name: '雷鳴轟くバンド',
    setBonuses: [
        {
            pieces: 2,
            description: '雷属性ダメージ+10%。',
            passiveEffects: [
                {
                    stat: 'lightning_dmg_boost',
                    value: 0.1,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: '装備キャラが戦闘スキルを発動した時、装備キャラの攻撃力+20%、1ターン継続。',
            eventHandlers: [
                {
                    events: ['ON_SKILL_USED'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        const buff: IEffect = {
                            id: 'sizzling-thunder-atk',
                            name: '雷鳴轟くバンド',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            skipFirstTurnDecrement: true,
                            duration: 1,
                            modifiers: [
                                {
                                    target: 'atk_pct',
                                    source: '雷鳴轟くバンド',
                                    type: 'add',
                                    value: 0.2
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
