import { ILightConeData } from '../../types';
import { advanceAction } from '../../simulator/engine/utils';

export const multiplication: ILightConeData = {
    id: 'multiplication',
    name: '蕃殖',
    description: '装備キャラが通常攻撃を行った後、次の行動順が12%早まる。',
    descriptionTemplate: '装備キャラが通常攻撃を行った後、次の行動順が{0}%早まる。',
    descriptionValues: [
        ['12'],
        ['14'],
        ['16'],
        ['18'],
        ['20']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 952,
        atk: 317,
        def: 198,
    },

    eventHandlers: [
        {
            id: 'multiplication-advance',
            name: '豊穣の民（行動順短縮）',
            events: ['ON_BASIC_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const advance = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                // 汎用ユーティリティを使用して行動順を短縮
                return advanceAction(state, unit.id as string, advance, 'percent');
            }
        }
    ]
};
