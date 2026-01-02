/**
 * キャラクター、光円錐、遺物のIDマッピング（内部タグ -> API ID）
 */

/**
 * キャラクターIDのマップ
 * キー: 内部ID (tag), 値: StarRailStaticAPI の ID
 */
export const CHARACTER_ID_MAP: Record<string, string> = {
    'march-7th': '1001', // 三月なのか
    'mar7th': '1001', // 三月なのか
    'march7th': '1001', // 三月なのか
    'archar': '1015', // アーチャー
    'himeko': '1003', // 姫子
    'welt': '1004', // ヴェルト
    'kafka': '1005', // カフカ
    'silver-wolf': '1006', // 銀狼
    'arlan': '1008', // アーラン
    'asta': '1009', // アスター
    'herta': '1013', // ヘルタ
    'bronya': '1101', // ブローニャ
    'seele': '1102', // ゼーレ
    'serval': '1103', // セーバル
    'gepard': '1104', // ジェパード
    'natasha': '1105', // ナターシャ
    'pela': '1106', // ペラ
    'clara': '1107', // クラーラ
    'sampo': '1108', // サンポ
    'hook': '1109', // フック
    'lynx': '1110', // リンクス
    'luka': '1111', // ルカ
    'topaz-and-numby': '1112', // トパーズ＆カブ
    'topaz': '1112', // トパーズ
    'argenti': '1302', // アルジェンティ
    'yanqing': '1209', // 彦卿
    'bailu': '1211', // 白露
    'tingyun': '1202', // 停雲
    'sushang': '1206', // 素裳
    'qingque': '1201', // 青雀
    'luocha': '1203', // 羅刹
    'blade': '1205', // 刃
    'yukong': '1207', // 御空
    'fu-xuan': '1208', // 符玄
    'jing-yuan': '1204', // 景元
    'dan-heng-il': '1213', // 丹恒・飲月
    'jingliu': '1212', // 鏡流
    'guinaifen': '1210', // 桂乃芬
    'huohuo': '1217', // フォフォ
    'hanya': '1215', // 寒鴉
    'ruan-mei': '1303', // ルアン・メェイ
    'xueyi': '1214', // 雪衣
    'dr-ratio': '1305', // Dr.レイシオ
    'misha': '1312', // ミーシャ
    'black-swan': '1307', // ブラックスワン
    'sparkle': '1306', // 花火
    'acheron': '1308', // 黄泉
    'gallagher': '1301', // ギャラガー
    'aventurine': '1304', // アベンチュリン
    'robin': '1309', // ロビン
    'boothill': '1315', // ブートヒル
    'firefly': '1310', // ホタル
    'jade': '1314', // ジェイド
    'yunli': '1221', // 雲璃
    'jiaoqiu': '1218', // 椒丘
    'march7th-hunt': '1224', // 三月なのか・巡狩
    'feixiao': '1220', // 飛霄
    'lingsha': '1222', // 霊砂
    'moze': '1223', // 貊澤
    'rappa': '1317', // 乱破
    'aglaea': '1402', // アグライア
    'anaxa': '1405', // アナイクス
    'castorice': '1407', // キャストリス
    'cipher': '1406', // サフェル
    'evernight': '1413', // 長夜月
    'fugue': '1225', // 帰忘の流離人
    'hysilens': '1410', // セイレンス
    'hianshi': '1409', // ヒアンシー
    'mydei': '1404', // モーディス
    'saber': '1014', // セイバー
    'tribbie': '1403', // トリビー
    'trailblazer-destruction-m': '8001', // 開拓者・壊滅(男)
    'trailblazer-destruction-f': '8002', // 開拓者・壊滅(女)
    'trailblazer-preservation-m': '8003', // 開拓者・存護(男)
    'trailblazer-preservation-f': '8004', // 開拓者・存護(女)
    'trailblazer-harmony-m': '8005', // 開拓者・調和(男)
    'trailblazer-harmony-f': '8006', // 開拓者・調和(女)
    'trailblazer-remembrance-m': '8007', // 開拓者・記憶(男)
    'trailblazer-remembrance-f': '8008', // 開拓者・記憶(女)
    'trailblazer-destruction': '8002', // 開拓者・壊滅
    'trailblazer-preservation': '8004', // 開拓者・存護
    'trailblazer-harmony': '8006', // 開拓者・調和
    'trailblazer-remembrance': '8008', // 開拓者・記憶
    'the-herta': '1401', // マダム・ヘルタ
    'sunday': '1313', // サンデー
    'dan-heng-permansor-terrae': '1414', // 丹恒・騰荒
    'dahlia': '1321', // ダリア
    'phainon': '1408', // パイノン
};

