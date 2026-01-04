import { StatKey, FinalStats, Modifier } from './stats';
import { ILightConeData } from './lightcone';
import { IRelicData, IOrnamentData } from './relic';
import { Unit, GameState } from '../simulator/engine/types';
import { IEffect } from '../simulator/effect/types';

// prettier-ignore
export const PATHS = ['The Hunt', 'Erudition', 'Destruction', 'Harmony', 'Nihility', 'Preservation', 'Abundance', 'Remembrance'] as const;
export type Path = (typeof PATHS)[number];

// prettier-ignore
export const ELEMENTS = ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary'] as const;
export type Element = (typeof ELEMENTS)[number];


// prettier-ignore
export type EventType =
  | 'ON_ACTION_START'
  | 'ON_ACTION_COMPLETE'
  | 'ON_TURN_START'
  | 'ON_TURN_END'
  | 'ON_BATTLE_START'
  | 'ON_WAVE_START'
  | 'ON_ATTACK'
  | 'ON_DAMAGE_DEALT'
  | 'ON_DAMAGE_RECEIVED'
  | 'ON_BEFORE_DAMAGE_RECEIVED'  // ダメージ受ける前（符玄のダメージ分担等）
  | 'ON_HEAL_RECEIVED'
  | 'ON_UNIT_HEALED' // Legacy
  | 'ON_DEATH'
  | 'ON_BEFORE_DEATH'  // ユニット死亡前（符玄E2蘇生防止等）
  | 'ON_REVIVE'
  | 'ON_SKILL_USED'
  | 'ON_ULTIMATE_USED'
  | 'ON_BREAK' // 弱点撃破時
  | 'ON_WEAKNESS_BREAK' // Alias
  | 'ON_ENEMY_SPAWNED'
  | 'ON_BUFF_ADDED'
  | 'ON_BUFF_REMOVED'
  | 'ON_DEBUFF_ADDED'
  | 'ON_DEBUFF_REMOVED'
  | 'ON_EP_GAINED'
  | 'ON_SP_GAINED' // SP回復時
  | 'ON_SP_CONSUMED' // SP消費時
  | 'ON_BEFORE_DAMAGE_CALCULATION' // ダメージ計算前
  | 'ON_ENEMY_DEFEATED'
  | 'ON_BEFORE_ACTION'
  | 'ON_BEFORE_ATTACK'
  | 'ON_BEFORE_HIT'
  | 'ON_AFTER_HIT'
  | 'ON_WEAKNESS_BREAK_RECOVERY_ATTEMPT'
  | 'ON_ENHANCED_BASIC_ATTACK'
  | 'ON_FOLLOW_UP_ATTACK'
  | 'ON_DOT_DAMAGE'
  | 'ON_EFFECT_APPLIED'
  | 'ON_EFFECT_REMOVED'
  | 'ON_UNIT_DEATH'
  | 'ON_DEBUFF_APPLIED'
  | 'ON_BASIC_ATTACK'
  | 'ON_HP_CONSUMED';


/**
 * キャラクターのレベル80時点での基礎ステータス（光円錐を含まない）
 * 会心率: 5%, 会心ダメージ: 50% が基礎値
 */
/**
 * キャラクターのレベル80時点での基礎ステータス
 * 会心率: 5%, 会心ダメージ: 50% が基礎値
 */
export interface CharacterBaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  critRate: 0.05;
  critDmg: 0.5;
  aggro: number;
  effect_hit_rate?: number;
  effect_res?: number;
}

export type AbilityType = 'Basic ATK' | 'Skill' | 'Ultimate' | 'Talent' | 'Technique';

/**
 * スキル、必殺技、天賦などのデータ構造
 */

/**
 * ヒットごとのダメージと削靭値情報
 */
export interface IHitDefinition {
  multiplier: number;          // ダメージ倍率
  toughnessReduction: number;  // 削靭値
}

// Discriminated Union for Damage Logic
export type DamageLogic =
  | ISimpleDamage
  | IBlastDamage
  | IBounceDamage
  | IAoEDamage;

