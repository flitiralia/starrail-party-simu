import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const A_DREAM_SCENTED_IN_WHEAT: ILightConeData = {
    id: 'a-dream-scented-in-wheat',
    name: '麦の香り漂う夢',
    description: '装備キャラの会心率+12%。装備キャラの必殺技ダメージと追加攻撃ダメージ+24%。',
    descriptionTemplate: '装備キャラの会心率+{0}%。装備キャラの必殺技ダメージと追加攻撃ダメージ+{1}%。',
    descriptionValues: [
        ['12', '24'],
        ['14', '28'],
        ['16', '32'],
        ['18', '36'],
        ['20', '40']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 952,
        atk: 529,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'dream-scented-barley-crit',
            name: '麦の香り漂う夢（会心率）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.12, 0.14, 0.16, 0.18, 0.20]
        },
        {
            id: 'dream-scented-barley-dmg',
            name: '麦の香り漂う夢（与ダメ）',
            category: 'BUFF',
            targetStat: 'ult_dmg_boost', // primary
            effectValue: [0.24, 0.28, 0.32, 0.36, 0.40]
        }
    ],
    eventHandlers: [
        {
            id: 'dream-scented-barley-buffs',
            name: '麦の香り漂う夢（常時バフ）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const dmgBuff = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];
                return addEffect(state, unit.id, {
                    id: `dream_scented_barley_buff_${unit.id}`,
                    name: '憧れ（与ダメ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    modifiers: [
                        { target: 'ult_dmg_boost', value: dmgBuff, type: 'add', source: '麦の香り漂う夢' },
                        { target: 'fua_dmg_boost', value: dmgBuff, type: 'add', source: '麦の香り漂う夢' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
