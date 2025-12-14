import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';

/**
 * 凱歌を揚げる英雄
 * 2セット: 攻撃力+12%
 * 4セット: 装備キャラの記憶の精霊がフィールドにいる時、装備キャラの速度+6%。
 *          装備キャラの記憶の精霊が攻撃を行う時、装備キャラおよびその記憶の精霊の会心ダメージ+30%、2ターン継続。
 */
export const HERO_WHO_RAISES_THE_BATTLE_SONG: RelicSet = {
    id: 'hero_who_raises_the_battle_song',
    name: '凱歌を揚げる英雄',
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
            description: '装備キャラの記憶の精霊がフィールドにいる時、装備キャラの速度+6%。装備キャラの記憶の精霊が攻撃を行う時、装備キャラおよびその記憶の精霊の会心ダメージ+30%、2ターン継続。',
            passiveEffects: [
                {
                    // 精霊がいる時、速度+6%
                    stat: 'spd_pct',
                    value: 0.06,
                    target: 'self',
                    condition: (stats, state, unitId) => {
                        // 精霊が存在するかチェック（linkedUnitIdで判定）
                        return state.units.some(u =>
                            u.linkedUnitId === unitId &&
                            u.isSummon === true
                        );
                    }
                }
            ],
            eventHandlers: [
                {
                    // 精霊が攻撃した時、オーナーと精霊に会心ダメージバフ
                    events: ['ON_DAMAGE_DEALT'],
                    handler: (event, state, sourceUnitId) => {
                        // 装備者の精霊かどうかをチェック
                        const attacker = state.units.find(u => u.id === event.sourceId);
                        if (!attacker) return state;

                        // 攻撃者が精霊で、オーナーがこの遺物の装備者かチェック
                        if (attacker.linkedUnitId !== sourceUnitId) return state;
                        if (!attacker.isSummon) return state;

                        let newState = state;

                        // オーナーにバフ
                        const ownerBuff: IEffect = {
                            id: 'hero-battle-song-cdmg',
                            name: '凱歌を揚げる英雄',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            skipFirstTurnDecrement: true,
                            duration: 2,
                            modifiers: [
                                {
                                    target: 'crit_dmg',
                                    source: '凱歌を揚げる英雄',
                                    type: 'add',
                                    value: 0.3
                                }
                            ],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        newState = addEffect(newState, sourceUnitId, ownerBuff);

                        // 精霊にもバフ
                        const spiritBuff: IEffect = {
                            ...ownerBuff,
                            id: 'hero-battle-song-cdmg-spirit'
                        };

                        newState = addEffect(newState, event.sourceId, spiritBuff);

                        return newState;
                    }
                }
            ],
        },
    ],
};
