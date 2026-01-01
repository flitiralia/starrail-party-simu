import { OrnamentSet } from '../../types';

/**
 * 建創者のベロブルグ
 * 2セット: DEF+15%。効果命中50%以上でDEF+15%追加。
 */
export const BELOBOG_OF_THE_ARCHITECTS: OrnamentSet = {
    id: 'belobog-of-the-architects',
    name: '建創者のベロブルグ',
    setBonuses: [
        {
            pieces: 2,
            description: '装備キャラの防御力+15%。装備キャラの効果命中が50%以上の場合、さらに防御力+15%。',
            passiveEffects: [
                {
                    stat: 'def_pct',
                    value: 0.15,
                    target: 'self'
                },
                {
                    stat: 'def_pct',
                    value: 0.15,
                    target: 'self',
                    condition: (stats) => (stats.effect_hit_rate ?? 0) >= 0.50,
                    evaluationTiming: 'dynamic'
                }
            ],
        },
    ],
};
