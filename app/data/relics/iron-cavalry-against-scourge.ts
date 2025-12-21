import { RelicSet } from '../../types';
import { createUnitId } from '../../simulator/engine/unitId';

/**
 * 蝗害を一掃せし鉄騎
 * 2セット: 撃破特効+16%
 * 4セット: 装備キャラの撃破特効が150%以上の時、敵に与える弱点撃破ダメージが防御力を10%無視する。
 *          装備キャラの撃破特効が250%以上の時、さらに敵に与える超撃破ダメージが防御力を15%無視する。
 */
export const IRON_CAVALRY_AGAINST_SCOURGE: RelicSet = {
    id: 'iron_cavalry_against_scourge',
    name: '蝗害を一掃せし鉄騎',
    setBonuses: [
        {
            pieces: 2,
            description: '撃破特効+16%。',
            passiveEffects: [
                {
                    stat: 'break_effect',
                    value: 0.16,
                    target: 'self'
                }
            ],
        },
        {
            pieces: 4,
            description: '装備キャラの撃破特効が150%以上の時、敵に与える弱点撃破ダメージが防御力を10%無視する。装備キャラの撃破特効が250%以上の時、さらに敵に与える超撃破ダメージが防御力を15%無視する。',
            eventHandlers: [
                {
                    // 弱点撃破ダメージ/超撃破ダメージに対して防御無視
                    // Note: ON_WEAKNESS_BREAKイベントでdef_ignoreを適用
                    events: ['ON_WEAKNESS_BREAK'],
                    handler: (event, state, sourceUnitId) => {
                        if (event.sourceId !== sourceUnitId) return state;

                        const source = state.registry.get(createUnitId(sourceUnitId));
                        if (!source) return state;

                        const breakEffect = source.stats.break_effect || 0;
                        let defIgnore = 0;

                        // 撃破特効150%以上で弱点撃破ダメージが防御10%無視
                        if (breakEffect >= 1.5) {
                            defIgnore += 0.1;
                        }

                        // 撃破特効250%以上でさらに超撃破ダメージも防御15%無視
                        // 超撃破は別途ON_BEFORE_DAMAGE_CALCULATIONで処理
                        if (breakEffect >= 2.5) {
                            defIgnore += 0.15;
                        }

                        if (defIgnore === 0) return state;

                        return {
                            ...state,
                            damageModifiers: {
                                ...state.damageModifiers,
                                defIgnore: (state.damageModifiers.defIgnore || 0) + defIgnore
                            }
                        };
                    }
                }
            ],
        },
    ],
};
