import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';
import { IEffect } from '../../simulator/effect/types';

export const inherentlyUnjustDestiny: ILightConeData = {
    id: 'inherently-unjust-destiny',
    name: '運命は常に不公平',
    description: '装備キャラの防御力+40%。装備キャラが味方にバリアを付与する時、装備キャラの会心ダメージ+40%、2ターン継続。装備キャラの追加攻撃が敵に命中する時、100%の基礎確率で攻撃を受ける敵の被ダメージを+10.0%アップさせる、2ターン継続。',
    descriptionTemplate: '装備キャラの防御力+{0}%。装備キャラが味方にバリアを付与する時、装備キャラの会心ダメージ+{1}%、2ターン継続。装備キャラの追加攻撃が敵に命中する時、{2}%の基礎確率で攻撃を受ける敵の被ダメージを+{3}%アップさせる、2ターン継続。',
    descriptionValues: [
        ['40', '40', '100', '10.0'],
        ['46', '46', '115', '11.5'],
        ['52', '52', '130', '13.0'],
        ['58', '58', '145', '14.5'],
        ['64', '64', '160', '16.0']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 1058,
        atk: 423,
        def: 661,
    },

    passiveEffects: [
        {
            id: 'unjust-destiny-def',
            name: 'オールイン（防御力）',
            category: 'BUFF',
            targetStat: 'def_pct',
            effectValue: [0.40, 0.46, 0.52, 0.58, 0.64]
        }
    ],

    eventHandlers: [
        {
            id: 'unjust-destiny-shield-buff',
            name: 'オールイン（バリア付与時バフ）',
            events: ['ON_EFFECT_APPLIED'],
            handler: (event, state, unit, superimposition) => {
                if (event.type !== 'ON_EFFECT_APPLIED') return state;
                // 効果がシールドであり、ソースが装備者かチェック
                if (event.sourceId === unit.id && event.effect.type === 'Shield') {
                    const cdBoost = [0.40, 0.46, 0.52, 0.58, 0.64][superimposition - 1];
                    return addEffect(state, unit.id, {
                        id: `unjust-destiny-cd-buff-${unit.id}`,
                        name: 'オールイン（会心ダメUP）',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_END_BASED',
                        duration: 2,
                        modifiers: [{
                            target: 'crit_dmg',
                            value: cdBoost,
                            type: 'add',
                            source: '運命は常に不公平'
                        }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }
                return state;
            }
        },
        {
            id: 'unjust-destiny-fua-debuff',
            name: 'オールイン（追加攻撃デバフ）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // ActionEvent の型ガード
                if (!('actionType' in event)) return state;
                if (event.actionType !== 'FOLLOW_UP_ATTACK') return state;

                if (!event.targetId) return state;
                const targetUnit = state.registry.get(createUnitId(event.targetId));
                if (!targetUnit) return state;

                const baseChance = [1.0, 1.15, 1.30, 1.45, 1.60][superimposition - 1];
                const vuln = [0.10, 0.115, 0.13, 0.145, 0.16][superimposition - 1];

                // 命中確率計算
                const ehr = unit.stats.effect_hit_rate || 0;
                const res = targetUnit.stats.effect_res || 0;
                const realChance = baseChance * (1 + ehr) * (1 - res);

                if (Math.random() < realChance) {
                    return addEffect(state, targetUnit.id, {
                        id: `unjust-destiny-vuln-${unit.id}-${targetUnit.id}`,
                        name: 'オールイン（被ダメUP）',
                        category: 'DEBUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_END_BASED', // 敵のターン終了時
                        duration: 2,
                        modifiers: [{
                            target: 'all_type_vuln',
                            value: vuln,
                            type: 'add',
                            source: '運命は常に不公平'
                        }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }
                return state;
            }
        }
    ]
};
