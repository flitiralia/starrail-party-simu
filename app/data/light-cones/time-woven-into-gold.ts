import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

export const TIME_WOVEN_INTO_GOLD: ILightConeData = {
    id: 'time-woven-into-gold',
    name: '光陰を織り黄金と成す',
    description: '装備キャラの基礎速度+12。装備キャラまたはその記憶の精霊が攻撃を行った後、装備キャラに「錦を織って」を1層付与する。「錦を織って」1層につき、装備キャラおよびその記憶の精霊の会心ダメージ+9.0%、最大で6層累積できる。「錦を織って」の層数が上限に達すると、1層につき、追加で通常攻撃ダメージ+9.0%。',
    descriptionTemplate: '装備キャラの基礎速度+{0}。装備キャラまたはその記憶の精霊が攻撃を行った後、装備キャラに「錦を織って」を1層付与する。「錦を織って」1層につき、装備キャラおよびその記憶の精霊の会心ダメージ+{1}%、最大で6層累積できる。「錦を織って」の層数が上限に達すると、1層につき、追加で通常攻撃ダメージ+{2}%。',
    descriptionValues: [
        ['12', '9.0', '9.0'],
        ['14', '10.5', '10.5'],
        ['16', '12.0', '12.0'],
        ['18', '13.5', '13.5'],
        ['20', '15.0', '15.0']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 1058,
        atk: 635,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'weaving-base-spd',
            name: '設立（基礎速度）',
            category: 'BUFF',
            targetStat: 'spd',
            effectValue: [12, 14, 16, 18, 20],
            // 基礎ステータスを変更するために 'base' タイプを使用
            type: 'base',
        }
    ],
    eventHandlers: [
        {
            id: 'weaving-stack',
            name: '設立（スタック獲得）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                // トリガー：装備キャラまたは記憶の精霊が攻撃
                // 記憶の精霊チェック: unit.isSummon && unit.ownerId === wearer.id
                // 注：ハンドラに渡される一般的な 'unit' は光円錐の装備者。
                // イベントソースが装備者またはその精霊であるかを確認する必要がある。

                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source) return state;

                const isWearer = source.id === unit.id;
                const isMySpirit = source.isSummon && source.ownerId === unit.id;

                if (!isWearer && !isMySpirit) return state;

                // 装備キャラに「錦を織って」スタックを追加
                const critDmgBoost = [0.09, 0.105, 0.12, 0.135, 0.15][superimposition - 1];
                const basicAtkBoost = [0.09, 0.105, 0.12, 0.135, 0.15][superimposition - 1];
                const maxStacks = 6;

                // 装備キャラと精霊を取得
                const targets = [source]; // source is wearer if isWearer is true, otherwise unit
                if (!isWearer) {
                    // source is spirit, so wearer is unit
                    // actually unit is always wearer in handler context (passed from registerLightConeEventHandlers)
                }

                // ターゲットリスト：装備者 + その精霊
                const wearer = unit;
                const spirits = state.registry.toArray().filter(u => u.isSummon && u.ownerId === wearer.id);
                const allTargets = [wearer, ...spirits];

                // 次のスタック数を計算（装備者の状態を基準にする）
                const existing = wearer.effects.find(e => e.id === `weaving-stack-${wearer.id}`);
                const currentStack = existing ? (existing.stackCount || 0) : 0;
                const nextStack = Math.min(currentStack + 1, maxStacks);

                let newState = state;

                for (const target of allTargets) {
                    newState = addEffect(newState, target.id, {
                        id: `weaving-stack-${target.id}`,
                        name: '錦を織って',
                        category: 'BUFF',
                        sourceUnitId: wearer.id,
                        type: 'BUFF',
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: nextStack,
                        maxStacks: maxStacks,
                        modifiers: [
                            {
                                target: 'crit_dmg',
                                value: critDmgBoost,
                                type: 'add',
                                source: '光陰を織り黄金と成す'
                            },
                            {
                                target: 'basic_atk_dmg_boost',
                                value: 0,
                                type: 'add',
                                source: '光陰を織り黄金と成す',
                                dynamicValue: (t, allUnits) => {
                                    // ターゲット上の効果を見つけてスタック数を取得
                                    const eff = t.effects.find(e => e.id === `weaving-stack-${t.id}`);
                                    const stacks = eff ? (eff.stackCount || 1) : 1;
                                    if (stacks >= maxStacks) {
                                        return basicAtkBoost;
                                    }
                                    return 0;
                                }
                            }
                        ],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return newState;
            }
        }
    ]
};
