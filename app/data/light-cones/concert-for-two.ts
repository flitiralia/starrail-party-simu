import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const concertForTwo: ILightConeData = {
    id: 'concert-for-two',
    name: '二人だけのコンサート',
    description: '装備キャラの防御力+16%。フィールド上にいるバリアを持つ味方1名につき、装備キャラの与ダメージ+4%。',
    descriptionTemplate: '装備キャラの防御力+{0}%。フィールド上にいるバリアを持つ味方1名につき、装備キャラの与ダメージ+{1}%。',
    descriptionValues: [
        ['16', '4'],
        ['20', '5'],
        ['24', '6'],
        ['28', '7'],
        ['32', '8']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 952,
        atk: 370,
        def: 463,
    },

    passiveEffects: [
        {
            id: 'concert-def',
            name: '声援（防御力）',
            category: 'BUFF',
            targetStat: 'def_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],

    eventHandlers: [
        {
            id: 'concert-dynamic-dmg',
            name: '声援（バリア数与ダメ）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const dmgPerAlly = [0.04, 0.05, 0.06, 0.07, 0.08][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `concert-dmg-buff-${unit.id}`,
                    name: '声援（与ダメUP）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    modifiers: [{
                        target: 'all_type_dmg_boost',
                        source: '二人だけのコンサート',
                        type: 'add',
                        value: 0,
                        dynamicValue: (u, allUnits) => {
                            // シールドを持つ味方をカウント
                            // allUnitsから味方をフィルタリング？
                            // `dynamicValue`の`allUnits`パラメータには通常、レジストリ内のすべてのユニットが含まれる。
                            // `isEnemy`を確認する。
                            const count = allUnits.filter(a => !a.isEnemy && a.shield > 0).length;
                            return count * dmgPerAlly;
                        }
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
