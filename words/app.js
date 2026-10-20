(() => {
  'use strict';

  const K = window.Kana;
  const BASE = (() => {
    const p = location.pathname.replace(/index\.html$/, '').replace(/list\/?$/, '');
    return p.endsWith('/') ? p : p + '/';
  })();
  const isListPath = () => /\/list\/?(index\.html)?$/.test(location.pathname);
  const collator = new Intl.Collator('ja');
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  document.getElementById('app').innerHTML = `
    <div id="map"><canvas id="lines"></canvas><div id="world"></div></div>
    <div id="search" class="ui"><input id="q" type="text" placeholder="SEARCH" autocomplete="off" spellcheck="false" enterkeyhint="go"><div id="cands"></div></div>
    <div id="topright" class="ui"><button id="warp">WARP</button><button id="toList">LIST</button></div>
    <a id="credit" class="ui" href="https://yomitanakane.com/">CREDIT</a>
    <div id="list" hidden>
      <div class="bar"><div class="bar-in">
        <div class="controls">
          <div class="group"><span class="lbl">SORT</span><div class="seg"><button data-sort="kana">あいう</button><button data-sort="mora">モーラ</button><button data-sort="link">タグリンク数</button></div></div>
          <div class="group"><span class="lbl">FILTER</span>
            <label class="sel"><span>モーラ</span><select id="fMora"></select></label>
            <div class="sel"><span>頭文字</span><button id="fInit" class="pick">—</button><div id="kana" class="kana" hidden></div></div>
            <button id="fTag" class="chip" hidden></button>
          </div>
        </div>
        <button id="return">RETURN</button>
      </div></div>
      <div id="grid"></div>
    </div>
    <div id="detail" hidden>
      <div class="backdrop"></div>
      <div class="wrap"><div class="panel"><button class="gsearch">このワードで検索</button><div class="scroll"><div class="body"></div></div></div></div>
    </div>
    <div id="ghost" hidden></div>`;

  /* ================= データ ================= */

  let words = [];
  const byId = new Map();
  const tagMap = new Map();
  const linkGroups = new Map(); // タグ → 結ぶ単語（タグが付いた単語＋タグ名と同じ単語）

  const toArr = (v) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,、]/) : [])
      .map((s) => String(s).trim())
      .filter(Boolean);

  // 頭文字の五十音表（5列。空白は空きマス）
  const KANA_TABLE = ['あいうえお', 'かきくけこ', 'がぎぐげご', 'さしすせそ', 'ざじずぜぞ', 'たちつてと', 'だぢづでど', 'なにぬねの',
    'はひふへほ', 'ばびぶべぼ', 'ぱぴぷぺぽ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ   を', 'ん    ', 'ゔ    '];
  const SMALL_TO_BIG = { ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ', っ: 'つ', ゕ: 'か', ゖ: 'け', ゐ: 'い', ゑ: 'え' };

  function prepare(raw) {
    const seen = new Set();
    for (const r of raw) {
      if (!r || !r.word) continue;
      let id = String(r.id || r.word);
      while (seen.has(id)) id += '_';
      seen.add(id);
      const w = {
        id,
        word: String(r.word).trim(),
        reading: String(r.reading || '').trim(),
        variants: toArr(r.variants),
        meaning: String(r.meaning || '').trim(),
        links: String(r.links || '').trim(),
        tags: [...new Set(toArr(r.tags))],
      };
      w.hira = K.toHira(w.reading || w.word);
      w.mora = K.mora(w.reading);
      w.initial = K.initial(w.reading);
      w.ini = SMALL_TO_BIG[w.initial] || w.initial;
      w.vlen = K.visualLength(w.word);
      w.keys = [w.word, w.reading, ...w.variants];
      words.push(w);
      byId.set(id, w);
    }
    for (const w of words) {
      for (const t of w.tags) {
        if (!tagMap.has(t)) tagMap.set(t, []);
        tagMap.get(t).push(w);
      }
    }
    // 単語そのものがタグ名として使われている場合（表記揺れも同一とみなす）
    const tagByNorm = new Map();
    for (const t of tagMap.keys()) tagByNorm.set(K.norm(t) || t, t);
    for (const w of words) w.selfTag = tagByNorm.get(K.norm(w.word) || w.word) || null;
    for (const [t, ws] of tagMap) linkGroups.set(t, [...ws]);
    for (const w of words) if (w.selfTag && !w.tags.includes(w.selfTag)) linkGroups.get(w.selfTag).push(w);
    // タグにより結びついた単語の数
    const groupsOf = new Map(words.map((w) => [w, []]));
    for (const g of linkGroups.values()) for (const w of g) groupsOf.get(w).push(g);
    for (const w of words) {
      const s = new Set();
      for (const g of groupsOf.get(w)) for (const o of g) s.add(o);
      s.delete(w);
      w.linkCount = s.size;
    }
  }

  const kanaCmp = (a, b) => collator.compare(a.hira, b.hira) || collator.compare(a.word, b.word);
  // タグの単語一覧（そのタグ名と同じ単語は常に先頭）
  function membersOf(tag) {
    const heads = words.filter((w) => w.selfTag === tag);
    return [...heads.sort(kanaCmp), ...(tagMap.get(tag) || []).filter((w) => w.selfTag !== tag).sort(kanaCmp)];
  }

  function cellFor(w, onClick) {
    const c = el('div', 'cell');
    c.append(el('span', null, w.word));
    c.addEventListener('click', () => onClick(c));
    return c;
  }
  // 枠に収まらない単語だけ文字を小さくし、それでも収まらなければ折り返す
  function fitCells(root) {
    const cells = [...root.querySelectorAll('.cell')];
    if (!cells.length) return;
    cells.forEach((c) => c.classList.remove('s-m', 's-s'));
    const cs = getComputedStyle(cells[0]);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2;
    const over = (list) => list.filter((c) => c.firstChild.offsetWidth > c.clientWidth - pad + 2);
    const m = over(cells);
    m.forEach((c) => c.classList.add('s-m'));
    over(m).forEach((c) => { c.classList.remove('s-m'); c.classList.add('s-s'); });
  }

  function searchWords(text, limit) {
    const nq = K.norm(text);
    if (!nq) return [];
    const res = [];
    for (const w of words) {
      // 名前（言葉・読み・別表記）→ タグ → 説明文 の順に並べる
      let s = K.matchScore(nq, w.keys, false);
      if (s === Infinity) { const t = K.matchScore(nq, w.tags, false); if (t < Infinity) s = 10 + t; }
      if (s === Infinity && w.meaning && K.norm(w.meaning).includes(nq)) s = 20;
      if (s < Infinity) res.push([s, w]);
    }
    res.sort((a, b) => a[0] - b[0] || a[1].hira.length - b[1].hira.length || kanaCmp(a[1], b[1]));
    return res.slice(0, limit).map((r) => r[1]);
  }

  /* ================= マップ ================= */

  const mapEl = $('#map');
  const world = $('#world');
  const canvas = $('#lines');
  const ctx = canvas.getContext('2d');
  let nodes = [];
  const nodeById = new Map();
  let buckets = [];
  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const Z_START = 1.2; // 最初の拡大率
  const cam = { x: 0, y: 0, z: Z_START }; // z: 拡大率
  let W = innerWidth, H = innerHeight, dpr = 1;

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const cellKey = (gx, gy) => (gx + 50000) * 100000 + (gy + 50000);

  async function buildMap() {
    world.textContent = '';
    nodes = words.map((w) => {
      const e = el('div', 'node', w.word);
      e.dataset.id = w.id;
      world.appendChild(e);
      const n = { w, el: e, x: 0, y: 0, bw: 0, bh: 0 };
      nodeById.set(w.id, n);
      return n;
    });
    if (document.fonts && document.fonts.load) {
      // 使う文字のフォントを読み込んでから寸法を測る
      const chars = [...new Set(words.map((w) => w.word).join(''))].join('');
      await Promise.race([
        document.fonts.load('400 14px "Noto Sans JP"', chars).catch(() => {}),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    }
    for (const n of nodes) { n.bw = n.el.offsetWidth; n.bh = n.el.offsetHeight; }
    layout();
    buildEdges();
    for (const n of nodes) {
      n.el.style.transform = `translate(${Math.round(n.x - n.bw / 2)}px, ${Math.round(n.y - n.bh / 2)}px)`;
    }
    if (nodes.length) {
      bounds.minX = Math.min(...nodes.map((n) => n.x - n.bw / 2));
      bounds.maxX = Math.max(...nodes.map((n) => n.x + n.bw / 2));
      bounds.minY = Math.min(...nodes.map((n) => n.y - n.bh / 2));
      bounds.maxY = Math.max(...nodes.map((n) => n.y + n.bh / 2));
      const start = nodes[Math.floor(Math.random() * nodes.length)];
      cam.x = start.x; cam.y = start.y;
      cam.z = Math.max(zMin(), Z_START);
      clampPt(cam);
    }
    paint();
  }

  // タグを共有する単語が近くに集まるよう配置（データが同じなら毎回同じ配置）
  function layout() {
    const n = nodes.length;
    if (!n) return;
    const rnd = mulberry32(hashStr(nodes.map((d) => d.w.id).join('\u0001')));
    const index = new Map(nodes.map((d, i) => [d.w.id, i]));
    const groups = [];
    for (const ws of linkGroups.values()) if (ws.length > 1) groups.push(ws.map((w) => index.get(w.id)));

    const xs = new Float64Array(n), ys = new Float64Array(n);
    // 半幅・半高（枠同士の最低限の余白を含む）
    const hw = new Float64Array(n), hh = new Float64Array(n);
    let area = 0;
    nodes.forEach((d, i) => { hw[i] = d.bw / 2 + 18; hh[i] = d.bh / 2 + 15; area += (hw[i] * 2 + 40) * (hh[i] * 2 + 40); });
    const R = Math.sqrt(area / Math.PI) * 1.2;
    const disc = (r) => { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r; return [Math.cos(a) * d, Math.sin(a) * d]; };
    const centers = groups.map(() => disc(R));
    const acc = new Float64Array(n * 3);
    groups.forEach((g, gi) => g.forEach((i) => { acc[i * 3] += centers[gi][0]; acc[i * 3 + 1] += centers[gi][1]; acc[i * 3 + 2]++; }));
    for (let i = 0; i < n; i++) {
      const c = acc[i * 3 + 2];
      if (c) { const j = disc(R * 0.3); xs[i] = acc[i * 3] / c + j[0]; ys[i] = acc[i * 3 + 1] / c + j[1]; }
      else { const p = disc(R); xs[i] = p[0]; ys[i] = p[1]; }
    }
    // 各タグの単語が収まる半径の外側にいる時だけ引き寄せる（詰め込みすぎない）
    const GAP = 44;
    const areaOf = (i) => (hw[i] * 2 + GAP) * (hh[i] * 2 + GAP);
    const gr = groups.map((g) => Math.sqrt(g.reduce((s, i) => s + areaOf(i), 0) / Math.PI) * 1.5);
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
        const r = gr[gi];
        for (const i of g) {
          const ddx = cx - xs[i], ddy = cy - ys[i], d = Math.hypot(ddx, ddy);
          if (d > r) { const f = (0.05 * (d - r)) / d; dx[i] += ddx * f; dy[i] += ddy * f; }
        }
      });
      // 混み合っている所から空いている所へ押し出す（密度の勾配）
      dens.clear();
      for (let i = 0; i < n; i++) {
        const k = cellKey(Math.floor(xs[i] / PC), Math.floor(ys[i] / PC));
        dens.set(k, (dens.get(k) || 0) + areaOf(i));
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
    const free = (i, x, y) => cellsOf(i, x, y, (k) => {
      const c = placed.get(k);
      if (c) for (const j of c) if (Math.abs(x - xs[j]) < hw[i] + hw[j] && Math.abs(y - ys[j]) < hh[i] + hh[j]) return false;
    });
    for (const i of order) {
      const tx = xs[i], ty = ys[i];
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
      cellsOf(i, px, py, (k) => { let c = placed.get(k); if (!c) placed.set(k, (c = [])); c.push(i); });
    }
    nodes.forEach((d, i) => { d.x = xs[i]; d.y = ys[i]; });
  }

  // 登録数の少ないタグほど濃く
  const alphaFor = (m) => Math.max(0.05, 0.4 / (1 + 1.3 * Math.log2(m / 2)));

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

  /*
   * タグごとに単語を木で結び、線の上に別の単語が乗らないようにする。
   * 1. 近い単語同士の候補線から、単語に掛からない線を優先して木を作る
   * 2. それでも線に掛かる単語は、近くの空いている場所へずらす
   * 3. ずらせなかった所は、線を1回折り曲げて単語を避ける
   */
  function buildEdges() {
    const n = nodes.length;
    buckets = [];
    if (!n) return;
    const t0 = performance.now();
    const xs = nodes.map((d) => d.x), ys = nodes.map((d) => d.y);
    const HW = nodes.map((d) => d.bw / 2 + 18), HH = nodes.map((d) => d.bh / 2 + 15); // 単語同士の間隔
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
    function hits(x1, y1, x2, y2, i, j, limit) {
      let c = 0;
      const seen = new Set();
      walkCells(x1, y1, x2, y2, (key) => {
        const s = boxG.get(key);
        if (s) for (const b of s) {
          if (b === i || b === j || seen.has(b)) continue;
          seen.add(b);
          if (hitBox(b, x1, y1, x2, y2) && ++c >= limit) return false;
        }
      });
      return c;
    }
    const addBox = (i) => boxCells(i, xs[i], ys[i], (key) => put(boxG, key, i));
    const dropBox = (i) => boxCells(i, xs[i], ys[i], (key) => take(boxG, key, i));
    for (let i = 0; i < n; i++) addBox(i);

    // 1. 候補線（各単語から近い同タグの単語へ＋距離だけの最小全域木）から、掛かる単語が少ない線を優先して木を作る
    const index = new Map(nodes.map((d, i) => [d.w.id, i]));
    const pairs = new Map();
    for (const ws of linkGroups.values()) {
      const m = ws.length;
      if (m < 2) continue;
      const a = alphaFor(m);
      const ids = ws.map((w) => index.get(w.id));
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
        const K = Math.min(6, m - 1);
        for (let u = 0; u < m; u++) {
          const near = [];
          for (let v = 0; v < m; v++) if (v !== u) near.push([d2(u, v), v]);
          near.sort((p, q) => p[0] - q[0]);
          for (let k = 0; k < K; k++) addCand(u, near[k][1]);
        }
      }
      // 掛かる単語1つにつき距離 600px 分の重み
      const list = [...cand.values()].map(([u, v]) => {
        const i = ids[u], j = ids[v];
        return [Math.sqrt(d2(u, v)) + 600 * hits(xs[i], ys[i], xs[j], ys[j], i, j, 3), u, v];
      }).sort((p, q) => p[0] - q[0]);
      const parent = Array.from({ length: m }, (_, i) => i);
      const root = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
      for (const [, u, v] of list) {
        const ru = root(u), rv = root(v);
        if (ru === rv) continue;
        parent[ru] = rv;
        const i = Math.min(ids[u], ids[v]), j = Math.max(ids[u], ids[v]);
        const e = pairs.get(i * n + j);
        if (!e) pairs.set(i * n + j, { i, j, a });
        else if (a > e.a) e.a = a;
      }
    }
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

    for (let round = 0; round < 6 && performance.now() - t0 < 1500; round++) {
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
        if (performance.now() - t0 > 1500) break;
        dropBox(b);
        inc[b].forEach(dropSeg);
        const tx = xs[b], ty = ys[b];
        const a0 = (b * 2.399) % (Math.PI * 2);
        search: for (let r = 10; r < 2500; r += 10 + r * 0.06) {
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
    nodes.forEach((d, i) => { d.x = xs[i]; d.y = ys[i]; });

    // 3. 残った線は、単語に掛からない折れ点を探して折り曲げる
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
    function aroundBoxes(e, ax, ay, bx, by, off = 4) {
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
      const near = [...obs].sort((p, q) => distTo(p) - distTo(q)).slice(0, 36);
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
    for (const e of edges) {
      const ax = xs[e.i], ay = ys[e.i], bx = xs[e.j], by = ys[e.j];
      if (clear(ax, ay, bx, by, e)) continue;
      e.via = oneBend(e, ax, ay, bx, by) || (performance.now() - t0 < 3000 ? aroundBoxes(e, ax, ay, bx, by) : null);
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
        const p = pts[k], q = pts[k - 1], n = pts[k + 1];
        const d1 = Math.hypot(q[0] - p[0], q[1] - p[1]), d2 = Math.hypot(n[0] - p[0], n[1] - p[1]);
        const rr = Math.min(r, d1 * 0.45, d2 * 0.45);
        const a = [p[0] + (q[0] - p[0]) * rr / d1, p[1] + (q[1] - p[1]) * rr / d1];
        const b = [p[0] + (n[0] - p[0]) * rr / d2, p[1] + (n[1] - p[1]) * rr / d2];
        out.push(a);
        for (let i = 1; i <= 10; i++) out.push(bezier(a, p, p, b, i / 10));
      }
      out.push(pts[pts.length - 1]);
      return out;
    }
    function bezier(a, b, c, d, t) {
      const u = 1 - t;
      return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
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
      const n = Math.max(16, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
      const out = [];
      for (let i = 0; i <= n; i++) out.push(bezier(a, c1, c2, b, i / n));
      return out;
    };
    // 両端を結ぶゆるやかな弧（ふくらみの小さい順に試す）
    function* arcs(A, B) {
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      const ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len, nx = -uy, ny = ux;
      const at = (f, d) => [A[0] + ux * len * f + nx * d, A[1] + uy * len * f + ny * d];
      for (const k of [0.1, 0.15, 0.22, 0.3, 0.4, 0.5, 0.62, 0.75, 0.9, 1.1]) {
        const d = Math.max(24, k * len);
        for (const sg of [1, -1]) {
          // 対称な弧と、片側に寄った弧
          for (const [f1, f2, r1, r2] of [[1 / 3, 2 / 3, 1, 1], [0.2, 0.55, 1, 1], [0.45, 0.8, 1, 1], [0.25, 0.75, 1, 0.4], [0.25, 0.75, 0.4, 1]]) {
            yield sampleBezier(A, at(f1, d * sg * r1), at(f2, d * sg * r2), B);
          }
        }
      }
      // ゆるやかな S 字
      for (const k of [0.15, 0.25, 0.35, 0.5]) {
        const d = Math.max(24, k * len);
        for (const sg of [1, -1]) yield sampleBezier(A, at(1 / 3, d * sg), at(2 / 3, -d * sg), B);
      }
    }
    const GENTLE = 40; // これより急なカーブは使わない（px）

    const bm = new Map();
    for (const e of edges) {
      const a = Math.round(e.a * 100) / 100;
      if (!bm.has(a)) bm.set(a, []);
      const A = [xs[e.i], ys[e.i]], B = [xs[e.j], ys[e.j]];
      let pts = [A, B];
      if (e.via) {
        let best = null;
        // まずはゆるやかな弧で単語を避ける
        if (performance.now() - t0 < 4000) {
          for (const c of arcs(A, B)) if (minRadius(c) >= GENTLE && pathClear(c, e)) { best = c; break; }
        }
        // 弧で避けられなければ経由点を通る曲線。なるべくゆるやかなものを選ぶ
        if (!best) {
          const poly = [A, ...e.via, B];
          let bestR = -1;
          // 単語の角から離れた経由点ほど、ゆるやかに曲げられる
          const polys = [poly];
          if (performance.now() - t0 < 4500) for (const off of [48, 32, 20]) { const v = aroundBoxes(e, A[0], A[1], B[0], B[1], off); if (v) polys.unshift([A, ...v, B]); }
          search: for (const p of polys) {
            for (const c of [spline(p), rounded(p, 120), rounded(p, 80), rounded(p, 40)]) {
              if (!pathClear(c, e)) continue;
              const r = minRadius(c);
              if (r > bestR) { bestR = r; best = c; }
              if (r >= GENTLE) break search;
            }
          }
          if (!best) best = poly;
        }
        pts = best;
      }
      for (let k = 1; k < pts.length; k++) bm.get(a).push([pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]]);
    }
    buckets = [...bm.entries()].sort((x, y) => x[0] - y[0]).map(([alpha, lines]) => ({ alpha, lines }));
  }

  function drawLines() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const z = cam.z, ox = Math.round(W / 2 - cam.x * z), oy = Math.round(H / 2 - cam.y * z);
    ctx.lineWidth = dpr >= 1.5 ? 1 / dpr : 0.6;
    ctx.lineJoin = 'round';
    for (const b of buckets) {
      ctx.strokeStyle = `rgba(0,140,220,${b.alpha})`; // 水色（濃さは今まで通り）
      ctx.beginPath();
      for (const l of b.lines) {
        const x1 = l[0] * z + ox, y1 = l[1] * z + oy, x2 = l[2] * z + ox, y2 = l[3] * z + oy;
        if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W) || (y1 < 0 && y2 < 0) || (y1 > H && y2 > H)) continue;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
  }

  function paint() {
    const z = cam.z;
    world.style.transform = `translate3d(${Math.round(W / 2 - cam.x * z)}px, ${Math.round(H / 2 - cam.y * z)}px, 0) scale(${z})`;
    drawLines();
  }
  let rafId = 0;
  const render = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; paint(); }); };

  // 画面が単語のある範囲（＋余白）からはみ出さないようにする
  function clampPt(p) {
    const z = cam.z, m = 100 / z, hw = W / 2 / z, hh = H / 2 / z;
    const lx = bounds.minX - m + hw, hx = bounds.maxX + m - hw;
    const ly = bounds.minY - m + hh, hy = bounds.maxY + m - hh;
    p.x = lx > hx ? (bounds.minX + bounds.maxX) / 2 : Math.min(hx, Math.max(lx, p.x));
    p.y = ly > hy ? (bounds.minY + bounds.maxY) / 2 : Math.min(hy, Math.max(ly, p.y));
    return p;
  }

  // 拡大・縮小の範囲（縮小は全体が画面に収まるまで）
  const Z_MAX = 2.5;
  function zMin() {
    const fit = Math.min(W / (bounds.maxX - bounds.minX + 200), H / (bounds.maxY - bounds.minY + 200));
    return Math.min(1, Math.max(0.05, fit));
  }
  // 画面上の点 (sx, sy) を中心に拡大率を z にする
  function zoomAt(z, sx, sy) {
    z = Math.min(Z_MAX, Math.max(zMin(), z));
    const wx = cam.x + (sx - W / 2) / cam.z, wy = cam.y + (sy - H / 2) / cam.z;
    cam.z = z;
    cam.x = wx - (sx - W / 2) / z;
    cam.y = wy - (sy - H / 2) / z;
    clampPt(cam);
  }

  function resize() {
    W = innerWidth; H = innerHeight; dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    if (nodes.length) { cam.z = Math.max(cam.z, zMin()); clampPt(cam); }
    paint();
  }
  addEventListener('resize', resize);

  let flyId = 0;
  function stopFly() { if (flyId) cancelAnimationFrame(flyId); flyId = 0; }
  function flyTo(x, y, done) {
    stopFly();
    const t = clampPt({ x, y });
    const sx = cam.x, sy = cam.y;
    const dist = Math.hypot(t.x - sx, t.y - sy);
    if (dist < 1) { if (done) done(); return; }
    const dur = Math.min(700, 260 + dist * 0.12);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = ease(p);
      cam.x = sx + (t.x - sx) * e; cam.y = sy + (t.y - sy) * e;
      paint();
      if (p < 1) flyId = requestAnimationFrame(step);
      else { flyId = 0; if (done) done(); }
    };
    flyId = requestAnimationFrame(step);
  }

  function flash(n) {
    n.el.classList.add('flash');
    setTimeout(() => n.el.classList.remove('flash'), 260);
  }
  function goToWord(w, done) {
    const n = nodeById.get(w.id);
    if (!n) return;
    flyTo(n.x, n.y, () => { flash(n); if (done) done(); });
  }
  function openFromNode(w) {
    const n = nodeById.get(w.id);
    openDetail(w, n.el.getBoundingClientRect(), n.el);
  }

  // ドラッグで移動、2本指で拡大・縮小
  let drag = null, pinch = null;
  const pointers = new Map();
  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  mapEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopFly();
    hideCands();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mapEl.setPointerCapture(e.pointerId);
    if (pointers.size === 1) {
      drag = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, node: e.target.closest('.node'), moved: false };
    } else if (pointers.size === 2) {
      const p = pinchInfo();
      pinch = { d: p.d, z: cam.z, wx: cam.x + (p.x - W / 2) / cam.z, wy: cam.y + (p.y - H / 2) / cam.z };
      if (drag) drag.moved = true;
    }
  });
  mapEl.addEventListener('pointermove', (e) => {
    const pt = pointers.get(e.pointerId);
    if (!pt) return;
    pt.x = e.clientX; pt.y = e.clientY;
    if (pinch && pointers.size >= 2) {
      const p = pinchInfo();
      cam.z = Math.min(Z_MAX, Math.max(zMin(), pinch.z * p.d / pinch.d));
      cam.x = pinch.wx - (p.x - W / 2) / cam.z;
      cam.y = pinch.wy - (p.y - H / 2) / cam.z;
      clampPt(cam);
      render();
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) {
      drag.moved = true;
      mapEl.classList.add('dragging');
    }
    if (drag.moved) {
      cam.x -= (e.clientX - drag.lx) / cam.z; cam.y -= (e.clientY - drag.ly) / cam.z;
      clampPt(cam);
      render();
    }
    drag.lx = e.clientX; drag.ly = e.clientY;
  });
  const endDrag = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 1) {
      // 2本指から1本指に戻ったら、残った指でドラッグを続ける
      pinch = null;
      const [p] = [...pointers.values()];
      drag = { sx: p.x, sy: p.y, lx: p.x, ly: p.y, node: null, moved: true };
      return;
    }
    if (pointers.size) return;
    const d = drag;
    drag = null;
    pinch = null;
    mapEl.classList.remove('dragging');
    if (d && e.type === 'pointerup' && !d.moved && d.node) openFromNode(byId.get(d.node.dataset.id));
  };
  mapEl.addEventListener('pointerup', endDrag);
  mapEl.addEventListener('pointercancel', endDrag);
  // ホイール（スクロール）で拡大・縮小
  mapEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopFly();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1;
    zoomAt(cam.z * Math.exp(-e.deltaY * k * 0.0015), e.clientX, e.clientY);
    render();
  }, { passive: false });

  $('#warp').addEventListener('click', () => {
    if (!nodes.length) return;
    let pool = nodes.filter((n) => Math.hypot(n.x - cam.x, n.y - cam.y) > Math.min(W, H) * 0.6 / cam.z);
    if (!pool.length) pool = nodes;
    const n = pool[Math.floor(Math.random() * pool.length)];
    flyTo(n.x, n.y);
  });

  // SEARCH
  const q = $('#q'), cands = $('#cands');
  let candList = [], candIdx = -1;
  function hideCands() { candList = []; cands.textContent = ''; }
  function updateCands() {
    candList = searchWords(q.value, 8);
    candIdx = candList.length ? 0 : -1;
    drawCands();
  }
  function drawCands() {
    cands.textContent = '';
    candList.forEach((w, i) => {
      const c = el('div', 'cand' + (i === candIdx ? ' on' : ''));
      c.append(el('span', null, w.word));
      if (w.reading) c.append(el('small', null, w.reading));
      c.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(w); });
      cands.append(c);
    });
  }
  function pick(w) {
    hideCands();
    q.blur();
    goToWord(w);
  }
  q.addEventListener('input', updateCands);
  q.addEventListener('focus', updateCands);
  q.addEventListener('blur', () => setTimeout(hideCands, 0));
  q.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!candList.length) return;
      e.preventDefault();
      candIdx = (candIdx + (e.key === 'ArrowDown' ? 1 : -1) + candList.length) % candList.length;
      drawCands();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!candList.length) updateCands();
      if (candList.length) pick(candList[Math.max(0, candIdx)]);
    } else if (e.key === 'Escape') {
      q.blur();
    }
  });

  /* ================= 拡大表示 ================= */

  const detail = $('#detail'), backdrop = $('.backdrop', detail), wrap = $('.wrap', detail);
  const panel = $('.panel', detail), scroller = $('.scroll', detail), body = $('.body', detail);
  const ghost = $('#ghost');
  let cur = null, busy = false;

  function linkify(parent, text) {
    const re = /https?:\/\/[^\s<>"'「」『』（）、。]+/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      const a = el('a', null, m[0]);
      a.href = m[0]; a.target = '_blank'; a.rel = 'noopener';
      parent.append(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.append(text.slice(last));
  }

  function fillDetail(w) {
    body.textContent = '';
    const head = el('div', 'd-head');
    head.append(el('div', 'd-word', w.word));
    if (w.reading) head.append(el('div', 'd-read', w.reading));
    if (w.variants.length) {
      const v = el('div', 'd-var');
      for (const s of w.variants) v.append(el('span', null, s));
      head.append(v);
    }
    body.append(head);
    if (w.meaning) {
      const m = el('div', 'd-mean');
      m.append(el('div', null, w.meaning));
      body.append(m);
    }
    if (w.links) {
      const l = el('div', 'd-links'), inner = el('div');
      linkify(inner, w.links);
      l.append(inner);
      body.append(l);
    }
    const entries = w.tags.map((tag) => ({ tag, list: membersOf(tag).filter((o) => o !== w) }));
    if (w.selfTag && !w.tags.includes(w.selfTag)) entries.push({ tag: w.selfTag, list: membersOf(w.selfTag).filter((o) => o !== w) });
    entries.sort((a, b) => a.list.length - b.list.length);
    if (entries.length) {
      const box = el('div', 'd-tags');
      let row = null;
      for (const { tag, list } of entries) {
        // リンクのないタグは1行にまとめて並べる
        if (!row || list.length || row.dataset.lone !== '1') {
          row = el('div', 'd-tagrow');
          row.dataset.lone = list.length ? '0' : '1';
          box.append(row);
        }
        row.append(el('span', 'tag', tag));
        if (!list.length) continue;
        const ws = el('div', 'd-rel');
        for (const o of list) {
          const b = el('button', 'rw', o.word);
          b.addEventListener('click', () => {
            if (view === 'list') swapDetail(o);
            else closeDetail(() => goToWord(o, () => openFromNode(o)), true);
          });
          ws.append(b);
        }
        box.append(ws);
        row = null;
      }
      body.append(box);
    }
  }

  // 一覧画面：拡大表示の中身だけを別の単語に切り替える
  function swapDetail(o) {
    cur = { w: o, src: listCells.get(o.id) || null };
    fillDetail(o);
    scroller.scrollTop = 0;
    scroller.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }

  const rectKF = (r) => ({ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', opacity: 1 });
  function morph(a, b, dur, fadeOut) {
    return new Promise((resolve) => {
      ghost.hidden = false;
      const to = b ? rectKF(b) : { ...rectKF(a), opacity: 0 };
      const anim = ghost.animate([rectKF(a), to], { duration: dur, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'forwards' });
      anim.onfinish = () => { ghost.hidden = true; anim.cancel(); resolve(); };
    });
  }
  const visibleRect = (e) => {
    if (!e || !e.isConnected) return null;
    const r = e.getBoundingClientRect();
    return r.width && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W ? r : null;
  };

  function openDetail(w, fromRect, src) {
    if (busy || !w) return;
    busy = true;
    cur = { w, src };
    fillDetail(w);
    detail.hidden = false;
    scroller.scrollTop = 0;
    panel.style.visibility = 'hidden';
    const to = panel.getBoundingClientRect();
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    const done = () => {
      panel.style.visibility = '';
      scroller.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
      busy = false;
    };
    if (fromRect) morph(fromRect, to, 230).then(done);
    else { panel.style.visibility = ''; panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 }); busy = false; }
  }

  function closeDetail(then, quick) {
    if (detail.hidden) { if (then) then(); return; }
    if (busy) return;
    busy = true;
    const from = panel.getBoundingClientRect();
    const to = quick ? null : visibleRect(cur && cur.src);
    panel.style.visibility = 'hidden';
    const fade = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: quick ? 140 : 200, fill: 'forwards' });
    morph(from, to, quick ? 140 : 200).then(() => {
      detail.hidden = true;
      fade.cancel();
      panel.style.visibility = '';
      cur = null;
      busy = false;
      if (then) then();
    });
  }
  function closeDetailNow() {
    detail.hidden = true;
    ghost.hidden = true;
    panel.style.visibility = '';
    cur = null;
    busy = false;
  }

  $('.gsearch', panel).addEventListener('click', () => {
    if (cur) window.open('https://www.google.com/search?q=' + encodeURIComponent(cur.w.word), '_blank', 'noopener');
  });
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeDetail(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !detail.hidden) closeDetail(); });

  /* ================= LIST ================= */

  const listEl = $('#list'), grid = $('#grid');
  const fMora = $('#fMora'), fInit = $('#fInit'), fTag = $('#fTag'), kanaBox = $('#kana');
  const state = { sort: 'kana', dir: 1, mora: null, initial: null, tag: null };
  const listCells = new Map();
  let fitTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => { if (!listEl.hidden) fitCells(grid); }, 120);
  });
  const SORT_LABEL = { kana: 'あいう', mora: 'モーラ', link: 'タグリンク数' };

  function buildListControls() {
    const opt = (v, t) => { const o = el('option', null, t); o.value = v; return o; };
    fMora.append(opt('', '—'));
    [...new Set(words.map((w) => w.mora))].sort((a, b) => a - b).forEach((m) => fMora.append(opt(m, m)));
    buildKana();
    fMora.addEventListener('change', () => { state.mora = fMora.value === '' ? null : Number(fMora.value); renderList(true); });
    fInit.addEventListener('click', (e) => {
      e.stopPropagation();
      kanaBox.hidden = !kanaBox.hidden;
      if (kanaBox.hidden) return;
      // 画面からはみ出す場合は左へずらす
      kanaBox.style.left = '0px';
      const over = kanaBox.getBoundingClientRect().right - (innerWidth - 8);
      if (over > 0) kanaBox.style.left = -over + 'px';
    });
    document.addEventListener('click', (e) => { if (!kanaBox.hidden && !kanaBox.contains(e.target)) kanaBox.hidden = true; });
    fTag.addEventListener('click', () => { state.tag = null; renderList(true); });
    $$('[data-sort]', listEl).forEach((b) => b.addEventListener('click', () => {
      const s = b.dataset.sort;
      if (state.sort === s) state.dir = -state.dir;
      else { state.sort = s; state.dir = 1; }
      renderList(true);
    }));
  }

  function buildKana() {
    const have = new Set(words.map((w) => w.ini));
    const clear = el('button', 'k-clear', '—');
    clear.addEventListener('click', () => pickInitial(null));
    kanaBox.append(clear);
    for (const row of KANA_TABLE) {
      const cells = row.split('');
      if (!cells.some((c) => have.has(c))) continue;
      for (const c of cells) {
        if (c === ' ') { kanaBox.append(el('span')); continue; }
        const b = el('button', null, c);
        b.dataset.c = c;
        b.disabled = !have.has(c);
        b.addEventListener('click', () => pickInitial(c));
        kanaBox.append(b);
      }
    }
  }
  function pickInitial(c) {
    state.initial = c;
    kanaBox.hidden = true;
    renderList(true);
  }

  function setTagFilter(tag) {
    state.tag = tag;
    renderList(true);
  }

  function renderList(toTop) {
    const arr = words.filter((w) =>
      (state.mora == null || w.mora === state.mora) &&
      (!state.initial || w.ini === state.initial) &&
      (!state.tag || w.tags.includes(state.tag) || w.selfTag === state.tag));
    const key = state.sort === 'mora' ? (w) => w.mora : state.sort === 'link' ? (w) => w.linkCount : null;
    arr.sort((a, b) => (key ? (key(a) - key(b)) * state.dir || kanaCmp(a, b) : kanaCmp(a, b) * state.dir));
    // タグで絞り込んだ時は、そのタグ名と同じ単語を先頭に
    if (state.tag) arr.sort((a, b) => (b.selfTag === state.tag) - (a.selfTag === state.tag));
    const frag = document.createDocumentFragment();
    listCells.clear();
    for (const w of arr) {
      const c = cellFor(w, (c) => openDetail(w, c.getBoundingClientRect(), c));
      listCells.set(w.id, c);
      frag.append(c);
    }
    grid.textContent = '';
    grid.append(frag);
    fitCells(grid);
    $$('[data-sort]', listEl).forEach((b) => {
      const on = b.dataset.sort === state.sort;
      b.classList.toggle('on', on);
      b.textContent = SORT_LABEL[b.dataset.sort] + (on ? (state.dir > 0 ? ' ▼' : ' ▲') : '');
    });
    fMora.value = state.mora == null ? '' : String(state.mora);
    fInit.textContent = state.initial || '—';
    $$('[data-c]', kanaBox).forEach((b) => b.classList.toggle('on', b.dataset.c === state.initial));
    fMora.classList.toggle('on', state.mora != null);
    fInit.classList.toggle('on', !!state.initial);
    fTag.hidden = !state.tag;
    fTag.textContent = state.tag ? state.tag + ' ×' : '';
    if (toTop) listEl.scrollTop = 0;
  }

  /* ================= 画面遷移 ================= */

  let view = null, listTimer = 0;
  function showList() {
    if (view === 'list') return;
    view = 'list';
    closeDetailNow();
    clearTimeout(listTimer);
    listEl.hidden = false;
    listEl.classList.add('fade');
    renderList(true);
    requestAnimationFrame(() => requestAnimationFrame(() => listEl.classList.remove('fade')));
  }
  function showMap() {
    if (view === 'map') return;
    const first = view === null;
    view = 'map';
    closeDetailNow();
    if (first) { listEl.hidden = true; return; }
    listEl.classList.add('fade');
    clearTimeout(listTimer);
    listTimer = setTimeout(() => { listEl.hidden = true; }, 190);
  }
  const route = () => (isListPath() ? showList() : showMap());

  $('#toList').addEventListener('click', () => {
    history.pushState({ fromMap: true }, '', BASE + 'list');
    showList();
  });
  $('#return').addEventListener('click', () => {
    if (history.state && history.state.fromMap) history.back();
    else { history.pushState(null, '', BASE); showMap(); }
  });
  addEventListener('popstate', route);

  /* ================= 起動 ================= */

  resize();
  fetch(BASE + 'words.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then(async (raw) => {
      prepare(Array.isArray(raw) ? raw : (raw && raw.words) || []);
      buildListControls();
      route();
      await buildMap();
    });
})();
