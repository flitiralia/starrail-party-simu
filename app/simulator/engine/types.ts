import { Character, Enemy, FinalStats, Modifier, SimulationLogEntry, Element, IUnitData, IAbility, AdditionalDamageEntry, DamageTakenEntry, HealingEntry, ShieldEntry, DotDetonationEntry, HitDetail, EquipmentEffectEntry, StatKey, CooldownResetType, EventType } from '../../types/index';
import { IEffect } from '../effect/types';
export type { EventType } from '../../types/index';
import { DamageCalculationModifiers } from '../damage';
import { UnitId } from './unitId';
import { UnitRegistry } from './unitRegistry';

/**
 * オーラインターフェース
 * ソースユニットがフィールド上にいる間のみ有効な永続効果
 * ソースユニット死亡時に自動削除される
 */
export interface IAura {
    id: string;
    name: string;
    sourceUnitId: UnitId;
    target: 'all_allies' | 'all_enemies' | 'self' | 'other_allies';
    modifiers: {
        target: StatKey;
        value: number;
        type: 'add' | 'pct';
        source: string;
    }[];
}
export type UltimateStrategy = 'immediate' | 'cooldown';

// アルジェンティ等の可変EPコストキャラ用
export type UltEpOption = 'argenti_90' | 'argenti_180';

export interface CharacterConfig {
    rotation: string[];
    rotationMode?: 'sequence' | 'spam_skill';
    spamSkillTriggerSp?: number;
    skillTargetId?: string;
    ultStrategy: UltimateStrategy;
    ultCooldown: number;
    ultEpOption?: UltEpOption; // 可変EPコストキャラ用
    useTechnique?: boolean; // 秘技を使用するか (デフォルト: true)
    customConfig?: Record<string, any>; // キャラクター固有の設定
}

/**
 * Represents a single unit (character or enemy) on the battlefield.
 * It holds their current state, which changes throughout the simulation.
 */
export interface Unit {
    id: UnitId;
    name: string;
    isEnemy: boolean;
    element: Element;
    level: number;
    abilities: IUnitData['abilities'];
    equippedLightCone?: Character['equippedLightCone'];
    eidolonLevel?: number;
    relics?: Character['relics'];
    ornaments?: Character['ornaments'];
    traces?: Character['traces'];
    path?: import('../../types/index').Path;

    // The full, calculated stats of the unit at the start of combat.
    stats: FinalStats;

    // Reading file first is safer.
    // Base stats (for calculating percentage buffs dynamically)
    baseStats: FinalStats;

    // Dynamic state values
    hp: number;
    ep: number;
    disableEnergyRecovery?: boolean;
    shield: number;
    toughness: number;
    maxToughness: number;
    weaknesses: Set<Element>;

    // List of active modifiers (buffs/debuffs) on this unit.
    modifiers: Modifier[];

    // List of active effects (from light cones, relics, etc.) on this unit.
    effects: IEffect[];

    // Light Cone Event Handler State (cooldowns, activation limits)
    lightConeState?: Record<string, {
        cooldown: number;              // Remaining cooldown turns
        activations: number;           // Activations in current reset cycle
    }>;

    // Current position on the timeline
    actionValue: number;

    // Rotation and strategy state
    config?: CharacterConfig;
    rotationIndex: number;
    ultCooldown: number;

    // Summon related
    isSummon?: boolean;
    ownerId?: UnitId;
    linkedUnitId?: UnitId;
    untargetable?: boolean;
    debuffImmune?: boolean;
}

// ターン終了スキップの終了条件タイプ
export type TurnEndConditionType = 'action_count' | 'sp_threshold';

// ターン終了の終了条件
export interface TurnEndCondition {
    type: TurnEndConditionType;
    actionCount?: number;      // type === 'action_count' の場合: 指定回数アクション後に終了
    spThreshold?: number;      // type === 'sp_threshold' の場合: SPが閾値を下回ったら終了
}

// ターン中の一時状態（ターン終了時に自動クリア）
export interface CurrentTurnState {
    skipTurnEnd: boolean;
    endConditions: TurnEndCondition[];
    actionCount: number; // 現在のアクション回数
}

/**
 * Represents the entire state of the combat simulation at any given moment.
 * This object is intended to be passed around and updated by pure functions.
 */
export interface GameState {
    /** ユニット中央管理レジストリ */
    readonly registry: UnitRegistry<Unit>;

    skillPoints: number;
    maxSkillPoints: number;
    time: number;
    currentTurnOwnerId?: UnitId;
    log: SimulationLogEntry[];
    eventHandlers: IEventHandler[];
    eventHandlerLogics: Record<string, IEventHandlerLogic>;

