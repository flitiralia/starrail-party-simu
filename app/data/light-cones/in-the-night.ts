import { ILightConeData } from '@/app/types';

export const inTheNight: ILightConeData = {
    id: 'in-the-night',
    name: '夜の帳の中で',
    description: '装備キャラの会心率+18%。戦闘中に装備キャラの速度が100を超えた時、10超過するにつき、通常攻撃と戦闘スキルの与ダメージ+6%、必殺技の会心ダメージ+12%、最大で6層累積できる。',
    descriptionTemplate: '装備キャラの会心率+{0}%。戦闘中に装備キャラの速度が100を超えた時、10超過するにつき、通常攻撃と戦闘スキルの与ダメージ+{1}%、必殺技の会心ダメージ+{2}%、最大で6層累積できる。',
    descriptionValues: [
        ['18', '6', '12'],
        ['21', '7', '14'],
        ['24', '8', '16'],
        ['27', '9', '18'],
        ['30', '10', '20']
    ],
    path: 'The Hunt',
    baseStats: {
        hp: 1058,
        atk: 582,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'in_the_night_crit',
            name: '夜の帳の中で（会心率）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
        }
    ],
    eventHandlers: [
        {
            id: 'in_the_night_spd_scaling',
            name: '夜の帳の中で（速度スケーリング）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // イベントが actionType, isCrit 等を持つか確認
                // ON_DAMAGE_DEALT (DamageDealtEvent) には actionType, isCrit がある
                // BeforeDamageCalcEvent にはない可能性があるが、このLCは `ON_DAMAGE_DEALT` を想定している?
                // 定義では `ON_BEFORE_DAMAGE_CALCULATION` を購読している。
                // 既存実装同様、プロパティ存在チェックを行う。

                let actionType: string | undefined;
                let isCrit: boolean | undefined;

                if ('actionType' in event) actionType = (event as any).actionType;
                if ('isCrit' in event) isCrit = (event as any).isCrit;

                // 条件: 戦闘スキル or 通常攻撃 (テキスト: Skill or Basic ATK)
                // "Increases the wearer's CRIT Rate by X%." (Passive)
                // "While the wearer is in battle, for every 10 SPD that exceeds 100, increases the DMG of the wearer's Basic ATK and Skill by X% and increases the CRIT DMG of their Ultimate by Y%."
                // This is dynamic DMG boost. Like `subscribe-for-more`, strictly this should be a passive calculation?
                // However, implementing as an event handler modifying `damageModifiers` for the current action.

                if (!actionType) return state;

                const spd = unit.stats.spd || 100; // 現在速度
                if (spd <= 100) return state;

                const stack = Math.min(6, Math.floor((spd - 100) / 10));

                let dmgBuff = 0;
                let critDmgBuff = 0;

                const dmgVal = [0.06, 0.07, 0.08, 0.09, 0.10][superimposition - 1];
                const cdVal = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                if (['BASIC_ATTACK', 'ENHANCED_BASIC_ATTACK', 'SKILL'].includes(actionType)) {
                    dmgBuff = stack * dmgVal;
                } else if (actionType === 'ULTIMATE') {
                    critDmgBuff = stack * cdVal;
                }

                if (dmgBuff === 0 && critDmgBuff === 0) return state;

                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        allTypeDmg: (state.damageModifiers.allTypeDmg || 0) + dmgBuff,
                        critDmg: (state.damageModifiers.critDmg || 0) + critDmgBuff
                    }
                };
            }
        }
    ]
};
