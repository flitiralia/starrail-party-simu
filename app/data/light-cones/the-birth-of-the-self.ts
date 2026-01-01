import { ILightConeData } from '@/app/types';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const theBirthOfTheSelf: ILightConeData = {
    id: 'the-birth-of-the-self',
    name: '「私」の誕生',
    description: '装備キャラの追加攻撃の与ダメージ+24%。敵の残りHPが50%以下の場合、さらに追加攻撃の与ダメージ+24%。',
    descriptionTemplate: '装備キャラの追加攻撃の与ダメージ+{0}%。敵の残りHPが50%以下の場合、さらに追加攻撃の与ダメージ+{0}%。',
    descriptionValues: [
        ['24'],
        ['30'],
        ['36'],
        ['42'],
        ['48']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'birth-of-self-base-fua',
            name: '「私」の誕生（追加攻撃与ダメ）',
            category: 'BUFF',
            targetStat: 'fua_dmg_boost',
            effectValue: [0.24, 0.30, 0.36, 0.42, 0.48]
        }
    ],
    eventHandlers: [
        {
            id: 'birth-of-self-conditional-fua',
            name: '「私」の誕生（条件付き与ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;

                if (dmgEvent.subType !== 'FOLLOW_UP_ATTACK') return state;
                if (!dmgEvent.targetId) return state;

                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                const hpPct = target.hp / target.stats.hp; // stats内のhpを最大HPと仮定
                if (hpPct <= 0.50) {
                    const bonus = [0.24, 0.30, 0.36, 0.42, 0.48][superimposition - 1];
                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            fuaDmg: (state.damageModifiers.fuaDmg || 0) + bonus
                        }
                    };
                }

                return state;
            }
        }
    ]
};
