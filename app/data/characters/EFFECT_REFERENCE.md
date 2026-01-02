# エフェクト/バフ/デバフ 実装リファレンス

このドキュメントでは、Honkai: Star Rail SimulatorにおけるEffect（バフ/デバフ）、Aura（オーラ）システムの仕様と実装パターンについて解説します。

---

## 1. データ構造: IEffect

すべてのバフ、デバフ、状態異常は `IEffect` インターフェースで定義されます。

```typescript
interface IEffect {
    id: string;                    // 一意ID（必須）
    name: string;                  // 表示名（必須）
    category: 'BUFF' | 'DEBUFF' | 'STATUS' | 'OTHER';  // カテゴリ（必須）
    type?: string;                 // 効果タイプ識別子（'DoT', 'Shield', 'CrowdControl'など）
    sourceUnitId: string;          // 発生源のユニットID（必須）
    
    // 持続時間管理
    durationType: 'PERMANENT' | 'TURN_START_BASED' | 'TURN_END_BASED' | 'LINKED';
    duration: number;              // ターン数（PERMANENTは-1）
    
    // 獲得ターン減少スキップ（TURN_END_BASED専用）
    // 注意: TURN_START_BASEDでは不要
    skipFirstTurnDecrement?: boolean;  // trueの場合、獲得ターンは減少しない
    appliedDuringTurnOf?: string;      // 付与時のターン所有者ID（自動設定）
    
    // スタック管理
    stackCount?: number;
    maxStacks?: number;
    stackStrategy?: 'auto' | 'add' | 'replace' | 'max';  // スタック更新戦略
    
    // リンク（親エフェクト削除時に自動削除）
    linkedEffectId?: string;
    
    // 確率・解除関連
    ignoreResistance?: boolean;    // 効果命中/抵抗を無視（固定確率）
    isDispellable?: boolean;       // バフ解除可能か（BUFF用）
    isCleansable?: boolean;        // デバフ解除可能か（DEBUFF用）
    
    // ステータス修正
    modifiers?: Modifier[];
    
    // ライフサイクルフック（推奨）
    onApply?: (t: Unit, s: GameState) => GameState;
    onRemove?: (t: Unit, s: GameState) => GameState;
    onTick?: (t: Unit, s: GameState) => GameState;  // ターン開始時などに呼ばれる
    
    // イベントハンドラ（特定イベントに反応）
    subscribesTo?: EventType[];    // 購読するイベントタイプ
    onEvent?: (event: IEvent, t: Unit, s: GameState) => GameState;
    
    // レガシーフック（後方互換性、非推奨）
    apply: (t: Unit, s: GameState) => GameState;
    remove: (t: Unit, s: GameState) => GameState;
    
    // 汎用データストア
    miscData?: Record<string, any>;
    
    // 特殊タグ
    tags?: string[];
}
```

> [!NOTE]
> `onApply`/`onRemove` と `apply`/`remove` の両方が存在する場合、`onApply`/`onRemove` が優先されます。新規実装では `onApply`/`onRemove` を使用してください。

---

## 2. 持続時間タイプ (Duration Type)

正しい `durationType` を選択することが重要です。

| タイプ | 説明 | 主な用途 | 減少タイミング |
|-------|------|---------|---------------|
| `TURN_START_BASED` | ターン開始時に減少 | DoT、デバフ | ユニットのターン**開始時** |
| `TURN_END_BASED` | ターン終了時に減少 | バフ、シールド | ユニットのターン**終了時** |
| `PERMANENT` | 減少しない | パッシブ効果 | なし |
| `LINKED` | 親エフェクト依存 | 特殊バフ | 親削除時 |

### `skipFirstTurnDecrement` について

`TURN_END_BASED` のバフを**自分のターン中**に付与した場合、そのターン終了時に即座に `duration` が減少しないようにするために `true` に設定します。

> [!TIP]
> ほとんどの自己バフや、味方へ付与するバフ（スキル等）は `skipFirstTurnDecrement: true` を設定するのが一般的です。