    // ダメージ計算前イベントでハンドラが一時的に設定する修飾子
    damageModifiers: DamageCalculationModifiers;

    // ハンドラがターンごとにクールダウンを追跡するためのマップ
    cooldowns: Record<string, number>;

    // クールダウンのメタデータ（リセットタイミング制御用）
    cooldownMetadata: Record<string, CooldownMetadata>;

    // 保留アクション（追加攻撃など）
    pendingActions: Action[];

    // タイムライン管理
    actionQueue: ActionQueueEntry[];

    // 戦闘結果
    result: BattleResult;

    // 現在アクションのログ蓄積用
    currentActionLog?: CurrentActionLog;

    // オーラ
    auras: IAura[];

    // ターン中の一時状態（ターン終了時に自動クリア）
    currentTurnState?: CurrentTurnState;
}

/**
 * リソース変化エントリ（EP・蓄積値のbefore/after）
 */
export interface ResourceChangeEntry {
    unitId: string;
    unitName: string;
    resourceType: 'ep' | 'accumulator' | 'sp';
    resourceName: string; // EPの場合は'EP'、蓄積値の場合はキー名
    before: number;
    after: number;
    change: number; // after - before
}

/**
 * 現在実行中アクションのログ蓄積用インターフェース
 */
export interface CurrentActionLog {
    actionId: string;                           // ユニークID
    primarySourceId: string;                    // メインアクション実行者
    primarySourceName: string;                  // メインアクション実行者名
    primaryActionType: string;                  // メインアクション種別
    startTime: number;                          // アクション開始時間

    // メインダメージ
    primaryDamage: {
        hitDetails: HitDetail[];
        totalDamage: number;
    };

    // 蓄積データ
    additionalDamage: AdditionalDamageEntry[];
    damageTaken: DamageTakenEntry[];
    healing: HealingEntry[];
    shields: ShieldEntry[];
    dotDetonations: DotDetonationEntry[];
    equipmentEffects: EquipmentEffectEntry[];

    // リソース変化（EP・蓄積値）
    resourceChanges: ResourceChangeEntry[];

    // アクション開始時のスナップショット（終了時の比較用）
    resourceSnapshot?: {
        ep: Map<string, { unitName: string; value: number }>;           // unitId -> EP
        accumulators: Map<string, { unitName: string; key: string; value: number }>;  // effectId -> { key, value }
        sp: number; // アクション開始時のSP
    };

    details?: string; // ログ詳細追記用
}

/**
 * クールダウンのメタデータ
 */
export interface CooldownMetadata {
    handlerId: string;
    resetType: 'wearer_turn' | 'any_turn';
    ownerId: string; // クールダウンの所有者（装備キャラのID）
}

export interface BattleResult {
    totalDamageDealt: number;
    characterStats: Record<string, {
        damageDealt: number;
        healingDealt: number;
        shieldProvided: number;
    }>;
    outcome?: 'victory' | 'defeat' | 'timeout';  // Battle outcome
}

export interface DamageOptions {
    damageType: string; // 'SKILL', 'DOT', 'ADDITIONAL_DAMAGE' etc.
    isKillRecoverEp?: boolean; // 撃破時EP回復を行うか (default: false)
    skipLog?: boolean; // ログ記録をスキップするか (アクションの一部として記録する場合など)
    skipStats?: boolean; // 統計更新をスキップするか (まとめて更新する場合など)
    events?: {
        type: EventType;
        payload?: unknown;
    }[];
    details?: string; // ログ用の詳細メッセージ

    // ダメージ計算の詳細（HitDetailに含める場合に使用）
    isCrit?: boolean;
    breakdownMultipliers?: {
        baseDmg: number;
        critMult: number;
        dmgBoostMult: number;
        defMult: number;
        resMult: number;
        vulnMult: number;
        brokenMult: number;
    };

    // 付加ダメージのログ自動追加用
    additionalDamageEntry?: {
        source: string;        // ダメージ源（キャラクター名）
        name: string;          // ダメージ名
        damageType?: 'additional' | 'normal' | 'break' | 'break_additional' | 'super_break' | 'dot' | 'true_damage';
        isCrit?: boolean;      // 会心したか
        breakdownMultipliers?: {
            baseDmg: number;
            critMult: number;
            dmgBoostMult: number;
            defMult: number;
            resMult: number;
            vulnMult: number;
            brokenMult: number;
        };
    };
}

