import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const inTheNameOfTheWorld: ILightConeData = {
    id: 'in-the-name-of-the-world',
    name: '世界の名を以て',
    description: 'デバフ状態の敵に対して、装備キャラの与ダメージ+24%。装備キャラが戦闘スキルを発動した時、その攻撃の効果命中+18%、攻撃力+24%。',
    descriptionTemplate: 'デバフ状態の敵に対して、装備キャラの与ダメージ+{0}%。装備キャラが戦闘スキルを発動した時、その攻撃の効果命中+{1}%、攻撃力+{2}%。',
    descriptionValues: [
        ['24', '18', '24'],
        ['28', '21', '28'],
        ['32', '24', '32'],
        ['36', '27', '36'],
        ['40', '30', '40']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [],
    eventHandlers: [
        // 1. 対デバフダメージ（動的）
        {
            id: 'world-dmg-vs-debuff',
            name: '世界の名を以て（デバフ特効）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (!dmgEvent.targetId) return state;

                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                // ターゲットがデバフを持っているかチェック
                const hasDebuff = target.effects.some(e => e.category === 'DEBUFF');
                if (hasDebuff) {
                    const dmgBoost = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];
                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + dmgBoost
                        }
                    };
                }
                return state;
            }
        },
        // 2. スキルバフ（効果命中 & 攻撃力）
        {
            id: 'world-skill-buff',
            name: '世界の名を以て（スキル強化）',
            events: ['ON_BEFORE_ACTION', 'ON_ACTION_COMPLETE'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // アクションタイプをチェック: SKILLであるべき
                // `event` は通常、すべてのイベントの一般的なインターフェースで `actionType` に簡単にアクセスできないが、
                // ON_BEFORE_ACTION には `actionType` がある。

                if (event.type === 'ON_BEFORE_ACTION') {
                    const actionEvent = event as import('@/app/simulator/engine/types').BeforeActionEvent;
                    if (actionEvent.actionType === 'SKILL') {
                        const ehrBuff = [0.18, 0.21, 0.24, 0.27, 0.30][superimposition - 1];
                        const atkBuff = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];

                        return addEffect(state, unit.id, {
                            id: `in_the_name_of_the_world_skill_buff_${unit.id}`,
                            name: '世界の名を以て（スキルバフ）',
                            category: 'BUFF',
                            sourceUnitId: unit.id,
                            durationType: 'TURN_END_BASED', // このアクションのための一時的なもの
                            duration: 0, // 手動で削除するか、0ターン持続にするか？
                            // ACTION_COMPLETE での手動削除が「この攻撃の間」としてはより安全である。
                            stackCount: 1,
                            modifiers: [
                                { target: 'effect_hit_rate', value: ehrBuff, type: 'add', source: '世界の名を以て' },
                                { target: 'atk_pct', value: atkBuff, type: 'add', source: '世界の名を以て' }
                            ],
                            apply: (u, s) => s,
                            remove: (u, s) => s
                        });
                    }
                }

                if (event.type === 'ON_ACTION_COMPLETE') {
                    // 存在する場合、バフを削除
                    // スキルだったか確認する？それとも安全/クリーンにするために常に削除を試みる？
                    // 常にクリーンアップする。
                    // 注：理想的には自分が追加した場合のみ削除するが、このIDはこのLC/ユニットに固有である。
                    // ON_ACTION_COMPLETE は厳密に同じ方法で actionType を保持していない可能性があるため、ここでは actionType をチェックしない。
                    // そしてクリーンアップを確実に行いたい。
                    const buffId = `in_the_name_of_the_world_skill_buff_${unit.id}`;
                    const hasBuff = unit.effects.some(e => e.id === buffId);
                    if (hasBuff) {
                        const { removeEffect } = require('@/app/simulator/engine/effectManager'); // 循環参照があれば回避するための遅延インポート
                        return removeEffect(state, unit.id, buffId);
                    }
                }

                return state;
            }
        }
    ]
};
