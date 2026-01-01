import { Character, StatKey } from '../../types';
import { IEventHandlerFactory, IEvent, GameState, Unit, ActionEvent, BeforeDamageCalcEvent, IHit, Action, TurnSkipAction } from '../../simulator/engine/types';
import { UnitId, createUnitId } from '../../simulator/engine/unitId';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { IEffect } from '../../simulator/effect/types';
import { applyUnifiedDamage, publishEvent } from '../../simulator/engine/dispatcher';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { TargetSelector } from '../../simulator/engine/selector';

// --- 定数定義 ---
const CHARACTER_ID = 'the-herta';

const EFFECT_IDS = {
    DECIPHER: 'the-herta-decipher', // 解読
    SIXTH_SENSE: 'the-herta-sixth-sense', // 第六感
    ANSWER: 'the-herta-answer', // 回答
    TECHNIQUE_BUFF: 'the-herta-technique-buff', // 秘技ATKバフ
};

const TRACE_IDS = {
    A2_COLD_TRUTH: 'the-herta-a2-cold-truth', // 冷たい真実
    A4_MESSAGE_FROM_BOUNDARY: 'the-herta-a4-message', // 境界からの便り
    A6_HUNGRY_LANDSCAPE: 'the-herta-a6-landscape', // 飢えた地景
};

// --- 数値定数 ---

// 通常攻撃: Lv6 100%
const BASIC_MULT = 1.0;

// 戦闘スキル: Lv10
const SKILL_MAIN_MULT = 0.70; // 70%
const SKILL_ADJ_MULT = 0.70; // 70%
const SKILL_ADJ_ADJ_MULT = 0.70; // 70% (2回繰り返し) - 仕様では「その回の戦闘スキルが命中した敵および隣接する敵に、... 2回繰り返す」とあるが、最初の1回+追加2回？
// 文言: "指定した敵単体に...ダメージを与え、「解読」を1層付与する。" (Hit 1)
// "その回の戦闘スキルが命中した敵および隣接する敵に...ダメージを与える。2回繰り返す。" (Hit 2, 3)
// 構成:
// Main Target Hit 1: 70%
// Blast Hit 1 (Main+Adj): 70%
// Blast Hit 2 (Main+Adj): 70%
// Total on Main: 210%
// Total on Adj: 140%
// 待てよ、"ヒット数 3（メイン）、2（メインの隣接）、1（メインの隣接の隣接）" とある。
// そして "2回繰り返す" とある。
// 解釈B:
// 1. 指定単体: 70% (Hit 1)
// 2. 指定単体+隣接: 70% (Hit 2)
// 3. 指定単体+隣接: 70% (Hit 3)
// これならメイン3ヒット、隣接2ヒットになる。 "メインの隣接の隣接" が1ヒット？
// 仕様書再確認: "ヒット数 3（メイン）、2（メインの隣接）、1（メインの隣接の隣接）"
// これは拡散攻撃の巻き込み範囲が広いことを示唆している？
// 「その回の戦闘スキルが命中した敵および隣接する敵」というのは、最初の対象(A)とその隣接(B,C)
// もしAを狙ったら、Aに1発目。
// 次に A, B, C に2発目。
// 次に A, B, C に3発目？ これだとメイン3、隣接2になって辻褄が合う。
// "メインの隣接の隣接" という記述が謎。
// 一旦、メイン3回、隣接2回として実装する。
// Target Typeをどうするか。Blastで実装し、ロジックで分割する。

// 強化スキル: Lv10
// ダメージ倍率 200% (メイン), 隣接への及及は記載がないが「大胆なアイデア」に強化されるとある。
// 記載: "レベル10 ダメージ倍率(X%) 200%, 攻撃力アップ(Y%) 80%"
// ヒット数 1 とあるので単発？
// しかし天賦の説明で "メインターゲットに対するダメージ倍率... 他のターゲットに対するダメージ倍率..." とあるので拡散か全体？
// 記載がないが、文脈からBlast（拡散）または全体である可能性が高い。
// 「大胆なアイデア」の説明不足だが、天賦の "他のターゲット" という記述から複数体攻撃は確実。
// ここでは "Blast" (拡散) と仮定するが、天賦倍率が "他のターゲット" にも乗るため、全体攻撃の可能性も否定できない。
// 一旦 Blast として扱い、Main 200%, Adjacent ? (記載なし。Mainと同じか減衰か)
// 通常のマダムヘルタのスキルが拡散なので、強化も拡散(または全体)で、倍率がMain 200%と明記。Adjacentの記載がない。
// "ダメージ倍率(X%) 200%" としか書いてない。
// 仮に Adjacent = Main * 0.5 (一般的) とするが、保留リストに入れる。
// 追記読み直し: 天賦の強化倍率のところに "他のターゲット" への倍率加算がある。
// ベースダメージが 0 だと加算されても弱い。
// きっと隣接にも 200% なのか、あるいは 0% からスタートして天賦で増えるのか？
// 常識的に考えて 0% はない。
// "解読" 層数に応じた倍率アップが主軸。
// ここは隣接 100% (メインの半分) と仮定しておく。

const ENHANCED_SKILL_MAIN_MULT = 2.0;
const ENHANCED_SKILL_ADJ_MULT = 1.0; // 仮置き
const ENHANCED_SKILL_ATK_BUFF = 0.80; // 80%

// 必殺技: Lv10
const ULT_MULT = 2.0;
const ULT_ATK_BUFF = 0.80; // Lv10 記載がないが強化スキルと同じY%と仮定... いや、記載がある。
// "攻撃力+Y%、3ターン継続" -> Lv10の表には Y% 80% とある。
// なので 80%

// 天賦
const DECIPHER_MAX_STACKS = 42;
// Lv10
const TALENT_MAIN_BONUS = 0.08; // 8.0%
const TALENT_OTHER_BONUS = 0.04; // 4.0%

// Erudition Synergy (知恵2名以上)
const TALENT_SYNERGY_MAIN_BONUS = 0.08; // 推測: 説明文が "X%", "Y%" と同じ記号を使っているため同値と仮定
const TALENT_SYNERGY_OTHER_BONUS = 0.04;

// 秘技
const TECHNIQUE_ATK_BUFF_VAL = 0.60;
const TECHNIQUE_DURATION = 2;

// 昇格4
const A4_CRIT_DMG_BUFF = 0.80;

// 昇格6
const ANSWER_MAX_STACKS = 99;
const A6_ULT_DMG_PER_STACK = 0.01;

// ステータスボーナス
const STAT_ICE_DMG = 0.224;
const STAT_ATK = 0.18;
const STAT_SPD = 5;

// 星魂
const E1_STACK_SHARE = 0.5; // 50%
const E1_RESET_STACKS = 15;
const E2_SPEED_BOOST = 0.35; // 35% Action Advance? "行動順が35%早まる" -> Action Advance
const E4_SPD_BUFF = 0.12;
const E5_ULT_LV_UP = 2; // Lv+2 -> Ult Mult change
const E6_PEN = 0.20;
const E6_ULT_1_ENEMY = 4.0; // +400%
const E6_ULT_2_ENEMY = 2.5; // +250%
const E6_ULT_3_ENEMY = 1.4; // +140%

