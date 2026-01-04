import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

export const scentAloneStaysTrue: ILightConeData = {
    id: 'scent-alone-stays-true',
    name: '昔日の香りは今も猶',
    description: '装備キャラの撃破特効+60%。装備キャラが必殺技を発動して敵を攻撃した後、その敵を「忘憂」状態にする、2ターン継続。「忘憂」状態の敵が受けるダメージ+10%。装備キャラの撃破特効が150%以上の場合、敵の受けるダメージアップ効果がさらに+8%。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%。装備キャラが必殺技を発動して敵を攻撃した後、その敵を「忘憂」状態にする、2ターン継続。「忘憂」状態の敵が受けるダメージ+{1}%。装備キャラの撃破特効が150%以上の場合、敵の受けるダメージアップ効果がさらに+{2}%。',
    descriptionValues: [
        ['60', '10', '8'],
        ['70', '12', '10'],
        ['80', '14', '12'],
        ['90', '16', '14'],
        ['100', '18', '16']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 1058,
        atk: 529,
        def: 529,
    },

    passiveEffects: [
        {
            id: 'scent-be',
            name: '安心（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.60, 0.70, 0.80, 0.90, 1.00]
        }
    ],

    eventHandlers: [
        {
            id: 'scent-besotted',
            name: '安心（忘憂付与）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                // アクションタイプを確認：必殺技である必要がある
                // ActionEvent は `actionType` を持つか？ いや、通常はイベントの `type` か？
                // `ON_ATTACK` イベントは厳密には `ActionEvent` インターフェースで `actionType` を持たないが、
                // 通常 `state.currentAction` が教えてくれるか、`ActionEvent` が `subType` などを持つ可能性がある。
                // `types.ts` を確認：`ActionEvent` ... `type: 'ON_ATTACK'`。
                // 明示的な `actionType` フィールドはない。
                // 待って、`ActionEvent` の定義：`type: 'ON_SKILL_USED' | ... 'ON_ATTACK' ...`。
                // イベントが `ON_ATTACK` の場合、必殺技かスキルかは不明。
                // しかし `ON_ULTIMATE_USED` をリッスンすることはできる。
                // `ON_ULTIMATE_USED` は必殺技使用時に発火する。
                // それは攻撃ヒットの「後」か「前」か？
                // 通常は攻撃ロジックとは別。
                // 「必殺技を発動して敵を攻撃した後」。
                // `ON_ATTACK` を使用する場合、ソースアクションを知る必要がある。
                // `DamageDealtEvent` には `actionType` がある。
                // `ON_ATTACK` にはないかもしれない。
                // しかし、`state.currentAction` は `UltimateAction` であるはず。
                // `state.currentActionLog`（primaryActionType を持つ）を確認しよう。
                // `state.currentActionLog?.primaryActionType === 'ULTIMATE'` を確認。

                const isUlt = state.currentActionLog?.primaryActionType === 'ULTIMATE';
                if (!isUlt) return state;

                if (!('targetId' in event)) return state;
                const targetId = event.targetId;
                if (!targetId) return state;

                // Effect Values
                const baseVuln = [0.10, 0.12, 0.14, 0.16, 0.18][superimposition - 1];
                const extraVuln = [0.08, 0.10, 0.12, 0.14, 0.16][superimposition - 1];

                // Check BE condition
                const be = unit.stats.break_effect || 0;
                const finalVuln = be >= 1.50 ? (baseVuln + extraVuln) : baseVuln;

                return addEffect(state, targetId, {
                    id: `besotted-${unit.id}-${targetId}`,
                    name: '忘憂',
                    category: 'DEBUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    modifiers: [{
                        target: 'all_dmg_taken_boost', // Vulnerability
                        value: finalVuln,
                        type: 'add',
                        source: '昔日の香りは今も猶'
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
