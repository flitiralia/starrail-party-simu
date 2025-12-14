import { OrnamentSet } from '../../types';

export const SPACE_SEALING_STATION: OrnamentSet = {
    id: 'space_sealing_station',
    name: '宇宙封印ステーション',
    setBonuses: [
        {
            pieces: 2,
            description: '装備キャラの攻撃力+12%。装備キャラの速度が120以上の時、さらに攻撃力+12%。',
            passiveEffects: [
                {
                    stat: 'atk_pct',
                    value: 0.12,
                    target: 'self'
                },
                {
                    stat: 'atk_pct',
                    value: 0.12,
                    target: 'self',
                    condition: (stats) => stats.spd >= 120,
                    evaluationTiming: 'dynamic'
                }
            ],
        },
    ],
};
