import { Path, IEffect, StatKey, FinalStats, EventType } from './index';
import { Unit, GameState, GameEvent } from '../simulator/engine/types';

/**
 * 光円錐の基礎ステータス（レベル80）
 */
export interface LightConeBaseStats {
  hp: number;
  atk: number;
  def: number;
}

/**
 * 重畳ランク1から5に対応する値のタプル
 * 例: [0.08, 0.10, 0.12, 0.14, 0.16]
 */
export type SuperimpositionValue = [number, number, number, number, number];

/**
 * クールダウンリセットのタイミング
 * - 'wearer_turn': 装備キャラのターン開始時のみリセット（デフォルト）
 * - 'any_turn': 任意のターン開始時にリセット（輪契など被弾トリガーがある場合）
 */
export type CooldownResetType = 'wearer_turn' | 'any_turn';

/**
 * パッシブ効果（ステータス変更のみ）
 */
export interface PassiveLightConeEffect {
  id: string;
  name: string;
  category: 'BUFF' | 'DEBUFF';
  targetStat: StatKey;
  effectValue: SuperimpositionValue;
  condition?: (stats: FinalStats) => boolean;
  calculateValue?: (stats: FinalStats, superimposition: number) => number; // 動的計算用
}

/**
 * イベント駆動ハンドラー
 */
export interface LightConeEventHandler {
  id: string;
  name: string;
  events: EventType[];
  cooldownResetType?: CooldownResetType; // デフォルト: 'wearer_turn'
  handler: (
    event: GameEvent,
    state: GameState,
    unit: Unit,
    superimposition: number
  ) => GameState;
}

/**
 * 光円錐が持つ効果のデータ構造（DEPRECATED）
 * 新規実装ではPassiveLightConeEffectまたはLightConeEventHandlerを使用してください
 */
export interface ILightConeEffect extends IEffect {
  effectValue?: SuperimpositionValue;
  targetStat?: StatKey;
  condition?: (stats: FinalStats) => boolean;
  customHandler?: boolean;
  cooldownResetType?: CooldownResetType;
}

/**
 * 光円錐全体のデータ構造
 */
/**
 * 重畳ランク1から5に対応する説明文の値配列
 */
export type SuperimpositionDescriptionValues = [string[], string[], string[], string[], string[]];

export interface ILightConeData {
  id: string;
  name: string;
  description: string;
  /** プレースホルダー({0}, {1}, ...)付きの説明文テンプレート */
  descriptionTemplate?: string;
  /** 重畳ランクごとのプレースホルダー値 [S1, S2, S3, S4, S5] */
  descriptionValues?: SuperimpositionDescriptionValues;
  path: Path;
  baseStats: LightConeBaseStats;

  // 新形式（推奨）
  passiveEffects?: PassiveLightConeEffect[];
  eventHandlers?: LightConeEventHandler[];

  // 旧形式（後方互換性のため維持）
  effects?: ILightConeEffect[];
}
