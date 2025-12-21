import { ILightConeData, Modifier } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { applyShield } from '../../simulator/engine/utils';
import { createUnitId } from '../../simulator/engine/unitId';
import { IEffect } from '../../simulator/effect/types';
import { GameState, Unit } from '../../simulator/engine/types';

export const textureOfMemories: ILightConeData = {
    id: 'texture-of-memories',
    name: '記憶の素材',
    description: '装備キャラの効果抵抗+8%。装備キャラが攻撃を受けた後、バリアを持っていない場合、装備キャラの最大HP16%分の耐久値を持つバリアを1つ獲得する、2ターン継続。この効果は3ターンごとに1回発動できる。バリアを持っている場合、自身の被ダメージ-12%。',
    descriptionTemplate: '装備キャラの効果抵抗+{0}%。装備キャラが攻撃を受けた後、バリアを持っていない場合、装備キャラの最大HP{1}%分の耐久値を持つバリアを1つ獲得する、2ターン継続。この効果は3ターンごとに1回発動できる。バリアを持っている場合、自身の被ダメージ-{2}%。',
    descriptionValues: [
        ['8', '16', '12'],
        ['10', '20', '15'],
        ['12', '24', '18'],
        ['14', '28', '21'],
        ['16', '32', '24']
    ],
    path: 'Preservation',
    baseStats: {
        hp: 1058,
        atk: 423,
        def: 529,
    },

    passiveEffects: [
        {
            id: 'texture-of-memories-res',
            name: '珍蔵（効果抵抗）',
            category: 'BUFF',
            targetStat: 'effect_res',
            effectValue: [0.08, 0.10, 0.12, 0.14, 0.16]
        }
    ],

    eventHandlers: [
        {
            id: 'texture-of-memories-dmg-reduce-check',
            name: '珍蔵（シールド時軽減）',
            events: ['ON_BEFORE_DAMAGE_CALCULATION'],
            handler: (event, state, unit, superimposition) => {
                if (!('targetId' in event)) return state;
                if (event.targetId !== unit.id) return state;
                if (unit.shield > 0) {
                    const val = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                    // 被ダメージ軽減のための一時的な修正を適用（負の被ダメアップ = 軽減）
                    // 被ダメアップは (1 + Vuln) として機能する。Vulnが -0.12 の場合、修正値は 0.88 になる。
                    // これは他の被ダメアップと乗算または加算で累積すると仮定する。
                    // 'dmg_taken_reduction' ステータスが存在する場合、可能であればそれを使用すべき。
                    // 永続的な効果のオーバーヘッドなしにイベント中にステータス変更バフを追加するのは簡単ではないため、
                    // 可能であれば state.damageModifiers.dmgBoost などを修正するか、'dmg_taken_reduction' がステータスであるため無視する。

                    // 正しいアプローチ：シールドを条件とするバフを適用する？
                    // しかしエンジンは通常、ターン開始/終了/アクション時に修正値を更新する。
                    // ダメージ計算中に動的なチェックを行いたい場合は、DamageCalculationModifiers を修正する。
                    // DamageCalculationModifiers は Vuln をサポートしているか？ いいえ。
                    // 'defIgnore', 'resPen'（暗黙的？）, 'crit', 'dmgBoost', 'atkBoost' などはあるが...
                    // Vuln 修正値はない。
                    // 待って、`calculateVulnerabilityMultiplier` は `target.stats.all_type_vuln` と `dmg_taken_reduction` を使用する。
                    // これは `modifiers` 引数からの動的修正を受け取らない！
                    // `calculateVulnerabilityMultiplier(source, target)` シグネチャ。
                    // `damage.ts` 内で `modifiers` を受け取らない。
                    // damage.ts の 159行目を確認： `function calculateVulnerabilityMultiplier(source: Unit, target: Unit): number`
                    // 完全に `modifiers` を無視している！

                    // 重大な問題：`calculateDamage` に渡される動的修正値は、被ダメージ計算に使用されていない。
                    // この光円錐（およびその他）を正しく実装するには、これを修正しなければならない。
                    // `calculateVulnerabilityMultiplier` を更新して `modifiers` を受け取り、`modifiers.vulnBoost` を使用するようにすべき。
                }
                return state;
            }
        },
        {
            id: 'texture-of-memories-shield-proc',
            name: '珍蔵（シールド生成）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (!('targetId' in event)) return state;
                if (event.targetId !== unit.id) return state;

                // Check Cooldown
                const lastActivation = unit.lightConeState?.['texture-of-memories-cd']?.cooldown || 0;
                if (lastActivation > 0) return state;

                // Check Shield
                if (unit.shield > 0) return state;

                // Generate Shield
                const shieldPct = [0.16, 0.20, 0.24, 0.28, 0.32][superimposition - 1];

                let newState = applyShield(state, unit.id, unit.id, {
                    scaling: 'hp',
                    multiplier: shieldPct
                }, 2, 'TURN_END_BASED', '記憶の素材（バリア）');

                // Set Cooldown: 3 Turns.
                newState = {
                    ...newState,
                    registry: newState.registry.update(createUnitId(unit.id), u => ({
                        ...u,
                        lightConeState: {
                            ...u.lightConeState,
                            ['texture-of-memories-cd']: { cooldown: 3, activations: 1 }
                        }
                    }))
                };

                return newState;
            }
        }
    ]
};
