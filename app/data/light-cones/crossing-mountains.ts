import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';
import { applyHealing } from '../../simulator/engine/utils';
import { IEffect } from '../../simulator/effect/types';

export const crossingMountains: ILightConeData = {
    id: 'crossing-mountains',
    name: '万里の山河を越えて',
    description: '装備キャラの攻撃力+64%。装備キャラが必殺技を発動する時、味方全体のHPを装備キャラの攻撃力10%分回復し、さらに残りHPが最も低い味方キャラのHPを装備キャラの攻撃力10%分回復する。同時に、味方全体は「守護」を獲得する。「守護」は3ターン継続。「守護」を獲得した味方の与ダメージ+24%、さらに召喚物を持つ場合は追加で与ダメージ+12%。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。装備キャラが必殺技を発動する時、味方全体のHPを装備キャラの攻撃力{1}%分回復し、さらに残りHPが最も低い味方キャラのHPを装備キャラの攻撃力{2}%分回復する。同時に、味方全体は「守護」を獲得する。「守護」は3ターン継続。「守護」を獲得した味方の与ダメージ+{3}%、さらに召喚物を持つ場合は追加で与ダメージ+{4}%。',
    descriptionValues: [
        ['64', '10', '10', '24', '12'],
        ['80', '12.5', '12.5', '30', '15'],
        ['96', '15', '15', '36', '18'],
        ['112', '17.5', '17.5', '42', '21'],
        ['128', '20', '20', '48', '24']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },

    passiveEffects: [
        {
            id: 'crossing-mountains-atk',
            name: '新たな鱗（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.64, 0.80, 0.96, 1.12, 1.28]
        }
    ],

    eventHandlers: [
        {
            id: 'crossing-mountains-ult',
            name: '新たな鱗（必殺技発動時）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const healMult = [0.10, 0.125, 0.15, 0.175, 0.20][superimposition - 1];
                const dmgBoost = [0.24, 0.30, 0.36, 0.42, 0.48][superimposition - 1];
                const summonBoost = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                let newState = state;
                const allies = newState.registry.getAliveAllies();

                // 1. Heal All
                for (const ally of allies) {
                    newState = applyHealing(newState, unit.id, ally.id, {
                        scaling: 'atk',
                        multiplier: healMult
                    }, '万里の山河を越えて（全体回復）');
                }

                // 2. Heal Lowest HP
                const lowestAlly = allies.reduce((prev, curr) => (curr.hp / curr.stats.hp) < (prev.hp / prev.stats.hp) ? curr : prev, allies[0]);
                if (lowestAlly) {
                    newState = applyHealing(newState, unit.id, lowestAlly.id, {
                        scaling: 'atk',
                        multiplier: healMult
                    }, '万里の山河を越えて（追加回復）');
                }

                // 3. Grant 'Guardian' to all
                for (const ally of allies) {
                    // Check if ally has summon
                    const hasSummon = newState.registry.toArray().some(u => u.isSummon && u.ownerId === ally.id);

                    const totalDmgBoost = dmgBoost + (hasSummon ? summonBoost : 0);

                    newState = addEffect(newState, ally.id, {
                        id: `guardian-buff-${unit.id}-${ally.id}`,
                        name: '守護',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_END_BASED',
                        duration: 3,
                        modifiers: [{
                            target: 'all_type_dmg_boost',
                            value: totalDmgBoost,
                            type: 'add',
                            source: '万里の山河を越えて'
                        }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return newState;
            }
        }
    ]
};
