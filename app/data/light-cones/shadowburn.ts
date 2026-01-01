import { ILightConeData } from '@/app/types';

export const shadowburn: ILightConeData = {
    id: 'shadowburn',
    name: '燃ゆる影',
    description: '装備キャラが戦闘中に初めて記憶の精霊を召喚する時、SPを1回復し、自身のEPを12回復する。',
    descriptionTemplate: '装備キャラが戦闘中に初めて記憶の精霊を召喚する時、SPを1回復し、自身のEPを{0}回復する。',
    descriptionValues: [
        ['12'],
        ['14'],
        ['16'],
        ['18'],
        ['20']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 846,
        atk: 317,
        def: 264,
    },
    passiveEffects: [],
    // Event handler for "First Summon" logic would be implemented here
    eventHandlers: []
};
