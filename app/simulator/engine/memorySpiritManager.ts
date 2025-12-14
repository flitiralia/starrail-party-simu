/**
 * 記憶の精霊マネージャ
 * 
 * 記憶の運命キャラクター用の汎用精霊システム。
 * イカルン（ヒアンシー）などの記憶の精霊を管理する。
 */

import { Element, IAbility, IUnitData } from '@/app/types';
import { GameState, Unit } from './types';
import { createSummon, getActiveSummon, insertSummonAfterOwner, removeSummon } from './summonManager';
import { addEffect, removeEffect } from './effectManager';
import { IEffect } from '../effect/types';

// ============================================================
// 型定義
// ============================================================

/**
 * 記憶の精霊の静的定義
 * キャラクターごとに1つの定義を持つ
 */
export interface IMemorySpiritDefinition {
    /** 精霊IDのプレフィックス（例: 'ikarun'） */
    idPrefix: string;
    /** 精霊の名前 */
    name: string;
    /** 精霊の属性 */
    element: Element;
    /** オーナーのHPに対する精霊HPの倍率 */
    hpMultiplier: number;
    /** 精霊の基礎速度（通常は低い値） */
    baseSpd: number;
    /** 精霊のアビリティ定義 */
    abilities: IUnitData['abilities'];
    /** デバフ無効かどうか */
    debuffImmune?: boolean;
    /** ターゲット不可かどうか */
    untargetable?: boolean;
    /** 精霊の初期持続時間（ターン数） */
    initialDuration?: number;
}

/**
 * 召喚オプション
 */
export interface SummonOptions {
    /** 召喚時に付与する追加エフェクト */
    additionalEffects?: IEffect[];
    /** linkedUnitIdを設定するか（デフォルト：true） */
    setLinkedUnitId?: boolean;
    /** 持続時間（上書き） */
    duration?: number;
}

/**
 * 召喚結果
 */
export interface SummonResult {
    /** 更新後のGameState */
    state: GameState;
    /** 召喚された精霊 */
    spirit: Unit;
    /** 新規召喚かどうか（falseならリフレッシュ） */
    isNew: boolean;
}

// ============================================================
// 精霊管理関数
// ============================================================

/**
 * 精霊を召喚またはリフレッシュする
 * 
 * @param state - 現在のGameState
 * @param owner - 精霊のオーナー（キャラクター）
 * @param definition - 精霊の定義
 * @param options - 召喚オプション
 * @returns 更新後のstate、精霊、新規召喚かどうか
 */
export function summonOrRefreshSpirit(
    state: GameState,
    owner: Unit,
    definition: IMemorySpiritDefinition,
    options: SummonOptions = {}
): SummonResult {
    let newState = state;
    const existingSpirit = getActiveSummon(newState, owner.id, definition.idPrefix);

    if (existingSpirit) {
        // 既存の精霊をリフレッシュ
        const duration = options.duration ?? definition.initialDuration ?? 2;
        newState = refreshSpiritDuration(newState, existingSpirit.id, duration);

        return {
            state: newState,
            spirit: newState.units.find(u => u.id === existingSpirit.id)!,
            isNew: false
        };
    }

    // 新規召喚
    const spirit = createSummon(owner, {
        idPrefix: definition.idPrefix,
        name: definition.name,
        baseStats: {
            ...owner.stats,
            hp: owner.stats.hp * definition.hpMultiplier,
            spd: definition.baseSpd
        },
        baseSpd: definition.baseSpd,
        element: definition.element,
        abilities: definition.abilities,
        untargetable: definition.untargetable,
        debuffImmune: definition.debuffImmune
    });

    // linkedUnitIdを設定（デフォルトで有効）
    if (options.setLinkedUnitId !== false) {
        spirit.linkedUnitId = owner.id;
    }

    // 精霊をゲームに追加
    newState = insertSummonAfterOwner(newState, spirit, owner.id);

    // 持続時間エフェクトを追加
    const duration = options.duration ?? definition.initialDuration ?? 2;
    newState = addSpiritDurationEffect(newState, spirit.id, owner.id, duration);

    // 追加エフェクトを付与
    if (options.additionalEffects) {
        for (const effect of options.additionalEffects) {
            newState = addEffect(newState, spirit.id, effect);
        }
    }

    return {
        state: newState,
        spirit: newState.units.find(u => u.id === spirit.id)!,
        isNew: true
    };
}

/**
 * 精霊の持続時間をリフレッシュする
 */
export function refreshSpiritDuration(
    state: GameState,
    spiritId: string,
    duration: number
): GameState {
    const spirit = state.units.find(u => u.id === spiritId);
    if (!spirit) return state;

    // 既存の持続時間エフェクトを更新
    const durationEffect = spirit.effects.find(e => e.id.startsWith('spirit-duration-'));
    if (durationEffect) {
        const updatedEffect = { ...durationEffect, duration };
        const updatedEffects = spirit.effects.map(e =>
            e.id === durationEffect.id ? updatedEffect : e
        );
        return {
            ...state,
            units: state.units.map(u =>
                u.id === spiritId ? { ...u, effects: updatedEffects } : u
            )
        };
    }

    return state;
}

/**
 * 精霊の持続時間を1減少させる
 * 持続時間が0になったら精霊を削除
 */
export function reduceSpiritDuration(
    state: GameState,
    spiritId: string
): GameState {
    const spirit = state.units.find(u => u.id === spiritId);
    if (!spirit) return state;

    const durationEffect = spirit.effects.find(e => e.id.startsWith('spirit-duration-'));
    if (!durationEffect) return state;

    const newDuration = durationEffect.duration - 1;

    if (newDuration <= 0) {
        // 精霊を削除
        return dismissSpirit(state, spiritId);
    }

    // 持続時間を更新
    return refreshSpiritDuration(state, spiritId, newDuration);
}

/**
 * 精霊を削除する
 */
export function dismissSpirit(
    state: GameState,
    spiritId: string
): GameState {
    return removeSummon(state, spiritId);
}

/**
 * アクティブな精霊を取得
 */
export function getActiveSpirit(
    state: GameState,
    ownerId: string,
    idPrefix: string
): Unit | undefined {
    return getActiveSummon(state, ownerId, idPrefix);
}

// ============================================================
// 内部ヘルパー関数
// ============================================================

/**
 * 精霊の持続時間を追跡するエフェクトを追加
 */
function addSpiritDurationEffect(
    state: GameState,
    spiritId: string,
    ownerId: string,
    duration: number
): GameState {
    const effect: IEffect = {
        id: `spirit-duration-${spiritId}`,
        name: '精霊持続',
        type: 'Buff',
        category: 'OTHER' as any,
        sourceUnitId: ownerId,
        duration,
        durationType: 'TURN_END_BASED',
        modifiers: [],
        apply: (t: Unit, s: GameState) => s,
        remove: (t: Unit, s: GameState) => s
    };

    return addEffect(state, spiritId, effect);
}
