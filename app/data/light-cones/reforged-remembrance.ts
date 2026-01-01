import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const reforgedRemembrance: ILightConeData = {
    id: 'reforged-remembrance',
    name: '時間の記憶を再構築して',
    description: '装備キャラの効果命中+40%。装備キャラが風化、燃焼、感電、または裂傷状態の敵にダメージを与える時、それぞれ｢予見｣を1層獲得する、最大で4層累積できる。一度の戦闘において、各種類の持続ダメージ系デバフがそれぞれ累積できる｢予見｣は1層のみ。｢予見｣1層につき、装備キャラの攻撃力+5%、与える持続ダメージが敵の防御力を+7.2%無視する。',
    descriptionTemplate: '装備キャラの効果命中+{0}%。装備キャラが風化、燃焼、感電、または裂傷状態の敵にダメージを与える時...｢予見｣1層につき、装備キャラの攻撃力+{1}%、与える持続ダメージが敵の防御力を+{2}%無視する。',
    descriptionValues: [
        ['40', '5', '7.2'],
        ['45', '6', '7.9'],
        ['50', '7', '8.6'],
        ['55', '8', '9.3'],
        ['60', '9', '10.0']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'reforged-ehr',
            name: '結晶（効果命中）',
            category: 'BUFF',
            targetStat: 'effect_hit_rate',
            effectValue: [0.40, 0.45, 0.50, 0.55, 0.60]
        }
    ],
    eventHandlers: [
        {
            id: 'reforged-prophet-stack',
            name: '結晶（予見スタック）',
            events: ['ON_DAMAGE_DEALT'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event)) return state;

                const targetId = event.targetId as string;
                const target = state.registry.get(createUnitId(targetId));
                if (!target) return state;

                // ターゲット上の持続ダメージを特定
                const dots = target.effects.filter(e => e.type === 'DoT');
                const foundTypes = new Set<string>();
                dots.forEach(d => {
                    const dotType = (d as any).dotType; // DoT効果にdotTypeが存在すると仮定
                    if (d.name.includes('風化') || dotType === 'WindShear') foundTypes.add('WindShear');
                    if (d.name.includes('燃焼') || dotType === 'Burn') foundTypes.add('Burn');
                    if (d.name.includes('感電') || dotType === 'Shock') foundTypes.add('Shock');
                    if (d.name.includes('裂傷') || dotType === 'Bleed') foundTypes.add('Bleed');
                    if (d.name.includes('アルカナ')) {
                        foundTypes.add('WindShear');
                        foundTypes.add('Burn');
                        foundTypes.add('Shock');
                        foundTypes.add('Bleed');
                    }
                });

                if (foundTypes.size === 0) return state;

                const trackerId = `reforged_tracker_${unit.id}`;
                let tracker = unit.effects.find(e => e.id === trackerId);

                let recordedTypes: string[] = [];
                if (tracker && tracker.miscData) {
                    recordedTypes = tracker.miscData.types || [];
                }

                let newTypes = 0;
                foundTypes.forEach(t => {
                    if (!recordedTypes.includes(t)) {
                        recordedTypes.push(t);
                        newTypes++;
                    }
                });

                if (newTypes === 0) return state;

                let newState = state;
                newState = addEffect(newState, unit.id, {
                    id: trackerId,
                    name: '結晶（予見トラッカー）',
                    category: 'OTHER',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    modifiers: [],
                    miscData: { types: recordedTypes },
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                const stackLimit = 4;
                const prophetId = `reforged_prophet_${unit.id}`;
                const prophet = unit.effects.find(e => e.id === prophetId);
                const currentStacks = prophet ? (prophet.stackCount || 0) : 0;
                const nextStacks = Math.min(currentStacks + newTypes, stackLimit);

                if (nextStacks > currentStacks) {
                    const atkVal = [0.05, 0.06, 0.07, 0.08, 0.09][superimposition - 1];
                    const defIgnVal = [0.072, 0.079, 0.086, 0.093, 0.10][superimposition - 1];

                    newState = addEffect(newState, unit.id, {
                        id: prophetId,
                        name: '予見',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: nextStacks,
                        modifiers: [
                            { target: 'atk_pct', value: atkVal * nextStacks, type: 'add', source: '時間の記憶を再構築して' },
                            { target: 'dot_def_ignore', value: defIgnVal * nextStacks, type: 'add', source: '時間の記憶を再構築して' }
                        ],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return newState;
            }
        }
    ]
};
