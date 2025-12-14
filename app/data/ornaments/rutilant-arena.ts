import { OrnamentSet } from '../../types';

export const RUTILANT_ARENA: OrnamentSet = {
  id: 'rutilant_arena',
  name: '星々の競技場',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの会心率+8%。装備キャラの会心率が70%以上の時、通常攻撃と戦闘スキルの与ダメージ+20%。',
      passiveEffects: [
        {
          stat: 'crit_rate',
          value: 0.08,
          target: 'self'
        },
        {
          stat: 'basic_atk_dmg_boost',
          value: 0.20,
          target: 'self',
          condition: (stats) => stats.crit_rate >= 0.7,
          evaluationTiming: 'dynamic'
        },
        {
          stat: 'skill_dmg_boost',
          value: 0.20,
          target: 'self',
          condition: (stats) => stats.crit_rate >= 0.7,
          evaluationTiming: 'dynamic'
        }
      ],
    },
  ],
};
