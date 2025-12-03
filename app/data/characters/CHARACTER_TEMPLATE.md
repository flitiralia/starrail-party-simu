# キャラクター実装テンプレート

このテンプレートは、新しいキャラクターを実装するために必要な全ての情報を記述するためのものです。
**正確性を最優先**とし、実装者がこのテンプレートを見るだけで完全に実装できる詳細度を目指しています。

---

## 1. 基本情報

```typescript
{
  id: 'character-id',              // 例: 'tribbie', 'march-7th'
  name: 'キャラクター名',          // 例: 'Tribbie', 'March 7th'
  rarity: 4 | 5,                   // レアリティ
  path: 'Path',                    // 'Harmony', 'Preservation', 'Destruction', etc.
  element: 'Element',              // 'Ice', 'Fire', 'Physical', etc.
  maxEnergy: 120,                  // 最大EP（通常120, 一部100や140）
}
```

---

## 2. 基礎ステータス (Lv.80, 光円錐なし)

```typescript
baseStats: {
  hp: 0,        // 基礎HP
  atk: 0,       // 基礎攻撃力
  def: 0,       // 基礎防御力
  spd: 0,       // 基礎速度（通常95-110）
  critRate: 0.05,   // 会心率（固定）
  critDmg: 0.5,     // 会心ダメージ（固定）
  aggro: 0,     // ヘイト値（壊滅125, 巡狩75, 調和100, 存護150, etc.）
}
```

---

## 3. アビリティ定義

### 3.1 通常攻撃 (Basic Attack)

```typescript
basic: {
  id: 'character-basic',
  name: 'アビリティ名',
  type: 'Basic ATK',
  description: '効果説明',
  
  targetType: 'single_enemy',  // 'single_enemy', 'blast', 'bounce', 'all_enemies'
  
  // ダメージ定義
  damage: {
    type: 'simple',            // 'simple' | 'blast' | 'bounce'
    scaling: 'atk',            // 'atk' | 'def' | 'hp'
    multiplier: 1.0,           // ダメージ倍率（Lv.6）
  },
  
  // 複数ヒットの場合
  hits: 1,                     // ヒット数（デフォルト1）
  // または bounce の場合
  // damage: { type: 'bounce', scaling: 'atk', multipliers: [0.5, 0.25, 0.25] }
  
  toughnessReduction: 10,      // 削靭値（単体攻撃: 10, 範囲: 5-20）
  energyGain: 20,              // EP回復量
  
  // 追加効果（オプション）
  effects: [
    {
      type: 'Debuff名',        // 'Freeze', 'Burn', 'Bleed', etc.
      baseChance: 0.5,         // 基礎確率（50%）
      target: 'target',        // 'target' | 'self' | 'all_enemies'
      duration: 2,             // 持続ターン数
    }
  ]
}
```

### 3.2 戦闘スキル (Skill)

```typescript
skill: {
  id: 'character-skill',
  name: 'スキル名',
  type: 'Skill',
  description: '効果説明',
  
  targetType: 'ally' | 'self' | 'single_enemy' | 'blast' | 'all_enemies',
  
  damage: {
    // ダメージがある場合
    type: 'blast',
    scaling: 'atk',
    mainMultiplier: 1.6,       // 主目標倍率
    adjacentMultiplier: 0.6,   // 隣接目標倍率
  },
  
  toughnessReduction: { main: 20, adjacent: 10 },  // blastの場合
  energyGain: 30,
  
  // バフ/デバフ効果
  effects: [
    {
      type: 'Buff',
      target: 'target',
      name: 'バフ名',
      duration: 3,
      modifiers: [
        {
          target: 'atk',         // StatKey（攻撃力, 防御力, etc.）
          source: 'バフ名',
          type: 'percent',       // 'add' | 'percent' | 'multiply'
          value: 0.5             // 50%増加
        }
      ]
    }
  ],
  
  // シールド付与
  shield: {
    scaling: 'def',            // 'atk' | 'def' | 'hp'
    multiplier: 0.5,           // 防御力50%
    flat: 200,                 // 固定値200
    duration: 3                // 持続ターン
  }
}
```

