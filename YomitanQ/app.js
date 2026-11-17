/**
 * YomitanQ 公開版(静的サイト・サーバー通信なし)
 * - 参加者登録なし: 開くとすぐ問題一覧を表示
 * - 正誤判定はブラウザ内で行う(データは answers.js)
 * - 再解答の待ち時間なし
 * - 正解した問題は Images/Answer/Axx.png を表示
 * - 進捗(正解した問題)はこのブラウザの localStorage にのみ保存
 */
(function () {
  'use strict';

  // ===== 設定 =====
  // 「解説」ボタンのリンク先。空文字のあいだはボタンを押しても何も起きません。
  var EXPLANATION_URL = 'https://note.com/yomitanakane/n/ne4a148b28e2e?sub_rt=share_pw';
  // 「結果」ボタンは results.js の RESULTS(上位成績者)を表示します。

  var QUESTION_COUNT = 25;
  var MAX_INPUT = 200;
  var SITE_URL = 'https://yomitanakane.com/YomitanQ';
  var OMAKE_URL = 'https://yomitanakane.com/YomitanQ/Omake/';
  var STORAGE_KEY = 'yq_static_solved';
  var IMG_W = 1920, IMG_H = 1080;

  // 解答欄の条件表示(開催時の版と同じ文言)。指定のない問題は「解答を入力」
  var PLACEHOLDERS = {
    3: '1文字で入力',
    4: '数字を入力',
    5: '連想されるひらがな3文字を入力',
    21: '漢字2字+ひらがな1字で解答'
  };

  // 正答率: 検索可能クイズ_集計結果.xlsx「正答率」シート
  // 正解者数 ÷ 母数(登録者全員・未解答者含む・チームは1 = 872)。小数第2位までの%で表示
  var RATE_BASE = 872;
  var CORRECT_COUNTS = {
    1: 304, 2: 75, 3: 244, 4: 183, 5: 212, 6: 135, 7: 233, 8: 61, 9: 159, 10: 169,
    11: 36, 12: 83, 13: 124, 14: 68, 15: 181, 16: 79, 17: 21, 18: 195, 19: 268, 20: 67,
    21: 86, 22: 73, 23: 12, 24: 82, 25: 45
  };
  function rateText(q) {
    return (Math.round(CORRECT_COUNTS[q] / RATE_BASE * 10000) / 100).toFixed(2) + '%';
  }

  // ===== 判定(旧 Apps Script の normalize_ / isCorrect_ と同じ処理) =====
  function normalize(s) {
    s = String(s);
    try { s = s.normalize('NFKC'); } catch (e) { /* 正規化非対応時はそのまま */ }
    return s.toLowerCase().replace(/[\s　]+/g, '');
  }

  function isCorrect(q, input) {
    var list = ANSWERS[q] || [];
    var x = normalize(input);
    for (var i = 0; i < list.length; i++) if (normalize(list[i]) === x) return true;
    var parts = CONTAINS[q] || [];
    if (x.length <= MAX_CONTAINS_INPUT) {
      for (var j = 0; j < parts.length; j++) if (x.indexOf(normalize(parts[j])) >= 0) return true;
    }
    return false;
  }

  // 旧 cleanText_(単一行): 制御文字を空白にし、前後の空白を除いて200文字まで
  function cleanInput(v) {
    return String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, MAX_INPUT);
  }

  // ===== 進捗(このブラウザのみ) =====
  var solved = loadSolved();

  function loadSolved() {
    var s = {};
    try {
      var arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(arr)) arr.forEach(function (q) {
        q = parseInt(q, 10);
        if (q >= 1 && q <= QUESTION_COUNT) s[q] = true;
      });
    } catch (e) { /* 保存領域が使えない場合は空から */ }
    return s;
  }

  function saveSolved() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.keys(solved).map(Number))); } catch (e) { /* 無視 */ }
  }

  function solvedCount() { return Object.keys(solved).length; }

  // ===== 小道具 =====
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function qImg(q) { return 'Images/Question/Q' + pad2(q) + '.png'; }
  function aImg(q) { return 'Images/Answer/A' + pad2(q) + '.png'; }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function linkify(s) {
    return esc(s).replace(/https?:\/\/[^\s<]+/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
    });
  }

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function updateScroll() {
    document.body.classList.toggle('noscroll', !!document.querySelector('.qview, .overlay'));
  }

  // ===== メイン画面 =====
  var app = document.getElementById('app');
  var tiles = [];
  var completeEl;

  function renderMain() {
    var grid = '';
    for (var q = 1; q <= QUESTION_COUNT; q++) {
      grid += '<div class="cell"><button class="tile' + (solved[q] ? ' solved' : '') + '" type="button" aria-label="Q' + q + '">' +
        '<img src="' + qImg(q) + '" alt="Q' + q + '" width="' + IMG_W + '" height="' + IMG_H + '">' +
        '<span class="shade"><span>正解</span></span></button>' +
        '<p class="rate">' + rateText(q) + '</p></div>';
    }
    var explanationBtn = EXPLANATION_URL
      ? '<a class="btn btn-lg" href="' + esc(EXPLANATION_URL) + '" target="_blank" rel="noopener">解説</a>'
      : '<button class="btn btn-lg" type="button">解説</button>';

    app.innerHTML =
      '<div class="wrap">' +
        '<header class="topbar"><div class="brand"><div class="title"><img src="Images/Title.png" alt="YomitanQ" width="1000" height="200"></div></div>' +
        '<div class="topbtns"><button class="btn" type="button" data-act="rules">ルール</button></div></header>' +
        '<main>' +
          '<div class="grid">' + grid + '</div>' +
          '<div class="complete" hidden><p class="complete-title">全問正解！おめでとうございます！</p>' +
          '<p class="complete-omake">おまけ問題を10問用意しています。まだまだ遊びたい方は余興にどうぞ。<br>' +
          '<a href="' + OMAKE_URL + '" target="_blank" rel="noopener">' + OMAKE_URL + '</a></p></div>' +
          '<div class="share"><button class="btn" type="button" data-act="share">Xで進捗を共有</button></div>' +
          '<div class="results"><button class="btn btn-lg" type="button" data-act="results">結果</button>' + explanationBtn +
            '<a class="btn btn-lg" href="' + OMAKE_URL + '" target="_blank" rel="noopener">おまけ問題</a></div>' +
        '</main>' +
        '<footer class="credit">制作：<a href="https://yomitanakane.com/" target="_blank" rel="noopener">読谷あかね</a></footer>' +
      '</div>';

    tiles = Array.prototype.slice.call(app.querySelectorAll('.tile'));
    tiles.forEach(function (t, i) { t.addEventListener('click', function () { openQuestion(i + 1, t); }); });
    completeEl = app.querySelector('.complete');
    app.querySelector('[data-act="rules"]').addEventListener('click', openRules);
    app.querySelector('[data-act="share"]').addEventListener('click', share);
    app.querySelector('[data-act="results"]').addEventListener('click', openResults);
    updateComplete();
  }

  function updateComplete() {
    completeEl.hidden = solvedCount() < QUESTION_COUNT;
  }

  function share() {
    var text = '#YomitanQ で ' + solvedCount() + '/' + QUESTION_COUNT + '問正解した　' + SITE_URL;
    window.open('https://x.com/intent/post?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  // ===== 問題表示 =====
  function openQuestion(q, opener) {
    var view = el(
      '<div class="qview" role="dialog" aria-modal="true" aria-label="Q' + q + '">' +
        '<div class="qpanel" style="--ar:' + (IMG_W / IMG_H).toFixed(4) + '">' +
          '<div class="qbar"><a class="btn btn-sm" data-role="save">画像を保存</a>' +
          '<button class="qclose" type="button" aria-label="閉じる">×</button></div>' +
          '<div class="qimgwrap"><img class="qimg" alt="Q' + q + '" width="' + IMG_W + '" height="' + IMG_H + '"></div>' +
          '<div class="answer"></div>' +
        '</div>' +
      '</div>');
    var img = view.querySelector('.qimg');
    var save = view.querySelector('[data-role="save"]');
    var answer = view.querySelector('.answer');

    var wrap = view.querySelector('.qimgwrap');

    // 正解画像は「画像を保存」を出さず、右クリック・ドラッグ・長押しでの保存を防ぐ
    // (画像の上に透明な覆いを重ね、メニューとドラッグを無効化)
    function setImage(isSolved) {
      if (isSolved) {
        img.src = aImg(q);
        save.remove();
        wrap.classList.add('protected');
        img.setAttribute('draggable', 'false');
        if (!wrap.querySelector('.qshield')) {
          var shield = document.createElement('div');
          shield.className = 'qshield';
          wrap.appendChild(shield);
        }
      } else {
        img.src = qImg(q);
        save.href = img.getAttribute('src');
        save.setAttribute('download', 'YomitanQ_Q' + pad2(q) + '.png');
      }
    }
    wrap.addEventListener('contextmenu', function (e) { if (wrap.classList.contains('protected')) e.preventDefault(); });
    wrap.addEventListener('dragstart', function (e) { if (wrap.classList.contains('protected')) e.preventDefault(); });

    function showResult() {
      var list = ANSWERS[q] || [];
      var supp = SUPPLEMENTS[q] || '';
      answer.innerHTML = '<div class="result"><p class="ok">正解</p>' +
        '<p class="main-ans">' + esc(list[0] || '') + '</p>' +
        (list.length > 1 ? '<p class="alt">' + list.slice(1).map(esc).join(' / ') + '</p>' : '') +
        (supp ? '<div class="supp">' + linkify(supp) + '</div>' : '') +
        '</div>';
    }

    function showForm() {
      answer.innerHTML = '<form class="row"><input class="input" type="text" maxlength="' + MAX_INPUT +
        '" autocomplete="off" aria-label="解答" placeholder="' + esc(PLACEHOLDERS[q] || '解答を入力') + '">' +
        '<button class="btn btn-lg" type="submit">解答</button></form><div class="ansmsg"></div>';
      var form = answer.querySelector('form');
      var input = answer.querySelector('input');
      var msg = answer.querySelector('.ansmsg');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = cleanInput(input.value);
        if (!v) return;
        if (isCorrect(q, v)) {
          solved[q] = true;
          saveSolved();
          tiles[q - 1].classList.add('solved');
          updateComplete();
          setImage(true);
          showResult();
        } else {
          // 毎回表示し直して、連続で不正解だったことが分かるようにする
          msg.innerHTML = '';
          setTimeout(function () { msg.innerHTML = '<p class="wrong">不正解……</p>'; }, 60);
          input.select();
        }
      });
    }

    setImage(!!solved[q]);
    if (solved[q]) showResult(); else showForm();

    function close() {
      document.removeEventListener('keydown', onKey);
      view.remove();
      updateScroll();
      if (opener) opener.focus({ preventScroll: true });
    }
    function onKey(e) { if (e.key === 'Escape' && !document.querySelector('.overlay')) close(); }

    view.addEventListener('click', function (e) { if (e.target === view) close(); });
    view.querySelector('.qclose').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(view);
    updateScroll();
  }

  // ===== ルール =====
  var RULES_HTML =
    '<p>全25問の検索可能クイズです。</p>' +
    '<hr class="sep">' +
    '<p class="bullet">・インターネットや書籍、AIなど、<strong>あらゆる調査手段を認めます。</strong></p>' +
    '<p class="bullet">・実況・感想などはぜひ <a class="linkbtn" href="https://x.com/intent/post?text=%23YomitanQ%20" target="_blank" rel="noopener noreferrer">#YomitanQ</a> で。</p>' +
    '<hr class="sep">' +
    '<p class="bullet">・本サイトでは<strong>随時解答の提出と正誤判定が行えます</strong>。解答は何度送信しても構いません。</p>' +
    '<p class="bullet">・進捗はブラウザに保存されます。プライベートブラウザでの解答は非推奨です。</p>' +
    '<p class="bullet">・画像の表示に時間がかかる場合があります。ご了承ください。</p>' +
    '<hr class="sep">' +
    '<p class="bullet">・本クイズは全面的に<a class="plain" href="https://note.com/hashtag/SigmaQ" target="_blank" rel="noopener noreferrer">ΣQシリーズ</a>をリスペクトしています。</p>';

  var INTL_HTML =
    '<details class="intl"><summary>For International Visitors(海外の方へ)</summary><div class="intl-body">' +
    '<p>いくつかの問題はかなり日本人向けになっており、全てを楽しむのは難しいかもしれません。ごめんなさい！</p>' +
    '<p>とはいえ一部は海外圏の方でも親しめる問題もあると思います。翻訳などを駆使してチャレンジしていただくのも良いかもしれません。</p>' +
    '<div class="sp"></div>' +
    '<p>And to my international audience: Some of the quiz questions are rooted in Japanese culture, so you might find it difficult to enjoy all of them. Sorry about that!</p>' +
    '<p>That said, I think there are still plenty of questions that international players can enjoy. Feel free to use translation tools and give them a try!</p>' +
    '</div></details>';

  function openRules() {
    openPanel('ルール', '<div>' + RULES_HTML + '</div>' + INTL_HTML);
  }

  // ===== 結果(上位成績者) =====
  // 25点は大きめ、24点・23点は中くらい、それ以外は小さめ。チームメンバーのカッコ書きはさらに小さく
  function rankLevel(score) {
    if (score >= 25) return 'rk-l1';
    if (score >= 23) return 'rk-l2';
    return 'rk-l3';
  }

  function resultsHtml() {
    return '<div class="rk">' + RESULTS.map(function (g) {
      var names = g.entries.map(function (e) {
        return '<span class="rk-name">' + esc(e.name) +
          (e.members ? '<span class="rk-mem">(' + esc(e.members) + ')</span>' : '') + '</span>';
      }).join('<span class="rk-sep"> / </span>');
      return '<div class="rk-row ' + rankLevel(g.score) + '"><div class="rk-score">' + g.score + '点</div>' +
        '<div class="rk-names">' + names + '</div></div>';
    }).join('') + '</div>' +
    '<div class="rk-more" aria-hidden="true"><span>…</span></div>' +
    '<p class="rk-total">' + esc(RESULTS_TOTAL) + '</p>';
  }

  function openResults() {
    openPanel('結果', resultsHtml());
  }

  // ===== ルール・結果の共通パネル =====
  function openPanel(title, bodyHtml) {
    var opener = document.activeElement;
    var ov = el('<div class="overlay"><div class="panel" role="dialog" aria-modal="true">' +
      '<button class="close" type="button" aria-label="閉じる">×</button><h2>' + esc(title) + '</h2>' +
      bodyHtml + '</div></div>');
    function close() {
      document.removeEventListener('keydown', onKey);
      ov.remove();
      updateScroll();
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    updateScroll();
  }

  renderMain();
})();
