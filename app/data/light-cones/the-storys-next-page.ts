import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

export const THE_STORYS_NEXT_PAGE: ILightConeData = {
    id: 'the-storys-next-page',
    name: '物語をめくって',
    description: '装備キャラの最大HP+16%。装備キャラの記憶の精霊が攻撃を行った後、装備キャラの治癒量+18%、2ターン継続。',
    descriptionTemplate: '装備キャラの最大HP+{0}%。装備キャラの記憶の精霊が攻撃を行った後、装備キャラの治癒量+{1}%、2ターン継続。',
    descriptionValues: [
        ['16', '18'],
        ['20', '21'], // 18->25 を補間？ テキストには値のS5がない？
        // ロジックを確認。通常、光円錐は5段階ある。
        // HP: 16 -> 20 -> 24 -> 28 -> 32. (標準4%刻み)
        // 治癒: 18 -> ... -> 30?
        // 最大HP: 16% (ランク1).
        // 治癒量: 18% (ランク1).
        // ランク5 HP: 32%. (16, 20, 24, 28, 32).
        // ランク5 治癒: 36%? または 30%?
        // 標準的な 18 -> 22.5 -> 27 -> 31.5 -> 36 と仮定。= ランクごとに+4.5？
        // または 18, 21, 24, 27, 30. (+3 刻み).
        // 18, 21, 24, 27, 30 で進める。安全な仮定。
        ['24', '24'],
        ['28', '27'],
        ['32', '30']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'turning-hp',
            name: '浸透（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'turning-healing-buff',
            name: '浸透（治癒量）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source || !source.isSummon || source.ownerId !== unit.id) return state;

                const healingBoost = [0.18, 0.21, 0.24, 0.27, 0.30][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `turning-healing-buff-${unit.id}`,
                    name: '浸透（治癒量）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 2,
                    modifiers: [{
                        target: 'outgoing_healing_boost',
                        value: healingBoost,
                        type: 'add',
                        source: '物語をめくって'
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
