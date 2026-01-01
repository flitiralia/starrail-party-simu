import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

export const THE_FLOWER_REMEMBERS: ILightConeData = {
    id: 'the-flower-remembers',
    name: '花は忘れない',
    description: '装備キャラの会心ダメージ+32%。装備キャラの記憶の精霊が攻撃を行った後、装備キャラとその記憶の精霊の会心ダメージ+32%、2ターン継続。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。装備キャラの記憶の精霊が攻撃を行った後、装備キャラとその記憶の精霊の会心ダメージ+{1}%、2ターン継続。',
    descriptionValues: [
        ['32', '32'],
        ['40', '40'],
        ['48', '48'],
        ['56', '56'],
        ['64', '64']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'flowers-cd',
            name: '感銘（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.32, 0.40, 0.48, 0.56, 0.64]
        }
    ],
    eventHandlers: [
        {
            id: 'flowers-cd-buff',
            name: '感銘（追加会心ダメ）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source || !source.isSummon || source.ownerId !== unit.id) return state;

                const cdBoost = [0.32, 0.40, 0.48, 0.56, 0.64][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `flowers-buff-${unit.id}`,
                    name: '感銘（追加会心ダメ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 2,
                    modifiers: [{
                        target: 'crit_dmg',
                        value: cdBoost,
                        type: 'add',
                        source: '花は忘れない'
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
