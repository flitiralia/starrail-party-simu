import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const THE_FOREVER_VICTUAL: ILightConeData = {
    id: 'the-forever-victual',
    name: '永遠の迷境ごはん',
    description: '装備キャラの攻撃力+16%。装備キャラが戦闘スキルを発動した後、攻撃力+8%、この効果は最大で3層累積できる。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。装備キャラが戦闘スキルを発動した後、攻撃力+{1}%、この効果は最大で3層累積できる。',
    descriptionValues: [
        ['16', '8'],
        ['20', '10'],
        ['24', '12'],
        ['28', '14'],
        ['32', '16']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 952,
        atk: 476,
        def: 330,
    },
    passiveEffects: [
        {
            id: 'eternal-maze-base-atk',
            name: '永遠の迷境ごはん（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.16, 0.20, 0.24, 0.28, 0.32]
        }
    ],
    eventHandlers: [
        {
            id: 'eternal-maze-stack',
            name: '永遠の迷境ごはん（累積攻撃力）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const buffPerStack = [0.08, 0.10, 0.12, 0.14, 0.16][superimposition - 1];
                const current = unit.effects.find(e => e.id === `eternal_maze_stack_${unit.id}`);
                const currentCount = current ? (current.stackCount || 0) : 0;
                const nextCount = Math.min(currentCount + 1, 3);

                return addEffect(state, unit.id, {
                    id: `eternal_maze_stack_${unit.id}`,
                    name: 'いい匂い！（攻撃力）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: nextCount,
                    modifiers: [
                        { target: 'atk_pct', value: buffPerStack * nextCount, type: 'add', source: '永遠の迷境ごはん' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
