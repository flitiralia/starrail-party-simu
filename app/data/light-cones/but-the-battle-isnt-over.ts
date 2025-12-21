import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';
import { addSkillPoints } from '@/app/simulator/engine/sp';

export const butTheBattleIsntOver: ILightConeData = {
    id: 'but-the-battle-isnt-over',
    name: 'だが戦争は終わらない',
    description: '装備キャラのEP回復効率+10%。味方に対して必殺技を発動した時、SPを1回復する、この効果は必殺技を2回発動するたびに1回発動できる。装備キャラが戦闘スキルを発動した後、次に行動する他の味方の与ダメージ+30%、1ターン継続。',
    descriptionTemplate: '装備キャラのEP回復効率+{0}%。味方に対して必殺技を発動した時、SPを1回復する、この効果は必殺技を2回発動するたびに1回発動できる。装備キャラが戦闘スキルを発動した後、次に行動する他の味方の与ダメージ+{1}%、1ターン継続。',
    descriptionValues: [
        ['10', '30'],
        ['12', '35'],
        ['14', '40'],
        ['16', '45'],
        ['18', '50']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 1164,
        atk: 529,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'but_battle_err',
            name: 'だが戦争は終わらない（EP回復効率）',
            category: 'BUFF',
            targetStat: 'energy_regen_rate',
            effectValue: [0.10, 0.12, 0.14, 0.16, 0.18]
        }
    ],
    eventHandlers: [
        {
            id: 'but_battle_sp_restore',
            name: 'だが戦争は終わらない（SP回復）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // "2回発動するたびに"の条件チェック
                // トラッカーが必要。
                const trackerId = `but_battle_ult_tracker_${unit.id}`;
                const tracker = unit.effects.find(e => e.id === trackerId);
                const count = tracker ? (tracker.stackCount || 0) : 0;
                const newCount = count + 1;

                let newState = state;

                // "必殺技を2回発動するたびにSPを回復"。
                // 2回目に発動？それとも1回目？
                // "必殺技を2回発動するたびに1回発動できる。"
                // 通常は2回目の使用で発動することを意味する？あるいは1回目で発動し、2回目でクールダウンリセット？
                // テキスト：「必殺技を2回発動するたびに1回発動できる」
                // 「2回ごとに」-> 2, 4, 6...
                // カウントが2に達したときに発動し、その後リセット（またはモジュロ）と仮定する。

                // 訂正：一部の翻訳では「2回の使用につき1回」を意味する。
                // 使用すると1SPを得る。その後2回使用する必要がある（合計3回？）それとも待つだけ？
                // 詳細な動作：使用1、使用2（CD）、使用3（発動）。
                // よって1, 3, 5...回目で発動（Count % 2 != 0）。

                // また：「味方に必殺技を発動した時」。
                // ターゲットを確認する必要がある。
                // `targetId` はアクションイベントにあるか？
                // ON_ULTIMATE_USEDは厳密にはターゲットをIEventベースで持たない（ActionEvent/UsageEventにキャストしない限り）。
                // ディスパッチャでは`ON_ULTIMATE_USED`が発行される。
                // `targetId`プロパティは`IEvent`に存在する（オプション）。
                // 全体バフ必殺技（全体）の場合、targetIdは自身またはnull？
                // 単体必殺技（ブローニャ）の場合、targetIdは味方。
                // 自己バフ（ルアン・メェイ）の場合、targetIdは自身（味方）。
                // 条件："味方に対して"。自身も通常は味方としてカウントされる。

                if (newCount % 2 === 1) { // 1回目、3回目、5回目...
                    newState = addSkillPoints(newState, 1).state;
                }

                // Update tracker
                newState = addEffect(newState, unit.id, {
                    id: trackerId,
                    name: 'だが戦争は終わらない（回数）',
                    category: 'STATUS',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: newCount,
                    modifiers: [],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                return newState;
            }
        },
        {
            id: 'but_battle_next_ally_dmg',
            name: 'だが戦争は終わらない（次行動バフ）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // グローバルな効果/監視を追加し、「次の味方の行動」を待つ。
                // 戦略：装備者（またはシステム）に効果を追加し、味方（装備者以外？）の "ON_BEFORE_ACTION" をリッスンする。
                // "次に行動する他の味方"。

                const dmgBuff = [0.30, 0.35, 0.40, 0.45, 0.50][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `but_battle_watcher_${unit.id}`,
                    name: '継承者（次行動待機）',
                    category: 'STATUS',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT', // 発動するまで持続
                    duration: -1,
                    stackCount: 1,
                    modifiers: [],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        },
        {
            id: 'but_battle_watcher_logic',
            name: '継承者（バフ適用ロジック）',
            events: ['ON_BEFORE_ACTION'],
            handler: (event, state, unit, superimposition) => {
                // ユニットに監視者が存在するか確認
                const watcher = unit.effects.find(e => e.id === `but_battle_watcher_${unit.id}`);
                if (!watcher) return state;

                if (event.sourceId === unit.id) return state; // 自分自身は無視（"他の味方"）
                // テキスト："Next acting other ally" または単に "Next acting ally"？
                // 日本語では "次に行動する他の味方"。
                // なので自分は無視。

                const actionEvent = event as import('@/app/simulator/engine/types').BeforeActionEvent;
                // ターンアクションまたは特定のアクションでのみ発動？
                // 通常「行動する時」。
                // スキル、通常攻撃、必殺技で発動？
                // "次に行動する味方" -> 通常はターンベースの行動。
                // しかし必殺技は割り込むことができる。
                // ブローニャがスキル使用 -> ゼーレが即座に行動（ターン）。ゼーレがバフを得る。
                // ブローニャがスキル使用 -> ゼーレが必殺技使用？ 必殺技は消費するか？
                // 通常「行動」はターン行動を意味する。
                // しかしシミュレータの「Next Action」の実装は汎用的かもしれない。
                // 可能なら割り込みアクション以外に制限する？
                // あるいは単純に：攻撃行動を行う最初の味方？
                // "1ターン与ダメージ+30%"。
                // その味方にバフを適用する。

                const targetAllyId = event.sourceId || '';
                if (!targetAllyId) return state;

                // Remove watcher
                let newState = removeEffect(state, unit.id, watcher.id);

                const dmgBuff = [0.30, 0.35, 0.40, 0.45, 0.50][superimposition - 1];

                // 味方にバフを適用
                newState = addEffect(newState, targetAllyId, {
                    id: `but_battle_dmg_buff_${targetAllyId}`,
                    name: '継承者（与ダメージ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 1,
                    stackCount: 1,
                    modifiers: [{ target: 'all_type_dmg_boost', value: dmgBuff, type: 'add', source: 'だが戦争は終わらない' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                return newState;
            }
        }
    ]
};
