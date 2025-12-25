# キャラクター実装リファレンス (ガイド)

このドキュメントは、新しいキャラクターを実装手順と基本構造をまとめたものです。
より詳細なリファレンスは以下の個別のドキュメントを参照してください。

---

## 📑 リファレンス一覧

- **[イベントシステム (EVENT_REFERENCE.md)](EVENT_REFERENCE.md)**
  - イベントタイプ一覧、発火タイミング、アクションパイプライン、ハンドラー実装
- **[AV管理・タイムライン (AV_MANAGEMENT.md)](AV_MANAGEMENT.md)**
  - Action Value仕様、速度計算、行動短縮/遅延関数
- **[エフェクト・バフ・デバフ (EFFECT_REFERENCE.md)](EFFECT_REFERENCE.md)**
  - `IEffect`構造、持続時間管理、オーラ、Tags
- **[変更履歴 (CHANGELOG.md)](CHANGELOG.md)**
  - プロジェクトの更新履歴とマイグレーションガイド

---

## 目次
1. [ファイル構造](#ファイル構造)
2. [必須インポート](#必須インポート)
3. [定数定義](#定数定義)
4. [星魂レベル対応パターン](#星魂レベル対応パターンe3e5)
5. [データ構造 (概要)](#データ構造-概要)
6. [汎用関数 (概要)](#汎用関数-概要)
7. [ハンドラー作成クイックスタート](#ハンドラー作成クイックスタート)
8. [ターゲットタイプ判定](#ターゲットタイプ判定)
9. [ヘイト値 (Aggro) の管理](#9-ヘイト値-aggro-の管理)
10. [リファクタリング基準 (v2.0)](#10-リファクタリング基準-v20)
11. [特殊メカニズムの実装パターン](#11-特殊メカニズムの実装パターン)
12. [`Character`型の詳細構造](#12-character型の詳細構造)
13. [`IAbility`と`DamageLogic`の詳細](#13-iabilityとdamagelogicの詳細)
14. [`Trace`と`Eidolon`の詳細](#14-traceとeidolonの詳細)
15. [召喚獣/精霊の実装パターン](#15-召喚獣精霊の実装パターン)
16. [追撃（Follow-up Attack）の実装パターン](#16-追撃follow-up-attackの実装パターン)
17. [DoT/状態異常の実装パターン](#17-dot状態異常の実装パターン)
18. [強化通常攻撃の実装パターン](#18-強化通常攻撃の実装パターン)
19. [代表実装例へのリンク集](#19-代表実装例へのリンク集)

---

## ファイル構造

```
app/data/characters/[character-name].ts
├── インポート
├── 定数定義
├── キャラクター定義 (export const characterName: Character)
├── ヘルパー関数 (private)
└── ハンドラーファクトリ (export const characterNameHandlerFactory)
```

---

## 必須インポート

```typescript
// 基本型
import { Character, Element, Path, StatKey } from '../../types/index';
import { IEventHandlerFactory, GameState, IEvent, Unit } from '../../simulator/engine/types';
import { IEffect } from '../../simulator/effect/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';

// エフェクト管理
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';

// ユーティリティ関数
import { applyHealing, cleanse, applyShield, advanceAction } from '../../simulator/engine/utils';

// ダメージ計算
import { applyUnifiedDamage } from '../../simulator/engine/dispatcher';
import { calculateHeal, calculateNormalAdditionalDamage } from '../../simulator/damage';
```

---

## 定数定義

ファイル冒頭でマジックナンバーを定数として定義します。

```typescript
// --- 定数定義 ---
const CHARACTER_ID = 'character-name';

// スキル倍率
const SKILL_MULT = 2.0;

// 星魂効果
const E1_BONUS = 0.20;
```

---

## 星魂レベル対応パターン（E3/E5）

E3/E5によるアビリティレベル上昇の計算パターンです。

### 実装方法

```typescript
import { getLeveledValue } from '../../simulator/utils/abilityLevel';

// 値の定義
const ABILITY_VALUES = {
    skillDamage: {
        10: { mult: 2.0 },
        12: { mult: 2.2 }
    }
};

// 使用時
const skillLevel = (source.eidolonLevel || 0) >= 3 ? 12 : 10;
const values = getLeveledValue(ABILITY_VALUES.skillDamage, skillLevel);
```

> [!CAUTION]
> ### アビリティ倍率の正しい設定
> 
> **`abilities` 定義では必ず無凸時（デフォルトレベル）の値を使用してください。**
> 
> | アビリティ | デフォルトレベル | 星魂効果 |
> |-----------|----------------|---------|
> | 通常攻撃 | **Lv6** | E3/E5でLv7に上昇 |
> | 戦闘スキル | **Lv10** | E3/E5でLv12に上昇 |
> | 必殺技 | **Lv10** | E3/E5でLv12に上昇 |
> | 天賦 | **Lv10** | E3/E5でLv12に上昇 |
> 
> **誤った例:**
> ```typescript
> // ❌ 星魂効果適用後の値をハードコードしている
> hits: [{ multiplier: 1.10, ... }]  // Lv7の値
> hits: [{ multiplier: 0.77, ... }]  // Lv12の値
> ```
> 
> **正しい例:**
> ```typescript
> // ✅ デフォルトレベルの値を使用
> const BASIC_MULT = 1.00;  // Lv6基準
> const SKILL_MULT = 0.70;  // Lv10基準
> 
> hits: [{ multiplier: BASIC_MULT, ... }]
> hits: [{ multiplier: SKILL_MULT, ... }]
> ```

### 星魂の `abilityModifiers` について

星魂（E3/E5）の `abilityModifiers` には、**レベルアップ後の正確な値**を設定します。

```typescript
eidolons: {
    e3: {
        level: 3,
        name: '...',
        description: '通常攻撃Lv+1、必殺技Lv+2',
        abilityModifiers: [
            // Lv6(100%) → Lv7(110%) への上書き
            { abilityName: 'basic', param: 'damage.hits.0.multiplier', value: 1.10 },
            // Lv10(160%) → Lv12(176%) への上書き
            { abilityName: 'ultimate', param: 'damage.hits.0.multiplier', value: 1.76 }
        ]
    }
}
```

### レビューチェックリスト

新規キャラクター実装時、以下を確認してください:

- [ ] `abilities` 定義の倍率はデフォルトレベル（通常Lv6、その他Lv10）か
- [ ] 星魂の `abilityModifiers` はレベルアップ後の正しい値か
- [ ] `ABILITY_VALUES` の値と `abilities` の値が整合しているか
- [ ] 説明文（description）の倍率表記がコードと一致しているか

> 詳細は実装ガイド内のコメントを参照してください。


---

## データ構造 (概要)

`Unit`、`GameState` の構造については **[types.ts](../../simulator/engine/types.ts)** を参照してください。
エフェクトの詳細は **[EFFECT_REFERENCE.md](EFFECT_REFERENCE.md)** を参照してください。

---

## 汎用関数 (概要)

よく使用する関数のクイックリファレンスです。詳細は各リファレンスを参照してください。

### 回復・シールド

#### `applyHealing` - 回復適用

回復量を自動計算し、計算式の内訳をツールチップに表示します。

**シグネチャ:**
```typescript
function applyHealing(
    state: GameState,
    sourceId: string,
    targetId: string,
    healLogicOrAmount: HealLogic | number,  // HealLogicまたは計算済み回復量
    details?: string,
    skipLog?: boolean
): GameState
```

**HealLogicインターフェース:**
```typescript
interface HealLogic {
    scaling: 'atk' | 'hp' | 'def';
    multiplier: number;
    flat?: number;
    additionalOutgoingBoost?: number;  // 追加の与回復ブースト（加算）
    baseMultiplier?: number;           // 基礎回復量に乗算（速度ブースト等）
    finalMultiplier?: number;          // 最終回復量に乗算（微笑む暗雲等）
}
```

**使用例:**
```typescript
// 推奨: HealLogicを渡す（計算式が自動表示される）
newState = applyHealing(newState, source.id, target.id, {
    scaling: 'atk',
    multiplier: 0.10,
    flat: 200,
    additionalOutgoingBoost: 0.30  // 羅刹E2等の条件付きブースト
}, '羅刹スキル回復', true);

// 速度ブースト+微笑む暗雲の例（ヒアンシー）
newState = applyHealing(newState, source.id, ally.id, {
    scaling: 'hp',
    multiplier: skillHeal.pct,
    flat: skillHeal.flat,
    baseMultiplier: 1.0 + (excessSpd * 0.01),  // 速度ブースト
    finalMultiplier: 1.25                        // HP50%以下時+25%
}, '戦闘スキル: 味方回復', true);

// 後方互換: 計算済み回復量を渡す（内訳は表示されない）
newState = applyHealing(newState, source.id, target.id, calculatedAmount, '回復', true);
```

---

#### `applyShield` - シールド適用

シールド値を自動計算し、計算式の内訳をツールチップに表示します。

**シグネチャ:**
```typescript
function applyShield(
    state: GameState,
    sourceId: string,
    targetId: string,
    shieldLogic: ShieldLogic,  // シールド計算ロジック
    duration: number,
    durationType: 'TURN_START_BASED' | 'TURN_END_BASED',
    name?: string,
    effectId?: string,
    skipLog?: boolean,
    options?: ApplyShieldOptions
): GameState
```

**ShieldLogicインターフェース:**
```typescript
interface ShieldLogic {
    scaling: 'atk' | 'hp' | 'def';
    multiplier: number;
    flat?: number;
}
```

**使用例:**
```typescript
newState = applyShield(
    newState,
    source.id,
    target.id,
    { scaling: 'def', multiplier: 0.24, flat: 320 },  // 防御力24% + 320
    3,                          // 持続ターン数
    'TURN_END_BASED',          // ターン終了時カウント
    'バリア (E2)',             // 名前
    `shield-${source.id}`,     // エフェクトID（省略可）
    true,                       // ログスキップ
    { stackable: true, cap: maxShieldValue }  // オプション
);
```

### バフ・デバフ
- `addEffect(state, target, effect)`: **[EFFECT_REFERENCE.md](EFFECT_REFERENCE.md)**
- `removeEffect(state, target, effectId)`

### 行動順操作
- `advanceAction(state, unitId, amount, type)`: **[AV_MANAGEMENT.md](AV_MANAGEMENT.md)**
- `delayAction(state, unitId, amount, type)`

### ダメージ

#### `applyUnifiedDamage` - 統合ダメージ適用

ダメージを適用し、統計・ログ・イベント発火を一元処理します。

**重要: 統合ログに計算式を表示するには、必ず `breakdownMultipliers` を設定してください。**

**シグネチャ:**
```typescript
function applyUnifiedDamage(
    state: GameState,
    source: Unit,
    target: Unit,
    damage: number,
    options: DamageOptions
): DamageResult

interface DamageOptions {
    damageType: string;              // 'ULTIMATE_DAMAGE', 'SKILL_DAMAGE' など
    skipLog?: boolean;               // アクションの一部として記録する場合はtrue
    skipStats?: boolean;             // 統計更新をスキップする場合はtrue
    details?: string;                // ログ用の詳細メッセージ
    isCrit?: boolean;                // 会心したか
    breakdownMultipliers?: {         // ダメージ計算の内訳
        baseDmg: number;             // 基礎ダメージ
        critMult: number;            // 会心乗数
        dmgBoostMult: number;        // 与ダメージ乗数
        defMult: number;             // 防御乗数
        resMult: number;             // 耐性乗数
        vulnMult: number;            // 被ダメージ乗数
        brokenMult: number;          // 撃破乗数
    };
}

interface DamageResult {
    state: GameState;
    totalDamage: number;
    killed: boolean;
    isCrit?: boolean;
    breakdownMultipliers?: {...};    // options から引き継がれる
}
```

**推奨実装パターン:**

`calculateNormalAdditionalDamageWithCritInfo` を使用してダメージ計算の詳細を取得し、`applyUnifiedDamage` に渡します。

```typescript
import { calculateNormalAdditionalDamageWithCritInfo } from '../../simulator/damage';

// 1. ダメージ計算の詳細を取得
const baseDamage = source.stats.atk * SKILL_MULTIPLIER;
const dmgCalcResult = calculateNormalAdditionalDamageWithCritInfo(
    source,
    target,
    baseDamage
);

// 2. applyUnifiedDamage に渡す
const result = applyUnifiedDamage(
    state,
    source,
    target,
    dmgCalcResult.damage,
    {
        damageType: 'ULTIMATE_DAMAGE',
        details: 'スキル名',
        skipLog: true,  // 統合ログを使用する場合
        isCrit: dmgCalcResult.isCrit,
        breakdownMultipliers: dmgCalcResult.breakdownMultipliers
    }
);
newState = result.state;

// 3. 追加ダメージをログに記録する場合（オプション）
import { appendAdditionalDamage } from '../../simulator/engine/dispatcher';

newState = appendAdditionalDamage(newState, {
    source: source.name,
    name: 'スキル名',
    damage: result.totalDamage,
    target: target.name,
    damageType: 'skill',
    isCrit: result.isCrit || false,
    breakdownMultipliers: result.breakdownMultipliers
});
```

---

## ハンドラー作成クイックスタート

イベントに応答するハンドラーの基本テンプレートです。

```typescript
export const characterNameHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level: number,
    eidolonLevel: number = 0
) => {
    return {
        handlerMetadata: {
            id: `character-name-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_TURN_START',
                'ON_SKILL_USED',
            ],
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onBattleStart(event, state, sourceUnitId, eidolonLevel);
            }

            return state;
        }
    };
};
```

詳細なイベント一覧や特殊な実装パターンについては **[EVENT_REFERENCE.md](EVENT_REFERENCE.md)** を参照してください。

---

## ターゲットタイプ判定

アクションイベント（`ON_SKILL_USED`, `ON_ULTIMATE_USED` 等）には `targetType` プロパティが含まれており、アビリティのターゲットタイプを判定できます。

### ヘルパー関数

`eventHelpers.ts` に用意されているヘルパー関数を使用することを推奨します。

```typescript
import { isSingleAllyTargetAction, isSingleEnemyTargetAction } from '@/app/simulator/engine/eventHelpers';
import { ActionEvent } from '@/app/simulator/engine/types';

// 単体味方ターゲットのアクションかを判定
const actionEvent = event as ActionEvent;
if (!isSingleAllyTargetAction(actionEvent)) return state;

// ターゲットIDを取得（判定後はnon-nullが保証される）
const targetId = actionEvent.targetId!;
```

### 利用可能なヘルパー関数

| 関数名 | 判定内容 |
|:-------|:---------|
| `isSingleAllyTargetAction(event)` | 味方単体 (`ally`) |
| `isSingleEnemyTargetAction(event)` | 敵単体 (`single_enemy`) |
| `isSelfTargetAction(event)` | 自己 (`self`) |
| `isAllAlliesTargetAction(event)` | 味方全体 (`all_allies`) |
| `isAllEnemiesTargetAction(event)` | 敵全体 (`all_enemies`) |
| `isBlastTargetAction(event)` | 拡散 (`blast`) |

> [!TIP]
> 「味方単体にスキルを発動した場合」のような条件は `isSingleAllyTargetAction(event)` で判定できます。

---

## 9. ヘイト値 (Aggro) の管理

キャラクターの狙われやすさを表す `aggro` ステータスの仕様です。

### 基礎ヘイト値 (Base Aggro)

運命ごとの一般的な基礎値は以下の通りです。キャラクター定義の `baseStats` に設定します。

| 運命 | 基礎ヘイト値 |
|------|-------------|
| 存護 (Preservation) | 150 |
| 壊滅 (Destruction) | 125 |
| 虚無 (Nihility) / 調和 (Harmony) / 豊穣 (Abundance) | 100 |
| 巡狩 (The Hunt) / 知恵 (Erudition) | 75 |

### ヘイト値の変動

バフ・デバフとして実装します。

```typescript
// ヘイト値 +200% (例: ランドゥーの選択)
modifiers: [{ target: 'aggro', value: 2.0, type: 'pct', source: '光円錐' }]

// ヘイト値低下 (例: 丹恒)
modifiers: [{ target: 'aggro', value: -0.5, type: 'pct', source: '隠身' }]
```

---

## 10. リファクタリング基準 (v2.0)

2024年12月のリファクタリングにおいて確立された、コード品質と保守性を高めるための実装標準です。
新規キャラクター実装および既存コード修正時は、以下の基準に準拠してください。

### 9.1 定数定義の徹底

マジックストリング（文字列直書き）を排除し、定数オブジェクト (`const object as const`) を使用します。

**変更前 (非推奨):**
```typescript
if (effect.id === `kafka-shock-${targetId}`) ...
if (trace.name === '優しさ') ... // 日本語名での判定はNG
```

**変更後 (推奨):**
```typescript
const EFFECT_IDS = {
    SHOCK: (sourceId: string, targetId: string) => `kafka-shock-${sourceId}-${targetId}`,
    PAYMENT: (sourceId: string) => `kafka-payment-${sourceId}`,
} as const;

const TRACE_IDS = {
    A2: 'kafka-trace-a2', // 優しさ
    A4: 'kafka-trace-a4', // 詰め腹
} as const;

// 使用時
if (effect.id === EFFECT_IDS.SHOCK(sourceId, targetId)) ...
if (trace.id === TRACE_IDS.A2) ... // IDによる判定
```

### 9.2 ハンドラーロジックの分割

`handlerFactory` 内にすべてのロジックを書かず、イベントごとに独立した関数に分割します。

**推奨構造:**
```typescript
// 個別のイベントハンドラ関数 (純粋関数に近い形)
const onSkillUsed = (event: ActionEvent, state: GameState, ...): GameState => { ... };
const onUltimateUsed = (event: ActionEvent, state: GameState, ...): GameState => { ... };
const onTurnStart = (event: GeneralEvent, state: GameState, ...): GameState => { ... };

// ファクトリはディスパッチのみを行う
export const characterHandlerFactory: IEventHandlerFactory = (...) => {
    return {
        handlerMetadata: { ... },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            if (event.type === 'ON_SKILL_USED') return onSkillUsed(event as ActionEvent, state, ...);
            if (event.type === 'ON_ULTIMATE_USED') return onUltimateUsed(event as ActionEvent, state, ...);
            return state;
        }
    }
};
```

### 9.3 アビリティレベル計算の標準化

`calculateAbilityLevel` ユーティリティと `getLeveledValue` を使用し、星魂 (E3/E5) によるレベル上昇ロジックを共通化します。

**推奨パターン:**
```typescript
import { calculateAbilityLevel, getLeveledValue } from '../../simulator/utils/abilityLevel';

// 値定義 (Lv10, Lv12などキーとなるレベルのみ定義)
const ABILITY_VALUES = {
    skillDmg: { 10: 1.6, 12: 1.76 }
};

// 計算
const skillLevel = calculateAbilityLevel(eidolonLevel, 3, 'Skill'); // E3でSkill+2の場合
const dmgMult = getLeveledValue(ABILITY_VALUES.skillDmg, skillLevel);
```

### 9.4 型安全性の確保

`as any` キャストを可能な限り排除し、適切な型ガードやインターフェース拡張を使用します。

**カスタムエフェクトの例:**
```typescript
// 型定義
interface MyCustomEffect extends IEffect {
    customValue: number;
}

// 型ガード
function isMyCustomEffect(effect: IEffect): effect is MyCustomEffect {
    return effect.name === 'MyEffect' && 'customValue' in effect;
}

// 使用時
const effect = unit.effects.find(...);
if (effect && isMyCustomEffect(effect)) {
    console.log(effect.customValue); // 安全にアクセス可能
}
```

**イベント型のダウンキャスト:**
`IEvent` は判別共用体 (Discriminated Union) です。`event.type` チェック後は、適切な型アサーション (`as ActionEvent` 等) を行うか、TypeScriptの推論が効く構造にします。
`ON_BEFORE_DAMAGE_CALCULATION` イベントなど、一部のイベントは `BeforeDamageCalcEvent` などの専用型を使用してください。

---

## 11. 特殊メカニズムの実装パターン

### 11.1 EP不使用必殺技（黄泉パターン）

黄泉のようにEPではなく独自のスタックシステムで必殺技を発動するキャラクターの実装パターンです。

**キャラクター定義:**
```typescript
export const acheron: Character = {
    maxEnergy: 0,  // EP不使用
    // 独自フラグを追加（オプション）
    useAlternativeUltCharge: true,
    // ...
};
```

**スタック管理パターン:**
```typescript
// 定数定義
const MAX_STACKS = 9;
const EFFECT_ID = (unitId: string) => `acheron-zanmu-${unitId}`;

// スタック取得
const getStacks = (state: GameState, unitId: string): number => {
    const unit = state.registry.get(createUnitId(unitId));
    const effect = unit?.effects.find(e => e.id === EFFECT_ID(unitId));
    return effect?.stackCount || 0;
};

// スタック設定
const setStacks = (state: GameState, unitId: string, stacks: number): GameState => {
    const clampedStacks = Math.min(Math.max(0, stacks), MAX_STACKS);
    // 既存エフェクト更新または新規作成
    // ...
};

// 必殺技発動可否
const canUseUltimate = (state: GameState, unitId: string): boolean => {
    return getStacks(state, unitId) >= MAX_STACKS;
};
```

**必殺技使用時の処理:**
```typescript
const onUltimateUsed = (event: ActionEvent, state: GameState, ...): GameState => {
    // スタック消費
    newState = setStacks(newState, sourceUnitId, 0);
    // ダメージ処理は dispatcher で実行される
    return newState;
};
```

**イベントトリガー例（デバフ付与でスタック獲得）:**
```typescript
// ON_EFFECT_APPLIED でデバフ付与を検知
if (event.type === 'ON_EFFECT_APPLIED') {
    const effectEvent = event as EffectEvent;
    if (effectEvent.effect.category === 'DEBUFF') {
        newState = addStacks(newState, sourceUnitId, 1);
    }
}
```

---

## 12. `Character`型の詳細構造

キャラクターを定義する `Character` インターフェースの各プロパティです。

```typescript
export interface Character extends IUnitData {
    id: string;                    // 一意のキャラクターID (例: 'herta', 'blade')
    name: string;                  // 表示名 (例: 'ヘルタ', '刃')
    path: Path;                    // 運命 (The Hunt, Erudition, ...)
    element: Element;              // 属性 (Physical, Fire, Ice, ...)
    rarity: 4 | 5;                 // レアリティ
    maxEnergy: number;             // 最大EP
    disableEnergyRecovery?: boolean; // 通常EP回復を無効化 (黄泉用)
    
    baseStats: CharacterBaseStats; // 基礎ステータス
    abilities: { ... };            // アビリティ定義
    traces: Trace[];               // 軌跡
    eidolons?: CharacterEidolons;  // 星魂
    defaultConfig?: CharacterDefaultConfig;  // デフォルト設定
}
```

### baseStats の設定

```typescript
baseStats: {
    hp: 952,
    atk: 582,
    def: 396,
    spd: 100,
    critRate: 0.05,  // 固定: 5%
    critDmg: 0.50,   // 固定: 50%
    aggro: 75        // 運命ごとのヘイト値
}
```

> [!TIP]
> `critRate` と `critDmg` は全キャラクター共通で固定値です。

---

## 13. `IAbility`と`DamageLogic`の詳細

### IAbility インターフェース

```typescript
interface IAbility {
    id: string;                     // 一意ID
    name: string;                   // 表示名
    type: AbilityType;              // 'Basic ATK' | 'Skill' | 'Ultimate' | 'Talent' | 'Technique'
    description: string;            // 説明文
    
    targetType?: TargetType;        // ターゲットタイプ
    damage?: DamageLogic;           // ダメージ計算ロジック
    energyGain?: number;            // EP回復量
    spCost?: number;                // SP消費量 (デフォルト: スキル=1)
    
    // シールド付与アビリティ用
    shield?: { multiplier: number, flat: number, scaling: 'atk' | 'def' | 'hp', duration?: number };
}
```

### TargetType の種類

| タイプ | 説明 | 使用例 |
|:-------|:-----|:-------|
| `single_enemy` | 敵単体 | 花火スキル |
| `all_enemies` | 敵全体 | ヘルタスキル |
| `blast` | 拡散 (単体+隣接) | 刃強化通常 |
| `bounce` | バウンス | クラーラ天賦 |
| `self` | 自己 | 刃スキル |
| `ally` | 味方単体 | サンデースキル |
| `all_allies` | 味方全体 | 花火必殺技 |

### DamageLogic の4タイプ

```typescript
// 1. simple - 単純ダメージ
damage: {
    type: 'simple',
    scaling: 'atk',  // 参照ステータス
    hits: [
        { multiplier: 0.50, toughnessReduction: 15 },
        { multiplier: 0.50, toughnessReduction: 15 }
    ]
}

// 2. blast - 拡散ダメージ (単体+隣接)
damage: {
    type: 'blast',
    scaling: 'hp',
    mainHits: [{ multiplier: 1.30, toughnessReduction: 15 }],
    adjacentHits: [{ multiplier: 0.52, toughnessReduction: 5 }]
}

// 3. aoe - 全体ダメージ
damage: {
    type: 'aoe',
    scaling: 'atk',
    hits: [{ multiplier: 2.00, toughnessReduction: 20 }]
}

// 4. bounce - バウンスダメージ
damage: {
    type: 'bounce',
    scaling: 'atk',
    hits: [
        { multiplier: 0.60, toughnessReduction: 5 },
        { multiplier: 0.60, toughnessReduction: 5 },
        { multiplier: 0.60, toughnessReduction: 5 }
    ]
}
```

> [!IMPORTANT]
> `scaling` は参照ステータスを指定します: `'atk'`（攻撃力）、`'hp'`（最大HP）、`'def'`（防御力）

---

## 14. `Trace`と`Eidolon`の詳細

### Trace（軌跡）

軌跡には2種類があります。

```typescript
// 1. Bonus Ability - 追加能力
{
    id: 'blade-trace-a2',
    name: '無尽形寿',
    type: 'Bonus Ability',
    description: '必殺技発動時、クリアされる失ったHP累計値が50%になる。'
}

// 2. Stat Bonus - ステータスボーナス
{
    id: 'blade-stat-hp',
    name: 'HP',
    type: 'Stat Bonus',
    description: '最大HP+28.0%',
    stat: 'hp_pct',     // 対象ステータス
    value: 0.28         // 増加値
}
```

### Eidolon（星魂）と abilityModifiers

星魂で能力パラメータを変更する場合、`abilityModifiers` を使用します。

```typescript
eidolons: {
    e3: {
        level: 3,
        name: '鍛造されし玄鋼 寒光放つ',
        description: '必殺技のLv.+2、天賦のLv.+2。',
        abilityModifiers: [
            // パラメータパスで対象を指定
            { abilityName: 'ultimate', param: 'damage.mainHits.0.multiplier', value: 1.62 },
            { abilityName: 'talent', param: 'damage.hits.0.multiplier', value: 0.4719 }
        ]
    }
}
```

#### パラメータパスの例

| パス | 対象 |
|:-----|:-----|
| `damage.hits.0.multiplier` | simple/bounceの1ヒット目倍率 |
| `damage.mainHits.0.multiplier` | blastのメイン1ヒット目倍率 |
| `damage.adjacentHits.0.multiplier` | blastの隣接1ヒット目倍率 |
| `shield.multiplier` | シールド倍率 |

---

## 15. 召喚獣/精霊の実装パターン

記憶の運命キャラクター（アグライア等）の精霊実装には `memorySpiritManager.ts` を使用します。

### 精霊定義の作成

```typescript
import { IMemorySpiritDefinition } from '../../simulator/engine/memorySpiritManager';

function createRaftraDefinition(owner: Unit, eidolonLevel: number): IMemorySpiritDefinition {
    return {
        idPrefix: 'raftra',
        name: 'ラフトラ',
        element: 'Lightning',
        baseSpd: owner.stats.spd,  // オーナーの速度を継承
        abilities: {
            basic: owner.abilities.basic,
            skill: { ... },  // 精霊専用スキル
            ultimate: owner.abilities.ultimate,
            talent: owner.abilities.talent,
            technique: owner.abilities.technique,
        }
    };
}
```

### 召喚とリフレッシュ

```typescript
import { summonOrRefreshSpirit, getActiveSpirit, removeSpirit } from '../../simulator/engine/memorySpiritManager';

// 精霊召喚
const result = summonOrRefreshSpirit(state, owner, definition, { duration: 3 });
newState = result.state;
const spirit = result.spirit;

// 既存精霊の取得
const existingSpirit = getActiveSpirit(state, ownerId, 'raftra');

// 精霊削除
newState = removeSpirit(state, ownerId, 'raftra');
```

> **参照実装:** [aglaea.ts](./aglaea.ts)

---

## 16. 追撃（Follow-up Attack）の実装パターン

### 追撃のトリガー

追撃は `pendingActions` に追加することでトリガーします。

```typescript
import { FollowUpAttackAction } from '../../simulator/engine/types';

// チャージ満タン時に追撃をトリガー
if (getCharges(unit) >= MAX_CHARGES) {
    newState = {
        ...newState,
        pendingActions: [...newState.pendingActions, {
            type: 'FOLLOW_UP_ATTACK',
            sourceId: sourceUnitId,
            targetId: undefined,  // 全体攻撃の場合は undefined
            eidolonLevel
        } as FollowUpAttackAction]
    };
}
```

### ON_FOLLOW_UP_ATTACK でのダメージ処理

```typescript
const onFollowUpAttack = (event: ActionEvent, state: GameState, sourceUnitId: string): GameState => {
    if (event.sourceId !== sourceUnitId) return state;
    
    const source = state.registry.get(createUnitId(sourceUnitId));
    if (!source) return state;
    
    let newState = state;
    
    // チャージをリセット
    newState = resetCharges(newState, sourceUnitId);
    
    // 敵全体にダメージ
    const enemies = newState.registry.getAliveEnemies();
    for (const enemy of enemies) {
        const dmgCalc = calculateNormalAdditionalDamageWithCritInfo(source, enemy, baseDamage);
        const result = applyUnifiedDamage(newState, source, enemy, dmgCalc.damage, {
            damageType: 'FOLLOW_UP_ATTACK_DAMAGE',
            details: '天賦: 追加攻撃',
            isCrit: dmgCalc.isCrit,
            breakdownMultipliers: dmgCalc.breakdownMultipliers
        });
        newState = result.state;
    }
    
    return newState;
};
```

> **参照実装:** [herta.ts](./herta.ts), [blade.ts](./blade.ts)

---

## 17. DoT/状態異常の実装パターン

### DoTエフェクトの構造

```typescript
interface DoTEffect extends IEffect {
    dotType: 'Shock' | 'Burn' | 'Bleed' | 'WindShear';
    damageCalculation: 'multiplier' | 'fixed';
    multiplier?: number;    // multiplierの場合
    baseDamage?: number;    // fixedの場合
}
```

### DoT付与の実装

```typescript
// 感電付与
const shockEffect: IEffect = {
    id: `kafka-shock-${sourceUnitId}-${targetId}`,
    name: '感電',
    category: 'DEBUFF',
    sourceUnitId: sourceUnitId,
    durationType: 'TURN_START_BASED',
    duration: 2,
    dotType: 'Shock',
    damageCalculation: 'multiplier',
    multiplier: 2.9,  // ATK 290%
    tags: ['DOT', 'SHOCK'],
    apply: (t, s) => s,
    remove: (t, s) => s
} as DoTEffect;

newState = addEffect(newState, targetId, shockEffect);
```

### DoT起爆の実装

```typescript
import { DoTEffect, isDoTEffect } from '../../simulator/effect/types';

// DoTエフェクトの型ガード関数（EFFECT_REFERENCE.md参照）
function isDoTEffect(effect: IEffect): effect is DoTEffect {
    return 'dotType' in effect && 
           typeof (effect as any).dotType === 'string';
}

// ON_SKILL_USED でDoT起爆
if (event.type === 'ON_SKILL_USED' && event.sourceId === sourceUnitId) {
    const target = state.registry.get(createUnitId(event.targetId!));
    if (!target) return state;
    
    // 型ガードを使用してDoTエフェクトを検索
    const dotEffects = target.effects.filter(isDoTEffect);
    
    // 各DoTのダメージを75%で発動
    for (const dot of dotEffects) {
        // dot.dotTypeは型安全にアクセス可能
        const dotDamage = calculateDotDamage(source, target, dot) * 0.75;
        // ダメージ適用処理...
    }
}
```

> **参照実装:** [kafka.ts](./kafka.ts)

---

## 18. 強化通常攻撃の実装パターン

### abilities.enhancedBasic の定義

```typescript
abilities: {
    basic: { ... },  // 通常の通常攻撃
    skill: { ... },
    // ...
    
    // 強化通常攻撃
    enhancedBasic: {
        id: 'blade-enhanced-basic',
        name: '無間剣樹',
        type: 'Basic ATK',
        description: 'HP10%消費。敵単体にHP130%、隣接にHP52%の風属性ダメージ。',
        damage: {
            type: 'blast',
            scaling: 'hp',
            mainHits: [{ multiplier: 1.30, toughnessReduction: 15 }],
            adjacentHits: [{ multiplier: 0.52, toughnessReduction: 5 }]
        },
        energyGain: 30,
        targetType: 'blast'
    }
}
```

### ENHANCED_BASIC タグによる自動切替

スキル使用時に `ENHANCED_BASIC` タグを持つバフを付与すると、通常攻撃が自動的に強化通常攻撃に切り替わります。

```typescript
const hellscapeEffect: IEffect = {
    id: `blade-hellscape-${sourceUnitId}`,
    name: '地獄変',
    category: 'BUFF',
    sourceUnitId: sourceUnitId,
    durationType: 'TURN_END_BASED',
    duration: 3,
    skipFirstTurnDecrement: true,
    modifiers: [
        { target: 'all_type_dmg_boost', value: 0.40, type: 'add', source: '地獄変' }
    ],
    tags: ['HELLSCAPE', 'SKILL_SILENCE', 'ENHANCED_BASIC'],  // ★ ENHANCED_BASIC
    apply: (t, s) => s,
    remove: (t, s) => s
};
```

### ON_ENHANCED_BASIC_ATTACK イベント

強化通常攻撃実行後の追加処理には `ON_ENHANCED_BASIC_ATTACK` を使用します。

```typescript
subscribesTo: ['ON_ENHANCED_BASIC_ATTACK'],

// ハンドラー
if (event.type === 'ON_ENHANCED_BASIC_ATTACK' && event.sourceId === sourceUnitId) {
    // HP消費処理など
    const { state: afterConsume, consumed } = consumeHp(newState, sourceUnitId, sourceUnitId, 0.10, '無間剣樹');
    newState = afterConsume;
}
```

> **参照実装:** [blade.ts](./blade.ts)

---

## 19. 代表実装例へのリンク集

実装の参考として、メカニズムごとの代表キャラクターをまとめています。

### 運命・メカニズム別

| カテゴリ | キャラクター | 特徴 |
|:---------|:------------|:-----|
| 追撃 (条件発動) | [herta.ts](./herta.ts) | 敵HP50%以上で天賦発動 |
| 追撃 (チャージ) | [blade.ts](./blade.ts) | 5チャージで天賦発動 |
| DoT (感電) | [kafka.ts](./kafka.ts) | DoT付与と起爆 |
| 強化通常攻撃 | [blade.ts](./blade.ts) | 地獄変 (ENHANCED_BASIC タグ) |
| 召喚/精霊 | [aglaea.ts](./aglaea.ts) | ラフトラ召喚 |
| 召喚/精霊 (記憶) | [evernight.ts](./evernight.ts) | 長夜召喚、憶質スタック |
| EP不使用必殺技 | [acheron.ts](./acheron.ts) | 斬滅スタック |
| 味方バフ | [sunday.ts](./sunday.ts) | 単体バフ付与 |
| 結界/フィールド | [tribbie.ts](./tribbie.ts) | 三位一体結界 |
| HP消費 | [blade.ts](./blade.ts), [evernight.ts](./evernight.ts) | consumeHp 使用 |
| 行動短縮 | [bronya.ts](./bronya.ts) | advanceAction 使用 |

### 新規実装時のチェックリスト

新しいキャラクターを実装する際は、以下を確認してください。

- [ ] `Character` 定義（`id`, `name`, `path`, `element`, `baseStats`, `maxEnergy`）
- [ ] `abilities` 定義（`basic`, `skill`, `ultimate`, `talent`, `technique`）
- [ ] `traces` 定義（追加能力とステータスボーナス）
- [ ] `eidolons` 定義（E1〜E6、`abilityModifiers`）
- [ ] ハンドラーファクトリ（`subscribesTo`、各イベントハンドラー）
- [ ] エクスポート（`index.ts` に追加）
- [ ] テスト（`scenarios/` にテストファイル作成）

