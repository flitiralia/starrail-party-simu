import { IEffect, DoTEffect, ShieldEffect, BreakStatusEffect } from './types';

export function isDoTEffect(effect: IEffect): effect is DoTEffect {
    return effect.type === 'DoT';
}

export function isShieldEffect(effect: IEffect): effect is ShieldEffect {
    return effect.type === 'Shield';
}

export function isBreakStatusEffect(effect: IEffect): effect is BreakStatusEffect {
    return effect.type === 'BreakStatus';
}

export function isCrowdControlEffect(effect: IEffect): boolean {
    if (isBreakStatusEffect(effect)) {
        return ['Freeze', 'Entanglement', 'Imprisonment'].includes(effect.statusType);
    }
    return false;
}