/**
 * 遺物セットIDのマップ
 * キー: 内部ID, 値: StarRailStaticAPI の ID
 */
export const RELIC_SET_ID_MAP: Record<string, string> = {
    'passerby-of-wandering-cloud': '101', // 流雲無痕の過客
    'musketeer-of-wild-wheat': '102', // 草の穂ガンマン
    'knight-of-purity-palace': '103', // 純庭教会の聖騎士
    'hunter-of-glacial-forest': '104', // 雪の密林の狩人
    'champion-of-streetwise-boxing': '105', // 成り上がりチャンピオン
    'guard-of-wuthering-snow': '106', // 吹雪と対峙する兵士
    'firesmith-of-lava-forging': '107', // 溶岩で鍛造する火匠
    'genius-of-brilliant-stars': '108', // 星の如く輝く天才
    'band-of-sizzling-thunder': '109', // 雷鳴轟くバンド
    'eagle-of-twilight-line': '110', // 昼夜の狭間を翔ける鷹
    'thief-of-shooting-meteor': '111', // 流星の跡を追う怪盗
    'wastelander-of-banditry-desert': '112', // 荒地で盗みを働く廃土客
    'longevous-disciple': '113', // 宝命長存の蒔者
    'messenger-traversing-hackerspace': '114', // 仮想空間を漫遊するメッセンジャー
    'the-ashblazing-grand-duke': '115', // 灰燼を燃やし尽くす大公
    'prisoner-in-deep-confinement': '116', // 深い牢獄の囚人
    'pioneer-diver-of-dead-waters': '117', // 死水に潜る先駆者
    'watchmaker-master-of-dream-machinations': '118', // 夢を弄ぶ時計屋
    'iron-cavalry-against-scourge': '119', // 蝗害を一掃せし鉄騎
    'the-wind-soaring-valorous': '120', // 風雲を薙ぎ払う勇烈
    'sacerdos-relived-ordeal': '121', // 再び苦難の道を歩む司祭
    'scholar-lost-in-erudition': '122', // 知識の海に溺れる学者
    'hero-of-triumphant-song': '123', // 凱歌を揚げる英雄
    'poet-of-mourning-collapse': '124', // 亡国の悲哀を詠う詩人
    'warrior-goddess-of-sun-and-thunder': '125', // 烈陽と雷鳴の武神
    'warlord-of-blazing-sun-and-thunderous-roar': '125', // 烈陽と雷鳴の武神 (Alias)
    'wavestrider-captain': '126', // 荒海を越える船長
    'captain-who-crosses-the-rough-seas': '126', // 荒海を越える船長 (Alias)
    'world-remaking-deliverer': '127', // 天地再創の救世主
    'savior-who-recreates-heaven-and-earth': '127', // 天地再創の救世主 (Alias)
    'self-enshrouded-recluse': '128', // 星の光を隠した隠者
    'hermit-who-hid-the-light-of-the-stars': '128', // 星の光を隠した隠者 (Alias)
};

/**
 * オーナメントセットIDのマップ
 * キー: 内部ID, 値: StarRailStaticAPI の ID
 */