### 3.3 必殺技 (Ultimate)

```typescript
ultimate: {
  id: 'character-ult',
  name: '必殺技名',
  type: 'Ultimate',
  description: '効果説明',
  
  targetType: 'all_enemies' | 'single_enemy' | 'all_allies',
  
  damage: {
    type: 'simple',
    scaling: 'atk',
    multiplier: 2.4            // 全体240%
  },
  
  toughnessReduction: 20,      // 全体攻撃の場合
  energyGain: 5,               // 必殺技使用後のEP回復
  
  effects: [
    // バフ/デバフ効果を記述
  ]
}
```

### 3.4 天賦 (Talent)

```typescript
talent: {
  id: 'character-talent',
  name: '天賦名',
  type: 'Talent',
  description: 'パッシブ効果の説明',
  
  // 追撃型の場合
  targetType: 'single_enemy',
  damage: {
    type: 'simple',
    scaling: 'atk',
    multiplier: 0.8
  },
  toughnessReduction: 5,
  energyGain: 10,
  
  // カウンター型の場合
  additionalDamage: [
    {
      type: 'simple',
      scaling: 'def',
      multiplier: 0.3          // 防御力30%の追加ダメージ
    }
  ]
}
```

### 3.5 秘技 (Technique)

```typescript
technique: {
  id: 'character-tech',
  name: '秘技名',
  type: 'Technique',
  description: '戦闘開始時の効果',
  
  // 攻撃型
  targetType: 'all_enemies',
  damage: {
    type: 'simple',
    scaling: 'atk',
    multiplier: 0.5
  },
  toughnessReduction: 10,
  
  // バフ型
  effects: [
    {
      type: 'Freeze',
      baseChance: 1.0,         // 100%
      target: 'all_enemies',
    }
  ]
}
```

---

## 4. 星魂 (Eidolons)

各凸レベルでの変更を記述します。

```typescript
eidolons: {
  e1: {
    level: 1,
    name: '星魂1の名前',
    description: '効果説明',
    
    // 実装方法:
    // イベントハンドラで処理する場合
    /* ON_ULTIMATE_USED イベントで EP +10 回復 */
    
    // アビリティ修正の場合
    abilityModifiers: [
      {
        abilityName: 'ultimate',
        param: 'energyGain',
        value: 15                // 5 -> 15 に変更
      }
    ]
  },
  
  e2: {
    level: 2,
    name: '星魂2の名前',
    description: '効果説明',
    
    // ダメージ増加の場合
    /* 天賦の追撃ダメージ +20% */
    /* イベントハンドラで damageModifiers に追加 */
  },
  
  e3: {
    level: 3,
    name: '星魂3',
    description: 'スキルLv+2, 通常攻撃Lv+1',
    // 自動適用されるため実装不要
  },
  
  e4: {
    level: 4,
    name: '星魂4の名前',
    description: '効果説明',
    
    // 追加ダメージの場合
    abilityModifiers: [
      {
        abilityName: 'talent',
        param: 'additionalDamage',
        value: [{ type: 'simple', scaling: 'def', multiplier: 0.3 }]
      }
    ]
  },
  
  e5: {
    level: 5,
    name: '星魂5',
    description: '必殺技Lv+2, 天賦Lv+2',
    // 自動適用
  },
  
  e6: {
    level: 6,
    name: '星魂6の名前',
    description: '効果説明',
    /* 実装方法を詳細に記述 */
  }
}
```

---

## 5. 軌跡 (Traces)

```typescript
traces: [
  // 追加能力 (Bonus Ability)
  {
    id: 'character-trace-a2',
    name: '追加能力1',
    type: 'Bonus Ability',
    description: '効果説明',
    /* 実装方法: ON_SKILL_USED でデバフ1つ解除 */
  },
  {
    id: 'character-trace-a4',
    name: '追加能力2',
    type: 'Bonus Ability',
    description: '効果説明',
  },
  {
    id: 'character-trace-a6',
    name: '追加能力3',
    type: 'Bonus Ability',
    description: '効果説明',
  },
  
  // ステータスボーナス (Stat Bonus)
  {
    id: 'character-stat-1',
    name: '攻撃力',
    type: 'Stat Bonus',
    description: '攻撃力+28%',
    stat: 'atk',
    value: 0.28
  },
  {
    id: 'character-stat-2',
    name: '効果命中',
    type: 'Stat Bonus',
    description: '効果命中+10%',
    stat: 'effect_hit_rate',
    value: 0.10
  },
  // 合計3つのステータスボーナス
]
```

