import { ILightConeData } from '../../types';
import { applyHealing } from '../../simulator/engine/utils';

export const warmthShortensColdNights: ILightConeData = {
    id: 'warmth-shortens-cold-nights',
    name: '暖かい夜は長くない',
    description: '装備キャラの最大HP+16%。通常攻撃または戦闘スキルを発動した後、味方全体のHPをそれぞれの最大HPの2%分回復する。',
    descriptionTemplate: '装備キャラの最大HP+{0}%。通常攻撃または戦闘スキルを発動した後、味方全体のHPをそれぞれの最大HPの{1}%分回復する。',
    descriptionValues: [
        ['16', '2.0'],
        ['20', '2.5'],
        ['24', '3.0'],
        ['28', '3.5'],
        ['32', '4.0']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 1058,
        atk: 370,
        def: 396,
    },

    passiveEffects: [
        {
            id: 'warmth-hp',
            name: '小さな灯火（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],

    eventHandlers: [
        {
            id: 'warmth-heal',
            name: '小さな灯火（全体回復）',
            events: ['ON_BASIC_ATTACK', 'ON_SKILL_USED'], // 通常攻撃またはスキルで発動
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // "使用後..."
                // 通常、ハンドラは "On" イベントで実行される。
                // `applyHealing` を実行すると、即座に発生する。
                // "After" がアクションの厳密に後を意味するか確認する？
                // `ON_BASIC_ATTACK` は通常、アクション実行イベント。
                // シミュレーターの順序：アクション開始 -> アビリティ実行 -> アクション完了。
                // `ON_BASIC_ATTACK` をフックすれば、アクションフェーズ中に実行される。
                // 許容範囲。

                const healPct = [0.02, 0.025, 0.03, 0.035, 0.04][superimposition - 1];

                let newState = state;
                const allies = newState.registry.getAliveAllies();
                for (const ally of allies) {
                    // ターゲットの最大HPに基づいて回復。
                    // `applyHealing` はデフォルトのロジックでソースのステータスを使用する。
                    // 固定回復または動的回復を強制する必要がある。
                    // `applyHealing` は `logic` を受け取る。
                    // `logic.scaling` はソースのステータス。
                    // そのため、手動で固定量を計算する。
                    const amount = ally.stats.hp * healPct;

                    newState = applyHealing(newState, unit.id, ally.id, {
                        scaling: 'hp', // ダミー
                        multiplier: 0,
                        flat: amount
                    }, '暖かい夜は長くない');
                }
                return newState;
            }
        }
    ]
};
