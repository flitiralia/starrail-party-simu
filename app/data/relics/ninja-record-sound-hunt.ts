import { RelicSet } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { HpConsumeEvent } from '../../simulator/engine/types';

export const NINJA_RECORD_SOUND_HUNT: RelicSet = {
    id: 'ninja_record_sound_hunt',
    name: '忍事録・音律狩猟',
    setBonuses: [
        {
            pieces: 2,
            description: '最大HP+12%。',
            passiveEffects: [
                {
                    stat: 'hp_pct',
                    value: 0.12,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: 'HPが変化（回復、消費、被ダメージ）した時、会心ダメージ+16%。2ターン継続。最大2層累積できる。',
            eventHandlers: [
                {
                    events: ['ON_UNIT_HEALED', 'ON_AFTER_HIT', 'ON_HP_CONSUMED'],
                    handler: (event, state, sourceUnitId) => {
                        let shouldTrigger = false;

                        // HP回復時
                        if (event.type === 'ON_UNIT_HEALED') {
                            if (event.targetId === sourceUnitId) shouldTrigger = true;
                        }
                        // HP消費時
                        else if (event.type === 'ON_HP_CONSUMED') {
                            // IEvent doesn't explicitly guarantee HpConsumeEvent here without checking type,
                            // but event.type check ensures it. Cast for safety if needed,
                            // but IEvent union has HpConsumeEvent now, so access to targetId matches.
                            if (event.targetId === sourceUnitId) shouldTrigger = true;
                        }
                        // 被ダメージ時（ON_AFTER_HIT）
                        else if (event.type === 'ON_AFTER_HIT') {
                            if (event.targetId === sourceUnitId) shouldTrigger = true;
                        }

                        if (!shouldTrigger) return state;

                        // バフエフェクトを付与
                        const effect: IEffect = {
                            id: 'ninja-sound-hunt-crit-dmg',
                            name: '忍事録・音律狩猟',
                            category: 'BUFF',
                            sourceUnitId: sourceUnitId,
                            durationType: 'TURN_END_BASED',
                            skipFirstTurnDecrement: true, // ターン中発動ならそのターンは消費しない
                            duration: 2,
                            stackCount: 1,
                            maxStacks: 2,
                            modifiers: [
                                {
                                    target: 'crit_dmg',
                                    source: '忍事録・音律狩猟',
                                    type: 'add',
                                    value: 0.16
                                }
                            ],
                            apply: (t, s) => s,
                            remove: (t, s) => s
                        };

                        return addEffect(state, sourceUnitId, effect);
                    }
                }
            ],
        },
    ],
};
