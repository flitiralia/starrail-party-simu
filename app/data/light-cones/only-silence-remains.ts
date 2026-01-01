import { ILightConeData } from '@/app/types';

export const onlySilenceRemains: ILightConeData = {
    id: 'only-silence-remains',
    name: '沈黙のみ',
    description: '装備キャラの攻撃力+16%。フィールド上の敵の数が2体以下の場合、装備キャラの会心率+12%。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。フィールド上の敵の数が2体以下の場合、装備キャラの会心率+{1}%。',
    descriptionValues: [
        ['16', '12'],
        ['20', '15'],
        ['24', '18'],
        ['28', '21'],
        ['32', '24']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'only-silence-remains-atk',
            name: '沈黙のみ（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'only-silence-remains-conditional',
            name: '沈黙のみ（条件付き会心率）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                // 条件チェック: 敵の数が2体以下
                const enemies = state.registry.toArray().filter(u => u.isEnemy && u.hp > 0);
                if (enemies.length > 2) return state;

                const critRateVal = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        critRate: (state.damageModifiers.critRate || 0) + critRateVal
                    }
                };
            }
        }
    ]
};
