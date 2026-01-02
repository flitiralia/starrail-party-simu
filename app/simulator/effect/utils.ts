import { IEffect, DoTEffect, ShieldEffect, BreakStatusEffect, CrowdControlEffect, TauntEffect } from './types';

export function isDoTEffect(effect: IEffect): effect is DoTEffect {
    return effect.type === 'DoT';
}

export function isShieldEffect(effect: IEffect): effect is ShieldEffect {
    return effect.type === 'Shield';
}

/**
 * @deprecated isNewCrowdControlEffect を使用してください
 */
export function isBreakStatusEffect(effect: IEffect): effect is BreakStatusEffect {
    return effect.type === 'BreakStatus';
}

/**
 * 新しいCrowdControlEffect型の判定
 */
export function isNewCrowdControlEffect(effect: IEffect): effect is CrowdControlEffect {
    return effect.type === 'CrowdControl';
}

/**
 * 行動制限エフェクトかどうかを判定
 * 新旧両方の型に対応
 */
export function isCrowdControlEffect(effect: IEffect): boolean {
    // 新型: CrowdControlEffect
    if (isNewCrowdControlEffect(effect)) {
        return true;
    }
    // 旧型: BreakStatusEffect（後方互換性）
    if (isBreakStatusEffect(effect)) {
        return ['Freeze', 'Entanglement', 'Imprisonment'].includes(effect.statusType);
    }
    return false;
}

/**
 * 挑発エフェクトかどうかを判定
 */
export function isTauntEffect(effect: IEffect): effect is TauntEffect {
    return effect.type === 'Taunt';
}

