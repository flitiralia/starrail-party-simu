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
                // 仕様: パーティ内で同じ運命の味方が2名以上いる場合、
                // その運命を持つ全員に会心ダメージバフを付与
                // (装備者の運命に依存しない)

                const allies = state.registry.getAliveAllies();
                const cdBuff = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];

                // 各運命ごとにカウント
                const pathCounts = new Map<string, typeof allies>();
                for (const ally of allies) {
                    if (!ally.path) continue;
                    if (!pathCounts.has(ally.path)) {
                        pathCounts.set(ally.path, []);
                    }
                    pathCounts.get(ally.path)!.push(ally);
                }

                let newState = state;

                // 2名以上いる運命のキャラ全員にバフ適用
                for (const [path, pathAllies] of pathCounts.entries()) {
                    if (pathAllies.length >= 2) {
                        for (const ally of pathAllies) {
                            // 重複チェック（同系統スキルは重ね掛け不可）
                            // IDを光円錐名のみにすることで、誰が付与しても重複しない
                            const effectId = 'poised_to_bloom_cd';
                            if (ally.effects.some(e => e.id === effectId)) continue;

                            newState = addEffect(newState, ally.id, {
                                id: effectId,
                                name: '美しき華よ今咲かん（会心ダメ）',
                                category: 'BUFF',
                                sourceUnitId: unit.id,
                                durationType: 'PERMANENT',
                                duration: -1,
                                stackCount: 1,
                                modifiers: [{ target: 'crit_dmg', value: cdBuff, type: 'add', source: '美しき華よ今咲かん' }],
                                apply: (u, s) => s,
                                remove: (u, s) => s
                            });
                        }
                    }
                }

                return newState;
            }
        }
    ]
};
