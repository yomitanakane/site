// 質問データ（reading は内部計算用の読み。表示はしない）
const QUESTIONS = [
  {
    text: "動物園を開くとしたら、一番の目玉の動物は何にする？",
    choices: [
      ["パンダ", "ぱんだ"],
      ["インドゾウ", "いんどぞう"],
      ["サイ", "さい"],
      ["リス", "りす"],
      ["人間", "にんげん"],
    ],
  },
  {
    text: "お腹が空いたので、近所でごはんを食べることにしました。どこに行く？",
    choices: [
      ["サイゼリヤ", "さいぜりや"],
      ["ガスト", "がすと"],
      ["ココス", "ここす"],
      ["吉野家", "よしのや"],
      ["駐輪場", "ちゅうりんじょう"],
    ],
  },
  {
    text: "「このパスタ物足りないな」と思った時、何を足す？",
    choices: [
      ["塩", "しお"],
      ["タバスコ", "たばすこ"],
      ["スパイス", "すぱいす"],
      ["追加のパスタ", "ついかのぱすた"],
      ["血", "ち"],
    ],
  },
  {
    text: "あなたの似顔絵を描くとしたら、どんなタッチ？",
    choices: [
      ["水彩", "すいさい"],
      ["油彩", "ゆさい"],
      ["クレヨン", "くれよん"],
      ["色鉛筆", "いろえんぴつ"],
      ["血", "ち"],
    ],
  },
  {
    text: "この中で一番重視するのは？",
    choices: [
      ["達成感", "たっせいかん"],
      ["コスパ", "こすぱ"],
      ["地位", "ちい"],
      ["社会貢献", "しゃかいこうけん"],
      ["血", "ち"],
    ],
  },
  {
    text: "今一番欲しいものは何？",
    choices: [
      ["高い食器", "たかいしょっき"],
      ["良い財布", "いいさいふ"],
      ["良い椅子", "いいいす"],
      ["出会い", "であい"],
      ["拷問部屋", "ごうもんべや"],
    ],
  },
];

const PSYCO_CHARS = new Set(["さ", "い", "こ", "ぱ", "す"]);
const SHARE_URL = "https://yomitanakane.com/Psychopath-test";

const KANJI_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

let lastScore = 0;

const $ = (id) => document.getElementById(id);

// ひらがな → カタカナ
function toKatakana(str) {
  return str.replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

// 選んだ回答の読みに含まれる「さいこぱす」の割合（%、切り捨て）
function calcScore(readings) {
  const chars = Array.from(readings.join(""));
  if (chars.length === 0) return 0;
  const hit = chars.filter((c) => PSYCO_CHARS.has(c)).length;
  return Math.floor((hit / chars.length) * 100);
}

// マークシート風の選択肢（ラジオボタン＋楕円の番号）
function renderQuestions() {
  const root = $("questions");
  root.innerHTML = "";
  QUESTIONS.forEach((q, qi) => {
    const block = document.createElement("fieldset");
    block.className = "question";
    block.id = `q${qi}`;

    const legend = document.createElement("legend");
    legend.className = "question-text";
    legend.textContent = `問${KANJI_NUM[qi]}　${q.text}`;
    block.appendChild(legend);

    const list = document.createElement("div");
    list.className = "choices";

    q.choices.forEach(([label], ci) => {
      const item = document.createElement("label");
      item.className = "choice";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q${qi}`;
      input.value = String(ci);
      input.addEventListener("change", () => {
        if (getAnswers().every((a) => a !== null)) $("error").hidden = true;
      });

      const mark = document.createElement("span");
      mark.className = "mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = String(ci + 1);

      const text = document.createElement("span");
      text.className = "choice-label";
      text.textContent = label;

      item.append(input, mark, text);
      list.appendChild(item);
    });

    block.appendChild(list);
    root.appendChild(block);
  });
}

function getAnswers() {
  return QUESTIONS.map((_, qi) => {
    const checked = document.querySelector(`input[name="q${qi}"]:checked`);
    return checked ? Number(checked.value) : null;
  });
}

function showResult(answers) {
  const readings = answers.map((ci, qi) => QUESTIONS[qi].choices[ci][1]);
  lastScore = calcScore(readings);
  const perfect = lastScore === 100;

  $("score").textContent = lastScore;
  // 単語の途中で改行されないよう、回答ごとに区切って表示
  const answersEl = $("result-answers");
  answersEl.innerHTML = "";
  readings.forEach((r, i) => {
    if (i > 0) answersEl.append("　");
    const span = document.createElement("span");
    span.className = "answer-word";
    span.textContent = toKatakana(r);
    answersEl.appendChild(span);
  });
  $("result-note").hidden = !perfect;
  document.body.classList.toggle("perfect", perfect);
  document.body.classList.add("result-mode");

  $("screen-quiz").hidden = true;
  $("screen-result").hidden = false;
  window.scrollTo(0, 0);
}

function reset() {
  $("quiz-form").reset();
  $("error").hidden = true;
  document.body.classList.remove("perfect", "result-mode");
  $("screen-result").hidden = true;
  $("screen-quiz").hidden = false;
  window.scrollTo(0, 0);
}

function share() {
  const text = `サイコパステストでサイコパス度 ${lastScore}% を記録した ${SHARE_URL}`;
  const url = "https://x.com/intent/tweet?text=" + encodeURIComponent(text);
  window.open(url, "_blank", "noopener");
}

$("quiz-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const answers = getAnswers();
  const first = answers.findIndex((a) => a === null);
  if (first !== -1) {
    $("error").hidden = false;
    $(`q${first}`).scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  showResult(answers);
});

$("btn-retry").addEventListener("click", reset);
$("btn-share").addEventListener("click", share);

renderQuestions();
