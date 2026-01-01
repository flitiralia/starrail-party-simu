import { ILightConeData } from '@/app/types';

export const dataBank: ILightConeData = {
    id: 'data-bank',
    name: 'アーカイブ',
    description: '装備キャラの必殺技の与ダメージ+28%。',
    descriptionTemplate: '装備キャラの必殺技の与ダメージ+{0}%。',
    descriptionValues: [
        ['28'],
        ['35'],
        ['42'],
        ['49'],
        ['56']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 740,
        atk: 370,
        def: 264,
    },
    passiveEffects: [
        {
            id: 'data-bank-ult-dmg',
            name: 'アーカイブ（必殺技与ダメ）',
            category: 'BUFF',
            targetStat: 'ult_dmg_boost',
            effectValue: [0.28, 0.35, 0.42, 0.49, 0.56]
        }
    ],
    eventHandlers: []
};
