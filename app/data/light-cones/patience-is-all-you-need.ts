import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { createUnitId } from '@/app/simulator/engine/unitId';

export const patienceIsAllYouNeed: ILightConeData = {
    id: 'patience-is-all-you-need',
    name: '待つのみ',
    description: '装備キャラの与ダメージ+24%。装備キャラが攻撃を行った後、速度+4.8%、最大で3層累積できる。装備キャラの攻撃が敵に命中した時、その敵が「遊糸」状態でない場合、100%の基礎確率で敵を「遊糸」状態にする。敵が「遊糸」状態の時、感電状態と見なされる。「遊糸」状態の敵はターンが回ってくるたびに、装備キャラの攻撃力60%分の雷属性持続ダメージを受ける、1ターン継続。',
    descriptionTemplate: '装備キャラの与ダメージ+{0}%。装備キャラが攻撃を行った後、速度+{1}%、最大で3層累積できる。...「遊糸」状態の敵は...装備キャラの攻撃力{2}%分の雷属性持続ダメージを受ける...',
    descriptionValues: [
        ['24', '4.8', '60'],
        ['28', '5.6', '70'],
        ['32', '6.4', '80'],
        ['36', '7.2', '90'],
        ['40', '8.0', '100']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'patience-dmg',
            name: '蜘蛛の巣（与ダメ）',
            category: 'BUFF',
            targetStat: 'all_type_dmg_boost',
            effectValue: [0.24, 0.28, 0.32, 0.36, 0.40]
        }
    ],
    eventHandlers: [
        {
            id: 'patience-speed-stack',
            name: '蜘蛛の巣（速度スタック）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const spdStep = [0.048, 0.056, 0.064, 0.072, 0.08][superimposition - 1];
                const maxStacks = 3;

                const buffId = `patience_speed_${unit.id}`;
                const existing = unit.effects.find(e => e.id === buffId);
                const currentStacks = existing ? (existing.stackCount || 0) : 0;
                const nextStacks = Math.min(currentStacks + 1, maxStacks);

                if (nextStacks === currentStacks) return state;

                return addEffect(state, unit.id, {
                    id: buffId,
                    name: '蜘蛛の巣（速度）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: nextStacks,
                    modifiers: [
                        { target: 'spd_pct', value: spdStep * nextStacks, type: 'add', source: '待つのみ' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'patience-erode',
            name: '蜘蛛の巣（遊糸）',
            events: ['ON_DAMAGE_DEALT'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event)) return state;

                const targetId = createUnitId(event.targetId as string);
                const target = state.registry.get(targetId);
                if (!target) return state;

                const hasErode = target.effects.some(e => e.id.startsWith(`patience_erode_${targetId}`));
                if (!hasErode) {
                    const dotMult = [0.60, 0.70, 0.80, 0.90, 1.00][superimposition - 1];

                    // 厳密な IEffect チェックを回避するために unknown/any にキャスト。エンジンが更新されるまで。
                    // 理想的には IEffect & { dotType?: ... } を使用する。
                    const erodeEffect = {
                        id: `patience_erode_${targetId}`,
                        name: '遊糸',
                        category: 'DEBUFF',
                        type: 'DoT',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 1,
                        stackCount: 1,
                        modifiers: [],
                        // カスタム持続ダメージプロパティ
                        dotType: 'Shock',
                        damageCalculation: 'multiplier',
                        multiplier: dotMult,
                        apply: (u: any, s: any) => s,
                        remove: (u: any, s: any) => s
                    } as any;

                    return addEffect(state, targetId, erodeEffect);
                }
                return state;
            }
        }
    ]
};
