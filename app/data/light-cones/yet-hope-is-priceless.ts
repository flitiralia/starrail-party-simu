import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';

export const yetHopeIsPriceless: ILightConeData = {
    id: 'yet-hope-is-priceless',
    name: 'されど希望の銘は無価',
    description: '装備キャラの会心率+16%。戦闘中、装備キャラの会心ダメージが120%を超えた時、超えた会心ダメージ20%につき、追加攻撃ダメージ+12%。この効果は最大で4層累積できる。戦闘開始時および装備キャラが通常攻撃を行った後、追加攻撃ダメージと必殺技によるダメージがターゲットの防御力を20%無視する、2ターン継続。',
    descriptionTemplate: '装備キャラの会心率+{0}%。戦闘中、装備キャラの会心ダメージが120%を超えた時、超えた会心ダメージ20%につき、追加攻撃ダメージ+{1}%。この効果は最大で4層累積できる。戦闘開始時および装備キャラが通常攻撃を行った後、追加攻撃ダメージと必殺技によるダメージがターゲットの防御力を{2}%無視する、2ターン継続。',
    descriptionValues: [
        ['16', '12', '20'],
        ['19', '14', '24'],
        ['22', '16', '28'],
        ['25', '18', '32'],
        ['28', '20', '36']
    ],
    path: 'Erudition',
    baseStats: {
        hp: 952,
        atk: 582,
        def: 529,
    },
    passiveEffects: [
        {
            id: 'yet-hope-priceless-crit',
            name: 'されど希望の銘は無価（会心率）',
            category: 'BUFF',
            targetStat: 'crit_rate',
            effectValue: [0.16, 0.19, 0.22, 0.25, 0.28]
        }
    ],
    eventHandlers: [
        {
            id: 'yet-hope-priceless-dynamic-fua',
            name: 'されど希望の銘は無価（追撃与ダメ）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;
                if (dmgEvent.subType !== 'FOLLOW_UP_ATTACK') return state;

                // 20%超過ごとの値
                const fuaStep = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                // 現在の会心ダメージ
                const cd = unit.stats.crit_dmg || 0.50; // default 50%
                const excess = Math.max(0, cd - 1.20);
                const stacks = Math.min(4, Math.floor(excess / 0.20));

                if (stacks > 0) {
                    return {
                        ...state,
                        damageModifiers: {
                            ...state.damageModifiers,
                            fuaDmg: (state.damageModifiers.fuaDmg || 0) + (fuaStep * stacks)
                        }
                    };
                }

                return state;
            }
        },
        // 防御無視効果
        {
            id: 'yet-hope-priceless-def-ignore-applier',
            name: 'されど希望の銘は無価（防御無視付与）',
            events: ['ON_BATTLE_START', 'ON_BASIC_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id && event.type !== 'ON_BATTLE_START') return state;
                if (event.type === 'ON_BATTLE_START' && event.sourceId !== 'system' && event.sourceId !== unit.id) {
                    // BATTLE_START は初期化を意味する。装備者に適用する必要があるか確認する。
                    // 通常、ON_BATTLE_START の sourceId は system。
                    // しかし、ここでは `unit` に適用したい。
                }

                // 「条件」効果（マーカー）を適用
                const ignoreVal = [0.20, 0.24, 0.28, 0.32, 0.36][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `yet_hope_priceless_def_ignore_${unit.id}`,
                    name: '承諾（防御無視）', // "Acknowledgement"
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 2,
                    stackCount: 1,
                    modifiers: [], // ロジックは以下で処理される
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'yet-hope-priceless-def-ignore-logic',
            name: 'されど希望の銘は無価（防御無視計算）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').BeforeDamageCalcEvent;

                // ターゲット：追加攻撃または必殺技
                if (dmgEvent.subType !== 'FOLLOW_UP_ATTACK' && dmgEvent.subType !== 'ULTIMATE') return state;

                // マーカー効果を確認
                const marker = unit.effects.find(e => e.id === `yet_hope_priceless_def_ignore_${unit.id}`);
                if (!marker) return state;

                const ignoreVal = [0.20, 0.24, 0.28, 0.32, 0.36][superimposition - 1];

                return {
                    ...state,
                    damageModifiers: {
                        ...state.damageModifiers,
                        defIgnore: (state.damageModifiers.defIgnore || 0) + ignoreVal
                    }
                };
            }
        }
    ]
};