---

## 6. イベントハンドラロジック

キャラクターが反応するイベントと、その処理内容を詳細に記述します。

### 6.1 ON_BATTLE_START
```typescript
// 戦闘開始時の処理
// 例: 秘技効果の適用
if (event.type === 'ON_BATTLE_START') {
  // Freezeデバフを全敵に付与
  // バフを味方全体に付与
  // 初期EPを設定
}
```

### 6.2 ON_TURN_START
```typescript
// ターン開始時の処理
// 例: DoTダメージ発生、バフのターン減少
if (event.type === 'ON_TURN_START' && event.sourceId === characterId) {
  // 自分のターン開始時の処理
}
```

### 6.3 ON_SKILL_USED
```typescript
// スキル使用時の処理
if (event.type === 'ON_SKILL_USED' && event.sourceId === characterId) {
  // スキル使用後の追加効果
  // 例: バフ付与、EP回復、デバフ解除
}
```

### 6.4 ON_ULTIMATE_USED
```typescript
// 必殺技使用時の処理
if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === characterId) {
  // 必殺技使用後の追加効果
}
```

### 6.5 ON_BASIC_ATTACK / ON_FOLLOW_UP_ATTACK
```typescript
// 通常攻撃/追撃後の処理
// 例: 天賦の追撃発動
if (event.type === 'ON_BASIC_ATTACK') {
  // 味方が通常攻撃した後に追撃
}
```

### 6.6 ON_DAMAGE_DEALT
```typescript
// ダメージを与えた時の処理
if (event.type === 'ON_DAMAGE_DEALT' && event.sourceId === allyId) {
  // ダメージ発生時の追加効果
  // 例: EP回復、バフスタック増加
}
```

### 6.7 ON_WEAKNESS_BREAK
```typescript
// 弱点撃破時の処理
if (event.type === 'ON_WEAKNESS_BREAK' && event.sourceId === characterId) {
  // 弱点撃破時の特殊効果
}
```

### 6.8 ON_BEFORE_DAMAGE_CALCULATION
```typescript
// ダメージ計算前の介入
if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
  // ダメージ修飾子の追加
  // state.damageModifiers を変更
}
```

### 6.9 ON_ACTION_COMPLETE
```typescript
// アクション完了後の処理
// 例: Tribbieの結界ダメージ
if (event.type === 'ON_ACTION_COMPLETE') {
  // 全ダメージ完了後の追加効果
}
```

---

## 7. カスタムステート・メカニクス

標準のステータス以外に管理が必要な特殊な状態。

### 7.1 スタック管理
```typescript
// 例: カウンタースタック
interface CounterStack {
  stackCount: number;    // 現在のスタック数
  maxStacks: number;     // 最大スタック数
}
// エフェクトとして管理: effect.stackCount
```

### 7.2 特殊なポイント
```typescript
// 例: エネルギーチャージ
// Unit の effects 配列内でエフェクトとして管理
{
  id: 'character-charge',
  name: 'Charge',
  category: 'BUFF',
  stackCount: 0,
  maxStacks: 10,
  // ...
}
```

### 7.3 フィールド効果
```typescript
// 例: Tribbieの結界
// TURN_START_BASED の BUFF エフェクトとして実装
{
  durationType: 'TURN_START_BASED',
  duration: 2,
  category: 'BUFF',
  tags: ['FIELD_EFFECT'],
  onEvent: (event, target, state) => {
    // ON_ACTION_COMPLETE で追加ダメージ
  }
}
```

---

## 8. バフ/デバフ詳細定義

キャラクターが付与するエフェクトの完全な定義。