export interface ISimpleDamage {
  type: 'simple';
  scaling: 'atk' | 'def' | 'hp' | 'accumulated_healing';
  accumulatorOwnerId?: string; // 累計値の所有者ID（accumulated_healing用）
  hits: IHitDefinition[];     // 各ヒットの情報
}

export interface IBlastDamage {
  type: 'blast';
  scaling: 'atk' | 'def' | 'hp' | 'accumulated_healing';
  accumulatorOwnerId?: string;
  mainHits: IHitDefinition[];      // メインターゲットへのヒット
  adjacentHits: IHitDefinition[];  // 隣接ターゲットへのヒット
}

export interface IBounceDamage {
  type: 'bounce';
  scaling: 'atk' | 'def' | 'hp' | 'accumulated_healing';
  accumulatorOwnerId?: string;
  hits: IHitDefinition[];     // 各バウンドのヒット情報
}

/**
 * 全体攻撃（AoE）のダメージ定義
 */
export interface IAoEDamage {
  type: 'aoe';
  scaling: 'atk' | 'def' | 'hp' | 'accumulated_healing';
  accumulatorOwnerId?: string;
  hits: IHitDefinition[];      // 各ターゲットへのヒット（全員に同じヒット配列）
}

/**
 * スキル、必殺技、天賦などのデータ構造
 */
export interface IAbility {
  id: string;
  name: string;
  type: AbilityType;
  description: string;

  // Structured data for simulation
  // Structured data for simulation
  targetType?: 'single_enemy' | 'all_enemies' | 'ally' | 'all_allies' | 'self' | 'blast' | 'bounce';
  manualTargeting?: boolean; // If true, allows manual target selection in UI for 'ally' type skills
  damage?: DamageLogic;
  additionalDamage?: DamageLogic[]; // For additional damage sources (e.g. E4)
  shield?: { multiplier: number, flat: number, scaling: 'atk' | 'def' | 'hp', duration?: number };
  energyGain?: number;
  spCost?: number; // SP cost for this ability (default: 1 for skills)
  spGain?: number; // SP gain for this ability (default: 1 for basic, 0 for enhanced basic)

  // Ability Effects (Debuffs, Buffs, etc.)
  effects?: {
    type: 'Freeze' | 'Burn' | 'Shock' | 'WindShear' | 'Bleed' | 'Imprisonment' | 'Entanglement' | 'Buff' | 'Cleanse';
    baseChance?: number; // Optional for Buffs
    target: 'target' | 'self' | 'all_enemies' | 'all_allies';
    modifiers?: Modifier[]; // For Buffs
    duration?: number; // For Buffs
    name?: string; // For Buffs
    description?: string; // For Buffs/Debuffs
  }[];
}

export type TraceType = 'Bonus Ability' | 'Stat Bonus';

/**
 * 軌跡ノード（追加能力やステータスボーナス）のデータ構造
 */
export interface Trace {
  id: string;
  name: string;
  type: TraceType;
  description: string;
  // For Stat Bonus
  stat?: StatKey;
  value?: number;
}

/**
 * 装備した光円錐とその重畳ランクを表す
 */
export interface EquippedLightCone {
  lightCone: ILightConeData; // LightConeをILightConeDataに
  level: number; // 光円錐のレベルを追加
  superimposition: 1 | 2 | 3 | 4 | 5;
}

/**
 * ゲーム内キャラクターの完全なデータ構造
 */
/**
 * キャラクターと敵の静的なデータを表す共通インターフェース
 * SRPの観点から、シミュレーション中の動的な状態とは分離
 */
export interface IUnitData {
  id: string;
  name: string;
  element: Element;
  baseStats: CharacterBaseStats; // 敵もこれを参照するように調整
  // Character と Enemy で共通の abilities 構造を定義
  abilities: {
    basic: IAbility;
    skill: IAbility;
    ultimate: IAbility;
    talent: IAbility;
    technique: IAbility;
    enhancedBasic?: IAbility; // 強化通常攻撃（刃の無間剣樹など）
    enhancedSkill?: IAbility; // 強化戦闘スキル（ホタルの死星オーバーロードなど）
  };
  // シミュレーション中に付与される動的な効果
  effects?: IEffect[];
  iconPath?: string; // StarRailStaticAPI 用のアイコンパス
  actionPattern?: string[]; // 敵の行動パターン
}

