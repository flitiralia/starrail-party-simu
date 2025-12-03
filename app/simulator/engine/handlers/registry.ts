import { IEventHandlerFactory } from '../types';
import { createPlanetaryRendezvousFactory } from './planetary-rendezvous';
import { createGeniusOfBrilliantStarsFactory } from './genius-of-brilliant-stars';
import { createMemoriesOfThePastFactory } from './memories-of-the-past';

/**
 * 光円錐IDと対応するハンドラファクトリをマッピングするレジストリ。
 * LightConeIdは、app/data/light-cones/... で定義されているIDと一致します。
 */
export const LightConeRegistry: Record<string, IEventHandlerFactory> = {
    // 例: Planetary Rendezvous
    'planetary-rendezvous': createPlanetaryRendezvousFactory,
    // 記憶の内の姿
    'memories-of-the-past': createMemoriesOfThePastFactory,
    // 他の光円錐ハンドラはここに追加される
};

/**
 * 遺物セットIDと対応するハンドラファクトリをマッピングするレジストリ。
 * RelicSetIdは、app/data/relics/... で定義されているIDと一致します。
 */
export const RelicRegistry: Record<string, IEventHandlerFactory> = {
    // 例: Genius of Brilliant Stars
    'genius_of_brilliant_stars': createGeniusOfBrilliantStarsFactory,
    // 他の遺物セットハンドラはここに追加される
};
