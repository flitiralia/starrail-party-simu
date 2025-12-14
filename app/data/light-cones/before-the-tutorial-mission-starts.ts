import { ILightConeData } from '@/app/types';
import { addEnergy } from '@/app/simulator/engine/energy';

export const beforeTheFirstQuest: ILightConeData = {
  id: 'before-the-tutorial-mission-starts',
  name: '初めてのクエストの前に',
  description: '装備キャラの効果命中+20%。装備キャラが、防御ダウンされた敵に攻撃を行った後、EPを4回復する。',
  descriptionTemplate: '装備キャラの効果命中+{0}%。装備キャラが、防御ダウンされた敵に攻撃を行った後、EPを{1}回復する。',
  descriptionValues: [['20', '4'], ['25', '5'], ['30', '6'], ['35', '7'], ['40', '8']],
  path: 'Nihility',
  baseStats: {
    hp: 952,
    atk: 476,
    def: 330,
  },

  // パッシブ効果（常時発動）
  passiveEffects: [
    {
      id: 'nice_catch',
      name: 'ナイスキャッチ',
      category: 'BUFF',
      targetStat: 'effect_hit_rate',
      effectValue: [0.2, 0.25, 0.3, 0.35, 0.4]
    }
  ],

  // イベント駆動ハンドラー
  eventHandlers: [
    {
      id: 'nice_catch_ep',
      name: 'ナイスキャッチ EP回復',
      events: ['ON_DAMAGE_DEALT'],
      // cooldownResetTypeはデフォルト（wearer_turn）
      handler: (event, state, unit, superimposition) => {
        // イベントタイプチェック不要（eventsで既にフィルタ済み）
        if (event.sourceId !== unit.id) return state;
        if (!event.targetId) return state;

        // ターゲットが防御ダウン状態かチェック
        const target = state.units.find(u => u.id === event.targetId);
        if (!target) return state;

        // 防御ダウン（def_reduction）効果を持つかチェック
        const hasDefDown = target.effects.some(e =>
          e.modifiers?.some(m => m.target === 'def_pct' && m.value < 0) ||
          e.modifiers?.some(m => m.target === 'def_reduction' && m.value > 0)
        );
        if (!hasDefDown) return state;

        // 重畳ランクに応じたEP回復量
        const epValue = [4, 5, 6, 7, 8][superimposition - 1];

        // EP回復
        const unitIndex = state.units.findIndex(u => u.id === unit.id);
        if (unitIndex === -1) return state;

        const updatedUnit = addEnergy(state.units[unitIndex], epValue);
        const newUnits = [...state.units];
        newUnits[unitIndex] = updatedUnit;

        // ログ
        return {
          ...state,
          units: newUnits,
          log: [...state.log, {
            actionType: 'EP回復',
            sourceId: unit.id,
            characterName: unit.name,
            targetId: unit.id,
            details: `初めてのクエストの前に発動: EP +${epValue}`
          }]
        };
      }
    }
  ]
};


