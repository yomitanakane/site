(() => {
  "use strict";

  const screenStart = document.getElementById("screen-start");
  const screenResult = document.getElementById("screen-result");

  const inputs = [
    document.getElementById("answer-1"),
    document.getElementById("answer-2"),
    document.getElementById("answer-3"),
  ];
  const btnSubmit = document.getElementById("btn-submit");
  const errorText = document.getElementById("error-text");
  const btnShare = document.getElementById("btn-share");
  const btnRetry = document.getElementById("btn-retry");

  const resultTotalNumEl = document.getElementById("result-total-num");
  const answerResultsEl = document.getElementById("answer-results");

  const DEFAULT_ERROR_TEXT = "※未記入欄があります";

  let lastTotal = 0;

  function showScreen(el) {
    [screenStart, screenResult].forEach((s) => s.classList.add("hidden"));
    el.classList.remove("hidden");
  }

  function normalize(str) {
    return (str || "").replace(/^[\s　]+|[\s　]+$/g, "");
  }

  function matchAnswer(rawInput) {
    const norm = normalize(rawInput);
    const found = WORDS.find((w) => w.reading === norm);
    return found ? { score: found.score, matched: found } : { score: 0, matched: null };
  }

  function onSubmit() {
    const values = inputs.map((el) => el.value);
    const filled = values.every((v) => normalize(v).length > 0);
    if (!filled) {
      errorText.textContent = DEFAULT_ERROR_TEXT;
      errorText.classList.remove("hidden");
      return;
    }
    errorText.classList.add("hidden");

    const results = values.map((v) => {
      const trimmed = normalize(v);
      const { score, matched } = matchAnswer(v);
      return { input: trimmed, score, matched };
    });
    const total = results.reduce((sum, r) => sum + r.score, 0);
    lastTotal = total;

    showResult(results, total);
  }

  function showResult(results, total) {
    resultTotalNumEl.textContent = String(total);

    answerResultsEl.innerHTML = "";
    results.forEach((r) => {
      const row = document.createElement("div");
      row.className = "answer-result-row";

      const wordEl = document.createElement("span");
      wordEl.className = "answer-result-word";
      wordEl.textContent = r.matched ? `${r.input}【${r.matched.word}】` : r.input;

      const scoreEl = document.createElement("span");
      scoreEl.className = "answer-result-score";
      scoreEl.textContent = `${r.score}点`;

      row.appendChild(wordEl);
      row.appendChild(scoreEl);
      answerResultsEl.appendChild(row);
    });

    showScreen(screenResult);
  }

  function onShareClick() {
    const text = `「よ」で始まる言葉当て で ${lastTotal}点を記録！ https://yomitanakane.com/StartYO #読谷よ当て`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function onRetryClick() {
    inputs.forEach((el) => (el.value = ""));
    errorText.classList.add("hidden");
    showScreen(screenStart);
  }

  btnSubmit.addEventListener("click", onSubmit);
  btnShare.addEventListener("click", onShareClick);
  btnRetry.addEventListener("click", onRetryClick);
})();
