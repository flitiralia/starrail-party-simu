import { Character, StatKey, FinalStats, CharacterStats } from '../types';
import { createEmptyStatRecord, calculateFinalStats } from './statBuilder';

/**
 * 最終ステータス（ゲーム画面で見ている数値）から、不足しているサブステータス分を抽出する。
 * メインステータスやセット効果、光円錐、軌跡などの静的なボーナスは現在の装備状態から計算に含める。
 * 
 * @param character キャラクター（光円錐・遺物・オーナメント装備済み）
 * @param finalStatsInput 入力された最終ステータス
 * @returns 不足分を補うためのサブステータスの配列
 */
export function calculateSubStatsFromFinal(
    character: Character,
    finalStatsInput: Partial<FinalStats>
): { stat: StatKey; value: number }[] {
    // 1. サブステータスのみを除去したキャラクター状態を作成
    const charWithMainStatsOnly: Character = {
        ...character,
        relics: (character.relics || []).map(r => ({ ...r, subStats: [] })),
        ornaments: (character.ornaments || []).map(o => ({ ...o, subStats: [] })),
        // 以前付与された調整用エフェクトがあれば除外
        effects: (character.effects || []).filter(e => e.id !== 'relic-stat-adjustment')
    };

    // 2. 遺物本体のメインステータスやセット効果込みのステータスを取得
    const baseWithMainAndSets = calculateFinalStats(charWithMainStatsOnly);

    // 3. 最終ステータスとの差分をサブステータスとして抽出
    const subStats: { stat: StatKey; value: number }[] = [];
    for (const key in finalStatsInput) {
        const statKey = key as StatKey;
        const inputValue = finalStatsInput[statKey];

        if (inputValue !== undefined) {
            const baseValue = baseWithMainAndSets[statKey] || 0;
            const diff = inputValue - baseValue;

            if (Math.abs(diff) > 0.0001) {
                subStats.push({ stat: statKey, value: diff });
            }
        }
    }

    return subStats;
}

/**
 * @deprecated Use calculateSubStatsFromFinal instead
 */
export function calculateRelicBonusFromFinalStats(
    character: Character,
    finalStatsInput: Partial<FinalStats>
): Record<StatKey, number> {
    const subStats = calculateSubStatsFromFinal(character, finalStatsInput);
    const result = createEmptyStatRecord();
    subStats.forEach(s => {
        result[s.stat] = s.value;
    });
    return result;
}

/**
 * 遺物ボーナスを CharacterStats.add に適用する Modifier のリストに変換する
 */
export function convertRelicBonusToModifiers(relicBonus: Record<StatKey, number>) {
    return Object.entries(relicBonus)
        .filter(([_, value]) => value !== 0)
        .map(([key, value]) => ({
            target: key as StatKey,
            value: value,
            type: 'add' as const,
            source: 'Relic (Calculated from Final Stats)'
        }));
}
