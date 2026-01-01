import { StatKey, FinalStats } from './stats';
import { EventType, GameState } from '../simulator/engine/types';

/**
 * 複数の閾値によって段階的に変化する値を表す型。
 * 例: 速度が135/160で効果が変わる場合、 [0.12, 0.18] のように表現する。
 */
export type TieredValue = number[];

/**
 * 遺物効果のターゲット
 */
export type RelicEffectTarget = 'self' | 'all_allies' | 'other_allies' | 'all_enemies';

/**
 * 条件評価のタイミング
 * - 'battle_start': 戦闘開始時のみ評価（例：亡国の悲哀を詠う詩人）
 * - 'dynamic': 毎ターン再評価（デフォルト、例：折れた竜骨）
 */
export type EvaluationTiming = 'battle_start' | 'dynamic';

/**
 * パッシブステータスバフの定義
 * 条件(condition)が満たされている間、自動的に適用される。
 */
export interface PassiveRelicEffect {
  type?: 'PASSIVE_STAT';
  stat: StatKey;
  value: number; // 固定値または割合（StatKeyに依存）
  target: RelicEffectTarget;
  condition?: (stats: FinalStats, state: GameState, unitId: string) => boolean;
  evaluationTiming?: EvaluationTiming; // デフォルト: 'dynamic'
}

/**
 * イベントトリガー効果の定義
 * 特定のイベントが発生した際に実行されるロジック。
 */
export interface EventRelicEffect {
  type?: 'EVENT_TRIGGER';
  events: EventType[];
  handler: (event: any, state: GameState, unitId: string) => GameState;
}

/**
 * 遺物セット効果のユニオン型
 */
export type RelicEffect = PassiveRelicEffect | EventRelicEffect;

/**
 * 2セット効果または4セット効果の内容を定義する。
 */
export interface SetBonus {
  pieces: 2 | 4;
  description: string;
  passiveEffects?: PassiveRelicEffect[];
  eventHandlers?: EventRelicEffect[];
}

/**
 * 遺物セット（トンネル遺物）全体のデータ構造。
 */
export interface RelicSet {
  id: string;
  name: string;
  setBonuses: SetBonus[];
  iconPath?: string; // StarRailStaticAPI 用のアイコンパス
}

/**
 * オーナメントセット（次元界オーナメント）全体のデータ構造。
 */
export interface OrnamentSet {
  id: string;
  name: string;
  setBonuses: SetBonus[];
  iconPath?: string; // StarRailStaticAPI 用のアイコンパス
}

export type RelicType = 'Head' | 'Hands' | 'Body' | 'Feet';
export type OrnamentType = 'Planar Sphere' | 'Link Rope';

export interface RelicStatRecord {
  stat: StatKey;
  value: number;
}

export interface IRelicData {
  set: RelicSet;
  type: RelicType;
  level: number;
  mainStat: RelicStatRecord;
  subStats: RelicStatRecord[];
}

export interface IOrnamentData {
  set: OrnamentSet;
  type: OrnamentType;
  level: number;
  mainStat: RelicStatRecord;
  subStats: RelicStatRecord[];
}