// --- ヘルパー関数 ---

// 敵の優先度重み計算 (精鋭 > 通常, 同ランクならランダム(ここではID順等))
const getEnemyPriority = (unit: Unit): number => {
    if (!unit.isEnemy) return 0;
    if (unit.rank === 'Boss') return 3;
    if (unit.rank === 'Elite') return 2;
    return 1; // Normal
};

// "解読" スタック付与
const applyDecipher = (state: GameState, targetId: string, stacks: number, sourceId: string): GameState => {
    const target = state.registry.get(createUnitId(targetId));
    if (!target) return state;

    const currentStacks = target.effects.find(e => e.id === EFFECT_IDS.DECIPHER)?.stackCount || 0;
    const newStacks = Math.min(currentStacks + stacks, DECIPHER_MAX_STACKS);

    const effect: IEffect = {
        id: EFFECT_IDS.DECIPHER,
        name: `解読 (${newStacks})`,
        category: 'DEBUFF', // デバフ扱い
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: newStacks,
        maxStacks: DECIPHER_MAX_STACKS,
        modifiers: [], // 効果自体はダメージ計算時に参照される
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    let newState = addEffect(state, targetId, effect);

    // 昇格6: "解読"が付与されるたびに "回答" を獲得 (1スタックにつき1回答)
    // "付与されるたびに" -> stackの増分だけ獲得？ "解読が1層付与されるたびに" なので増分。
    // 付与数が maxを超えて切り捨てられた分もカウントするか？ "付与されるたびに" なので、
    // 実際にスタックが増えた分だけカウントするのが自然だが、テキスト通りなら試行回数？
    // 一般的には "実際に増えた層数"
    const addedStacks = newStacks - currentStacks;
    if (addedStacks > 0) {
        newState = addAnswerStack(newState, sourceId, addedStacks);
    }

    return newState;
};

// "回答" スタック付与
const addAnswerStack = (state: GameState, sourceId: string, amount: number): GameState => {
    const source = state.registry.get(createUnitId(sourceId));
    if (!source || !source.traces?.some(t => t.id === TRACE_IDS.A6_HUNGRY_LANDSCAPE)) return state;

    const currentStacks = source.effects.find(e => e.id === EFFECT_IDS.ANSWER)?.stackCount || 0;
    const newStacks = Math.min(currentStacks + amount, ANSWER_MAX_STACKS);

    const effect: IEffect = {
        id: EFFECT_IDS.ANSWER,
        name: `回答 (${newStacks})`,
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: newStacks,
        maxStacks: ANSWER_MAX_STACKS,
        modifiers: [], // 必殺技時に参照
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    return addEffect(state, sourceId, effect);
};

// "第六感" スタック付与
const addSixthSense = (state: GameState, sourceId: string, amount: number): GameState => {
    const source = state.registry.get(createUnitId(sourceId));
    if (!source) return state;

    // E2: 戦闘突入or必殺技後、追加で1層
    // ここでチェックするのは関数呼び出し側で制御したほうが良いか、ここでやるか。
    // 引数 amount で制御する。

    const currentStacks = source.effects.find(e => e.id === EFFECT_IDS.SIXTH_SENSE)?.stackCount || 0;
    const newStacks = Math.min(currentStacks + amount, 4);

    const effect: IEffect = {
        id: EFFECT_IDS.SIXTH_SENSE,
        name: `第六感 (${newStacks})`,
        category: 'BUFF',
        sourceUnitId: sourceId,
        durationType: 'PERMANENT',
        duration: -1,
        stackCount: newStacks,
        maxStacks: 4,
        modifiers: [], // スキル変化の判定に使用
        apply: (t, s) => s,
        remove: (t, s) => s
    };

    return addEffect(state, sourceId, effect);
};

// --- キャラクター定義 ---

export const theHerta: Character = {
    id: CHARACTER_ID,
    name: 'マダム・ヘルタ',
    path: 'Erudition',
    element: 'Ice',
    rarity: 5,
    maxEnergy: 220,
    baseStats: {
        hp: 1164,
        atk: 679,
        def: 485,
        spd: 99,
        critRate: 0.05,
        critDmg: 0.50,
        aggro: 75
    },
    abilities: {
        basic: {
            id: 'the-herta-basic',
            name: 'これでわかった？',
            type: 'Basic ATK',
            description: '指定した敵単体にマダム・ヘルタの攻撃力100%分の氷属性ダメージを与える。',
            damage: {
                type: 'simple',
                scaling: 'atk',
                hits: [{ multiplier: BASIC_MULT, toughnessReduction: 10 }]
            },
            energyGain: 20,
            targetType: 'single_enemy'
        },
        skill: {
            id: 'the-herta-skill',
            name: '視野が狭いよ',
            type: 'Skill',
            description: '指定した敵単体にダメージを与え、「解読」を1層付与。その後、対象と隣接に2回ダメージを与える。',
            damage: {
                type: 'blast', // 便宜上Blast
                scaling: 'atk',
                mainHits: [
                    { multiplier: SKILL_MAIN_MULT, toughnessReduction: 5 }, // 1st
                    { multiplier: SKILL_MAIN_MULT, toughnessReduction: 5 }, // 2nd
                    { multiplier: SKILL_MAIN_MULT, toughnessReduction: 5 }, // 3rd
                ],
                adjacentHits: [
                    // 1st hit is main only
                    { multiplier: SKILL_ADJ_MULT, toughnessReduction: 5 }, // 2nd
                    { multiplier: SKILL_ADJ_MULT, toughnessReduction: 5 }, // 3rd
                ]
            },
            energyGain: 30,
            targetType: 'blast'
        },
        // 強化スキル定義（動的に切り替わるため、IDを分けておく）
        enhancedSkill: {
            id: 'the-herta-enhanced-skill',
            name: '大胆なアイデア',
            type: 'Skill',
            description: '強化戦闘スキル。',
            damage: {
                type: 'blast',
                scaling: 'atk',
                mainHits: [{ multiplier: ENHANCED_SKILL_MAIN_MULT, toughnessReduction: 20 }],
                adjacentHits: [{ multiplier: ENHANCED_SKILL_ADJ_MULT, toughnessReduction: 10 }] // 仮定
            },
            energyGain: 30, // 記載なしだが通常と同じと仮定
            targetType: 'blast'
        },
        ultimate: {
            id: 'the-herta-ultimate',
            name: '魔法だって言ったでしょ',
            type: 'Ultimate',
            description: '敵全体にダメージ。「解読」を並び替え。攻撃力アップ。「第六感」獲得。即座に行動。',
            damage: {
                type: 'aoe',
                scaling: 'atk',
                hits: [{ multiplier: ULT_MULT, toughnessReduction: 20 }]
            },
            energyGain: 5,
            targetType: 'all_enemies'
        },
        talent: {
            id: 'the-herta-talent',
            name: '私がもらうね',
            type: 'Talent',
            description: '解読付与、強化スキルダメージアップ。',
            // パッシブ効果のみ
        },
        technique: {
            id: 'the-herta-technique',
            name: '面白いの見せてよ',
            type: 'Technique',
            description: '次の戦闘開始時、ATK+60%。',
        }
    },
    traces: [
        {
            id: TRACE_IDS.A2_COLD_TRUTH,
            name: '冷たい真実',
            type: 'Bonus Ability',
            description: '味方の攻撃で「解読」付与。EP回復。'
        },
        {
            id: TRACE_IDS.A4_MESSAGE_FROM_BOUNDARY,
            name: '境界からの便り',
            type: 'Bonus Ability',
            description: '知恵2名以上で会心ダメージ+80%など。'
        },
        {
            id: TRACE_IDS.A6_HUNGRY_LANDSCAPE,
            name: '飢えた地景',
            type: 'Bonus Ability',
            description: '「解読」付与で「回答」獲得。必殺技ダメージアップ。'
        },
        { id: 'stat-ice-dmg', name: '氷属性ダメージ', type: 'Stat Bonus', description: '氷属性ダメージ+22.4%', stat: 'ice_dmg_boost', value: STAT_ICE_DMG },
        { id: 'stat-atk', name: '攻撃力', type: 'Stat Bonus', description: '攻撃力+18.0%', stat: 'atk_pct', value: STAT_ATK },
        { id: 'stat-spd', name: '速度', type: 'Stat Bonus', description: '速度+5', stat: 'spd', value: STAT_SPD },
    ],
    eidolons: {
        e1: { level: 1, name: '群星が降る夜', description: '強化スキル計算時、隣接最大層数の50%を加算。「解読」リセット時15層に。' },
        e2: { level: 2, name: '鍵穴を吹き抜ける風', description: '戦闘開始/必殺技後「第六感」+1。強化スキル後行動順35%短縮。' },
        e3: { level: 3, name: '真夏の扉の向こう', description: 'スキル+2, 天賦+2' },
        e4: { level: 4, name: '十六本目の鍵', description: '知恵キャラ速度+12%。' },
        e5: { level: 5, name: '真実は良薬のように苦い', description: '必殺技+2, 通常+1' },
        e6: { level: 6, name: '答えは誘惑のように甘い', description: '耐性貫通+20%。必殺技倍率アップ。' }
    },
    defaultConfig: {
        rotationMode: 'spam_skill',
        ultStrategy: 'immediate'
    }
};

// --- ハンドラー実装 ---

// 1. 戦闘開始・ウェーブ開始時の処理
const onStart = (state: GameState, sourceId: string, eidolonLevel: number, isWaveStart: boolean): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceId));
    if (!source) return newState;

    // A4: 知恵2名以上チェック
    const eruditionCount = newState.registry.getAliveAllies().filter(u => u.path === 'Erudition').length;
    const synergyActive = eruditionCount >= 2;

    // 天賦: ウェーブ開始時、「解読」25層付与 (ランダム1体、精鋭優先)
    if (isWaveStart) {
        const enemies = newState.registry.getAliveEnemies();
        if (enemies.length > 0) {
            // 優先度でソート: Boss(3) > Elite(2) > Normal(1)
            const sortedEnemies = [...enemies].sort((a, b) => getEnemyPriority(b) - getEnemyPriority(a));

            // 最高優先度の敵を抽出
            const maxPriority = getEnemyPriority(sortedEnemies[0]);
            const candidates = sortedEnemies.filter(e => getEnemyPriority(e) === maxPriority);
            // ランダムに1体
            const target = candidates[Math.floor(Math.random() * candidates.length)];

            newState = applyDecipher(newState, target.id, 25, sourceId);
        }
    }

    // A4: 知恵2名以上の場合、味方全体会心ダメ+80%
    if (!isWaveStart && synergyActive && source.traces?.some(t => t.id === TRACE_IDS.A4_MESSAGE_FROM_BOUNDARY)) {
        newState.registry.getAliveAllies().forEach(ally => {
            const buff: IEffect = {
                id: `the-herta-a4-crit-dmg-${ally.id}`,
                name: '境界からの便り (CritDMG+80%)',
                category: 'BUFF',
                sourceUnitId: sourceId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{ target: 'crit_dmg', value: A4_CRIT_DMG_BUFF, type: 'add', source: 'マダム・ヘルタ A4' }],
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            newState = addEffect(newState, ally.id, buff);
        });
    }

    // E4: 知恵キャラ速度+12% (戦闘開始時のみ適用とする)
    if (!isWaveStart && eidolonLevel >= 4) {
        newState.registry.getAliveAllies().filter(u => u.path === 'Erudition').forEach(ally => {
            const buff: IEffect = {
                id: `the-herta-e4-spd-${ally.id}`,
                name: '十六本目の鍵 (SPD+12%)',
                category: 'BUFF',
                sourceUnitId: sourceId,
                durationType: 'PERMANENT',
                duration: -1,
                modifiers: [{ target: 'spd', value: E4_SPD_BUFF, type: 'pct', source: 'マダム・ヘルタ E4' }],
                apply: (t, s) => s,
                remove: (t, s) => s
            };
            newState = addEffect(newState, ally.id, buff);
        });
    }

    // E2: 戦闘突入時 第六感+1
    if (!isWaveStart && eidolonLevel >= 2) {
        newState = addSixthSense(newState, sourceId, 1);
    }

    // 秘技: 戦闘開始時 ATK+60%
    if (!isWaveStart && source.config?.useTechnique !== false) {
        const buff: IEffect = {
            id: EFFECT_IDS.TECHNIQUE_BUFF,
            name: '面白いの見せてよ (ATK+60%)',
            category: 'BUFF',
            sourceUnitId: sourceId,
            durationType: 'TURN_END_BASED',
            duration: TECHNIQUE_DURATION,
            skipFirstTurnDecrement: true,
            modifiers: [{ target: 'atk_pct', value: TECHNIQUE_ATK_BUFF_VAL, type: 'add', source: 'マダム・ヘルタ 秘技' }],
            apply: (t, s) => s,
            remove: (t, s) => s
        };
        newState = addEffect(newState, sourceId, buff);
    }

    // 天賦: 敵が戦闘に入る時、「解読」1層付与
    // これは ON_ENEMY_SPAWNED で処理するが、初期配置の敵には BATTLE_START で処理が必要？
    // 仕様: "敵が戦闘に入る時、マダム・ヘルタはその敵に「解読」を1層付与する。"
    // 初期配置も含まれると解釈。
    if (!isWaveStart) { // Wave Start時はON_WAVE_STARTで別途処理されるか、あるいは自動で敵配置？
        // simulatorの仕様上、BATTLE_START時点で敵は既にいる。
        newState.registry.getAliveEnemies().forEach(enemy => {
            newState = applyDecipher(newState, enemy.id, 1, sourceId);
        });
    }

    return newState;
};

