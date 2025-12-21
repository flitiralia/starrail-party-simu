import { ILightConeData } from '../../types';
import { addEnergyToUnit } from '../../simulator/engine/energy';
import { createUnitId } from '../../simulator/engine/unitId';
import { CooldownResetType } from '../../types/lightcone';

export const dreamsMontage: ILightConeData = {
    id: 'dreams-montage',
    name: '夢のモンタージュ',
    description: '装備キャラの速度+8%、弱点撃破状態の敵を攻撃した後、EPを3回復する。この効果はターンが回ってくるたびに2回まで発動できる。',
    descriptionTemplate: '装備キャラの速度+{0}%、弱点撃破状態の敵を攻撃した後、EPを{1}回復する。この効果はターンが回ってくるたびに2回まで発動できる。',
    descriptionValues: [
        ['8', '3.0'],
        ['9', '3.5'],
        ['10', '4.0'],
        ['11', '4.5'],
        ['12', '5.0']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 952,
        atk: 423,
        def: 396,
    },

    passiveEffects: [
        {
            id: 'montage-spd',
            name: 'アカデミズム編集（速度）',
            category: 'BUFF',
            targetStat: 'spd_pct', // Text says +8% so percentage
            effectValue: [0.08, 0.09, 0.10, 0.11, 0.12]
        }
    ],

    eventHandlers: [
        {
            id: 'montage-ep',
            name: 'アカデミズム編集（EP回復）',
            events: ['ON_ATTACK'],
            maxActivations: 2, // 2 times per turn
            cooldownResetType: CooldownResetType.WEARER_TURN,
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                if (!('targetId' in event)) return state;
                const targetId = event.targetId;
                if (!targetId) return state;

                const target = state.registry.get(createUnitId(targetId));
                // Check if target is Broken.
                // Weakness Break usually sets toughness to 0 and adds a debuff.
                // Safest check: toughness === 0.
                if (!target || target.toughness > 0) return state;

                const ep = [3.0, 3.5, 4.0, 4.5, 5.0][superimposition - 1];

                return addEnergyToUnit(state, unit.id, ep);
            }
        }
    ]
};