---

## 3. 実装パターン

### 標準的なバフ（3ターン攻撃アップ）

```typescript
const atkBuff: IEffect = {
    id: `atk-buff-${sourceUnitId}`,
    name: '攻撃力アップ',
    category: 'BUFF',
    sourceUnitId: sourceUnitId,
    durationType: 'TURN_END_BASED',
    skipFirstTurnDecrement: true, // 重要
    duration: 3,
    modifiers: [{
        source: 'スキル名',
        target: 'atk_pct',
        type: 'add',
        value: 0.50 // +50%
    }],
    apply: (t, s) => s,
    remove: (t, s) => s
};
newState = addEffect(newState, targetId, atkBuff);
```

### スタックするバフ（自動スタック管理）

`addEffect` は**同一ID・同一ソース**のエフェクトを自動的に管理します。手動でスタック数を計算する必要はありません。

#### 自動スタック管理の仕組み

1. **同一ID & 同一sourceUnitId** のエフェクトが既に存在する場合:
   - `stackCount` が自動的に +1 される（`maxStacks` まで）
   - `duration` が自動的にリフレッシュされる
2. **statBuilder** が `modifiers.value × stackCount` を自動計算

```typescript
// 推奨: maxStacksを設定し、modifiers.valueは1層あたりの値を指定
const stackBuff: IEffect = {
    id: 'buff-name',  // ターゲットIDを含めない（同一エフェクト判定のため）
    name: 'スタックバフ',
    category: 'BUFF',
    sourceUnitId: sourceId,
    durationType: 'TURN_START_BASED',
    duration: 3,
    maxStacks: 3,  // ★ 最大スタック数
    modifiers: [{
        target: 'all_type_dmg_boost',
        value: 0.15,  // ★ 1層あたりの値（statBuilderがstackCount倍を自動適用）
        type: 'add',
        source: 'バフ名'
    }],
    apply: (t, s) => s,
    remove: (t, s) => s
};

// 毎回同じ構造でaddEffectを呼ぶだけでOK
newState = addEffect(newState, targetId, stackBuff);
```

> [!IMPORTANT]
> - **エフェクトIDにターゲットIDを含めない**こと（`buff-${targetId}` は非推奨）
> - 同一エフェクトの判定は `id` と `sourceUnitId` の両方で行われる
> - `modifiers.value` は**1層あたりの値**を指定する（累積値ではない）

> [!CAUTION]
> ### stackCount と modifiers の自動乗算
>
> **StatBuilder** は `effect.modifiers` の値を `effect.stackCount` で**自動的に乗算**します。
>
> ```typescript
> // statBuilder.ts の処理
> const effectiveValue = baseValue * stackCount;  // 自動乗算
> ```
>
> したがって、`modifiers.value` に手動で `* stackCount` を掛けると**二重乗算**になります。
>
> **誤った例:**
> ```typescript
> modifiers: [{
>     value: critRatePerStack * newStacks,  // ❌ 二重乗算になる
> }],
> stackCount: newStacks,
> ```
>
> **正しい例:**
> ```typescript
> modifiers: [{
>     value: critRatePerStack,  // ✅ 1層あたりの値のみ
> }],
> stackCount: newStacks,
> ```

### リンクエフェクト（親依存）

「スキル発動者がバフを持っている間、対象もバフを得る」などの実装に使用します。

```typescript
const linkedEffect: IEffect = {
    // ...
    durationType: 'LINKED',
    duration: 0,
    linkedEffectId: 'parent-buff-id', // 親のIDを指定
    // ...
};
```

---

## 4. オーラシステム (Aura)

「キャラクターがフィールド上にいる間、味方全体/敵全体に常時適用される効果」です。
ソースユニットが戦闘不能になると自動的に削除されます。

