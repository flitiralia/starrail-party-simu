import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';
import { applyHealing } from '@/app/simulator/engine/utils';

export const somethingIrreplaceable: ILightConeData = {
    id: 'something-irreplaceable',
    name: 'かけがえのないもの',
    description: '装備キャラの攻撃力+24%。装備キャラが敵を倒す、または攻撃を受けた後、装備キャラの攻撃力8%分のHPを回復し、与ダメージ+24%、この効果は自身の次のターンが終了するまで継続。この効果は累積できず、ターンが回ってくるたびに1回まで発動できる。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。装備キャラが敵を倒す、または攻撃を受けた後、装備キャラの攻撃力{1}%分のHPを回復し、与ダメージ+{2}%、この効果は自身の次のターンが終了するまで継続。この効果は累積できず、ターンが回ってくるたびに1回まで発動できる。',
    descriptionValues: [
        ['24', '8', '24'],
        ['28', '9', '28'],
        ['32', '10', '32'],
        ['36', '11', '36'],
        ['40', '12', '40']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1164,
        atk: 582,
        def: 396,
    },
    passiveEffects: [
        {
            id: 'something_irreplaceable_atk',
            name: 'かけがえのないもの（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.24, 0.28, 0.32, 0.36, 0.40]
        }
    ],
    eventHandlers: [
        {
            id: 'something_irreplaceable_proc',
            name: 'かけがえのないもの（発動）',
            events: ['ON_ENEMY_DEFEATED', 'ON_AFTER_HIT'],
            cooldownResetType: CooldownResetType.WEARER_TURN,
            maxActivations: 1, // ターンが回ってくるたびに1回まで
            handler: (event, state, unit, superimposition) => {
                const isEnemyDefeated = event.type === 'ON_ENEMY_DEFEATED' && event.sourceId === unit.id;
                const isHit = event.type === 'ON_AFTER_HIT' && event.targetId === unit.id;

                if (!isEnemyDefeated && !isHit) return state;

                const healMult = [0.08, 0.09, 0.10, 0.11, 0.12][superimposition - 1];
                const dmgBuff = [0.24, 0.28, 0.32, 0.36, 0.40][superimposition - 1];

                // HP回復 (攻撃力参照)
                const stateWithHeal = applyHealing(
                    state,
                    unit.id,
                    unit.id,
                    {
                        scaling: 'atk',
                        multiplier: healMult
                    },
                    'かけがえのないもの: 回復',
                    true
                );

                // Effect定義
                const effectId = `something_irreplaceable_buff_${unit.id}`;

                // バフ付与
                const newState = addEffect(stateWithHeal, unit.id, {
                    id: effectId,
                    name: 'かけがえのないもの（与ダメージ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 1, // 次のターンが終了するまで
                    skipFirstTurnDecrement: stateWithHeal.currentTurnOwnerId === unit.id, // 自分のターンの場合は減少せず、次まで持ち越し

                    modifiers: [
                        {
                            target: 'all_type_dmg_boost',
                            source: 'かけがえのないもの',
                            type: 'add',
                            value: dmgBuff
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                return newState;
            }
        },
        // 回復用の別ハンドラ？
        // いえ、同じ条件で発動すべきです。
        // 今回はバフのみ実装し、回復については「仕様上の制限により未実装」とせず、
        // 回復効果を持つ「Instant Effect」的な扱いができないか検討が必要ですが、
        // ひとまずバフを優先します。
    ]
};