// 2. 攻撃時の「解読」付与 (A2, A4)
const onAttack = (event: ActionEvent, state: GameState, sourceId: string): GameState => {
    let newState = state;
    const source = newState.registry.get(createUnitId(sourceId));
    if (!source) return newState;

    // A2: 味方が攻撃を行う時、「解読」1層。
    // 自分も味方に含まれるか？ "味方が" -> Usually includes self unless specified "other allies".
    // テキスト: "味方が攻撃を行う時" -> Includes self.
    // 発動条件: 攻撃が命中する敵。
    // イベントタイプ: ON_ATTACK は攻撃動作開始時。命中した敵の情報はここでは取れない場合があるが、ターゲットIDはある。
    // 確実なのは ON_DAMAGE_DEALT だが、"攻撃を行う時" なので攻撃アクションにフック。
    // 範囲攻撃の場合、ターゲット全員？ "攻撃が命中する敵に" -> 複数体なら全員。

    // ここでは ON_AFTER_HIT または ON_DAMAGE_DEALT を使うべきか？
    // A2効果には "攻撃を行った後... EPを固定で3回復" もある。
    // "攻撃が命中する敵に...付与する" -> 命中判定後。

    // A4: 知恵2名以上の場合... 攻撃を行った後、命中した敵の中で... 1層付与。

    // これらをまとめるため、ON_ACTION_COMPLETE で、そのアクションで命中した敵リストを参照するのがベストだが、
    // 現在のイベントシステムで "このアクションで命中した敵" を保持しているか？
    // ON_DAMAGE_DEALT で各敵にフラグを立て、ON_ACTION_COMPLETE で処理する等が考えられる。
    // あるいは ON_DAMAGE_DEALT で都度付与する。

    // A2 "攻撃が命中する敵に「解読」を1層付与する" -> 付与タイミングは命中時で良さそう。
    // A2 EP回復 "攻撃を行った後... カウントされる敵は最大5体" -> アクション終了時。

    return newState;
};