```typescript
import { IAura } from '../../simulator/engine/types';
import { addAura } from '../../simulator/engine/auraManager';

// 戦闘開始時（ON_BATTLE_START）などに登録
const aura: IAura = {
    id: `aura-${sourceUnitId}`,
    name: 'オーラ名',
    sourceUnitId: sourceUnitId,
    target: 'all_allies', // 'all_allies' | 'all_enemies' | 'self' | 'other_allies'
    modifiers: [{
        target: 'spd_pct',
        value: 0.10, // 速度+10%
        type: 'add',
        source: 'パッシブ効果'
    }]
};
newState = addAura(newState, aura);
```

---

## 5. 特殊タグ (Tags)

`tags` プロパティを使用して、システムや他のハンドラーから参照されるマーカーを設定できます。

| タグ名 | 効果/用途 | NOTE |
|--------|----------|------|
| `PREVENT_TURN_END` | ターン終了をスキップし、連続行動を可能にする | **非推奨**: 後方互換性のみ |
| `SKILL_SILENCE` | スキル使用不可（強制的に通常攻撃） | 刃の地獄変等 |
| `ENHANCED_BASIC` | 通常攻撃を強化通常攻撃に置換 | 刃の地獄変等 |
| `LUOCHA_FIELD` | 羅刹の結界判定用 | 攻撃時に回復イベントを発火 |
| `SHIELD` | シールド効果であることを示す | ジェパード等 |
| `FREEZE`, `SHOCK`, etc. | 状態異常の種類識別 | DoT計算等で使用 |

---

## 6. ターン終了スキップ (連続行動)

スキル発動後にターンを終了せず連続行動する場合は、`currentTurnState` を使用します。

### 使用例

```typescript
// スキル発動後に強化通常攻撃1回でターン終了（刃）
newState = {
    ...newState,
    currentTurnState: {
        skipTurnEnd: true,
        endConditions: [{ type: 'action_count', actionCount: 1 }],
        actionCount: 0
    }
};

// 5回アクション OR SP < 2 でターン終了（アーチャー）
newState = {
    ...newState,
    currentTurnState: {
        skipTurnEnd: true,
        endConditions: [
            { type: 'action_count', actionCount: 5 },
            { type: 'sp_threshold', spThreshold: 2 }
        ],
        actionCount: 0
    }
};
```

### 終了条件タイプ

| タイプ | 説明 |
|--------|------|
| `action_count` | 指定回数アクション後に終了 |
| `sp_threshold` | SPが閾値を下回ったら終了 |

> [!NOTE]
> 複数の終了条件を指定した場合、**いずれかの条件** を満たした時点でターン終了します（OR条件）。

---

## 7. スタック更新戦略 (stackStrategy)

`stackStrategy` プロパティで、同一エフェクトを再度付与した際のスタック数の更新方法を制御できます。

| 戦略 | 説明 | 主な用途 |
|------|------|---------|
| `auto` | デフォルト。`incomingStack > currentStack` なら上書き、それ以外は +1 | 後方互換性 |
| `add` | 加算（`current + incoming`） | 攻撃回数に応じたスタック蓄積 |
| `replace` | 上書き（`incoming`） | 条件に応じた固定値設定 |
| `max` | 最大値維持（`Math.max(current, incoming)`） | 最大時のみ更新 |

```typescript
// 例: 攻撃ごとに1スタックずつ加算（最大5）
const stackingDebuff: IEffect = {
    id: 'stacking-debuff',
    name: 'スタックデバフ',
    category: 'DEBUFF',
    sourceUnitId: sourceId,
    durationType: 'TURN_START_BASED',
    duration: 3,
    maxStacks: 5,
    stackStrategy: 'add',  // ★ 加算方式を明示
    stackCount: 1,         // 毎回1を加算
    modifiers: [{ target: 'def_pct', value: -0.06, type: 'add', source: 'デバフ' }],
    apply: (t, s) => s,
    remove: (t, s) => s
};
```

---

## 8. 専用エフェクト型

### DoTEffect（持続ダメージ）

