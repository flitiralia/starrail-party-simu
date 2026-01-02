import { GameState, Unit, IEvent } from "../engine/types";
import { StatKey } from "../../types";

// 効果のカテゴリ
export type EffectCategory = 'BUFF' | 'DEBUFF' | 'STATUS' | 'OTHER';

// 効果の持続時間タイプ
export type DurationType =
  | 'PERMANENT'           // 永続（経過しない）
  | 'TURN_START_BASED'    // ターン開始時に経過（DoT、凍結など）
  | 'TURN_END_BASED'      // ターン終了時に経過（多くのバフ）
  | 'LINKED';             // 他のエフェクトに連動（親エフェクト削除時に自動削除）

// すべての効果が実装すべき基本インターフェース
export interface IEffect {
  id: string; // 効果の一意なID
  name: string; // 表示用の名前
  category: EffectCategory;
  type?: string; // Discriminator for specific effect types (e.g., 'DoT', 'Shield', 'BreakStatus', 'Buff')

  // 効果の発生源
  sourceUnitId: string;

  // 持続時間関連
  durationType: DurationType;
  duration: number; // ターン数など
  stackCount?: number;
  maxStacks?: number;
  /**
   * スタック数の更新戦略
   * - 'auto': 現在の挙動 (Math.max(current + 1, newStack)) ※デフォルト
   * - 'add': 加算 (current + (newStack || 1))
   * - 'replace': 上書き (newStack)
   * - 'max': 最大値維持 (Math.max(current, newStack))
   */
  stackStrategy?: 'auto' | 'add' | 'replace' | 'max';

  // バフ獲得ターン減少スキップ用フラグ（TURN_END_BASED専用）
  // trueの場合、獲得ターンのターン終了時はdurationが減少しない
  skipFirstTurnDecrement?: boolean;
  // 付与時のターン所有者ID（skipFirstTurnDecrement=trueの場合に自動設定）
  appliedDuringTurnOf?: string;

  // Linked Effect用（他のエフェクトに連動）
  linkedEffectId?: string; // 連動する親エフェクトのID（親が削除されると自動削除）

  // 固定確率フラグ（効果命中と効果抵抗を無視）
  ignoreResistance?: boolean;

  // 解除可能フラグ（明示的にtrueの場合のみ解除可能）
  // isDispellable: バフ解除（dispel）可能か（BUFFカテゴリ用）
  // isCleansable: デバフ解除（cleanse）可能か（DEBUFFカテゴリ用）
  isDispellable?: boolean;
  isCleansable?: boolean;

  // ライフサイクルフック
  onApply?: (target: Unit, state: GameState) => GameState;
  onRemove?: (target: Unit, state: GameState) => GameState;
  onTick?: (target: Unit, state: GameState) => GameState; // ターン開始時などに呼ばれる
  onEvent?: (event: IEvent, target: Unit, state: GameState) => GameState; // イベント発生時に呼ばれる
  subscribesTo?: import('../engine/types').EventType[]; // イベント購読リスト

  // ステータス修正用モディファイア（NEW）
  modifiers?: import('../../types/stats').Modifier[];

  /** @deprecated Use onApply instead */
  apply?: (target: Unit, state: GameState, event?: IEvent) => GameState;
  /** @deprecated Use onRemove instead */
  remove?: (target: Unit, state: GameState, event?: IEvent) => GameState;

  // 汎用データストア（カスタム実装用）
  miscData?: Record<string, any>;

  // 汎用タグ (例: 'SKIP_TOUGHNESS_RECOVERY')
  tags?: string[];
}

// ステータスを変動させる効果のインターフェース
export interface IStatEffect extends IEffect {
  stat: StatKey; // 対象となるステータス
  value: number; // 変動値
  isPercentage: boolean; // 割合かどうか
}

// 持続ダメージ効果
export interface DoTEffect extends IEffect {
  type: 'DoT';
  dotType: 'Bleed' | 'Burn' | 'Shock' | 'WindShear' | 'Arcana';
  damageCalculation: 'multiplier' | 'fixed'; // 計算方式
  multiplier?: number;  // damageCalculation === 'multiplier'の場合: ATK × multiplier
  baseDamage?: number;  // damageCalculation === 'fixed'の場合: 固定ダメージ値
}

// シールド効果
export interface ShieldEffect extends IEffect {
  type: 'Shield';
  value: number; // 現在のシールド量
}

// 撃破による特殊状態異常 (凍結、もつれ、禁錮)
// @deprecated CrowdControlEffect を使用してください
export interface BreakStatusEffect extends IEffect {
  type: 'BreakStatus';
  statusType: 'Freeze' | 'Entanglement' | 'Imprisonment';
  // 追加効果のためのパラメータ
  delayAmount?: number; // 遅延量
  speedReduction?: number; // 速度低下量
  frozen?: boolean; // 凍結フラグ
  baseDamagePerStack?: number; // もつれ用: スタックごとのダメージ量
}

/**
 * 行動制限デバフ（凍結/もつれ/禁錮）
 * 
 * 共通仕様:
 * - ターンは回ってくるが行動選択時にスキップされる
 * - ターン開始時に解除された場合は通常行動可能
 * - ダメージ処理は解除より先に実行される
 * 
 * 凍結: 解除時に付加ダメージ、解除後AV50%進行
 * もつれ: ターン開始時に付加ダメージ（スタック依存）、行動順遅延、攻撃ヒット時スタック+1
 * 禁錮: 行動順遅延、速度-10%
 */
export interface CrowdControlEffect extends IEffect {
  readonly type: 'CrowdControl';
  readonly ccType: 'Freeze' | 'Entanglement' | 'Imprisonment';

  /**
   * ダメージ計算方式
   * - 'fixed': baseDamage × 係数（弱点撃破由来）
   * - 'multiplier': 参照ステータス × 倍率（キャラクター由来）
   * - 'none': ダメージなし（禁錮）
   */
  readonly damageCalculation: 'fixed' | 'multiplier' | 'none';

  /** 固定ダメージ値（弱点撃破由来用） */
  readonly baseDamage?: number;

  /** 参照ステータス（キャラクター由来用） */
  readonly scaling?: 'atk' | 'hp' | 'def';

  /** ダメージ倍率（キャラクター由来用） */
  readonly multiplier?: number;

  /** もつれ: スタック数 */
  stackCount?: number;

  /** もつれ: 最大スタック数 */
  readonly maxStacks?: number;

  /** もつれ: スタックごとの基礎ダメージ */
  readonly baseDamagePerStack?: number;

  /** 行動順遅延量（もつれ/禁錮用） */
  readonly delayAmount?: number;

  /** 速度低下率（禁錮用、例: 0.10 = 10%） */
  readonly speedReduction?: number;

  /** 凍結解除時のAV進行率（例: 0.5 = 50%） */
  readonly avAdvanceOnRemoval?: number;
}

/**
 * 挑発効果
 * 
 * 付与された敵は、指定された味方を必ず攻撃する。
 * IDは `taunt-${targetEnemyId}` 形式で、敵1体につき1つの挑発のみ有効。
 * 後から付与された挑発は前の挑発を上書きする。
 */
export interface TauntEffect extends IEffect {
  readonly type: 'Taunt';
  /** 強制的に攻撃させるターゲット（味方のユニットID） */
  readonly targetAllyId: string;
}
