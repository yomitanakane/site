(() => {
  "use strict";

  const QUESTIONS_PER_GAME = 5;

  // ---------- 要素取得 ----------
  const screenStart = document.getElementById("screen-start");
  const screenQuiz = document.getElementById("screen-quiz");
  const screenResult = document.getElementById("screen-result");

  const btnStart = document.getElementById("btn-start");
  const btnHint = document.getElementById("btn-hint");
  const btnGiveUp = document.getElementById("btn-giveup");
  const btnSearch = document.getElementById("btn-search");
  const btnNext = document.getElementById("btn-next");
  const btnShare = document.getElementById("btn-share");
  const btnHome = document.getElementById("btn-home");

  const btnSecret = document.getElementById("btn-secret");
  const secretOverlay = document.getElementById("secret-overlay");
  const btnSecretClose = document.getElementById("btn-secret-close");
  const btnSecretToggle = document.getElementById("btn-secret-toggle");
  const secretTable = document.getElementById("secret-table");
  const secretTableBody = document.getElementById("secret-table-body");

  const timerEl = document.getElementById("timer");
  const questionIndexEl = document.getElementById("question-index");
  const questionTotalEl = document.getElementById("question-total");
  const quizPromptEl = document.getElementById("quiz-prompt");
  const tilesEl = document.getElementById("tiles");
  const answerBox = document.getElementById("answer-box");
  const answerMarkEl = document.getElementById("answer-mark");
  const answerWordEl = document.getElementById("answer-word");
  const answerExplanationEl = document.getElementById("answer-explanation");

  const resultNoHintEl = document.getElementById("result-nohint");
  const resultScoreEl = document.getElementById("result-score");
  const resultTimeEl = document.getElementById("result-time");
  const reviewTableBody = document.getElementById("review-table-body");

  // ---------- ゲーム状態 ----------
  let gameQuestions = [];
  let currentIndex = 0;
  let targetChars = [];
  let currentTiles = [];
  let selectedTileIndex = null;
  let hintUsed = false;
  let solved = false;
  let gaveUp = false;
  let correctCount = 0;
  let hintEverUsed = false;
  let giveUpEverUsed = false;
  let secretBuilt = false;

  // タイマー
  let totalElapsedMs = 0;
  let running = false;
  let resumeTimestamp = 0;
  let timerRAF = null;

  // ---------- ユーティリティ ----------
  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 各文字が元の位置と同じ値にならないように並び替える(同じ文字は同一視)
  function deranged(target) {
    const n = target.length;
    let attempt = 0;
    let arr = target;
    while (attempt < 3000) {
      arr = shuffleArray(target);
      if (arr.every((c, i) => c !== target[i])) return arr;
      attempt++;
    }
    // フォールバック: 一致してしまう位置を総当たりで解消する
    arr = shuffleArray(target);
    for (let i = 0; i < n; i++) {
      if (arr[i] === target[i]) {
        for (let j = 0; j < n; j++) {
          if (
            j !== i &&
            arr[j] !== target[i] &&
            arr[i] !== target[j]
          ) {
            [arr[i], arr[j]] = [arr[j], arr[i]];
            break;
          }
        }
      }
    }
    return arr;
  }

  function formatTime(ms) {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    return `${totalSeconds}s`;
  }

  // ---------- 出題ストック管理 ----------
  // 一度出題した問題(reading で識別)を localStorage に記録し、
  // ストックが尽きるまで同じ問題が再出題されないようにする。
  const SEEN_STORAGE_KEY = "anagram-seen-readings";

  function loadSeenReadings() {
    try {
      const raw = localStorage.getItem(SEEN_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveSeenReadings(seen) {
    try {
      localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
    } catch (e) {
      // localStorage が使えない環境(プライベートモード等)では何もしない
    }
  }

  function pickGameQuestions() {
    let seen = loadSeenReadings();
    let pool = QUESTIONS.filter((q) => !seen.includes(q.reading));
    const selected = [];

    while (selected.length < QUESTIONS_PER_GAME) {
      if (pool.length === 0) {
        // ストックが尽きたら記録をリセットし、今回選んだ分を除いて再度回す
        seen = [];
        pool = QUESTIONS.filter((q) => !selected.includes(q));
        if (pool.length === 0) break; // 問題総数が QUESTIONS_PER_GAME 未満の場合の保険
      }
      const index = Math.floor(Math.random() * pool.length);
      const [question] = pool.splice(index, 1);
      selected.push(question);
    }

    const updatedSeen = Array.from(
      new Set([...seen, ...selected.map((q) => q.reading)])
    );
    saveSeenReadings(updatedSeen);

    return selected;
  }

  // ---------- タイマー制御 ----------
  function timerTick() {
    if (!running) return;
    const now = performance.now();
    timerEl.textContent = formatTime(totalElapsedMs + (now - resumeTimestamp));
    timerRAF = requestAnimationFrame(timerTick);
  }

  function timerStart() {
    running = true;
    resumeTimestamp = performance.now();
    timerRAF = requestAnimationFrame(timerTick);
  }

  function timerPause() {
    if (!running) return;
    totalElapsedMs += performance.now() - resumeTimestamp;
    running = false;
    if (timerRAF) cancelAnimationFrame(timerRAF);
    timerEl.textContent = formatTime(totalElapsedMs);
  }

  function timerReset() {
    totalElapsedMs = 0;
    running = false;
    if (timerRAF) cancelAnimationFrame(timerRAF);
    timerEl.textContent = formatTime(0);
  }

  // ---------- 画面切り替え ----------
  function showScreen(el) {
    [screenStart, screenQuiz, screenResult].forEach((s) => s.classList.add("hidden"));
    el.classList.remove("hidden");
  }

  // ---------- ゲーム開始 ----------
  function startGame() {
    gameQuestions = pickGameQuestions();
    currentIndex = 0;
    correctCount = 0;
    hintEverUsed = false;
    giveUpEverUsed = false;
    timerReset();
    showScreen(screenQuiz);
    loadQuestion();
    timerStart();
  }

  function loadQuestion() {
    const q = gameQuestions[currentIndex];
    targetChars = Array.from(q.reading);
    currentTiles = deranged(targetChars);
    selectedTileIndex = null;
    hintUsed = false;
    solved = false;
    gaveUp = false;

    questionIndexEl.textContent = String(currentIndex + 1);
    questionTotalEl.textContent = String(QUESTIONS_PER_GAME);
    quizPromptEl.textContent = q.prompt;

    answerBox.classList.add("hidden");
    btnHint.classList.remove("hidden", "active");
    btnGiveUp.classList.remove("hidden");
    btnSearch.classList.add("hidden");

    renderTiles();
  }

  // ---------- タイル描画 ----------
  function renderTiles() {
    tilesEl.innerHTML = "";
    currentTiles.forEach((char, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tile";
      btn.textContent = char;

      if (hintUsed && char === targetChars[i]) {
        btn.classList.add("correct");
      }
      if (selectedTileIndex === i) {
        btn.classList.add("selected");
      }
      if (solved) {
        btn.disabled = true;
      }

      btn.addEventListener("click", () => onTileClick(i));
      tilesEl.appendChild(btn);
    });
  }

  function onTileClick(i) {
    if (solved) return;

    if (selectedTileIndex === null) {
      selectedTileIndex = i;
    } else if (selectedTileIndex === i) {
      selectedTileIndex = null;
    } else {
      const a = selectedTileIndex;
      [currentTiles[a], currentTiles[i]] = [currentTiles[i], currentTiles[a]];
      selectedTileIndex = null;
    }

    renderTiles();
    checkSolved();
  }

  function checkSolved() {
    const isCorrect = currentTiles.every((c, i) => c === targetChars[i]);
    if (!isCorrect) return;

    solved = true;
    correctCount++;
    hintUsed = true;
    timerPause();
    renderTiles();

    const q = gameQuestions[currentIndex];
    answerMarkEl.textContent = "正解";
    answerWordEl.textContent = q.answer;
    answerExplanationEl.textContent = q.explanation;
    btnNext.textContent =
      currentIndex === QUESTIONS_PER_GAME - 1 ? "結果を表示" : "次の問題へ";
    answerBox.classList.remove("hidden");
    btnHint.classList.add("hidden");
    btnGiveUp.classList.add("hidden");
    btnSearch.classList.remove("hidden");
  }

  // ---------- ヒント ----------
  function onHintClick() {
    hintUsed = !hintUsed;
    hintEverUsed = true;
    btnHint.classList.toggle("active", hintUsed);
    renderTiles();
  }

  // ---------- ギブアップ ----------
  function onGiveUpClick() {
    if (solved) return;

    solved = true;
    gaveUp = true;
    giveUpEverUsed = true;
    selectedTileIndex = null;
    currentTiles = targetChars.slice();
    hintUsed = true;
    timerPause();
    renderTiles();

    const q = gameQuestions[currentIndex];
    answerMarkEl.textContent = "ギブアップ";
    answerWordEl.textContent = q.answer;
    answerExplanationEl.textContent = q.explanation;
    btnNext.textContent =
      currentIndex === QUESTIONS_PER_GAME - 1 ? "結果を表示" : "次の問題へ";
    answerBox.classList.remove("hidden");
    btnHint.classList.add("hidden");
    btnGiveUp.classList.add("hidden");
    btnSearch.classList.remove("hidden");
  }

  // ---------- 答えのワードを検索 ----------
  function onSearchClick() {
    const q = gameQuestions[currentIndex];
    const url = `https://www.google.com/search?q=${encodeURIComponent(q.answer)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ---------- 次の問題 / 結果 ----------
  function onNextClick() {
    if (currentIndex === QUESTIONS_PER_GAME - 1) {
      showResult();
      return;
    }
    currentIndex++;
    loadQuestion();
    timerStart();
  }

  function showResult() {
    const noHintClear = !hintEverUsed && !giveUpEverUsed;
    resultNoHintEl.classList.toggle("hidden", !noHintClear);
    resultScoreEl.textContent = `${QUESTIONS_PER_GAME}問中${correctCount}問正解`;
    resultTimeEl.textContent = formatTime(totalElapsedMs);

    reviewTableBody.innerHTML = "";
    gameQuestions.forEach((q) => {
      const tr = document.createElement("tr");

      const tdAnswer = document.createElement("td");
      tdAnswer.textContent = q.answer;
      tdAnswer.className = "col-answer";

      const tdExplanation = document.createElement("td");
      tdExplanation.textContent = q.explanation;

      tr.appendChild(tdAnswer);
      tr.appendChild(tdExplanation);
      reviewTableBody.appendChild(tr);
    });

    showScreen(screenResult);
  }

  function onShareClick() {
    const noHintClear = !hintEverUsed && !giveUpEverUsed;
    const timeText = formatTime(totalElapsedMs);
    const prefix = noHintClear ? "ノーヒントで" : "";
    const text = `${prefix}激ムズアナグラム${correctCount}問を${timeText}でクリアした！ https://yomitanakane.com/Anagram`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function onHomeClick() {
    showScreen(screenStart);
  }

  // ---------- 全問題の一覧(隠しページ) ----------
  function buildSecretTable() {
    if (secretBuilt) return;
    secretBuilt = true;

    const sorted = QUESTIONS.slice().sort((a, b) =>
      a.reading.localeCompare(b.reading, "ja")
    );

    secretTableBody.innerHTML = "";
    sorted.forEach((q) => {
      const tr = document.createElement("tr");

      const tdAnswer = document.createElement("td");
      tdAnswer.textContent = q.answer;
      tdAnswer.className = "col-answer";

      const tdReading = document.createElement("td");
      tdReading.textContent = q.reading;
      tdReading.className = "col-reading";

      const tdExplanation = document.createElement("td");
      tdExplanation.textContent = q.explanation;

      tr.appendChild(tdAnswer);
      tr.appendChild(tdReading);
      tr.appendChild(tdExplanation);
      secretTableBody.appendChild(tr);
    });
  }

  function onSecretTriggerClick() {
    buildSecretTable();
    secretOverlay.classList.remove("hidden");
  }

  function onSecretCloseClick() {
    secretOverlay.classList.add("hidden");
  }

  function onSecretOverlayClick(e) {
    if (e.target === secretOverlay) {
      secretOverlay.classList.add("hidden");
    }
  }

  function onSecretToggleClick() {
    const isHidden = secretTable.classList.toggle("hidden");
    btnSecretToggle.textContent = isHidden
      ? "▼タップで全問題が表示されます。ネタバレ注意！"
      : "▲タップで隠す";
  }

  // ---------- イベント登録 ----------
  btnStart.addEventListener("click", startGame);
  btnHint.addEventListener("click", onHintClick);
  btnGiveUp.addEventListener("click", onGiveUpClick);
  btnSearch.addEventListener("click", onSearchClick);
  btnNext.addEventListener("click", onNextClick);
  btnShare.addEventListener("click", onShareClick);
  btnHome.addEventListener("click", onHomeClick);
  btnSecret.addEventListener("click", onSecretTriggerClick);
  btnSecretClose.addEventListener("click", onSecretCloseClick);
  btnSecretToggle.addEventListener("click", onSecretToggleClick);
  secretOverlay.addEventListener("click", onSecretOverlayClick);
})();
