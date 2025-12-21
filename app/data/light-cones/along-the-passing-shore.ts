import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const alongThePassingShore: ILightConeData = {
    id: 'along-the-passing-shore',
    name: '流れ逝く岸を歩いて',
    description: '装備キャラの会心ダメージ+36%。装備キャラの攻撃が敵に命中する時、敵を「泡影」状態にする、1ターン継続。この効果は装備キャラが攻撃を行うたびに、敵それぞれに1回まで発動できる。「泡影」状態の敵に対する装備キャラの与ダメージ+24%、さらに必殺技の与ダメージ+24%。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。装備キャラの攻撃が敵に命中する時、敵を「泡影」状態にする...「泡影」状態の敵に対する装備キャラの与ダメージ+{1}%、さらに必殺技の与ダメージ+{2}%。',
    descriptionValues: [
        ['36', '24', '24'],
        ['42', '28', '28'],
        ['48', '32', '32'],
        ['54', '36', '36'],
        ['60', '40', '40']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 1058,
        atk: 635,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'shore_cd',
            name: '渡し守（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.36, 0.42, 0.48, 0.54, 0.60]
        }
    ],
    eventHandlers: [
        // 1. 命中時に泡影を付与
        {
            id: 'shore_apply_mirage',
            name: '渡し守（泡影付与）',
            events: ['ON_DAMAGE_DEALT'], // 命中時
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event)) return state;
                const targetId = event.targetId as string;

                // "装備キャラが攻撃を行うたびに、敵それぞれに1回まで発動できる"
                // 多段ヒットの場合、最初のヒットのみ適用。
                // このアクション内で、この敵に既に泡影を付与したか確認する必要がある。
                // Stateは現在のアクションの「泡影付与済みターゲット」を追跡する必要がある。
                // しかし、泡影はデバフである。既にある場合、更新（持続時間リセット）は問題ない。
                // "敵それぞれに1回"という制約は、主に冗長なログ/発動を防ぐためのものであれば意味がある。
                // 単に更新するだけなら通常は安全。

                return addEffect(state, targetId, {
                    id: `shore_mirage_${targetId}`,
                    name: '泡影',
                    category: 'DEBUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 1,
                    stackCount: 1,
                    modifiers: [], // マーカー
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        // 2. 泡影に対する与ダメージボーナス
        {
            id: 'shore_dmg_boost',
            name: '渡し守（与ダメUP）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (!dmgEvent.targetId) return state;

                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                const hasMirage = target.effects.some(e => e.name === '泡影');
                if (hasMirage) {
                    const bonus = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];
                    // 基礎与ダメージ+24%（全属性）
                    let newMods = { ...state.damageModifiers };
                    newMods.allTypeDmg = (newMods.allTypeDmg || 0) + bonus;

                    // 必殺技与ダメージ+24%
                    // `ultDmg` モディファイア（新しくサポートされた）に追加可能
                    newMods.ultDmg = (newMods.ultDmg || 0) + bonus;

                    return {
                        ...state,
                        damageModifiers: newMods
                    };
                }

                return state;
            }
        }
    ]
};
