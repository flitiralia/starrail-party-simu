import { ILightConeData } from '../../types';
import { addEffect } from '../../simulator/engine/effectManager';
import { applyHealing } from '../../simulator/engine/utils';
import { Unit } from '../../simulator/engine/types';

export const nightOfFright: ILightConeData = {
    id: 'night-of-fright',
    name: '驚魂の夜',
    description: '装備キャラのEP回復効率＋12％。味方が必殺技を発動した時、装備キャラは残りHPが最も低い味方のHPを、その味方の最大HP10%分回復する。装備キャラが味方に治癒を行った時、その味方の攻撃力+2.4%、この効果は最大で5層累積できる、2ターン継続。',
    descriptionTemplate: '装備キャラのEP回復効率＋{0}％。味方が必殺技を発動した時、装備キャラは残りHPが最も低い味方のHPを、その味方の最大HP{1}%分回復する。装備キャラが味方に治癒を行った時、その味方の攻撃力+{2}%、この効果は最大で5層累積できる、2ターン継続。',
    descriptionValues: [
        ['12', '10', '2.4'],
        ['14', '11', '2.8'],
        ['16', '12', '3.2'],
        ['18', '13', '3.6'],
        ['20', '14', '4.0']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 1164,
        atk: 476,
        def: 529,
    },

    passiveEffects: [
        {
            id: 'night-err',
            name: '全力深呼吸（EP回復効率）',
            category: 'BUFF',
            targetStat: 'energy_regen_rate',
            effectValue: [0.12, 0.14, 0.16, 0.18, 0.20]
        }
    ],

    eventHandlers: [
        {
            id: 'night-heal-on-ult',
            name: '全力深呼吸（必殺技回復）',
            events: ['ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                const source = state.registry.get(createUnitId(event.sourceId));
                if (!source || source.isEnemy) return state; // Only allies

                const healPct = [0.10, 0.11, 0.12, 0.13, 0.14][superimposition - 1];

                // Heal lowest HP ally
                const allies = state.registry.getAliveAllies();
                if (allies.length === 0) return state;

                const lowest = allies.reduce((curr, prev) => (curr.hp / curr.stats.hp) < (prev.hp / prev.stats.hp) ? curr : prev, allies[0]);

                const amount = lowest.stats.hp * healPct;

                return applyHealing(state, unit.id, lowest.id, amount, '驚魂の夜（自動回復）');
            }
        },
        {
            id: 'night-atk-buff',
            name: '全力深呼吸（攻撃力バフ）',
            events: ['ON_UNIT_HEALED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;
                if (!('targetId' in event)) return state;
                const targetId = event.targetId;
                if (!targetId) return state;

                const atkBoost = [0.024, 0.028, 0.032, 0.036, 0.040][superimposition - 1];

                // ターゲットに累積可能なバフ
                const buffId = `night-atk-${targetId}`;
                const targetUnit = state.registry.get(createUnitId(targetId));
                if (!targetUnit) return state;

                const existing = targetUnit.effects.find(e => e.id === buffId);
                const currentStack = existing ? (existing.stackCount || 0) : 0;
                const nextStack = Math.min(currentStack + 1, 5);

                return addEffect(state, targetId, {
                    id: buffId,
                    name: '全力深呼吸（攻撃力）',
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'TURN_END_BASED',
                    duration: 2,
                    stackCount: nextStack,
                    modifiers: [{
                        target: 'atk_pct',
                        value: atkBoost * nextStack,
                        type: 'add',
                        source: '驚魂の夜'
                    }],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};

// Helper for createUnitId if not imported? (It is imported)
function createUnitId(id: string): import('../../simulator/engine/unitId').UnitId {
    return id as import('../../simulator/engine/unitId').UnitId;
}
