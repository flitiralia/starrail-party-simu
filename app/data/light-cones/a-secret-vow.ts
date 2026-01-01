import { ILightConeData, createUnitId } from '@/app/types';

export const aSecretVow: ILightConeData = {
    id: 'a-secret-vow',
    name: '秘密の誓い',
    description: '装備キャラの与ダメージ+20%、残りHP割合が装備キャラを超える敵に対し、さらに与ダメージ+20%。',
    descriptionTemplate: '装備キャラの与ダメージ+{0}%、残りHP割合が装備キャラを超える敵に対し、さらに与ダメージ+{1}%。',
    descriptionValues: [
        ['20', '20'],
        ['25', '25'],
        ['30', '30'],
        ['35', '35'],
        ['40', '40']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1058,
        atk: 476,
        def: 264,
    },
    passiveEffects: [
        {
            id: 'a-secret-vow-dmg',
            name: '秘密の誓い（常時）',
            category: 'BUFF',
            targetStat: 'all_type_dmg_boost',
            effectValue: [0.20, 0.25, 0.30, 0.35, 0.40]
        }
    ],
    eventHandlers: [
        {
            id: 'a-secret-vow-conditional',
            name: '秘密の誓い（条件付き）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event) || !event.targetId) return state;

                const target = state.registry.get(createUnitId(event.targetId));
                if (!target) return state;

                const unitHpRatio = unit.hp / unit.stats.hp; // 現在値 / 最大値
                const targetHpRatio = target.hp / target.stats.hp;

                if (targetHpRatio > unitHpRatio) {
                    const extraDmg = [0.20, 0.25, 0.30, 0.35, 0.40][superimposition - 1];
                    state.damageModifiers.allTypeDmg = (state.damageModifiers.allTypeDmg || 0) + extraDmg;
                }

                return state;
            }
        }
    ]
};
