import { CharacterDefaultConfig } from '../types';

/**
 * グローバルデフォルト設定
 * キャラクターに defaultConfig が定義されていない場合に使用
 */
export const GLOBAL_DEFAULT_CONFIG: CharacterDefaultConfig = {
    eidolonLevel: 0,
    superimposition: 1,
    rotation: ['s', 'b', 'b'],
    rotationMode: 'sequence',
    ultStrategy: 'immediate',
    ultCooldown: 0,
};

/**
 * キャラクターのデフォルト設定を取得
 * キャラクター固有の設定が優先され、ないフィールドはグローバル設定で補完
 * @param characterDefaultConfig - キャラクター固有のデフォルト設定（オプション）
 * @returns マージされたデフォルト設定
 */
export function getCharacterDefaultConfig(
    characterDefaultConfig?: CharacterDefaultConfig
): CharacterDefaultConfig {
    return {
        ...GLOBAL_DEFAULT_CONFIG,
        ...characterDefaultConfig,
    };
}
