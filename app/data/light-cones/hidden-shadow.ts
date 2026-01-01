import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const hiddenShadow: ILightConeData = {
    id: 'hidden-shadow',
    name: '匿影',
    description: '戦闘スキルを発動した後、装備キャラの次の通常攻撃が、敵に自身の攻撃力60%分の付加ダメージを与える。',
    descriptionTemplate: '戦闘スキルを発動した後、装備キャラの次の通常攻撃が、敵に自身の攻撃力{0}%分の付加ダメージを与える。',
    descriptionValues: [
        ['60'],
        ['75'],
        ['90'],
        ['105'],
        ['120']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 846,
        atk: 317,
        def: 264,
    },
    passiveEffects: [],
    eventHandlers: [
        // 1. スキル使用時に「次の通常攻撃」をマーク
        {
            id: 'hidden-shadow-skill',
            name: '機関（装填）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                return addEffect(state, unit.id, {
                    id: `hidden_shadow_buff_${unit.id}`,
                    name: '機関',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // 使用されるまで
                    duration: -1,
                    stackCount: 1,
                    modifiers: [],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        // 2. 通常攻撃時にトリガー
        {
            id: 'hidden-shadow-proc',
            name: '機関（発動）',
            events: ['ON_BASIC_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const buffId = `hidden_shadow_buff_${unit.id}`;
                const hasBuff = unit.effects.some(e => e.id === buffId);

                if (hasBuff) {
                    const mult = [0.60, 0.75, 0.90, 1.05, 1.20][superimposition - 1];
                    const dmg = unit.stats.atk * mult;

                    // バフを消費
                    let cleanState = removeEffect(state, unit.id, buffId);

                    // 統合ログに付加ダメージを追記
                    const { appendAdditionalDamage } = require('@/app/simulator/engine/dispatcher');
                    const { createUnitId } = require('@/app/simulator/engine/unitId');
                    const targetUnit = cleanState.registry.get(createUnitId((event as any).targetId));
                    cleanState = appendAdditionalDamage(cleanState, {
                        source: unit.name,
                        name: '匿影',
                        damage: dmg,
                        target: targetUnit?.name || (event as any).targetId,
                        damageType: 'additional',
                        isCrit: false,
                        breakdownMultipliers: {
                            baseDmg: dmg,
                            critMult: 1,
                            dmgBoostMult: 1,
                            defMult: 1,
                            resMult: 1,
                            vulnMult: 1,
                            brokenMult: 1
                        }
                    });

                    return cleanState;
                }
                return state;
            }
        }
    ]
};
