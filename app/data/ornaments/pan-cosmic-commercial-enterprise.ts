import { OrnamentSet } from '../../types';
import { Unit, GameState } from '../../simulator/engine/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

/**
 * 汎銀河商事会社
 * 2セット: 効果命中+10%。攻撃力が現在の効果命中25%分アップ、最大+25%。
 */
export const PAN_COSMIC_COMMERCIAL_ENTERPRISE: OrnamentSet = {
    id: 'pan-cosmic-commercial-enterprise',
    name: '汎銀河商事会社',
    setBonuses: [
        {
            pieces: 2,
            description: '装備キャラの効果命中+10%。装備キャラの攻撃力が、現在の効果命中25%分アップ、最大で+25%。',
            passiveEffects: [
                {
                    stat: 'effect_hit_rate',
                    value: 0.10,
                    target: 'self'
                }
            ],
            eventHandlers: [
                {
                    // 効果命中に応じた攻撃力バフをON_TURN_STARTで更新
                    events: ['ON_BATTLE_START', 'ON_TURN_START'],
                    handler: (event, state, sourceUnitId) => {
                        const unit = state.registry.get(createUnitId(sourceUnitId));
                        if (!unit) return state;

                        // 効果命中25%分の攻撃力アップ（最大25%）
                        const effectHitRate = unit.stats.effect_hit_rate || 0;
                        const atkBonus = Math.min(effectHitRate * 0.25, 0.25);

                        // 既存のバフを更新
                        const existingEffect = unit.effects.find(e => e.id === 'pan-cosmic-atk');
                        const currentValue = existingEffect?.modifiers?.[0]?.value || 0;

                        // 値が変わらない場合はスキップ
                        if (Math.abs(currentValue - atkBonus) < 0.001) return state;

                        let newState = removeEffect(state, sourceUnitId, 'pan-cosmic-atk');

                        if (atkBonus > 0) {
                            const buff = {
                                id: 'pan-cosmic-atk',
                                name: '汎銀河商事会社',
                                category: 'BUFF' as const,
                                sourceUnitId: sourceUnitId,
                                durationType: 'PERMANENT' as const,
                                duration: 999,
                                modifiers: [{
                                    target: 'atk_pct' as const,
                                    source: '汎銀河商事会社',
                                    type: 'add' as const,
                                    value: atkBonus
                                }],
                                apply: (t: Unit, s: GameState) => s,
                                remove: (t: Unit, s: GameState) => s
                            };
                            newState = addEffect(newState, sourceUnitId, buff);
                        }

                        return newState;
                    }
                }
            ],
        },
    ],
};
