import { RelicSet } from '../../types';

export const POET_WHO_SINGS_OF_THE_SORROW_OF_THE_FALLEN_KINGDOM: RelicSet = {
  id: 'poet_who_sings_of_the_sorrow_of_the_fallen_kingdom',
  name: '亡国の悲哀を詠う詩人',
  setBonuses: [
    {
      pieces: 2,
      description: '量子属性ダメージ+10%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'quantum_dmg_boost',
          value: 0.1,
          target: 'self'
        }
      ],
    },
    {
      pieces: 4,
      description: '装備キャラの速度-8%。戦闘に入る前、装備キャラの速度が110/95を下回る時、装備キャラの会心率+20%/32％。この効果は装備キャラの記憶の精霊にも有効。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'spd_pct',
          value: -0.08,
          target: 'self'
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'crit_rate',
          value: 0.20,
          target: 'self',
          condition: (stats) => stats.spd < 110 && stats.spd >= 95
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'crit_rate',
          value: 0.32,
          target: 'self',
          condition: (stats) => stats.spd < 95
        }
      ],
    },
  ],
};
