import { ILightConeData } from '@/app/types';
import { applyHealing } from '@/app/simulator/engine/utils';

export const nowhereToRun: ILightConeData = {
    id: 'nowhere-to-run',
    name: '逃げ場なし',
    description: '装備キャラの攻撃力+24%。装備キャラが敵を倒した時、自身の攻撃力12%分のHPを回復する。',
    descriptionTemplate: '装備キャラの攻撃力+{0}%。装備キャラが敵を倒した時、自身の攻撃力{1}%分のHPを回復する。',
    descriptionValues: [
        ['24', '12'],
        ['30', '15'],
        ['36', '18'],
        ['42', '21'],
        ['48', '24']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 952,
        atk: 529,
        def: 264,
    },
    passiveEffects: [
        {
            id: 'nowhere-to-run-atk',
            name: '逃げ場なし（攻撃力）',
            category: 'BUFF',
            targetStat: 'atk_pct',
            effectValue: [0.24, 0.30, 0.36, 0.42, 0.48]
        }
    ],
    eventHandlers: [
        {
            id: 'nowhere-to-run-heal',
            name: '逃げ場なし（回復）',
            events: ['ON_ENEMY_DEFEATED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const healMult = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                return applyHealing(
                    state,
                    unit.id,
                    unit.id,
                    {
                        scaling: 'atk',
                        multiplier: healMult
                    },
                    '逃げ場なし: 敵撃破時回復',
                    true
                );
            }
        }
    ]
};
