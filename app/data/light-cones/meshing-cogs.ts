import { ILightConeData, CooldownResetType } from '@/app/types';
import { addEnergyToUnit } from '@/app/simulator/engine/energy';
import { publishEvent } from '@/app/simulator/engine/dispatcher';

export const meshingCogs: ILightConeData = {
  id: 'meshing-cogs',
  name: '輪契',
  description: '装備キャラが攻撃または命中を受けた後、EPを4回復する。この効果は1ターンに1回まで発動できる。',
  descriptionTemplate: '装備キャラが攻撃または命中を受けた後、EPを{0}回復する。この効果は1ターンに1回まで発動できる。',
  descriptionValues: [['4'], ['5'], ['6'], ['7'], ['8']],
  path: 'Harmony',
  baseStats: {
    hp: 846,
    atk: 317,
    def: 264,
  },

  /*
  passiveEffects: [
    {
      id: 'energy_regen_rate_boost',
      name: '速決（EP回復効率）',
      category: 'BUFF',
      targetStat: 'energy_regen_rate',
      effectValue: [0.08, 0.1, 0.12, 0.14, 0.16]
    }
  ],*/

  eventHandlers: [
    {
      id: 'ep_regen_on_attack_or_hit',
      name: '速決（EP回復）',
      events: ['ON_ATTACK', 'ON_BEFORE_HIT'], // 攻撃を行った後 or 命中を受けた時
      cooldownResetType: CooldownResetType.ANY_TURN, // 重要: 被弾でもトリガーするため、任意のターン開始でリセット
      cooldownTurns: 1,
      maxActivations: 1,
      handler: (event, state, unit, superimposition) => {
        // 攻撃者または被弾者かチェック
        const isAttacker = event.type === 'ON_ATTACK' && event.sourceId === unit.id;
        const isHit = event.type === 'ON_BEFORE_HIT' && event.targetId === unit.id;
        if (!isAttacker && !isHit) return state;

        // 重畳ランクに応じたEP回復量
        const epValue = [4, 5, 6, 7, 8][superimposition - 1];

        // EP回復
        const newState = addEnergyToUnit(state, unit.id, epValue, 0, false, {
          sourceId: unit.id,
          publishEventFn: publishEvent
        });

        // ログ
        return {
          ...newState,
          log: [...newState.log, {
            actionType: 'EP回復',
            sourceId: unit.id,
            characterName: unit.name,
            targetId: unit.id,
            details: `輪契発動: EP +${epValue}`
          }]
        };
      }
    }
  ]
};
