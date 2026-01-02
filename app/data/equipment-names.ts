/**
 * 装備（遺物・オーナメント）のID→日本語名マッピング
 * ログ表示などで使用
 */

export const EQUIPMENT_NAMES: Record<string, string> = {
    // === 遺物 (Relics) ===
    'band_of_sizzling_thunder': '雷鳴轟くバンド',
    'captain_who_crosses_the_rough_seas': '荒海を越える船長',
    'champion_of_streetwise_boxing': '成り上がりチャンピオン',
    'eagle_of_twilight_line': '昼夜の狭間を翔ける鷹',
    'firesmith_of_lava_forging': '溶岩で鍛造する火匠',
    'genius_of_brilliant_stars': '星の如く輝く天才',
    'guard_of_wuthering_snow': '吹雪と対峙する兵士',
    'hermit_who_hid_the_light_of_the_stars': '星の光を隠した隠者',
    'hero_who_raises_the_battle_song': '凱歌を揚げる英雄',
    'hero-of-triumphant-song': '凱歌を揚げる英雄', // 定義ID対応
    'hero_of_triumphant_song': '凱歌を揚げる英雄', // アンダースコア区切りバリエーション対応
    'hunter_of_glacial_forest': '雪の密林の狩人',
    'iron_cavalry_against_scourge': '蝗害を一掃せし鉄騎',
    'knight_of_purity_palace': '純庭教会の聖騎士',
    'longevous_disciple': '宝命長存の蒔者',
    'messenger_traversing_hackerspace': '仮想空間を漫遊するメッセンジャー',
    'musketeer_of_wild_wheat': '草の穂ガンマン',
    'ninja_record_sound_hunt': '忍事録・音律狩猟',
    'passerby_of_wandering_cloud': '流雲無痕の過客',
    'pioneer_diver_of_dead_waters': '死水に潜る先駆者',
    'poet_who_sings_of_the_sorrow_of_the_fallen_kingdom': '亡国の悲哀を詠う詩人',
    'priest_who_walks_the_path_of_suffering': '再び苦難の道を歩む司祭',
    'prisoner_in_deep_confinement': '深い牢獄の囚人',
    'savior_who_recreates_heaven_and_earth': '天地再創の救世主',
    'scholar_drowning_in_the_sea_of_knowledge': '知識の海に溺れる学者',
    'the_ashblazing_grand_duke': '灰燼を燃やし尽くす大公',
    'thief_of_shooting_meteor': '流星の跡を追う怪盗',
    'valorous_of_crashing_winds': '風雲を薙ぎ払う勇烈',
    'warlord_of_blazing_sun_and_thunderous_roar': '烈陽と雷鳴の武神',
    'wastelander_of_banditry_desert': '荒地で盗みを働く廃土客',
    'watchmaker_master_of_dream_machinations': '夢を弄ぶ時計屋',

    // === オーナメント (Ornaments) ===
    'belobog_of_the_architects': '建創者のベロブルグ',
    'broken_keel': '折れた竜骨',
    'celestial_differentiator': '天体階差機関',
    'duran_dynasty_of_running_wolves': '奔狼の都藍王朝',
    'arcadia_of_woven_dreams': '夢を紡ぐ妖精の楽園', // 定義ID対応 (arcadia-of-woven-dreams)
    'arcadia-of-woven-dreams': '夢を紡ぐ妖精の楽園', // 定義ID対応
    'fairy_tale_theater_of_night': '夢を紡ぐ妖精の楽園', // 旧ID対応（念のため）
    'firmament_frontline_glamoth': '蒼穹戦線グラモス',
    'fleet_of_the_ageless': '老いぬ者の仙舟',
    'forge_of_the_kalpagni_lantern': '劫火と蓮灯の鋳煉宮',
    'giant_tree_immersed_in_deep_thought': '深慮に浸る巨樹',
    'heaven_at_streaming_room': '天国@配信ルーム',
    'inert_salsotto': '自転が止まったサルソット',
    'izumo_gensei_and_takama_divine_realm': '荒涼の惑星ツガンニヤ',
    'lusaka_by_the_sunken_sea': '海に沈んだルサカ',
    'omphalos_eternal_grounds': '永遠の地オンパロス',
    'pan_cosmic_commercial_enterprise': '汎銀河商事会社',
    'penacony_land_of_dreams': '夢の地ピノコニー',
    'the-wondrous-bananamusement-park': '奇想天外のバナダイス', // 定義ID対応
    'the_wondrous_bananamusement_park': '奇想天外のバナダイス', // アンダースコア区切りバリエーション対応
    'rutilant_arena': '星々の競技場',
    'amphoreus_the_eternal_land': '永遠の地オンパロス', // 定義ID対応
    'amphoreus-the-eternal-land': '永遠の地オンパロス', // 定義ID対応
    'sea_of_intoxication': '酩酊の海域',
    'silent_ossuary': '静謐な拾骨地',
    'space_sealing_station': '宇宙封印ステーション',
    'sprightly_vonwacq': '生命のウェンワーク',
    'talia_kingdom_of_banditry': '盗賊公国タリア',
    'tengoku_livestream': '天国@配信ルーム', // 推定
    'tengoku-livestream': '天国@配信ルーム', // 推定
    'bone_collections_serene_demesne': '骸の収集と安らぎの領地', // 推定
    'bone-collections-serene-demesne': '骸の収集と安らぎの領地', // 推定(bone-collections-serene-demesne.ts)
    'unforeseen_vanadise': '奇想天外のバナダイス',
    'warrior_goddess_of_sun_and_thunder': '烈陽と雷鳴の武神',
    'warrior-goddess-of-sun-and-thunder': '烈陽と雷鳴の武神', // 定義ID対応
    'sacerdos_relived_ordeal': '再び苦難の道を歩む司祭',
    'sacerdos-relived-ordeal': '再び苦難の道を歩む司祭', // 定義ID対応
    'scholar_lost_in_erudition': '知識の海に溺れる学者',
    'scholar-lost-in-erudition': '知識の海に溺れる学者', // 定義ID対応
    'revelry-by-the-sea': '酩酊の海域', // 推定
};

/**
 * 装備IDから日本語名を取得
 * @param id 装備ID（例: 'poet_who_sings_of_the_sorrow_of_the_fallen_kingdom'）
 * @returns 日本語名（見つからない場合はIDをそのまま返す）
 */
export function getEquipmentNameById(id: string): string {
    return EQUIPMENT_NAMES[id] || id;
}
