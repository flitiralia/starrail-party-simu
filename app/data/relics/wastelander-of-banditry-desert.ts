import { RelicSet } from '../../types';
import { createUnitId } from '../../simulator/engine/unitId';

/**
 * 荒地で盗みを働く廃土客
 * 2セット: 虚数属性ダメージ+10%
 * 4セット: デバフ状態の敵にダメージを与えた時、装備キャラの会心率+10%。禁錮状態の敵にダメージを与えた時、会心ダメージ+20%
 */
export const WASTELANDER_OF_BANDITRY_DESERT: RelicSet = {
    id: 'wastelander_of_banditry_desert',
    name: '荒地で盗みを働く廃土客',
    setBonuses: [
        {
            pieces: 2,
            description: '虚数属性ダメージ+10%。',
            passiveEffects: [
                {
                    stat: 'imaginary_dmg_boost',
                    value: 0.1,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: 'デバフ状態の敵にダメージを与えた時、装備キャラの会心率+10%。禁錮状態の敵にダメージを与えた時、会心ダメージ+20%。',
            eventHandlers: [
                {
                    events: ['ON_BEFORE_DAMAGE_CALCULATION'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;
                        if (!event.targetId) return state;

                        const target = state.registry.get(createUnitId(event.targetId));
                        if (!target) return state;

                        let critRateBonus = 0;
                        let critDmgBonus = 0;

                        // デバフがある敵には会心率+10%
                        const hasDebuff = target.effects.some(e => e.category === 'DEBUFF');
                        if (hasDebuff) {
                            critRateBonus = 0.1;
                        }

                        // 禁錮状態の敵には会心ダメージ+20%
                        const hasImprisonment = target.effects.some(e =>
                            e.name.includes('禁錮') ||
                            e.name.includes('Imprisonment') ||
                            (e as any).statusType === 'Imprisonment'
                        );
                        if (hasImprisonment) {
                            critDmgBonus = 0.2;
                        }

                        if (critRateBonus === 0 && critDmgBonus === 0) return state;

                        return {
                            ...state,
                            damageModifiers: {
                                ...state.damageModifiers,
                                critRate: (state.damageModifiers.critRate || 0) + critRateBonus,
                                critDmg: (state.damageModifiers.critDmg || 0) + critDmgBonus
                            }
                        };
                    }
                }
            ],
        },
    ],
};
