import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEnergyToUnit } from '../../simulator/engine/energy';

export const echoesOfTheCoffin: ILightConeData = {
    id: 'echoes-of-the-coffin',
    name: '棺のこだま',
    description: '装備キャラの攻撃力＋24％。必殺技を発動した後、味方全体の速度+12、1ターン継続。装備キャラの攻撃が異なる敵に命中するごとに、EPを3.0回復する。1回の攻撃で、この効果を通して最大で3回EPを回復できる。',
    descriptionTemplate: '装備キャラの攻撃力＋{0}％。必殺技を発動した後、味方全体の速度+{1}、1ターン継続。装備キャラの攻撃が異なる敵に命中するごとに、EPを{2}回復する。1回の攻撃で、この効果を通して最大で3回EPを回復できる。',
    descriptionValues: [
        ['24', '12', '3.0'],
        ['28', '14', '3.5'],
        ['32', '16', '4.0'],
        ['36', '18', '4.5'],
        ['40', '20', '5.0']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 1164,
        atk: 582,
        def: 396,
    },

    passiveEffects: [
        {
            id: 'echoes-atk',
            name: 'いばら（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.24, 0.28, 0.32, 0.36, 0.40]
        }
    ],

    eventHandlers: [
        {
            id: 'echoes-spd-buff',
            name: 'いばら（速度バフ）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const spdValue = [12, 14, 16, 18, 20][superimposition - 1];

                let newState = state;
                const allies = newState.registry.getAliveAllies();
                for (const ally of allies) {
                    newState = addEffect(newState, ally.id, {
                        id: `echoes-spd-${unit.id}-${ally.id}`,
                        name: 'いばら（速度）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_END_BASED',
                        duration: 1,
                        modifiers: [{ target: 'spd', value: spdValue, type: 'add', source: '棺のこだま' }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }
                return newState;
            }
        },
        {
            id: 'echoes-ep-regen',
            name: 'いばら（EP回復）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 何体の敵にヒットしたかチェック
                const targetCount = (event as any).targetCount || 1; // Default 1 if missing
                const hits = Math.min(targetCount, 3);

                const epPerHit = [3.0, 3.5, 4.0, 4.5, 5.0][superimposition - 1];
                const totalEp = hits * epPerHit;

                return addEnergyToUnit(state, unit.id, totalEp);
            }
        }
    ]
};