```typescript
interface DoTEffect extends IEffect {
    type: 'DoT';
    dotType: 'Bleed' | 'Burn' | 'Shock' | 'WindShear' | 'Arcana';
    damageCalculation: 'multiplier' | 'fixed';
    multiplier?: number;   // ATK × multiplier
    baseDamage?: number;   // 固定ダメージ
}

// 例: 燃焼効果
const burnEffect: DoTEffect = {
    id: `burn-${sourceId}`,
    name: '燃焼',
    category: 'DEBUFF',
    type: 'DoT',
    dotType: 'Burn',
    sourceUnitId: sourceId,
    durationType: 'TURN_START_BASED',
    duration: 2,
    damageCalculation: 'multiplier',
    multiplier: 0.5,  // ATK × 50%
    apply: (t, s) => s,
    remove: (t, s) => s
};
```

### ShieldEffect（シールド）

```typescript
interface ShieldEffect extends IEffect {
    type: 'Shield';
    value: number;  // 現在のシールド量
}

// 例: シールド付与
const shield: ShieldEffect = {
    id: `shield-${sourceId}`,
    name: 'シールド',
    category: 'BUFF',
    type: 'Shield',
    sourceUnitId: sourceId,
    durationType: 'TURN_END_BASED',
    skipFirstTurnDecrement: true,
    duration: 2,
    value: 500,  // シールド量
    tags: ['SHIELD'],
    apply: (t, s) => s,
    remove: (t, s) => s
};
```

### CrowdControlEffect（行動制限）

凍結、もつれ、禁錮などの行動制限デバフ用。

```typescript
interface CrowdControlEffect extends IEffect {
    type: 'CrowdControl';
    ccType: 'Freeze' | 'Entanglement' | 'Imprisonment';
    damageCalculation: 'fixed' | 'multiplier' | 'none';
    baseDamage?: number;           // 固定ダメージ
    scaling?: 'atk' | 'hp' | 'def'; // 参照ステータス
    multiplier?: number;            // ダメージ倍率
    delayAmount?: number;           // 行動順遅延
    speedReduction?: number;        // 速度低下率（禁錮用）
    avAdvanceOnRemoval?: number;    // 解除時AV進行率（凍結用）
}
```

---

## 9. イベントハンドラ登録

エフェクトが特定のイベントに反応する場合、`subscribesTo` と `onEvent` を使用します。

```typescript
const reactiveEffect: IEffect = {
    id: 'reactive-buff',
    name: '反撃バフ',
    category: 'BUFF',
    sourceUnitId: sourceId,
    durationType: 'TURN_END_BASED',
    duration: 2,
    
    // ★ イベント購読設定
    subscribesTo: ['ON_AFTER_ATTACK'],
    onEvent: (event, target, state) => {
        if (event.type === 'ON_AFTER_ATTACK' && event.targetId === target.id) {
            // 攻撃された時の処理
            console.log(`${target.name} が攻撃を受けた`);
        }
        return state;
    },
    
    apply: (t, s) => s,
    remove: (t, s) => s
};
```

> [!IMPORTANT]
> イベントハンドラは `addEffect` 時に自動登録され、`removeEffect` 時に自動解除されます。

---

## 10. デバフ免疫

ユニットに `debuffImmune: true` が設定されている場合、DEBUFFカテゴリのエフェクトは自動的にブロックされます。

```typescript
// effectManager.ts の処理
if (target.debuffImmune && effect.category === 'DEBUFF') {
    console.log(`Debuff ${effect.name} blocked: ${target.name} is immune`);
    return state;  // 付与されない
}
```

---

## 11. 召喚獣へのステータス伝搬

オーナーにエフェクトが付与/削除されると、`propagateStatsToSummons` によって召喚獣のステータスが自動的に再計算されます。

```typescript
// 自動処理（addEffect/removeEffect内で呼ばれる）
newState = propagateStatsToSummons(newState, ownerId);
```

> [!TIP]
> 召喚獣のステータス計算式は `statBuilder.ts` の `recalculateUnitStats` で定義されています。オーナーの最終ステータスを参照する召喚獣（例: 羅刹の結界、Numby）はこの仕組みで自動同期されます。

