import { OrnamentSet } from '../../types';
import { addAura } from '../../simulator/engine/auraManager';
import { IAura } from '../../simulator/engine/types';

/**
 * 永遠の地オンパロス
 * 2セット: 会心率+8%。精霊在場で味方全体速度+8%。
 */
export const OMPHALOS_ETERNAL_GROUNDS: OrnamentSet = {
    id: 'omphalos_eternal_grounds',
    name: '永遠の地オンパロス',
    setBonuses: [
        {
            pieces: 2,
            description: '装備キャラの会心率+8%。装備キャラの記憶の精霊がフィールド上にいる時、味方全体の速度+8%。この効果は累積できない。',
            passiveEffects: [
                {
                    stat: 'crit_rate',
                    value: 0.08,
                    target: 'self'
                }
            ],
            eventHandlers: [
                {
                    events: ['ON_BATTLE_START', 'ON_TURN_START'],
                    handler: (event, state, sourceUnitId) => {
                        const unit = state.units.find(u => u.id === sourceUnitId);
                        if (!unit) return state;

                        // 既存のオーラを確認
                        const hasAura = state.auras?.some(a => a.id === `omphalos-spd-aura-${sourceUnitId}`);

                        // 精霊がフィールド上にいるかチェック
                        const hasSpirit = state.units.some(u =>
                            u.linkedUnitId === sourceUnitId &&
                            u.isSummon === true &&
                            u.hp > 0
                        );

                        if (hasSpirit && !hasAura) {
                            // オーラを追加
                            const aura: IAura = {
                                id: `omphalos-spd-aura-${sourceUnitId}`,
                                name: '永遠の地オンパロス',
                                sourceUnitId: sourceUnitId,
                                target: 'all_allies',
                                modifiers: [{
                                    target: 'spd_pct',
                                    value: 0.08,
                                    type: 'add',
                                    source: '永遠の地オンパロス'
                                }]
                            };
                            return addAura(state, aura);
                        }

                        if (!hasSpirit && hasAura) {
                            // オーラを削除
                            const { removeAura } = require('../../simulator/engine/auraManager');
                            return removeAura(state, `omphalos-spd-aura-${sourceUnitId}`);
                        }

                        return state;
                    }
                }
            ],
        },
    ],
};
