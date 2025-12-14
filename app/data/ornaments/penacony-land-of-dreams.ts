import { OrnamentSet } from '../../types';

/**
 * 夢の地ピノコニー
 * 2セット: EP回復効率+5%。同属性の味方に与ダメ+10%。
 */
export const PENACONY_LAND_OF_DREAMS: OrnamentSet = {
    id: 'penacony_land_of_dreams',
    name: '夢の地ピノコニー',
    setBonuses: [
        {
            pieces: 2,
            description: '装備キャラのEP回復効率+5%。パーティ中の装備キャラと同じ属性の味方の与ダメージ+10%。',
            passiveEffects: [
                {
                    stat: 'energy_regen_rate',
                    value: 0.05,
                    target: 'self'
                },
                {
                    // 同属性の味方に与ダメ+10%
                    stat: 'all_type_dmg_boost',
                    value: 0.10,
                    target: 'all_allies',
                    condition: (stats, state, unitId) => {
                        // 装備者の属性を取得
                        const owner = state.units.find(u => u.id === unitId);
                        if (!owner) return false;

                        // この条件は各味方に対して評価される
                        // conditionのcontextでは、statsは評価対象のユニットのstats
                        // unitIdは装備者のID
                        // ここでは装備者と同じ属性かをチェック
                        return true; // 全味方に適用、属性チェックは別途
                    },
                    evaluationTiming: 'battle_start'
                }
            ],
            eventHandlers: [
                {
                    // 戦闘開始時に同属性の味方にバフ付与
                    events: ['ON_BATTLE_START'],
                    handler: (event, state, sourceUnitId) => {
                        const owner = state.units.find(u => u.id === sourceUnitId);
                        if (!owner) return state;

                        const { addEffect } = require('../../simulator/engine/effectManager');
                        let newState = state;

                        // 同属性の味方にバフ付与
                        const sameElementAllies = state.units.filter(u =>
                            !u.isEnemy &&
                            u.element === owner.element
                        );

                        for (const ally of sameElementAllies) {
                            const buff = {
                                id: `penacony-dmg-boost-${sourceUnitId}`,
                                name: '夢の地ピノコニー',
                                category: 'BUFF' as const,
                                sourceUnitId: sourceUnitId,
                                durationType: 'PERMANENT' as const,
                                duration: 999,
                                modifiers: [{
                                    target: 'all_type_dmg_boost' as const,
                                    source: '夢の地ピノコニー',
                                    type: 'add' as const,
                                    value: 0.10
                                }],
                                apply: (t: any, s: any) => s,
                                remove: (t: any, s: any) => s
                            };
                            newState = addEffect(newState, ally.id, buff);
                        }

                        return newState;
                    }
                }
            ],
        },
    ],
};
