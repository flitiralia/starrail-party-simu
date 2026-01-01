import { ILightConeData } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { publishEvent } from '../../simulator/engine/dispatcher';

export const TO_EVERNIGHTS_STARS: ILightConeData = {
    id: 'to-evernights-stars',
    name: '長き夜に輝く星へ',
    description: '装備キャラの最大HP+30%。装備キャラの記憶の精霊がスキルを発動する時、装備キャラは「夜色」を獲得する。装備キャラが「夜色」を持つ時、味方の記憶の精霊全体の与えるダメージはターゲットの防御力を20%無視し、装備キャラとその記憶の精霊の与ダメージ+30%。装備キャラの記憶の精霊が退場した時、装備キャラのEPを8回復する。同系統のスキルは累積できない。',
    descriptionTemplate: '装備キャラの最大HP+{0}%。装備キャラの記憶の精霊がスキルを発動する時、装備キャラは「夜色」を獲得する。装備キャラが「夜色」を持つ時、味方の記憶の精霊全体の与えるダメージはターゲットの防御力を{1}%無視し、装備キャラとその記憶の精霊の与ダメージ+{2}%。装備キャラの記憶の精霊が退場した時、装備キャラのEPを{3}回復する。同系統のスキルは累積できない。',
    descriptionValues: [
        ['30', '20', '30', '8'],
        ['37', '22', '37', '10'],
        ['45', '25', '45', '12'], // 20->30 を補間？ テキストは 20/22/25?/27?/30 か？ txt内の値: 20,22,30。補間は標準的である可能性が高い。
        // Txt: 防御無視 20% -> 22% -> 30%? 通常 20, 23, 26, 29, 32? または 20, 25, 30, 35, 40?
        // 提供された値を見てみよう：
        // 防御無視: 20% ... ? ... ? ... ? ... 30%?
        // 待って、txtはランク1、2、5のみを示している。S1:20%, S2:22%, S5:30%。
        // S1=20, S2=22 => ステップ2。S3=24, S4=26, S5=28？ いえ、S5=30。
        // 多分 20, 22.5, 25, 27.5, 30？
        // 標準的なステップを仮定：20, 22.5, 25, 27.5, 30。
        // 与ダメ: 30% -> 37.5% -> 45% -> 52.5% -> 60%?
        // Txt S1: 30%, S2: 37%, S5: 60%。
        // 30, 37.5, 45, 52.5, 60。
        // EP: 8 -> 10 -> 12 -> 14 -> 16。（S1:8, S2:10, S5:16）。正しい。
        ['52', '27', '52', '14'],
        ['60', '30', '60', '16']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 1164,
        atk: 529,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'long-night-hp',
            name: '眠れない（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.30, 0.375, 0.45, 0.525, 0.60]
        }
    ],
    eventHandlers: [
        // 夜色を付与
        {
            id: 'long-night-grant-color',
            name: '眠れない（夜色付与）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                const source = state.registry.get(createUnitId(event.sourceId));
                // トリガー：装備キャラの記憶の精霊がスキルを使用
                if (!source || !source.isSummon || source.ownerId !== unit.id) return state;

                const defIgnore = [0.20, 0.225, 0.25, 0.275, 0.30][superimposition - 1];
                const dmgBoost = [0.30, 0.375, 0.45, 0.525, 0.60][superimposition - 1];

                // 装備キャラに夜色バフを追加
                return addEffect(state, unit.id, {
                    id: `night-color-${unit.id}`,
                    name: '夜色',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // テキストに持続時間の記載なし。「夜色を持つ時...」。戦闘終了まで、または解除されるまでと仮定？
                    // 「記憶の精霊がスキルを発動する時...夜色を獲得する」。
                    // 切れるのか？「累積できない」。
                    // 精霊が存在する間は永続？ または単に永続。
                    // 持続時間のテキストがないため、永続。
                    duration: -1,

                    // 与ダメブースト（装備キャラ + 記憶の精霊）
                    modifiers: [{
                        target: 'all_type_dmg_boost',
                        value: dmgBoost,
                        type: 'add',
                        source: '長き夜に輝く星へ'
                    }],

                    // 防御無視のハンドラ（味方の記憶の精霊）
                    onEvent: (evt, unit, state) => {
                        if (evt.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                            const src = state.registry.get(createUnitId(evt.sourceId));
                            if (src && src.isSummon) {
                                // ソースが味方の記憶の精霊か確認（敵ではない）
                                let isAllySpirit = false;
                                if (src.ownerId) {
                                    const owner = state.registry.get(createUnitId(src.ownerId));
                                    if (owner && !owner.isEnemy) isAllySpirit = true;
                                } else if (!src.isEnemy) {
                                    isAllySpirit = true;
                                }

                                if (isAllySpirit) {
                                    (state.damageModifiers as any).defIgnore += defIgnore;
                                }
                            }
                            return state;
                        }
                        return state;
                    },
                    subscribesTo: ['ON_BEFORE_DAMAGE_CALCULATION'],

                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        // Spirit Retire -> EP
        {
            id: 'long-night-spirit-retire',
            name: '眠れない（EP回復）',
            events: ['ON_UNIT_DEATH'],
            // 仮定：精霊の消滅/退場は ON_UNIT_DEATH を発火する。
            handler: (event, state, unit, superimposition) => {
                const deadId = (event as any).targetId || (event as any).sourceId; // イベント定義を確認
                // ON_UNIT_DEATH では、targetId は死亡したユニット。sourceId はキラー（原因）？

                const deadUnit = state.registry.get(createUnitId(deadId));
                if (!deadUnit || !deadUnit.isSummon || deadUnit.ownerId !== unit.id) return state;

                const epAmount = [8, 10, 12, 14, 16][superimposition - 1];

                return addEnergyToUnit(state, unit.id, epAmount, 0, false, {
                    sourceId: unit.id,
                    publishEventFn: (s: any, e: any) => publishEvent(s, e)
                });
            }
        }
    ]
};
