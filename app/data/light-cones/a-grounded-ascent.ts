import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';
import { addSkillPoints } from '@/app/simulator/engine/sp';
import { isSingleAllyTargetAction } from '@/app/simulator/engine/eventHelpers';
import { ActionEvent } from '@/app/simulator/engine/types';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const aGroundedAscent: ILightConeData = {
    id: 'a-grounded-ascent',
    name: '大地より天を目指して',
    description: '装備キャラが味方キャラ単体に戦闘スキル、または必殺技を発動すると、装備キャラはEPを6.0回復し、スキルターゲットは「聖なる詠唱」を1層獲得する、3ターン継続。最大で3層累積できる。「聖なる詠唱」1層につき、所持者の与ダメージ+15%。装備キャラが味方キャラ単体に戦闘スキル、または必殺技を2回発動するたびに、SPを1回復する。',
    descriptionTemplate: '装備キャラが味方キャラ単体に戦闘スキル、または必殺技を発動すると、装備キャラはEPを{0}回復し、スキルターゲットは「聖なる詠唱」を1層獲得する、3ターン継続。最大で3層累積できる。「聖なる詠唱」1層につき、所持者の与ダメージ+{1}%。装備キャラが味方キャラ単体に戦闘スキル、または必殺技を2回発動するたびに、SPを1回復する。',
    descriptionValues: [
        ['6.0', '15'],
        ['6.5', '17.25'],
        ['7.0', '19.5'],
        ['7.5', '21.75'],
        ['8.0', '24']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 1164,
        atk: 476,
        def: 529,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'grounded-ascent-trigger',
            name: '大地より天を目指して（スキル発動）',
            events: ['ON_SKILL_USED', 'ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 単体味方ターゲットのアクションかを判定
                const actionEvent = event as ActionEvent;
                if (!isSingleAllyTargetAction(actionEvent)) return state;

                const targetId = actionEvent.targetId!;

                let newState = state;

                // 1. EP回復
                const ep = [6.0, 6.5, 7.0, 7.5, 8.0][superimposition - 1];
                newState = addEnergyToUnit(newState, unit.id, ep);

                // 2. ターゲットに「聖なる詠唱」を付与
                // addEffectの自動スタック管理を活用（同ID・同ソースで自動累積 + duration自動リフレッシュ）
                // statBuilderがstackCount倍を自動適用するため、modifiers.valueは1層あたりの値
                const dmgPerStack = [0.15, 0.1725, 0.195, 0.2175, 0.24][superimposition - 1];

                if (targetId) {
                    newState = addEffect(newState, targetId, {
                        id: 'grounded-ascent-hymn',
                        name: '聖なる詠唱',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 3,
                        maxStacks: 3,
                        modifiers: [
                            { target: 'all_type_dmg_boost', value: dmgPerStack, type: 'add', source: '大地より天を目指して' }
                        ],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                // 3. SP回復（2回発動ごと）
                const trackerId = `grounded_ascent_tracker_${unit.id}`;
                // ★ 修正: unit.effects（古いスナップショット）ではなく、newState（最新の状態）からトラッカーを取得
                const freshUnit = newState.registry.get(createUnitId(unit.id));
                const tracker = freshUnit?.effects.find(e => e.id === trackerId);
                const count = (tracker ? (tracker.stackCount || 0) : 0) + 1;

                if (count % 2 === 0) { // 2回目、4回目……
                    newState = addSkillPoints(newState, 1).state;
                }

                newState = addEffect(newState, unit.id, {
                    id: trackerId,
                    name: '大地より天を目指して（回数）',
                    category: 'STATUS',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: count,
                    modifiers: [],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                return newState;
            }
        }
    ]
};
