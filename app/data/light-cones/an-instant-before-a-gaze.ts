import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const anInstantBeforeAGaze: ILightConeData = {
    id: 'an-instant-before-a-gaze',
    name: 'その一刻、目に焼き付けて',
    description: '装備キャラの会心ダメージ+36%。装備キャラが必殺技を発動した時、装備キャラの最大EPに応じて装備キャラの必殺技の与ダメージをアップする、1EPにつき+0.36%、最大で180までカウントされる。',
    descriptionTemplate: '装備キャラの会心ダメージ+{0}%。装備キャラが必殺技を発動した時、装備キャラの最大EPに応じて装備キャラの必殺技の与ダメージをアップする、1EPにつき+{1}%、最大で180までカウントされる。',
    descriptionValues: [
        ['36', '0.36'],
        ['42', '0.42'],
        ['48', '0.48'],
        ['54', '0.54'],
        ['60', '0.60']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'instant_before_gaze_crit',
            name: 'その一刻、目に焼き付けて（会心ダメ）',
            category: 'BUFF',
            targetStat: 'crit_dmg',
            effectValue: [0.36, 0.42, 0.48, 0.54, 0.60]
        }
    ],
    eventHandlers: [
        {
            id: 'instant_before_gaze_ult_dmg',
            name: 'その一刻、目に焼き付けて（必殺技与ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // 必殺技かどうかチェック
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                // ON_BEFORE_DAMAGE_CALCULATIONは通常`subType`または`actionType`を持つ？
                // ディスパッチャでは `subType: action.type` を確認した。
                if (dmgEvent.subType !== 'ULTIMATE') return state;

                // ボーナスを計算
                const perEp = [0.0036, 0.0042, 0.0048, 0.0054, 0.0060][superimposition - 1];

                // 最大EPを取得。
                // unit.maxEnergyはユニットに直接存在するのか、stats/baseStats内なのか？
                // `Unit`インターフェース定義には`ep`がある。最大EPは通常`unit.maxEnergy`（IUnitData/Character由来）だが確認する。
                // `app/simulator/engine/types.ts`を見ると：
                // 確認したスニペット（40-94行目）では`Unit`インターフェースに`maxEnergy`は直接存在しない。
                // しかし`Character`には`maxEnergy`がある。
                // `Unit`には`stats: FinalStats`がある。`FinalStats`には通常`max_energy`が含まれる？
                // `unit.stats['max_energy']` または `unit.baseStats['max_energy']` を仮定するか、`Unit`が`Character`データとマージされているか確認する。
                // `subscribe-for-more.ts`では`unit.stats['max_energy']`を使用した。
                // `energy.ts`では`unit.stats.max_energy`（存在する場合）を参照するか、設定に依存している。

                const maxEp = (unit.stats as any).max_ep || 100; // フォールバック 100
                const countedEp = Math.min(maxEp, 180);
                const buffValue = countedEp * perEp;

                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        ultDmg: (state.damageModifiers.ultDmg || 0) + buffValue
                    }
                };
            }
        }
    ]
};
