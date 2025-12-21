/**
 * ユニットID型定義
 * Branded Typeパターンで型安全性を確保
 */

// Branded Type for Unit IDs
export type UnitId = string & { readonly __brand: 'UnitId' };

// Branded Type for Effect IDs  
export type EffectId = string & { readonly __brand: 'EffectId' };

/**
 * UnitIdを生成する
 * @param id - 文字列ID
 * @returns Branded UnitId
 */
export function createUnitId(id: string): UnitId {
    return id as UnitId;
}

/**
 * EffectIdを生成する
 * @param id - 文字列ID
 * @returns Branded EffectId
 */
export function createEffectId(id: string): EffectId {
    return id as EffectId;
}

/**
 * ID生成ユーティリティ
 */
export const UnitIdGenerator = {
    /**
     * キャラクター用ユニットID生成
     * @param characterDataId - キャラクターデータのID（例: 'tribbie'）
     * @param slotIndex - パーティスロット番号（0-3、省略可）
     */
    generateCharacterId(characterDataId: string, slotIndex?: number): UnitId {
        return createUnitId(characterDataId);
    },

    /**
     * 敵用ユニットID生成
     * @param enemyDataId - 敵データのID
     * @param spawnIndex - 生成順（省略可）
     */
    generateEnemyId(enemyDataId: string, spawnIndex?: number): UnitId {
        return createUnitId(enemyDataId);
    },

    /**
     * 召喚物/精霊用ユニットID生成
     * @param ownerId - 親ユニットのID
     * @param summonType - 召喚物のタイプ（例: 'memory-spirit', 'toukou'）
     */
    generateSummonId(ownerId: UnitId, summonType: string): UnitId {
        return createUnitId(`${summonType}-${ownerId}`);
    },

    /**
     * エフェクトID生成
     * @param effectType - エフェクトタイプ
     * @param sourceId - ソースユニットID
     * @param targetId - ターゲットユニットID（省略可）
     */
    generateEffectId(effectType: string, sourceId: UnitId, targetId?: UnitId): EffectId {
        return createEffectId(
            targetId
                ? `${effectType}-${sourceId}-${targetId}`
                : `${effectType}-${sourceId}`
        );
    },

    /**
     * 一意なエフェクトID生成（タイムスタンプ付き）
     */
    generateUniqueEffectId(effectType: string, sourceId: UnitId): EffectId {
        return createEffectId(`${effectType}-${sourceId}-${Date.now()}`);
    }
};

/**
 * 文字列がUnitIdかどうかを判定するヘルパー
 * （ランタイムでは常にtrue、型ガード用）
 */
export function isUnitId(value: string): value is UnitId {
    return typeof value === 'string' && value.length > 0;
}

/**
 * 文字列がEffectIdかどうかを判定するヘルパー
 */
export function isEffectId(value: string): value is EffectId {
    return typeof value === 'string' && value.length > 0;
}
