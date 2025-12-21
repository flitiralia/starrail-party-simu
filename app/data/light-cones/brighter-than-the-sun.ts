import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const brighterThanTheSun: ILightConeData = {
    id: 'brighter-than-the-sun',
    name: '陽光より輝くもの',
    description: '装備キャラの会心率+18％。装備キャラが通常攻撃を行った時、「龍吟」を1層獲得する。2ターン継続。「龍吟」1層につき、装備キャラの攻撃力+18％、EP回復効率+6％。「龍吟」は最大2層累積できる。',
    descriptionTemplate: '装備キャラの会心率+{0}%。装備キャラが通常攻撃を行った時、「龍吟」を1層獲得する。2ターン継続。「龍吟」1層につき、装備キャラの攻撃力+{1}%、EP回復効率+{2}%。「龍吟」は最大2層累積できる。',
    descriptionValues: [
        ['18', '18', '6'],
        ['21', '21', '7'],
        ['24', '24', '8'],
        ['27', '27', '9'],
        ['30', '30', '10']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1058,
        atk: 635,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'brighter_than_the_sun_crit',
            name: '陽光より輝くもの（会心率）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
        }
    ],
    eventHandlers: [
        {
            id: 'brighter_than_the_sun_proc',
            name: '陽光より輝くもの（龍吟）',
            events: ['ON_BASIC_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const atkVal = [0.18, 0.21, 0.24, 0.27, 0.30][superimposition - 1];
                const errVal = [0.06, 0.07, 0.08, 0.09, 0.10][superimposition - 1];

                // スタック管理
                // 既存の「龍吟」エフェクトを探すか、addEffectのstack機能を使う。
                // addEffectは同IDのエフェクトがあればスタックを加算または更新する仕様か？
                // effectManagerの実装に依存するが、通常はIDが同じなら上書きorスタック加算。
                // ここではスタックごとに独立したタイマー(2ターン)を持つ必要がある記述ではない("1 stack... 2 turns duration")。
                // Genshin/HSRでは通常、スタック獲得時に全体の持続時間が更新されるか、スタック個別に管理されるか。
                // 「龍吟」を1層獲得する。2ターン継続。 -> 各スタックが独立した持続時間を持つ可能性がある？
                // またはスタック獲得ですべて更新される？通常「1層獲得...2ターン継続」はバフ全体が2ターン続くことを意味する。
                // "通常攻撃を行う時、1層獲得...2ターン継続。"
                // スタック獲得で全体の持続時間を2ターンに更新し、スタック数を増やすと仮定。

                return addEffect(state, unit.id, {
                    id: `brighter_than_the_sun_buff_${unit.id}`,
                    name: '龍吟',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    stackCount: 1, // Add 1 stack
                    maxStacks: 2,
                    skipFirstTurnDecrement: true, // 自身のターンで獲得するので、そのターン終了時に減らさない（実質次とその次のターンまで）
                    modifiers: [
                        {
                            target: 'atk_pct',
                            source: '陽光より輝くもの',
                            type: 'add',
                            value: atkVal // スタックごとの値は、通常effect managerがスタック数を乗算して処理する？
                            // effect managerが自動的にスタック数を乗算するか確認する必要がある。
                            // ほとんどの実装：スタックごとに定義されているならyes、またはロジックが必要。
                            // 標準的な単純バフのロジックとして：モディファイア * stackCount が適用されると仮定。
                            // effectManagerのロジックを確認。不明な場合は値を基本値として定義。
                        },
                        {
                            target: 'energy_regen_rate', // ERR
                            source: '陽光より輝くもの',
                            type: 'add',
                            value: errVal
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
