import { RelicSet } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

/**
 * 天地再創の救世主
 * 2セット: 会心率+8%
 * 4セット: 装備キャラが通常攻撃または戦闘スキルを発動した後、装備キャラの記憶の精霊がフィールド上にいる場合、
 *          装備キャラとその記憶の精霊の最大HP+24%、味方全体の与ダメージ+15%、装備キャラが次に通常攻撃または戦闘スキルを発動した後まで継続。
 */
export const SAVIOR_WHO_RECREATES_HEAVEN_AND_EARTH: RelicSet = {
    id: 'savior_who_recreates_heaven_and_earth',
    name: '天地再創の救世主',
    setBonuses: [
        {
            pieces: 2,
            description: '会心率+8%。',
            passiveEffects: [
                {
                    stat: 'crit_rate',
                    value: 0.08,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: '装備キャラが通常攻撃または戦闘スキルを発動した後、装備キャラの記憶の精霊がフィールド上にいる場合、装備キャラとその記憶の精霊の最大HP+24%、味方全体の与ダメージ+15%、装備キャラが次に通常攻撃または戦闘スキルを発動した後まで継続。',
            eventHandlers: [
                {
                    events: ['ON_BASIC_ATTACK', 'ON_SKILL_USED'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        // 精霊がフィールドにいるかチェック
                        const spirit = state.units.find(u =>
                            u.linkedUnitId === sourceUnitId &&
                            u.isSummon === true
                        );

                        if (!spirit) return state;

                        let newState = state;

                        // 前回のバフを削除
                        newState = removeEffect(newState, sourceUnitId, 'savior-hp-boost');
                        newState = removeEffect(newState, spirit.id, 'savior-hp-boost-spirit');
                        // 味方全体の与ダメージバフも削除
                        for (const unit of newState.units.filter(u => !u.isEnemy)) {
                            newState = removeEffect(newState, unit.id, 'savior-dmg-boost');
                        }

                        // オーナーにHP+24%
                        const ownerHpBuff: IEffect = {
                            id: 'savior-hp-boost',
                            name: '天地再創の救世主（HP上昇）',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'PERMANENT',
                            duration: 999,
                            modifiers: [
                                {
                                    target: 'hp_pct',
                                    source: '天地再創の救世主',
                                    type: 'add',
                                    value: 0.24
                                }
                            ],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        newState = addEffect(newState, sourceUnitId, ownerHpBuff);

                        // 精霊にもHP+24%
                        const spiritHpBuff: IEffect = {
                            ...ownerHpBuff,
                            id: 'savior-hp-boost-spirit'
                        };

                        newState = addEffect(newState, spirit.id, spiritHpBuff);

                        // 味方全体に与ダメージ+15%
                        const allies = newState.units.filter(u => !u.isEnemy);
                        for (const ally of allies) {
                            const dmgBuff: IEffect = {
                                id: 'savior-dmg-boost',
                                name: '天地再創の救世主（与ダメージ上昇）',
                                category: 'BUFF',
                                sourceUnitId: sourceUnitId,
                                durationType: 'PERMANENT',
                                duration: 999,
                                modifiers: [
                                    {
                                        target: 'all_type_dmg_boost',
                                        source: '天地再創の救世主',
                                        type: 'add',
                                        value: 0.15
                                    }
                                ],
                                apply: (t, s) => s,
                                remove: (t, s) => s
                            };

                            newState = addEffect(newState, ally.id, dmgBuff);
                        }

                        return newState;
                    }
                }
            ],
        },
    ],
};
