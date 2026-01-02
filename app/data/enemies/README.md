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

## 3. 新しい敵の追加手順

1.  **データ定義ファイル作成**: `app/data/enemies` 配下に新しいファイル（例: `myNewEnemy.ts`）を作成するか、既存ファイルに追記します。
2.  **`EnemyData` 定義**:
    - `SAMPLE_ELITE` などを参考にオブジェクトを定義します。
    - HP/ATK倍率は、Chaos Memoryなどの実測値やWikiデータを参考に設定します（基準値 `levelStats[80]` に対する比率）。
3.  **スキル定義**:
    - `abilities` プロパティに `basic`, `skill`, `ultimate` などを定義します。
    - ダメージ倍率、削靭値、ターゲットタイプを設定します。
4.  **行動パターン設定** (Optional):
    - `actionPattern: ['Skill', 'Basic ATK', 'Basic ATK']` のようにローテーションを定義します。
    - 定義しない場合、簡易AI（30%でスキル、70%で通常攻撃）が適用されます。
5.  **エクスポート**: `app/data/enemies/index.ts` でエクスポートします。

## 4. エンジンでの処理フロー

1.  **初期化**:
    - `gameState.ts` の `createInitialGameState` で `calculateEnemyStats` が呼ばれ、レベルに応じた最終ステータスを持つ `Unit` が生成されます。
2.  **行動決定**:
    - `simulation.ts` の `determineNextAction` で実行されます。
    - `actionPattern` がある場合、現在の `rotationIndex` に基づいて行動が選択されます。
