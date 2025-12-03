import { OrnamentSet } from '../../types';

export const FORGE_OF_THE_KALPAGNI_LANTERN: OrnamentSet = {
  id: 'forge_of_the_kalpagni_lantern',
  name: '劫火と蓮灯の鋳煉宮',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの速度+6%。装備キャラの攻撃が炎属性弱点を持つ敵に命中する時、撃破特効+40%、1ターン継続。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'spd_pct',
          value: 0.06,
          target: 'self'
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_DAMAGE_DEALT'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state;
            if (!event.targetId) return state;

            const target = state.units.find(u => u.id === event.targetId);
            if (!target) return state;

            // Check Fire Weakness
            if (target.weaknesses.has('Fire')) {
              // Apply Buff
              const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
              if (unitIndex === -1) return state;

              const unit = state.units[unitIndex];
              const buffId = 'forge-be-buff';
              const buff = {
                id: buffId,
                name: 'Forge BE Buff',
                category: 'BUFF',
                sourceUnitId: sourceUnitId,
                durationType: 'TURN_BASED',
                duration: 1,
                stat: 'break_effect',
                value: 0.4,
                isPercentage: true,
                apply: (u: any, s: any) => s,
                remove: (u: any, s: any) => s
              };

              const newEffects = [
                ...unit.effects.filter(e => e.id !== buffId),
                buff
              ];

              return {
                ...state,
                units: state.units.map((u, i) => i === unitIndex ? { ...u, effects: newEffects as any[] } : u)
              };
            }

            return state;
          }
        }
      ],
    },
  ],
};