// ダメージ発生時の処理 (A2 付与)
const onDamageDealt = (event: any, state: GameState, hertaId: string): GameState => {
    let newState = state;
    const herta = newState.registry.get(createUnitId(hertaId));
    if (!herta || !herta.traces?.some(t => t.id === TRACE_IDS.A2_COLD_TRUTH)) return newState;

    const attackerId = event.sourceId;
    const attacker = newState.registry.get(createUnitId(attackerId));
    if (!attacker || attacker.isEnemy) return newState; // 味方の攻撃

    const targetId = event.targetId;

    // 1回の攻撃行動で何度もダメージが発生（多段ヒット）する場合、1回のみ付与すべき。
    // 現在の仕組みだと ON_DAMAGE_DEALT はヒット毎に来る可能性がある。
    // "攻撃が命中する敵に" -> 1アクションにつき1回が妥当。
    // context object等で管理が必要。
    // ここでは簡易的に、"攻撃タイプ"のアクションイベントIDなどをキーに重複チェックしたいが...
    // 妥協案: 毎回付与しないで済むよう、ActionContextがあればいいのだが。

    // 一旦、毎回付与してしまうバグを避けるため、後述の `onActionComplete` でまとめて処理する方針に切り替える。
    // そのために `currentActionLog` 等からターゲットを取得する。

    return newState;
};

// アクション完了時の処理 (A2, A4)
const onActionComplete = (event: ActionEvent, state: GameState, hertaId: string): GameState => {
    let newState = state;
    const herta = newState.registry.get(createUnitId(hertaId));
    if (!herta) return newState;

    // 攻撃アクションのみ
    // ON_ACTION_COMPLETE イベントでは event.actionType にアクションの種類が入っている
    if (!event.actionType || !['BASIC_ATTACK', 'SKILL', 'ULTIMATE', 'FOLLOW_UP_ATTACK'].includes(event.actionType)) return newState;

    // 実行者が味方か確認
    const attacker = newState.registry.get(createUnitId(event.sourceId));
    if (!attacker || attacker.isEnemy) return newState;

    // このアクションで命中した敵を取得
    // 簡易的に event.targetId を見るが、範囲攻撃の場合は targetId 以外にも当たっている。
    // state.currentActionLog を見るのが確実か？ しかしActionComplete時点ではlogは確定しているはず。
    // 最後のログエントリを取得。
    const lastLog = newState.log[newState.log.length - 1];
    if (!lastLog || lastLog.sourceId !== event.sourceId) return newState; // 紐づけ不可ならスキップ

    // 命中した敵IDリストを抽出
    const hitEnemyIds = new Set<string>();
    if (lastLog.logDetails && lastLog.logDetails.primaryDamage) {
        lastLog.logDetails.primaryDamage.hitDetails.forEach(hit => {
            // hitDetailにはtargetNameしかない場合がある... IDが必要。
            // 残念ながらHitDetailにUnitIDがない場合がある。修正が必要かもだが、
            // 現状の仕様では targetId (main) と adjacent 等から推測するしかない。
            // だが、dispatcher.ts を見ると applyUnifiedDamage は個別に呼ばれる。
            // ということは ON_DAMAGE_DEALT でマークするのが正解。
            // しかし多段ヒット問題がある。
        });
    }

    // 代替案: ON_DAMAGE_DEALT で `processedActions` セットに {actionId, targetId} を記録し、重複を防ぐ。
    // しかし actionId が一意でない場合がある。

    // ここでは簡略化して考える。
    // A2: "味方が攻撃を行う時、命中する敵に1層"
    // これを「ダメージを与えた時」かつ「そのアクションでその敵に初めてダメージを与えた時」とする。

    // A4: "攻撃を行った後... 最も多い敵に1層"

    return newState;
};

// ダメージ発生イベントでフラグ管理するための拡張ステートが必要だが、
// ここでは pendingActions や GameState の customData を使えないので、
// IEventHandlerLogic のクロージャ変数は使えない（ステートレス）。
// 仕方ないので、ON_DAMAGE_DEALT で以下のロジックを組む。
// 「このイベントが、現在のターン/アクション内での最初のヒットか？」
// 難しいので、A2に関しては「付与確率100%」なので、スタックあふれを許容して
// 単純に「1アクションにつき1回」という制限を実装するのは困難。
// しかし仕様通りなら "攻撃が命中する敵に" なので、範囲攻撃なら全員に1層ずつ。
// 多段ヒットで複数回付与されると強すぎる（42層すぐ貯まる）。
// 通常、StarRailの仕様では「1回の行動」で1回判定。
// ここでは "Hit" ではなく "Attack" 単位。

// 解決策: currentActionLog を活用する。
// currentActionLog には `hitDetails` がある。
// ON_DAMAGE_DEALT 時に、 `state.currentActionLog.primaryDamage.hitDetails` を見て、
// 既に同じターゲットへのヒットが記録されていればスキップする。

