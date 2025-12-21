# エフェクト/バフ/デバフ 実装リファレンス

このドキュメントでは、Honkai: Star Rail SimulatorにおけるEffect（バフ/デバフ）、Aura（オーラ）システムの仕様と実装パターンについて解説します。

---

## 1. データ構造: IEffect

すべてのバフ、デバフ、状態異常は `IEffect` インターフェースで定義されます。

```typescript
interface IEffect {
    id: string;                    // 一意ID（必須）
    name: string;                  // 表示名（必須）
    category: 'BUFF' | 'DEBUFF' | 'STATUS';  // カテゴリ（必須）
    sourceUnitId: string;          // 発生源のユニットID（必須）
    
    // 持続時間管理
    durationType: 'PERMANENT' | 'TURN_START_BASED' | 'TURN_END_BASED' | 'LINKED';
    duration: number;              // ターン数（PERMANENTは-1）
    
    // 獲得ターン減少スキップ（TURN_END_BASED専用）
    // 注意: TURN_START_BASEDでは不要
    skipFirstTurnDecrement?: boolean;  // trueの場合、獲得ターンは減少しない
    
    // スタック管理
    stackCount?: number;
    maxStacks?: number;
    
    // リンク（親エフェクト削除時に自動削除）
    linkedEffectId?: string;
    
    // ステータス修正
    modifiers?: Modifier[];
    
    // ライフサイクルフック
    apply: (t: Unit, s: GameState) => s;
    remove: (t: Unit, s: GameState) => s;
    
    // 特殊タグ
    tags?: string[];
}
```

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

