import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { addSkillPoints } from '@/app/simulator/engine/sp';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';

export const pastSelfInMirror: ILightConeData = {
    id: 'past-self-in-mirror',
    name: '鏡の中の私',
    description: '装備キャラの撃破特効+60%。装備キャラが必殺技を発動した後、味方の与ダメージ+24%。3ターン継続。また、装備キャラの撃破特効が150%以上の場合、SPを1回復。各ウェーブ開始時、味方のEPを10.0回復する。同系統のスキルは重ねがけ不可。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%。装備キャラが必殺技を発動した後、味方の与ダメージ+{1}%。3ターン継続。また、装備キャラの撃破特効が150%以上の場合、SPを1回復。各ウェーブ開始時、味方のEPを{2}回復する。同系統のスキルは重ねがけ不可。',
    descriptionValues: [
        ['60', '24', '10.0'],
        ['70', '28', '12.5'],
        ['80', '32', '15.0'],
        ['90', '36', '17.5'],
        ['100', '40', '20.0']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 1058,
        atk: 529,
        def: 529,
    },
    passiveEffects: [
        {
            id: 'past-self-be',
            name: '鏡の中の私（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.60, 0.70, 0.80, 0.90, 1.00]
        }
    ],
    eventHandlers: [
        {
            id: 'past-self-ult-effect',
            name: '鏡の中の私（必殺技効果）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                let newState = state;

                // 1. 全味方の与ダメージバフ
                const dmgBuff = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];
                const allies = state.registry.getAliveAllies();

                for (const ally of allies) {
                    newState = addEffect(newState, ally.id, {
                        id: `past_self_dmg_${ally.id}`, // 味方ごとに固有？ それともスタックしない共有ID？
                        // "同系統のスキルは重ねがけ不可"。
                        // もし2人のルアン・メェが使用したら？（パーティ内では不可能だが仮定の話）。
                        // 通常はユーザーごとに異なるIDだが、LCタイプごとに共有IDかもしれない？
                        // 今のところ標準的なユニットごとのIDを使用する。
                        name: '徹骨梅香（与ダメージ）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 3,
                        stackCount: 1,
                        modifiers: [{ target: 'all_type_dmg_boost', value: dmgBuff, type: 'add', source: '鏡の中の私' }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                // 2. SP回復 (撃破特効 >= 150% の場合)
                const be = unit.stats.break_effect || 0;
                if (be >= 1.50) {
                    newState = addSkillPoints(newState, 1).state;
                }

                return newState;
            }
        },
        {
            id: 'past-self-wave-start',
            name: '鏡の中の私（ウェーブ開始時EP）',
            events: ['ON_BATTLE_START'], // 定義されていないため ON_WAVE_START を削除
            handler: (event, state, unit, superimposition) => {
                // "各ウェーブ開始時"。
                // 正しくトリガーされるようにする必要がある。
                // ON_WAVE_START が存在すると仮定するか、最初のウェーブに対して ON_BATTLE_START に依存する。
                // もしディスパッチャーで「次のウェーブ」用 ON_WAVE_START が実装されていない場合、これは戦闘開始時のみ機能する可能性がある。

                const epRestore = [10.0, 12.5, 15.0, 17.5, 20.0][superimposition - 1];
                const allies = state.registry.getAliveAllies();

                let newState = state;
                for (const ally of allies) {
                    newState = addEnergyToUnit(newState, ally.id, epRestore);
                }

                return newState;
            }
        }
    ]
};
