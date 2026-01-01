import { ILightConeData } from '@/app/types';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const passkey: ILightConeData = {
    id: 'passkey',
    name: '霊鍵',
    description: '装備キャラが戦闘スキルを発動した後、さらにEPを8回復する、この効果は1ターンに1回まで発動できる。',
    descriptionTemplate: '装備キャラが戦闘スキルを発動した後、さらにEPを{0}回復する、この効果は1ターンに1回まで発動できる。',
    descriptionValues: [
        ['8'],
        ['9'],
        ['10'],
        ['11'],
        ['12']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 740,
        atk: 370,
        def: 264,
    },
    passiveEffects: [],
    eventHandlers: [
        // 1ターン制限のトラッカー
        {
            id: 'passkey-tracker',
            name: '霊鍵（ターン制限管理）',
            events: ['ON_TURN_START'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // トラッカーをリセット（クールダウン効果を削除）
                const cdInfo = unit.effects.find(e => e.id === `passkey_cd_${unit.id}`);
                if (cdInfo) {
                    return removeEffect(state, unit.id, cdInfo.id);
                }
                return state;
            }
        },
        {
            id: 'passkey-ep',
            name: '霊鍵（EP回復）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // クールダウンをチェック
                const cdInfo = unit.effects.find(e => e.id === `passkey_cd_${unit.id}`);
                if (cdInfo) return state;

                // EPを回復
                const ep = [8, 9, 10, 11, 12][superimposition - 1];
                let newState = addEnergyToUnit(state, unit.id, ep);

                // クールダウンを適用
                newState = addEffect(newState, unit.id, {
                    id: `passkey_cd_${unit.id}`,
                    name: '霊鍵（クールダウン）',
                    category: 'STATUS',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // ターン開始時に手動で削除
                    duration: -1,
                    stackCount: 1,
                    modifiers: [],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                return newState;
            }
        }
    ]
};
