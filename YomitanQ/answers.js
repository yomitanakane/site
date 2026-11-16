/**
 * YomitanQ 正誤判定データ(公開版・サーバー通信なし)
 * 正誤判定.txt(旧 Google Apps Script 版)の ANSWERS / SUPPLEMENTS / CONTAINS / MAX_CONTAINS_INPUT をそのまま移植。
 * 判定ロジックは app.js の normalize / isCorrect(旧 normalize_ / isCorrect_ と同一)。
 */
var ANSWERS = {
  "1": [
    "塔の上のラプンツェル",
    "『塔の上のラプンツェル』",
    "Tangled",
    "CHAMELEON KIDS",
    "カメレオンキッズ",
    "CHAMELEON",
    "カメレオン"
  ],
  "2": [
    "gm",
    "Paradigm"
  ],
  "3": [
    "柚",
    "柚子",
    "ゆず",
    "ユズ"
  ],
  "4": [
    "192",
    "0192",
    "キマワリ",
    "Sunflora",
    "Sonnflora"
  ],
  "5": [
    "たばこ",
    "タバコ",
    "煙草",
    "たばこの警告表示",
    "たばこ警告表示",
    "Tobacco",
    "Cigarette"
  ],
  "6": [
    "飞扬",
    "飛扬",
    "飛揚",
    "飛翔",
    "Flying",
    "Fei Yang"
  ],
  "7": [
    "情報を隠す"
  ],
  "8": [
    "ヨハン・ツァーン",
    "ヨハンツァーン",
    "Johann Zahn",
    "Zahn,　Johann",
    "ツァーン",
    "Zahn"
  ],
  "9": [
    "UNKNOWN",
    "アンノン",
    "アンノウン"
  ],
  "10": [
    "ギャラルホルン",
    "ギャッラルホルン",
    "ギョッルの角笛",
    "ギャラホルン",
    "Gjallarhorn",
    "Giallarhorn",
    "角笛",
    "ホーン",
    "角"
  ],
  "11": [
    "發明",
    "発明",
    "はつめい",
    "ハツメイ"
  ],
  "12": [
    "ナッツ",
    "ナッツトゥユー",
    "ナッツフォーユー",
    "なっつ"
  ],
  "13": [
    "APOLLO"
  ],
  "14": [
    "Daemons"
  ],
  "15": [
    "世界平和大観音像",
    "淡路観音",
    "平和観音寺"
  ],
  "16": [
    "＊",
    "*"
  ],
  "17": [
    "宮古島まる子ちゃん",
    "宮古島まるこちゃん",
    "まる子ちゃん",
    "まるこちゃん"
  ],
  "18": [
    "烏頭",
    "烏豆"
  ],
  "19": [
    "Sleepify",
    "『Sleepify』"
  ],
  "20": [
    "ビリ",
    "ンビリ"
  ],
  "21": [
    "帯占い",
    "鹿島の帯占い"
  ],
  "22": [
    "ROTATED"
  ],
  "23": [
    "LOONA",
    "이달의 소녀",
    "今月の少女",
    "LOOΠΔ",
    "本月少女"
  ],
  "24": [
    "日本で海岸線から一番遠い地点から一番近い海岸"
  ],
  "25": [
    "中村草田男"
  ]
};
var SUPPLEMENTS = {
  "1": "映画『塔の上のラプンツェル』にクレジットされているカメレオンの子どもたちの名前を記している。\n登場キャラクター・パスカルのモデルとなった。\n参考1：https://www.reddit.com/r/MovieDetails/comments/hk6p14/in_the_end_credits_of_tangled_2010_there_is_a/?tl=ja\n参考2：https://en.wikipedia.org/wiki/Production_babies",
  "2": "DAISOの店内BGM『HAPPY PRICE PARADISE -あるお店の物語A-』の歌詞を示している。\n参考：https://www.uta-net.com/song/380892/",
  "3": "『新著料理/柚珍秘密箱』の目次を示している。\n参考1：https://kokusho.nijl.ac.jp/biblio/100436193/5?ln=ja\n参考2：https://kochi.repo.nii.ac.jp/records/8740",
  "4": "ポケモンとゴッホ美術館のコラボ時、元となった絵画と描かれたポケモンの図鑑番号を示している。\n参考：https://bijutsutecho.com/magazine/news/exhibition/27865",
  "5": "たばこの警告表示義務領域の下限を示している。情報は2026年10月現在に基づく。\nアメリカではたばこメーカーと食品医薬品局の間で法廷闘争が続いており、現時点では確定していない。",
  "6": "夏季・冬季オリンピックで使用された聖火トーチのシルエットを時系列順に並べている。\n参考：https://www.olympics.com/ja/olympic-games/beijing-2022/torch-relay",
  "7": "LINEのトークスクショ時に設定できるダミーアイコン。\n参考：https://guide.line.me/ja/communication/screenshot.html",
  "8": "外送理論を表す図。ヨハン・ツァーン『Oculus artificialis teledioptricus sive telescopium』で図示された。\nヨハン・ツァーンはカメラ・オブスクラを小型化・改良したことで知られる。\n参考1：https://ja.wikipedia.org/wiki/%E5%A4%96%E9%80%81%E7%90%86%E8%AB%96\n参考2：https://library.si.edu/digital-library/book/oculusartificia00zahn",
  "9": "文学賞・メフィスト賞を受賞した小説のアルファベット部分を抜粋している。\n参考：https://ddnavi.com/article/1303182/a/6/",
  "10": "北欧神話にまつわる有名な詩集『スノッリのエッダ』の写本の表紙を示している。\n？の部分ではアースガルズの門番・ヘイムダルがギャラルホルンを吹く様子が描かれる。\n参考1：https://ja.wikipedia.org/wiki/%E3%82%B9%E3%83%8E%E3%83%83%E3%83%AA%E3%81%AE%E3%82%A8%E3%83%83%E3%83%80\n参考2：https://ja.wikipedia.org/wiki/%E3%82%AE%E3%83%A3%E3%83%A9%E3%83%AB%E3%83%9B%E3%83%AB%E3%83%B3",
  "11": "小島一騰『日本新字発明 : 前代未有』の表紙の一部を抽出している。\n参考：https://dl.ndl.go.jp/pid/862443",
  "12": "サーティワンアイスクリームのフレーバー・ナッツトゥユーと派生商品に使用されるナッツの種類を示している。\nナッツフォーユーはデイリーヤマザキで販売される、ピーカンナッツを除いた4種を用いたアイス。\n参考1：https://www.br31.jp/contents/flavor/fl236.html\n参考2：https://news.yahoo.co.jp/expert/articles/fd3c963ff7001d52a9b29bcb42bdd8e4cdf37926",
  "13": "ハリウッド・ウォーク・オブ・フェームのうち、アポロ11号の宇宙飛行士を讃える丸型のプレートを示している。\n参考：https://ja.wikipedia.org/wiki/%E3%83%8F%E3%83%AA%E3%82%A6%E3%83%83%E3%83%89%E3%83%BB%E3%82%A6%E3%82%A9%E3%83%BC%E3%82%AF%E3%83%BB%E3%82%AA%E3%83%96%E3%83%BB%E3%83%95%E3%82%A7%E3%83%BC%E3%83%A0#/media/%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB:HollywoodWalkOfFameMoonAtHollywoodAndVine.jpg",
  "14": "サーバ群「GNU Hurd」の由来を示している。\n再帰的頭字語の代表例であり、GNUは「GNU's Not Unix(GNU is Not Unix)」の略、\nHurdは「Hird of Unix Replacing Daemons」、Hirdは「Hurd of Interfaces Representing Depth」の略である。\n参考1：https://ja.wikipedia.org/wiki/GNU_Hurd\n参考2：https://hurd.sourceforge.net/",
  "15": "淡路島で廃墟化していた大観音像の撤去中の姿の写真。\n撮影は出題者自身によるもの。\n参考：https://www.kobe-np.co.jp/news/awaji/202309/0016837136.shtml",
  "16": "住野よるの小説『か「」く「」し「」ご「」と「』の各章のタイトルを示している。\n参考：https://www.shinchosha.co.jp/book/102351/",
  "17": "沖縄県・宮古列島に設置される宮古島まもる君、およびその兄弟の名前の頭文字と配置を示している。\n参考：https://realmamorukun.com/miyakojimamamorumap",
  "18": "烏：カラス　烏豆：黒豆のこと　烏頭：馬の後脚の関節　烏頭翁：台湾の固有種クロガシラ\n烏頭布：カジメの異名　草烏頭：トリカブトの異名",
  "19": "Vulfpeckにより配信され削除された、全曲が無音のアルバム。\n再生時間はSpotify上の表示に基づく。\n参考1：https://open.spotify.com/intl-ja/album/25R1pibr1FugNfOM2LhQHT\n参考2：https://ja.wikipedia.org/wiki/Sleepify",
  "20": "絵本『ンビリの王子、旅にでる』に登場するカタカナ大陸の王国の名前を示している。\n参考：https://shop.kumonshuppan.com/view/item/000000003760",
  "21": "茨城県・鹿島神宮の「帯占い」の結果を示している。\n参考：https://www.miyanaka.co.jp/mgblog/index-s.cgi?kiji_cd=00000122",
  "22": "数学者ヤコブ・ベルヌーイの墓碑銘に記された螺旋と「EADEM MUTATA RESURGO」の文字を表している。\nベルヌーイは対数螺旋を彫るよう依頼したが、職人の誤りによりアルキメデスの螺旋が刻まれた。\n参考：https://en.wikipedia.org/wiki/Eadem_mutata_resurgo#/media/File:Basel_-_Grabstein_Bernoulli.jpg",
  "23": "かつて存在した韓国のガールズグループ・이달의 소녀の英語表記の由来を示している。\n参考：https://ja.wikipedia.org/wiki/%E4%BB%8A%E6%9C%88%E3%81%AE%E5%B0%91%E5%A5%B3",
  "24": "長野県にある「日本で海岸線から一番遠い地点」の看板で示された4つの海岸を、看板内の座標に基づきGeohashで表示している。\n参考：https://tabinokoborebanashi.com/farfromsea/",
  "25": "2文字：竹田、田男\n3文字：田草月、殷紅色、田蔵田、藤田田、田字草、英田村\n4文字：吉田山田、前田太尊、前田半田、田芋田楽、吉田新田、太田上田、殷殷田田\n5文字：色葉田田田、田能村竹田、田中田士英、大田田根子、田田田博士、山田山田男"
};
var CONTAINS = {
  "5": [
    "たばこ",
    "タバコ",
    "煙草"
  ],
  "15": [
    "世界平和大観音"
  ],
  "21": [
    "帯占い"
  ]
};  // この文字列を含む解答も正解にする(Answer.txt の「Q5含む …」の行)
var MAX_CONTAINS_INPUT = 30;        // 部分一致は30文字以内の解答だけ(候補を大量に並べた解答で当たらないように)
