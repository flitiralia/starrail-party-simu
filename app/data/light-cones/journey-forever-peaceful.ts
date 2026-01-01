import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const JOURNEY_FOREVER_PEACEFUL: ILightConeData = {
    id: 'journey-forever-peaceful',
    name: '旅が平穏であるように',
    description: '装備キャラが付与するバリアの耐久値+12%。味方がバリアを持つ時、与ダメージ+12%。',
    descriptionTemplate: '装備キャラが付与するバリアの耐久値+{0}%。味方がバリアを持つ時、与ダメージ+{1}%。',
    descriptionValues: [
        ['12', '12'],
        ['15', '14'],
        ['18', '16'],
        ['21', '18'],
        ['24', '20']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 1058,
        atk: 370,
        def: 529,
    },

    passiveEffects: [
        {
            id: 'journey-forever-peaceful-shield',
            name: '甘い夢（バリア強化）',
            category: 'BUFF',
            targetStat: 'shield_strength_boost',
            effectValue: [0.12, 0.15, 0.18, 0.21, 0.24]
        }
    ],

    eventHandlers: [
        {
            id: 'journey-forever-peaceful-dmg',
            name: '甘い夢（与ダメUP）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const dmgBoost = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `journey-forever-peaceful-dmg-buff-${unit.id}`,
                    name: '甘い夢（条件付与ダメ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    modifiers: [{
                        target: 'all_type_dmg_boost',
                        source: '旅が平穏であるように',
                        type: 'add',
                        value: 0,
                        dynamicValue: (u, allUnits) => {
                            const hasShieldedAlly = allUnits.some(a => !a.isEnemy && a.shield > 0);
                            return hasShieldedAlly ? dmgBoost : 0;
                        }
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
