import { ILightConeData } from '@/app/types';

export const beforeTheFirstQuest: ILightConeData = {
  id: 'before-the-first-quest',
  name: '初めてのクエストの前に',
  path: 'Nihility',
  baseStats: {
    hp: 952,
    atk: 476,
    def: 330,
  },
  effects: [
    {
      id: 'nice_catch', // 新しいID
      name: 'ナイスキャッチ',
      category: 'BUFF',
      sourceUnitId: '', // Static definition, will be set upon application
      durationType: 'PERMANENT',
      duration: -1,
      // ここではStat Builderが利用できるように、簡易的なStatKeyと値だけを持つ
      effectValue: [0.2, 0.25, 0.3, 0.35, 0.4], // effect_hit_rateの値
      targetStat: 'effect_hit_rate', // 影響するStatKey

      // IEffectインターフェースのapplyメソッドをダミー実装
      apply: (unit, gameState) => {
        // ロジックはStat Builderで処理されるため、ここでは何もしない
        return gameState;
      },
      remove: (unit, gameState) => {
        return gameState;
      }
    },
    {
      id: 'nice_catch_ep',
      name: 'ナイスキャッチ (EP回復)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      // description: '装備キャラが、防御ダウンされた敵に攻撃を行った後、EPを4回復する。', // description削除

      apply: (unit, gameState) => {
        // TODO: Implement EP recovery logic on attack
        return gameState;
      },
      remove: (unit, gameState) => {
        return gameState;
      }
    }
  ],
};
