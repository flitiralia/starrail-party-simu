import { CharacterBaseStats, IAbility, Element, IUnitData } from './index'; // IAbilityとIUnitDataをインポート

/**
 * Defines the basic structure for an enemy unit.
 */
export interface Enemy extends IUnitData { // IUnitData を継承
  toughness: number;
  baseRes: Partial<Record<Element, number>>;

  // CharacterBaseStats は IUnitData に含まれる
  // Enemy abilities or skills (IUnitData に含まれるので削除)
}
