# Simulation Engine Flowchart

このドキュメントは、Honkai: Star Rail戦闘シミュレーターのロジックフローを詳細に記述したものです。
コードベースの現状に基づき、イベント発火タイミング、割り込み処理、詳細なアクションパイプライン、ダメージ計算式、行動値（AV）計算ロジックを網羅しています。
これを見れば、シミュレーターの内部処理の全てが理解できるように構成されています。

```mermaid
flowchart TD
    %% --- Phase 1: 初期化 ---
    Start([シミュレーション開始]) --> Phase1[Phase 1: 初期化フェーズ]
    
    subgraph Phase1 [Phase 1: 初期化 & セットアップ]
        P1_1[設定・パーティ・敵データ読み込み]
        P1_1 --> P1_2[ハンドラ登録<br/>(キャラ/光円錐/遺物)]
        P1_2 --> P1_3[GameState作成]
        P1_3 --> P1_4{{🔥 ON_BATTLE_START 発火}}
        P1_4 --> P1_5[Technique/秘技 効果適用]
        P1_5 --> P1_6[初期Action Queue構築<br/>AV = 10000 / SPD]
    end
    
    Phase1 --> Phase2

    %% --- Phase 2: メインループ ---
    subgraph Phase2 [Phase 2: 戦闘メインループ]
        direction TB
        P2_Start{終了条件チェック}
        P2_Start -->|全敵撃破| Victory([勝利])
        P2_Start -->|全味方撃破| Defeat([敗北])
        P2_Start -->|ターン上限| Timeout([タイムアウト])
        P2_Start -->|継続| P2_Step[stepSimulation]
    end

    %% --- Phase 3: タイムライン & ターン開始 ---
    P2_Step --> Phase3
    
    subgraph Phase3 [Phase 3: タイムライン進行 & ターン開始]
        direction TB
        P3_1[Action Queue確認]
        P3_1 --> P3_2[Advance Timeline]
        
        subgraph AV_Logic [AV進行ロジック]
            AV_1[minAV = 先頭ユニットのAV]
            AV_2[全ユニットのAV -= minAV]
            AV_3[全ユニットのAP += minAV * SPD]
            AV_4[Global Time += minAV]
            AV_1 --> AV_2 --> AV_3 --> AV_4
        end
        P3_2 --> AV_Logic
        AV_Logic --> P3_Int1[[⚡ 割り込み必殺技チェック 1]]
        
        P3_Int1 --> P3_3[行動ユニット決定]
        P3_3 --> P3_4{{🔥 ON_TURN_START 発火}}
        P3_4 --> P3_5[DoTダメージ処理]
        
        subgraph DoT_Process [DoT処理詳細]
            DoT_1[DoTエフェクト抽出]
            DoT_2{計算タイプ?}
            DoT_2 -->|Multiplier| DoT_Norm[通常DoT計算]
            DoT_2 -->|Break| DoT_Brk[撃破DoT計算]
            DoT_Norm --> DoT_Apply[applyUnifiedDamage]
            DoT_Brk --> DoT_Apply
            DoT_Apply --> DoT_Ev{{🔥 ON_DOT_DAMAGE}}
        end
        P3_5 --> DoT_Process
        
        DoT_Process --> P3_6[ターン開始時 持続時間減少<br/>(DoT / TURN_START_BASED)]
        P3_6 --> P3_7[もつれ付加ダメージ処理]
        
        P3_7 --> P3_CC{行動制限デバフ?<br/>(凍結/もつれ/禁錮)}
        
        %% 行動制限ありの場合
        P3_CC -->|Yes| P3_Skip1[凍結ダメージ適用]
        P3_Skip1 --> P3_Skip2[持続時間減少 & 解除判定]
        P3_Skip2 --> P3_Skip3[ログ: Turn Skipped]
        P3_Skip3 --> P3_Skip4[updateTurnEndState]
        P3_Skip4 --> P3_Skip5[[⚡ 割り込み必殺技チェック 2]]
        P3_Skip5 --> P2_Start
        
        %% 行動制限なしの場合
        P3_CC -->|No| P3_Enemy{敵 & 靱性<=0?}
        P3_Enemy -->|Yes| P3_Rec[靱性回復<br/>(Toughness = Max)]
        P3_Rec --> Phase4
        P3_Enemy -->|No| Phase4
    end

    %% --- Phase 4: 行動選択 ---
    subgraph Phase4 [Phase 4: 行動選択]
        direction TB
        P4_1{必殺技使用可能?<br/>(Strategy=cooldown)}
        P4_1 -->|Yes| P4_Ult[Action: ULTIMATE]
        P4_1 -->|No| P4_Rot[ローテーション参照]
        P4_Rot --> P4_Check{Action Type}
        P4_Check -->|'s' & SP>0| P4_Skill[Action: SKILL]
        P4_Check -->|その他| P4_Basic[Action: BASIC_ATTACK]
    end

    Phase4 --> Phase5

    %% --- Phase 5: アクション実行 (Pipeline) ---
    subgraph Phase5 [Phase 5: アクション実行パイプライン]
        direction TB
        P5_Dispatch[dispatch(Action)]
        P5_Dispatch --> P5_Cost[コスト支払い (SP/EP)]
        P5_Cost --> P5_Hits[ターゲット選定 & Hit生成]
        
        %% Hit処理ループ
        P5_Hits --> P5_Loop[Hit処理ループ]
        P5_Loop --> P5_L1{{🔥 ON_BEFORE_DAMAGE_CALCULATION}}
        P5_L1 --> P5_L2[ダメージ計算 & 靱性削減計算]
        
        subgraph Dmg_Calc [ダメージ計算式]
            DC_1[Base Dmg = Scaling * Stat]
            DC_2[Crit Mult = 1 + (CR * CD)]
            DC_3[Dmg Boost = 1 + Elem + AllType + DotBoost]
            DC_4[Def Mult = (Lvl+20) / ((ELvl+20)*(1-DefRed)*(1-DefIgn) + (Lvl+20))]
            DC_5[Res Mult = 1 - (Res - ResPen)]
            DC_6[Vuln Mult = 1 + Vuln]
            DC_7[Break Mult = 0.9 if Broken else 1.0]
            DC_Final[Final = Base * Crit * Boost * Def * Res * Vuln * Break]
            
            DC_1 --> DC_2 --> DC_3 --> DC_4 --> DC_5 --> DC_6 --> DC_7 --> DC_Final
        end
        P5_L2 --> Dmg_Calc
        
        Dmg_Calc --> P5_L3[applyUnifiedDamage]
        P5_L3 --> P5_L4{{🔥 ON_DAMAGE_DEALT}}
        
        P5_L4 --> P5_Brk{弱点撃破?}
        P5_Brk -->|Yes| P5_Brk1{{🔥 ON_WEAKNESS_BREAK}}
        P5_Brk1 --> P5_Brk2[撃破効果適用<br/>(遅延/量子もつれ等)]
        P5_Brk -->|No| P5_NextHit
        P5_Brk2 --> P5_NextHit
        
        P5_NextHit{次のHit?}
        P5_NextHit -->|Yes| P5_Loop
        P5_NextHit -->|No| P5_Effects
        
        %% 効果適用
        P5_Effects[アビリティ効果適用<br/>(Buff/Debuff)]
        P5_Effects --> P5_EffCalc[命中判定]
        
        subgraph Hit_Chance [効果命中判定]
            HC_1{固定確率?}
            HC_1 -->|Yes| HC_Fixed[確率 = BaseChance]
            HC_1 -->|No| HC_Calc[確率 = Base * (1+EHR) * (1-RES) * (1-CC_RES)]
            HC_Fixed --> HC_Roll{Roll < 確率?}
            HC_Calc --> HC_Roll
        end
        P5_EffCalc --> Hit_Chance
        
        Hit_Chance -->|Success| P5_EffAdd[addEffect]
        Hit_Chance -->|Fail| P5_Shield
        
        P5_EffAdd --> P5_Shield[シールド適用]
        P5_Shield --> P5_Energy[エネルギー回復 (ERR適用)]
        P5_Energy --> P5_Log[ログ生成]
        
        %% アクションイベント
        P5_Log --> P5_Ev1{{🔥 ON_BASIC/SKILL/ULTIMATE/FUA}}
        P5_Ev1 --> P5_Ev2{{🔥 ON_ACTION_COMPLETE}}
    end

    Phase5 --> Phase6

    %% --- Phase 6: ターン終了 & 後処理 ---
    subgraph Phase6 [Phase 6: ターン終了 & 後処理]
        direction TB
        P6_Int3[[⚡ 割り込み必殺技チェック 3]]
        P6_Int3 --> P6_Upd{Action != ULT/FUA?}
        
        P6_Upd -->|Yes| P6_EndState[updateTurnEndState]
        P6_EndState --> P6_Rot[Rotation Index進行]
        P6_Rot --> P6_CD[Ult Cooldown減算]
        P6_Rot --> P6_BuffEnd[ターン終了時 持続時間減少<br/>(TURN_END_BASED)]
        P6_BuffEnd --> P6_HCD[ハンドラCooldown減算]
        P6_HCD --> P6_AV[addActionValue<br/>AV += 10000/SPD]
        P6_Upd -->|No| P6_Int4
        P6_AV --> P6_Int4
        
        P6_Int4[[⚡ 割り込み必殺技チェック 4]]
        P6_Int4 --> P6_Pend{Pending Actions?<br/>(追撃など)}
        P6_Pend -->|Yes| P6_DoPend[Pending Action Dispatch]
        P6_DoPend --> Phase5
        P6_Pend -->|No| P2_Start
    end
```

