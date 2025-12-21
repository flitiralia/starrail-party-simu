import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const dreamvilleAdventure: ILightConeData = {
    id: 'dreamville-adventure',
    name: 'ドリームタウンの大冒険',
    description: '装備キャラが通常攻撃、戦闘スキル、必殺技のうち、いずれかのタイプのスキルを発動した後、味方全体に「童心」を付与する。装備キャラが最後に発動したスキルに応じて、「童心」を持つ味方の同一タイプのスキルの与ダメージ+12%。この効果は累積できない。',
    descriptionTemplate: '装備キャラが通常攻撃、戦闘スキル、必殺技のうち、いずれかのタイプのスキルを発動した後、味方全体に「童心」を付与する。',
    descriptionValues: [['12'], ['14'], ['16'], ['18'], ['20']],
    path: 'Harmony',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },
    passiveEffects: [],
    eventHandlers: [
        {
            id: 'dreamville_trigger',
            name: 'ドリームタウンの大冒険（童心付与）',
            events: ['ON_BASIC_ATTACK', 'ON_SKILL_USED', 'ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // タイプを決定
                let type = '';
                if (event.type === 'ON_BASIC_ATTACK') type = 'basic_dmg_boost'; // ステータス名を使用？
                // バフは「同タイプのスキルの与ダメージ」に適用される。
                // Stats: basic_dmg_boost, skill_dmg_boost, ult_dmg_boost.
                if (event.type === 'ON_SKILL_USED') type = 'skill_dmg_boost';
                if (event.type === 'ON_ULTIMATE_USED') type = 'ult_dmg_boost';

                if (!type) return state;

                const value = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                // 味方全体に適用
                const allies = state.registry.getAliveAllies();
                let newState = state;

                allies.forEach(ally => {
                    // ユニークな「童心」バフ。「累積不可」。
                    // 以前のものを置き換える？テキストは明示的に「置き換える」とは言っていないが、ロジックは「最後に使用したスキルに応じる」ことを示唆している。
                    // したがって上書きする。

                    newState = addEffect(newState, ally.id, {
                        id: `dreamville_childishness_${ally.id}`,
                        name: '童心',
                        category: 'BUFF',
                        sourceUnitId: unit.id,
                        durationType: 'PERMANENT', // 置き換えられるまで
                        duration: -1,
                        stackCount: 1,
                        modifiers: [
                            { target: type as any, value: value, type: 'add', source: 'ドリームタウンの大冒険' }
                        ],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                });

                return newState;
            }
        }
    ]
};