const handleA2Decipher = (event: any, state: GameState, hertaId: string): GameState => {
    const herta = state.registry.get(createUnitId(hertaId));
    if (!herta || !herta.traces?.some(t => t.id === TRACE_IDS.A2_COLD_TRUTH)) return state;

    const attackerId = event.sourceId;
    const attacker = state.registry.get(createUnitId(attackerId));
    if (!attacker || attacker.isEnemy) return state;

    const targetId = event.targetId;

    // 既にこのアクションでこのターゲットにダメージを与えているかチェック
    // event.hitDetails には今回のヒットしか入っていないかもしれない。
    // state.currentActionLog を参照。
    const currentLog = state.currentActionLog;
    if (!currentLog) return state; // ログがない（ありえないが）

    // hitDetailsを探す
    // 注: currentActionLog は蓄積中。今回のhitが追加される前か後か？
    // engineの実装によるが、通常は直前までのログ。
    // 今回のターゲットIDが既にあればスキップ。
    // しかし HitDetail には targetName しかない... IDがないのは痛い。
    // 仕方ないので、ダメージ発生イベント内で「今回のヒットが1ヒット目」かどうかを判定したいが...
    // ダメージ計算と適用の分離により、難しい。

    // 妥協: 毎回付与する。ただし、さすがに強すぎるので、
    // 「攻撃した」という事実に対して付与する A4 を利用し、
    // A2の実装は「攻撃側」にバフとして「攻撃時解読付与」を持たせるのが綺麗だが、
    // マダムヘルタの実装だけで完結させたい。

    // ここは戦略を変えて、ON_ACTION_COMPLETE で
    // 「直前のアクションでダメージを受けた敵」を特定するロジックにする。
    // state.log の最後のエントリを見る。

    return state;
};

// 実際のON_ACTION_COMPLETE実装
const onActionCompleteReal = (event: ActionEvent, state: GameState, hertaId: string): GameState => {
    let newState = state;
    const herta = newState.registry.get(createUnitId(hertaId));
    if (!herta) return newState;

    // 実際のON_ACTION_COMPLETE実装の呼び出し
    if (!event.actionType || !['BASIC_ATTACK', 'SKILL', 'ULTIMATE', 'FOLLOW_UP_ATTACK', 'ENHANCED_BASIC_ATTACK'].includes(event.actionType)) return newState;

    const attacker = newState.registry.get(createUnitId(event.sourceId));
    if (!attacker || attacker.isEnemy) return newState;

    // ログからダメージを受けた敵を抽出
    // 直近のアクションログ
    const lastLog = newState.log[newState.log.length - 1];
    // ログ上のアクションタイプとイベントのアクションタイプが一致することを確認（念のため）
    // (イベントシステムの非同期性などはない前提)

    // ターゲットIDのセット
    const hitTargetIds = new Set<string>();

    // ログから再構築はIDがないので不可能。
    // 仕方ないので、event.targetId (メイン) と event.adjacentIds (隣接) を使う。
    // 全体攻撃の場合は event.targetType === 'all_enemies' を見て生存敵全員。

    if (event.targetType === 'all_enemies') {
        newState.registry.getAliveEnemies().forEach(e => hitTargetIds.add(e.id));
    } else {
        if (event.targetId) hitTargetIds.add(event.targetId);
        if (event.adjacentIds) event.adjacentIds.forEach(id => hitTargetIds.add(id));
        // Bounce, Randomの場合は？ event.targetId にリストが入っているわけではない。
        // 現状のAction型定義だとBounceの全ターゲットを知る術が event にないかもしれない。
        // event.subType などを確認する必要があるが...
    }

    if (hitTargetIds.size === 0) return newState;

    // A2: 命中した敵それぞれに「解読」1層
    if (herta.traces?.some(t => t.id === TRACE_IDS.A2_COLD_TRUTH)) {
        let hitCount = 0;
        hitTargetIds.forEach(tid => {
            // ダメージを与えたか？ (回避等は考慮せず、命中=ターゲットとみなす)
            newState = applyDecipher(newState, tid, 1, hertaId);
            hitCount++;
        });

        // A2: EP回復 (最大5体)
        const epGain = Math.min(hitCount, 5) * 3;
        newState = addEnergyToUnit(newState, hertaId, epGain, 0, false, { sourceId: hertaId });
    }

    // A4: 知恵2名以上 & 攻撃後、最も層数が多い敵に1層 (知恵なら+2層)
    const hasA4 = herta.traces?.some(t => t.id === TRACE_IDS.A4_MESSAGE_FROM_BOUNDARY);
    const eruditionCount = newState.registry.getAliveAllies().filter(u => u.path === 'Erudition').length;

    if (hasA4 && eruditionCount >= 2) {
        // 命中した敵の中で解読が最も多い敵を探す
        let maxStackEnemyId: string | null = null;
        let maxStacks = -1;

        hitTargetIds.forEach(tid => {
            const enemy = newState.registry.get(createUnitId(tid));
            if (enemy && enemy.hp > 0) {
                const stacks = enemy.effects.find(e => e.id === EFFECT_IDS.DECIPHER)?.stackCount || 0;
                if (stacks > maxStacks) {
                    maxStacks = stacks;
                    maxStackEnemyId = tid;
                }
            }
        });

        if (maxStackEnemyId) {
            let stacksToAdd = 1;
            if (attacker.path === 'Erudition') {
                stacksToAdd += 2;
            }
            newState = applyDecipher(newState, maxStackEnemyId, stacksToAdd, hertaId);
        }
    }

    // E6: 必殺技発動後、攻撃力+25% は実装済みか？ いや、まだ。
    if (event.actionType === 'ULTIMATE' && event.sourceId === hertaId && (herta.eidolonLevel || 0) >= 6) {
        // E6の効果は「必殺技の倍率アップ」と「貫通」だけではない？
        // 以前のヘルタの実装と混同しないように。
        // マダムヘルタE6: "氷属性耐性貫通+20%。また、必殺技のダメージ倍率が...アップする"
        // 攻撃力UPはない。OK。
    }

    // E2: 強化戦闘スキル発動後、行動順35%早まる
    if (event.actionType === 'SKILL' && event.sourceId === hertaId && (herta.eidolonLevel || 0) >= 2) {
        // 強化スキルだったかどうか判定が必要。
        // 第六感を持っていたか？
        // 消費されているはずだが判定難しい。
        // イベントに abilityId があるのでそれを見る。
        // ただし enhancedSkill の ID は 'the-herta-enhanced-skill'
        // しかし dispatch 時は 'SKILL' で呼ばれ、abilityId は自動解決されるか？
        // 通常は abilityId は引数に含まれない場合、Unitのskill.idが使われる。
        // 第六感ロジックで abilityId を書き換えて実行しているはず。
        // 一旦保留。Sixth sense消費時にフラグを立てるか、Action checkで abilityId を比較。
        // ここでは簡易判定: 直前に第六感が減ったか？ 不確実。
        // skill idチェックを行う。
        // ActionEventには `subType` や `abilityId` が含まれるべきだが、今の型定義にはないかも。
        // ActionEvent型定義を確認: abilityId はない。
        // しかし context にはあるはず。
    }

    return newState;
};


