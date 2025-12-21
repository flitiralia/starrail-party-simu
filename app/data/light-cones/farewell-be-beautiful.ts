import { ILightConeData } from '../../types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';
import { advanceAction } from '../../simulator/engine/utils';

export const farewellBeBeautiful: ILightConeData = {
    id: 'farewell-be-beautiful',
    name: '永訣よ美しくあれ',
    description: '装備キャラの最大HP+30%。装備キャラまたは装備キャラの記憶の精霊が自身のターンでHPを失った時、装備キャラは「冥花」を獲得する。「冥花」を持つ場合、装備キャラおよびその記憶の精霊によるダメージは、ターゲットの防御力を30%無視する。2ターン継続。また、装備キャラの記憶の精霊が消えた時、装備キャラの行動順が12%早まる。この効果は1回まで発動でき、装備キャラが必殺技を発動するたびに、発動可能回数がリセットされる。',
    descriptionTemplate: '装備キャラの最大HP+{0}%。装備キャラまたは装備キャラの記憶の精霊が自身のターンでHPを失った時、装備キャラは「冥花」を獲得する。「冥花」を持つ場合、装備キャラおよびその記憶の精霊によるダメージは、ターゲットの防御力を{1}%無視する。2ターン継続。また、装備キャラの記憶の精霊が消えた時、装備キャラの行動順が{2}%早まる。この効果は1回まで発動でき、装備キャラが必殺技を発動するたびに、発動可能回数がリセットされる。',
    descriptionValues: [
        ['30', '30', '12'],
        ['37', '35', '15'],
        ['45', '40', '18'],
        ['52', '45', '21'],
        ['60', '50', '24']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 1270,
        atk: 529,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'farewell-hp',
            name: '銘刻（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.30, 0.37, 0.45, 0.52, 0.60]
        }
    ],
    eventHandlers: [
        {
            id: 'farewell-hp-monitor',
            name: '銘刻（HP監視）',
            events: ['ON_BEFORE_ACTION', 'ON_ACTION_COMPLETE'],
            handler: (event, state, unit, superimposition) => {
                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source) return state;

                const isWearer = source.id === unit.id;
                const isMySpirit = source.isSummon && source.ownerId === unit.id;
                if (!isWearer && !isMySpirit) return state;

                if (state.currentTurnOwnerId !== source.id) return state;

                if (event.type === 'ON_BEFORE_ACTION') {
                    // HPを記録
                    const hpRecordEffect: IEffect = {
                        id: `farewell-hp-record-${source.id}`,
                        name: 'Internal HP Record',
                        category: 'OTHER',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        modifiers: [],
                        miscData: { value: source.hp },
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    };
                    return addEffect(state, unit.id, hpRecordEffect);
                }

                if (event.type === 'ON_ACTION_COMPLETE') {
                    const recordEffect = unit.effects.find(e => e.id === `farewell-hp-record-${unit.id}`);
                    if (!recordEffect) return state;

                    const recordedHp = (recordEffect?.miscData?.value as number) || 0;
                    const currentHp = source.hp;

                    let newState = removeEffect(state, unit.id, recordEffect.id);

                    if (currentHp < recordedHp) {
                        const defIgnore = [0.30, 0.35, 0.40, 0.45, 0.50][superimposition - 1];
                        newState = addEffect(newState, unit.id, {
                            id: `farewell-nether-flower`,
                            name: '冥花',
                            category: 'BUFF',
                            sourceUnitId: unit.id,
                            durationType: 'TURN_END_BASED',
                            duration: 2,
                            modifiers: [{
                                target: 'def_ignore',
                                value: defIgnore,
                                type: 'add',
                                source: '永訣よ美しくあれ'
                            }],
                            apply: (u, s) => s,
                            remove: (u, s) => s
                        });
                    }
                    return newState;
                }

                return state;
            }
        },
        {
            id: 'farewell-spirit-monitor',
            name: '銘刻（精霊退場・必殺技）',
            events: ['ON_UNIT_DEATH', 'ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                let lcState = unit.lightConeState?.['farewell-be-beautiful'] || { cooldown: 0, activations: 0 };

                if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === unit.id) {
                    lcState = { ...lcState, activations: 0 };
                    const newUnit = { ...unit, lightConeState: { ...unit.lightConeState, 'farewell-be-beautiful': lcState } };
                    return {
                        ...state,
                        registry: state.registry.update(createUnitId(unit.id), u => newUnit)
                    };
                }

                if (event.type === 'ON_UNIT_DEATH') {
                    const deadUnit = state.registry.get(createUnitId((event as any).targetId));
                    if (!deadUnit || !deadUnit.isSummon || deadUnit.ownerId !== unit.id) return state;

                    if (lcState.activations >= 1) return state;

                    const advance = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];
                    let newState = advanceAction(state, unit.id, advance, 'percent');

                    lcState = { ...lcState, activations: 1 };
                    const updatedUnit = newState.registry.get(createUnitId(unit.id));
                    if (updatedUnit) {
                        const finalUnit = { ...updatedUnit, lightConeState: { ...updatedUnit.lightConeState, 'farewell-be-beautiful': lcState } };
                        newState = {
                            ...newState,
                            registry: newState.registry.update(createUnitId(unit.id), u => finalUnit)
                        };
                    }
                    return newState;
                }
                return state;
            }
        }
    ]
};
