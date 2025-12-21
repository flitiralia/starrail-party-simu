import { ILightConeData, UnitId } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const whereaboutsShouldDreamsRest: ILightConeData = {
    id: 'whereabouts-should-dreams-rest',
    name: '夢が帰り着く場所',
    description: '装備キャラの撃破特効+60%。装備キャラが敵に弱点撃破ダメージを与える時、敵に「敗走」状態を付与する、2ターン継続。「敗走」状態の敵は速度-20%、装備キャラから受ける弱点撃破ダメージ+24%。同系統のスキルは累積できない。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%。装備キャラが敵に弱点撃破ダメージを与える時、敵に「敗走」状態を付与する、2ターン継続。「敗走」状態の敵は速度-{1}%、装備キャラから受ける弱点撃破ダメージ+{2}%。同系統のスキルは累積できない。',
    descriptionValues: [
        ['60', '20', '24.0'],
        ['70', '20', '28.0'],
        ['80', '20', '32.0'],
        ['90', '20', '36.0'],
        ['100', '20', '40.0']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1164,
        atk: 476,
        def: 529,
    },
    passiveEffects: [
        {
            id: 'whereabouts_break_effect',
            name: '夢が帰り着く場所（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.60, 0.70, 0.80, 0.90, 1.00]
        }
    ],
    eventHandlers: [
        {
            id: 'routed_debuff_application',
            name: '敗走付与',
            events: ['ON_WEAKNESS_BREAK'],
            handler: (event, state, unit, superimposition) => {
                // イベントがtargetIdを持っているか確認する。WeaknessBreakEventは持っている。
                if (event.type !== 'ON_WEAKNESS_BREAK' && event.type !== 'ON_DAMAGE_DEALT') return state;
                if (event.sourceId !== unit.id) return state;

                // ダメージタイプが撃破ダメージを意味するか確認
                let isBreakDamage = false;
                if (event.type === 'ON_WEAKNESS_BREAK') {
                    isBreakDamage = true;
                }
                // 型安全のためにイベントリストから削除したため、以前の ON_DAMAGE_DEALT ロジックは削除された？
                // 待って、テキストは「弱点撃破ダメージを与える時」と言っている。
                // 弱点撃破イベントは撃破時に発生する。
                // 超撃破は DamageDealt 経由で発生する。
                // ON_DAMAGE_DEALT をリッスンする場合、`event.damageType` を確認する必要がある。
                // `event` が DamageDealtEvent にキャスト可能であると仮定する。

                if (!isBreakDamage) return state;

                // targetIdへの安全なアクセス？
                // WeaknessBreakEvent は targetId を持っている。
                const targetId = 'targetId' in event ? event.targetId : null;
                if (!targetId) return state;

                // const breakDmgVuln = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];

                return addEffect(state, targetId as unknown as UnitId, {
                    id: `routed_debuff_${targetId}`,
                    name: '敗走',
                    category: 'DEBUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    modifiers: [
                        {
                            target: 'spd_pct',
                            source: '夢が帰り着く場所',
                            type: 'add',
                            value: -0.20
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'routed_damage_boost',
            name: '敗走（ダメージ増加）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event) || !event.targetId) return state;

                const target = state.registry.get(event.targetId as unknown as UnitId);
                const hasRouted = target?.effects.some(e => e.name === '敗走');

                if (hasRouted) {
                    const breakDmgVuln = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];
                    state.damageModifiers.allTypeDmg = (state.damageModifiers.allTypeDmg || 0) + breakDmgVuln;
                }
                return state;
            }
        }
    ]
};
