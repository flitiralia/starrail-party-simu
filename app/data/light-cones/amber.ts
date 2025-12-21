import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const amber: ILightConeData = {
    id: 'amber',
    name: '琥珀',
    description: '装備キャラの防御力+16%。装備キャラの残りHPが50%未満の場合、さらに防御力+16%。',
    descriptionTemplate: '装備キャラの防御力+{0}%。装備キャラの残りHPが50%未満の場合、さらに防御力+{1}%。',
    descriptionValues: [
        ['16', '16'],
        ['20', '20'],
        ['24', '24'],
        ['28', '28'],
        ['32', '32']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 846,
        atk: 264,
        def: 330,
    },

    passiveEffects: [
        {
            id: 'amber-def',
            name: '停滞（防御力）',
            category: 'BUFF',
            targetStat: 'def_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],

    eventHandlers: [
        {
            id: 'amber-conditional-def',
            name: '停滞（瀕死時防御力）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const defBoost = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `amber-def-buff-${unit.id}`,
                    name: '停滞（条件付防御力）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    modifiers: [{
                        target: 'def_pct',
                        source: '琥珀',
                        type: 'add',
                        value: 0,
                        dynamicValue: (u, allUnits) => {
                            const ratio = u.hp / u.stats.hp;
                            return ratio < 0.5 ? defBoost : 0;
                        }
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
