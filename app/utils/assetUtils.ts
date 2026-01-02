import { CHARACTER_ID_MAP, RELIC_SET_ID_MAP, ORNAMENT_SET_ID_MAP, LIGHTCONE_ID_MAP } from './assetMappings';

/**
 * StarRailStaticAPI のベースURL
 */
const BASE_URL = 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master';

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
 * @param tagOrId 光円錐の内部タグまたは数値ID
 * @returns アイコンパス
 */
export const getLightConeIconPath = (tagOrId: string | number): string | undefined => {
    const id = LIGHTCONE_ID_MAP[String(tagOrId)] || (typeof tagOrId === 'number' || !isNaN(Number(tagOrId)) ? String(tagOrId) : undefined);
    return id ? `icon/light_cone/${id}.png` : undefined;
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

/**
 * 運命の日本語名マッピング
 */
export const PATH_NAME_MAP: Record<string, string> = {
    'The Hunt': '巡狩',
    'Erudition': '知恵',
    'Destruction': '壊滅',
    'Harmony': '調和',
    'Nihility': '虚無',
    'Preservation': '存護',
    'Abundance': '豊穣',
    'Remembrance': '記憶',
};

/**
 * 属性の日本語名マッピング
 */
export const ELEMENT_NAME_MAP: Record<string, string> = {
    'Physical': '物理',
    'Fire': '炎',
    'Ice': '氷',
    'Lightning': '雷',
    'Wind': '風',
    'Quantum': '量子',
    'Imaginary': '虚数',
};

export { CHARACTER_ID_MAP, RELIC_SET_ID_MAP, ORNAMENT_SET_ID_MAP, LIGHTCONE_ID_MAP };