## 詳細解説

### 1. ダメージ計算式 (Damage Formula)
`app/simulator/damage.ts` で定義されている計算式です。
- **Base DMG**: スキル倍率 × ステータス (ATK/HP/DEF)
- **Crit Multiplier**: `1 + (CritRate * CritDmg)` (最大CritRateは100%)
- **DMG Boost**: `1 + ElementalBoost + AllTypeBoost + DoTBoost(if DoT)`
- **Def Multiplier**: `(Level + 20) / ((TargetLevel + 20) * (1 - DefRed) * (1 - DefIgn) + (Level + 20))`
- **Res Multiplier**: `1 - (Res - ResPen)`
- **Vuln Multiplier**: `1 + Vulnerability`
- **Break Multiplier**: 靱性がある場合は0.9、撃破状態なら1.0

### 2. 効果命中判定 (Effect Hit Rate Logic)
`app/simulator/engine/dispatcher.ts` の `calculateEffectSuccess` で処理されます。
- **固定確率 (ignoreResistance=true)**: 基礎確率のみで判定。EHRやRESは無視。
- **通常判定**: `RealChance = BaseChance * (1 + EHR) * (1 - RES) * (1 - SpecificRes)`
  - 凍結などの行動制限系は `CrowdControlRes` も乗算されます。