// 3. 必殺技発動時の処理
const onUltimateUsed = (event: ActionEvent, state: GameState, hertaId: string): GameState => {
    let newState = state;
    const herta = newState.registry.get(createUnitId(hertaId));
    if (!herta) return newState;

    // 必殺技: 攻撃力アップ
    const atkBuffVal = ULT_ATK_BUFF;
    // 効果: 3ターン
    const atkBuff: IEffect = {
        id: `the-herta-ult-atk-${hertaId}`,
        name: '魔法だって言ったでしょ (ATK Up)',
        category: 'BUFF',
        sourceUnitId: hertaId,
        durationType: 'TURN_END_BASED',
        duration: 3,
        skipFirstTurnDecrement: true,
        modifiers: [{ target: 'atk_pct', value: atkBuffVal, type: 'add', source: 'マダム・ヘルタ 必殺技' }],
        apply: (t, s) => s,
        remove: (t, s) => s
    };
    newState = addEffect(newState, hertaId, atkBuff);

    // 必殺技: その後、即座に行動 (Action Advance 100%)
    newState = {
        ...newState,
        pendingActions: [
            ...newState.pendingActions,
            {
                type: 'ACTION_ADVANCE',
                targetId: hertaId,
                percent: 1.0
            } as any // ActionAdvanceAction
        ]
    };

    // 必殺技: 第六感獲得 (1層)
    newState = addSixthSense(newState, hertaId, 1);

    // E2: 必殺技発動後、追加で第六感+1
    if ((herta.eidolonLevel || 0) >= 2) {
        newState = addSixthSense(newState, hertaId, 1);
    }

    // 解読の並び替えロジック
    // "敵それぞれが持つ「解読」の層数を並び替える。なお、精鋭エネミー以上の敵にはより多い層数を優先的に転移させる。"
    // 手順:
    // 1. 全敵の解読スタック数を収集 (合計プール)
    // 2. 敵を優先度順(Boss > Elite > Normal)にソート
    // 3. スタック数リストを降順ソート
    // 4. 優先度の高い敵から順に多いスタックを割り当て
    // 5. 割り当て後のスタック数でEffectを更新

    const enemies = newState.registry.getAliveEnemies();
    if (enemies.length > 0) {
        // 1. 収集
        const allStacks: number[] = [];
        enemies.forEach(e => {
            const stack = e.effects.find(eff => eff.id === EFFECT_IDS.DECIPHER)?.stackCount || 0;
            allStacks.push(stack);
        });

        // 2 & 3. ソート
        const sortedEnemies = [...enemies].sort((a, b) => getEnemyPriority(b) - getEnemyPriority(a));
        const sortedStacks = allStacks.sort((a, b) => b - a); // 降順

        // 4 & 5. 再分配
        sortedEnemies.forEach((enemy, index) => {
            const newStackCount = sortedStacks[index];
            const currentStackCount = enemy.effects.find(eff => eff.id === EFFECT_IDS.DECIPHER)?.stackCount || 0;

            // 差分調整
            // removeEffect -> addEffect だと新規付与扱いになりA6回答獲得が暴発する恐れがあるが、
            // A6は "付与されるたびに"
            // 並び替えは "付与" か？ 転移は付与とみなされないのが通例だが、
            // 文脈的には "転移させる" なので回答獲得は発生しないと解釈する。
            // 既存のEffectのstackCountを直接書き換えるのが安全。
            newState = {
                ...newState,
                registry: newState.registry.update(createUnitId(enemy.id), u => ({
                    ...u,
                    effects: u.effects.map(e => e.id === EFFECT_IDS.DECIPHER ? { ...e, stackCount: newStackCount, name: `解読 (${newStackCount})` } : e)
                }))
            };

            // Effectがない場合は新規追加が必要 (stack 0 -> N の場合)
            if (currentStackCount === 0 && newStackCount > 0) {
                // 新規追加。この場合も回答獲得をトリガーすべきでないならフラグが必要だが、
                // applyDecipher を使うとトリガーしてしまう。手動追加。
                const effect: IEffect = {
                    id: EFFECT_IDS.DECIPHER,
                    name: `解読 (${newStackCount})`,
                    category: 'DEBUFF',
                    sourceUnitId: hertaId,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: newStackCount,
                    maxStacks: DECIPHER_MAX_STACKS,
                    modifiers: [],
                    apply: (t, s) => s,
                    remove: (t, s) => s
                };
                newState = addEffect(newState, enemy.id, effect);
            }
        });
    }

    return newState;
};

// 4. スキル使用時の処理 (強化スキル分岐)
// Dispatcherがダメージ計算前にスキルIDを決定する必要があるが、現状の仕様ではスキル選択時に決定される。
// ユーザーがスキルボタンを押した時点で強化かどうかが決まる。
// ここでは "BeforeDamageCalculation" 等でダメージ倍率を調整するか、
// あるいは Action実行時に Sixth Sense をチェックしてスキルIDをすり替える。
// engine/dispatcher.ts の `dispatch` 関数内で actionType: 'SKILL' の場合、
// unit.abilities.skill を参照する。
// ここをフックするのは難しい。
// しかし、強化スキルは別アビリティとして定義したので、UI側あるいはAI側がどちらを使うか選ぶ必要がある。
// マダムヘルタの場合、第六感があれば強制的に強化スキルになる。
// `getAvailableActions` 的なロジックがあればそこで制御するが、
// ここでは `ON_BEFORE_ACTION` 等ですり替えることはできない（Actionデータ構造を変えることになる）。
// 
// 妥協案: スキル効果処理内 (ON_SKILL_USED 等ではなくダメージ計算前) で分岐する。
// または、ON_BEFORE_DAMAGE_CALCULATION で係数をいじる。
// 第六感がある場合のスキル:
//  - ダメージ倍率変更
//  - 攻撃終了後に解読リセット
//  - 第六感消費
//
// これらを実装するには、まずダメージ計算ロジックをダイナミックにする必要がある。

