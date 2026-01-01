import { ILightConeData, CooldownResetType, createUnitId } from '@/app/types';
import { removeEffect } from '@/app/simulator/engine/effectManager';

export const returnToDarkness: ILightConeData = {
    id: 'return-to-darkness',
    name: '幽冥に帰す',
    description: '装備キャラの会心率+12%。会心が発生した後、16%の固定確率で攻撃を受けた敵のバフを1つ解除する、この効果は1回の攻撃で1回まで発動できる。',
    descriptionTemplate: '装備キャラの会心率+{0}%。会心が発生した後、{1}%の固定確率で攻撃を受けた敵のバフを1つ解除する、この効果は1回の攻撃で1回まで発動できる。',
    descriptionValues: [
        ['12', '16'],
        ['15', '20'],
        ['18', '24'],
        ['21', '28'],
        ['24', '32']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 846,
        atk: 529,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'return-to-darkness-crit',
            name: '幽冥に帰す（会心率）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.12, 0.15, 0.18, 0.21, 0.24]
        }
    ],
    eventHandlers: [
        {
            id: 'return-to-darkness-dispel',
            name: '幽冥に帰す（バフ解除）',
            events: ['ON_DAMAGE_DEALT'],
            // 「1回の攻撃で1回まで発動」をアクション単位で制限
            // PER_ACTION: ON_ACTION_COMPLETE でクールダウンがリセットされる
            cooldownTurns: 1,
            cooldownResetType: CooldownResetType.PER_ACTION,
            maxActivations: 1,
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 型安全なisCritのチェック
                let isCrit = false;
                if ('isCrit' in event) isCrit = !!(event as any).isCrit;
                if (!isCrit) return state;

                // targetIdのチェック
                let targetId: string | undefined;
                if ('targetId' in event) targetId = (event as any).targetId;
                if (!targetId) return state;

                const dispelChance = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];
                if (Math.random() > dispelChance) return state;

                const targetUnitId = createUnitId(targetId);
                const target = state.registry.get(targetUnitId);
                if (!target) return state;

                // Find buffs on target
                const buffs = target.effects.filter(e => e.category === 'BUFF');
                if (buffs.length === 0) return state;

                // ランダムなバフを1つ削除（または最後に適用されたもの）
                // 解除ロジック: 最も最近適用されたもの（リストの最後）を削除
                const buffToRemove = buffs[buffs.length - 1];

                return removeEffect(state, targetUnitId, buffToRemove.id);
            }
        }
    ]
};
