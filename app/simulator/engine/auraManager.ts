// オーラシステム管理
// ソースユニットがフィールド上にいる間のみ有効な永続効果を管理

import { GameState, IAura } from './types';
import { StatKey } from '../../types';
import { UnitId, createUnitId } from './unitId'; // Import added

/**
 * オーラを登録する
 * @param state 現在のGameState
 * @param aura 登録するオーラ
 * @returns 更新されたGameState
 */
export function addAura(state: GameState, aura: IAura): GameState {
    // 既に同じIDのオーラがある場合は更新
    const existingIndex = state.auras.findIndex(a => a.id === aura.id);
    if (existingIndex !== -1) {
        const newAuras = [...state.auras];
        newAuras[existingIndex] = aura;
        return { ...state, auras: newAuras };
    }

    return {
        ...state,
        auras: [...state.auras, aura]
    };
}

/**
 * オーラを削除する
 * @param state 現在のGameState
 * @param auraId 削除するオーラのID
 * @returns 更新されたGameState
 */
export function removeAura(state: GameState, auraId: string): GameState {
    return {
        ...state,
        auras: state.auras.filter(a => a.id !== auraId)
    };
}

/**
 * ソースユニットに関連するすべてのオーラを削除する
 * ユニット死亡時に呼び出す
 * @param state 現在のGameState
 * @param sourceUnitId ソースユニットのID
 * @returns 更新されたGameState
 */
export function removeAurasBySource(state: GameState, sourceUnitId: string): GameState {
    const aurasToRemove = state.auras.filter(a => a.sourceUnitId === sourceUnitId);

    if (aurasToRemove.length === 0) return state;

    console.log(`[AuraManager] Removing ${aurasToRemove.length} auras from source ${sourceUnitId}`);

    return {
        ...state,
        auras: state.auras.filter(a => a.sourceUnitId !== sourceUnitId)
    };
}

/**
 * オーラからユニットへの効果を計算する
 * statBuilderから呼び出される
 * @param state GameState
 * @param unitId 対象ユニットのID
 * @returns そのユニットに適用されるオーラのモディファイア
 */
export function getAuraModifiersForUnit(
    state: GameState,
    unitId: string
): { target: StatKey; value: number; type: 'add' | 'pct'; source: string }[] {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return [];

    const modifiers: { target: StatKey; value: number; type: 'add' | 'pct'; source: string }[] = [];

    for (const aura of state.auras) {
        // ソースユニットが生存しているか確認
        const source = state.registry.get(createUnitId(aura.sourceUnitId));
        if (!source || source.hp <= 0) continue;

        // ターゲット判定
        let applies = false;
        switch (aura.target) {
            case 'self':
                applies = unitId === aura.sourceUnitId;
                break;
            case 'all_allies':
                applies = !unit.isEnemy;
                break;
            case 'other_allies':
                applies = !unit.isEnemy && unitId !== aura.sourceUnitId;
                break;
            case 'all_enemies':
                applies = unit.isEnemy;
                break;
        }

        if (applies) {
            modifiers.push(...aura.modifiers);
        }
    }

    return modifiers;
}

/**
 * オーラ効果をログ用のサマリーに変換
 * @param state GameState
 * @param unitId 対象ユニットのID
 * @returns ログ表示用のオーラ効果リスト
 */
export function getAurasForLog(
    state: GameState,
    unitId: string
): { name: string; sourceName: string; modifiers: { stat: string; value: number }[] }[] {
    const unit = state.registry.get(createUnitId(unitId));
    if (!unit) return [];

    const result: { name: string; sourceName: string; modifiers: { stat: string; value: number }[] }[] = [];

    for (const aura of state.auras) {
        // ソースユニットを取得
        const source = state.registry.get(createUnitId(aura.sourceUnitId));
        if (!source || source.hp <= 0) continue;

        // ターゲット判定
        let applies = false;
        switch (aura.target) {
            case 'self':
                applies = unitId === aura.sourceUnitId;
                break;
            case 'all_allies':
                applies = !unit.isEnemy;
                break;
            case 'other_allies':
                applies = !unit.isEnemy && unitId !== aura.sourceUnitId;
                break;
            case 'all_enemies':
                applies = unit.isEnemy;
                break;
        }

        if (applies) {
            result.push({
                name: `[オーラ] ${aura.name}`,
                sourceName: source.name,
                modifiers: aura.modifiers.map(m => ({
                    stat: m.target,
                    value: m.value
                }))
            });
        }
    }

    return result;
}
