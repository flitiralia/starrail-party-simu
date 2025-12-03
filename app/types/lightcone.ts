import { Path, IEffect, StatKey, FinalStats } from './index';
import { Unit, GameState } from '../simulator/engine/types'; // Unit, GameStateをengine/typesからインポート

/**
 * 光円錐の基礎ステータス（レベル80）
 */
export interface LightConeBaseStats {
  hp: number;
  atk: number;
  def: number;
}

/**
 * 重畳ランク1から5に対応する値のタプル
 * 例: [0.08, 0.10, 0.12, 0.14, 0.16]
 */
export type SuperimpositionValue = [number, number, number, number, number];

/**
 * 光円錐が持つ効果のデータ構造
 * name: 効果名
 * description: ゲーム内テキスト
 * properties: 計算に使用する具体的な数値。キーで効果を識別し、値に重畳ランクごとの数値を格納する。
 */
export interface ILightConeEffect extends IEffect { // IEffectを継承し、LightConeEffectをILightConeEffectにリネーム
  effectValue?: SuperimpositionValue; // 効果量（例：ダメージ増加率など）を重畳ランクごとに持つ
  targetStat?: StatKey; // どのStatKeyに影響するか
  condition?: (stats: FinalStats) => boolean; // 条件付き効果のための判定関数
  customHandler?: boolean; // カスタムハンドラを使用するかどうか
  // apply/removeメソッドはIEffectから継承される
}

/**
 * 光円錐全体のデータ構造
 */
export interface ILightConeData { // LightConeをILightConeDataにリネーム
  id: string;
  name: string;
  path: Path;
  baseStats: LightConeBaseStats;
  effects: ILightConeEffect[]; // LightConeEffectをILightConeEffectに
}
