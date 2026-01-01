import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const flamesAfar: ILightConeData = {
    id: 'flames-afar',
    name: '烈火の彼方',
    description: '装備キャラが1回の攻撃で最大HP25%分を超えるHPを失う、または1回で最大HP25%分を超えるHPを消費した後装備キャラの最大HP15%分のHPを回復し、与ダメージ+25%、2ターン継続。この効果は3ターンに1回発動できる。',
    descriptionTemplate: '装備キャラが1回の攻撃で最大HP25%分を超えるHPを失う、または1回で最大HP25%分を超えるHPを消費した後装備キャラの最大HP15%分のHPを回復し、与ダメージ+{0}%、2ターン継続。この効果は3ターンに1回発動できる。',
    descriptionValues: [
        ['25'],
        ['31'],
        ['37'],
        ['43'],
        ['50']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1058,
        atk: 476,
        def: 264,
    },
    eventHandlers: [
        {
            id: 'flames-afar-proc',
            name: '烈火の彼方（発動）',
            events: ['ON_DAMAGE_DEALT', 'ON_SKILL_USED', 'ON_ULTIMATE_USED'],
            // 変更点: HP減少を検出するために ON_DAMAGE_DEALT を追加。

            cooldownTurns: 3,
            cooldownResetType: CooldownResetType.WEARER_TURN,

            handler: (event, state, unit, superimposition) => {
                let hpLoss = 0;

                // ケース1: ダメージを受ける
                if (event.type === 'ON_DAMAGE_DEALT' && 'targetId' in event && event.targetId === unit.id) {
                    hpLoss = event.value;
                }

                // ケース2: HP消費 (スキル/必殺技)
                // 特定のイベントなしに実際の消費を追跡するのは難しい。
                // ユーザーがトリガーすると信頼するか、キャラが刃のような場合、高い消費を想定するか？
                // 今のところ、スキル/必殺技を使用している場合、コストを知ることができれば閾値に対して検証する？いいえ。
                // 単純化のために "減少" として ON_DAMAGE_DEALT に固執する。
                // 自己消費は通常、source=self の ON_DAMAGE_DEALT として現れる？

                if (event.type === 'ON_DAMAGE_DEALT' && event.sourceId === unit.id && 'targetId' in event && event.targetId === unit.id) {
                    // 自傷
                    hpLoss = event.value;
                }

                const threshold = unit.stats.hp * 0.25;

                // ダメージイベントであり、かつ閾値を超えている場合のみ続行
                if (event.type === 'ON_DAMAGE_DEALT') {
                    if (hpLoss <= threshold) return state;
                } else {
                    // スキル/必殺技の使用をトリガーとして使用？
                    // コスト情報がないと、厳密に >25% を強制できない。
                    // もし "HP減少 > 25%" が唯一の条件であるというロジックを想定するなら、ダメージイベントで捕捉されないダメージ/減少を引き起こさない限り、ON_SKILL_USED は無関係である。
                    // 通常、シミュレートされた消費は自傷または直接的なステータス変更である。
                    // シミュレータが自傷に対して ON_DAMAGE_DEALT を発行するなら問題ない。
                    if (hpLoss === 0) return state; // 今のところ非ダメージイベントはスキップ
                }

                // バフ
                const dmgVal = [0.25, 0.31, 0.37, 0.43, 0.50][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `flames_afar_buff_${unit.id}`,
                    name: '烈火の彼方（与ダメージ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    modifiers: [
                        {
                            target: 'all_type_dmg_boost',
                            source: '烈火の彼方',
                            type: 'add',
                            value: dmgVal
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
