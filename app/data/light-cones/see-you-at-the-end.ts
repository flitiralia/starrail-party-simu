import { ILightConeData } from '@/app/types';

export const seeYouAtTheEnd: ILightConeData = {
    id: 'see-you-at-the-end',
    name: '終点でまた会おう',
    description: '装備キャラの会心ダメージ+24%。装備キャラの戦闘スキルダメージと追加攻撃ダメージ+24%。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。装備キャラの戦闘スキルダメージと追加攻撃ダメージ+{0}%。',
    descriptionValues: [
        ['24'],
        ['30'],
        ['36'],
        ['42'],
        ['48']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 952,
        atk: 529,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'see-you-crit-dmg',
            name: '終点でまた会おう（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.24, 0.30, 0.36, 0.42, 0.48]
        },
        {
            id: 'see-you-skill-dmg',
            name: '終点でまた会おう（スキル与ダメ）',
            category: 'BUFF',
            targetStat: 'skill_dmg_boost',
            effectValue: [0.24, 0.30, 0.36, 0.42, 0.48]
        },
        {
            id: 'see-you-fua-dmg',
            name: '終点でまた会おう（追加攻撃与ダメ）',
            category: 'BUFF',
            targetStat: 'fua_dmg_boost',
            effectValue: [0.24, 0.30, 0.36, 0.42, 0.48]
        }
    ],
    eventHandlers: []
};
