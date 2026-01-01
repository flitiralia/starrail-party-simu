import { GameState, IEvent, IEventHandler, Unit, IEventHandlerLogic, IEventHandlerFactory } from '../types';
import { createStatEffect } from '../../effect/statEffects';
import { Element, StatKey } from '../../../types';
import { createUnitId } from '../unitId';

const elementToDmgBoostMap: Record<Element, StatKey> = {
  Physical: 'physical_dmg_boost',
  Fire: 'fire_dmg_boost',
  Ice: 'ice_dmg_boost',
  Lightning: 'lightning_dmg_boost',
  Wind: 'wind_dmg_boost',
  Quantum: 'quantum_dmg_boost',
  Imaginary: 'imaginary_dmg_boost',
};

/**
 * Creates an event handler for the "Planetary Rendezvous" Light Cone.
 * @param sourceUnit - The unit equipping this light cone.
 * @param superimposition - The superimposition level (1-5).
 * @returns An IEventHandler object.
 */
/**
 * "Planetary Rendezvous" 光円錐のイベントハンドラロジックを処理する関数。
 * この関数は dispatcher から呼び出される。
 * @param event 発生したイベント
 * @param state 現在のGameState
 * @param handlerId イベントハンドラのID (どの光円錐のどの重畳かを示す)
 * @returns 更新されたGameState
 */
export const handlePlanetaryRendezvousLogic: IEventHandlerLogic = (event, state, handlerId) => {
  if (event.type !== 'ON_BATTLE_START') {
    return state;
  }

  // handlerIdから光円錐の重畳ランクと装備者IDを解析する
  const parts = handlerId.split('-'); // e.g., planetary-rendezvous-s5-charId
  const superimposition = parseInt(parts[2].replace('s', '')) as 1 | 2 | 3 | 4 | 5;
  const sourceUnitId = parts[3];

  const sourceUnit = state.registry.get(createUnitId(sourceUnitId));
  if (!sourceUnit) {
    console.warn(`Planetary Rendezvous: Source unit ${sourceUnitId} not found.`);
    return state;
  }

  const dmgBoostValues = [0.12, 0.15, 0.18, 0.21, 0.24];
  const dmgBoost = dmgBoostValues[superimposition - 1];

  let newState = state;
  const targetElement = sourceUnit.element;
  const dmgBoostStatKey = elementToDmgBoostMap[targetElement];

  // Find all allies with the same element and apply the buff
  for (const unit of newState.registry.toArray()) {
    if (!unit.isEnemy && unit.element === targetElement) {
      const buffEffect = createStatEffect({
        id: `planetary-rendezvous-buff-${unit.id}-${sourceUnit.id}-${superimposition}`,
        name: '惑星との出会いダメージアップ',
        sourceUnitId: sourceUnit.id,
        stat: dmgBoostStatKey,
        value: dmgBoost,
        isPercentage: true, // DMG Boosts are additive percentages
        duration: Infinity, // The buff is permanent
      });

      newState = buffEffect.apply(unit, newState);
    }
  }

  return newState;
};

/**
 * "Planetary Rendezvous" 光円錐のイベントハンドラファクトリを作成します。
 * @param sourceUnitId 光円錐を装備しているユニットのID
 * @param level 装備レベル (使用しないが型に合わせる)
 * @param superimposition 重畳ランク
 * @returns handlerMetadata と handlerLogic を含むオブジェクト
 */
export const createPlanetaryRendezvousFactory: IEventHandlerFactory = (sourceUnitId, level, superimposition) => {
  if (!superimposition) {
    throw new Error("Superimposition required for Light Cone factory.");
  }
  const handlerMetadata: IEventHandler = {
    id: `planetary-rendezvous-s${superimposition}-${sourceUnitId}`,
    subscribesTo: ['ON_BATTLE_START'],
  };

  return {
    handlerMetadata,
    handlerLogic: handlePlanetaryRendezvousLogic,
  };
};
