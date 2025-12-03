import { z } from 'zod'; // Zodをインポート
import { StatKey, FinalStats, Modifier, StatKeySchema } from './stats'; // Modifier, FinalStatsを追加, StatKeySchemaをインポート
import { ILightConeData } from './lightcone';
import { IRelicData, IOrnamentData } from './relic';
import { Unit, GameState } from '../simulator/engine/types';
import { IEffect } from '../simulator/effect/types';

// prettier-ignore
export const PATHS = ['The Hunt', 'Erudition', 'Destruction', 'Harmony', 'Nihility', 'Preservation', 'Abundance', 'Memory'] as const;
export type Path = (typeof PATHS)[number];

// prettier-ignore
export const ELEMENTS = ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary'] as const;
export type Element = (typeof ELEMENTS)[number];

export type EventType = 'ON_DAMAGE_DEALT' | 'ON_TURN_START' | 'ON_SKILL_USED' | 'ON_ULTIMATE_USED' | 'ON_UNIT_HEALED' | 'ON_BASIC_ATTACK' | 'ON_WEAKNESS_BREAK' | 'ON_BEFORE_DAMAGE_CALCULATION' | 'ON_DEBUFF_APPLIED' | 'ON_BATTLE_START';

/**
 * キャラクターのレベル80時点での基礎ステータス（光円錐を含まない）
 * 会心率: 5%, 会心ダメージ: 50% が基礎値
 */
export const CharacterBaseStatsSchema = z.object({
  hp: z.number(),
  atk: z.number(),
  def: z.number(),
  spd: z.number(),
  critRate: z.literal(0.05), // Zodではexact valueを指定できる
  critDmg: z.literal(0.5),
  aggro: z.number(),
});

export type CharacterBaseStats = z.infer<typeof CharacterBaseStatsSchema>;

export type AbilityType = 'Basic ATK' | 'Skill' | 'Ultimate' | 'Talent' | 'Technique';

/**
 * スキル、必殺技、天賦などのデータ構造
 */
// Discriminated Union for Damage Logic
export type DamageLogic =
  | ISimpleDamage
  | IBlastDamage
  | IBounceDamage;

export interface ISimpleDamage {
  type: 'simple';
  scaling: 'atk' | 'def' | 'hp';
  multiplier: number; // Applies to all targets equally
}

export interface IBlastDamage {
  type: 'blast';
  scaling: 'atk' | 'def' | 'hp';
  mainMultiplier: number;     // For the primary target
  adjacentMultiplier: number; // For adjacent targets
}

export interface IBounceDamage {
  type: 'bounce';
  scaling: 'atk' | 'def' | 'hp';
  multipliers: number[]; // Array of multipliers for each hit in sequence
  // e.g. [0.5, 0.25, 0.25] means 1st hit 50%, 2nd 25%, 3rd 25%
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
  damage?: DamageLogic;
  additionalDamage?: DamageLogic[]; // For additional damage sources (e.g. E4)
  shield?: { multiplier: number, flat: number, scaling: 'atk' | 'def' | 'hp', duration?: number };
  energyGain?: number;
  toughnessReduction?: number | { main: number; adjacent: number }; // Base toughness reduction
  hits?: number; // Number of hits for status application checks (default: 1)
  spCost?: number; // SP cost for this ability (default: 1 for skills)

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
  };
  // シミュレーション中に付与される動的な効果
  effects?: IEffect[];
}

// --- 星魂(Eidolon) ---

/**
 * アビリティのパラメータ変更定義
 */
export interface AbilityModifier {
  abilityName: 'basic' | 'skill' | 'ultimate' | 'talent';
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
 * ゲーム内キャラクターの完全なデータ構造
 * IUnitData を継承し、キャラクター固有の情報を追加
 */
export interface Character extends IUnitData {
  path: Path;
  rarity: 4 | 5; // キャラクターのレアリティ
  maxEnergy: number;

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
 * 個別キャラクターのローテーション設定
 */
export interface CharacterRotationConfig {
  rotation: string[]; // 行動パターン（例: ['s', 'b', 'b']）
  ultStrategy: 'immediate' | 'cooldown'; // 必殺技発動戦略
  ultCooldown: number; // 必殺技のクールダウン（ターン数）
}

/**
 * パーティメンバーの完全なデータ構造
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
export * from '../simulator/engine/simulation'; // EnemyConfigなどをここからエクスポート
export * from './worker'; // SimulationWorkerMessageなどをここからエクスポート

/**
 * シミュレーションログの単一エントリのデータ構造
 */
export interface SimulationLogEntry {
  characterName?: string; // Optional now
  actionTime?: number;
  actionType: string;
  skillPointsAfterAction?: number;
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
  activeEffects?: { name: string; duration: number | '∞'; stackCount?: number; owner?: string }[];
}
