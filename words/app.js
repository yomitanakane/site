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
      <div class="bar">
        <div class="controls">
          <div class="group"><span class="lbl">SORT</span><button data-sort="kana">あいう</button><button data-sort="mora">MORA</button><button data-sort="link">LINK</button></div>
          <div class="group"><span class="lbl">FILTER</span>
            <label class="sel"><span>MORA</span><select id="fMora"></select></label>
            <label class="sel"><span>INITIAL</span><select id="fInit"></select></label>
            <button id="fTag" class="chip" hidden></button>
          </div>
        </div>
        <button id="return">RETURN</button>
      </div>
      <div id="grid"></div>
    </div>
    <div id="detail" hidden>
      <div class="backdrop"></div>
      <div class="wrap"><div class="panel"><button class="gsearch">検索</button><div class="scroll"><div class="body"></div></div></div></div>
    </div>
    <div id="ghost" hidden></div>`;

  /* ================= データ ================= */

  let words = [];
  const byId = new Map();
  const tagMap = new Map();

  const toArr = (v) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,、]/) : [])
      .map((s) => String(s).trim())
      .filter(Boolean);

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
    // タグにより結びついた単語の数
    for (const w of words) {
      const s = new Set();
      for (const t of w.tags) for (const o of tagMap.get(t)) s.add(o);
      s.delete(w);
      w.linkCount = s.size;
    }
  }

  const kanaCmp = (a, b) => collator.compare(a.hira, b.hira) || collator.compare(a.word, b.word);
  const sizeClass = (w) => (w.vlen <= 9 ? 's-l' : w.vlen <= 15 ? 's-m' : 's-s');

  function cellFor(w, onClick) {
    const c = el('div', 'cell ' + sizeClass(w), w.word);
    c.addEventListener('click', () => onClick(c));
    return c;
  }

  function searchWords(text, limit) {
    const nq = K.norm(text);
    if (!nq) return [];
    const res = [];
    for (const w of words) {
      const s = K.matchScore(nq, w.keys, false);
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
  const cam = { x: 0, y: 0 };
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
    for (const n of nodes) {
      n.el.style.transform = `translate(${Math.round(n.x - n.bw / 2)}px, ${Math.round(n.y - n.bh / 2)}px)`;
    }
    buildEdges();
    if (nodes.length) {
      bounds.minX = Math.min(...nodes.map((n) => n.x - n.bw / 2));
      bounds.maxX = Math.max(...nodes.map((n) => n.x + n.bw / 2));
      bounds.minY = Math.min(...nodes.map((n) => n.y - n.bh / 2));
      bounds.maxY = Math.max(...nodes.map((n) => n.y + n.bh / 2));
      const start = nodes[Math.floor(Math.random() * nodes.length)];
      cam.x = start.x; cam.y = start.y;
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
    for (const ws of tagMap.values()) if (ws.length > 1) groups.push(ws.map((w) => index.get(w.id)));

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
  const alphaFor = (m) => Math.max(0.08, 0.55 / (1 + 0.9 * Math.log2(m / 2)));

  // タグごとに最小全域木で結ぶ（全組み合わせだと線が多すぎるため）
  function buildEdges() {
    const pairs = new Map();
    for (const ws of tagMap.values()) {
      const m = ws.length;
      if (m < 2) continue;
      const a = alphaFor(m);
      const pts = ws.map((w) => nodeById.get(w.id));
      const inTree = new Uint8Array(m), best = new Float64Array(m).fill(Infinity), from = new Int32Array(m).fill(-1);
      best[0] = 0;
      for (let k = 0; k < m; k++) {
        let u = -1, bv = Infinity;
        for (let i = 0; i < m; i++) if (!inTree[i] && best[i] < bv) { bv = best[i]; u = i; }
        inTree[u] = 1;
        if (from[u] >= 0) {
          const p = pts[u], q = pts[from[u]];
          const key = p.w.id < q.w.id ? p.w.id + '\u0001' + q.w.id : q.w.id + '\u0001' + p.w.id;
          const e = pairs.get(key);
          if (!e) pairs.set(key, { a, line: [p.x, p.y, q.x, q.y] });
          else if (a > e.a) e.a = a;
        }
        for (let i = 0; i < m; i++) {
          if (inTree[i]) continue;
          const d = (pts[i].x - pts[u].x) ** 2 + (pts[i].y - pts[u].y) ** 2;
          if (d < best[i]) { best[i] = d; from[i] = u; }
        }
      }
    }
    const bm = new Map();
    for (const e of pairs.values()) {
      const a = Math.round(e.a * 50) / 50;
      if (!bm.has(a)) bm.set(a, []);
      bm.get(a).push(e.line);
    }
    buckets = [...bm.entries()].sort((x, y) => x[0] - y[0]).map(([alpha, lines]) => ({ alpha, lines }));
  }

  function drawLines() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const ox = Math.round(W / 2 - cam.x), oy = Math.round(H / 2 - cam.y);
    ctx.lineWidth = 1;
    for (const b of buckets) {
      ctx.strokeStyle = `rgba(0,0,0,${b.alpha})`;
      ctx.beginPath();
      for (const l of b.lines) {
        const x1 = l[0] + ox, y1 = l[1] + oy, x2 = l[2] + ox, y2 = l[3] + oy;
        if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W) || (y1 < 0 && y2 < 0) || (y1 > H && y2 > H)) continue;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
  }

  function paint() {
    world.style.transform = `translate3d(${Math.round(W / 2 - cam.x)}px, ${Math.round(H / 2 - cam.y)}px, 0)`;
    drawLines();
  }
  let rafId = 0;
  const render = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; paint(); }); };

  // 画面が単語のある範囲（＋余白）からはみ出さないようにする
  function clampPt(p) {
    const m = 100;
    const lx = bounds.minX - m + W / 2, hx = bounds.maxX + m - W / 2;
    const ly = bounds.minY - m + H / 2, hy = bounds.maxY + m - H / 2;
    p.x = lx > hx ? (bounds.minX + bounds.maxX) / 2 : Math.min(hx, Math.max(lx, p.x));
    p.y = ly > hy ? (bounds.minY + bounds.maxY) / 2 : Math.min(hy, Math.max(ly, p.y));
    return p;
  }

  function resize() {
    W = innerWidth; H = innerHeight; dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    if (nodes.length) clampPt(cam);
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

  // ドラッグで移動
  let drag = null;
  mapEl.addEventListener('pointerdown', (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopFly();
    hideCands();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, node: e.target.closest('.node'), moved: false };
    mapEl.setPointerCapture(e.pointerId);
  });
  mapEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) {
      drag.moved = true;
      mapEl.classList.add('dragging');
    }
    if (drag.moved) {
      cam.x -= e.clientX - drag.lx; cam.y -= e.clientY - drag.ly;
      clampPt(cam);
      render();
    }
    drag.lx = e.clientX; drag.ly = e.clientY;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    mapEl.classList.remove('dragging');
    if (e.type === 'pointerup' && !d.moved && d.node) openFromNode(byId.get(d.node.dataset.id));
  };
  mapEl.addEventListener('pointerup', endDrag);
  mapEl.addEventListener('pointercancel', endDrag);
  mapEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopFly();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1;
    let ddx = e.deltaX * k, ddy = e.deltaY * k;
    if (e.shiftKey && !ddx) { ddx = ddy; ddy = 0; }
    cam.x += ddx; cam.y += ddy;
    clampPt(cam);
    render();
  }, { passive: false });

  $('#warp').addEventListener('click', () => {
    if (!nodes.length) return;
    let pool = nodes.filter((n) => Math.hypot(n.x - cam.x, n.y - cam.y) > Math.min(W, H) * 0.6);
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
  let cur = null, relTag = null, busy = false;

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
    body.append(head);
    if (w.variants.length) {
      const v = el('div', 'd-var');
      for (const s of w.variants) v.append(el('span', null, s));
      body.append(v);
    }
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
    if (w.tags.length) {
      const t = el('div', 'd-tags');
      for (const tag of w.tags) {
        const b = el('button', view === 'list' && state.tag === tag ? 'on' : null, tag);
        b.dataset.tag = tag;
        b.addEventListener('click', () => onTag(tag));
        t.append(b);
      }
      body.append(t);
    }
    body.append(el('div', 'rel'));
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
    relTag = null;
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

  function onTag(tag) {
    if (view === 'list') {
      closeDetail(() => setTagFilter(tag), true);
      return;
    }
    const rel = $('.rel', body);
    relTag = relTag === tag ? null : tag;
    $$('.d-tags button', body).forEach((b) => b.classList.toggle('on', b.dataset.tag === relTag));
    rel.textContent = '';
    if (!relTag) return;
    const self = cur.w;
    tagMap.get(tag).filter((o) => o !== self).sort(kanaCmp).forEach((o) => {
      rel.append(cellFor(o, () => closeDetail(() => goToWord(o, () => openFromNode(o)), true)));
    });
    rel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    const rr = rel.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
    if (rr.top > sr.bottom - 80) scroller.scrollBy({ top: rr.top - sr.bottom + Math.min(rr.height, sr.height * 0.5), behavior: 'smooth' });
  }

  $('.gsearch', panel).addEventListener('click', () => {
    if (cur) window.open('https://www.google.com/search?q=' + encodeURIComponent(cur.w.word), '_blank', 'noopener');
  });
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeDetail(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !detail.hidden) closeDetail(); });

  /* ================= LIST ================= */

  const listEl = $('#list'), grid = $('#grid');
  const fMora = $('#fMora'), fInit = $('#fInit'), fTag = $('#fTag');
  const state = { sort: 'kana', dir: 1, mora: null, initial: null, tag: null };
  const SORT_LABEL = { kana: 'あいう', mora: 'MORA', link: 'LINK' };

  function buildListControls() {
    const opt = (v, t) => { const o = el('option', null, t); o.value = v; return o; };
    fMora.append(opt('', '—'));
    [...new Set(words.map((w) => w.mora))].sort((a, b) => a - b).forEach((m) => fMora.append(opt(m, m)));
    fInit.append(opt('', '—'));
    [...new Set(words.map((w) => w.initial).filter(Boolean))].sort(collator.compare).forEach((c) => fInit.append(opt(c, c)));
    fMora.addEventListener('change', () => { state.mora = fMora.value === '' ? null : Number(fMora.value); renderList(true); });
    fInit.addEventListener('change', () => { state.initial = fInit.value || null; renderList(true); });
    fTag.addEventListener('click', () => { state.tag = null; renderList(true); });
    $$('[data-sort]', listEl).forEach((b) => b.addEventListener('click', () => {
      const s = b.dataset.sort;
      if (state.sort === s) state.dir = -state.dir;
      else { state.sort = s; state.dir = 1; }
      renderList(true);
    }));
  }

  function setTagFilter(tag) {
    state.tag = tag;
    renderList(true);
  }

  function renderList(toTop) {
    const arr = words.filter((w) =>
      (state.mora == null || w.mora === state.mora) &&
      (!state.initial || w.initial === state.initial) &&
      (!state.tag || w.tags.includes(state.tag)));
    const key = state.sort === 'mora' ? (w) => w.mora : state.sort === 'link' ? (w) => w.linkCount : null;
    arr.sort((a, b) => (key ? (key(a) - key(b)) * state.dir || kanaCmp(a, b) : kanaCmp(a, b) * state.dir));
    const frag = document.createDocumentFragment();
    for (const w of arr) frag.append(cellFor(w, (c) => openDetail(w, c.getBoundingClientRect(), c)));
    grid.textContent = '';
    grid.append(frag);
    $$('[data-sort]', listEl).forEach((b) => {
      const on = b.dataset.sort === state.sort;
      b.classList.toggle('on', on);
      b.textContent = SORT_LABEL[b.dataset.sort] + (on ? (state.dir > 0 ? ' ↑' : ' ↓') : '');
    });
    fMora.value = state.mora == null ? '' : String(state.mora);
    fInit.value = state.initial || '';
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
    renderList(true);
    listEl.hidden = false;
    listEl.classList.add('fade');
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
