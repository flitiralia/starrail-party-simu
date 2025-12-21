import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const lifeShouldBeBurned: ILightConeData = {
    id: 'life-should-be-burned',
    name: '生命、焼滅すべし',
    description: '装備キャラのターンが回ってきた時、EPを10回復する。敵に装備キャラが付与した弱点属性がある場合、装備キャラがその敵に与えるダメージ+60%。敵が装備キャラの攻撃を受ける時、装備キャラがその敵の防御力を12%ダウンさせる。2ターン継続。同系統のスキルは累積できない。',
    descriptionTemplate: '装備キャラのターンが回ってきた時、EPを10回復する。敵に装備キャラが付与した弱点属性がある場合、装備キャラがその敵に与えるダメージ+{0}%。敵が装備キャラの攻撃を受ける時、装備キャラがその敵の防御力を{1}%ダウンさせる。2ターン継続。同系統のスキルは累積できない。',
    descriptionValues: [
        ['60', '12'],
        ['70', '15'],
        ['80', '18'],
        ['90', '21'],
        ['100', '24']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 952,
        atk: 582,
        def: 529,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'life_burned_start_turn_ep',
            name: '生命、焼滅すべし（EP回復）',
            events: ['ON_TURN_START'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                return addEnergyToUnit(state, unit.id, 10);
            }
        },
        {
            id: 'life_burned_bonus_weakness',
            name: '生命、焼滅すべし（弱点付与与ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (!dmgEvent.targetId) return state;

                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                const hasAppliedWeakness = target.effects.some(e =>
                    e.sourceUnitId === unit.id &&
                    (e.name.includes('Weakness') || e.name.includes('弱点') || e.name.includes('Implant'))
                );

                if (hasAppliedWeakness) {
                    const dmgBoost = [0.60, 0.70, 0.80, 0.90, 1.00][superimposition - 1];
                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + dmgBoost
                        }
                    };
                }

                return state;
            }
        },
        {
            id: 'life_burned_def_shred',
            name: '生命、焼滅すべし（防御ダウン）',
            events: ['ON_DAMAGE_DEALT'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event)) return state;
                const targetId = event.targetId;
                if (!targetId) return state;

                const defShred = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                return addEffect(state, targetId, {
                    id: `life_should_be_burned_debuff_${event.targetId}`,
                    name: '溶錬（防御ダウン）',
                    category: 'DEBUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 2,
                    stackCount: 1,

                    modifiers: [{ target: 'def_pct', value: -defShred, type: 'add', source: '生命、焼滅すべし' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
