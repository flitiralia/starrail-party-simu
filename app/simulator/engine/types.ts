import { Character, Enemy, FinalStats, Modifier, SimulationLogEntry, Element, IUnitData, IAbility, AdditionalDamageEntry, DamageTakenEntry, HealingEntry, ShieldEntry, DotDetonationEntry, HitDetail, EquipmentEffectEntry, StatKey } from '../../types/index';
import { IEffect } from '../effect/types';
import { DamageCalculationModifiers } from '../damage'; // 新しい型をインポート

/**
 * オーラインターフェース
 * ソースユニットがフィールド上にいる間のみ有効な永続効果
 * ソースユニット死亡時に自動削除される
 */
export interface IAura {
    id: string;
    name: string;
    sourceUnitId: string;
    target: 'all_allies' | 'all_enemies' | 'self' | 'other_allies';
    modifiers: {
        target: StatKey;
        value: number;
        type: 'add' | 'pct';
        source: string;
    }[];
}
export type UltimateStrategy = 'immediate' | 'cooldown';

export interface CharacterConfig {
    rotation: string[];
    rotationMode?: 'sequence' | 'spam_skill';
    spamSkillTriggerSp?: number;
    skillTargetId?: string;
    ultStrategy: UltimateStrategy;
    ultCooldown: number;
    useTechnique?: boolean; // 秘技を使用するか (デフォルト: true)
}

/**
 * Represents a single unit (character or enemy) on the battlefield.
 * It holds their current state, which changes throughout the simulation.
 */
export interface Unit {
    id: string;
    name: string;
    isEnemy: boolean;
    element: Element;
    level: number;
    abilities: IUnitData['abilities']; // IUnitData の abilities を参照
    equippedLightCone?: Character['equippedLightCone']; // Added for access in handlers
    eidolonLevel?: number; // 星魂レベル (0-6)
    relics?: Character['relics'];
    ornaments?: Character['ornaments'];
    traces?: Character['traces'];

    // The full, calculated stats of the unit at the start of combat.
    stats: FinalStats;

    // Base stats (for calculating percentage buffs dynamically)
    baseStats: FinalStats;

    // Dynamic state values
    hp: number;
    ep: number;
    shield: number;
    toughness: number;
    maxToughness: number; // Maximum toughness
    weaknesses: Set<Element>;

    // List of active modifiers (buffs/debuffs) on this unit.
    modifiers: Modifier[];

    // List of active effects (from light cones, relics, etc.) on this unit.
    effects: IEffect[];

    // Current position on the timeline
    actionValue: number;
    actionPoint: number; // 0-10000 gauge

    // Rotation and strategy state
    config?: CharacterConfig;
    rotationIndex: number;
    ultCooldown: number;

    // Summon related
    isSummon?: boolean;
    ownerId?: string; // ID of the unit that summoned this unit
    linkedUnitId?: string; // ID of the unit this summon is linked to (e.g., 'Comrade')
    untargetable?: boolean; // If true, cannot be targeted by single-target/blast abilities
    debuffImmune?: boolean; // If true, immune to all debuffs (e.g., Ikarun)
}

/**
 * Represents the entire state of the combat simulation at any given moment.
 * This object is intended to be passed around and updated by pure functions.
 */
export interface GameState {
    units: Unit[];
    skillPoints: number;
    maxSkillPoints: number; // Default 5, expandable
    time: number; // Current simulation time, can be used for buff durations etc.
    currentTurnOwnerId?: string; // 現在ターン中のユニットID（バフ減少スキップ判定用）
    log: SimulationLogEntry[];
    eventHandlers: IEventHandler[];
    eventHandlerLogics: Record<string, IEventHandlerLogic>; // ハンドラIDからロジック関数を引くためのマップ
    // dynamicEffects: IEffect[]; // 将来的に動的な効果を管理するための場所

    // ダメージ計算前イベントでハンドラが一時的に設定する修飾子
    // ダメージ計算後にリセットされる必要がある
    damageModifiers: DamageCalculationModifiers;

    // ハンドラがターンごとにクールダウンを追跡するためのマップ
    cooldowns: Record<string, number>;

    // クールダウンのメタデータ（リセットタイミング制御用）
    cooldownMetadata: Record<string, CooldownMetadata>;

