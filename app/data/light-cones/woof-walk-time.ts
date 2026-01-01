import { ILightConeData, UnitId } from '@/app/types';

export const woofWalkTime: ILightConeData = {
    id: 'woof-walk-time',
    name: 'ワン！散歩の時間！',
    description: '装備キャラの攻撃力+10%、燃焼状態または裂創状態の敵に対する与ダメージ+16%、この効果は持続ダメージにも有効。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%、燃焼状態または裂創状態の敵に対する与ダメージ+{1}%、この効果は持続ダメージにも有効。',
    descriptionValues: [
        ['10', '16'],
        ['12.5', '20'],
        ['15', '24'],
        ['17.5', '28'],
        ['20', '32']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'woof-walk-time-atk',
            name: 'ワン！散歩の時間！（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.10, 0.125, 0.15, 0.175, 0.20]
        }
    ],
    eventHandlers: [
        {
            id: 'woof-walk-time-dmg',
            name: 'ワン！散歩の時間！（条件付き与ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event) || !event.targetId) return state;

                const target = state.registry.get(event.targetId as unknown as UnitId);
                if (!target) return state;

                const hasBurnOrBleed = target.effects.some(e => {
                    const nameLower = e.name.toLowerCase();
                    return nameLower.includes('burn') || nameLower.includes('bleed') ||
                        nameLower.includes('燃焼') || nameLower.includes('裂創');
                });

                if (hasBurnOrBleed) {
                    const dmgVal = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];
                    state.damageModifiers.allTypeDmg = (state.damageModifiers.allTypeDmg || 0) + dmgVal;
                }

                return state;
            }
        }
    ]
};
