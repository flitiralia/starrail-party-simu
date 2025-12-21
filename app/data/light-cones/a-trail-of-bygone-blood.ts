import { ILightConeData } from '@/app/types';

export const aTrailOfBygoneBlood: ILightConeData = {
    id: 'a-trail-of-bygone-blood',
    name: '古より受け継がれる血',
    description: '装備キャラの会心率+12%。装備キャラの戦闘スキルダメージと必殺技ダメージ+24%。',
    descriptionTemplate: '装備キャラの会心率+{0}%。装備キャラの戦闘スキルダメージと必殺技ダメージ+{1}%。',
    descriptionValues: [
        ['12', '24'],
        ['15', '30'],
        ['18', '36'],
        ['21', '42'],
        ['24', '48']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1058,
        atk: 529,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'bygone_blood_crit',
            name: '古より受け継がれる血（会心率）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.12, 0.15, 0.18, 0.21, 0.24]
        },
        {
            id: 'bygone_blood_skill_dmg',
            name: '古より受け継がれる血（スキルダメ）',
            category: 'BUFF',
            targetStat: 'skill_dmg_boost',
            effectValue: [0.24, 0.30, 0.36, 0.42, 0.48]
        },
        {
            id: 'bygone_blood_ult_dmg',
            name: '古より受け継がれる血（必殺技ダメ）',
            category: 'BUFF',
            targetStat: 'ult_dmg_boost',
            effectValue: [0.24, 0.30, 0.36, 0.42, 0.48]
        }
    ]
};