// --- 星魂(Eidolon) ---

/**
 * アビリティのパラメータ変更定義
 */
export interface AbilityModifier {
  abilityName: 'basic' | 'skill' | 'ultimate' | 'talent' | 'enhancedBasic' | 'enhancedSkill';
  param: string; // 変更するパラメータのパス (例: "damage.multiplier", "shield.flat")
  value: number; // 変更後の値
}

export interface Eidolon {
  level: number;
  name: string;
  description: string;
  abilityModifiers?: AbilityModifier[];
  modifiesAbility?: 'basic' | 'skill' | 'ultimate' | 'talent';
}

export interface CharacterEidolons {
  e1?: Eidolon;
  e2?: Eidolon;
  e3?: Eidolon;
  e4?: Eidolon;
  e5?: Eidolon;
  e6?: Eidolon;
}

// --- キャラクター ---

/**
 * キャラクターのデフォルト設定
 * キャラクター選択時に自動的に適用される装備・行動設定
 */
export interface CharacterDefaultConfig {
  /** デフォルト凸数 (0-6) */
  eidolonLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** デフォルト光円錐のID */
  lightConeId?: string;
  /** デフォルト光円錐の重畳ランク */
  superimposition?: 1 | 2 | 3 | 4 | 5;
  /** デフォルト遺物セットのID (4セット用) */
  relicSetId?: string;
  /** デフォルト遺物セットのID (2セット+2セット用) */
  relicSetIds?: [string, string];
  /** デフォルトオーナメントセットのID */
  ornamentSetId?: string;
  /** デフォルトメインステータス (body, feet, sphere, rope) */
  mainStats?: {
    body?: StatKey;
    feet?: StatKey;
    sphere?: StatKey;
    rope?: StatKey;
  };
  /** デフォルトサブステータス */
  subStats?: { stat: StatKey; value: number }[];
  /** デフォルトローテーション */
  rotation?: string[];
  /** ローテーションモード ('sequence' | 'spam_skill' | 'once_skill' | 'spirit_based') */
  rotationMode?: 'sequence' | 'spam_skill' | 'once_skill' | 'spirit_based';
  /** スパムスキル発動SP閾値 */
  spamSkillTriggerSp?: number;
  /** デフォルト必殺技発動方針 */
  ultStrategy?: 'immediate' | 'cooldown';
  /** 必殺技クールダウン（ultStrategy === 'cooldown'の場合） */
  ultCooldown?: number;
  /** 可変EPコストキャラ用（アルジェンティ等） */
  ultEpOption?: 'argenti_90' | 'argenti_180';
  /** キャラクター固有の設定 */
  customConfig?: Record<string, any>;
}

/**
 * ゲーム内キャラクターの完全なデータ構造
 * IUnitData を継承し、キャラクター固有の情報を追加
 */
export interface Character extends IUnitData {
  path: Path;
  rarity: 4 | 5; // キャラクターのレアリティ
  maxEnergy: number;
  // If true, this character ignores standard energy recovery (e.g. Acheron)
  disableEnergyRecovery?: boolean;

  /**
   * 必殺技の消費EP（省略時はmaxEnergyと同じ）
   * セイバーのようにmaxEnergy > 消費EPとなる場合に使用
   */
  ultCost?: number;

  // 軌跡（追加能力とステータスボーナス）
  traces: Trace[];

  // 星魂定義
  eidolons?: CharacterEidolons;

  // 装備中の光円錐
  equippedLightCone?: EquippedLightCone;

  // 装備中の遺物
  relics?: IRelicData[];

  // 装備中のオーナメント
  ornaments?: IOrnamentData[];

