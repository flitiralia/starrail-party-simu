import { OrnamentSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';

/**
 * 奔狼の都藍王朝
 * 2セット: 味方追加攻撃時「勲功」獲得(最大5層)、1層につき追加攻撃ダメ+5%、5層で会心ダメ+25%。
 */
export const DURAN_DYNASTY_OF_RUNNING_WOLVES: OrnamentSet = {
    id: 'duran_dynasty_of_running_wolves',
    name: '奔狼の都藍王朝',
    setBonuses: [
        {
            pieces: 2,
            description: '味方が追加攻撃を行う時、装備キャラは「勲功」を1層獲得する、最大で5層累積できる。「勲功」1層につき、装備キャラの追加攻撃ダメージ+5%。「勲功」が5層に達する時、さらに装備キャラの会心ダメージ+25%。',
            eventHandlers: [
                {
                    events: ['ON_FOLLOW_UP_ATTACK'],
                    handler: (event, state, sourceUnitId) => {
                        // 味方の追加攻撃であればスタック獲得
                        const attacker = state.registry.get(createUnitId(event.sourceId));
                        if (!attacker || attacker.isEnemy) return state;

                        const unit = state.registry.get(createUnitId(sourceUnitId));
                        if (!unit) return state;

                        // 現在のスタック数を確認
                        const existingEffect = unit.effects.find(e => e.id === 'duran-merit-stack');
                        const currentStacks = existingEffect?.stackCount || 0;

                        if (currentStacks >= 5) return state;

                        const stackBuff: IEffect = {
                            id: 'duran-merit-stack',
                            name: '勲功（奔狼の都藍王朝）',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'PERMANENT',
                            duration: 999,
                            stackCount: 1,
                            maxStacks: 5,
                            modifiers: [{
                                target: 'fua_dmg_boost',
                                source: '奔狼の都藍王朝',
                                type: 'add',
                                value: 0.05
                            }],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        let newState = addEffect(state, sourceUnitId, stackBuff);

                        // 5層に達したら会心ダメージ+25%
                        const updatedUnit = newState.registry.get(createUnitId(sourceUnitId));
                        const updatedStacks = updatedUnit?.effects.find(e => e.id === 'duran-merit-stack')?.stackCount || 0;

                        if (updatedStacks === 5 && currentStacks < 5) {
                            const cdmgBuff: IEffect = {
                                id: 'duran-cdmg-bonus',
                                name: '奔狼の都藍王朝（会心ダメージ）',
                                category: 'BUFF',
                                sourceUnitId: sourceUnitId,
                                durationType: 'PERMANENT',
                                duration: 999,
                                modifiers: [{
                                    target: 'crit_dmg',
                                    source: '奔狼の都藍王朝',
                                    type: 'add',
                                    value: 0.25
                                }],
                                apply: (t, s) => s,
                                remove: (t, s) => s
                            };
                            newState = addEffect(newState, sourceUnitId, cdmgBuff);
                        }

                        return newState;
                    }
                }
            ],
        },
    ],
};