export const ORNAMENT_SET_ID_MAP: Record<string, string> = {
    'space-sealing-station': '301', // 宇宙封印ステーション
    'fleet-of-the-ageless': '302', // 老いぬ者の仙舟
    'pan-cosmic-commercial-enterprise': '303', // 汎銀河商事会社
    'belobog-of-the-architects': '304', // 建創者のベロブルグ
    'celestial-differentiator': '305', // 天体階差機関
    'inert-salsotto': '306', // 自転が止まったサルソット
    'talia-kingdom-of-banditry': '307', // 盗賊公国タリア
    'sprightly-vonwacq': '308', // 生命のウェンワーク
    'rutilant-arena': '309', // 星々の競技場
    'broken-keel': '310', // 折れた竜骨
    'firmament-frontline-glamoth': '311', // 蒼穹戦線グラモス
    'penacony-land-of-the-dreams': '312', // 夢の地ピノコニー
    'sigonia-the-unclaimed-desolation': '313', // 荒涼の惑星ツガンニヤ
    'izumo-gensei-and-takama-divine-realm': '314', // 出雲顕世と高天神国
    'duran-dynasty-of-running-wolves': '315', // 奔狼の都藍王朝
    'forge-of-the-kalpagni-lantern': '316', // 劫火と蓮灯の鋳煉宮
    'lushaka-the-sunken-seas': '317', // 海に沈んだルサカ
    'the-wondrous-bananamusement-park': '318', // 奇想天外のバナダイス
    'bone-collections-serene-demesne': '319', // 静謐な拾骨地
    'silent-ossuary': '319', // 静謐な拾骨地 (Alias)
    'giant-tree-of-rapt-brooding': '320', // 深慮に浸る巨樹
    'giant-tree-immersed-in-deep-thought': '320', // 深慮に浸る巨樹 (Alias)
    'arcadia-of-woven-dreams': '321', // 夢を紡ぐ妖精の楽園
    'fairy-tale-theater-of-night': '321', // 夢を紡ぐ妖精の楽園 (Alias)
    'revelry-by-the-sea': '322', // 酩酊の海域
    'sea-of-intoxication': '322', // 酩酊の海域 (Alias)
    'amphoreus-the-eternal-land': '323', // 永遠の地オンパロス
    'omphalos-eternal-grounds': '323', // 永遠の地オンパロス (Alias)
    'tengoku-livestream': '324', // 天国@配信ルーム
    'heaven-at-streaming-room': '324', // 天国@配信ルーム (Alias)
};

/**
 * 光円錐IDのマップ
 * キー: 内部ID, 値: StarRailStaticAPI の ID
 */
