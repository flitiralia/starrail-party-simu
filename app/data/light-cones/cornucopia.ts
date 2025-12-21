import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const cornucopia: ILightConeData = {
    id: 'cornucopia',
    name: '物穣',
    description: '装備キャラが戦闘スキル、または必殺技を発動した時、治癒量+12%。',
    descriptionTemplate: '装備キャラが戦闘スキル、または必殺技を発動した時、治癒量+{0}%。',
    descriptionValues: [
        ['12'],
        ['15'],
        ['18'],
        ['21'],
        ['24']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 952,
        atk: 264,
        def: 264,
    },

    eventHandlers: [
        // 「術後の会話」と似ているが、スキルと必殺技の両方。
        // 持続時間が指定されていないため、「このアクションの間」を意味する。
        // 一時的なバフ除去として実装？
        // `ON_BEFORE_ACTION`アプローチ、または`ON_SKILL_USED` / `ON_ULTI_USED`に追加する。
        // `ON_SKILL_USED`はアクションの*最中*または*開始時*にトリガーされる。
        // 治癒は*最中*に発生する。
        // したがって、`ON_SKILL_USED`でバフを追加すれば、同じアクション内の後続の治癒ティックに適用されるはず？
        // しかし、シミュレータは標準的な治癒をスキルロジック*内*で処理する。
        // スキルロジックが現在の統計情報*を使用して*治癒を計算する場合、期限付きバフを追加するのは有効。
        // あるいはもっと単純に：ON/OFFを切り替える永続バフ？
        // 「一時的なバフ」戦略。
        {
            id: 'cornucopia-buff',
            name: '繫盛（一時治癒バフ）',
            events: ['ON_SKILL_USED', 'ON_ULTIMATE_USED', 'ON_ACTION_COMPLETE'] as any,
            handler: (event, state, unit, superimposition) => {
                const buffId = `cornucopia-buff-${unit.id}`;
                const boost = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];
                const { addEffect, removeEffect } = require('../../simulator/engine/effectManager');

                if (event.sourceId !== unit.id) return state;

                if (event.type === 'ON_SKILL_USED' || event.type === 'ON_ULTIMATE_USED') {
                    return addEffect(state, unit.id, {
                        id: buffId,
                        name: '物穣（治癒UP）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        modifiers: [{ target: 'outgoing_healing_boost', value: boost, type: 'add', source: '物穣' }],
                        apply: (u: any, s: any) => s,
                        remove: (u: any, s: any) => s
                    });
                }

                if (event.type === 'ON_ACTION_COMPLETE') {
                    return removeEffect(state, unit.id, buffId);
                }

                return state;
            }
        }
    ]
};
