import { ILightConeData } from '@/app/types';
import { addEffect, removeEffect } from '@/app/simulator/engine/effectManager';
import { addSkillPoints } from '@/app/simulator/engine/sp';

export const epochMarkedByGold: ILightConeData = {
    id: 'epoch-marked-by-gold',
    name: '黄金の血で刻む時代',
    description: '装備キャラの攻撃力+64%。必殺技で攻撃を行った後、SPを1回復する。装備キャラが味方単体キャラに戦闘スキルを発動した後、その味方の戦闘スキルダメージ+54%、3ターン継続。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。必殺技で攻撃を行った後、SPを1回復する。装備キャラが味方単体キャラに戦闘スキルを発動した後、その味方の戦闘スキルダメージ+{1}%、3ターン継続。',
    descriptionValues: [
        ['64', '54.0'],
        ['80', '67.5'],
        ['96', '81.0'], // Interpolated 
        ['112', '94.5'], // Interpolated
        ['128', '108.0']
    ],
    path: 'Harmony',
    baseStats: {
        hp: 952,
        atk: 635,
        def: 463,
    },
    passiveEffects: [
        {
            id: 'epoch_gold_atk',
            name: '黄金の血で刻む時代（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.64, 0.80, 0.96, 1.12, 1.28]
        }
    ],
    eventHandlers: [
        {
            id: 'epoch_gold_ult_sp',
            name: '黄金の血で刻む時代（必殺技SP）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                // Relying on ON_DAMAGE_DEALT for simplicity/accuracy as handled in next handler
                return state;
            }
        },
        {
            id: 'epoch_gold_sp_logic',
            name: '黄金の血で刻む時代（SPロジック）',
            events: ['ON_DAMAGE_DEALT'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                const dmgEvent = event as import('@/app/simulator/engine/types').DamageDealtEvent;

                if (dmgEvent.actionType !== 'ULTIMATE') return state;

                const lockId = `epoch_gold_sp_lock_${unit.id}`;
                if (unit.effects.some(e => e.id === lockId)) return state;

                let newState = addSkillPoints(state, 1).state;

                newState = addEffect(newState, unit.id, {
                    id: lockId,
                    name: 'Internal Lock',
                    category: 'STATUS',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    stackCount: 1,
                    modifiers: [],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });

                return newState;
            }
        },
        {
            id: 'epoch_gold_cleanup',
            name: '黄金の血で刻む時代（掃除）',
            events: ['ON_ACTION_COMPLETE'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                return removeEffect(state, unit.id, `epoch_gold_sp_lock_${unit.id}`);
            }
        },
        {
            id: 'epoch_gold_skill_buff',
            name: '黄金の血で刻む時代（スキルバフ）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                if (!('targetId' in event) || !event.targetId) return state;
                const targetId = event.targetId;

                const buffVal = [0.54, 0.675, 0.81, 0.945, 1.08][superimposition - 1];

                return addEffect(state, targetId, {
                    id: `epoch_gold_skill_dmg_${targetId}`,
                    name: '征服（スキルダメ）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_START_BASED',
                    duration: 3,
                    stackCount: 1,
                    modifiers: [
                        { target: 'skill_dmg_boost', value: buffVal, type: 'add', source: '黄金の血で刻む時代' }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
