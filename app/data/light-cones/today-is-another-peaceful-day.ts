import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const todayIsAnotherPeacefulDay: ILightConeData = {
    id: 'today-is-another-peaceful-day',
    name: '今日も平和な一日',
    description: '戦闘に入った後、装備キャラの最大EPに応じて、装備キャラの与ダメージがアップする。1EPにつき+0.20%、最大で160までカウントされる。',
    descriptionTemplate: '戦闘に入った後、装備キャラの最大EPに応じて、装備キャラの与ダメージがアップする。1EPにつき+{0}%、最大で160までカウントされる。',
    descriptionValues: [
        ['0.20'],
        ['0.25'],
        ['0.30'],
        ['0.35'],
        ['0.40']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 846,
        atk: 529,
        def: 330,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'peaceful_day_buff',
            name: '今日も平和な一日（EP依存与ダメ）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const perEp = [0.0020, 0.0025, 0.0030, 0.0035, 0.0040][superimposition - 1];
                const maxEp = unit.stats.max_ep || 100;
                const countedEp = Math.min(maxEp, 160);
                const buffValue = countedEp * perEp;

                return addEffect(state, unit.id, {
                    id: `peaceful_day_dmg_${unit.id}`,
                    name: '今日も平和な一日（与ダメ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    modifiers: [
                        { target: 'all_type_dmg_boost', value: buffValue, type: 'add', source: '今日も平和な一日' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
