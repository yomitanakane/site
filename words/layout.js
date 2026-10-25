/*
 * マップの配置と線の計算（登録ソフトで計算して layout.json に保存し、サイトはそれを読むだけにする）
 * layout.json が古い・無い場合だけ、サイトでも同じ計算を行う。
 */
(function (root) {
  'use strict';

  const K = root.Kana || (typeof require === 'function' ? require('./kana.js') : null);

  // 計算方法を変えたら上げる（保存済みの layout.json を使わなくなる）
  const VERSION = 'L5';

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
    const tagByNorm = new Map();
    for (const t of groups.keys()) tagByNorm.set(K.norm(t) || t, t);
    list.forEach((w, i) => {
      w.selfTag = tagByNorm.get(K.norm(w.word) || w.word) || null;
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

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 単語同士の最低限の余白（左右・上下それぞれ片側ぶん）
  const SPACE_X = 30, SPACE_Y = 24;
  // 単語の枠の面積の合計が、配置する円の面積に占める割合（小さいほどゆったり。単語数によらず一定）
  const OCCUPANCY = 0.1;
  // 線をよけるために単語をずらす最大距離
  const MOVE_MAX = 300;
  const cellKey = (gx, gy) => (gx + 50000) * 100000 + (gy + 50000);
  /*
   * タグの結びつきの強さ。単語の少ないタグほど強い（2語・3〜4語のタグは特に強く、5語からは弱まっていく）。
   * 少ないタグ同士でつながった単語ほど近くに集まる。
   */
  const strength = (m) => (m <= 2 ? 1.5 : m <= 4 ? 1.1 : 1 / Math.max(1, m - 3));

  // 単語そのものがタグ名になっている時、そのタグの単語を単語本体（中心の単語）へ引き寄せる強さ
  const HUB_PULL = 0.5;

  /*
   * タグを共有する単語が近くに集まるよう配置（データが同じなら毎回同じ配置）
   * hubs[gi]: そのタグと同じ名前の単語（無ければ空）
   */
  function place(nodes, groups, hubs) {
    const n = nodes.length;
    const xs = new Float64Array(n), ys = new Float64Array(n);
    if (!n) return { xs, ys };
    const rnd = mulberry32(hashStr(nodes.map((d) => d.id).join('\u0001')));
    const gs = groups.map((g) => strength(g.length));

    // 半幅・半高（枠同士の最低限の余白を含む）
    const hw = new Float64Array(n), hh = new Float64Array(n);
    let area = 0;
    nodes.forEach((d, i) => { hw[i] = d.bw / 2 + SPACE_X; hh[i] = d.bh / 2 + SPACE_Y; area += (hw[i] * 2 + 40) * (hh[i] * 2 + 40); });
    const R = Math.sqrt(area / Math.PI) * 1.2;
    const disc = (r) => { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r; return [Math.cos(a) * d, Math.sin(a) * d]; };
    // 最初の位置：属するタグの中心の、結びつきの強さで重み付けした平均
    const centers = groups.map(() => disc(R));
    const acc = new Float64Array(n * 3);
    groups.forEach((g, gi) => g.forEach((i) => {
      acc[i * 3] += centers[gi][0] * gs[gi]; acc[i * 3 + 1] += centers[gi][1] * gs[gi]; acc[i * 3 + 2] += gs[gi];
    }));
    for (let i = 0; i < n; i++) {
      const c = acc[i * 3 + 2];
      if (c) { const j = disc(R * 0.3); xs[i] = acc[i * 3] / c + j[0]; ys[i] = acc[i * 3 + 1] / c + j[1]; }
      else { const p = disc(R); xs[i] = p[0]; ys[i] = p[1]; }
    }
    // 各タグの単語が収まる半径の外側にいる時だけ引き寄せる。少ないタグほど強く、小さくまとめる
    // （特に強いタグは半径 0 ＝常に中心へ引き寄せる。重なりは後の配置で解消される）
    const GAP = 44;
    const areaOf = (i) => (hw[i] * 2 + GAP) * (hh[i] * 2 + GAP);
    const gr = groups.map((g, gi) => Math.sqrt(g.reduce((s, i) => s + areaOf(i), 0) / Math.PI) * Math.max(0, 0.4 + 1.1 * (1 - gs[gi])));
    const pull = gs.map((s) => 1.2 * s);
    let total = 0;
    for (let i = 0; i < n; i++) total += areaOf(i);
    const R0 = Math.sqrt(total / Math.PI) * 0.8;

    const ITER = n > 1500 ? 140 : 220;
    const PC = 240, PUSH = 200;
    const dens = new Map();
    const dx = new Float64Array(n), dy = new Float64Array(n);
    for (let it = 0; it < ITER; it++) {
      const temp = 1 - it / ITER;
      dx.fill(0); dy.fill(0);
      groups.forEach((g, gi) => {
        let cx = 0, cy = 0;
        for (const i of g) { cx += xs[i]; cy += ys[i]; }
        cx /= g.length; cy /= g.length;
        const r = gr[gi], k = pull[gi];
        for (const i of g) {
          const ddx = cx - xs[i], ddy = cy - ys[i], d = Math.hypot(ddx, ddy);
          if (d > r) { const f = (k * (d - r)) / d; dx[i] += ddx * f; dy[i] += ddy * f; }
        }
        // 単語そのものがタグになっている場合は、そのタグの単語を単語本体のすぐ近くへ
        for (const h of hubs[gi]) {
          for (const i of g) {
            if (i === h) continue;
            const ddx = xs[h] - xs[i], ddy = ys[h] - ys[i];
            dx[i] += ddx * HUB_PULL; dy[i] += ddy * HUB_PULL;
          }
        }
      });
      // 混み合っている所から空いている所へ押し出す（密度の勾配）
      dens.clear();
      for (let i = 0; i < n; i++) {
        const key = cellKey(Math.floor(xs[i] / PC), Math.floor(ys[i] / PC));
        dens.set(key, (dens.get(key) || 0) + areaOf(i));
      }
      const pr = (gx, gy) => Math.max(0, (dens.get(cellKey(gx, gy)) || 0) / (PC * PC) - 0.7);
      for (let i = 0; i < n; i++) {
        const fx = xs[i] / PC - 0.5, fy = ys[i] / PC - 0.5;
        const gx = Math.floor(fx), gy = Math.floor(fy), tx = fx - gx, ty = fy - gy;
        // 周囲4セルの圧力を双線形補間した勾配
        const p00 = pr(gx, gy), p10 = pr(gx + 1, gy), p01 = pr(gx, gy + 1), p11 = pr(gx + 1, gy + 1);
        dx[i] -= ((p10 - p00) * (1 - ty) + (p11 - p01) * ty) * PUSH;
        dy[i] -= ((p01 - p00) * (1 - tx) + (p11 - p10) * tx) * PUSH;
      }
      const maxStep = 40 * temp + 3;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(xs[i], ys[i]);
        if (d > R0) { const f = (0.05 * (d - R0)) / d; dx[i] -= xs[i] * f; dy[i] -= ys[i] * f; }
        const l = Math.hypot(dx[i], dy[i]);
        const s = l > maxStep ? maxStep / l : 1;
        xs[i] += dx[i] * s; ys[i] += dy[i] * s;
      }
    }

    // 単語が増えても密度が変わらないよう、中心からの距離を「単語1つあたりの面積が一定」の円盤に並べ直す
    // （中心から見た方向と、中心からの近さの順番はそのまま）
    {
      let cx = 0, cy = 0, box = 0;
      for (let i = 0; i < n; i++) { cx += xs[i]; cy += ys[i]; box += nodes[i].bw * nodes[i].bh; }
      cx /= n; cy /= n; box /= n;
      const Rd = Math.sqrt((n * box) / OCCUPANCY / Math.PI);
      const byDist = Array.from({ length: n }, (_, i) => i)
        .sort((p, q) => Math.hypot(xs[p] - cx, ys[p] - cy) - Math.hypot(xs[q] - cx, ys[q] - cy));
      byDist.forEach((i, k) => {
        const a = Math.atan2(ys[i] - cy, xs[i] - cx), r = Rd * Math.sqrt((k + 0.5) / n);
        xs[i] = Math.cos(a) * r; ys[i] = Math.sin(a) * r;
      });
    }

    // 中心に近い順に、元の位置から最も近い「重ならない場所」へ置いていく
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => xs[p] ** 2 + ys[p] ** 2 - (xs[q] ** 2 + ys[q] ** 2));
    const CS = 120;
    const placed = new Map();
    const cellsOf = (i, x, y, fn) => {
      const x0 = Math.floor((x - hw[i]) / CS), x1 = Math.floor((x + hw[i]) / CS);
      const y0 = Math.floor((y - hh[i]) / CS), y1 = Math.floor((y + hh[i]) / CS);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) if (fn(cellKey(gx, gy)) === false) return false;
      return true;
    };
    const free = (i, x, y) => cellsOf(i, x, y, (key) => {
      const c = placed.get(key);
      if (c) for (const j of c) if (Math.abs(x - xs[j]) < hw[i] + hw[j] && Math.abs(y - ys[j]) < hh[i] + hh[j]) return false;
    });
    // 単語そのものがタグになっている場合、そのタグの単語は、単語本体を置いた直後にそのすぐ周りへ置く
    // （複数の単語本体に属する時は、単語の少ないタグの単語本体を優先）
    const hubOf = new Int32Array(n).fill(-1), hubSize = new Float64Array(n).fill(Infinity);
    groups.forEach((g, gi) => {
      for (const h of hubs[gi]) for (const i of g) if (i !== h && g.length < hubSize[i]) { hubOf[i] = h; hubSize[i] = g.length; }
    });
    const members = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) if (hubOf[i] >= 0) members[hubOf[i]].push(i);
    const done = new Uint8Array(n);
    function put(i, tx, ty) {
      if (done[i]) return;
      done[i] = 1;
      let px = tx, py = ty;
      if (!free(i, tx, ty)) {
        search: for (let r = 8; r < 20000; r += 8 + r * 0.04) {
          const k = Math.min(48, Math.max(8, Math.ceil((2 * Math.PI * r) / 10)));
          const a0 = rnd() * Math.PI * 2;
          for (let s = 0; s < k; s++) {
            const a = a0 + (s / k) * Math.PI * 2;
            const x = tx + Math.cos(a) * r, y = ty + Math.sin(a) * r;
            if (free(i, x, y)) { px = x; py = y; break search; }
          }
        }
      }
      xs[i] = px; ys[i] = py;
      cellsOf(i, px, py, (key) => { let c = placed.get(key); if (!c) placed.set(key, (c = [])); c.push(i); });
      for (const j of members[i]) put(j, px, py);
    }
    for (const i of order) {
      const h = hubOf[i];
      if (h >= 0) put(h, xs[h], ys[h]); // 単語本体を先に置く（その周りに i も置かれる）
      put(i, xs[i], ys[i]);
    }
    return { xs, ys };
  }

  /* ================= 線 ================= */

  /*
   * 線の濃さ：今あるタグのうち一番単語の少ないタグを最大 A_MAX、一番多いタグを最小 A_MIN とし、
   * その間を単語数（対数）の割合でグラデーションにする。GAMMA が大きいほど濃淡の差がはっきりする。
   */
  const A_MAX = 0.4, A_MIN = 0.07, GAMMA = 2;
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
  function connect(nodes, groups, xs, ys, hubs) {
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
    const addPair = (u, v, a, ti) => {
      const i = Math.min(u, v), j = Math.max(u, v);
      const e = pairs.get(i * n + j);
      if (!e) pairs.set(i * n + j, { i, j, a, tags: [ti] });
      else { if (a > e.a) e.a = a; if (!e.tags.includes(ti)) e.tags.push(ti); }
    };
    groups.forEach((ids, ti) => {
      const m = ids.length;
      if (m < 2) return;
      const a = alphaFor(m);
      // タグと同じ名前の単語（単語本体）があれば、そのタグの単語はすべて単語本体と直接結ぶ
      if (hubs[ti].length) {
        for (const h of hubs[ti]) for (const v of ids) if (v !== h) addPair(h, v, a, ti);
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
          if (s) for (const o of s) if (o !== e.i && o !== e.j && hitBox(o, a, b, c, d)) bad.add(o);
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
    function oneBend(e, ax, ay, bx, by) {
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (let d = 24; d < Math.max(300, len * 0.7); d += 24) {
        for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          for (const sgn of [1, -1]) {
            const px = ax + (bx - ax) * f + nx * d * sgn, py = ay + (by - ay) * f + ny * d * sgn;
            if (clear(ax, ay, px, py, e) && clear(px, py, bx, by, e)) return [[px, py]];
          }
        }
      }
      return null;
    }
    // 周囲の単語の角を経由点にした最短経路
    function aroundBoxes(e, ax, ay, bx, by, off = 4, limit = 16) {
      const pad = 200;
      const l = Math.min(ax, bx) - pad, r = Math.max(ax, bx) + pad, t = Math.min(ay, by) - pad, btm = Math.max(ay, by) + pad;
      const obs = new Set();
      for (let gx = Math.floor(l / GC); gx <= Math.floor(r / GC); gx++)
        for (let gy = Math.floor(t / GC); gy <= Math.floor(btm / GC); gy++) {
          const s = boxG.get(cellKey(gx, gy));
          if (s) for (const o of s) if (o !== e.i && o !== e.j) obs.add(o);
        }
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const distTo = (o) => Math.abs((bx - ax) * (ay - ys[o]) - (ax - xs[o]) * (by - ay)) / len;
      const near = [...obs].sort((p, q) => distTo(p) - distTo(q) || p - q).slice(0, limit);
      const inside = (x, y) => {
        let found = false;
        boxCells(e.i, x, y, (key) => {
          const s = boxG.get(key);
          if (s) for (const o of s) if (Math.abs(x - xs[o]) <= LW[o] && Math.abs(y - ys[o]) <= LH[o]) { found = true; return false; }
        });
        return found;
      };
      const pts = [[ax, ay], [bx, by]];
      for (const o of near) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = xs[o] + sx * (LW[o] + off), y = ys[o] + sy * (LH[o] + off);
        if (!inside(x, y)) pts.push([x, y]);
      }
      const m = pts.length, dist = new Float64Array(m).fill(Infinity), prev = new Int32Array(m).fill(-1), done = new Uint8Array(m);
      dist[0] = 0;
      for (;;) {
        let u = -1;
        for (let i = 0; i < m; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || u === 1) break;
        done[u] = 1;
        for (let v = 0; v < m; v++) {
          if (done[v]) continue;
          const d = dist[u] + Math.hypot(pts[v][0] - pts[u][0], pts[v][1] - pts[u][1]);
          if (d < dist[v] && clear(pts[u][0], pts[u][1], pts[v][0], pts[v][1], e)) { dist[v] = d; prev[v] = u; }
        }
      }
      if (prev[1] < 0) return null;
      const path = [];
      for (let v = prev[1]; v > 0; v = prev[v]) path.unshift(pts[v]);
      return path;
    }
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
        for (const sg of [1, -1]) yield sampleBezier(A, at(1 / 3, d * sg), at(2 / 3, -d * sg), B);
      }
    }
    const GENTLE = 40; // これより急なカーブは使わない（px）

    // 単語に掛かる線の道筋を決める
    function route(e) {
      const A = [xs[e.i], ys[e.i]], B = [xs[e.j], ys[e.j]];
      // まずはゆるやかな弧で単語を避ける
      for (const c of arcs(A, B)) if (minRadius(c) >= GENTLE && pathClear(c, e)) return c;
      // 弧で避けられなければ経由点を通る曲線。なるべくゆるやかなものを選ぶ
      let poly = null;
      function* polys() {
        for (const off of [40, 24]) { const v = aroundBoxes(e, A[0], A[1], B[0], B[1], off); if (v) yield [A, ...v, B]; }
        const v = oneBend(e, A[0], A[1], B[0], B[1]) || aroundBoxes(e, A[0], A[1], B[0], B[1]) || [];
        poly = [A, ...v, B];
        yield poly;
      }
      let best = null, bestR = -1;
      for (const p of polys()) {
        for (const c of [spline(p), rounded(p, 120), rounded(p, 80), rounded(p, 40)]) {
          if (!pathClear(c, e)) continue;
          const r = minRadius(c);
          if (r > bestR) { bestR = r; best = c; }
          if (r >= GENTLE) return best;
        }
      }
      if (best) return best;
      // 見つからない時だけ、周りの単語をより多く考慮して探し直す
      const wide = aroundBoxes(e, A[0], A[1], B[0], B[1], 4, 48);
      if (wide) {
        const p = [A, ...wide, B];
        for (const c of [spline(p), rounded(p, 40), rounded(p, 20), p]) if (pathClear(c, e)) return c;
      }
      return poly;
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
  function compute(raw) {
    const data = linkData(raw);
    const nodes = data.list.map((w) => ({ id: w.id, bw: boxWidth(w.word), bh: BOX_H }));
    const tags = [...data.groups.keys()];
    const groups = tags.map((t) => data.groups.get(t));
    const tagIndex = groups.map((g, i) => i).filter((i) => groups[i].length > 1);
    const linked = tagIndex.map((i) => groups[i]);
    // そのタグと同じ名前の単語
    const hubs = tagIndex.map((i) => groups[i].filter((w) => data.list[w].selfTag === tags[i]));
    const { xs, ys } = place(nodes, linked, hubs);
    const edges = connect(nodes, linked, xs, ys, hubs);
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      sig: signature(data),
      pos: nodes.map((_, i) => [r1(xs[i]), r1(ys[i])]),
      tags,
      edges: edges.map((e) => [
        Math.round(e.a * 100) / 100,
        e.tags.map((t) => tagIndex[t]),
        simplify(e.pts, 0.4).flatMap((p) => [r1(p[0]), r1(p[1])]),
      ]),
    };
  }

  const Layout = { VERSION, linkData, signature, boxWidth, BOX_H, PAREN, compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = Layout;
  else root.Layout = Layout;
})(this);
