import { ILightConeData } from '@/app/types';

export const mutualDemise: ILightConeData = {
    id: 'mutual-demise',
    name: '倶歿',
    description: '装備キャラの残りHPが80%未満の場合、会心率+12%。',
    descriptionTemplate: '装備キャラの残りHPが80%未満の場合、会心率+{0}%。',
    descriptionValues: [
        ['12'],
        ['15'],
        ['18'],
        ['21'],
        ['24']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 846,
        atk: 370,
        def: 198,
    },
    passiveEffects: [
        {
            id: 'mutual_demise_crit',
            name: '倶歿',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.12, 0.15, 0.18, 0.21, 0.24],
            condition: () => false // イベント経由で処理
        }
    ],
    eventHandlers: [
        {
            id: 'mutual_demise_check',
            name: '倶歿（会心率注入）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION' && event.sourceId === unit.id) {
                    const hpRatio = unit.hp / unit.stats.hp;
                    if (hpRatio < 0.80) {
                        const critVal = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];
                        state.damageModifiers.critRate = (state.damageModifiers.critRate || 0) + critVal;
                    }
                }
                return state;
            }
        }
    ]
};
