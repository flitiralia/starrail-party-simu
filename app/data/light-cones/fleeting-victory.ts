import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

export const fleetingVictory: ILightConeData = {
    id: 'fleeting-victory',
    name: '瞬刻の勝機',
    description: '装備キャラの速度+8%。装備キャラの記憶の精霊が、味方単体に精霊スキルを発動した後、味方全体の与ダメージ+16%、3ターン継続。',
    descriptionTemplate: '装備キャラの速度+{0}%。装備キャラの記憶の精霊が、味方単体に精霊スキルを発動した後、味方全体の与ダメージ+{1}%、3ターン継続。',
    descriptionValues: [
        ['8', '16'],
        ['9', '20'],
        ['10', '24'],
        ['11', '28'],
        ['12', '32']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 1058,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'fleeting-spd',
            name: '機知（速度）',
            category: 'BUFF',
            targetStat: 'spd_pct',
            effectValue: [0.08, 0.09, 0.10, 0.11, 0.12]
        }
    ],
    eventHandlers: [
        {
            id: 'fleeting-dmg-buff',
            name: '機知（与ダメージ）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source || !source.isSummon || source.ownerId !== unit.id) return state;

                const targetId = (event as any).targetId;
                if (!targetId) return state;
                const targetUnit = state.registry.get(createUnitId(targetId));
                if (!targetUnit || targetUnit.isEnemy) return state; // 味方のみ

                const dmgBoost = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];

                let newState = state;
                const allies = state.registry.getAliveAllies();

                for (const ally of allies) {
                    newState = addEffect(newState, ally.id, {
                        id: `fleeting-dmg-buff-${ally.id}`, // Single ID per target implies non-stacking from same source
                        name: '機知（与ダメージ）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 3,
                        modifiers: [{
                            target: 'all_type_dmg_boost',
                            value: dmgBoost,
                            type: 'add',
                            source: '瞬刻の勝機'
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
