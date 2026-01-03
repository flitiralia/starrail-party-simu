# 敵ユニット実装リファレンス

このドキュメントでは、シミュレーターにおける敵ユニットのデータ構造、ステータス計算仕様、および新しい敵の追加手順について解説します。

## 1. データ構造 (`EnemyData`)

敵の静的データは `EnemyData` インターフェース（`app/types/enemy.ts`）で定義されています。

```typescript
export interface EnemyData {
  id: string;          // 一意のID
  name: string;        // 表示名
  rank: EnemyRank;     // 'Normal' | 'Elite' | 'Boss'

  // ステータス倍率（Lv.80基準値に対する乗数）
  hpMultiplier: number;
  atkMultiplier: number;

  // 固定ステータス
  baseSpd: number;     // 基礎速度（レベル補正前）
  toughness: number;   // 靭性値（レベル非依存）

  // 属性・耐性
  element: Element;                   // 自身の属性
  weaknesses: Element[];              // 弱点属性
  elementalRes: Partial<Record<Element, number>>; // 属性耐性（弱点以外）
  baseEffectRes: number;              // 効果抵抗の基礎値

  // スキルと行動
  abilities: IUnitData['abilities'];  // スキル定義
  actionPattern?: string[];           // 行動パターン（例: ['Skill', 'Basic ATK']）

  // 被弾時EP回復量（オプション）
  damageReceivedEnergyReward?: number; // 未設定時はデフォルト5EP

  // デバフ抵抗（オプション）
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
```

## 2. ステータス計算仕様

敵のステータスは、**基準値テーブル**（`levelStats.ts`）と**敵ごとの倍率・補正**を組み合わせて算出されます。

### 基準値テーブル
Lv.1〜95までの敵ステータスの基準値が定義されています。
- 参照: `app/data/enemies/levelStats.ts`
- 元データ: `app/system_infomation/status-level.txt`

### 計算式

| ステータス | 計算式 | 備考 |
| :--- | :--- | :--- |
| **HP** | `基準HP(Lv) × hpMultiplier` | 小数点以下切り捨て |
| **ATK** | `基準ATK(Lv) × atkMultiplier` | 小数点以下切り捨て |
| **DEF** | `200 + 10 × Level` | 全敵共通の線形計算 |
| **SPD** | `baseSpd × レベル補正` | Lv.65+: 1.1倍, Lv.78+: 1.2倍, Lv.86+: 1.32倍 |
| **効果命中** | `0.8% × (Level - 50)` | Lv.50以下は0%。上限なし |
| **効果抵抗** | `基準抵抗(Lv) + baseEffectRes` | Lv.51-74は上昇、Lv.75+で上限10%＋rank補正 |

## 3. 被弾時EP回復

敵が味方にダメージを与えた際、その味方はエネルギー（EP）を回復します。

| フィールド | 説明 | デフォルト値 |
| :--- | :--- | :--- |
| `damageReceivedEnergyReward` | 味方が回復するEP量 | 5EP |

### 設定例

```typescript
// 高EP回復の敵（スポーン系）
damageReceivedEnergyReward: 10,

// 低EP回復のボス
damageReceivedEnergyReward: 3,
```

### 処理タイミング
- 敵のアクション完了時（`ON_ACTION_COMPLETE`発火前）
- 被弾した全味方にまとめてEP回復が適用
- EP回復効率（ERR）が反映される

## 4. デバフ抵抗

特定のデバフに対する抵抗を設定できます。

| フィールド | 対応するデバフ | 説明 |
| :--- | :--- | :--- |
| `freeze` | 凍結 | 氷属性の敵は高抵抗 |
| `burn` | 燃焼 | 火属性の敵は高抵抗 |
| `shock` | 感電 | 雷属性の敵は高抵抗 |
| `windShear` | 裂傷（風） | 風属性の敵は高抵抗 |
| `bleed` | 出血 | 物理属性の敵は高抵抗 |
| `entanglement` | もつれ | 量子属性の敵は高抵抗 |
| `imprisonment` | 禁錮 | 虚数属性の敵は高抵抗 |
| `crowdControl` | 行動制限全般 | ボス敵に設定 |

