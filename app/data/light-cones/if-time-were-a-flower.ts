import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';

export const ifTimeWereAFlower: ILightConeData = {
    id: 'if-time-were-a-flower',
    name: 'もしも時が花だったら',
    description: '装備キャラの会心ダメージ+36%。装備キャラが追加攻撃を行った後、さらにEPを12回復し、「啓示」を獲得する、2ターン継続。装備キャラが「啓示」を所持している場合、味方全体の会心ダメージ+48%。戦闘に入る時、装備キャラのEPが21回復し、「啓示」を獲得する、2ターン継続。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。装備キャラが追加攻撃を行った後、さらにEPを{1}回復し、「啓示」を獲得する、2ターン継続。装備キャラが「啓示」を所持している場合、味方全体の会心ダメージ+{2}%。戦闘に入る時、装備キャラのEPが21回復し、「啓示」を獲得する、2ターン継続。',
    descriptionValues: [
        ['36', '12', '48'],
        ['42', '13', '60'],
        ['48', '14', '72'],
        ['54', '15', '84'],
        ['60', '16', '96']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 1270,
        atk: 529,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'if-time-flower-base-cd',
            name: 'もしも時が花だったら（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.36, 0.42, 0.48, 0.54, 0.60]
        }
    ],
    eventHandlers: [
        {
            id: 'if-time-flower-start',
            name: 'もしも時が花だったら（開幕）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                let newState = addEnergyToUnit(state, unit.id, 21);
                newState = applyRevelation(newState, unit.id, superimposition);
                return newState;
            }
        },
        {
            id: 'if-time-flower-fua',
            name: 'もしも時が花だったら（追加攻撃）',
            events: ['ON_FOLLOW_UP_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const ep = [12, 13, 14, 15, 16][superimposition - 1];
                let newState = addEnergyToUnit(state, unit.id, ep);

                newState = applyRevelation(newState, unit.id, superimposition);
                return newState;
            }
        }
    ]
};

function applyRevelation(state: any, unitId: any, superimposition: number) {
    const cdBuff = [0.48, 0.60, 0.72, 0.84, 0.96][superimposition - 1];

    return addEffect(state, unitId, {
        id: `if_time_flower_revelation_${unitId}`,
        name: '啓示',
        category: 'BUFF',
        sourceUnitId: unitId,
        durationType: 'TURN_START_BASED',
        duration: 2,
        stackCount: 1,
        modifiers: [],
        apply: (u, s) => {
            // オーラを適用
            const allies = s.registry.getAliveAllies();
            let ns = s;
            allies.forEach(ally => {
                ns = addEffect(ns, ally.id, {
                    id: `if_time_flower_aura_${ally.id}`,
                    name: '啓示（会心ダメ）',
                    category: 'BUFF',
                    sourceUnitId: u.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    modifiers: [
                        { target: 'crit_dmg', value: cdBuff, type: 'add', source: 'もしも時が花だったら' }
                    ],
                    apply: (ua, sa) => sa,
                    remove: (ua, sa) => sa
                });
            });
            return ns;
        },
        remove: (u, s) => {
            const allies = s.registry.getAliveAllies();
            let ns = s;
            allies.forEach(ally => {
                ns = removeEffect(ns, ally.id, `if_time_flower_aura_${ally.id}`);
            });
            return ns;
        }
    });
}
