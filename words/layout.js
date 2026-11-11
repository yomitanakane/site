/*
 * マップの配置と線の計算（登録ソフトで計算して layout.json に保存し、サイトはそれを読むだけにする）
 * layout.json が古い・無い場合だけ、サイトでも同じ計算を行う。
 */
(function (root) {
  'use strict';

  const K = root.Kana || (typeof require === 'function' ? require('./kana.js') : null);

  // 計算方法を変えたら上げる（保存済みの layout.json を使わなくなる）
  const VERSION = 'L15';

  /* ================= 単語とタグのつながり ================= */

  const toArr = (v) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,、]/) : [])
      .map((s) => String(s).trim())
      .filter(Boolean);

  /*
   * words.json の中身から、マップに載せる単語と「タグ → 結ぶ単語」を作る。
   * タグで結ぶ単語：そのタグが付いた単語＋タグ名と同じ単語（表記揺れも同一とみなす）
   */
  function linkData(raw) {
    const list = [];
    const seen = new Set();
    for (const r of Array.isArray(raw) ? raw : []) {
      if (!r || !r.word) continue;
      let id = String(r.id || r.word);
      while (seen.has(id)) id += '_';
      seen.add(id);
      list.push({ id, raw: r, word: String(r.word).trim(), tags: [...new Set(toArr(r.tags))], selfTag: null });
    }
    const groups = new Map();
    list.forEach((w, i) => {
      for (const t of w.tags) {
        if (!groups.has(t)) groups.set(t, []);
        groups.get(t).push(i);
      }
    });
    // 単語名とタグ名は、タグどうしと同じ基準（K.tagKey：『』や長音「ー」を区別する）で比べる。
    // 作品名の『版画』はタグ「版画」の本体にはならない
    const tagByKey = new Map();
    for (const t of groups.keys()) tagByKey.set(K.tagKey(t) || t, t);
    list.forEach((w, i) => {
      w.selfTag = tagByKey.get(K.tagKey(w.word) || w.word) || null;
      if (w.selfTag && !w.tags.includes(w.selfTag)) groups.get(w.selfTag).push(i);
    });
    return { list, groups };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  // 単語・タグが同じなら同じ値（layout.json がいまの words.json 用かどうかの確認に使う）
  function signature(data) {
    return VERSION + '-' + hashStr(JSON.stringify(data.list.map((w) => [w.id, w.word, w.tags]))).toString(36);
  }

  /* ================= 単語の枠の大きさ ================= */

  // Noto Sans JP 14px の半角文字の幅（U+0020〜U+007E。ブラウザで実測）
  const ASCII = [3.14, 4.52, 6.65, 7.77, 7.77, 12.89, 9.52, 3.91, 4.73, 4.73, 6.54, 7.77, 3.89, 4.86, 3.89, 5.49,
    7.77, 7.77, 7.77, 7.77, 7.77, 7.77, 7.77, 7.77, 7.77, 7.77, 3.89, 3.89, 7.77, 7.77, 7.77, 6.64,
    13.24, 8.51, 9.2, 8.93, 9.63, 8.25, 7.73, 9.65, 10.19, 4.1, 7.49, 9.04, 7.6, 11.37, 10.12, 10.39,
    8.86, 10.39, 8.89, 8.34, 8.39, 10.09, 8.05, 12.29, 8.02, 7.43, 8.44, 4.73, 5.49, 4.73, 7.77, 7.83,
    8.48, 7.88, 8.65, 7.14, 8.68, 7.76, 4.55, 7.9, 8.5, 3.85, 3.85, 7.73, 3.98, 12.96, 8.54, 8.48,
    8.68, 8.68, 5.43, 6.55, 5.28, 8.5, 7.29, 11.23, 6.97, 7.29, 6.65, 4.73, 3.78, 4.73, 7.77];
  function charWidth(c) {
    const k = c.codePointAt(0);
    if (k >= 32 && k < 127) return ASCII[k - 32];
    if (/\p{M}/u.test(c)) return 0;
    if (k < 0x2e80) {
      // アクセント付きの欧文などは元の文字の幅（わからなければ広めに）
      const base = c.normalize('NFD')[0].codePointAt(0);
      return base >= 32 && base < 127 ? ASCII[base - 32] : 9;
    }
    return 14;
  }
  // .node の枠（左右 padding 10px・枠線 1px、高さ 32px）
  const BOX_H = 32;
  // 単語名の「( )」「（ ）」とその中身は少し小さく表示する（app.js も同じ規則・倍率）
  const PAREN = /[(（][^()（）]*[)）]/g;
  const PAREN_SCALE = 0.75;
  const textWidth = (s) => { let w = 0; for (const c of s) w += charWidth(c); return w; };
  function boxWidth(word) {
    let w = textWidth(word);
    for (const m of word.matchAll(PAREN)) w -= textWidth(m[0]) * (1 - PAREN_SCALE);
    return Math.ceil(w) + 22;
  }

  /* ================= 配置 ================= */

  // 単語同士の最低限の余白（左右・上下それぞれ片側ぶん）
  const SPACE_X = 30, SPACE_Y = 24;
  // 線をよけるために単語をずらす最大距離
  const MOVE_MAX = 300;
  const cellKey = (gx, gy) => (gx + 50000) * 100000 + (gy + 50000);

  /*
   * 単語どうしの結びつきの重み（同じ組が複数のタグでつながっていれば足し合わせる）
   * - 単語そのものがタグ名になっている時の、単語本体とそのタグの単語：一番強い
   * - 2語のタグ・3〜4語のタグ：強い
   * - 5語以上でも、ほかの単語との結びつきが少ない閉じた語群（「あやとり」など。compute の TIGHT_*）：強め
   * - 5〜9語のタグ：弱い
   * - BIG 語以上のタグ：ごく弱い（並べ方にはほとんど影響しないが、置き場所が同じくらいなら近くを選ぶ）
   */
  const W_HUB = 6;
  const BIG = 10;
  const weightOf = (m, tight) => (m === 2 ? 2 : m <= 4 ? 1.4 : tight ? 1.1 : m < BIG ? 2 / m : 0.6 / m);
  // この重み以上の組は「近くに置く組」。ほかの単語より詰めて置ける
  const NEAR_W = 1;
  // 近くに置く組ではない単語どうしは、最低限の余白（SPACE_X / SPACE_Y）にこれだけ足して離す。
  // 単語が増えると円が大きくなり、密度はほぼ一定（単語の枠の面積が円の約 1 割）に保たれる
  const FAR_X = 30, FAR_Y = 24;
  // この語数までのタグは、1語を置いたらほかの単語もすぐ続けて置く
  const OPEN_MAX = 4;
  // 2語のタグの相手を引き寄せる時にあける距離（px）
  const PAIR_GAP = 40;

  /*
   * 結びつきの強い単語が隣り合うよう、中心から1語ずつ置いていく（データが同じなら毎回同じ配置）
   * 1. すでに置いた単語と強く結びつく単語のうち、結びつきの合計が一番大きい単語を次に選び、
   *    結びつく単語たちの近く（強い結びつきほど重く見た平均の位置）の、一番近い空いている所に置く。
   *    4語までのタグ・閉じた語群・単語本体のタグは、1語を置いたらほかの単語もすぐ続けて置く
   * 2. 強く結びつく単語が無くなったら、残りのうち強い結びつきの一番多い単語から次のまとまりを始める
   *    （弱い結びつきの単語の近く。それも無ければ、いま埋まっている円の縁）
   * 3. 単語本体のタグの単語と、2語のタグの相手を、もう一度すぐ近くへ寄せる
   * hubs[gi]: そのタグと同じ名前の単語（無ければ空）
   * tight[gi]: 閉じた語群か
   */
  function place(nodes, groups, hubs, tight) {
    const n = nodes.length;
    const xs = new Float64Array(n), ys = new Float64Array(n);
    if (!n) return { xs, ys, center: -1 };
    // 半幅・半高（枠同士の最低限の余白を含む）
    const hw = new Float64Array(n), hh = new Float64Array(n);
    nodes.forEach((d, i) => { hw[i] = d.bw / 2 + SPACE_X; hh[i] = d.bh / 2 + SPACE_Y; });

    // 単語の組の重み
    const wmap = new Map();
    const keyOf = (i, j) => (i < j ? i * n + j : j * n + i);
    const addW = (i, j, w) => { if (i !== j) { const k = keyOf(i, j); wmap.set(k, (wmap.get(k) || 0) + w); } };
    groups.forEach((g, gi) => {
      for (const h of hubs[gi]) for (const i of g) addW(h, i, W_HUB);
      const w = weightOf(g.length, tight[gi]);
      for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) addW(g[a], g[b], w);
    });
    const nb = Array.from({ length: n }, () => []); // [相手, 重み, 相手, 重み, …]
    const strongTotal = new Float64Array(n);
    for (const [k, w] of wmap) {
      const i = Math.floor(k / n), j = k % n;
      nb[i].push(j, w); nb[j].push(i, w);
      if (w >= NEAR_W) { strongTotal[i] += w; strongTotal[j] += w; }
    }
    const near = (i, j) => (wmap.get(keyOf(i, j)) || 0) >= NEAR_W;

    // 置いた単語の格子（重なりの確認用）
    const CS = 160;
    const placed = new Map();
    const done = new Uint8Array(n);
    const cellsOf = (i, x, y, fn) => {
      const x1 = Math.floor((x + hw[i]) / CS), y1 = Math.floor((y + hh[i]) / CS);
      for (let gx = Math.floor((x - hw[i]) / CS); gx <= x1; gx++) for (let gy = Math.floor((y - hh[i]) / CS); gy <= y1; gy++) fn(cellKey(gx, gy));
    };
    const mark = (i) => cellsOf(i, xs[i], ys[i], (key) => { let c = placed.get(key); if (!c) placed.set(key, (c = [])); c.push(i); });
    // (x, y) に i を置けるか。loose: 近くに置く組でない単語とも、最低限の余白だけあればよい
    const free = (i, x, y, loose) => {
      const fx = loose ? 0 : FAR_X * 2, fy = loose ? 0 : FAR_Y * 2;
      const x0 = Math.floor((x - hw[i] - fx) / CS), x1 = Math.floor((x + hw[i] + fx) / CS);
      const y0 = Math.floor((y - hh[i] - fy) / CS), y1 = Math.floor((y + hh[i] + fy) / CS);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const c = placed.get(cellKey(gx, gy));
        if (c) for (const j of c) {
          const ddx = Math.abs(x - xs[j]), ddy = Math.abs(y - ys[j]);
          if (ddx >= hw[i] + hw[j] + fx || ddy >= hh[i] + hh[j] + fy) continue;
          if (loose || (ddx < hw[i] + hw[j] && ddy < hh[i] + hh[j]) || !near(i, j)) return false;
        }
      }
      return true;
    };
    // 目標の位置から一番近い空いている所（同じ距離なら from の向きを先に）
    function spot(i, tx, ty, from, loose) {
      if (free(i, tx, ty, loose)) return [tx, ty];
      for (let r = 6; r < 40000; r += 6 + r * 0.03) {
        const k = Math.min(64, Math.max(8, Math.ceil((2 * Math.PI * r) / 10)));
        for (let s = 0; s < k; s++) {
          const a = from + (s & 1 ? -1 : 1) * Math.ceil(s / 2) * ((Math.PI * 2) / k);
          const x = tx + Math.cos(a) * r, y = ty + Math.sin(a) * r;
          if (free(i, x, y, loose)) return [x, y];
        }
      }
      return [tx, ty];
    }

    // 1. 2. 中心から1語ずつ置く
    // att: すでに置いた単語との結びつきの合計（attS は強い結びつきだけ）
    // sx, sy, sw: 結びつく単語の位置の、重みの2乗で重み付けした合計（次に置く目標の位置）
    const att = new Float64Array(n), attS = new Float64Array(n), sx = new Float64Array(n), sy = new Float64Array(n), sw = new Float64Array(n);
    const since = new Float64Array(n); // 初めて強く結びついた順（同じ強さなら早い方を先に）
    let clock = 0, area = 0, seeds = 0;
    const GOLD = Math.PI * (3 - Math.sqrt(5));
    const groupsOf = Array.from({ length: n }, () => []);
    groups.forEach((g, gi) => { for (const i of g) groupsOf[i].push(gi); });
    // すぐ続けて置く単語（1語を置いたら、その単語の少ない語数のタグ・閉じた語群・単語本体のタグの単語）
    const queue = [], queued = new Uint8Array(n), viaQueue = new Uint8Array(n);
    let qh = 0;
    function settle(i, x, y) {
      xs[i] = x; ys[i] = y; done[i] = 1; mark(i);
      area += (hw[i] + FAR_X) * 2 * (hh[i] + FAR_Y) * 2;
      const a = nb[i];
      for (let k = 0; k < a.length; k += 2) {
        const j = a[k], w = a[k + 1];
        if (done[j]) continue;
        if (w >= NEAR_W) { if (!attS[j]) since[j] = ++clock; attS[j] += w; }
        att[j] += w; sx[j] += x * w * w; sy[j] += y * w * w; sw[j] += w * w;
      }
      // 続けて置いた単語からは、閉じた語群・単語本体のタグだけを広げる（小さなタグの連鎖で遠くまで続けない）
      for (const gi of groupsOf[i]) {
        const g = groups[gi], strong = tight[gi] || hubs[gi].includes(i);
        if (!(strong || (g.length <= OPEN_MAX && !viaQueue[i]))) continue;
        for (const j of g) if (!done[j] && !queued[j]) { queued[j] = 1; queue.push(j); }
      }
    }
    // 最初の単語：強い結びつきの合計が一番大きい単語を中央に
    let first = 0;
    for (let i = 1; i < n; i++) if (strongTotal[i] > strongTotal[first]) first = i;
    settle(first, 0, 0);
    for (let k = 1; k < n; k++) {
      let u = -1;
      while (qh < queue.length && done[queue[qh]]) qh++;
      if (qh < queue.length) { u = queue[qh++]; viaQueue[u] = 1; }
      if (u < 0) {
        for (let i = 0; i < n; i++) {
          if (done[i] || !attS[i]) continue;
          if (u < 0 || att[i] > att[u] + 1e-9 || (Math.abs(att[i] - att[u]) <= 1e-9 && since[i] < since[u])) u = i;
        }
      }
      let tx, ty;
      if (u < 0) {
        // 次のまとまり：強い結びつきの一番多い単語から
        for (let i = 0; i < n; i++) {
          if (done[i]) continue;
          if (u < 0 || strongTotal[i] > strongTotal[u] + 1e-9 || (Math.abs(strongTotal[i] - strongTotal[u]) <= 1e-9 && att[i] > att[u] + 1e-9)) u = i;
        }
        if (sw[u] > 0) { tx = sx[u] / sw[u]; ty = sy[u] / sw[u]; }
        else { const r = Math.sqrt(area / Math.PI) * 0.85, a = ++seeds * GOLD; tx = Math.cos(a) * r; ty = Math.sin(a) * r; }
      } else { tx = sx[u] / sw[u]; ty = sy[u] / sw[u]; }
      const [x, y] = spot(u, tx, ty, Math.atan2(ty, tx), false);
      settle(u, x, y);
    }

    // 3. 単語本体のタグの単語と、2語のタグの相手を、もう一度すぐ近くへ寄せる（中心に近い単語から順に置き直す）
    // （複数の単語本体に属する時は、単語の少ないタグの単語本体を優先）
    const hubOf = new Int32Array(n).fill(-1), hubSize = new Float64Array(n).fill(Infinity);
    groups.forEach((g, gi) => {
      for (const h of hubs[gi]) for (const i of g) if (i !== h && g.length < hubSize[i]) { hubOf[i] = h; hubSize[i] = g.length; }
    });
    const members = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) if (hubOf[i] >= 0) members[hubOf[i]].push(i);
    const pairOf = Array.from({ length: n }, () => []);
    for (const g of groups) if (g.length === 2) { pairOf[g[0]].push(g[1]); pairOf[g[1]].push(g[0]); }
    const tx0 = Float64Array.from(xs), ty0 = Float64Array.from(ys);
    placed.clear();
    done.fill(0);
    const going = new Uint8Array(n); // 単語本体を先に置こうとしている途中の単語（相互に本体の時の無限ループよけ）
    function put(i, tx, ty, withPairs) {
      if (done[i]) return;
      const h0 = hubOf[i];
      if (h0 >= 0 && !done[h0] && !going[h0]) {
        going[i] = 1; put(h0, tx0[h0], ty0[h0], withPairs); going[i] = 0;
        if (done[i]) return;
      }
      done[i] = 1;
      [xs[i], ys[i]] = spot(i, tx, ty, Math.atan2(ty0[i] - ty, tx0[i] - tx), true);
      mark(i);
      // 寄せる時は、元の位置の向きに、枠が接するくらいまで
      for (const j of members[i]) {
        const d = Math.hypot(tx0[j] - xs[i], ty0[j] - ys[i]) || 1, f = Math.min(1, (hh[i] + hh[j]) / d);
        put(j, xs[i] + (tx0[j] - xs[i]) * f, ys[i] + (ty0[j] - ys[i]) * f, true);
      }
      if (withPairs) for (const j of pairOf[i]) {
        if (done[j]) continue;
        const d = Math.hypot(tx0[j] - xs[i], ty0[j] - ys[i]) || 1, lim = hh[i] + hh[j] + PAIR_GAP;
        put(j, d > lim ? xs[i] + (tx0[j] - xs[i]) * (lim / d) : tx0[j], d > lim ? ys[i] + (ty0[j] - ys[i]) * (lim / d) : ty0[j], false);
      }
    }
    for (const i of Array.from({ length: n }, (_, i) => i).sort((p, q) => tx0[p] ** 2 + ty0[p] ** 2 - (tx0[q] ** 2 + ty0[q] ** 2))) put(i, tx0[i], ty0[i], true);

    // 全体の中心に一番近い単語を、ちょうど中央（原点）に
    let cx = 0, cy = 0, center = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { cx += xs[i]; cy += ys[i]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) { const d = (xs[i] - cx) ** 2 + (ys[i] - cy) ** 2; if (d < bd) { bd = d; center = i; } }
    const ox = xs[center], oy = ys[center];
    for (let i = 0; i < n; i++) { xs[i] -= ox; ys[i] -= oy; }
    return { xs, ys, center };
  }

  /* ================= 線 ================= */

  /*
   * 線の濃さ：今あるタグのうち一番単語の少ないタグを最大 A_MAX、一番多いタグを最小 A_MIN とし、
   * その間を単語数（対数）の割合でグラデーションにする。GAMMA が大きいほど濃淡の差がはっきりする。
   */
  const A_MAX = 0.4, A_MIN = 0.07, GAMMA = 2;
  // 単語の多いタグ（FAINT_FROM 語以上）の線はさらに薄く
  const FAINT_FROM = 15, FAINT_SCALE = 0.5;
  function alphaScale(groups) {
    const sizes = groups.map((g) => g.length).filter((m) => m > 1);
    const lo = Math.log(Math.min(...sizes, 2)), hi = Math.log(Math.max(...sizes, 2));
    return (m) => {
      const t = hi > lo ? (Math.log(m) - lo) / (hi - lo) : 0;
      return A_MIN + (A_MAX - A_MIN) * Math.pow(1 - t, GAMMA);
    };
  }

  // 線分が長方形に掛かるか（Liang–Barsky）
  function segHitsRect(x1, y1, x2, y2, l, t, r, b) {
    const dx = x2 - x1, dy = y2 - y1;
    const p = [-dx, dx, -dy, dy], q = [x1 - l, r - x1, y1 - t, b - y1];
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 4; k++) {
      if (p[k] === 0) { if (q[k] < 0) return false; continue; }
      const v = q[k] / p[k];
      if (p[k] < 0) { if (v > t1) return false; if (v > t0) t0 = v; }
      else { if (v < t0) return false; if (v < t1) t1 = v; }
    }
    return true;
  }

  // 線分が通る格子セルを順にたどる
  const GC = 120;
  function walkCells(x1, y1, x2, y2, fn) {
    let gx = Math.floor(x1 / GC), gy = Math.floor(y1 / GC);
    const ex = Math.floor(x2 / GC), ey = Math.floor(y2 / GC);
    const dx = x2 - x1, dy = y2 - y1, sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tdx = dx ? Math.abs(GC / dx) : Infinity, tdy = dy ? Math.abs(GC / dy) : Infinity;
    let tx = dx ? (sx > 0 ? (gx + 1) * GC - x1 : x1 - gx * GC) / Math.abs(dx) : Infinity;
    let ty = dy ? (sy > 0 ? (gy + 1) * GC - y1 : y1 - gy * GC) / Math.abs(dy) : Infinity;
    if (fn(cellKey(gx, gy)) === false) return false;
    for (let guard = 0; (gx !== ex || gy !== ey) && guard < 100000; guard++) {
      if (tx < ty) { tx += tdx; gx += sx; } else { ty += tdy; gy += sy; }
      if (fn(cellKey(gx, gy)) === false) return false;
    }
    return true;
  }

  function bezier(a, b, c, d, t) {
    const u = 1 - t;
    return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
  }

  /*
   * タグごとに単語を木で結び、線の上に別の単語が乗らないようにする。
   * 1. 近い単語同士の候補線から、単語に掛からない線を優先して木を作る
   *    （タグと同じ名前の単語がある時は、そのタグの単語をすべてその単語と直接結ぶ）
   * 2. それでも線に掛かる単語は、近くの空いている場所へずらす
   * 3. ずらせなかった所は、線を曲げて単語を避ける
   * 戻り値：[{ i, j, a（濃さ）, tags（タグ番号）, pts（点列） }]
   */
  // fixed: 線よけのために動かさない単語（円の中央の単語）
  function connect(nodes, groups, xs, ys, hubs, fixed) {
    const n = nodes.length;
    if (!n) return [];
    const alphaFor = alphaScale(groups);
    const HW = nodes.map((d) => d.bw / 2 + SPACE_X), HH = nodes.map((d) => d.bh / 2 + SPACE_Y); // 単語同士の間隔
    const LW = nodes.map((d) => d.bw / 2 + 6), LH = nodes.map((d) => d.bh / 2 + 6); // 線との間隔
    const boxG = new Map(), segG = new Map();
    const put = (g, key, v) => { let s = g.get(key); if (!s) g.set(key, (s = new Set())); s.add(v); };
    const take = (g, key, v) => { const s = g.get(key); if (s) s.delete(v); };
    function boxCells(i, x, y, fn) {
      const x1 = Math.floor((x + HW[i]) / GC), y1 = Math.floor((y + HH[i]) / GC);
      for (let gx = Math.floor((x - HW[i]) / GC); gx <= x1; gx++)
        for (let gy = Math.floor((y - HH[i]) / GC); gy <= y1; gy++) if (fn(cellKey(gx, gy)) === false) return false;
      return true;
    }
    const hitBox = (b, x1, y1, x2, y2) => segHitsRect(x1, y1, x2, y2, xs[b] - LW[b], ys[b] - LH[b], xs[b] + LW[b], ys[b] + LH[b]);
    // 線分 (端点 i, j) に掛かる単語の数（limit で打ち切り）
    // 同じ単語を二度調べないための印（呼び出しごとに番号を変える）
    const seenMark = new Uint32Array(n);
    let mark = 0;
    function hits(x1, y1, x2, y2, i, j, limit) {
      let c = 0;
      const m = ++mark;
      walkCells(x1, y1, x2, y2, (key) => {
        const s = boxG.get(key);
        if (s) for (const b of s) {
          if (b === i || b === j || seenMark[b] === m) continue;
          seenMark[b] = m;
          if (hitBox(b, x1, y1, x2, y2) && ++c >= limit) return false;
        }
      });
      return c;
    }
    const addBox = (i) => boxCells(i, xs[i], ys[i], (key) => put(boxG, key, i));
    const dropBox = (i) => boxCells(i, xs[i], ys[i], (key) => take(boxG, key, i));
    for (let i = 0; i < n; i++) addBox(i);

    // 1. 候補線（各単語から近い同タグの単語へ＋距離だけの最小全域木）から、掛かる単語が少ない線を優先して木を作る
    const pairs = new Map();
    // direct: 単語本体とそのタグの単語を直接結ぶ線（サイトで少し太く表示する）
    const addPair = (u, v, a, ti, direct) => {
      const i = Math.min(u, v), j = Math.max(u, v);
      const e = pairs.get(i * n + j);
      if (!e) pairs.set(i * n + j, { i, j, a, tags: [ti], direct: !!direct });
      else { if (a > e.a) e.a = a; if (!e.tags.includes(ti)) e.tags.push(ti); if (direct) e.direct = true; }
    };
    groups.forEach((ids, ti) => {
      const m = ids.length;
      if (m < 2) return;
      const a = alphaFor(m) * (m >= FAINT_FROM ? FAINT_SCALE : 1);
      // タグと同じ名前の単語（単語本体）があれば、そのタグの単語はすべて単語本体と直接結ぶ
      if (hubs[ti].length) {
        for (const h of hubs[ti]) for (const v of ids) if (v !== h) addPair(h, v, a, ti, true);
        return;
      }
      const d2 = (u, v) => (xs[ids[u]] - xs[ids[v]]) ** 2 + (ys[ids[u]] - ys[ids[v]]) ** 2;
      const cand = new Map();
      const addCand = (u, v) => { const key = u < v ? u * m + v : v * m + u; if (!cand.has(key)) cand.set(key, [Math.min(u, v), Math.max(u, v)]); };
      // 距離の最小全域木（つながりを保証）
      const inTree = new Uint8Array(m), best = new Float64Array(m).fill(Infinity), from = new Int32Array(m).fill(-1);
      best[0] = 0;
      for (let k = 0; k < m; k++) {
        let u = -1, bv = Infinity;
        for (let i = 0; i < m; i++) if (!inTree[i] && best[i] < bv) { bv = best[i]; u = i; }
        inTree[u] = 1;
        if (from[u] >= 0) addCand(u, from[u]);
        for (let i = 0; i < m; i++) if (!inTree[i]) { const d = d2(u, i); if (d < best[i]) { best[i] = d; from[i] = u; } }
      }
      // 近い単語（最大6つ）
      if (m > 2) {
        const NK = Math.min(6, m - 1);
        for (let u = 0; u < m; u++) {
          const near = [];
          for (let v = 0; v < m; v++) if (v !== u) near.push([d2(u, v), v]);
          near.sort((p, q) => p[0] - q[0]);
          for (let k = 0; k < NK; k++) addCand(u, near[k][1]);
        }
      }
      // 掛かる単語1つにつき距離 600px 分の重み
      const list = [...cand.values()].map(([u, v]) => {
        const i = ids[u], j = ids[v];
        return [Math.sqrt(d2(u, v)) + 600 * hits(xs[i], ys[i], xs[j], ys[j], i, j, 3), u, v];
      }).sort((p, q) => p[0] - q[0]);
      const parent = Array.from({ length: m }, (_, i) => i);
      const rootOf = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
      for (const [, u, v] of list) {
        const ru = rootOf(u), rv = rootOf(v);
        if (ru === rv) continue;
        parent[ru] = rv;
        addPair(ids[u], ids[v], a, ti);
      }
    });
    const edges = [...pairs.values()];

    // 2. 線に掛かっている単語をずらす
    const inc = Array.from({ length: n }, () => []);
    edges.forEach((e, k) => { inc[e.i].push(k); inc[e.j].push(k); });
    const segOf = (k) => [xs[edges[k].i], ys[edges[k].i], xs[edges[k].j], ys[edges[k].j]];
    const addSeg = (k) => { const [a, b, c, d] = segOf(k); walkCells(a, b, c, d, (key) => put(segG, key, k)); };
    const dropSeg = (k) => { const [a, b, c, d] = segOf(k); walkCells(a, b, c, d, (key) => take(segG, key, k)); };
    edges.forEach((_, k) => addSeg(k));

    function fits(b, x, y) {
      const ok = boxCells(b, x, y, (key) => {
        const bs = boxG.get(key);
        if (bs) for (const o of bs) if (o !== b && Math.abs(x - xs[o]) < HW[b] + HW[o] && Math.abs(y - ys[o]) < HH[b] + HH[o]) return false;
        const ss = segG.get(key);
        if (ss) for (const k of ss) {
          const e = edges[k];
          if (e.i === b || e.j === b) continue;
          if (segHitsRect(xs[e.i], ys[e.i], xs[e.j], ys[e.j], x - LW[b], y - LH[b], x + LW[b], y + LH[b])) return false;
        }
      });
      if (!ok) return false;
      for (const k of inc[b]) {
        const o = edges[k].i === b ? edges[k].j : edges[k].i;
        if (hits(x, y, xs[o], ys[o], b, o, 1)) return false;
      }
      return true;
    }

    for (let round = 0; round < 6; round++) {
      const bad = new Set();
      edges.forEach((e, k) => {
        const [a, b, c, d] = segOf(k);
        walkCells(a, b, c, d, (key) => {
          const s = boxG.get(key);
          if (s) for (const o of s) if (o !== e.i && o !== e.j && o !== fixed && hitBox(o, a, b, c, d)) bad.add(o);
        });
      });
      if (!bad.size) break;
      let moved = 0;
      for (const b of bad) {
        dropBox(b);
        inc[b].forEach(dropSeg);
        const tx = xs[b], ty = ys[b];
        const a0 = (b * 2.399) % (Math.PI * 2);
        search: for (let r = 10; r < MOVE_MAX; r += 10 + r * 0.06) {
          const k = Math.min(40, Math.max(8, Math.ceil((2 * Math.PI * r) / 14)));
          for (let s = 0; s < k; s++) {
            const a = a0 + (s / k) * Math.PI * 2;
            const x = tx + Math.cos(a) * r, y = ty + Math.sin(a) * r;
            if (fits(b, x, y)) { xs[b] = x; ys[b] = y; moved++; break search; }
          }
        }
        addBox(b);
        inc[b].forEach(addSeg);
      }
      if (!moved) break;
    }

    // 3. 残った線は、単語に掛からない道筋を探して曲げる
    const clear = (x1, y1, x2, y2, e) => !hits(x1, y1, x2, y2, e.i, e.j, 1);
    // 点列が単語に掛からないか
    const pathClear = (pts, e) => {
      for (let k = 1; k < pts.length; k++) if (!clear(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], e)) return false;
      return true;
    };
    // 経由点を通るなめらかな曲線（Catmull-Rom）を細かい点列にする
    function spline(pts) {
      const out = [pts[0]];
      for (let k = 0; k < pts.length - 1; k++) {
        const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        const steps = Math.max(8, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 12));
        for (let i = 1; i <= steps; i++) out.push(bezier(p1, c1, c2, p2, i / steps));
      }
      return out;
    }
    // 角だけを丸めた点列（半径 r まで）
    function rounded(pts, r) {
      const out = [pts[0]];
      for (let k = 1; k < pts.length - 1; k++) {
        const p = pts[k], q = pts[k - 1], nx = pts[k + 1];
        const d1 = Math.hypot(q[0] - p[0], q[1] - p[1]), d2 = Math.hypot(nx[0] - p[0], nx[1] - p[1]);
        const rr = Math.min(r, d1 * 0.45, d2 * 0.45);
        const a = [p[0] + (q[0] - p[0]) * rr / d1, p[1] + (q[1] - p[1]) * rr / d1];
        const b = [p[0] + (nx[0] - p[0]) * rr / d2, p[1] + (nx[1] - p[1]) * rr / d2];
        out.push(a);
        for (let i = 1; i <= 10; i++) out.push(bezier(a, p, p, b, i / 10));
      }
      out.push(pts[pts.length - 1]);
      return out;
    }
    // 曲がり具合（点列の最小の曲率半径）
    function minRadius(pts) {
      let r = Infinity;
      for (let k = 1; k < pts.length - 1; k++) {
        const ax = pts[k][0] - pts[k - 1][0], ay = pts[k][1] - pts[k - 1][1];
        const bx = pts[k + 1][0] - pts[k][0], by = pts[k + 1][1] - pts[k][1];
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (!la || !lb) continue;
        const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
        if (turn > 1e-4) r = Math.min(r, (la + lb) / 2 / turn);
      }
      return r;
    }
    const sampleBezier = (a, c1, c2, b) => {
      const k = Math.max(12, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 18));
      const out = [];
      for (let i = 0; i <= k; i++) out.push(bezier(a, c1, c2, b, i / k));
      return out;
    };
    // 両端を結ぶゆるやかな弧（ふくらみの小さい順に試す）
    function* arcs(A, B) {
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      const ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len, nx = -uy, ny = ux;
      const at = (f, d) => [A[0] + ux * len * f + nx * d, A[1] + uy * len * f + ny * d];
      for (const k of [0.12, 0.2, 0.3, 0.42, 0.56, 0.75, 1]) {
        const d = Math.max(24, k * len);
        if (d > ARC_MAX) break; // 大きくふくらむ弧は使わない（格子の上で道を探す）
        for (const sg of [1, -1]) {
          // 対称な弧と、片側に寄った弧
          for (const [f1, f2, r1, r2] of [[1 / 3, 2 / 3, 1, 1], [0.25, 0.75, 1, 0.4], [0.25, 0.75, 0.4, 1]]) {
            yield sampleBezier(A, at(f1, d * sg * r1), at(f2, d * sg * r2), B);
          }
        }
      }
      // ゆるやかな S 字
      for (const k of [0.2, 0.35]) {
        const d = Math.max(24, k * len);
        if (d > ARC_MAX) break;
        for (const sg of [1, -1]) yield sampleBezier(A, at(1 / 3, d * sg), at(2 / 3, -d * sg), B);
      }
    }
    const GENTLE = 40; // これより急なカーブは使わない（px）
    const ARC_MAX = 400; // 弧でふくらませる最大の幅（px）

    // 単語に掛かる線の道筋を決める
    function route(e) {
      const A = [xs[e.i], ys[e.i]], B = [xs[e.j], ys[e.j]];
      // まずはゆるやかな弧で単語を避ける
      for (const c of arcs(A, B)) if (minRadius(c) >= GENTLE && pathClear(c, e)) return c;
      // 弧で避けられなければ、単語から少し離れた道を探し、経由点を通る曲線にする。なるべくゆるやかなものを選ぶ
      let best = null, bestR = -1;
      for (const margin of [12, 6]) {
        const p = gridRoute(e, A, B, margin);
        if (!p) continue;
        for (const c of [spline(p), rounded(p, 120), rounded(p, 80), rounded(p, 40)]) {
          if (!pathClear(c, e)) continue;
          const r = minRadius(c);
          if (r > bestR) { bestR = r; best = c; }
          if (r >= GENTLE) return best;
        }
        if (best) return best;
      }
      // 単語の間が狭い所しか通れない時
      const p = gridRoute(e, A, B, 0);
      if (p) for (const c of [rounded(p, 20), rounded(p, 10), p]) if (pathClear(c, e)) return c;
      return p || [A, B];
    }

    /*
     * 格子（GR px 四方）の上で、単語（線との間隔＋margin）を通らない最短の道を探し（A*）、
     * 見通しのきく点を飛ばして経由点を減らす。格子はマップ全体で1つ作り、使い回す。
     */
    const GR = 12;
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    for (let i = 0; i < n; i++) {
      gx0 = Math.min(gx0, xs[i] - LW[i]); gx1 = Math.max(gx1, xs[i] + LW[i]);
      gy0 = Math.min(gy0, ys[i] - LH[i]); gy1 = Math.max(gy1, ys[i] + LH[i]);
    }
    gx0 = Math.floor((gx0 - 800) / GR); gy0 = Math.floor((gy0 - 800) / GR);
    const GW = Math.ceil((gx1 + 800) / GR) - gx0 + 1, GH = Math.ceil((gy1 + 800) / GR) - gy0 + 1;
    const blockFor = new Map(); // margin → 単語のある格子（1）
    function blockGrid(margin) {
      let b = blockFor.get(margin);
      if (b) return b;
      b = new Uint8Array(GW * GH);
      const m = GR * 0.5 + margin;
      for (let o = 0; o < n; o++) {
        const c0 = Math.max(0, Math.ceil((xs[o] - LW[o] - m) / GR) - gx0), c1 = Math.min(GW - 1, Math.floor((xs[o] + LW[o] + m) / GR) - gx0);
        const r0 = Math.max(0, Math.ceil((ys[o] - LH[o] - m) / GR) - gy0), r1 = Math.min(GH - 1, Math.floor((ys[o] + LH[o] + m) / GR) - gy0);
        if (c0 <= c1) for (let r = r0; r <= r1; r++) b.fill(1, r * GW + c0, r * GW + c1 + 1);
      }
      blockFor.set(margin, b);
      return b;
    }
    const gCost = new Float64Array(GW * GH), gPrev = new Int32Array(GW * GH), gSeen = new Int32Array(GW * GH), gDone = new Int32Array(GW * GH);
    let gStamp = 0;
    function gridRoute(e, A, B, margin) {
      const blk = blockGrid(margin);
      const m = GR * 0.5 + margin;
      // 両端の単語の上は通ってよい
      const own = (cx, cy) => {
        const x = (cx + gx0) * GR, y = (cy + gy0) * GR;
        return (Math.abs(x - xs[e.i]) <= LW[e.i] + m && Math.abs(y - ys[e.i]) <= LH[e.i] + m) ||
          (Math.abs(x - xs[e.j]) <= LW[e.j] + m && Math.abs(y - ys[e.j]) <= LH[e.j] + m);
      };
      const isBlocked = (cx, cy) => blk[cy * GW + cx] === 1 && !own(cx, cy);
      const pad = Math.ceil(600 / GR);
      const sx = Math.round(A[0] / GR) - gx0, sy = Math.round(A[1] / GR) - gy0, tx = Math.round(B[0] / GR) - gx0, ty = Math.round(B[1] / GR) - gy0;
      const lx = Math.max(0, Math.min(sx, tx) - pad), hx = Math.min(GW - 1, Math.max(sx, tx) + pad);
      const ly = Math.max(0, Math.min(sy, ty) - pad), hy = Math.min(GH - 1, Math.max(sy, ty) + pad);
      const s0 = sy * GW + sx, s1 = ty * GW + tx;
      const st = ++gStamp;
      const h = (cx, cy) => { const dx = Math.abs(cx - tx), dy = Math.abs(cy - ty); return (Math.max(dx, dy) + 0.4142 * Math.min(dx, dy)) * 2; }; // 目的地への近さを重く見る（最短でなくてよいので速く）
      const hf = [], hc = [];
      const push = (f, c) => {
        let k = hf.length;
        hf.push(f); hc.push(c);
        while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hc[k] = hc[p]; k = p; }
        hf[k] = f; hc[k] = c;
      };
      const pop = () => {
        const c = hc[0], lf = hf.pop(), lc = hc.pop();
        const N = hf.length;
        if (N) {
          let k = 0;
          for (;;) {
            const a = 2 * k + 1, b = a + 1;
            let m2 = -1, mf = lf;
            if (a < N && hf[a] < mf) { m2 = a; mf = hf[a]; }
            if (b < N && hf[b] < mf) { m2 = b; mf = hf[b]; }
            if (m2 < 0) break;
            hf[k] = hf[m2]; hc[k] = hc[m2]; k = m2;
          }
          hf[k] = lf; hc[k] = lc;
        }
        return c;
      };
      gSeen[s0] = st; gCost[s0] = 0; gPrev[s0] = -1;
      push(h(sx, sy), s0);
      let found = false, count = 0;
      while (hf.length) {
        const c = pop();
        if (gDone[c] === st) continue;
        if (c === s1) { found = true; break; }
        gDone[c] = st;
        if (++count > 400000) break;
        const cx = c % GW, cy = (c - cx) / GW, gc = gCost[c];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < lx || ny < ly || nx > hx || ny > hy) continue;
          const nc = ny * GW + nx;
          if (gDone[nc] === st) continue;
          if (nc !== s1 && isBlocked(nx, ny)) continue;
          // 斜めに進む時は角をかすめない
          if (dx && dy && (isBlocked(nx, cy) || isBlocked(cx, ny))) continue;
          const ng = gc + (dx && dy ? 1.4142 : 1);
          if (gSeen[nc] !== st || ng < gCost[nc]) { gSeen[nc] = st; gCost[nc] = ng; gPrev[nc] = c; push(ng + h(nx, ny), nc); }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let c = s1; c >= 0; c = gPrev[c]) { const cx = c % GW; cells.push([(cx + gx0) * GR, ((c - cx) / GW + gy0) * GR]); if (c === s0) break; }
      cells.reverse();
      cells[0] = A; cells[cells.length - 1] = B;
      // 見通しのきく点まで飛ばす（単語から margin 離れたまま）
      const out = [A];
      const L = cells.length - 1;
      // 格子の上で見通せるか（線を半マスずつたどって、単語のある格子に入らないか）
      const see = (k, j) => {
        const ax = cells[k][0] / GR - gx0, ay = cells[k][1] / GR - gy0, bx = cells[j][0] / GR - gx0, by = cells[j][1] / GR - gy0;
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
        for (let q = 1; q < steps; q++) {
          const cx = Math.round(ax + ((bx - ax) * q) / steps), cy = Math.round(ay + ((by - ay) * q) / steps);
          if (isBlocked(cx, cy)) return false;
        }
        return true;
      };
      for (let k = 0; k < L;) {
        // 見通せる一番先の点（倍々に伸ばしてから二分探索）
        let ok = k + 1, step = 2;
        while (k + step <= L && see(k, k + step)) { ok = k + step; step *= 2; }
        let ng = Math.min(L + 1, k + step);
        while (ng - ok > 1) { const mid = (ok + ng) >> 1; if (see(k, mid)) ok = mid; else ng = mid; }
        out.push(cells[ok]);
        k = ok;
      }
      return out;
    }

    for (const e of edges) {
      e.pts = clear(xs[e.i], ys[e.i], xs[e.j], ys[e.j], e) ? [[xs[e.i], ys[e.i]], [xs[e.j], ys[e.j]]] : route(e);
    }
    return edges;
  }

  // 見た目が変わらない範囲で点を間引く（Ramer–Douglas–Peucker）
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const [ax, ay] = pts[s], [bx, by] = pts[e];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let md = -1, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
        if (d > md) { md = d; mi = i; }
      }
      if (md > tol) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  /*
   * words.json の中身から layout.json の中身を作る。
   * { sig, pos: [[x, y], …]（単語の並び順）, tags: [タグ名, …], edges: [[濃さ, [タグ番号…], [x0, y0, x1, y1, …]], …] }
   */
  const TIGHT_MIN = 3, TIGHT_MAX = 12, TIGHT_RATIO = 0.7;
  function compute(raw) {
    const data = linkData(raw);
    const nodes = data.list.map((w) => ({ id: w.id, bw: boxWidth(w.word), bh: BOX_H }));
    const tags = [...data.groups.keys()];
    const groups = tags.map((t) => data.groups.get(t));
    const tagIndex = groups.map((g, i) => i).filter((i) => groups[i].length > 1);
    const linked = tagIndex.map((i) => groups[i]);
    // そのタグと同じ名前の単語
    const hubs = tagIndex.map((i) => groups[i].filter((w) => data.list[w].selfTag === tags[i]));
    // 閉じた語群：TIGHT_MIN〜TIGHT_MAX 語のタグで、どの単語もつながる相手の TIGHT_RATIO 以上がそのタグの中にある
    const neighbors = nodes.map(() => new Set());
    for (const g of linked) for (const i of g) for (const j of g) if (i !== j) neighbors[i].add(j);
    const tight = linked.map((g) => {
      if (g.length < TIGHT_MIN || g.length > TIGHT_MAX) return false;
      const set = new Set(g);
      return g.every((i) => { let k = 0; for (const j of neighbors[i]) if (set.has(j)) k++; return k >= neighbors[i].size * TIGHT_RATIO; });
    });
    const { xs, ys, center } = place(nodes, linked, hubs, tight);
    const edges = connect(nodes, linked, xs, ys, hubs, center);
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      sig: signature(data),
      pos: nodes.map((_, i) => [r1(xs[i]), r1(ys[i])]),
      tags,
      // 線：[濃さ, [タグ番号…], 点列, （単語本体と直接結ぶ線なら 1）]
      edges: edges.map((e) => {
        const row = [Math.round(e.a * 100) / 100, e.tags.map((t) => tagIndex[t]), simplify(e.pts, 0.8).flatMap((p) => [r1(p[0]), r1(p[1])])];
        if (e.direct) row.push(1);
        return row;
      }),
    };
  }

  const Layout = { VERSION, linkData, signature, boxWidth, BOX_H, PAREN, compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = Layout;
  else root.Layout = Layout;
})(this);
