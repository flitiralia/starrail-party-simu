import { ILightConeData } from '@/app/types';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const loop: ILightConeData = {
    id: 'loop',
    name: '淵環',
    description: '減速状態の敵に対する、装備キャラの与ダメージ+24%。',
    descriptionTemplate: '減速状態の敵に対する、装備キャラの与ダメージ+{0}%。',
    descriptionValues: [
        ['24'],
        ['30'],
        ['36'],
        ['42'],
        ['48']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 846,
        atk: 317,
        def: 264,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'loop-dmg-cond',
            name: '窮追（与ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (!dmgEvent.targetId) return state;

                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                const hasSlow = target.effects.some(e => e.name.includes('減速') || e.name.includes('Slow') ||
                    e.modifiers?.some(m => (m.target === 'spd_pct' || m.target === 'spd') && m.value < 0)
                );

                if (hasSlow) {
                    const boost = [0.24, 0.30, 0.36, 0.42, 0.48][superimposition - 1];
                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + boost
                        }
                    };
                }
                return state;
            }
        }
    ]
};
