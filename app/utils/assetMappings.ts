/**
 * キャラクター、光円錐、遺物のIDマッピング（内部タグ -> API ID）
 */

/**
 * キャラクターIDのマップ
 * キー: 内部ID (tag), 値: StarRailStaticAPI の ID
 */
export const CHARACTER_ID_MAP: Record<string, string> = {
    'march-7th': '1001',
    'mar7th': '1001', // 別名対応
    'march7th': '1001', // 別名対応
    'archar': '1308', // アーチャー (カスタム - Acheronをベースに仮割り当て)
    'himeko': '1003',
    'welt': '1004',
    'kafka': '1005',
    'silver-wolf': '1006',
    'arlan': '1008',
    'asta': '1009',
    'herta': '1010',
    'bronya': '1011',
    'seele': '1012',
    'serval': '1013',
    'gepard': '1104',
    'clara': '1102',
    'sampo': '1108',
    'hook': '1109',
    'pela': '1106',
    'natasha': '1105',
    'jing-yuan': '1204',
    'yanqing': '1209',
    'bailu': '1211',
    'tingyun': '1202',
    'sushang': '1206',
    'qingque': '1201',
    'luocha': '1203',
    'blade': '1205',
    'yukong': '1207',
    'fu-xuan': '1208',
    'dan-heng-il': '1213',
    'lynx': '1110',
    'jingliu': '1212',
    'topaz-and-numby': '1112',
    'guinaifen': '1210',
    'huohuo': '1217',
    'argenti': '1101',
    'hanya': '1215',
    'ruan-mei': '1303',
    'xueyi': '1214',
    'dr-ratio': '1305',
    'misha': '1312',
    'black-swan': '1307',
    'sparkle': '1306',
    'acheron': '1308',
    'gallagher': '1301',
    'aventurine': '1304',
    'robin': '1309',
    'boothill': '1315',
    'firefly': '1310',
    'jade': '1314',
    'yunli': '1221',
    'jiaoqiu': '1218',
    'march7th-hunt': '1224',
    'feixiao': '1220',
    'lingsha': '1222',
    'moze': '1223',
    'rappa': '1317',
    'trailblazer-destruction-m': '8001',
    'trailblazer-destruction-f': '8002',
    'trailblazer-preservation-m': '8003',
    'trailblazer-preservation-f': '8004',
    'trailblazer-harmony-m': '8005',
    'trailblazer-harmony-f': '8006',
    'trailblazer-destruction': '8001', // 一致用
    'trailblazer-preservation': '8003',
    'trailblazer-harmony': '8005',
    'trailblazer-remembrance': '1401', // 推測値
};

/**
 * 遺物セットIDのマップ
 * キー: 内部ID, 値: StarRailStaticAPI の ID
 */
export const RELIC_SET_ID_MAP: Record<string, string> = {
    'passerby-of-wandering-cloud': '101',
    'musketeer-of-wild-wheat': '102',
    'knight-of-purity-palace': '103',
    'hunter-of-glacial-forest': '104',
    'champion-of-streetwise-boxing': '105',
    'guard-of-wuthering-snow': '106',
    'firesmith-of-lava-forging': '107',
    'genius-of-brilliant-stars': '108',
    'band-of-sizzling-thunder': '109',
    'eagle-of-twilight-line': '110',
    'thief-of-shooting-meteor': '111',
    'wastelander-of-banditry-desert': '112',
    'longevous-disciple': '113',
    'messenger-traversing-hackerspace': '114',
    'the-ashblazing-grand-duke': '115',
    'prisoner-in-deep-confinement': '116',
    'pioneer-diver-of-dead-waters': '117',
    'watchmaker-master-of-dream-machinations': '118',
    'iron-cavalry-against-scourge': '119',
    'the-wind-soaring-valorous': '120',
    'scholar-lost-in-erudition': '121', // 推測値
    'hero-of-triumphant-song': '122',   // 推測値
    'poet-of-mourning-collapse': '123', // 推測値
    'sacerdos-relived-ordeal': '124',   // 推測値
};

/**
 * オーナメントセットIDのマップ
 * キー: 内部ID, 値: StarRailStaticAPI の ID
 */
export const ORNAMENT_SET_ID_MAP: Record<string, string> = {
    'space-sealing-station': '301',
    'fleet-of-the-ageless': '302',
    'pan-cosmic-commercial-enterprise': '303',
    'belobog-of-the-architects': '304',
    'celestial-differentiator': '305',
    'inert-salsotto': '306',
    'talia-kingdom-of-banditry': '307',
    'sprightly-vonwacq': '308',
    'rutilant-arena': '309',
    'broken-keel': '310',
    'firmament-frontline-glamoth': '311',
    'penacony-land-of-the-dreams': '312',
    'sigonia-the-unclaimed-desolation': '313',
    'izumo-gensei-and-takama-divine-realm': '314',
    'duran-dynasty-of-running-wolves': '315',
    'forge-of-the-kalpagni-lantern': '316',
    'lushaka-the-sunken-seas': '317',
    'the-wondrous-bananamusement-park': '318',
};
