import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';
import { applyHealing } from '../../simulator/engine/utils';
import { IEffect } from '../../simulator/effect/types';

export const sheAlreadyShutHerEyes: ILightConeData = {
    id: 'she-already-shut-her-eyes',
    name: '閉ざした瞳',
    description: '装備キャラの最大HP+24%、EP回復効率+12%。装備キャラのHPが減った時、味方全体の与ダメージ+9%、2ターン継続。各ウェーブ開始時、味方全体のHPをそれぞれ失ったHPの80%分回復する。',
    descriptionTemplate: '装備キャラの最大HP+{0}%、EP回復効率+{1}%。装備キャラのHPが減った時、味方全体の与ダメージ+{2}%、2ターン継続。各ウェーブ開始時、味方全体のHPをそれぞれ失ったHPの{3}%分回復する。',
    descriptionValues: [
        ['24', '12', '9.0', '80'],
        ['28', '14', '10.5', '85'],
        ['32', '16', '12.0', '90'],
        ['36', '18', '13.5', '95'],
        ['40', '20', '15.0', '100']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 1270,
        atk: 423,
        def: 529,
    },

    passiveEffects: [
        {
            id: 'closed-eyes-hp',
            name: '視界（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.24, 0.28, 0.32, 0.36, 0.40]
        },
        {
            id: 'closed-eyes-err',
            name: '視界（EP回復）',
            category: 'BUFF',
            targetStat: 'energy_regen_rate',
            effectValue: [0.12, 0.14, 0.16, 0.18, 0.20]
        }
    ],

    eventHandlers: [
        {
            id: 'closed-eyes-on-dmg',
            name: '視界（被弾時バフ）',
            events: ['ON_DAMAGE_DEALT'],
            handler: (event, state, unit, superimposition) => {
                if (!('targetId' in event)) return state;
                if (event.targetId !== unit.id) return state;

                const dmgBoost = [0.09, 0.105, 0.12, 0.135, 0.15][superimposition - 1];

                // 味方全体にバフを付与
                let newState = state;
                const allies = state.registry.getAliveAllies();

                for (const ally of allies) {
                    newState = addEffect(newState, ally.id, {
                        id: `closed-eyes-buff-${unit.id}-${ally.id}`,
                        name: '視界（与ダメUP）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_END_BASED',
                        duration: 2,
                        modifiers: [{
                            target: 'all_type_dmg_boost',
                            value: dmgBoost,
                            type: 'add',
                            source: '閉ざした瞳'
                        }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }
                return newState;
            }
        },
        {
            id: 'closed-eyes-wave-heal',
            name: '視界（ウェーブ回復）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const healPercent = [0.8, 0.85, 0.9, 0.95, 1.0][superimposition - 1];

                let newState = state;
                const allies = newState.registry.getAliveAllies();

                for (const ally of allies) {
                    const lostHp = ally.stats.hp - ally.hp;
                    if (lostHp > 0) {
                        const healAmount = lostHp * healPercent;
                        newState = applyHealing(newState, unit.id, ally.id, healAmount, '閉ざした瞳（回復）');
                    }
                }
                return newState;
            }
        }
    ]
};
