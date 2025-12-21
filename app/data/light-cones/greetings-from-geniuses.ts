import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const greetingsFromGeniuses: ILightConeData = {
    id: 'greetings-from-geniuses',
    name: '天才たちの「挨拶」',
    description: '装備キャラの攻撃力+16%。装備キャラが必殺技を発動した後、装備キャラの通常攻撃の与ダメージ+24%、2ターン継続。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。装備キャラが必殺技を発動した後、装備キャラの通常攻撃の与ダメージ+{1}%、2ターン継続。',
    descriptionValues: [
        ['16', '24'],
        ['20', '30'],
        ['24', '36'],
        ['28', '42'],
        ['32', '48']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'greetings-atk',
            name: '交流（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'greetings-basic-buff',
            name: '交流（通常攻撃バフ）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const dmgBoost = [0.24, 0.30, 0.36, 0.42, 0.48][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `greetings-buff-${unit.id}`,
                    name: '交流（通常攻撃）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 2,
                    modifiers: [{
                        target: 'basic_atk_dmg_boost',
                        value: dmgBoost,
                        type: 'add',
                        source: '天才たちの「挨拶」'
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
