import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const voidLC: ILightConeData = {
    id: 'void',
    name: '幽邃',
    description: '戦闘開始時、装備キャラの効果命中+20%、3ターン継続。',
    descriptionTemplate: '戦闘開始時、装備キャラの効果命中+{0}%、3ターン継続。',
    descriptionValues: [
        ['20'],
        ['25'],
        ['30'],
        ['35'],
        ['40']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 846,
        atk: 317,
        def: 264,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'void-start-buff',
            name: '沈淪（効果命中）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const val = [0.20, 0.25, 0.30, 0.35, 0.40][superimposition - 1];
                return addEffect(state, unit.id, {
                    id: `void_ehr_${unit.id}`,
                    name: '沈淪',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 3,
                    stackCount: 1,
                    modifiers: [{ target: 'effect_hit_rate', value: val, type: 'add', source: '幽邃' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
