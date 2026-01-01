import { CHARACTER_ID_MAP, RELIC_SET_ID_MAP, ORNAMENT_SET_ID_MAP } from './assetMappings';

/**
 * StarRailStaticAPI のベースURL
 */
const BASE_URL = 'https://vizualabstract.github.io/StarRailStaticAPI/assets';

/**
 * アイコンのフルURLを取得する
 * @param iconPath アイコンの相対パス (例: 'icon/character/1001.png')
 * @returns フルURL
 */
export const getAssetUrl = (iconPath?: string): string | undefined => {
    if (!iconPath) return undefined;
    // すでにフルURLの場合はそのまま返す
    if (iconPath.startsWith('http')) return iconPath;
    return `${BASE_URL}/${iconPath}`;
};

/**
 * キャラクターのアイコンパスを生成する
 * @param tag キャラクターの内部タグ
 * @returns アイコンパス
 */
export const getCharacterIconPath = (tag: string): string | undefined => {
    const id = CHARACTER_ID_MAP[tag];
    return id ? `icon/character/${id}.png` : undefined;
};

/**
 * 光円錐のアイコンパスを生成する
 * @param id 光円錐のID（数値または数値文字列）
 * @returns アイコンパス
 */
export const getLightConeIconPath = (id: string | number): string => {
    return `icon/light_cone/${id}.png`;
};

/**
 * 遺物セットのアイコンパスを生成する
 * @param setId 遺物セットの内部ID
 * @returns アイコンパス
 */
export const getRelicSetIconPath = (setId: string): string | undefined => {
    const id = RELIC_SET_ID_MAP[setId] || ORNAMENT_SET_ID_MAP[setId];
    return id ? `icon/relic/${id}.png` : undefined;
};

// マップ自体の再エクスポートも念のため残す（コンポーネントで参照されている可能性があるため）
export { CHARACTER_ID_MAP, RELIC_SET_ID_MAP, ORNAMENT_SET_ID_MAP };
