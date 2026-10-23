/* 読み・表記の正規化とモーラ計算（サイトと登録ソフトで共用） */
(function (root) {
  'use strict';

  // モーラとして数えない小書き文字（「っ」「ー」は数える）
  const SMALL = new Set(['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'ゎ']);
  const IGNORE = /[\s　・･\-‐‑–—―－ー〜～~_.,，．、。'"’‘”“「」『』()（）\[\]［］【】〈〉《》!！?？:：;；\/／\\＼&＆]/g;

  // 比較・計算用のひらがな（「う゛」は「ゔ」にまとめる）
  function toHira(s) {
    return String(s == null ? '' : s)
      .replace(/゛/g, '゙').replace(/゜/g, '゚')
      .normalize('NFKC')
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }

  // 登録する読みの表記：カタカナはひらがなに、「ヴ」「ゔ」は「う゛」にする
  const VU = { ヴ: 'う゛', ゔ: 'う゛', ヷ: 'わ゛', ヸ: 'ゐ゛', ヹ: 'ゑ゛', ヺ: 'を゛' };
  function toReading(s) {
    return String(s == null ? '' : s)
      .replace(/[ｦ-ﾟ]+/g, (m) => m.normalize('NFKC'))
      .replace(/[ヴゔヷ-ヺ]/g, (c) => VU[c])
      .replace(/[ァ-ヶヽヾ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }

  function isKana(c) {
    return /[ぁ-ゖー]/.test(c);
  }

  function mora(reading) {
    let n = 0;
    for (const c of toHira(reading)) if (isKana(c) && !SMALL.has(c)) n++;
    return n;
  }

  function initial(reading) {
    for (const c of toHira(reading)) if (isKana(c)) return c;
    return '';
  }

  // 表記揺れを吸収した比較用キー
  function norm(s) {
    return toHira(s).toLowerCase().replace(IGNORE, '');
  }

  // タグを同じものとみなすためのキー。norm と同じく全角半角・大文字小文字・ひらがなカタカナ・括弧などの記号は無視するが、
  // 長音「ー」（と「-」「〜」）と二重鍵括弧『』は区別する（「ハト」と「ハート」、「キュクロプス」と『キュクロプス』は別のタグ）
  const TAG_IGNORE = /[\s　・･_.,，．、。'"’‘”“「」()（）\[\]［］【】〈〉《》!！?？:：;；\/／\\＼&＆]/g;
  function tagKey(s) {
    return toHira(s).toLowerCase().replace(/[\-‐‑–—―－〜～~]/g, 'ー').replace(TAG_IGNORE, '');
  }

  // 全角=1, 半角=0.5 で数えた見た目の長さ
  function visualLength(s) {
    let n = 0;
    for (const c of String(s || '')) n += /[\u0000-ÿ｡-ﾟ]/.test(c) ? 0.5 : 1;
    return n;
  }

  function levenshtein(a, b) {
    a = [...a]; b = [...b];
    if (Math.abs(a.length - b.length) > 2) return 99;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /*
   * q（正規化済み）と fields の一致度。小さいほど近い。一致しなければ Infinity。
   * loose=true では「入力が登録語を含む」「1字違い」も拾う（二重登録の防止用）。
   */
  // 濁点・半濁点を外したキー（「ほし」で「ぼし」も拾うため）
  function plain(s) {
    return s.normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC');
  }

  function matchScore(q, fields, loose) {
    let best = Infinity;
    if (!q) return best;
    const pq = plain(q);
    for (const f of fields) {
      const n = norm(f);
      if (!n) continue;
      if (n === q) return 0;
      if (n.startsWith(q)) best = Math.min(best, 1);
      else if (n.includes(q)) best = Math.min(best, 2);
      else if (pq.length >= 2 && plain(n).includes(pq)) best = Math.min(best, 3);
      else if (loose) {
        if (n.length >= 2 && q.includes(n)) best = Math.min(best, 3);
        else if (q.length >= 3 && levenshtein(q, n) <= 1) best = Math.min(best, 4);
      }
    }
    return best;
  }

  const Kana = { toHira, toReading, isKana, mora, initial, norm, tagKey, visualLength, matchScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = Kana;
  else root.Kana = Kana;
})(this);
