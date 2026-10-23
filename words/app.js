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
    <div id="topright" class="ui"><button id="about">ABOUT</button><button id="warp">WARP</button><button id="toList">LIST</button></div>
    <a id="credit" class="ui" href="https://yomitanakane.com/" target="_blank" rel="noopener">CREDIT</a>
    <div id="list" hidden>
      <div class="bar"><div class="bar-in">
        <div class="controls">
          <div class="group"><span class="lbl">SORT</span><div class="seg"><button data-sort="kana">あいう</button><button data-sort="mora">モーラ</button><button data-sort="link">タグリンク数</button></div></div>
          <div class="group"><span class="lbl">FILTER</span>
            <div class="sel"><span>モーラ</span><button id="fMora" class="pick">—</button><div id="moraBox" class="kana" hidden></div></div>
            <div class="sel"><span>頭文字</span><button id="fInit" class="pick">—</button><div id="kana" class="kana" hidden></div></div>
            <button id="fTag" class="chip" hidden></button>
          </div>
          <span id="count" class="count"></span>
        </div>
        <button id="return">RETURN</button>
      </div></div>
      <div id="grid"></div>
    </div>
    <div id="detail" hidden>
      <div class="backdrop"></div>
      <div class="wrap"><div class="panel"><button class="gsearch">このワードでGoogle検索</button><button class="close" aria-label="閉じる">×</button><div class="scroll"><div class="body"></div></div></div></div>
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

  let linkInfo = null;
  function prepare(raw) {
    // 単語の並び・タグのつながりはマップの配置（layout.js）と同じものを使う
    linkInfo = Layout.linkData(raw);
    for (const d of linkInfo.list) {
      const r = d.raw;
      const w = {
        id: d.id,
        word: d.word,
        reading: String(r.reading || '').trim(),
        variants: toArr(r.variants),
        meaning: String(r.meaning || '').trim(),
        links: String(r.links || '').trim(),
        tags: d.tags,
        selfTag: d.selfTag, // 単語そのものがタグ名として使われている場合のタグ
      };
      w.hira = K.toHira(w.reading || w.word);
      w.mora = K.mora(w.reading);
      w.initial = K.initial(w.reading);
      w.ini = SMALL_TO_BIG[w.initial] || w.initial;
      w.vlen = K.visualLength(w.word);
      w.keys = [w.word, w.reading, ...w.variants];
      words.push(w);
      byId.set(w.id, w);
    }
    for (const w of words) {
      for (const t of w.tags) {
        if (!tagMap.has(t)) tagMap.set(t, []);
        tagMap.get(t).push(w);
      }
    }
    for (const [t, idx] of linkInfo.groups) linkGroups.set(t, idx.map((i) => words[i]));
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

  // 単語名を表示する要素（「( )」「（ ）」とその中身は少し小さく。大きさは CSS の .paren）
  function wordEl(tag, cls, word) {
    const e = el(tag, cls);
    let last = 0;
    for (const m of word.matchAll(Layout.PAREN)) {
      if (m.index > last) e.append(word.slice(last, m.index));
      e.append(el('span', 'paren', m[0]));
      last = m.index + m[0].length;
    }
    if (last < word.length) e.append(word.slice(last));
    return e;
  }

  function cellFor(w, onClick) {
    const c = el('div', 'cell');
    c.append(wordEl('span', null, w.word));
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
  let buckets = []; // 濃さごとの線 [{ alpha, polys }]
  const tagPolys = new Map(); // タグ → そのタグの線（強調表示用）
  let hiTag = null; // 強調表示中のタグ
  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const Z_START = 1.2; // 最初の拡大率
  const cam = { x: 0, y: 0, z: Z_START }; // z: 拡大率
  let W = innerWidth, H = innerHeight, dpr = 1;

  /*
   * 配置と線は登録ソフトが計算した layout.json を使う。
   * layout.json がいまの単語・タグ用でない（無い・古い）時だけ、ここで同じ計算をする。
   */
  function buildMap(raw, saved) {
    const L = saved && saved.sig === Layout.signature(linkInfo) ? saved : Layout.compute(raw);
    world.textContent = '';
    const frag = document.createDocumentFragment();
    nodes = words.map((w, i) => {
      const e = wordEl('div', 'node', w.word);
      e.dataset.id = w.id;
      const [x, y] = L.pos[i];
      const bw = Layout.boxWidth(w.word), bh = Layout.BOX_H;
      e.style.transform = `translate(${Math.round(x - bw / 2)}px, ${Math.round(y - bh / 2)}px)`;
      frag.appendChild(e);
      const n = { w, el: e, x, y, bw, bh };
      nodeById.set(w.id, n);
      return n;
    });
    world.appendChild(frag);

    // 線は点列 [x0, y0, x1, y1, …] と、画面外の線を飛ばすための範囲
    const bm = new Map();
    tagPolys.clear();
    for (const [alpha, tagIdx, p] of L.edges) {
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (let k = 0; k < p.length; k += 2) {
        if (p[k] < l) l = p[k]; if (p[k] > r) r = p[k];
        if (p[k + 1] < t) t = p[k + 1]; if (p[k + 1] > b) b = p[k + 1];
      }
      const poly = { p, l, t, r, b };
      if (!bm.has(alpha)) bm.set(alpha, []);
      bm.get(alpha).push(poly);
      for (const ti of tagIdx) {
        const tag = L.tags[ti];
        if (!tagPolys.has(tag)) tagPolys.set(tag, []);
        tagPolys.get(tag).push(poly);
      }
    }
    buckets = [...bm.entries()].sort((x, y) => x[0] - y[0]).map(([alpha, polys]) => ({ alpha, polys }));

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

  // 画面に掛かる線だけを描く
  function strokePolys(list, z, ox, oy) {
    const l = -ox / z, r = (W - ox) / z, t = -oy / z, b = (H - oy) / z;
    ctx.beginPath();
    for (const q of list) {
      if (q.r < l || q.l > r || q.b < t || q.t > b) continue;
      const p = q.p;
      ctx.moveTo(p[0] * z + ox, p[1] * z + oy);
      for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k] * z + ox, p[k + 1] * z + oy);
    }
    ctx.stroke();
  }

  function drawLines() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const z = cam.z, ox = Math.round(W / 2 - cam.x * z), oy = Math.round(H / 2 - cam.y * z);
    ctx.lineWidth = dpr >= 1.5 ? 1 / dpr : 0.6;
    ctx.lineJoin = 'round';
    for (const b of buckets) {
      ctx.strokeStyle = `rgba(0,140,220,${b.alpha})`; // 水色（濃さは今まで通り）
      strokePolys(b.polys, z, ox, oy);
    }
    const hi = hiTag && tagPolys.get(hiTag);
    if (hi) {
      ctx.strokeStyle = '#b51d50';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      strokePolys(hi, z, ox, oy);
      ctx.lineCap = 'butt';
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
  function clampPt(p, z = cam.z) {
    const m = 100 / z, hw = W / 2 / z, hh = H / 2 / z;
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
  function flyTo(x, y, done, z) {
    stopFly();
    const sz = cam.z, tz = z == null ? sz : Math.min(Z_MAX, Math.max(zMin(), z));
    const t = clampPt({ x, y }, tz);
    const sx = cam.x, sy = cam.y;
    const dist = Math.hypot(t.x - sx, t.y - sy);
    const zoom = Math.abs(Math.log(tz / sz));
    if (dist < 1 && zoom < 0.01) { if (done) done(); return; }
    const dur = Math.min(zoom < 0.01 ? 700 : 900, 260 + dist * 0.12 + zoom * 300);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = ease(p);
      cam.z = sz * Math.pow(tz / sz, e);
      cam.x = sx + (t.x - sx) * e; cam.y = sy + (t.y - sy) * e;
      paint();
      if (p < 1) flyId = requestAnimationFrame(step);
      else { flyId = 0; if (done) done(); }
    };
    flyId = requestAnimationFrame(step);
  }

  // タグで結ばれた単語がすべて映るようにカメラを動かし、そのタグの線を強調する
  function highlightTag(tag) {
    const ns = (linkGroups.get(tag) || []).map((w) => nodeById.get(w.id)).filter(Boolean);
    if (!ns.length) return;
    hiTag = tag;
    const l = Math.min(...ns.map((n) => n.x - n.bw / 2)), r = Math.max(...ns.map((n) => n.x + n.bw / 2));
    const t = Math.min(...ns.map((n) => n.y - n.bh / 2)), b = Math.max(...ns.map((n) => n.y + n.bh / 2));
    // 左上の検索欄・右上のボタンにかからない余白をとる
    const z = Math.min(Z_START, (W - 80) / Math.max(1, r - l), (H - 150) / Math.max(1, b - t));
    flyTo((l + r) / 2, (t + b) / 2, null, z);
    render();
  }
  function clearHighlight() {
    if (!hiTag) return;
    hiTag = null;
    render();
  }

  function flash(n) {
    n.el.classList.add('flash');
    setTimeout(() => n.el.classList.remove('flash'), 260);
  }
  function goToWord(w, done) {
    clearHighlight();
    const n = nodeById.get(w.id);
    if (!n) return;
    flyTo(n.x, n.y, () => { flash(n); if (done) done(); });
  }
  function openFromNode(w) {
    clearHighlight();
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
    clearHighlight();
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
      c.append(wordEl('span', null, w.word));
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
    head.append(wordEl('div', 'd-word', w.word));
    if (w.reading) head.append(el('div', 'd-read', w.reading));
    if (w.variants.length) {
      const v = el('div', 'd-var');
      for (const s of w.variants) v.append(el('span', null, s));
      head.append(v);
    }
    body.append(head);
    if (w.meaning) {
      // 「>」で始まる行は引用（続く引用行は1つの帯にまとめる）
      const m = el('div', 'd-mean');
      let block = null, quote = false;
      for (const line of w.meaning.split('\n')) {
        const q = /^\s*[>＞]/.test(line);
        if (!block || q !== quote) { block = el('div', q ? 'quote' : null); m.append(block); quote = q; }
        else block.append('\n');
        block.append(q ? line.replace(/^\s*[>＞]\s?/, '') : line);
      }
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
    // 紐づく単語がまったく同じタグ（リンクのないタグ同士も含む）は1行に並べ、単語は一度だけ出す
    const groups = new Map();
    for (const { tag, list } of entries) {
      const key = list.map((o) => o.id).join('\u0001');
      if (!groups.has(key)) groups.set(key, { tags: [], list });
      groups.get(key).tags.push(tag);
    }
    if (groups.size) {
      // タグ部分は5行ほどの高さで、それより多ければこの中だけでスクロール
      const outer = el('div', 'd-tags'), box = el('div', 'd-tags-in');
      outer.append(box);
      for (const { tags, list } of groups.values()) {
        const row = el('div', 'd-tagrow');
        for (const tag of tags) {
          if (!list.length) { row.append(el('span', 'tag', tag)); continue; }
          const b = el('button', 'tag', tag);
          b.addEventListener('click', () => showTag(tag));
          row.append(b);
        }
        box.append(row);
        if (!list.length) continue;
        const ws = el('div', 'd-rel');
        for (const o of list) {
          const b = wordEl('button', 'rw', o.word);
          b.addEventListener('click', () => {
            if (view === 'list') swapDetail(o);
            else closeDetail(() => goToWord(o, () => openFromNode(o)), true);
          });
          ws.append(b);
        }
        box.append(ws);
      }
      body.append(outer);
    }
  }

  // タグを押した時：マップではそのタグの線を強調して全体が映る位置へ、一覧ではそのタグで絞り込む
  function showTag(tag) {
    if (view === 'list') { closeDetail(() => setTagFilter(tag), true); return; }
    closeDetail(() => highlightTag(tag), true);
  }

  // 一覧画面：拡大表示の中身だけを別の単語に切り替える
  function swapDetail(o) {
    cur = { w: o, src: listCells.get(o.id) || null };
    gsearch.hidden = false;
    fillDetail(o);
    fitTitle();
    scroller.scrollTop = 0;
    scroller.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }

  const rectKF = (r) => ({ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', opacity: 1 });
  function morph(a, b, dur, fadeOut) {
    return new Promise((resolve) => {
      ghost.hidden = false;
      const to = b ? rectKF(b) : { ...rectKF(a), opacity: 0 };
      const anim = ghost.animate([rectKF(a), to], { duration: dur, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'forwards' });
      let done = false;
      const finish = () => { if (done) return; done = true; ghost.hidden = true; anim.cancel(); resolve(); };
      anim.onfinish = finish;
      // 画面が裏に回っているなどでアニメーションが進まなくても、操作できない状態にならないように
      setTimeout(finish, dur + 200);
    });
  }
  const visibleRect = (e) => {
    if (!e || !e.isConnected) return null;
    const r = e.getBoundingClientRect();
    return r.width && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W ? r : null;
  };

  function openDetail(w, fromRect, src) {
    if (!w) return;
    openPanel(() => fillDetail(w), { w, src }, fromRect);
  }
  // 拡大表示の枠を開く（fill で中身を作る。cur.w が無い時は Google 検索ボタンを出さない）
  function openPanel(fill, state, fromRect) {
    if (busy) return;
    busy = true;
    cur = state;
    fill();
    gsearch.hidden = !state.w;
    detail.hidden = false;
    fitTitle();
    fitGuide();
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

  $('.close', panel).addEventListener('click', () => closeDetail());
  const gsearch = $('.gsearch', panel);
  gsearch.addEventListener('click', () => {
    if (cur && cur.w) window.open('https://www.google.com/search?q=' + encodeURIComponent(cur.w.word), '_blank', 'noopener');
  });
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeDetail(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !detail.hidden) closeDetail(); });

  /* ================= ABOUT ================= */

  // 説明文中の、画面上の部品を模した飾り（押せない）
  const chip = (cls, text) => el('span', 'ex ' + cls, text);
  function fillAbout() {
    body.textContent = '';
    const head = el('div', 'd-head');
    head.append(el('div', 'd-word', 'ABOUT'));
    const box = el('div', 'about');
    const lead = el('p');
    const a = el('a', null, '読谷あかね');
    a.href = 'https://yomitanakane.com/'; a.target = '_blank'; a.rel = 'noopener';
    lead.append(a, 'が蒐集した言葉を雑多に眺めることを目的にしたサイトです。');
    // 飾りと説明を2列に並べる（飾りは同じ幅、説明は左揃え）
    const guide = el('div', 'guide');
    const row = (c, text) => guide.append(c, el('span', 'g-text', text));
    row(chip('ex-word', '言葉'), '押すと言葉の詳細な情報が表示されます。');
    row(chip('ex-tag', 'タグ'), 'マップ上の結びつきが分かりやすくなります。');
    row(chip('ex-btn', 'WARP'), 'ランダムな地点に移動します。');
    row(chip('ex-btn', 'LIST'), '単語が一覧表示されます。ソートや絞り込みも可');
    const note = el('p', 'note', '性質上間違った情報が書き込まれている可能性もあるため、鵜呑みにしすぎず、ファクトチェックは適宜行ってください。そしてコッソリ教えてください。');
    box.append(lead, guide, note);
    body.append(head, box);
  }
  function fitGuide() {
    const texts = $$('.about .g-text', body);
    if (!texts.length) return;
    texts.forEach((t) => { t.style.fontSize = ''; });
    const base = parseFloat(getComputedStyle(texts[0]).fontSize);
    let k = 1;
    for (const t of texts) if (t.scrollWidth > t.clientWidth) k = Math.min(k, t.clientWidth / t.scrollWidth);
    if (k < 1) texts.forEach((t) => { t.style.fontSize = Math.max(8, Math.floor(base * k * 10) / 10) + 'px'; });
  }
  // 単語名が枠に収まらず折り返す時は、1行に収まるまで文字を小さくする（下限は CSS の --min。それでも収まらなければ折り返す）
  function fitTitle() {
    const t = $('.d-word', body);
    if (!t) return;
    t.style.fontSize = '';
    const cs = getComputedStyle(t);
    let size = parseFloat(cs.fontSize);
    const min = parseFloat(cs.getPropertyValue('--min')) || size;
    while (t.getBoundingClientRect().height > size * 1.2 * 1.5 && size > min) {
      size = Math.max(min, size - 1);
      t.style.fontSize = size + 'px';
    }
  }
  addEventListener('resize', () => { if (!detail.hidden) { fitTitle(); fitGuide(); } });
  $('#about').addEventListener('click', (e) => {
    const b = e.currentTarget;
    openPanel(fillAbout, { w: null, src: b }, b.getBoundingClientRect());
  });

  /* ================= LIST ================= */

  const listEl = $('#list'), grid = $('#grid');
  const fMora = $('#fMora'), fInit = $('#fInit'), fTag = $('#fTag'), kanaBox = $('#kana'), moraBox = $('#moraBox');
  const state = { sort: 'kana', dir: 1, mora: null, initial: null, tag: null };
  const listCells = new Map();
  let fitTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => { if (!listEl.hidden) fitCells(grid); }, 120);
  });
  const SORT_LABEL = { kana: 'あいう', mora: 'モーラ', link: 'タグリンク数' };

  function buildListControls() {
    buildMora();
    buildKana();
    // モーラ・頭文字の選択欄を開く（片方だけ開く。画面からはみ出す場合は左へずらす）
    const popup = (btn, box, other) => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      other.hidden = true;
      box.hidden = !box.hidden;
      if (box.hidden) return;
      box.style.left = '0px';
      const over = box.getBoundingClientRect().right - (innerWidth - 8);
      if (over > 0) box.style.left = -over + 'px';
    });
    popup(fMora, moraBox, kanaBox);
    popup(fInit, kanaBox, moraBox);
    document.addEventListener('click', (e) => {
      for (const box of [kanaBox, moraBox]) if (!box.hidden && !box.contains(e.target)) box.hidden = true;
    });
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
        // 選択中の文字をもう一度押すと解除
        b.addEventListener('click', () => pickInitial(state.initial === c ? null : c));
        kanaBox.append(b);
      }
    }
  }
  function buildMora() {
    const clear = el('button', 'k-clear', '—');
    clear.addEventListener('click', () => pickMora(null));
    moraBox.append(clear);
    for (const m of [...new Set(words.map((w) => w.mora))].sort((a, b) => a - b)) {
      const b = el('button', null, String(m));
      b.dataset.m = m;
      // 選択中のモーラをもう一度押すと解除
      b.addEventListener('click', () => pickMora(state.mora === m ? null : m));
      moraBox.append(b);
    }
  }
  function pickMora(m) {
    state.mora = m;
    moraBox.hidden = true;
    renderList(true);
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
    // 表示中（絞り込み後）の単語の数
    $('#count').textContent = arr.length === 1 ? '1 word' : `${arr.length} words`;
    fitCells(grid);
    $$('[data-sort]', listEl).forEach((b) => {
      const on = b.dataset.sort === state.sort;
      b.classList.toggle('on', on);
      b.textContent = SORT_LABEL[b.dataset.sort] + (on ? (state.dir > 0 ? ' ▼' : ' ▲') : '');
    });
    fMora.textContent = state.mora == null ? '—' : String(state.mora);
    $$('[data-m]', moraBox).forEach((b) => b.classList.toggle('on', Number(b.dataset.m) === state.mora));
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
    clearHighlight();
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
  // 以前ブラウザに保存していた配置（現在は layout.json を使うので不要）を消す
  try { localStorage.removeItem('words-layout'); } catch (e) { /* 使えなければ何もしない */ }
  const getJSON = (name, fallback) => fetch(BASE + name, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : fallback))
    .catch(() => fallback);
  Promise.all([getJSON('words.json', []), getJSON('layout.json', null)])
    .then(([raw, saved]) => {
      raw = Array.isArray(raw) ? raw : (raw && raw.words) || [];
      prepare(raw);
      buildListControls();
      route();
      buildMap(raw, saved);
    })
    .catch((e) => console.error(e))
    .finally(hideLoading);

  // 読み込み中の白地を短いフェードで消す
  function hideLoading() {
    const l = document.getElementById('loading');
    if (!l) return;
    l.classList.add('done');
    setTimeout(() => l.remove(), 400);
  }
})();