  // キャラクターごとのデフォルト設定
  defaultConfig?: CharacterDefaultConfig;
}

/**
 * シミュレーション中に実行される行動のインターフェース
 * 誰が、誰に、何を、いつ行ったか、といった実行時の情報を含む
 */
export interface IAction {
  sourceUnitId: string; // 行動の実行者
  targetUnitIds: string[]; // 行動の対象者（複数可）
  abilityId: string; // 実行された能力のID (IAbility を参照)
  actionType: AbilityType | 'passive_effect' | 'turn_start' | 'turn_end'; // 行動の種類
  // その他の行動固有のプロパティ
}

/**
 * 遺物構成モード
 */
export type RelicMode = '4pc' | '2+2';

/**
 * 個別キャラクターのローテーション設定
 */
export interface CharacterRotationConfig {
  rotation: string[]; // 行動パターン（例: ['s', 'b', 'b']）
  rotationMode?: 'sequence' | 'spam_skill' | 'once_skill' | 'spirit_based'; // 'sequence' (default), 'spam_skill', 'once_skill' or 'spirit_based'
  spamSkillTriggerSp?: number; // SP Threshold to start spamming skill (for 'spam_skill' mode)
  skillTargetId?: string; // Target Character ID (or name-based ID)
  ultStrategy: 'immediate' | 'cooldown'; // 必殺技発動戦略
  ultCooldown: number; // 必殺技のクールダウン（ターン数）
  ultEpOption?: 'argenti_90' | 'argenti_180'; // 可変EPコストキャラ用
  useTechnique?: boolean; // 秘技を使用するか (デフォルト: true)
  customConfig?: Record<string, any>; // キャラクター固有の設定
  relicMode?: RelicMode; // 遺物構成モード ('4pc' | '2+2')
}

/**
 * キャラクター本体 + 装備 + 個別設定を統合
 */
export interface PartyMember {
  character: Character; // キャラクターデータ（装備含む）
  config: CharacterRotationConfig; // 個別の行動設定
  enabled: boolean; // パーティスロットに配置されているか
  eidolonLevel: number; // 星魂レベル (0-6: 0 = 無凸, 6 = 完凸)
}

/**
 * パーティ全体の設定
 */
export interface PartyConfig {
  members: PartyMember[]; // パーティメンバー（最大4人）
}

/**
 * シミュレーション中にユニットに適用される汎用的な効果のインターフェース (バフ/デバフ、特殊効果など)
 * Modifier は IEffect の一種として位置づけられる
 */
export * from './lightcone';
export * from './relic';
export * from './enemy';
export * from './stats';
export * from '../simulator/effect/types'; // IEffect, IStatEffectなどをここからエクスポート
export * from '../simulator/engine/types'; // CharacterConfigなどをここからエクスポート
export * from '../simulator/engine/unitId'; // UnitIdなどをここからエクスポート
export * from '../simulator/engine/simulation'; // EnemyConfigなどをここからエクスポート
export * from './worker'; // SimulationWorkerMessageなどをここからエクスポート

/**
 * 各ヒットの詳細情報
 */
export interface HitDetail {
  hitIndex: number;       // ヒット番号 (0-based)
  multiplier: number;     // 倍率
  damage: number;         // このヒットのダメージ
  isCrit: boolean;        // 会心したか
  toughnessReduction?: number; // 削靭値 (Super Break用)
  targetName?: string;    // ターゲット名（複数ターゲット時）
  // ダメージ計算係数
  breakdownMultipliers?: {
    baseDmg: number;       // 基礎ダメージ
    critMult: number;      // 会心系数 (1.0 or 1.0 + critDmg)
    dmgBoostMult: number;  // 与ダメージ係数
    defMult: number;       // 防御係数
    resMult: number;       // 属性耐性係数
    vulnMult: number;      // 被ダメージ係数
    brokenMult: number;    // 撃破係数
  };
}

/**
 * 付加ダメージエントリ（トリビー結界など）
 */
