import { ILightConeData } from '@/app/types';

export const reminiscence: ILightConeData = {
    id: 'reminiscence',
    name: '辿る記憶',
    description: '記憶の精霊のターンが回ってきた時、装備キャラおよびその記憶の精霊それぞれに「追懐」を1層付与する。「追懐」1層につき与ダメージ+8%、最大で4層累積できる。記憶の精霊が消える時、装備キャラおよびその記憶の精霊の「追懐」は解除される。',
    descriptionTemplate: '記憶の精霊のターンが回ってきた時、装備キャラおよびその記憶の精霊それぞれに「追懐」を1層付与する。「追懐」1層につき与ダメージ+{0}%、最大で4層累積できる。',
    descriptionValues: [
        ['8'],
        ['9'],
        ['10'],
        ['11'],
        ['12']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 635,
        atk: 423,
        def: 264,
    },
    passiveEffects: [],
    // Complex stacking logic would go here
    eventHandlers: []
};
