import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const flameOfBloodBlazeMyPath: ILightConeData = {
    id: 'flame-of-blood-blaze-my-path',
    name: '前途燃やす血の如き炎',
    description: '装備キャラの最大HP+18%、受ける治癒量+20%。戦闘スキルまたは必殺技を発動する時、自身の最大HP6.0%分のHPを消費し、その回の攻撃の与ダメージ+30%。この効果で消費したHPが500を超えると、さらに与ダメージ+30%。残りHPが足りない場合、この効果で装備キャラの残りHPが1になる。',
    descriptionTemplate: '装備キャラの最大HP+{0}%、受ける治癒量+{1}%。戦闘スキルまたは必殺技を発動する時、自身の最大HP{2}%分のHPを消費し、その回の攻撃の与ダメージ+{3}%。この効果で消費したHPが500を超えると、さらに与ダメージ+{4}%。残りHPが足りない場合、この効果で装備キャラの残りHPが1になる。',
    descriptionValues: [
        ['18', '20', '6.0', '30', '30'],
        ['21', '25', '6.5', '35', '35'],
        ['24', '30', '7.0', '40', '40'],
        ['27', '35', '7.5', '45', '45'],
        ['30', '40', '8.0', '50', '50']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1375,
        atk: 476,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'flame_blood_hp',
            name: '前途燃やす血の如き炎（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
        },
        {
            id: 'flame_blood_inc_healing',
            name: '前途燃やす血の如き炎（被治癒）',
            category: 'BUFF',
            targetStat: 'incoming_heal_boost',
            effectValue: [0.20, 0.25, 0.30, 0.35, 0.40]
        }
    ],
    eventHandlers: [
        {
            id: 'flame_blood_activity',
            name: '前途燃やす血の如き炎（発動）',
            events: ['ON_SKILL_USED', 'ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const consumeRate = [0.06, 0.065, 0.07, 0.075, 0.08][superimposition - 1];
                const consumeAmount = unit.stats.hp * consumeRate;
                const actualConsume = Math.floor(consumeAmount);

                let finalHp = unit.hp - actualConsume;
                if (finalHp < 1) finalHp = 1;

                // HP直接変更（シミュレーションの前提：ハンドラ内での状態変更は許可されている）
                unit.hp = finalHp;

                const baseDmgBoost = [0.30, 0.35, 0.40, 0.45, 0.50][superimposition - 1];
                const extraDmgBoost = [0.30, 0.35, 0.40, 0.45, 0.50][superimposition - 1];

                let totalDmgBoost = baseDmgBoost;
                if (actualConsume > 500) {
                    totalDmgBoost += extraDmgBoost;
                }

                return addEffect(state, unit.id, {
                    id: `flame_blood_buff_${unit.id}`,
                    name: '前途燃やす血の如き炎（与ダメージ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 99, // 手動で解除
                    modifiers: [
                        {
                            target: 'all_type_dmg_boost',
                            source: '前途燃やす血の如き炎',
                            type: 'add',
                            value: totalDmgBoost
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'flame_blood_cleanup',
            name: '前途燃やす血の如き炎（解除）',
            events: ['ON_ACTION_COMPLETE'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                return removeEffect(state, unit.id, `flame_blood_buff_${unit.id}`);
            }
        }
    ]
};
