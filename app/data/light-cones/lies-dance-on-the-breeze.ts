import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const LIES_DANCE_ON_THE_BREEZE: ILightConeData = {
    id: 'lies-dance-on-the-breeze',
    name: '風に揺蕩う虚言',
    description: '装備キャラの速度+18%。装備キャラが攻撃を行った後、120%の基礎確率で敵それぞれを「茫然」状態にする。「茫然」状態の敵の防御力-16%、2ターン継続。また、装備キャラの速度が170以上の場合、120%の基礎確率で敵それぞれを「盗難」状態にする。「盗難」状態の敵の防御力-8%、2ターン継続。「茫然」または「盗難」状態が重複して付与された場合、最後に付与されたもののみが有効となる。',
    descriptionTemplate: '装備キャラの速度+{0}%。装備キャラが攻撃を行った後...「茫然」(-{1}%) ... 「盗難」(-{2}%)...',
    descriptionValues: [
        ['18', '16', '8'],
        ['21', '18', '9'],
        ['24', '20', '10'],
        ['27', '22', '11'],
        ['30', '24', '12']
    ],
    path: 'Nihility',
    baseStats: {
        hp: 952,
        atk: 582,
        def: 529,
    },
    passiveEffects: [
        {
            id: 'deceit-spd',
            name: '欺瞞（速度）',
            category: 'BUFF',
            targetStat: 'spd_pct',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
        }
    ],
    eventHandlers: [
        {
            id: 'deceit-debuff-apply',
            name: '欺瞞（デバフ付与）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event)) return state;

                // "Enemies respectively" (AoE).
                // Simulator `ON_ATTACK` is usually one-per-action or one-per-target?
                // Assuming single target ref for now, logic extends if event is AoE.
                const targetId = event.targetId as string;

                // Values
                const defShred1 = [0.16, 0.18, 0.20, 0.22, 0.24][superimposition - 1]; // Dazed (茫然)
                const defShred2 = [0.08, 0.09, 0.10, 0.11, 0.12][superimposition - 1]; // Stolen (盗難)

                // Condition: Speed >= 170
                const speed = unit.stats.spd || 0; // Final Speed
                const applyStolen = speed >= 170;

                let newState = state;

                // Mutually Exclusive? "Only last applied is valid".
                // Implies if we apply Stolen, it overwrites Dazed?
                // "If Dazed or Stolen are applied repeatedly (overlapping?), only last one valid."
                // Wait. "Also... if speed > 170... apply Stolen".
                // Can we have BOTH?
                // "Duplicates (Duplicate types/names) ... last one valid."
                // Usually means "Dazed doesnt stack with Dazed".
                // Does Dazed stack with Stolen?
                // Text: "If 'Dazed' OR 'Stolen' are applied overlappingly (duplicate?), only last one valid."
                // Ambiguous. Usually distinct IDs stack unless specified group.
                // JP: "'茫然'または'盗難'状態が重複して付与された場合、最後に付与されたもののみが有効となる。"
                // Sounds like they share a slot/group.
                // So if you have Dazed, and get Stolen -> Stolen overwrites Dazed.
                // If you have Stolen, get Dazed -> Dazed overwrites Stolen.
                // BUT: "After attack... apply Dazed. ALSO if Speed > 170 apply Stolen".
                // If both applied same time -> Stolen comes after? or simultaneous?
                // Usually high speed bonus is SUPERIOR.
                // -16% (Dazed) vs -8% (Stolen).
                // Wait. Dazed is STRONGER (16%). Stolen is WEAKER (8%).
                // Why would 170 Spd give a weaker debuff?
                // Maybe they stack?
                // "If Dazed... duplicated...".
                // Maybe "Dazed" and "Stolen" are just names for same slot.
                // If I am fast, I apply BOTH? 16% + 8%?
                // Jiaoqiu's LC logic: "Unarmed" and "Cornered".
                // Here: "Apply Dazed (-16%). ALSO if fast, Apply Stolen (-8%)."
                // If they don't stack, adding weak one cancels strong one? That's bad design.
                // Likely they STACK with each other, but not themselves.
                // "Please treat Dazed/Stolen duplicates as distinct".
                // Re-reading JP: "If Dazed or Stolen is applied in duplicate (stacking with itself?), only last one valid."
                // Probably means "Dazed doesn't stack with Dazed" and "Stolen doesn't stack with Stolen".
                // So we apply both if Spd > 170.

                // Apply Dazed
                newState = addEffect(newState, targetId, {
                    id: `deceit_dazed_${targetId}`,
                    name: '茫然',
                    category: 'DEBUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    stackCount: 1,
                    modifiers: [{ target: 'def_pct', value: -defShred1, type: 'add', source: '風に揺蕩う虚言' }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                // Apply Stolen (if fast)
                if (applyStolen) {
                    newState = addEffect(newState, targetId, {
                        id: `deceit_stolen_${targetId}`,
                        name: '盗難',
                        category: 'DEBUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_END_BASED',
                        duration: 2,
                        stackCount: 1,
                        modifiers: [{ target: 'def_pct', value: -defShred2, type: 'add', source: '風に揺蕩う虚言' }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }

                return newState;
            }
        }
    ]
};
