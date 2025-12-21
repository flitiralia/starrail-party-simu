import { ILightConeData } from '../../types';

export const landausChoice: ILightConeData = {
    id: 'landaus-choice',
    name: 'ランドゥーの選択',
    description: '装備キャラが攻撃を受ける確率がアップする。受けるダメージ-16%。',
    descriptionTemplate: '装備キャラが攻撃を受ける確率がアップする。受けるダメージ-{0}%。',
    descriptionValues: [
        ['16'],
        ['18'],
        ['20'],
        ['22'],
        ['24']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },

    passiveEffects: [
        {
            id: 'landau-aggro',
            name: '時間（ヘイトアップ）',
            category: 'BUFF',
            targetStat: 'aggro',
            effectValue: [2.0, 2.0, 2.0, 2.0, 2.0] // プレースホルダー標準値
        },
        {
            id: 'landau-dmg-reduction',
            name: '時間（被ダメ軽減）',
            category: 'BUFF',
            targetStat: 'dmg_taken_reduction',
            effectValue: [0.16, 0.18, 0.20, 0.22, 0.24]
        }
    ]
};