export type AdditionalDamageType =
  | 'additional'       // 付加ダメージ（会心あり、与ダメ適用）
  | 'normal'           // 通常ダメージ（連携攻撃など）
  | 'break'            // 弱点撃破ダメージ（撃破特効適用）
  | 'break_additional' // 撃破付加ダメージ（凍結・もつれ、撃破特効適用）
  | 'super_break'      // 超撃破ダメージ
  | 'dot'              // 持続ダメージ
  | 'true_damage';     // 確定ダメージ（防御・耐性・会心を無視）

export interface AdditionalDamageEntry {
  source: string;        // "トリビー"
  name: string;          // "結界付加ダメージ"
  damage: number;
  isCrit?: boolean;
  target: string;        // ターゲット名
  damageType?: AdditionalDamageType; // ダメージ種別（ラベル表示用）
  hitIndex?: number;     // ヒット番号（統一表示用）
  multiplier?: number;   // 倍率
  // ダメージ計算係数（HitDetailと同じ形式）
  breakdownMultipliers?: {
    baseDmg: number;
    critMult: number;
    dmgBoostMult: number;
    defMult: number;
    resMult: number;
    vulnMult: number;
    brokenMult: number;
  };
}

/**
 * 被ダメージエントリ（DoT、自傷など）
 */
export interface DamageTakenEntry {
  source: string;        // "敵A" or "自傷" or "裂創"
  type: 'enemy' | 'self' | 'dot';
  damage: number;
  dotType?: string;      // DoTの場合の種類
  // ダメージ計算係数（敵からのダメージ用）
  breakdownMultipliers?: {
    baseDmg: number;
    critMult: number;
    dmgBoostMult: number;
    defMult: number;
    resMult: number;
    vulnMult: number;
    brokenMult: number;
  };
  // HP消費の計算式（self用）
  hpConsumeBreakdown?: {
    maxHp: number;           // 最大HP
    consumeRatio: number;    // 消費割合（例: 0.10 = 10%）
    expectedCost: number;    // 想定コスト（最大HP × 消費割合）
    actualConsumed: number;  // 実際の消費量（HP不足時に調整）
    hpBefore: number;        // 消費前HP
    hpAfter: number;         // 消費後HP
  };
}


/**
 * 回復エントリ
 */
export interface HealingEntry {
  source: string;        // "羅刹"
  name: string;          // "結界回復"
  amount: number;
  target: string;        // 回復対象
  // 回復計算式の内訳
  breakdownMultipliers?: {
    baseHeal: number;           // 基礎回復量（スケーリングステータス × 倍率 + 固定値）
    outgoingHealBoost: number;  // 与回復バフ
    incomingHealBoost: number;  // 受回復バフ
    healBoostMult: number;      // 回復係数 (1 + outgoing + incoming)
    scalingStat?: string;       // 参照ステータス
    multiplier?: number;        // 倍率
    flat?: number;              // 固定値
  };
}

/**
 * シールドエントリ
 */
export interface ShieldEntry {
  source: string;
  name: string;
  amount: number;
  target: string;
  // シールド計算式の内訳
  breakdownMultipliers?: {
    baseShield: number;         // 基礎シールド値（スケーリングステータス × 倍率 + 固定値）
    scalingStat?: string;       // 参照ステータス
    multiplier?: number;        // 倍率
    flat?: number;              // 固定値
    cap?: number;               // 上限値（累積シールドの場合）
  };
}

/**
 * DoT起爆エントリ（カフカなど）
 */
export interface DotDetonationEntry {
  triggeredBy: string;   // "カフカ"
  dotType: string;       // "感電"
  target: string;
  damage: number;
}

/**
 * 装備効果エントリ（光円錐、遺物、オーナメント）
 */
export interface EquipmentEffectEntry {
  source: string;        // ソース（光円錐名、遺物セット名など）
  name: string;          // 効果名（例: "行動順短縮 25%"）
  target?: string;       // 対象（省略可）
  type: 'lightcone' | 'relic' | 'ornament';
}

/**
 * リソース変化エントリ（EP・蓄積値のbefore/after）
 */
