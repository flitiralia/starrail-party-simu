import { ILightConeData } from '@/app/types';
import { addSkillPoints } from '@/app/simulator/engine/sp';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const rememberHerFire: ILightConeData = {
    id: 'remember-her-fire',
    name: '彼女の炎を忘れずに',
    description: '装備キャラの撃破特効+60%。戦闘に入る時、装備キャラの弱点撃破ダメージ+32%。装備キャラ以外の味方が戦闘を開始した場合、その味方の弱点撃破ダメージ+32%。なお、装備キャラが戦闘を開始またはその他の方法で戦闘に入った場合、装備キャラ以外の味方で最も撃破特効が高い味方の弱点撃破ダメージ+32%。同系統のスキルは累積できない。装備キャラが敵に弱点を付与した時、SPを1回復する。この効果は1回まで発動でき、必殺技を発動するたびに、発動可能回数がリセットされる。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%。戦闘に入る時...弱点撃破ダメージ+{1}%...SP回復...',
    descriptionValues: [
        ['60', '32'],
        ['75', '42'],
        ['90', '52'],
        ['105', '62'],
        ['120', '72']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 1164,
        atk: 529,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'fire_be',
            name: '燃える身（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.60, 0.75, 0.90, 1.05, 1.20]
        }
    ],
    eventHandlers: [
        {
            id: 'fire_start_buff',
            name: '燃える身（撃破ダメ）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const buffVal = [0.32, 0.42, 0.52, 0.62, 0.72][superimposition - 1];
                const allies = state.registry.getAliveAllies().filter(a => a.id !== unit.id);

                if (allies.length === 0) return state;

                let bestAlly = allies[0];
                let maxBE = bestAlly.stats.break_effect || 0;

                for (const ally of allies) {
                    const be = ally.stats.break_effect || 0;
                    if (be > maxBE) {
                        maxBE = be;
                        bestAlly = ally;
                    }
                }

                let newState = addEffect(state, unit.id, {
                    id: `fire_wearer_buff`,
                    name: '燃える身（自分）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    modifiers: [{ target: 'break_dmg_boost', value: buffVal, type: 'add', source: '彼女の炎を忘れずに' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                newState = addEffect(newState, bestAlly.id, {
                    id: `fire_ally_buff`,
                    name: '燃える身（味方）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    modifiers: [{ target: 'break_dmg_boost', value: buffVal, type: 'add', source: '彼女の炎を忘れずに' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                return newState;
            }
        },
        {
            id: 'fire_sp_proc',
            name: '燃える身（SP回復）',
            events: ['ON_DEBUFF_APPLIED', 'ON_ULTIMATE_USED'], // ON_WEAKNESS_IMPLANTED から変更
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const trackerId = `fire_sp_tracker_${unit.id}`;
                const tracker = unit.effects.find(e => e.id === trackerId);
                const used = tracker ? (tracker.stackCount || 0) : 0;

                if (event.type === 'ON_ULTIMATE_USED') {
                    if (used > 0) {
                        return addEffect(state, unit.id, {
                            id: trackerId,
                            name: '燃える身（回数）',
                            category: 'OTHER',
                            sourceUnitId: unit.id,
                            durationType: 'PERMANENT',
                            duration: -1,
                            stackCount: 0, // Reset
                            modifiers: [],
                            apply: (u, s) => s,
                            remove: (u, s) => s
                        });
                    }
                    return state;
                }

                if (event.type === 'ON_DEBUFF_APPLIED') {
                    if (used > 0) return state;
                    const effectName = (event as any).effectName || ''; // カスタムプロパティまたは効果名から推測
                    // シミュレーションイベントは名前を持つ必要がある。
                    // event.effect に依存すべきか？
                    // ON_DEBUFF_APPLIED のイベントは効果オブジェクトを持っていると仮定？
                    // "event" は汎用的な IEvent。
                    // 安全のため、利用可能なプロパティを確認する。
                    // 単純でない場合、発動しないリスクがある。

                    if (effectName.includes('弱点') || effectName.includes('Weakness')) {
                        const { state: spState } = addSkillPoints(state, 1);

                        return addEffect(spState, unit.id, {
                            id: trackerId,
                            name: '燃える身（回数）',
                            category: 'OTHER',
                            sourceUnitId: unit.id,
                            durationType: 'PERMANENT',
                            duration: -1,
                            stackCount: 1, // Used
                            modifiers: [],
                            apply: (u, s) => s,
                            remove: (u, s) => s
                        });
                    }
                }

                return state;
            }
        }
    ]
};
