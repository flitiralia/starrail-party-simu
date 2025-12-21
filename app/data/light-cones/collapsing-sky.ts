import { ILightConeData } from '@/app/types';

export const collapsingSky: ILightConeData = {
    id: 'collapsing-sky',
    name: '天傾',
    description: '装備キャラの通常攻撃と戦闘スキルの与ダメージ+20%。',
    descriptionTemplate: '装備キャラの通常攻撃と戦闘スキルの与ダメージ+{0}%。',
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
    passiveEffects: [
        {
            id: 'collapsing_sky_basic_skill',
            name: '天傾',
            category: 'BUFF',
            targetStat: 'basic_atk_dmg_boost',
            // 複数のターゲットが必要：通常攻撃とスキル。
            // passiveEffectsインターフェースのtargetStatは単一キー。
            // 2つのエントリが必要。
            effectValue: [0.20, 0.25, 0.30, 0.35, 0.40]
        },
        {
            id: 'collapsing_sky_skill',
            name: '天傾（スキル）',
            category: 'BUFF',
            targetStat: 'skill_dmg_boost',
            effectValue: [0.20, 0.25, 0.30, 0.35, 0.40]
        }
    ]
};
