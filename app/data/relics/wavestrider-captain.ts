import { RelicSet } from '../../types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';

/**
 * 荒海を越える船長
 * 2セット: 会心ダメージ+16%
 * 4セット: 装備キャラが他の味方のスキルターゲットになった時、「助力」を1層獲得し、最大で2層累積できる。
 *          必殺技を発動する時、「助力」を2層所持している場合、すべての「助力」を消費し、装備キャラの攻撃力+48%、1ターン継続。
 */
export const WAVESTRIDER_CAPTAIN: RelicSet = {
    id: 'wavestrider-captain',
    name: '荒海を越える船長',
    setBonuses: [
        {
            pieces: 2,
            description: '会心ダメージ+16%。',
            passiveEffects: [
                {
                    stat: 'crit_dmg',
                    value: 0.16,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: '装備キャラが他の味方のスキルターゲットになった時、「助力」を1層獲得し、最大で2層累積できる。必殺技を発動する時、「助力」を2層所持している場合、すべての「助力」を消費し、装備キャラの攻撃力+48%、1ターン継続。',
            eventHandlers: [
                {
                    // 味方のスキル/必殺技のターゲットになった時
                    events: ['ON_SKILL_USED', 'ON_ULTIMATE_USED'],
                    handler: (event, state, sourceUnitId) => {
                        // 自分自身のスキルは対象外
                        if (event.sourceId === sourceUnitId) return state;

                        // ターゲットが装備者かチェック
                        if (event.targetId !== sourceUnitId) return state;

                        // ソースが味方かチェック
                        const source = state.registry.get(createUnitId(event.sourceId));
                        if (!source || source.isEnemy) return state;

                        // 助力スタック追加
                        const assistBuff: IEffect = {
                            id: 'captain-assist-stack',
                            name: '助力（荒海を越える船長）',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'PERMANENT',
                            duration: 999,
                            stackCount: 1,
                            maxStacks: 2,
                            modifiers: [],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        return addEffect(state, sourceUnitId, assistBuff);
                    }
                },
                {
                    // 必殺技発動時、助力2層あれば消費してATK+48%
                    events: ['ON_ULTIMATE_USED'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        const unit = state.registry.get(createUnitId(sourceUnitId));
                        if (!unit) return state;

                        // 助力スタックを確認
                        const assistEffect = unit.effects.find(e => e.id === 'captain-assist-stack');
                        if (!assistEffect || (assistEffect.stackCount || 0) < 2) return state;

                        // 助力を消費
                        let newState = removeEffect(state, sourceUnitId, 'captain-assist-stack');

                        // ATK+48%バフを付与
                        const atkBuff: IEffect = {
                            id: 'captain-atk-boost',
                            name: '荒海を越える船長（攻撃力上昇）',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            skipFirstTurnDecrement: true,
                            duration: 1,
                            modifiers: [
                                {
                                    target: 'atk_pct',
                                    source: '荒海を越える船長',
                                    type: 'add',
                                    value: 0.48
                                }
                            ],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        newState = addEffect(newState, sourceUnitId, atkBuff);

                        return newState;
                    }
                }
            ],
        },
    ],
};