export const LIGHTCONE_ID_MAP: Record<string, string> = {
    // 5-stars
    'along-the-passing-shore': '23024', // 流れ逝く岸を歩いて
    'baptism-of-pure-thought': '23020', // 純粋なる思慮の洗礼
    'earthly-escapade': '23021', // 人生は遊び
    'reforged-remembrance': '23022', // 時間の記憶を再構築して
    'inherently-unjust-destiny': '23023', // 運命は常に不公平
    'whereabouts-should-dreams-rest': '23025', // 夢が帰り着く場所
    'flowing-nightglow': '23026', // 光あふれる夜
    'sailing-towards-a-second-life': '23027', // 二度目の生に向かって
    'yet-hope-is-priceless': '23028', // されど希望の銘は無価
    'those-many-springs': '23029', // 幾度目かの春
    'dance-at-sunset': '23030', // 夕日に舞う
    'i-venture-forth-to-hunt': '23031', // 我が征く巡狩の道
    'scent-alone-stays-true': '23032', // 昔日の香りは今も猶
    'ninjutsu-inscription-dazzling-evilbreaker': '23033', // 忍法帖・繚乱破魔
    'ninja-record-sound-hunt': '23033', // 忍事録・音律狩猟 (プロジェクトでは5星版として実装)
    'a-grounded-ascent': '23034', // 大地より天を目指して
    'before-dawn': '23010', // 夜明け前
    'in-the-night': '23001', // 夜の帳の中で
    'but-the-battle-isnt-over': '23003', // だが戦争は終わらない
    'moment-of-victory': '23005', // 勝利の刹那
    'night-on-the-milky-way': '23000', // 銀河鉄道の夜
    'in-the-name-of-the-world': '23004', // 世界の名を以て
    'something-irreplaceable': '23002', // かけがえのないもの
    'time-waits-for-no-one': '23013', // 時節は居らず
    'the-unreachable-side': '23009', // 着かない彼岸
    'patience-is-all-you-need': '23006', // 待つのみ
    'brighter-than-the-sun': '23015', // 陽光より輝くもの
    'she-already-shut-her-eyes': '23011', // 閉ざした瞳
    'worrisome-blissful': '23016', // 悩んで笑って
    'night-of-fright': '23017', // 驚魂の夜
    'an-instant-before-a-gaze': '23018', // その一刻、目に焼き付けて
    'past-self-in-mirror': '23019', // 鏡の中の私
    'i-shall-be-my-own-sword': '23014', // この身は剣なり
    'sleep-like-the-dead': '23012', // 泥の如き眠り
    'echoes-of-the-coffin': '23008', // 棺のこだま
    'on-the-fall-of-an-aeon': '24000', // とある星神の殞落を記す
    'cruising-in-the-stellar-sea': '24001', // 星海巡航
    'texture-of-memories': '24002', // 記憶の素材
    'solitary-healing': '24003', // 孤独の癒し
    'eternal-calculus': '24004', // 絶え間ない演算
    'memorys-curtain-never-falls': '24005', // 尽きぬ追憶
    'endless-remembrance': '24005', // 尽きぬ追憶 (Alias)
    // Recent 5-stars & missed
    'incessant-rain': '23007', // 降りやまぬ雨
    'long-road-leads-home': '23035', // 長途はやがて帰途へと続く
    'time-woven-into-gold': '23036', // 光陰を織り黄金と成す
    'into-the-unreachable-veil': '23037', // 触れてはならぬ領域へ
    'if-time-were-a-flower': '23038', // もしも時が花だったら
    'flame-of-blood-blaze-my-path': '23039', // 前途燃やす血の如き炎
    'make-farewells-more-beautiful': '23040', // 永訣よ美しくあれ
    'life-should-be-cast-to-flames': '23041', // 生命、焼滅すべし
    'long-may-rainbows-adorn-the-sky': '23042', // 空の虹が消えぬように
    'lies-dance-on-the-breeze': '23043', // 風に揺蕩う虚言
    'thus-burns-the-dawn': '23044', // 燃え盛る黎明のように
    'a-thankless-coronation': '23045', // 報われぬ戴冠
    'the-hell-where-ideals-burn': '23046', // 理想を焼く奈落で
    'why-does-the-ocean-sing': '23047', // 海の歌は何がため
    'epoch-etched-in-golden-blood': '23048', // 黄金の血で刻む時代
    'to-evernights-stars': '23049', // 長き夜に輝く星へ
    'never-forget-her-flame': '23050', // 彼女の炎を忘れずに
    'though-worlds-apart': '23051', // 万里の山河を越えて
    'this-love-forever': '23052', // 愛はいま永遠に

    // 4-stars
    'post-op-conversation': '21000', // 手術後の会話
    'good-night-and-sleep-well': '21001', // おやすみなさいと寝顔
    'day-one-of-my-new-life': '21002', // 余生の初日
    'only-silence-remains': '21003', // 沈黙のみ
    'memories-of-the-past': '21004', // 記憶の中の姿
    'the-moles-welcome-you': '21005', // モグラ党へようこそ
    'the-birth-of-the-self': '21006', // 「私」の誕生
    'shared-feeling': '21007', // 同じ気持ち
    'eyes-of-the-prey': '21008', // 獲物の視線
    'landaus-choice': '21009', // ランドゥーの選択
    'swordplay': '21010', // 論剣
    'planetary-rendezvous': '21011', // 惑星との出会い
    'a-secret-vow': '21012', // 秘密の誓い
    'make-the-world-clamor': '21013', // この世界に喧噪を
    'perfect-timing': '21014', // 今が丁度
    'resolution-shines-as-pearls-of-sweat': '21015', // 決意は汗のように輝く
    'trend-of-the-universal-market': '21016', // 星間市場のトレンド
    'subscribe-for-more': '21017', // フォローして！
    'dance-dance-dance': '21018', // ダンス！ダンス！ダンス！
    'under-the-blue-sky': '21019', // 青空の下で
    'geniuses-repose': '21020', // 天才たちの休息
    'quid-pro-quo': '21021', // 等価交換
    'fermata': '21022', // フェルマータ
    'we-are-wildfire': '21023', // 我ら地炎
    'river-flows-in-spring': '21024', // 春水に初生する
    'past-and-future': '21025', // 過去と未来
    'woof-walk-time': '21026', // ワン！散歩の時間！
    'the-seriousness-of-breakfast': '21027', // 朝食の儀式感
    'warmth-shortens-cold-nights': '21028', // 暖かい夜は長くない
    'we-will-meet-again': '21029', // またお会いしましょう
    'this-is-me': '21030', // これがウチだよ！
    'return-to-darkness': '21031', // 幽冥に帰す
    'carve-the-moon-weave-the-clouds': '21032', // 彫月裁雲の意
    'nowhere-to-run': '21033', // 逃げ場なし
    'today-is-another-peaceful-day': '21034', // 今日も平和な一日
    'what-is-real': '21035', // 何が真か
    'dreamville-adventure': '21036', // ドリームタウンの大冒険
    'final-victor': '21037', // 最後の勝者
    'flames-afar': '21038', // 烈火の彼方
    'destinys-threads-forewoven': '21039', // 運命を紡ぐ糸
    'the-day-the-cosmos-fell': '21040', // 銀河が陥落した日
    'its-showtime': '21041', // ショーの始まり
    'indelible-promise': '21042', // 心に刻まれた約束
    'concert-for-two': '21043', // 二人だけのコンサート
    'boundless-choreo': '21044', // 終わりなき舞踏
    'after-the-charmony-fall': '21045', // 調和が沈黙した後
    'poised-to-bloom': '21046', // 美しき華よ今咲かん
    'shadowed-by-night': '21047', // 夜は影のように付き纏う
    'dreams-montage': '21048', // 夢のモンタージュ
    'victory-in-a-blink': '21050', // 瞬刻の勝機
    'geniuses-greetings': '21051', // 天才たちの「挨拶」
    'sweat-now-cry-less': '21052', // 流すなら涙より汗
    'journey-forever-peaceful': '21053', // 旅が平穏であるように
    'the-storys-next-page': '21054', // 物語をめくって
    'unto-tomorrows-morrow': '21055', // 明日の明日まで
    'in-pursuit-of-the-wind': '21056', // 風を追う時
    'the-flower-remembers': '21057', // 花は忘れない
    'a-trail-of-bygone-blood': '21058', // 古より受け継がれる血
    'a-dream-scented-in-wheat': '21060', // 麦の香り漂う夢
    'holiday-thermae-escapade': '21061', // 休日のバルネア大冒険
    'see-you-at-the-end': '21062', // 終点でまた会おう
    'before-the-tutorial-mission-starts': '22000', // 初めてのクエストの前に
    'hey-over-here': '22001', // 「よぉ、ここにいるぜ」
    'for-tomorrows-journey': '22002', // 明日のための旅
    'ninja-record-sound-hunt-4': '22003', // 忍事録・音律狩猟 (4星版)
    'the-great-cosmic-enterprise': '22004', // 宇宙一の大商い！
    'the-forever-victual': '22005', // 永遠の迷境ごはん
    'fly-into-a-pink-tomorrow': '22006', // ピンク色の明日へ
    'shadowburn': '20021', // 燃ゆる影
    'reminiscence': '20022', // 辿る記憶
    'memorys-curtain-never-falls-4': '22007', // 尽きぬ追憶 (仮, 4星版がある場合)

    // 3-stars
    'arrows': '20000', // 矢じり
    'cornucopia': '20001', // 物穣
    'collapsing-sky': '20002', // 天傾
    'amber': '20003', // 琥珀
    'void': '20004', // 幽邃
    'chorus': '20005', // 斉頌
    'data-bank': '20006', // アーカイブ
    'darting-arrow': '20007', // 離弦
    'fine-fruit': '20008', // 嘉果
    'shattered-home': '20009', // 楽壊
    'defense': '20010', // 防衛
    'loop': '20011', // 淵環
    'meshing-cogs': '20012', // 輪契
    'passkey': '20013', // 霊鍵
    'adversarial': '20014', // 相抗
    'multiplication': '20015', // 蕃殖
    'mutual-demise': '20016', // 倶歿
    'pioneering': '20017', // 新天地
    'hidden-shadow': '20018', // 匿影
    'mediation': '20019', // 同調
    'sagacity': '20020', // 見識
};
