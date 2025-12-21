import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';

export const heyOverHere: ILightConeData = {
    id: 'hey-over-here',
    name: '「よぉ、ここにいるぜ」',
    description: '装備キャラの最大HP+8%。装備キャラが戦闘スキルを発動した時、治癒量+16%。2ターン継続。',
    descriptionTemplate: '装備キャラの最大HP+{0}%。装備キャラが戦闘スキルを発動した時、治癒量+{1}%。2ターン継続。',
    descriptionValues: [
        ['8', '16'],
        ['9', '19'],
        ['10', '22'],
        ['11', '25'],
        ['12', '28']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },

    passiveEffects: [
        {
            id: 'hey-hp',
            name: '怖くない…こわくない!（HP）',
            category: 'BUFF',
            targetStat: 'hp_pct',
            effectValue: [0.08, 0.09, 0.10, 0.11, 0.12]
        }
    ],

    eventHandlers: [
        {
            id: 'hey-heal-buff',
            name: '怖くない…こわくない!（治癒バフ）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const healBoost = [0.16, 0.19, 0.22, 0.25, 0.28][superimposition - 1];

                return addEffect(state, unit.id, {
                    id: `hey-over-here-buff-${unit.id}`,
                    name: '「よぉ、ここにいるぜ」（治癒量）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    modifiers: [{
                        target: 'outgoing_healing_boost',
                        value: healBoost,
                        type: 'add',
                        source: '「よぉ、ここにいるぜ」'
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
