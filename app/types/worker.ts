
import { Character, Enemy, Element, PartyConfig } from './index';
import { CharacterConfig, EnemyConfig } from '../simulator/engine/types';

// Web Workerに渡されるメッセージの型定義
export interface SimulationWorkerMessage {
  type: 'START_SIMULATION';
  characters: Character[];
  enemies: Enemy[];
  weaknesses: Element[]; // Arrayに変更
  enemyConfig: EnemyConfig;
  characterConfig?: CharacterConfig; // 後方互換性のため残す
  partyConfig?: PartyConfig; // 新しいパーティ設定
  rounds: number;
}


// Web Workerからメインスレッドに送り返される結果の型定義
export interface SimulationWorkerResult {
  type: 'SIMULATION_COMPLETE';
  gameState: any; // GameState型を直接共有すると循環参照の問題があるため、一旦any
}