export interface DamageResult {
    state: GameState;
    totalDamage: number;
    killed: boolean;
    isCrit?: boolean;
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

export interface ActionQueueEntry {
    unitId: string;
    actionValue: number;
}

// --- Event/Action Handling Interfaces (For DIP and OCP) ---

// --- Event/Action Handling Interfaces (For DIP and OCP) ---



export interface BaseEvent {
    sourceId: string;
}

export interface GeneralEvent extends BaseEvent {
    type: 'ON_BATTLE_START' | 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ENEMY_SPAWNED' | 'ON_UNIT_DEATH';
    targetId?: string;
    value?: number;
}

export interface ActionEvent extends BaseEvent {
    type: 'ON_SKILL_USED' | 'ON_ULTIMATE_USED' | 'ON_BASIC_ATTACK' | 'ON_ENHANCED_BASIC_ATTACK' | 'ON_FOLLOW_UP_ATTACK' | 'ON_ATTACK' | 'ON_WEAKNESS_BREAK' | 'ON_WEAKNESS_BREAK_RECOVERY_ATTEMPT' | 'ON_ACTION_COMPLETE';
    targetId?: string;
    targetType?: 'single_enemy' | 'all_enemies' | 'ally' | 'all_allies' | 'self' | 'blast' | 'bounce';
    subType?: string;
    targetCount?: number;
    adjacentIds?: string[];
    value?: number; // General value field for damage/healing/etc
}

export interface DamageDealtEvent extends BaseEvent {
    type: 'ON_DAMAGE_DEALT';
    targetId: string;
    value: number; // Damage amount
    damageType?: string;
    isCrit?: boolean;
    hitDetails?: import('../../types/index').HitDetail[];
    // Extended properties for logic
    previousHpRatio?: number;
    currentHpRatio?: number;
    actionType?: string; // Used to identify source action type (e.g. 'FOLLOW_UP_ATTACK')
}

export interface HealEvent extends BaseEvent {
    type: 'ON_UNIT_HEALED';
    targetId: string;
    healingDone: number;
    value?: number; // Alias/general field
}

export interface EpGainEvent extends BaseEvent {
    type: 'ON_EP_GAINED';
    targetId: string;
    epGained: number;
    value?: number; // Alias/general field
}

export interface EffectEvent extends BaseEvent {
    type: 'ON_EFFECT_APPLIED' | 'ON_EFFECT_REMOVED' | 'ON_DEBUFF_APPLIED';
    targetId: string;
    effect: IEffect;
}

export interface DoTDamageEvent extends BaseEvent {
    type: 'ON_DOT_DAMAGE';
    targetId: string;
    dotType: 'Bleed' | 'Burn' | 'Shock' | 'WindShear' | 'Arcana';
    damage: number;
    effectId: string;
}

export interface SpGainEvent extends BaseEvent {
    type: 'ON_SP_GAINED';
    value: number; // Amount gained
}

export interface SpConsumeEvent extends BaseEvent {
    type: 'ON_SP_CONSUMED';
    value: number; // Amount consumed
}

export interface BeforeActionEvent extends BaseEvent {
    type: 'ON_BEFORE_ACTION' | 'ON_BEFORE_ATTACK' | 'ON_BEFORE_HIT' | 'ON_AFTER_HIT';
    targetId?: string;
    actionType?: string;
}

export interface HpConsumeEvent extends BaseEvent {
    type: 'ON_HP_CONSUMED';
    targetId: string; // HPを消費したユニット
    sourceId: string; // 消費させたユニット（自身または味方）
    amount: number;
    sourceType?: string; // 消費の原因 (例: 'Skill', 'Technique')
}

export interface BeforeDamageCalcEvent extends BaseEvent {
    type: 'ON_BEFORE_DAMAGE_CALCULATION';
    targetId?: string;
    abilityId?: string;
    element?: import('../../types/index').Element;
    value?: number;
    subType?: string;
}

export interface EnemyDefeatedEvent extends BaseEvent {
    type: 'ON_ENEMY_DEFEATED';
    defeatedEnemy: Unit;
    targetId?: string; // ID of defeated enemy
}

export type IEvent =
    | GeneralEvent
    | ActionEvent
    | DamageDealtEvent
    | HealEvent
    | EpGainEvent
    | SpGainEvent
    | SpConsumeEvent
    | EffectEvent
    | DoTDamageEvent
    | BeforeActionEvent
    | BeforeDamageCalcEvent
    | EnemyDefeatedEvent
    | HpConsumeEvent;

/**
 * エフェクト付与/解除イベント用のインターフェース
 * @deprecated Use IEvent directly (it's now a union including EffectEvent)
 */
export type IEffectEvent = EffectEvent;

/**
 * イベントハンドラインターフェース。シミュレーション中のライフサイクルイベントを捕捉する。
 * 光円錐、遺物、キャラクターの天賦などがこのインターフェースを実装する。
 */
export interface IEventHandlerLogic {
    (event: IEvent, state: GameState, handlerId: string): GameState;
}

export interface IEventHandlerFactory {
    (sourceUnitId: string, level: number, param?: number): {
        handlerMetadata: IEventHandler;
        handlerLogic: IEventHandlerLogic;
    };
}

export interface IEventHandler {
    /**
     * このハンドラが一意に識別されるためのID。
     * (例: "lightcone-planetary-rendezvous-s5")
     */
    id: string;

