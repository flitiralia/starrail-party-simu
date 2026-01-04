import { ILightConeData } from '../../types';
import { IEffect } from '../../simulator/effect/types';
import { addEffect, removeEffect } from '../../simulator/engine/effectManager';
import { createUnitId } from '../../simulator/engine/unitId';

export const LONG_MAY_RAINBOWS_ADORN_THE_SKY: ILightConeData = {
    id: 'long-may-rainbows-adorn-the-sky',
    name: '空の虹が消えぬように',
    description: '装備キャラの速度+18%。装備キャラが通常攻撃、戦闘スキルまたは必殺技を発動する時、味方それぞれが自身の残りHP1.0%分のHPを消費し、装備キャラの記憶の精霊が次の攻撃を行った後に消費したHP250.0%分の付加ダメージを1回与える。なお、この付加ダメージの属性は装備キャラの記憶の精霊と同じものになる。その後、消費したHPのカウントはクリアされる。装備キャラの記憶の精霊が精霊スキルを発動する時、敵全体の受けるダメージ+18.0%、2ターン継続。同系統のスキルは累積できない。',
    descriptionTemplate: '装備キャラの速度+{0}%。装備キャラが通常攻撃、戦闘スキルまたは必殺技を発動する時、味方それぞれが自身の残りHP{1}%分のHPを消費し、装備キャラの記憶の精霊が次の攻撃を行った後に消費したHP{2}%分の付加ダメージを1回与える。なお、この付加ダメージの属性は装備キャラの記憶の精霊と同じものになる。その後、消費したHPのカウントはクリアされる。装備キャラの記憶の精霊が精霊スキルを発動する時、敵全体の受けるダメージ+{3}%、2ターン継続。同系統のスキルは累積できない。',
    descriptionValues: [
        ['18', '1.0', '250', '18.0'],
        ['21', '1.3', '312', '22.0'],
        ['24', '1.5', '375', '27.0'],
        ['27', '1.8', '437', '31.0'],
        ['30', '2.0', '500', '36.0']
    ],
    path: 'Remembrance',
    baseStats: {
        hp: 1164,
        atk: 476,
        def: 529,
    },
    passiveEffects: [
        {
            id: 'rainbow-spd',
            name: '包容（速度）',
            category: 'BUFF',
            targetStat: 'spd_pct',
            effectValue: [0.18, 0.21, 0.24, 0.27, 0.30]
        }
    ],
    eventHandlers: [
        {
            id: 'rainbow-hp-consume',
            name: '包容（HP消費）',
            events: ['ON_BASIC_ATTACK', 'ON_SKILL_USED', 'ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const consumePct = [0.01, 0.013, 0.015, 0.018, 0.02][superimposition - 1];
                const allies = state.registry.getAliveAllies();
                let totalConsumed = 0;
                let newState = state;

                allies.forEach(ally => {
                    const consumed = Math.max(1, Math.floor(ally.hp * consumePct));
                    if (ally.hp > consumed) {
                        const newHp = ally.hp - consumed;
                        totalConsumed += consumed;
                        newState = {
                            ...newState,
                            registry: newState.registry.update(createUnitId(ally.id), u => ({ ...u, hp: newHp }))
                        };
                    }
                });

                const storageId = `rainbow-hp-store-${unit.id}`;
                const existing = unit.effects.find(e => e.id === storageId);
                const currentStored = existing ? ((existing.miscData?.value as number) || 0) : 0;
                const newStored = currentStored + totalConsumed;

                const storageEffect: IEffect = {
                    id: storageId,
                    name: '包容（蓄積HP）',
                    category: 'OTHER',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1,
                    miscData: { value: newStored },
                    apply: (u, s) => s,
                    remove: (u, s) => s,
                    modifiers: [] // 安全のため明示的な修正を追加
                };
                return addEffect(newState, unit.id, storageEffect);
            }
        },
        {
            id: 'rainbow-additional-dmg',
            name: '包容（付加ダメージ）',
            events: ['ON_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source || !source.isSummon || source.ownerId !== unit.id) return state;

                const storageId = `rainbow-hp-store-${unit.id}`;
                const storageEffect = unit.effects.find(e => e.id === storageId);
                if (!storageEffect || !storageEffect.miscData?.value) return state;

                const storedHp = storageEffect.miscData.value as number;
                const dmgPct = [2.5, 3.12, 3.75, 4.37, 5.0][superimposition - 1];
                const damageAmount = storedHp * dmgPct;

                const targetId = (event as any).targetId;
                if (!targetId) return state;

                const targetUnit = state.registry.get(createUnitId(targetId));
                if (!targetUnit) return state;

                const newHp = Math.max(0, targetUnit.hp - damageAmount);
                let newState = {
                    ...state,
                    registry: state.registry.update(createUnitId(targetId), u => ({ ...u, hp: newHp }))
                };

                // 統合ログに付加ダメージを追記
                const { appendAdditionalDamage } = require('../../simulator/engine/dispatcher');
                newState = appendAdditionalDamage(newState, {
                    source: source.name,
                    name: '空の虹が消えぬように',
                    damage: damageAmount,
                    target: targetUnit.name,
                    damageType: 'additional',
                    isCrit: false,
                    breakdownMultipliers: {
                        baseDmg: damageAmount,
                        critMult: 1,
                        dmgBoostMult: 1,
                        defMult: 1,
                        resMult: 1,
                        vulnMult: 1,
                        brokenMult: 1
                    }
                });

                newState = removeEffect(newState, unit.id, storageId);

                return newState;
            }
        },
        {
            id: 'rainbow-spirit-skill',
            name: '包容（被ダメデバフ）',
            events: ['ON_SKILL_USED'],
            handler: (event, state, unit, superimposition) => {
                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source || !source.isSummon || source.ownerId !== unit.id) return state;

                const vulnBoost = [0.18, 0.22, 0.27, 0.31, 0.36][superimposition - 1];
                const enemies = state.registry.getEnemies(unit.id);
                let newState = state;

                for (const enemy of enemies) {
                    newState = addEffect(newState, enemy.id, {
                        id: `rainbow-vuln-${source.id}`,
                        name: '包容（被ダメージ）',
                        category: 'DEBUFF',
                        sourceUnitId: unit.id,
                        durationType: 'TURN_START_BASED',
                        duration: 2,
                        modifiers: [{
                            target: 'all_dmg_taken_boost',
                            value: vulnBoost,
                            type: 'add',
                            source: '空の虹が消えぬように'
                        }],
                        apply: (u, s) => s,
                        remove: (u, s) => s
                    });
                }
                return newState;
            }
        }
    ]
};