```typescript
{
  id: 'unique-effect-id',
  name: 'エフェクト名',
  category: 'BUFF' | 'DEBUFF' | 'STATUS',
  type: 'DoT' | 'Shield' | 'Buff',  // オプション
  sourceUnitId: sourceId,
  
  durationType: 'TURN_START_BASED' | 'TURN_END_BASED' | 'PERMANENT',
  duration: 3,                       // ターン数
  
  stackCount: 1,                     // スタック数（オプション）
  maxStacks: 5,                      // 最大スタック（オプション）
  
  tags: ['SPECIAL_TAG'],             // 特殊タグ（オプション）
  
  // ステータス修正
  modifiers: [
    {
      target: 'atk',
      source: 'エフェクト名',
      type: 'percent',
      value: 0.5
    }
  ],
  
  // ライフサイクルフック
  onApply: (target, state) => {
    // 付与時の処理
    return state;
  },
  
  onRemove: (target, state) => {
    // 解除時の処理
    return state;
  },
  
  onEvent: (event, target, state) => {
    // イベント発生時の処理
    return state;
  },
  
  subscribesTo: ['ON_DAMAGE_DEALT'],  // 購読するイベント
  
  // レガシーサポート
  apply: (target, state) => state,
  remove: (target, state) => state,
}
```

### DoT エフェクト
```typescript
{
  type: 'DoT',
  dotType: 'Bleed' | 'Burn' | 'Shock' | 'WindShear',
  damageCalculation: 'multiplier' | 'fixed',
  multiplier: 1.0,        // ATK × 倍率（multiplierの場合）
  baseDamage: 500,        // 固定ダメージ（fixedの場合）
  durationType: 'TURN_START_BASED',
  duration: 2,
}
```

---

## 9. 実装チェックリスト

- [ ] 基本情報（ID, 名前, レアリティ, etc.）
- [ ] 基礎ステータス（HP, ATK, DEF, SPD, Aggro）
- [ ] 通常攻撃定義
- [ ] 戦闘スキル定義
- [ ] 必殺技定義
- [ ] 天賦定義
- [ ] 秘技定義
- [ ] 星魂定義（E1〜E6）
- [ ] 軌跡定義（追加能力×3, ステータスボーナス×3）
- [ ] イベントハンドラロジック実装
- [ ] カスタムステート管理（必要な場合）
- [ ] バフ/デバフエフェクト定義
- [ ] テストケース作成

---

## 10. 実装例参考

既存の実装ファイルを参考にしてください:
- `tribbie.ts` - 複雑なバフ管理、フィールド効果
- `march-7th.ts` - シールド付与、カウンター、凍結付与
- `kafka.ts` - DoT管理、追撃

---

## 11. 補足情報

### ダメージ計算の基礎
- `simple`: 単体または全体に同じ倍率
- `blast`: 主目標と隣接目標で異なる倍率
- `bounce`: 跳弾（複数ヒット、各ヒットで倍率が異なる）

### ターゲットタイプ
- `single_enemy`: 敵単体
- `all_enemies`: 敵全体
- `blast`: 主目標+隣接
- `bounce`: 跳弾
- `ally`: 味方単体
- `self`: 自身
- `all_allies`: 味方全体

### イベントタイプ一覧
- `ON_BATTLE_START`: 戦闘開始
- `ON_TURN_START`: ターン開始
- `ON_TURN_END`: ターン終了（非推奨、TURN_END_BASEDを使用）
- `ON_BASIC_ATTACK`: 通常攻撃後
- `ON_SKILL_USED`: スキル使用後
- `ON_ULTIMATE_USED`: 必殺技使用後
- `ON_FOLLOW_UP_ATTACK`: 追撃後
- `ON_DAMAGE_DEALT`: ダメージ発生時
- `ON_BEFORE_DAMAGE_CALCULATION`: ダメージ計算前
- `ON_WEAKNESS_BREAK`: 弱点撃破時
- `ON_ACTION_COMPLETE`: アクション完了後
- `ON_DEBUFF_APPLIED`: デバフ付与時
- `ON_DOT_DAMAGE`: DoTダメージ発生時
