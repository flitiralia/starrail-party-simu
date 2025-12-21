# Action Value (AV) 管理リファレンス

このドキュメントでは、Honkai: Star Rail SimulatorにおけるAction Value (AV) とタイムラインの管理、および速度（SPD）の仕様について解説します。

---

## 基本概念

シミュレーターは完全にAction Value (AV) に基づいてターン順序を管理しています。以前のAction Point (AP) システムは廃止されました。

### 重要なルール

1. **AVセントリック**: すべての行動順序は `unit.actionValue` によって決定されます。
2. **AVリセット**: ターン開始時、そのユニットのAVは `10000 / SPD` にリセットされます。
3. **直接操作禁止**: AVを直接計算・設定することは避け、必ず提供されているヘルパー関数を使用してください。

### 基本計算式

```typescript
AV = 10000 / SPD
```

---

## 汎用関数

`app/simulator/engine/actionValue.ts` および `app/simulator/engine/utils.ts` で提供されている関数です。

### 1. 行動順短縮 (Action Advance)

行動順を指定の割合（%）または固定値（AV）で早めます。

```typescript
import { advanceAction } from '../../simulator/engine/utils';

// 50% 行動短縮（例: ダンス・ダンス・ダンス）
// 現在のAVを 50% 減少させます。
newState = advanceAction(state, unitId, 0.5, 'percent');

// 固定値で短縮（例: 巡狩の祝福など）
newState = advanceAction(state, unitId, 100, 'fixed');
```

> [!NOTE]
> `advanceAction` は内部で `advanceUnitAction` を呼び出し、AVが0未満にならないように処理します。

### 2. 行動順遅延 (Action Delay)

行動順を指定の割合（%）または固定値（AV）で遅らせます。

```typescript
import { delayAction } from '../../simulator/engine/utils';

// 30% 行動遅延（例: 禁錮、凍結解除後など）
// ユニットの「基本AV（10000/SPD）」の 30% 分、AVを加算します。
newState = delayAction(state, unitId, 0.3, 'percent');

// 固定値で遅延
newState = delayAction(state, unitId, 20, 'fixed');

// ログ出力を抑制する場合（第3引数をtrue）
newState = delayAction(state, unitId, 0.2, 'percent', true);
```

### 3. 強制AV設定（特殊用途）

基本的に使用すべきではありませんが、再現行動（再行動）などの特殊なケースで使用します。

```typescript
import { setUnitActionValue } from '../../simulator/engine/actionValue';

// AVを強制的に0にする（即座に行動させる）
newState = setUnitActionValue(newState, unitId, 0);
```

---

## 速度 (SPD) と バフ

速度バフ/デバフが適用されると、ユニットの `stats.spd` が再計算されます。

- **速度変更時のAV調整**: シミュレーターは速度変更時に、**残りのAVを新しい速度に合わせて自動調整**します（ゲーム内仕様準拠）。
- `adjustActionValueForSpeedChange` 関数が自動的に呼び出されます。

```typescript
NewAV = OldAV * (OldSPD / NewSPD)
```

これにより、速度バフを受けた瞬間に「次のターンまでの待ち時間」が短縮されます。

---

## 弱点撃破と遅延

弱点撃破（Weakness Break）による行動遅延は、`dispatcher.ts` 内で処理されます。
特に**虚無（Imaginary）**の弱点撃破（禁錮）や、ルアン・メェイの「残梅」効果は特殊な計算を行います。

### ゲーム内の挙動
敵の行動直前にAVがリセットされる仕様があるため、遅延効果を適用するタイミングに注意が必要です。

1. **禁錮（Imprisonment）**: 速度ダウン（デバフ） + 行動遅延（AV加算）。
2. **残梅（Thanatoplum Rebloom）**: 弱点撃破状態からの回復を試みた際に発動し、行動順を遅延させます。

---

## 開発者向け: AV管理システム詳細

以下は `app/simulator/engine/actionValue.ts` で定義されているコア関数です。通常は `utils.ts` のラッパーを使用してください。

| 関数名 | 説明 |
|--------|------|
| `setUnitActionValue` | 指定ユニットのAVを直接設定し、キューを更新します。 |
| `advanceUnitAction` | AVを指定量（絶対値）減少させます。 |
| `delayUnitAction` | AVを指定量（絶対値）増加させます。delayAction(percent)は内部で `BaseAV * percent` を計算してこれを呼び出します。 |
| `resetUnitActionValue` | ターン開始時に呼ばれ、AVを `10000/SPD` にリセットします。 |
| `calculateActionValue` | SPDからAVを計算するヘルパー（`10000/spd`）。 |