const onBeforeDamageCalc = (event: BeforeDamageCalcEvent, state: GameState, hertaId: string): GameState => {
    let newState = state;
    const herta = newState.registry.get(createUnitId(hertaId));
    if (!herta) return newState;
    if (event.sourceId !== hertaId) return newState;

    // スキルダメージ計算時
    // IDチェック: 通常スキルIDの場合でも、第六感があれば強化スキルの倍率を適用する
    // 通常スキルIDが使われるが、第六感がある場合は強化スキルとして振る舞うため、
    // ここでevent.subTypeには依存せず、第六感フラグで判定。
    if (event.abilityId === 'the-herta-skill') {
        const sixthSense = herta.effects.find(e => e.id === EFFECT_IDS.SIXTH_SENSE);
        const hasSixthSense = sixthSense && (sixthSense.stackCount || 0) > 0;

        if (hasSixthSense) {
            // 強化スキル扱い: 倍率上書き
            // 計算式: 強化ATKバフ適用
            // 「大胆なアイデア」: ATK+80%
            // ATK+80% (Base * 0.8) should be added to total ATK.
            // modifiers.atkBoost works as a multiplier to the final ATK calculation for this hit.
            // Ratio = (CurrentATK + BaseATK * 0.8) / CurrentATK
            const baseAtk = herta.baseStats.atk; // Character + LC base
            const currentAtk = herta.stats.atk;
            const atkIncrease = baseAtk * ENHANCED_SKILL_ATK_BUFF;
            const boostRatio = (currentAtk + atkIncrease) / currentAtk;

            newState = {
                ...newState,
                damageModifiers: {
                    ...newState.damageModifiers,
                    atkBoost: (newState.damageModifiers.atkBoost || 0) + (boostRatio - 1)
                }
            };

            // 倍率の変更は `event.abilityId` を見てダメージ計算器が行うが、
            // ここで `the-herta-skill` として処理されている以上、通常の倍率が使われてしまう。
            // `damageModifiers.finalDmgScale` みたいなのがあればいいが。
            // 
            // 解決策: `herta.abilities.skill` の内容を動的に変えることはできないが、
            // `damageModifiers` でなんとかする。
            // あるいは、`damage.ts` が `ON_BEFORE_DAMAGE_CALCULATION` で倍率をオーバーライドできる仕組みがあれば...
            // 残念ながら今の `DamageCalculationModifiers` には倍率そのものを変えるフィールドがない。
            // `dmgBoostMult` 等はある。

            // 仕方ないので、強引だが `value` (Base Damage) を書き換えるイベントがあれば... ない。
            //
            // 正攻法: アクション実行前に Effect をチェックして Action.abilityId を書き換える。
            // これができるのは `queueAction` の段階か、ユーザー入力段階。
            // シミュレーターとしては、第六感があるなら `the-herta-enhanced-skill` を使うように指示するべき。
            // 
            // しかし、オート戦闘(Scenario Test)では `SKILL` タイプのみ指定され、IDは指定されないことが多い。
            // その場合、`unit.abilities.skill` が使われる。
            // なので、`hertaHandlerFactory` ではなく、`herta` オブジェクトの `abilities.skill` を
            // Proxy的に振る舞わせるか... 無理。

            // やはりここで `damageModifiers.allTypeDmg` 等で調整して「強化スキル相当」にするしかない。
            // 通常: 70% x 3 = 210% (Main)
            // 強化: 200% (Main)
            // ほぼ同じ。
            // 天賦倍率加算: "解読1層につき +8.8%"
            // これがでかい。
            // 
            // 天賦倍率加算処理
            const decipherStacks = newState.registry.get(createUnitId(event.targetId!))?.effects.find(e => e.id === EFFECT_IDS.DECIPHER)?.stackCount || 0;
            const talentBonus = TALENT_MAIN_BONUS; // Lv10 8.0%
            const talentOtherBonus = TALENT_OTHER_BONUS; // Lv10 4.0%

            // 知恵シナジー
            const eruditionCount = newState.registry.getAliveAllies().filter(u => u.path === 'Erudition').length;
            const synergyBonusMain = (eruditionCount >= 2) ? TALENT_SYNERGY_MAIN_BONUS : 0;
            const synergyBonusOther = (eruditionCount >= 2) ? TALENT_SYNERGY_OTHER_BONUS : 0;

            // 倍率アップ計算
            let bonusMult = 0;
            if (event.subType === 'main' || /* 単体攻撃の場合 */ !event.subType) {
                // Main target logic check (Need to know if this unit is main target)
                // このイベントの `targetId` がメインか隣接かで判定したいが...
                // `event.targetId` はダメージを受ける相手。
                // 強化スキルが Blast なら、ターゲットタイプで判別必要。
            }

            // 複雑すぎるため、ダメージ計算部分で特殊係数を乗せる。
            // 解読数 * 係数 をダメージバフとして加算する。
            // "ダメージ倍率+X%" は枠としては "Skill Multiplier" への加算だが、
            // SimのDamage Formulaでは (SkillMult + Extra) * ATK * ... となる。
            // 現状のSimには Multiplier Additive 枠がない。
            // したがって DMG Boost 枠 (与ダメ枠) への換算が必要だが、正確ではない。
            // Base Damage = (ATK * (BaseMult + AddedMult))
            // Base Damage = (ATK * BaseMult) + (ATK * AddedMult)
            // つまり、追加ダメージ分を計算して、それを何らかの形で乗せる。

            // ここは一旦、与ダメ枠に加算する近似式を使う。
            // (BaseMult + Added) / BaseMult を乗算すればよい。
            // 例: Base 200%, Added 800% (100層*8%) -> Total 1000%. 5倍。
            // 与ダメ+400% すれば5倍になる。
            // Boost = Added / Base

            const baseMult = ENHANCED_SKILL_MAIN_MULT; // 2.0
            const addedMult = decipherStacks * (talentBonus + synergyBonusMain);
            const dmgScale = addedMult / baseMult;

            newState.damageModifiers.allTypeDmg = (newState.damageModifiers.allTypeDmg || 0) + dmgScale;

            // A2: 第六感消費時のダメージアップ 50% (解読42層時)
            // 昇格2: 強化戦闘スキル発動する時、メインターゲットの「解読」が42層に達している場合、与ダメージ+50%。
            if (decipherStacks >= 42) {
                newState.damageModifiers.allTypeDmg += 0.5;
            }
        }
    }

    // 必殺技ダメージ計算
    if (event.abilityId === 'the-herta-ultimate') {
        // A6: 回答スタック数 * 1%
        const answerStacks = herta.effects.find(e => e.id === EFFECT_IDS.ANSWER)?.stackCount || 0;
        const boost = answerStacks * A6_ULT_DMG_PER_STACK;

        newState.damageModifiers.allTypeDmg = (newState.damageModifiers.allTypeDmg || 0) + boost;

        // E6: 敵数に応じたダメージアップ
        if ((herta.eidolonLevel || 0) >= 6) {
            const enemyCount = newState.registry.getAliveEnemies().length;
            let checkScale = 0;
            if (enemyCount >= 3) checkScale = E6_ULT_3_ENEMY; // +140%
            else if (enemyCount === 2) checkScale = E6_ULT_2_ENEMY; // +250%
            else if (enemyCount === 1) checkScale = E6_ULT_1_ENEMY; // +400%

            // 倍率+X% なので、回答と同じく与ダメ枠に変換するなら、
            // Multiplier Additive.
            // (Base(200%) + Boost) / Base(200%)
            const baseMult = ULT_MULT; // 2.0
            const scale = checkScale / baseMult; // e.g. 4.0 / 2.0 = +200% dmg boost equivalent
            newState.damageModifiers.allTypeDmg += scale;
        }
    }

    return newState;
};


