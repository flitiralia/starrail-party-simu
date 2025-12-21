import { ILightConeData } from '@/app/types';

export const fermata: ILightConeData = {
    id: 'fermata',
    name: 'フェルマータ',
    description: '装備キャラの撃破特効+16%。感電状態または風化状態の敵に対する与ダメージ+16%、この効果は持続ダメージにも有効。',
    descriptionTemplate: '装備キャラの撃破特効+{0}%。感電状態または風化状態の敵に対する与ダメージ+{1}%。',
    descriptionValues: [
        ['16', '16'],
        ['20', '20'],
        ['24', '24'],
        ['28', '28'],
        ['32', '32']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'fermata_be',
            name: '休符（撃破特効）',
            category: 'BUFF',
            targetStat: 'break_effect',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'fermata_dmg_cond',
            name: '休符（与ダメ特効）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (!dmgEvent.targetId) return state;

                // ターゲットが感電または風化状態かチェック
                const { createUnitId } = require('@/app/simulator/engine/unitId');
                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                const hasShockOrWind = target.effects.some(e =>
                    e.name.includes('感電') || e.name.includes('風化') ||
                    (e as any).dotType === 'Shock' || (e as any).dotType === 'WindShear' ||
                    e.name.includes('アルカナ') // ブラックスワン互換性
                );

                if (hasShockOrWind) {
                    const dmgBoost = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];
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
        }
    ]
};
