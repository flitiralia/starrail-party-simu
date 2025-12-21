import { ILightConeData, createUnitId } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const nightOnTheMilkyWay: ILightConeData = {
    id: 'night-on-the-milky-way',
    name: '銀河鉄道の夜',
    description: 'フィールド上にいる敵1体につき、装備キャラの攻撃力+9.0%、この効果は最大で5層累積できる。敵が弱点撃破された時、装備キャラの与ダメージ+30%、1ターン継続。',
    descriptionTemplate: 'フィールド上にいる敵1体につき、装備キャラの攻撃力+{0}%、この効果は最大で5層累積できる。敵が弱点撃破された時、装備キャラの与ダメージ+{1}%、1ターン継続。',
    descriptionValues: [
        ['9.0', '30'],
        ['10.5', '35'],
        ['12.0', '40'],
        ['13.5', '45'],
        ['15.0', '50']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 1164,
        atk: 582,
        def: 396,
    },
    passiveEffects: [],
    // 動的な値のためにイベントハンドラを介して実装
    // 更新される「オーラ」または「永続バフ」として実装する方が良い。
    // 正確性と保守性を確保するためにイベントハンドラを使用する。

    eventHandlers: [
        {
            id: 'night_on_milky_way_dynamic_atk',
            name: '銀河鉄道の夜（敵数攻撃力UP）',
            events: ['ON_BATTLE_START', 'ON_TURN_START', 'ON_ENEMY_SPAWNED', 'ON_UNIT_DEATH', 'ON_ACTION_COMPLETE'],
            handler: (event, state, unit, superimposition) => {
                // 計算
                const atkPerEnemy = [0.09, 0.105, 0.12, 0.135, 0.15][superimposition - 1];
                const enemies = state.registry.getAliveEnemies().length;
                const stacks = Math.min(enemies, 5);
                const totalAtkBuff = atkPerEnemy * stacks;

                // 効果を適用/更新
                // 頻繁に変更されるため、効果を上書きする
                return addEffect(state, unit.id, {
                    id: `night_milky_way_atk_${unit.id}`,
                    name: '銀河鉄道の夜（攻撃力）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: stacks,
                    modifiers: [
                        {
                            target: 'atk_pct',
                            value: totalAtkBuff,
                            type: 'add',
                            source: '銀河鉄道の夜'
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'night_on_milky_way_break_dmg',
            name: '銀河鉄道の夜（撃破時与ダメUP）',
            events: ['ON_WEAKNESS_BREAK'],
            handler: (event, state, unit, superimposition) => {
                // トリガー: "敵が弱点撃破された時"
                if (!('targetId' in event)) return state;
                const targetId = (event as any).targetId;
                if (!targetId) return state;

                const target = state.registry.get(createUnitId(targetId));
                if (!target || !target.isEnemy) return state;

                // 装備者にバフを適用
                const dmgBuff = [0.30, 0.35, 0.40, 0.45, 0.50][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `night_milky_way_break_dmg_${unit.id}`,
                    name: '銀河鉄道の夜（与ダメージ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED', // "1ターン" は通常、装備者のターン？それとも1ターンの期間？
                    // テキスト: "1ターン継続"。
                    // 標準的なバフ期間は通常、"1ターン" に対して TURN_START_BASED である。
                    duration: 1,
                    stackCount: 1,
                    modifiers: [
                        {
                            target: 'all_type_dmg_boost', // 以前のコンテキストからの正しいキー
                            value: dmgBuff,
                            type: 'add',
                            source: '銀河鉄道の夜'
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
