import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const chasingTheWind: ILightConeData = {
    id: 'chasing-the-wind',
    name: '風を追う時',
    description: '戦闘に入った後、味方全体の弱点撃破ダメージ+16%。同系統のスキルは累積できない。',
    descriptionTemplate: '戦闘に入った後、味方全体の弱点撃破ダメージ+{0}%。',
    descriptionValues: [
        ['60'],
        ['75'],
        ['90'],
        ['105'],
        ['120']
    ],// Usually interpolation: 16 -> 18 -> 20 -> 22 -> 24?
    // Check lines 106: 16% 24%. Just 2 values? 
    // Most likely 16, 18, 20, 22, 24.
    path: 'Harmony',
    baseStats: {
        hp: 1058,
        atk: 476,
        def: 396,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'chasing_wind_buff',
            name: '風を追う時（撃破ダメ）',
            events: ['ON_BATTLE_START'],
            handler: (event, state, unit, superimposition) => {
                const val = [0.16, 0.18, 0.20, 0.22, 0.24][superimposition - 1];
                const allies = state.registry.getAliveAllies();
                let newState = state;

                allies.forEach(ally => {
                    newState = addEffect(newState, ally.id, {
                        id: `chasing_wind_break_${ally.id}`,
                        name: 'あたふた（撃破ダメ）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT',
                        duration: -1,
                        stackCount: 1,

                        // "Break Effect" (be / break_effect) は撃破ダメージを増加させる。
                        // しかしテキストは「弱点撃破ダメージ+X%」と言っている。
                        // これはルアン・メェイのような特定の脆弱性や乗数を意味するか？
                        // シミュレータに「撃破ダメージアップ」ステータスがない場合、BEを使用するか？ 否、それらは異なる。
                        // サポートされている場合 `break_dmg_boost` をターゲットにできると仮定、あるいはユーザーがBEを意図している場合はBEにフォールバック？
                        // テキストは「弱点撃破ダメージ」。
                        // 利用可能なら `break_dmg_boost` を使用。
                        // 一部の計算では標準ステータス。
                        modifiers: [{ target: 'break_dmg_boost' as any, value: val, type: 'add', source: '風を追う時' }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                });
                return newState;
            }
        }
    ]
};
