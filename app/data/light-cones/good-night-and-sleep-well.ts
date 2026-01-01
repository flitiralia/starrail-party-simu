import { ILightConeData } from '@/app/types';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const goodNightAndSleepWell: ILightConeData = {
    id: 'good-night-and-sleep-well',
    name: 'おやすみなさいと寝顔',
    description: '敵にデバフが1つあるごとに、その敵に対する装備キャラの与ダメージ+12%、最大で3層累積できる。この効果は持続ダメージにも有効。',
    descriptionTemplate: '敵にデバフが1つあるごとに、その敵に対する装備キャラの与ダメージ+{0}%、最大で3層累積できる。',
    descriptionValues: [
        ['12'],
        ['15'],
        ['18'],
        ['21'],
        ['24']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'gnsw-dmg-calc',
            name: '奔走者（与ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (!dmgEvent.targetId) return state;

                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                const debuffs = target.effects.filter(e => e.category === 'DEBUFF').length;
                if (debuffs > 0) {
                    const stacks = Math.min(debuffs, 3);
                    const perStack = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];
                    const bonus = perStack * stacks;

                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + bonus
                        }
                    };
                }
                return state;
            }
        }
    ]
};
