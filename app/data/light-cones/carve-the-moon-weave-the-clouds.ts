import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const carveTheMoonWeaveTheClouds: ILightConeData = {
    id: 'carve-the-moon-weave-the-clouds',
    name: '彫月裁雲の意',
    description: '戦闘開始時、および装備キャラのターンが回ってきた時、以下の効果からランダムで1つ発動。この効果が発動されるたび、前回の効果を上書きする。同じ効果は連続で発動されない。',
    descriptionTemplate: '戦闘開始時、および装備キャラのターンが回ってきた時、以下の効果からランダムで1つ発動。この効果が発動されるたび、前回の効果を上書きする。同じ効果は連続で発動されない。効果：味方全体の攻撃力+{0}%、味方全体の会心ダメージ+{1}%、味方全体のEP回復効率+{2}%。',
    descriptionValues: [
        ['10', '12', '6'],
        ['12.5', '15', '7.5'],
        ['15', '18', '9'],
        ['17.5', '21', '10.5'],
        ['20', '24', '12']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'carve-moon-trigger',
            name: '彫月裁雲の意（ランダム効果）',
            events: ['ON_BATTLE_START', 'ON_TURN_START'],
            handler: (event, state, unit, superimposition) => {
                if (event.type === 'ON_TURN_START' && event.sourceId !== unit.id) return state;

                // ロジック:
                // 1. 前回の効果IDを確認（状態に保存または推論）。
                // 2. プールから新しいIDをランダムに選択（前回を除く）。
                // 3. 前回を削除。
                // 4. 新しい効果を味方全体に適用。

                // Effect IDs:
                // 1: carve_moon_atk
                // 2: carve_moon_cd
                // 3: carve_moon_err

                const possible = ['atk', 'cd', 'err'];

                // Find current
                let currentType = '';
                const currentEffect = unit.effects.find(e => e.id.startsWith(`carve_moon_status_${unit.id}`));
                if (currentEffect) {
                    // どこかからタイプを抽出？またはモディファイアを確認？
                    // 可能なら効果名またはカスタムフィールドにタイプを保存？
                    // またはIDをパース: `carve_moon_status_${unit.id}_${type}`。
                    const parts = currentEffect.id.split('_');
                    currentType = parts[parts.length - 1]; // atk, cd, or err
                }

                // 候補フィルタリング
                const candidates = possible.filter(t => t !== currentType);
                if (candidates.length === 0) return state; // 起きるはずがない

                // ランダム選択
                // シミュレータは可能なら決定的であるべき？
                // `Math.random()` はシードを制御しない場合、決定論を壊す。
                // しかし今のところ、厳密にシードされていない限り「シミュレータ」において `Math.random()` は許容される。
                // `Math.random()` を使用する。
                const pick = candidates[Math.floor(Math.random() * candidates.length)];

                let newState = state;

                // 古いものを削除
                if (currentEffect) {
                    newState = removeEffect(newState, unit.id, currentEffect.id);
                    // 味方からのバフも削除（リンクされているか？）
                    // ステータス効果でオーラロジックを使用すれば、削除を処理する。
                    // はい、オーラとして実装。
                }

                // Apply New
                const atkVal = [0.10, 0.125, 0.15, 0.175, 0.20][superimposition - 1];
                const cdVal = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];
                const errVal = [0.06, 0.075, 0.09, 0.105, 0.12][superimposition - 1];

                const modifiers: any[] = [];
                if (pick === 'atk') modifiers.push({ target: 'atk_pct', value: atkVal, type: 'add', source: '彫月裁雲の意' });
                if (pick === 'cd') modifiers.push({ target: 'crit_dmg', value: cdVal, type: 'add', source: '彫月裁雲の意' });
                if (pick === 'err') modifiers.push({ target: 'energy_regen_rate', value: errVal, type: 'add', source: '彫月裁雲の意' });

                newState = addEffect(newState, unit.id, {
                    id: `carve_moon_status_${unit.id}_${pick}`,
                    name: `秘密（${pick}）`,
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // Until replaced
                    duration: -1,
                    stackCount: 1,
                    modifiers: [], // Modifiers applied to allies via Apply
                    apply: (u, s) => {
                        const allies = s.registry.getAliveAllies();
                        let ns = s;
                        allies.forEach(ally => {
                            ns = addEffect(ns, ally.id, {
                                id: `carve_moon_buff_${ally.id}`,
                                name: `秘密（${pick}）`,
                                category: 'BUFF',
                                sourceUnitId: u.id,
                                durationType: 'PERMANENT',
                                duration: -1,
                                stackCount: 1,
                                modifiers: modifiers,
                                apply: (ua, sa) => sa,
                                remove: (ua, sa) => sa
                            });
                        });
                        return ns;
                    },
                    remove: (u, s) => {
                        const allies = s.registry.getAliveAllies();
                        let ns = s;
                        allies.forEach(ally => {
                            ns = removeEffect(ns, ally.id, `carve_moon_buff_${ally.id}`);
                        });
                        return ns;
                    }
                });

                return newState;
            }
        }
    ]
};
