/**
 * イベントヘルパー関数
 * アクションイベントのターゲットタイプ判定などを提供
 */

import { ActionEvent } from './types';

/**
 * イベントが単体味方ターゲットのアクションかを判定
 */
export function isSingleAllyTargetAction(event: ActionEvent): boolean {
    return event.targetType === 'ally' && !!event.targetId;
}

/**
 * イベントが単体敵ターゲットのアクションかを判定
 */
export function isSingleEnemyTargetAction(event: ActionEvent): boolean {
    return event.targetType === 'single_enemy' && !!event.targetId;
}

/**
 * イベントが自己ターゲットのアクションかを判定
 */
export function isSelfTargetAction(event: ActionEvent): boolean {
    return event.targetType === 'self';
}

/**
 * イベントが全体味方ターゲットのアクションかを判定
 */
export function isAllAlliesTargetAction(event: ActionEvent): boolean {
    return event.targetType === 'all_allies';
}

/**
 * イベントが全体敵ターゲットのアクションかを判定
 */
export function isAllEnemiesTargetAction(event: ActionEvent): boolean {
    return event.targetType === 'all_enemies';
}

/**
 * イベントが拡散（blast）ターゲットのアクションかを判定
 */
export function isBlastTargetAction(event: ActionEvent): boolean {
    return event.targetType === 'blast';
}
