import { Element, IUnitData } from './index';

// =============================================================================
// 敵ランク定義
// =============================================================================

export type EnemyRank = 'Normal' | 'Elite' | 'Boss';

// =============================================================================
// 敵データ定義（静的データ）
// =============================================================================

/**
 * 敵ユニットの静的データ定義。
 * HP/ATKはレベル別基準テーブルに対する倍率で管理する。
 */
export interface EnemyData {
  id: string;
  name: string;
  rank: EnemyRank;

  // HP/ATK倍率（Lv.80基準テーブルに対する比率、小数第4位まで）
  hpMultiplier: number;
  atkMultiplier: number;

  // 速度（基礎値、レベル補正前）
  baseSpd: number;

  // 靭性（レベル非依存）
  toughness: number;

  // 属性と弱点
  element: Element;
  weaknesses: Element[];

  // 属性耐性（弱点以外は通常20%、特殊な敵は40%/60%など）
  elementalRes: Partial<Record<Element, number>>;

  // 効果抵抗の基礎値（ランクごとのデフォルト: Normal=0%, Elite=20%, Boss=30%）
  baseEffectRes: number;

  // スキル定義
  abilities: IUnitData['abilities'];

  // 行動パターン（簡易AI用、省略可）
  actionPattern?: string[];
}

// =============================================================================
// 後方互換性のための Enemy インターフェース
// =============================================================================

/**
 * シミュレーション中の敵ユニット（IUnitDataを継承）。
 * 後方互換性のために維持。
 */
export interface Enemy extends IUnitData {
  toughness: number;
  baseRes: Partial<Record<Element, number>>;
  rank?: EnemyRank;
}
