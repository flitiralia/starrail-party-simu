import { ILightConeData } from '@/app/types';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';

export const makeTheWorldClamor: ILightConeData = {
    id: 'make-the-world-clamor',
    name: 'この世界に喧噪を',
    description: '戦闘に入る時、装備キャラはEPを20回復する。装備キャラの必殺技の与ダメージ+32%。',
    descriptionTemplate: '戦闘に入る時、装備キャラはEPを{0}回復する。装備キャラの必殺技の与ダメージ+{1}%。',
    descriptionValues: [
        ['20', '32'],
        ['23', '40'],
        ['26', '48'],
        ['29', '56'],
        ['32', '64']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 846,
        atk: 476,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'make-world-clamor-ult-dmg',
            name: 'この世界に喧噪を（必殺技与ダメ）',
            category: 'BUFF',
            targetStat: 'ult_dmg_boost',
            effectValue: [0.32, 0.40, 0.48, 0.56, 0.64]
        }
    ],
    eventHandlers: [
        {
            id: 'make-world-clamor-ep',
            name: 'この世界に喧噪を（初期EP）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const ep = [20, 23, 26, 29, 32][superimposition - 1];
                return addEnergyToUnit(state, unit.id, ep);
            }
        }
    ]
};
