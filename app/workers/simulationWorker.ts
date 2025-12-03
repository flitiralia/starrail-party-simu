import { runSimulation } from '../simulator/engine/simulation';
import type { SimulationWorkerMessage } from '../types/worker';
import { SimulationConfig } from '../simulator/engine/types';

// Web Workerの実行ロジック
self.onmessage = (event: MessageEvent<SimulationWorkerMessage>) => {
  const data = event.data;

  if (data.type === 'START_SIMULATION') {
    const weaknessesSet = new Set(data.weaknesses);
    const config: SimulationConfig = {
      characters: data.characters,
      enemies: data.enemies,
      weaknesses: weaknessesSet,
      characterConfig: data.characterConfig,
      partyConfig: data.partyConfig, // パーティ設定を追加
      enemyConfig: data.enemyConfig,
      rounds: data.rounds,
    };
    const finalState = runSimulation(config);

    // eventHandlerLogics contains functions which cannot be cloned.
    // Also, units contain effects which contain functions (apply/remove).
    // We create a sanitized copy of the state to send back.
    const sanitizedUnits = finalState.units.map(unit => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { effects, ...rest } = unit;
      return { ...rest, effects: [] };
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { eventHandlerLogics, units, ...restState } = finalState;
    const sanitizedState = { ...restState, units: sanitizedUnits };

    self.postMessage({ type: 'SIMULATION_COMPLETE', gameState: sanitizedState as any });
  }
};

// Make this file a module
export { };
// Force rebuild