### 設定例

```typescript
// 凍結完全耐性（氷属性の敵）
debuffRes: {
    freeze: 1.0,  // 100%抵抗
},

// ボス敵（行動制限に強い）
debuffRes: {
    crowdControl: 0.5,  // 行動制限50%抵抗
    freeze: 0.3,
    imprisonment: 0.3,
},
```

## 5. 新しい敵スキルシステム

### EnemySkill インターフェース

複雑な行動パターンを持つエリート/ボス敵には、新しい `enemySkills` と `turnPatterns` を使用します。

```typescript
enemySkills: {
  'skill_id': {
    id: 'skill_id',
    name: 'スキル名',
    targetType: 'single' | 'blast' | 'aoe' | 'lock_on',
    damage: { multiplier: 4.0, toughnessReduction: 15 },
    energyGain: 15,
    baseChance: 1.0,  // デバフ付与確率（省略可）
    debuffType: 'Entanglement'  // 付与デバフ（省略可）
  }
},
```

### turnPatterns（ターン行動パターン）

1ターンに複数アクションを実行する場合に使用します。

```typescript
turnPatterns: [
  { primary: 'rule_of_force', secondary: 'spiral_arrow' },  // 1ターン目
  { primary: 'end_of_bow', secondary: 'war_trample' },      // 2ターン目
  { primary: 'unreal_projection', secondary: 'spiral_arrow' }  // 3ターン目
],
resetPatternOnBreakRecovery: true,  // 撃破復帰時にリセット
```

- **primary**: 最初に実行するスキルID
- **secondary**: 2番目に実行するスキルID（`pendingActions`に追加される）

### ロックオン（lock_on）

`targetType: 'lock_on'` のスキルはターゲットを固定し、次のターンで優先攻撃します。

## 6. 新しい敵の追加手順

1.  **データ定義ファイル作成**: `app/data/enemies` 配下に新しいファイル（例: `myNewEnemy.ts`）を作成するか、既存ファイルに追記します。
2.  **`EnemyData` 定義**:
    - `FROSTSPAWN` などを参考にオブジェクトを定義します。
    - HP/ATK倍率は、Chaos Memoryなどの実測値やWikiデータを参考に設定します（基準値 `levelStats[80]` に対する比率）。
3.  **スキル定義**:
    - **シンプルな敵**: `abilities` プロパティを使用
    - **複雑な敵**: `enemySkills` + `turnPatterns` を使用（推奨）
4.  **行動パターン設定**:
    - **新システム**: `turnPatterns` で1ターン複数アクション対応
    - **旧システム**: `actionPattern` で単純ローテーション
    - 定義しない場合、簡易AI（30%でスキル、70%で通常攻撃）が適用されます。
5.  **被弾EP回復 / デバフ抵抗設定** (Optional):
    - 必要に応じて `damageReceivedEnergyReward` と `debuffRes` を設定します。
6.  **エクスポート**: `app/data/enemies/index.ts` でエクスポートします。

## 6. エンジンでの処理フロー

1.  **初期化**:
    - `gameState.ts` の `createInitialGameState` で `calculateEnemyStats` が呼ばれ、レベルに応じた最終ステータスを持つ `Unit` が生成されます。
    - **弱点**: `EnemyData.weaknesses` 配列から `Set<Element>` に変換され、`Unit.weaknesses` に設定されます。
    - **属性耐性**: 弱点属性は **0%**、それ以外は `elementalRes` の値（未設定時はデフォルト **20%**）が設定されます。
    - デバフ抵抗は `stats` に反映されます（`frozen_res`, `burn_res` など）。
2.  **行動決定**:
    - `simulation.ts` の `determineNextAction` で実行されます。
    - `actionPattern` がある場合、現在の `rotationIndex` に基づいて行動が選択されます。
3.  **被弾EP回復**:
    - `dispatcher.ts` の `stepDamageReceivedEnergyGain` で処理されます。
    - 敵のアクション完了時に被弾した味方全員にEPが回復されます。
