import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const forWhomTheSeaSings: ILightConeData = {
    id: 'for-whom-the-sea-sings',
    name: '海の歌は何がため',
    description: '装備キャラの効果命中+40%。装備キャラが敵にデバフを付与した時、80%の基礎確率でその敵を「魂迷」状態にする。3ターン継続。「魂迷」状態の敵は、装備キャラにデバフを1つ付与されるごとに、受ける持続ダメージ+5.0%、この効果は最大で6層累積できる。味方が「魂迷」状態の敵を攻撃すると、その味方の速度+10.0%、3ターン継続。',
    descriptionTemplate: '装備キャラの効果命中+{0}%...「魂迷」状態の敵は...受ける持続ダメージ+{1}%...味方の速度+{2}%...',
    descriptionValues: [
        ['40', '5.0', '10.0'],
        ['45', '6.0', '12.5'],
        ['50', '7.0', '15.0'],
        ['55', '8.0', '17.5'],
        ['60', '10.0', '20.0']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 952,
        atk: 635,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'sea_sings_ehr',
            name: '独奏（効果命中）',
            category: 'BUFF',
            targetStat: 'effect_hit_rate',
            effectValue: [0.40, 0.45, 0.50, 0.55, 0.60]
        }
    ],
    eventHandlers: [
        {
            id: 'sea_sings_apply',
            name: '独奏（魂迷付与）',
            events: ['ON_DEBUFF_APPLIED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 安全なキャスト / チェック
                const targetIdStr = (event as any).targetId;
                if (!targetIdStr) return state;

                const targetId = createUnitId(targetIdStr); // 型付きIDを使用

                const effectId = (event as any).effectId;
                if (effectId && effectId.includes('sea_sings_confused')) return state;

                // Value per stack
                const step = [0.05, 0.0625, 0.075, 0.0875, 0.10][superimposition - 1];
                const confId = `sea_sings_confused_${targetIdStr}`;

                // 既存のスタック数を取得
                const existing = state.registry.get(targetId)?.effects.find(e => e.id === confId);
                const currentStacks = existing ? (existing.stackCount || 1) : 0;

                // 存在する場合はインクリメント。存在しない場合は1から開始。
                // ロジック: "装備キャラがデバフを付与した時...「魂迷」にする..."。
                // "「魂迷」状態の敵は...デバフを付与されるごとに...受ける持続ダメージ+5.0%"。
                // 魂迷でない場合、適用する（スタック1）。
                // 魂迷の場合、スタックを追加する。

                let nextStacks = currentStacks + 1;
                if (nextStacks > 6) nextStacks = 6;
                // 現在が0（新規）の場合、次は1。

                // モディファイアを計算
                const modifiers = [{
                    target: 'dot_dmg_taken' as const,
                    value: step * nextStacks,
                    type: 'add' as const,
                    source: '海の歌は何がため'
                }];

                return addEffect(state, targetId, {
                    id: confId,
                    name: '魂迷',
                    category: 'DEBUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 3,
                    stackCount: nextStacks,
                    modifiers: modifiers,
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'sea_sings_ally_spd',
            name: '独奏（味方速度）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                // 攻撃した味方なら誰でも
                if (!('targetId' in event)) return state;
                const targetIdStr = event.targetId as string;
                const targetId = createUnitId(targetIdStr);
                const target = state.registry.get(targetId);
                if (!target) return state;

                const hasConfused = target.effects.some(e => e.name === '魂迷');
                if (hasConfused) {
                    const spdVal = [0.10, 0.125, 0.15, 0.175, 0.20][superimposition - 1];
                    const allyIdStr = event.sourceId;
                    const allyId = createUnitId(allyIdStr);

                    return addEffect(state, allyId, {
                        id: `sea_sings_spd_${allyIdStr}`,
                        name: '独奏（速度）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 3,
                        stackCount: 1,
                        modifiers: [{ target: 'spd_pct', value: spdVal, type: 'add', source: '海の歌は何がため' }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return state;
            }
        }
    ]
};