    /**
     * このハンドラがどのイベントに反応するかを定義する。
     * これにより、不要なイベント処理をスキップできる。
     */
    subscribesTo: EventType[];
}

// --- Action Definitions ---

export type GameEvent = IEvent; // Alias for simplicity

export interface BasicAttackAction {
    type: 'BASIC_ATTACK';
    sourceId: string;
    targetId: string;
    flags?: {
        skipTurnEnd?: boolean;
    };
}

export interface SkillAction {
    type: 'SKILL';
    sourceId: string;
    targetId: string;
    // Optional properties for custom skills
    abilityId?: string;
    isAdditional?: boolean;
    skipTalentTrigger?: boolean;
    flags?: {
        skipTurnEnd?: boolean;
    };
}

export interface UltimateAction {
    type: 'ULTIMATE';
    sourceId: string;
    targetId?: string; // Optional for All-target ults, required for Single/Blast
}

export interface BattleStartAction {
    type: 'BATTLE_START';
}

export interface RegisterHandlersAction {
    type: 'REGISTER_HANDLERS';
    handlers: Array<{
        metadata: IEventHandler;
        logic: IEventHandlerLogic;
    }>;
}

export interface ActionAdvanceAction {
    type: 'ACTION_ADVANCE';
    targetId: string;
    percent: number; // 0.0 to 1.0 (e.g., 0.5 for 50% advance)
}

export interface FollowUpAttackAction {
    type: 'FOLLOW_UP_ATTACK';
    sourceId: string;
    targetId?: string;
    // FuA specific properties
}

export interface TurnSkipAction {
    type: 'TURN_SKIP';
    sourceId: string;
    reason: string;
}

export interface EnhancedBasicAttackAction {
    type: 'ENHANCED_BASIC_ATTACK';
    sourceId: string;
    targetId: string;
    flags?: {
        skipTurnEnd?: boolean;
    };
}

export type Action = BasicAttackAction | SkillAction | UltimateAction | BattleStartAction | RegisterHandlersAction | ActionAdvanceAction | FollowUpAttackAction | TurnSkipAction | EnhancedBasicAttackAction;

export type CombatAction = BasicAttackAction | SkillAction | UltimateAction | FollowUpAttackAction | EnhancedBasicAttackAction;


export interface IHit {
    targetId: string;
    scaling: 'atk' | 'def' | 'hp' | 'accumulated_healing';
    multiplier: number;
    toughnessReduction: number;  // 削靭値
    hitIndex: number; // Useful for debugging or specific artifacts
    isMainTarget: boolean;
    hitType: 'main' | 'adjacent' | 'bounce' | 'aoe';
    accumulatorOwnerId?: string; // 累計値の所有者ID（accumulated_healing用）
    accumulatorValue?: number; // 累計値の実際の値（stepGenerateHitsで設定）
}

/**
 * Context object passed through the Action Pipeline steps.
 * Holds the current state of the action execution.
 */
export interface ActionContext {
    action: Action;
    source: Unit;
    targets: Unit[]; // Keep for compatibility/reference in other steps
    hits: IHit[]; // New: For damage calculation step
    state: GameState;

    // Intermediate results
    damageModifiers: DamageCalculationModifiers;
    totalDamage: number;
    totalHealing: number;
    totalShield: number;

    // 各ヒットの詳細情報（ログ用）
    hitDetails: import('../../types/index').HitDetail[];

    // Flags
    isBroken: boolean;
}


export interface EnemyConfig {
    level: number;
    maxHp: number;
    toughness: number;
    spd: number;
    atk?: number; // Added
    def?: number; // Added
}

export interface SimulationConfig {
    characters: Character[]; // 後方互換性のため残す（内部的にはPartyConfigから生成）
    enemies: Enemy[];
    weaknesses: Set<Element>;
    partyConfig?: import('../../types/index').PartyConfig; // パーティ設定（推奨）
    enemyConfig: EnemyConfig; // Added
    rounds: number;
}
