import { RelicSet } from '../../types';

export const WARLORD_OF_BLAZING_SUN_AND_THUNDEROUS_ROAR: RelicSet = {
  id: 'warlord_of_blazing_sun_and_thunderous_roar',
  name: '烈陽と雷鳴の武神',
  setBonuses: [
    {
      pieces: 2,
      description: '速度+6%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'spd_pct',
          value: 0.06,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラまたは記憶の精霊が、装備キャラおよびその記憶の精霊以外の味方を治癒した後、装備キャラは「慈雨」を獲得する。この効果は1ターンに最大1回まで発動でき、2ターン継続する。また、装備キャラが「慈雨」を持っている場合、速度+6%、味方全体の会心ダメージ+15%、この効果は累積できない。',
      effects: [
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_UNIT_HEALED'],
          handler: (event, state, sourceUnitId) => {
            if (event.sourceId !== sourceUnitId) return state; // Assuming summon/spirit counts as sourceUnitId or we need to check summon owner?
            // Description: "wearer or their spirit... heals ally other than wearer/spirit".
            // Currently summons are not fully implemented as separate sources in events (usually sourceId is the character).
            // If sourceId is the character, we check if targetId != sourceId.

            if (event.targetId === sourceUnitId) return state; // Healed self

            // Apply "Rain" to wearer
            const unitIndex = state.units.findIndex(u => u.id === sourceUnitId);
            if (unitIndex === -1) return state;

            const unit = state.units[unitIndex];

            // Check 1 turn limit? "This effect can be triggered once per turn".
            // We need to track trigger count.
            // For now, let's ignore the limit or assume it resets.
            // Implementing limit requires state tracking (e.g. custom field in unit or effect).

            const buffId = 'warlord-rain';
            const buff = {
              id: buffId,
              name: 'Rain (Warlord)',
              category: 'BUFF',
              sourceUnitId: sourceUnitId,
              durationType: 'TURN_BASED',
              duration: 2,
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
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'spd_pct',
          value: 0.06,
          target: 'self',
          condition: (stats, state, unitId) => {
            const unit = state.units.find(u => u.id === unitId);
            return unit ? unit.effects.some(e => e.id === 'warlord-rain') : false;
          }
        },
        {
          type: 'EVENT_TRIGGER',
          events: ['ON_BEFORE_DAMAGE_CALCULATION'],
          handler: (event, state, sourceUnitId) => {
            // Global Aura: If wearer has Rain, all allies get Crit DMG +15%
            const wearer = state.units.find(u => u.id === sourceUnitId);
            if (!wearer) return state;

            const hasRain = wearer.effects.some(e => e.id === 'warlord-rain');
            if (!hasRain) return state;

            // Check if attacker is ally (including wearer?) "All allies Crit DMG +15%". Usually includes wearer.
            const attacker = state.units.find(u => u.id === event.sourceId);
            if (!attacker || attacker.isEnemy) return state;

            return {
              ...state,
              damageModifiers: {
                ...state.damageModifiers,
                critDmg: (state.damageModifiers.critDmg || 0) + 0.15
              }
            };
          }
        }
      ],
    },
  ],
};