### 3. 行動値 (Action Value) 計算
`app/simulator/engine/actionValue.ts` で管理されます。
- **Base AV**: `10000 / SPD`
- **AV進行**: タイムライン上で最小のAV（minAV）だけ全員のAVを減算し、経過時間を加算します。
- **行動加速 (Action Advance)**: `CurrentAV -= BaseAV * Advance%`
- **速度変更**: `NewAV = OldAV * (OldSPD / NewSPD)`

### 4. 割り込み必殺技 (Interrupting Ultimates)
`checkAndExecuteInterruptingUltimates` 関数により、以下のタイミングでEP満タンかつ `Strategy='immediate'` の必殺技がチェック・実行されます。
1. **ターン開始時**: AV進行直後。
2. **行動制限スキップ後**: 凍結などでターンが飛ばされた直後。
3. **アクション実行後**: 攻撃によるEP回復直後。
4. **ターン終了処理後**: 全ての処理が終わり、次のターンに移る前。

### 5. イベント発火順序 (Event Firing Order)
1. `ON_TURN_START`: ターン開始時、DoT処理の直前。
2. `ON_DOT_DAMAGE`: DoTダメージ発生時。
3. `ON_BEFORE_DAMAGE_CALCULATION`: 各ヒットのダメージ計算直前。
4. `ON_DAMAGE_DEALT`: ダメージ適用後。
5. `ON_WEAKNESS_BREAK`: 靱性が0になった瞬間。
6. `ON_SKILL_USED` / `ON_BASIC_ATTACK` 等: アクションの主要処理完了後。
7. `ON_ACTION_COMPLETE`: アクションの全工程（ログ生成含む）完了後。
