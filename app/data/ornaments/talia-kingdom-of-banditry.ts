import { OrnamentSet } from '../../types';

/**
 * 盗賊公国タリア
 * 2セット: 撃破特効+16%。速度145以上で撃破特効+20%追加。
 */
export const TALIA_KINGDOM_OF_BANDITRY: OrnamentSet = {
    id: 'talia-kingdom-of-banditry',
    name: '盗賊公国タリア',
    setBonuses: [
        {
            pieces: 2,
            description: '装備キャラの撃破特効+16%。装備キャラの速度が145以上の場合、さらに装備キャラの撃破特効+20%。',
            passiveEffects: [
                {
                    stat: 'break_effect',
                    value: 0.16,
                    target: 'self'
                },
                {
                    stat: 'break_effect',
                    value: 0.20,
                    target: 'self',
                    condition: (stats) => stats.spd >= 145,
                    evaluationTiming: 'dynamic'
                }
            ],
        },
    ],
};
