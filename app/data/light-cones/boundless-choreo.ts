import { ILightConeData } from '@/app/types';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const boundlessChoreo: ILightConeData = {
    id: 'boundless-choreo',
    name: '終わりなき舞踏',
    description: '装備キャラの会心率+8%。防御力ダウン状態または減速状態の敵に対する、装備キャラの会心ダメージ+24%。',
    descriptionTemplate: '装備キャラの会心率+{0}%。防御力ダウン状態または減速状態の敵に対する、装備キャラの会心ダメージ+{1}%。',
    descriptionValues: [
        ['8', '24'],
        ['10', '30'],
        ['12', '36'],
        ['14', '42'],
        ['16', '48']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'boundless-choreo-cr',
            name: '探り合い（会心率）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.08, 0.10, 0.12, 0.14, 0.16]
        }
    ],
    eventHandlers: [
        {
            id: 'boundless-choreo-cd-cond',
            name: '探り合い（条件付会心ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (!dmgEvent.targetId) return state;

                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                const hasDefDown = target.effects.some(e =>
                    e.modifiers?.some(m => (m.target === 'def_pct' && m.value < 0) || (m.target === 'def_reduction' && m.value > 0)) ||
                    e.name.includes('防御力ダウン') // フォールバックチェック
                );

                const hasSlow = target.effects.some(e =>
                    e.modifiers?.some(m => (m.target === 'spd_pct' && m.value < 0) || (m.target === 'spd' && m.value < 0)) ||
                    e.name.includes('減速') || e.name.includes('Slow')
                );

                if (hasDefDown || hasSlow) {
                    const cdBuff = [0.24, 0.30, 0.36, 0.42, 0.48][superimposition - 1];
                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            critDmg: (state.damageModifiers.critDmg || 0) + cdBuff
                        }
                    };
                }

                return state;
            }
        }
    ]
};
