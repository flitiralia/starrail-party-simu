import { Enemy, Element } from '../../types';

export const DUMMY_ENEMY: Enemy = {
  id: 'enemy_dummy_01',
  name: 'テスト用ダミー',
  element: 'Physical',
  toughness: 180,
  baseRes: {
    Physical: 0.2,
    Fire: 0.2,
    Ice: 0.2,
    Lightning: 0.2,
    Wind: 0.2,
    Quantum: 0.2,
    Imaginary: 0.2,
  },
  baseStats: {
    hp: 10000,
    atk: 500,
    def: 500,
    spd: 100,
    critRate: 0.05,
    critDmg: 0.5,
    aggro: 100,
  },
  abilities: {
    basic: {
      id: 'dummy_basic',
      name: '敵の通常攻撃',
      type: 'Basic ATK',
      description: '敵の基本的な攻撃。',
      damage: { type: 'simple', hits: [{ multiplier: 0.5, toughnessReduction: 10 }], scaling: 'atk' },
      targetType: 'single_enemy',
    },
    skill: {
      id: 'dummy_skill',
      name: '敵のスキル',
      type: 'Skill',
      description: '敵のスキル攻撃。',
      damage: { type: 'simple', hits: [{ multiplier: 1.0, toughnessReduction: 20 }], scaling: 'atk' },
      targetType: 'single_enemy',
    },
    ultimate: {
      id: 'dummy_ultimate',
      name: '敵の必殺技',
      type: 'Ultimate',
      description: '敵の必殺技。',
      damage: { type: 'aoe', hits: [{ multiplier: 1.5, toughnessReduction: 20 }], scaling: 'atk' },
      targetType: 'all_enemies',
    },
    talent: {
      id: 'dummy_talent',
      name: '敵の天賦',
      type: 'Talent',
      description: '敵の天賦効果。',
    },
    technique: {
      id: 'dummy_technique',
      name: '敵の秘技',
      type: 'Technique',
      description: '敵の秘技効果。',
    },
  },
};

export function createEnemy(id: string, level: number, weakness: Element): Enemy {
  return {
    ...DUMMY_ENEMY,
    id,
    // level: level, // Enemy型にlevelがない場合は削除、ある場合は追加
    element: weakness,
  };
}
