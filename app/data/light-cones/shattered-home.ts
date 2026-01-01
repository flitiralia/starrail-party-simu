import { ILightConeData, createUnitId } from '@/app/types';

export const shatteredHome: ILightConeData = {
    id: 'shattered-home',
    name: '楽壊',
    description: '残りHPが50%を超える敵に対する、装備キャラの与ダメージ+20%。',
    descriptionTemplate: '残りHPが50%を超える敵に対する、装備キャラの与ダメージ+{0}%。',
    descriptionValues: [
        ['20'],
        ['25'],
        ['30'],
        ['35'],
        ['40']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 846,
        atk: 370,
        def: 198,
    },
    eventHandlers: [
        {
            id: 'shattered-home-dmg',
            name: '楽壊（条件付き与ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event) || !event.targetId) return state;

                const target = state.registry.get(createUnitId(event.targetId));
                if (!target) return state;

                const hpRatio = target.hp / target.stats.hp;

                if (hpRatio > 0.50) {
                    const extraDmg = [0.20, 0.25, 0.30, 0.35, 0.40][superimposition - 1];
                    state.damageModifiers.allTypeDmg = (state.damageModifiers.allTypeDmg || 0) + extraDmg;
                }

                return state;
            }
        }
    ]
};
