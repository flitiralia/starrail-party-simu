import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const incessantRain: ILightConeData = {
    id: 'incessant-rain',
    name: '降りやまぬ雨',
    description: '装備キャラの効果命中+24%。デバフが3つ以上ある敵に対して、装備キャラの会心率+12%。装備キャラが通常攻撃、戦闘スキル、必殺技を発動した後、100%の基礎確率で攻撃を受けた敵の中から、「エーテルコード」を付与されていないランダムな敵一体にエーテルコードを付与する。「エーテルコード」を付与された敵の被ダメージ+12%、1ターン継続。',
    descriptionTemplate: '装備キャラの効果命中+{0}%。デバフが3つ以上ある敵に対して、装備キャラの会心率+{1}%。装備キャラが通常攻撃、戦闘スキル、必殺技を発動した後、100%の基礎確率で攻撃を受けた敵の中から、「エーテルコード」を付与されていないランダムな敵一体にエーテルコードを付与する。「エーテルコード」を付与された敵の被ダメージ+{2}%、1ターン継続。',
    descriptionValues: [
        ['24', '12', '12'],
        ['28', '14', '14'],
        ['32', '16', '16'],
        ['36', '18', '18'],
        ['40', '20', '20']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'incessant-rain-ehr',
            name: '幻想と現実（効果命中）',
            category: 'BUFF',
            targetStat: 'effect_hit_rate',
            effectValue: [0.24, 0.28, 0.32, 0.36, 0.40]
        }
    ],
    eventHandlers: [
        {
            id: 'incessant-rain-crit',
            name: '幻想と現実（会心率）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (!dmgEvent.targetId) return state;

                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                const debuffCount = target.effects.filter(e => e.category === 'DEBUFF').length;
                if (debuffCount >= 3) {
                    const crBuff = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];
                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            critRate: (state.damageModifiers.critRate || 0) + crBuff
                        }
                    };
                }
                return state;
            }
        },
        {
            id: 'incessant-rain-aether-code',
            name: '幻想と現実（エーテルコード）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                if (!('targetId' in event) || !event.targetId) return state;
                const targetId = event.targetId as string;
                const target = state.registry.get(createUnitId(targetId));
                if (!target) return state;

                const hasCode = target.effects.some(e => e.id.includes('aether_code'));
                if (!hasCode) {
                    const codeVal = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                    return addEffect(state, targetId, {
                        id: `incessant_rain_aether_code_${targetId}`,
                        name: 'エーテルコード',
                        category: 'DEBUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 1,
                        stackCount: 1,
                        modifiers: [
                            { target: 'all_type_vuln', value: codeVal, type: 'add', source: '降りやまぬ雨' }
                        ],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return state;
            }
        }
    ]
};
