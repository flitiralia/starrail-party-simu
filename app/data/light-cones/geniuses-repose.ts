import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const geniusesRepose: ILightConeData = {
    id: 'geniuses-repose',
    name: '天才たちの休息',
    description: '装備キャラの攻撃力+16%。装備キャラが敵を倒した後、会心ダメージ+24%、3ターン継続。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。装備キャラが敵を倒した後、会心ダメージ+{1}%、3ターン継続。',
    descriptionValues: [
        ['16', '24'],
        ['20', '30'],
        ['24', '36'],
        ['28', '42'],
        ['32', '48']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 846,
        atk: 476,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'geniuses-repose-atk',
            name: '天才たちの休息（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'geniuses-repose-kill-buff',
            name: '天才たちの休息（撃破時会心ダメ）',
            events: ['ON_ENEMY_DEFEATED'], // キル時にトリガー
            handler: (event, state, unit, superimposition) => {
                // キラーが装備者かチェック
                // ON_ENEMY_DEFEATED sourceId はキラー、targetId は倒されたユニット。
                if (event.sourceId !== unit.id) return state;

                const cdBuff = [0.24, 0.30, 0.36, 0.42, 0.48][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `geniuses_repose_cd_${unit.id}`,
                    name: '天才たちの休息（会心ダメージ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 3,
                    stackCount: 1,
                    modifiers: [
                        { target: 'crit_dmg', value: cdBuff, type: 'add', source: '天才たちの休息' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
