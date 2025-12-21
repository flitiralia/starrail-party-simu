import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const theSeriousnessOfBreakfast: ILightConeData = {
    id: 'the-seriousness-of-breakfast',
    name: '朝食の儀式感',
    description: '装備キャラの与ダメージ+12%。敵を1体倒すごとに、装備キャラの攻撃力+4%、この効果は最大で3層累積できる。',
    descriptionTemplate: '装備キャラの与ダメージ+{0}%。敵を1体倒すごとに、装備キャラの攻撃力+{1}%、この効果は最大で3層累積できる。',
    descriptionValues: [
        ['12', '4'],
        ['15', '5'],
        ['18', '6'],
        ['21', '7'],
        ['24', '8']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 846,
        atk: 476,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'seriousness_breakfast_dmg',
            name: '朝食の儀式感（与ダメ）',
            category: 'BUFF',
            targetStat: 'all_type_dmg_boost',
            effectValue: [0.12, 0.15, 0.18, 0.21, 0.24]
        }
    ],
    eventHandlers: [
        {
            id: 'seriousness_breakfast_stack',
            name: '朝食の儀式感（攻撃力累積）',
            events: ['ON_ENEMY_DEFEATED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 既存のスタックを検索
                const stackEffect = unit.effects.find(e => e.id === `breakfast_atk_stack_${unit.id}`);
                const currentStacks = stackEffect ? (stackEffect.stackCount || 0) : 0;

                if (currentStacks >= 3) return state;

                const nextStacks = currentStacks + 1;
                const atkPerStack = [0.04, 0.05, 0.06, 0.07, 0.08][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `breakfast_atk_stack_${unit.id}`,
                    name: '朝食の儀式感（攻撃力）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: nextStacks,
                    modifiers: [
                        { target: 'atk_pct', value: atkPerStack * nextStacks, type: 'add', source: '朝食の儀式感' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
