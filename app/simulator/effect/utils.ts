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
        // Only Freeze causes turn skip
        // Entanglement and Imprisonment only cause action delay, not turn skip
        return effect.statusType === 'Freeze';
    }
    return false;
}
