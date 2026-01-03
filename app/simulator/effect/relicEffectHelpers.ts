import { GameState, Unit, IEvent } from '../engine/types';
import { Element } from '../../types';
import { publishEvent } from '../engine/dispatcher';
import { UnitId, createUnitId } from '../engine/unitId';

/**
 * 条件関数の型定義
 * ターゲットとソースユニットから追加の防御無視率を計算
 */
export type DefIgnoreCondition = (target: Unit, source: Unit) => number;

/**
 * 防御無視ハンドラーを生成するファクトリー関数
 * 
 * @param baseDefIgnore 基本の防御無視率（例: 0.1 = 10%）
 * @param condition オプショナルな条件関数。追加の防御無視率を返す
 * @returns イベントハンドラー関数
 * 
 * @example
 * // 星の如く輝く天才: 基本10% + 量子弱点時+10%
 * createDefIgnoreHandler(
 *   0.1,
 *   (target) => target.weaknesses.has('Quantum') ? 0.1 : 0
 * )
 */
export function createDefIgnoreHandler(
    baseDefIgnore: number,
    condition?: DefIgnoreCondition
): (event: IEvent, state: GameState, sourceUnitId: string) => GameState {
    return (event: IEvent, state: GameState, sourceUnitId: string): GameState => {
        // イベント発生源が装備者でない場合は何もしない
        if (event.sourceId !== sourceUnitId) return state;

        // ターゲットIDが存在しない場合は何もしない
        if (!('targetId' in event) || !event.targetId) return state;

        // ターゲットとソースを取得
        const target = state.registry.get(createUnitId(event.targetId));
        const source = state.registry.get(createUnitId(sourceUnitId));

        // どちらかが存在しない場合は何もしない
        if (!target || !source) return state;

        // 基本の防御無視率を設定
        let totalDefIgnore = baseDefIgnore;

        // 条件関数が指定されている場合、追加の防御無視率を加算
        if (condition) {
            const bonus = condition(target, source);
            totalDefIgnore += bonus;
        }

        // ステートを更新して返す
        return {
            ...state,
            damageModifiers: {
                ...state.damageModifiers,
                defIgnore: (state.damageModifiers.defIgnore || 0) + totalDefIgnore
            }
        };
    };
}

/**
 * 特定の弱点を持つ敵に対して追加の防御無視を適用する条件を生成
 * 
 * @param element チェックする弱点属性
 * @param bonusDefIgnore 弱点がある場合の追加防御無視率
 * @returns 条件関数
 * 
 * @example
 * // 量子弱点がある敵に対して+10%
 * createWeaknessCondition('Quantum', 0.1)
 */
export function createWeaknessCondition(
    element: Element,
    bonusDefIgnore: number
): DefIgnoreCondition {
    return (target: Unit): number => {
        return target.weaknesses.has(element) ? bonusDefIgnore : 0;
    };
}

/**
 * 敵に付与されているデバフの数に応じて防御無視を適用する条件を生成
 * 
 * @param perDebuffBonus デバフ1つあたりの防御無視率
 * @param maxStacks カウントする最大デバフ数（省略可）
 * @returns 条件関数
 * 
 * @example
 * // デバフ1つにつき6%、最大3個まで
 * createDebuffCountCondition(0.06, 3)
 */
export function createDebuffCountCondition(
    perDebuffBonus: number,
    maxStacks?: number
): DefIgnoreCondition {
    return (target: Unit): number => {
        const debuffCount = target.effects.filter(e => e.category === 'DEBUFF').length;
        const stacks = maxStacks ? Math.min(debuffCount, maxStacks) : debuffCount;
        return perDebuffBonus * stacks;
    };
}

/**
 * 敵に付与されているDoT（持続ダメージ）の数に応じて防御無視を適用する条件を生成
 * 
 * @param perDotBonus DoT1つあたりの防御無視率
 * @param maxStacks カウントする最大DoT数（省略可）
 * @returns 条件関数
 * 
 * @example
 * // DoT1つにつき6%、最大3個まで
 * createDotCountCondition(0.06, 3)
 */
export function createDotCountCondition(
    perDotBonus: number,
    maxStacks?: number
): DefIgnoreCondition {
    return (target: Unit): number => {
        // 一般的なDoTタイプ
        const dotTypes = ['Burn', 'Shock', 'Bleed', 'Wind Shear', 'Entanglement'];

        const dotCount = target.effects.filter(e => {
            if (e.category !== 'DEBUFF') return false;

            // statusType または name でDoTを判定
            const statusType = (e as any).statusType;
            return dotTypes.includes(statusType) || dotTypes.some(dt => e.name.includes(dt));
        }).length;

        const stacks = maxStacks ? Math.min(dotCount, maxStacks) : dotCount;
        return perDotBonus * stacks;
    };
}

/**
 * 複数の条件を組み合わせる
 * 
 * @param conditions 条件関数の配列
 * @returns 組み合わせた条件関数
 * 
 * @example
 * // 量子弱点+10%とデバフ数×5%を組み合わせ
 * combineConditions(
 *   createWeaknessCondition('Quantum', 0.1),
 *   createDebuffCountCondition(0.05)
 * )
 */
export function combineConditions(
    ...conditions: DefIgnoreCondition[]
): DefIgnoreCondition {
    return (target: Unit, source: Unit): number => {
        return conditions.reduce((total, condition) => {
            return total + condition(target, source);
        }, 0);
    };
}

/**
 * スキルポイント（SP）を増減させる
 * 
 * @param state ゲーム状態
 * @param amount 増減量（正の数で増加、負の数で減少）
 * @returns 更新されたゲーム状態
 * 
 * @example
 * // 通常攻撃: SP+1
 * state = addSkillPoints(state, 1);
 * 
 * // スキル使用: SP-1
 * state = addSkillPoints(state, -1);
 * 
 * // 流雲無痕の過客: 戦闘開始時SP+1
 * return addSkillPoints(state, 1);
 * 
 * // アーカーE6: SP+2
 * newState = addSkillPoints(newState, 2);
 */
export function addSkillPoints(state: GameState, amount: number, sourceId: string = 'system'): GameState {
    const currentSP = state.skillPoints;
    const maxSP = state.maxSkillPoints;

    // 新しいSP値を計算（0 ≤ newSP ≤ maxSP）
    const newSP = Math.max(0, Math.min(maxSP, currentSP + amount));

    // デバッグログ（変更があった場合のみ）
    if (newSP !== currentSP) {
        const sign = amount > 0 ? '+' : '';
        console.log(`[SP] ${currentSP} -> ${newSP} (${sign}${amount}) by ${sourceId}`);
    }

    let newState = {
        ...state,
        skillPoints: newSP
    };

    // SP変更イベントを発火
    // SP増加の場合、rawAmount（試行量）も含める（オーバーフローカウント用）
    if (amount > 0) {
        newState = publishEvent(newState, {
            type: 'ON_SP_GAINED',
            sourceId: sourceId,
            value: newSP - currentSP,
            rawAmount: amount  // 試行した回復量（上限クランプ前）
        });
    } else if (newSP < currentSP) {
        newState = publishEvent(newState, {
            type: 'ON_SP_CONSUMED',
            sourceId: sourceId,
            value: currentSP - newSP
        });
    }

    return newState;
}