    // List of pending actions (e.g. Follow-up attacks) to be executed immediately after current action
    // List of pending actions (e.g. Follow-up attacks) to be executed immediately after current action
    pendingActions: Action[];

    // Timeline management
    actionQueue: ActionQueueEntry[];

    // Battle Result Summary
    result: BattleResult;

    // 現在アクションのログ蓄積用
    currentActionLog?: CurrentActionLog;

    // オーラ（ソースユニットがフィールド上にいる間のみ有効な永続効果）
    auras: IAura[];
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
        payload?: any;
    }[];
    details?: string; // ログ用の詳細メッセージ
}

export interface DamageResult {
    state: GameState;
    totalDamage: number;
    killed: boolean;
}

export interface ActionQueueEntry {
    unitId: string;
    actionValue: number;
}

// --- Event/Action Handling Interfaces (For DIP and OCP) ---

// --- Event/Action Handling Interfaces (For DIP and OCP) ---

export type EventType =
    | 'ON_DAMAGE_DEALT'
    | 'ON_TURN_START'
    | 'ON_TURN_END'         // ターン終了時
    | 'ON_ULTIMATE_USED'
    | 'ON_SKILL_USED'
    | 'ON_UNIT_HEALED'
    | 'ON_BATTLE_START'
    | 'ON_BEFORE_DAMAGE_CALCULATION' // 防御無視などの動的効果介入用
    | 'ON_WEAKNESS_BREAK' // 弱点撃破時
    | 'ON_WEAKNESS_BREAK_RECOVERY_ATTEMPT' // 弱点撃破回復試行時（残梅用）
    | 'ON_BASIC_ATTACK'
    | 'ON_ENHANCED_BASIC_ATTACK' // 強化通常攻撃（刃の無間剣樹等）
    | 'ON_FOLLOW_UP_ATTACK'
    | 'ON_ATTACK'           // 全ての攻撃（通常攻撃、スキル、必殺技、追加攻撃）に反応
    | 'ON_DEBUFF_APPLIED'
    | 'ON_DOT_DAMAGE' // 持続ダメージ発生時
    | 'ON_ACTION_COMPLETE'  // Fired after all damage calculation is done
    | 'ON_EFFECT_APPLIED'   // エフェクト付与時
    | 'ON_EFFECT_REMOVED'   // エフェクト解除時
    | 'ON_ENEMY_DEFEATED'   // 敵撃破時
    | 'ON_ENEMY_SPAWNED'    // 敵生成時
    | 'ON_UNIT_DEATH'       // ユニット死亡/退場時
    | 'ON_SP_CHANGE';       // SP増減時

export interface IEvent {
    type: EventType;
    sourceId: string;
    targetId?: string;
    value?: number; // Damage amount, healing amount, etc.
    healingDone?: number; // 回復量（ON_UNIT_HEALED用）
    subType?: string; // e.g. 'Basic', 'Skill', 'Ultimate', 'FollowUp', 'DoT'
    targetCount?: number; // Added for Tribbie's Ultimate logic
    defeatedEnemy?: Unit; // 倒された敵の情報（ON_ENEMY_DEFEATED用）
    element?: import('@/app/types').Element; // 攻撃の属性（ON_BEFORE_DAMAGE_CALCULATION用）
    // 将来的な拡張のために、より詳細な情報を持たせることも可能
    // e.g. damageType: 'basic' | 'skill' | 'dot'
}

/**
 * エフェクト付与/解除イベント用のインターフェース
 */
export interface IEffectEvent extends IEvent {
    type: 'ON_EFFECT_APPLIED' | 'ON_EFFECT_REMOVED';
    targetId: string;        // エフェクトが付与/解除されたユニット
    effect: IEffect;         // 付与/解除されたエフェクト
}

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

export interface DoTDamageEvent extends IEvent {
    type: 'ON_DOT_DAMAGE';
    sourceId: string;    // DoTを付与したユニット
    targetId: string;    // DoTを受けたユニット
    dotType: 'Bleed' | 'Burn' | 'Shock' | 'WindShear';
    damage: number;      // 実際に与えたダメージ
    effectId: string;    // DoTエフェクトのID
}

export type GameEvent =
    | IEvent // Catch-all for now, or define specific event types
    | DoTDamageEvent; // Add the new specific event type here

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
    targetId: string;
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