export interface ResourceChangeEntry {
  unitId: string;
  unitName: string;
  resourceType: 'ep' | 'accumulator' | 'sp' | 'hp';
  resourceName: string; // EPの場合は'EP'、蓄積値の場合はキー名
  before: number;
  after: number;
  change: number; // after - before
}

/**
 * アクションログの詳細情報（トグル内に表示）
 */
export interface ActionLogDetails {
  // メインアクションのダメージ
  primaryDamage?: {
    hitDetails: HitDetail[];
    totalDamage: number;
  };

  // 付加ダメージ（他キャラからも含む）
  additionalDamage?: AdditionalDamageEntry[];

  // 被ダメージ
  damageTaken?: DamageTakenEntry[];

  // 回復
  healing?: HealingEntry[];

  // シールド
  shields?: ShieldEntry[];

  // DoT起爆（カフカなど）
  dotDetonations?: DotDetonationEntry[];

  // 装備効果（光円錐、遺物、オーナメント）
  equipmentEffects?: EquipmentEffectEntry[];

  // リソース変化（EP・蓄積値）
  resourceChanges?: ResourceChangeEntry[];
}

/**
 * シミュレーションログの単一エントリのデータ構造
 */
export interface EffectSummary {
  name: string;
  duration: number | '∞';
  stackCount?: number;
  value?: number; // 蓄積値（アキュムレーターなど）
  modifiers?: { stat: string; value: number }[];
  owner?: string;
  sourceType?: string; // 'self' | 'target'
}

export interface SimulationLogEntry {
  characterName?: string;
  actionTime?: number;
  actionType: string;
  skillPointsAfterAction?: number;

  // === 集計値（簡易表示） ===
  totalDamageDealt?: number;     // 与ダメ合計（付加含む）
  totalDamageTaken?: number;     // 被ダメ合計（DoT、自傷含む）
  totalHealing?: number;         // 回復合計
  totalShieldGiven?: number;     // 付与したシールド
  totalShieldReceived?: number;  // 受けたシールド

  // === 詳細情報（トグル内） ===
  logDetails?: ActionLogDetails;

  // === 後方互換性のための既存フィールド ===
  damageDealt?: number;
  healingDone?: number;
  shieldApplied?: number;
  sourceHpState?: string;
  targetHpState?: string;
  targetToughness?: string;

  // New fields for detailed logging
  unitId?: string;
  sourceId?: string;
  targetId?: string;
  damage?: number;
  details?: string;
  time?: number;

  // 新しいログ情報: バフ/デバフ名と残ターン数
  currentEp?: number;


  // 新しいログ情報
  activeEffects?: EffectSummary[]; // 後方互換のため
  sourceEffects?: EffectSummary[];
  targetEffects?: EffectSummary[];

  // 統計情報
  statTotals?: {
    source?: { [key: string]: number };
    target?: { [key: string]: number };
  };
  sourceFinalStats?: { [key: string]: number }; // 最終ステータス (ソース)
  targetFinalStats?: { [key: string]: number }; // 最終ステータス (ターゲット)

  // 各ヒットの詳細情報（後方互換性）
  hitDetails?: HitDetail[];

  // アクションキュー情報（デバッグ用）
  actionQueue?: Array<{ unitName: string; actionValue: number }>;
}

// 敵メンバー管理用
export interface EnemyMember {
  id: string; // unique instance id
  enemyId: string; // data id (e.g. 'flamespawn' or 'custom')
  level: number;
  isCustom?: boolean; // カスタム敵かどうか
  customStats?: {
    name?: string;
    hp: number;
    toughness: number;
    spd: number;
    atk?: number;
    def?: number;
    weaknesses?: string[]; // Element[] is better but string[] for simplicity in JSON/storage context if needed, but here Element[] is fine. Let's use Element[] casting or maintain strict typing.
    // Using `any` for element types to avoid import circular dependency if strictly defined, but `Element` is globally available typically.
    // Let's stick to simple numbers for now.
  };
}
