import { ILightConeData } from '@/app/types';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const THE_GREAT_COSMIC_ENTERPRISE: ILightConeData = {
    id: 'the-great-cosmic-enterprise',
    name: '宇宙一の大商い！',
    description: '装備キャラの攻撃力+8%。敵が持つ異なる弱点属性1つにつき、装備キャラがその敵に与えるダメージ+4%。弱点属性は最大7つまでカウントされる。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。敵が持つ異なる弱点属性1つにつき、装備キャラがその敵に与えるダメージ+{1}%。弱点属性は最大7つまでカウントされる。',
    descriptionValues: [
        ['8', '4'],
        ['10', '5'],
        ['12', '6'],
        ['14', '7'],
        ['16', '8']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'best-business-atk',
            name: '宇宙一の大商い！',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.08, 0.10, 0.12, 0.14, 0.16]
        }
    ],
    eventHandlers: [
        {
            id: 'best-business-dynamic-dmg',
            name: '宇宙一の大商い！（弱点数与ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (!dmgEvent.targetId) return state;

                // ...
                const target = state.registry.get(createUnitId(dmgEvent.targetId));
                if (!target) return state;

                // 弱点数をカウント
                const weaknessCount = Math.min(target.weaknesses.size, 7);
                const buffPerWeakness = [0.04, 0.05, 0.06, 0.07, 0.08][superimposition - 1];
                const totalBuff = weaknessCount * buffPerWeakness;

                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + totalBuff
                    }
                };
            }
        }
    ]
};
