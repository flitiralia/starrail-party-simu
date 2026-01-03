import { Element, IUnitData } from './index';

// =============================================================================
// 敵ランク定義
// =============================================================================

export type EnemyRank = 'Normal' | 'Elite' | 'Boss';

// =============================================================================
// 敵スキル定義
// =============================================================================

/**
 * 敵スキルのターゲットタイプ
 */
export type EnemySkillTargetType = 'single' | 'blast' | 'aoe' | 'lock_on';

/**
 * 敵スキル定義（キャラクターと異なる構造）
 * 
 * キャラクターのIAbilityとは別に、敵専用のスキル構造を定義する。
 * 敵スキルはエネルギー獲得やもつれ付与など、敵固有の仕様を持つ。
 */
export interface EnemySkill {
  /** スキルID */
  id: string;
  /** スキル名 */
  name: string;
  /** ターゲットタイプ */
  targetType: EnemySkillTargetType;
  /** ダメージ情報（ダメージを与えないスキルは省略） */
  damage?: {
    multiplier: number;         // ATK倍率
    toughnessReduction: number; // 削靭値
  };
  /** エネルギー獲得（仕様書のEnergy値） */
  energyGain?: number;
  /** デバフ付与確率（0.0〜1.0）*/
  baseChance?: number;
  /** 付与するデバフタイプ */
  debuffType?: 'Entanglement' | 'Freeze' | 'Burn' | 'Shock' | 'WindShear' | 'Bleed';
  /** もつれ（Entanglement）の追加パラメータ */
  entanglementParams?: {
    actionDelay: number;          // 行動遅延（0.5 = 50%）
    delayedDmgMultiplier: number; // 遅延ダメージ倍率
  };
}

/**
 * 敵ターン行動パターン
 * 
 * 各ターンで実行する1番目と2番目のアクションを定義。
 * secondaryはpendingActionsに追加されて同一ターン内で実行される。
 */
export interface EnemyTurnPattern {
  /** 1番目のアクション（使用するスキルID） */
  primary: string;
  /** 2番目のアクション（省略可、pendingActionsに追加） */
  secondary?: string;
}

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

  // スキル定義（後方互換性のため残す）
  abilities: IUnitData['abilities'];

  // === 新しい敵スキルシステム ===
  /** 敵専用スキル定義 */
  enemySkills?: Record<string, EnemySkill>;
  /** ターンごとの行動パターン（配列のインデックス = ターン数 - 1） */
  turnPatterns?: EnemyTurnPattern[];
  /** 弱点撃破復帰時にパターンをリセットするか */
  resetPatternOnBreakRecovery?: boolean;

  // 行動パターン（旧システム、後方互換性のため残す）
  actionPattern?: string[];

  // === カスタム敵用オーバーライドフィールド ===
  // isCustomがtrueの場合、以下の値が優先される
  isCustom?: boolean;
  overrideHp?: number;      // hpMultiplier計算を無視し、この値を直接使用
  overrideAtk?: number;     // atkMultiplier計算を無視し、この値を直接使用
  overrideSpd?: number;     // baseSpd×レベル補正を無視し、この値を直接使用
  overrideDef?: number;     // レベル計算を無視し、この値を直接使用

  // === 被弾時EP回復量 ===
  // 敵が味方にダメージを与えた時、味方が回復するEP量
  // 未設定時はデフォルト値（5EP）を使用
  damageReceivedEnergyReward?: number;

  // === デバフ抵抗（オプショナル） ===
  // 各デバフに対する個別抵抗（0.0 = 0%, 1.0 = 100%）
  // 未設定の項目は0%として扱われる
  debuffRes?: {
    freeze?: number;        // 凍結抵抗
    burn?: number;          // 燃焼抵抗
    shock?: number;         // 感電抵抗
    windShear?: number;     // 裂傷（風）抵抗
    bleed?: number;         // 出血抵抗
    entanglement?: number;  // もつれ抵抗
    imprisonment?: number;  // 禁錮抵抗
    crowdControl?: number;  // 行動制限系全般抵抗
  };
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
