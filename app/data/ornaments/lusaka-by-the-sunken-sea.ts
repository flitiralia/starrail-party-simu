import { OrnamentSet } from '../../types';

export const LUSAKA_BY_THE_SUNKEN_SEA: OrnamentSet = {
  id: 'lusaka_by_the_sunken_sea',
  name: '海に沈んだルサカ',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラのEP回復効率+5%。装備キャラがパーティの1枠目のキャラでない場合、1枠目のキャラの攻撃力+12%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'energy_regen_rate',
          value: 0.05,
          target: 'self'
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_BATTLE_START'],
          handler: (event, state, sourceUnitId) => {
            // Check position
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1 || unitIndex === 0) return state; // If not found or is first char

            // Apply buff to unit 0
            const target = state.units[0];
            const buffId = 'lusaka-atk-buff';
            const buff = {
              id: buffId,
              name: 'Lusaka ATK Buff',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'PERMANENT',
              duration: -1,
              stat: 'atk_pct',
              value: 0.12,
              isPercentage: true,
              apply: (u: any, s: any) => s,
              remove: (u: any, s: any) => s
            };

            const newEffects = [
              ...target.effects.filter(e => e.id !== buffId),
              buff
            ];

            return {
              ...state,
              units: state.units.map((u, i) => i === 0 ? { ...u, effects: newEffects as any[] } : u)
            };
          }
        }
      ],
    },
  ],
};
