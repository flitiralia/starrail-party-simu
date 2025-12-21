import { OrnamentSet } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';

/**
 * 天体階差機関
 * 2セット: 会心ダメージ+16%。会心ダメ120%以上で戦闘開始時会心率+60%、初回攻撃終了まで。
 */
export const CELESTIAL_DIFFERENTIATOR: OrnamentSet = {
    id: 'celestial_differentiator',
    name: '天体階差機関',
    setBonuses: [
        {
            pieces: 2,
            description: '装備キャラの会心ダメージ+16%。装備キャラの会心ダメージが120%以上の場合、戦闘に入った後、装備キャラの会心率+60%、初回の攻撃が終了するまで継続。',
            passiveEffects: [
                {
                    stat: 'crit_dmg',
                    value: 0.16,
                    target: 'self'
                }
            ],
            eventHandlers: [
                {
                    events: ['ON_BATTLE_START'],
                    handler: (event, state, sourceUnitId) => {
                        const unit = state.registry.get(createUnitId(sourceUnitId));
                        if (!unit) return state;

                        // 会心ダメージ120%以上かチェック
                        if ((unit.stats.crit_dmg || 0) < 1.20) return state;

                        const buff: IEffect = {
                            id: 'celestial-crit-boost',
                            name: '天体階差機関（会心率）',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'PERMANENT',
                            duration: 999,
                            modifiers: [{
                                target: 'crit_rate',
                                source: '天体階差機関',
                                type: 'add',
                                value: 0.60
                            }],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        return addEffect(state, sourceUnitId, buff);
                    }
                },
                {
                    // 初回攻撃後にバフ削除
                    events: ['ON_ATTACK'], // 攻撃を行った後
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        const unit = state.registry.get(createUnitId(sourceUnitId));
                        if (!unit) return state;

                        // バフが存在する場合のみ削除
                        const hasBuff = unit.effects.some(e => e.id === 'celestial-crit-boost');
                        if (!hasBuff) return state;

                        return removeEffect(state, sourceUnitId, 'celestial-crit-boost');
                    }
                }
            ],
        },
    ],
};
