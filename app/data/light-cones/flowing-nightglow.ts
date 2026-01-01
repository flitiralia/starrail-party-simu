import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const flowingNightglow: ILightConeData = {
    id: 'flowing-nightglow',
    name: '光あふれる夜',
    description: '味方が攻撃を行うたび、装備キャラは「朗唱」を1層獲得する。「朗唱」1層につき、装備キャラのEP回復効率+3.0%、最大で5層累積できる。装備キャラが必殺技を発動する時、「朗唱」を解除し「華彩」を獲得する。「華彩」がある時、装備キャラの攻撃力+48%、味方全体の与ダメージ+24%、1ターン継続。',
    descriptionTemplate: '味方が攻撃を行うたび、装備キャラは「朗唱」を1層獲得する。「朗唱」1層につき、装備キャラのEP回復効率+{0}%、最大で5層累積できる。装備キャラが必殺技を発動する時、「朗唱」を解除し「華彩」を獲得する。「華彩」がある時、装備キャラの攻撃力+{1}%、味方全体の与ダメージ+{2}%、1ターン継続。',
    descriptionValues: [
        ['3.0', '48', '24'],
        ['3.5', '60', '28'],
        ['4.0', '72', '32'],
        ['4.5', '84', '36'],
        ['5.0', '96', '40']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 952,
        atk: 635,
        def: 463,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'flowing-nightglow-gain-stack',
            name: '光あふれる夜（朗唱獲得）',
            events: ['ON_ATTACK'], // "味方が攻撃を行うたび"
            handler: (event, state, unit, superimposition) => {
                // ソースは味方でなければならない
                const attacker = state.registry.get(createUnitId(event.sourceId));
                if (!attacker || attacker.isEnemy) return state;

                // 「朗唱」スタックを追加
                const errPerStack = [0.03, 0.035, 0.04, 0.045, 0.05][superimposition - 1];

                const current = unit.effects.find(e => e.id === `flowing_nightglow_stack_${unit.id}`);
                const currentCount = current ? (current.stackCount || 0) : 0;
                const nextCount = Math.min(currentCount + 1, 5);

                if (nextCount === currentCount) return state;

                return addEffect(state, unit.id, {
                    id: `flowing_nightglow_stack_${unit.id}`,
                    name: '朗唱（EP回復効率）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: nextCount,
                    modifiers: [
                        { target: 'energy_regen_rate', value: errPerStack * nextCount, type: 'add', source: '光あふれる夜' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'flowing-nightglow-ult-trigger',
            name: '光あふれる夜（華彩発動）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                let newState = state;

                // スタックを削除
                newState = removeEffect(newState, unit.id, `flowing_nightglow_stack_${unit.id}`);

                // 「華彩」を適用
                const atkBuff = [0.48, 0.60, 0.72, 0.84, 0.96][superimposition - 1];
                const dmgBuff = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];

                // 自身に「華彩」
                newState = addEffect(newState, unit.id, {
                    id: `flowing_nightglow_cadenza_${unit.id}`,
                    name: '華彩',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 1,
                    stackCount: 1,
                    modifiers: [
                        { target: 'atk_pct', value: atkBuff, type: 'add', source: '光あふれる夜' }
                    ],
                    apply: (u, s) => {
                        // 味方にオーラ（与ダメUP）を適用
                        const allies = s.registry.getAliveAllies();
                        let ns = s;
                        allies.forEach(ally => {
                            ns = addEffect(ns, ally.id, {
                                id: `flowing_nightglow_aura_${ally.id}`,
                                name: '華彩（与ダメージ）',
                                category: 'BUFF',
                                sourceUnitId: u.id,
                                durationType: 'PERMANENT',
                                duration: -1,
                                stackCount: 1,
                                modifiers: [
                                    { target: 'all_type_dmg_boost', value: dmgBuff, type: 'add', source: '光あふれる夜' }
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
                            ns = removeEffect(ns, ally.id, `flowing_nightglow_aura_${ally.id}`);
                        });
                        return ns;
                    }
                });

                return newState;
            }
        }
    ]
};
