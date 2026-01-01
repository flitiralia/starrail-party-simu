import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const poisedToBloom: ILightConeData = {
    id: 'poised-to-bloom',
    name: '美しき華よ今咲かん',
    description: '装備キャラの攻撃力+16%。戦闘に入る時、パーティに同じ運命の味方が2名以上いる場合、それらの味方の会心ダメージ+16%。同系統のスキルは重ね掛け不可。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。戦闘に入る時、パーティに同じ運命の味方が2名以上いる場合、それらの味方の会心ダメージ+{1}%。',
    descriptionValues: [
        ['16', '16'],
        ['20', '20'],
        ['24', '24'],
        ['28', '28'],
        ['32', '32']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'poised-to-bloom-atk',
            name: '美しき華よ今咲かん（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'poised-to-bloom-path-check',
            name: '美しき華よ今咲かん（運命チェック）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                // "同じ運命の味方が2名以上いる場合"。
                // これは「装備者と同じ運命」を意味するのか？
                // それとも「任意の2人の味方が同じ運命」か？
                // テキスト：「パーティに同じ運命の味方が2名以上いる場合、それらの味方の会心ダメージ...」。
                // 通常は「装備者の運命」を意味する。
                // 「同じ運命」は通常、使用法または文脈に関連している。
                // 「装備者と同じ運命」と仮定する。
                // 装備者は調和。
                // したがって「調和キャラが2名以上の場合」。

                const allies = state.registry.getAliveAllies();
                const harmonyCount = allies.filter(a => a.path === 'Harmony').length;
                // 待って、「同じ運命」ロジックは通常、チェックの特定の運命を指す。
                // 「任意のペア」を意味する場合、「各ペアごとに」と言うだろう。
                // 「同じ運命の味方が2名以上いる場合...」と言っている。
                // JP: "パーティに同じ運命の味方が2名以上いる場合"。
                // 通常は「装備者と同じ」を示唆する。
                // 装備者の運命一致をチェックする実装にする。

                if (harmonyCount >= 2) {
                    const cdBuff = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];
                    // 誰に適用する？「それらの味方」（同じ運命の者）。
                    let newState = state;
                    allies.filter(a => a.path === 'Harmony').forEach(ally => {
                        newState = addEffect(newState, ally.id, {
                            id: `poised_to_bloom_cd_${ally.id}`,
                            name: '忘れることなかれ（会心ダメ）',
                            category: 'BUFF',
                            sourceUnitId: unit.id,
                            durationType: 'PERMANENT',
                            duration: -1,
                            stackCount: 1,
                            modifiers: [{ target: 'crit_dmg', value: cdBuff, type: 'add', source: '美しき華よ今咲かん' }],
                            apply: (u, s) => s,
                            remove: (u, s) => s
                        });
                    });
                    return newState;
                }

                return state;
            }
        }
    ]
};