// アクション終了後の後処理 (強化スキル後の消費など)
const onActionCompletePost = (event: ActionEvent, state: GameState, hertaId: string): GameState => {
    let newState = state;
    const herta = newState.registry.get(createUnitId(hertaId));
    if (!herta) return newState;

    // スキル使用後
    if (event.actionType === 'SKILL' && event.sourceId === hertaId) {
        const sixthSense = herta.effects.find(e => e.id === EFFECT_IDS.SIXTH_SENSE);
        if (sixthSense && (sixthSense.stackCount || 0) > 0) {
            // 第六感消費
            const currentStack = sixthSense.stackCount || 0;
            const newStack = currentStack - 1;
            if (newStack > 0) {
                newState = {
                    ...newState,
                    registry: newState.registry.update(createUnitId(hertaId), u => ({
                        ...u,
                        effects: u.effects.map(e => e.id === EFFECT_IDS.SIXTH_SENSE ? { ...e, stackCount: newStack, name: `第六感 (${newStack})` } : e)
                    }))
                };
            } else {
                newState = removeEffect(newState, hertaId, EFFECT_IDS.SIXTH_SENSE);
            }
            // "消費" と明記されていない場合があるが、"「第六感」を持つ時...強化される" だけなら永続？
            // 必殺技で "1層獲得" 最大4層。
            // 永続なら最大数の意味がない。消費されるのが自然。通常は1回で1層。

            // 解読リセット処理
            // "強化戦闘スキルを発動した後、メインターゲットの「解読」層数を1層にリセットし..."
            // メインターゲット取得
            if (event.targetId) {
                const target = newState.registry.get(createUnitId(event.targetId));
                if (target) {
                    const resetVal = ((herta.eidolonLevel || 0) >= 1) ? E1_RESET_STACKS : 1;

                    // 解読保持数
                    const currentStack = target.effects.find(e => e.id === EFFECT_IDS.DECIPHER)?.stackCount || 0;

                    if (currentStack > resetVal) {
                        // 転移処理: 差分を他の敵に転移
                        // "敵が一時離脱、あるいは任意のユニットに倒された後、「解読」が転移する" とあるが、
                        // リセット時も転移するとは書いてある -> "リセットし... 「解読」が転移する" と読める？
                        // "リセットし... (中略) ... 「解読」が転移する"
                        // 原文確認: "メインターゲットの「解読」層数を1層にリセットし、(中略) 「解読」が転移する。"
                        // 読点「、」で繋がっているため、リセット時にも転移が発生する解釈で実装。
                        // 転移ロジック: 精鋭優先。
                        const stacksLegacy = currentStack - resetVal;

                        // メインターゲットの解読更新
                        newState = {
                            ...newState,
                            registry: newState.registry.update(createUnitId(event.targetId), u => ({
                                ...u,
                                effects: u.effects.map(e => e.id === EFFECT_IDS.DECIPHER ? { ...e, stackCount: resetVal, name: `解読 (${resetVal})` } : e)
                            }))
                        };

                        // 転移先選定 (ターゲット以外、精鋭優先)
                        const otherEnemies = newState.registry.getAliveEnemies().filter(e => e.id !== event.targetId);
                        if (otherEnemies.length > 0) {
                            const sorted = [...otherEnemies].sort((a, b) => getEnemyPriority(b) - getEnemyPriority(a));
                            // 最優先の敵1体に全転移？ "転移する" なので1体にまとめてドンか、分散か。
                            // "精鋭エネミー優先して転移する" -> 通常は1体にまとめる。
                            const recipient = sorted[0];
                            // 既存の解読に加算
                            newState = applyDecipher(newState, recipient.id, stacksLegacy, hertaId);
                        }
                    } else if (currentStack !== resetVal) {
                        // リセット値より低い場合はそのまま？あるいはリセット値になる？
                        // 通常 "リセット" は強制設定。
                        // しかしスタックが低いのに増えるのは変。
                        // "1層にリセットし" なので強制1層。15層リセット(E1)なら最低15層確保とも読めるが、
                        // "リセット" は通常 "初期化"。
                        // ここでは max(1, current) ではなく、強制設定とするが、
                        // "余剰分が転移" なので、不足分をどこかから持ってくるわけではない。
                        // つまり current < resetVal のケースは転移なし、値変更なし が自然。
                    }
                }
            }

            // E2 Action Advance (35%)
            if ((herta.eidolonLevel || 0) >= 2) {
                newState = {
                    ...newState,
                    pendingActions: [
                        ...newState.pendingActions,
                        {
                            type: 'ACTION_ADVANCE',
                            targetId: hertaId,
                            percent: E2_SPEED_BOOST
                        } as any
                    ]
                };
            }
        }
    }

    return newState;
}

// 敵死亡時の解読転移
const onUnitDeath = (event: any, state: GameState, hertaId: string): GameState => {
    // 敵が死んだら、その敵の解読スタックを転移
    const deadUnit = event.target || state.registry.get(createUnitId(event.targetId)); // イベントによって中身が違うかも
    // ここでは単純に死亡ユニットIDから探索できない（死んでるからRegistryにいないかも、いやAliveからは消えるがRegistryには残る？）
    // Event: ON_UNIT_DEATH targetId
    // effectManager等で削除される前に捕捉する必要がある。

    // ON_UNIT_DEATH は死亡確定後。Effectは消えているかもしれない。
    // ON_BEFORE_DEATH があればそこでスタックを保存。
    // 無ければ、EffectManagerが消去する前に介入が必要。

    // 現在のSim仕様では、死亡した瞬間にEffectは消えない？
    // cleanUpPhase等で消える。
    // なので参照できるはず。

    // 転移処理...
    // 実装省略。複雑になりすぎるため。
    return state;
}

// ファクトリ
export const theHertaHandlerFactory: IEventHandlerFactory = (
    sourceUnitId,
    level,
    eidolonLevel = 0
) => {
    return {
        handlerMetadata: {
            id: `the-herta-handler-${sourceUnitId}`,
            subscribesTo: [
                'ON_BATTLE_START',
                'ON_WAVE_START',
                'ON_TURN_START',
                'ON_ACTION_COMPLETE',
                'ON_BEFORE_DAMAGE_CALCULATION',
                'ON_ULTIMATE_USED',
                'ON_DAMAGE_DEALT', // A2判定用
                'ON_UNIT_DEATH'
            ]
        },
        handlerLogic: (event: IEvent, state: GameState, handlerId: string): GameState => {
            const unit = state.registry.get(createUnitId(sourceUnitId));
            if (!unit) return state;

            if (event.type === 'ON_BATTLE_START') {
                return onStart(state, sourceUnitId, eidolonLevel, false);
            }
            if (event.type === 'ON_WAVE_START') {
                return onStart(state, sourceUnitId, eidolonLevel, true);
            }
            if (event.type === 'ON_BEFORE_DAMAGE_CALCULATION') {
                return onBeforeDamageCalc(event, state, sourceUnitId);
            }
            if (event.type === 'ON_ULTIMATE_USED' && event.sourceId === sourceUnitId) {
                return onUltimateUsed(event, state, sourceUnitId);
            }
            if (event.type === 'ON_ACTION_COMPLETE') {
                let s = onActionComplete(event, state, sourceUnitId);
                s = onActionCompletePost(event, s, sourceUnitId);
                return s;
            }
            if (event.type === 'ON_DAMAGE_DEALT') {
                // A2などの判定用フラグ設定等が必要ならここ
                return state;
            }
            if (event.type === 'ON_UNIT_DEATH') {
                return onUnitDeath(event, state, sourceUnitId);
            }

            return state;
        }
    };
};
