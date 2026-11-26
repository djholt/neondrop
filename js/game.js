'use strict';
/* NEON DROP — game engine.
   Canvas board, SRS rotation with wall kicks, 7-bag randomizer, lock delay,
   hold, ghost piece, particles, screen shake, drop trails, floating banners. */
(function () {
  const A = window.NeonAudio;
  const sfx = A.sfx, music = A.music;

  /* ---------------- constants ---------------- */
  const COLS = 10, ROWS = 20, CELL = 30;
  const W = COLS * CELL, H = ROWS * CELL;
  const LOCK_DELAY = 500, MAX_RESETS = 15, CLEAR_MS = 380;
  const DAS = 140, ARR = 38; // delayed auto shift / auto repeat rate

  const SHAPES = {
    I: { cells: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#2de3ff' },
    J: { cells: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: '#4d7bff' },
    L: { cells: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: '#ff9f2e' },
    O: { cells: [[1, 1], [1, 1]], color: '#ffe14d' },
    S: { cells: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: '#3dff8b' },
    T: { cells: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: '#c95bff' },
    Z: { cells: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: '#ff4d6d' },
  };

  // SRS wall kicks, converted to y-down (positive dy = down).
  const KICK_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  };
  const KICK_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  };
  const KICK_180 = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1]];

  /* ---------------- dom ---------------- */
  const $ = (id) => document.getElementById(id);
  const board = $('board'), bctx = board.getContext('2d');
  const holdCv = $('holdCv'), hctx = holdCv.getContext('2d');
  const nextCv = $('nextCv'), nctx = nextCv.getContext('2d');
  const boardWrap = $('boardWrap'), fx = $('fx');
  const screens = { start: $('screenStart'), pause: $('screenPause'), over: $('screenOver') };
  const ui = { score: $('uiScore'), best: $('uiBest'), level: $('uiLevel'), lines: $('uiLines'), combo: $('uiCombo'), time: $('uiTime') };

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  board.width = W * DPR; board.height = H * DPR;
  bctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  function setupMini(cv) {
    const w = cv.clientWidth || 148, h = cv.clientHeight || 84;
    cv.width = w * DPR; cv.height = h * DPR;
    cv.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* ---------------- helpers ---------------- */
  function mix(hex, amt) { // amt>0 lighten toward white, <0 darken
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    const target = amt > 0 ? 255 : 0, a = Math.abs(amt);
    r = Math.round(r + (target - r) * a);
    g = Math.round(g + (target - g) * a);
    b = Math.round(b + (target - b) * a);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBlockPx(ctx, px, py, size, color, glow) {
    const pad = Math.max(1, size * 0.06);
    ctx.save();
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = Math.max(6, size * 0.38); }
    const g = ctx.createLinearGradient(px, py, px, py + size);
    g.addColorStop(0, mix(color, 0.38));
    g.addColorStop(1, mix(color, -0.15));
    ctx.fillStyle = g;
    rr(ctx, px + pad, py + pad, size - pad * 2, size - pad * 2, size * 0.16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    rr(ctx, px + pad * 2.2, py + pad * 1.8, size - pad * 4.4, size * 0.16, size * 0.08);
    ctx.fill();
    ctx.restore();
  }

  function outlinePx(ctx, px, py, size, color) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    const pad = size * 0.14;
    rr(ctx, px + pad, py + pad, size - pad * 2, size - pad * 2, size * 0.16);
    ctx.stroke();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function eachCell(m, fn) {
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m[y].length; x++)
        if (m[y][x]) fn(x, y);
  }

  function rotateMatrix(m, dir) {
    const n = m.length;
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (dir > 0) r[x][n - 1 - y] = m[y][x];
        else r[n - 1 - x][y] = m[y][x];
    return r;
  }

  /* ---------------- state ---------------- */
  let grid, current, holdKey, canHold;
  let bag = [], queue = [];
  let score, lines, level, chain, lastTetris, best;
  let state = 'menu'; // menu | play | clearing | paused | over
  let gravTimer = 0, lockTimer = 0, lockResets = 0, grounded = false;
  let clearing = null; // {rows:[], t:0}
  let timeMs = 0, lastHudTime = -1;
  let particles = [], trails = [], shake = 0;
  let hue = 190;
  let input = { left: false, right: false, down: false };
  let softWasDown = false;
  let dasDir = 0, dasTime = 0, dasCharged = false;

  best = parseInt(localStorage.getItem('neondrop.best') || '0', 10) || 0;

  function emptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function collides(m, px, py) {
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const bx = px + x, by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && grid[by][bx]) return true;
      }
    return false;
  }

  function refill() {
    while (queue.length < 7) {
      if (bag.length === 0) {
        bag = Object.keys(SHAPES);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
        }
      }
      queue.push(bag.pop());
    }
  }

  function spawn(key) {
    if (!key) { refill(); key = queue.shift(); }
    const m = SHAPES[key].cells.map(r => r.slice());
    current = {
      key, m, color: SHAPES[key].color, rot: 0,
      x: Math.floor((COLS - m.length) / 2),
      y: key === 'I' ? -1 : (key === 'O' ? 0 : 0),
    };
    lockTimer = 0; gravTimer = 0; lockResets = 0; grounded = false;
    updateMinis();
    if (collides(current.m, current.x, current.y)) gameOver();
  }

  /* ---------------- core actions ---------------- */
  function touchLock() { // a successful shift while grounded restarts the lock timer
    if (grounded && lockResets < MAX_RESETS) { lockTimer = 0; lockResets++; }
  }

  function tryMove(dx, dy) {
    if (!current || state !== 'play') return false;
    if (!collides(current.m, current.x + dx, current.y + (dy || 0))) {
      current.x += dx; current.y += (dy || 0);
      touchLock();
      return true;
    }
    return false;
  }

  function rotate(dir) { // 1 = cw, -1 = ccw, 2 = 180
    if (!current || state !== 'play') return false;
    const from = current.rot;
    const to = (from + (dir === 2 ? 2 : dir) + 4) % 4;
    let m2 = dir === 2 ? rotateMatrix(rotateMatrix(current.m, 1), 1) : rotateMatrix(current.m, dir);
    const table = dir === 2 ? KICK_180
      : (current.key === 'I' ? KICK_I : KICK_JLSTZ)[from + '>' + to] || [[0, 0]];
    for (const k of table) {
      if (!collides(m2, current.x + k[0], current.y + k[1])) {
        current.m = m2; current.x += k[0]; current.y += k[1]; current.rot = to;
        touchLock();
        sfx.rotate();
        return true;
      }
    }
    return false;
  }

  function hold() {
    if (!current || !canHold || state !== 'play') return;
    const k = current.key;
    sfx.hold();
    if (holdKey) { const h = holdKey; holdKey = k; spawn(h); }
    else { holdKey = k; spawn(); }
    canHold = false;
    updateMinis();
  }

  function hardDrop() {
    if (!current || state !== 'play') return;
    const y0 = current.y;
    let d = 0;
    while (!collides(current.m, current.x, current.y + 1)) { current.y++; d++; }
    score += d * 2;

    // neon drop trail
    const top = Math.max(y0 + 1, current.y - 14);
    for (let yy = current.y - 1; yy >= top; yy--)
      trails.push({ x: current.x, y: yy, m: current.m, color: current.color, born: performance.now() });

    shake = Math.min(10, shake + 3 + d * 0.35);
    sfx.hardDrop();
    // harder nebula bloom than a normal place (lockPiece adds its own too)
    if (window.NEONBURST) window.NEONBURST(0.5, [current.color]);

    // impact dust
    eachCell(current.m, (cx, cy) => {
      const bx = current.x + cx, by = current.y + cy;
      if (by < 0) return;
      for (let i = 0; i < 3; i++) particles.push(mkParticle(bx * CELL + CELL / 2, (by + 1) * CELL, current.color, 1));
    });
    lockPiece();
  }

  function mkParticle(x, y, color, power) {
    const ang = Math.random() * Math.PI * 2;
    const sp = (0.6 + Math.random() * 2.6) * power;
    return {
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 1.6 * power,
      life: 420 + Math.random() * 480,
      max: 900,
      size: 2 + Math.random() * 3.4,
      color,
    };
  }

  function lockPiece() {
    const cur = current;
    let topOut = false;
    eachCell(cur.m, (cx, cy) => {
      const bx = cur.x + cx, by = cur.y + cy;
      if (by < 0) { topOut = true; return; }
      grid[by][bx] = cur.color;
    });
    current = null;
    sfx.lock();
    shake = Math.min(10, shake + 1.5);
    // every placed piece blooms the nebula in its color
    if (window.NEONBURST) window.NEONBURST(0, [cur.color]);

    if (topOut) { gameOver(); return; }

    const full = [];
    for (let y = 0; y < ROWS; y++)
      if (grid[y].every(c => c)) full.push(y);

    if (full.length) beginClear(full);
    else afterLock(false);
  }

  function beginClear(rows) {
    state = 'clearing';
    clearing = { rows, t: 0 };
    const n = rows.length;
    chain++;
    const isQuad = n === 4;
    let pts = [0, 100, 300, 500, 800][n] * level;
    if (isQuad && lastTetris) pts = Math.floor(pts * 1.5);
    lastTetris = isQuad;
    const combo = chain - 1;
    if (combo > 0) pts += 50 * combo * level;
    score += pts;
    lines += n;

    // shatter particles from every cleared cell
    for (const ry of rows)
      for (let x = 0; x < COLS; x++) {
        const col = grid[ry][x] || '#9ff';
        for (let i = 0; i < 6; i++)
          if (particles.length < 700)
            particles.push(mkParticle(x * CELL + CELL / 2 + (Math.random() - 0.5) * 10, ry * CELL + CELL / 2, col, 1.7));
      }

    const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
    banner(names[n] + '  +' + pts, isQuad ? 'big' : '');
    if (combo >= 1) banner('COMBO ×' + combo, 'combo');
    sfx.clear(n, chain);
    shake = Math.min(14, shake + 2 + n * 2);
    if (window.NEONPULSE) window.NEONPULSE(isQuad ? 1 : 0.35 + n * 0.08);

    // nebula smash: feed the cleared rows' block colors to the background gas
    if (window.NEONBURST) {
      const cols = [];
      for (const ry of rows)
        for (let x = 0; x < COLS; x++) {
          const c = grid[ry][x];
          if (c && cols.indexOf(c) === -1) cols.push(c);
        }
      window.NEONBURST(n, cols);
    }
    if (isQuad) boostBoard(0.5);

    // level up
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel > level) {
      level = newLevel;
      sfx.levelUp();
      banner('LEVEL ' + level, 'level');
      hue = (190 + (level - 1) * 36) % 360;
      boardWrap.style.setProperty('--hue', hue);
      music.bpm = Math.min(190, 100 + (level - 1) * 7);
      boostBoard(0.35);
      if (window.NEONPULSE) window.NEONPULSE(0.7);
    }
    hud();
  }

  function finishClear() {
    const rows = new Set(clearing.rows);
    grid = grid.filter((_, y) => !rows.has(y));
    while (grid.length < ROWS) grid.unshift(Array(COLS).fill(null));
    clearing = null;
    state = 'play';
    afterLock(true);
  }

  function afterLock(cleared) {
    if (!cleared) chain = 0;
    canHold = true;
    hud();
    spawn();
  }

  function boostBoard(v) {
    boardWrap.style.setProperty('--boost', v);
    setTimeout(() => boardWrap.style.setProperty('--boost', 0), 420);
  }

  function gameOver() {
    state = 'over';
    current = null;
    clearing = null;
    music.stop();
    sfx.gameOver();
    if (window.NEONPULSE) window.NEONPULSE(1);
    shake = 12;
    if (score > best) {
      best = score;
      localStorage.setItem('neondrop.best', String(best));
      $('overBest').textContent = '★ NEW BEST ★';
    } else {
      $('overBest').textContent = 'Best: ' + best.toLocaleString();
    }
    $('overScore').textContent = score.toLocaleString();
    showScreen('over');
    hud();
  }

  /* ---------------- flow ---------------- */
  function showScreen(name) {
    for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
  }
  function hideScreens() { showScreen('__none'); }

  function startGame() {
    A.ensure();
    grid = emptyGrid();
    bag = []; queue = [];
    score = 0; lines = 0; level = 1; chain = 0; lastTetris = false;
    holdKey = null; canHold = true;
    particles = []; trails = []; shake = 0;
    timeMs = 0; dasDir = 0; dasCharged = false; softWasDown = false;
    hue = 190;
    boardWrap.style.setProperty('--hue', hue);
    boardWrap.classList.remove('danger');
    fx.innerHTML = '';
    music.bpm = 100;
    hideScreens();
    state = 'play';
    sfx.start();
    music.stop(); music.start();
    hud();
    spawn();
  }

  function togglePause(force) {
    if (state === 'play' && force !== false) {
      state = 'paused';
      music.stop();
      showScreen('pause');
    } else if (state === 'paused' && force !== true) {
      state = 'play';
      hideScreens();
      music.start();
    }
  }

  /* ---------------- hud & minis ---------------- */
  function hud() {
    ui.score.textContent = score ? score.toLocaleString() : '0';
    ui.best.textContent = best.toLocaleString();
    ui.level.textContent = level || 1;
    ui.lines.textContent = lines || 0;
    ui.combo.textContent = chain > 1 ? '×' + (chain - 1) : '—';
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function drawMiniSet(ctx, cw, ch, keys, alphas) {
    ctx.clearRect(0, 0, cw, ch);
    const slot = ch / Math.max(keys.length, 1);
    keys.forEach((key, i) => {
      if (!key) return;
      const m = SHAPES[key].cells;
      let minX = 9, maxX = -1, minY = 9, maxY = -1;
      eachCell(m, (x, y) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      });
      const cell = 16;
      const bw = (maxX - minX + 1) * cell, bh = (maxY - minY + 1) * cell;
      const ox = (cw - bw) / 2 - minX * cell;
      const oy = i * slot + (slot - bh) / 2 - minY * cell;
      ctx.save();
      ctx.globalAlpha = alphas ? alphas[i] : 1;
      eachCell(m, (x, y) => drawBlockPx(ctx, ox + x * cell, oy + y * cell, cell, SHAPES[key].color, true));
      ctx.restore();
    });
  }

  function miniSynced(cv) {
    const w = Math.round(cv.clientWidth * DPR);
    const h = Math.round(cv.clientHeight * DPR);
    return cv.width === w && cv.height === h;
  }

  function updateMinis() {
    // the flex-stretched canvas box can change size after init (font swap,
    // layout settling) without a window resize; re-sync the backing store so
    // the bitmap always maps 1:1 to CSS pixels and blocks stay square
    if (!miniSynced(holdCv)) setupMini(holdCv);
    if (!miniSynced(nextCv)) setupMini(nextCv);
    drawMiniSet(hctx, holdCv.clientWidth || 148, holdCv.clientHeight || 84, [holdKey]);
    const q = queue.slice(0, 4);
    while (q.length < 4) q.push(null);
    drawMiniSet(nctx, nextCv.clientWidth || 148, nextCv.clientHeight || 262, q, [1, 0.75, 0.55, 0.4]);
  }

  function banner(text, cls) {
    const el = document.createElement('div');
    el.className = 'banner' + (cls ? ' ' + cls : '');
    el.textContent = text;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  /* ---------------- update ---------------- */
  function gravInterval() {
    const l = Math.min(level, 20);
    return Math.max(25, Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000);
  }

  function update(dt) {
    if (state !== 'play' && state !== 'clearing') return;
    if (state === 'play') timeMs += dt;

    // horizontal auto-shift
    if (state === 'play' && (input.left || input.right)) {
      const d = input.left ? -1 : 1;
      if (d !== dasDir) {
        dasDir = d; dasTime = 0; dasCharged = false;
        if (tryMove(d)) sfx.move();
      }
      dasTime += dt;
      if (!dasCharged && dasTime >= DAS) { dasCharged = true; dasTime = 0; if (tryMove(d)) sfx.move(); }
      else if (dasCharged && dasTime >= ARR) { dasTime = 0; if (tryMove(d)) sfx.move(); }
    } else { dasDir = 0; dasCharged = false; }

    if (state === 'play' && current) {
      grounded = collides(current.m, current.x, current.y + 1);
      if (grounded) {
        lockTimer += dt;
        if (lockTimer >= LOCK_DELAY) lockPiece();
      } else {
        lockTimer = 0;
        const g = input.down ? Math.max(30, gravInterval() / 20) : gravInterval();
        // switching between gravity and soft drop restarts the clock,
        // otherwise the leftover at the old rate fires a burst of steps
        if (input.down !== softWasDown) { softWasDown = input.down; gravTimer = 0; }
        gravTimer += dt;
        while (gravTimer >= g && current && !collides(current.m, current.x, current.y + 1)) {
          current.y++;
          if (input.down) score += 1;
          gravTimer -= g;
          lockResets = 0;
        }
        if (current && input.down) hud();
      }
    } else if (state === 'clearing') {
      clearing.t += dt;
      if (clearing.t >= CLEAR_MS) finishClear();
    }
  }

  function updateEffects(dt) {
    shake *= Math.pow(0.86, dt / 16);
    if (shake < 0.15) shake = 0;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const k = dt / 16;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vy += 0.12 * k;
      p.vx *= Math.pow(0.985, k);
    }
    const now = performance.now();
    for (let i = trails.length - 1; i >= 0; i--)
      if (now - trails[i].born > 160) trails.splice(i, 1);
  }

  /* ---------------- draw ---------------- */
  function ghostY() {
    let y = current.y;
    while (!collides(current.m, current.x, y + 1)) y++;
    return y;
  }

  function stackTop() {
    for (let y = 0; y < ROWS; y++) if (grid[y].some(c => c)) return y;
    return ROWS;
  }

  function draw() {
    const ctx = bctx;
    ctx.save();
    if (shake > 0.1)
      ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);

    // backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0d22');
    bg.addColorStop(1, '#04050f');
    ctx.fillStyle = bg;
    ctx.fillRect(-14, -14, W + 28, H + 28);

    // playfield grid
    ctx.strokeStyle = 'hsla(' + hue + ',90%,70%,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H); }
    for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W, y * CELL + 0.5); }
    ctx.stroke();

    // danger tint when the stack is high
    const top = stackTop();
    boardWrap.classList.toggle('danger', state === 'play' && top <= 4);
    if (top <= 5 && state !== 'menu') {
      const dg = ctx.createLinearGradient(0, 0, 0, CELL * 5);
      const a = 0.10 + 0.08 * Math.sin(performance.now() / 130);
      dg.addColorStop(0, 'rgba(255,50,80,' + a.toFixed(3) + ')');
      dg.addColorStop(1, 'rgba(255,50,80,0)');
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, W, CELL * 5);
    }

    // settled blocks
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (grid[y][x]) drawBlockPx(ctx, x * CELL, y * CELL, CELL, grid[y][x], true);

    // clearing flash
    if (clearing) {
      const p = Math.min(1, clearing.t / CLEAR_MS);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const ry of clearing.rows) {
        const flick = 0.55 + 0.45 * Math.sin(p * Math.PI * 4);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - p) * flick).toFixed(3) + ')';
        ctx.fillRect(0, ry * CELL, W, CELL);
        const lw = W * (1 - p);
        ctx.fillStyle = 'rgba(200,245,255,' + (0.9 * (1 - p)).toFixed(3) + ')';
        ctx.fillRect((W - lw) / 2, ry * CELL + CELL / 2 - 2, lw, 4);
      }
      ctx.restore();
    }

    // drop trails
    const now = performance.now();
    if (trails.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const tr of trails) {
        const age = (now - tr.born) / 160;
        const depth = current ? 1 : 1;
        ctx.globalAlpha = Math.max(0, (1 - age) * 0.22);
        eachCell(tr.m, (cx, cy) => {
          if (tr.y + cy < 0) return;
          ctx.fillStyle = tr.color;
          rr(ctx, (tr.x + cx) * CELL + 4, (tr.y + cy) * CELL + 4, CELL - 8, CELL - 8, 5);
          ctx.fill();
        });
        void depth;
      }
      ctx.restore();
    }

    // ghost + active piece
    if (current && (state === 'play' || state === 'paused')) {
      const gy = ghostY();
      if (gy !== current.y)
        eachCell(current.m, (cx, cy) => {
          if (gy + cy < 0) return;
          outlinePx(ctx, (current.x + cx) * CELL, (gy + cy) * CELL, CELL, current.color);
        });
      eachCell(current.m, (cx, cy) => {
        if (current.y + cy < 0) return;
        drawBlockPx(ctx, (current.x + cx) * CELL, (current.y + cy) * CELL, CELL, current.color, true);
      });
    }

    // particles (additive sparks)
    if (particles.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max)) * 0.9;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last);
    last = now;
    update(dt);
    updateEffects(dt);
    draw();
    if ((state === 'play' || state === 'clearing') && now - lastHudTime > 250) {
      lastHudTime = now;
      ui.time.textContent = fmtTime(timeMs);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- input ---------------- */
  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
  };

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
    if (e.repeat) return;

    if (e.key === 'Enter') {
      if (state === 'menu' || state === 'over') startGame();
      else if (state === 'paused') togglePause();
      return;
    }
    if (e.code === 'KeyM') { toggleSound(); return; }
    if (e.code === 'KeyP' || e.key === 'Escape') { togglePause(); return; }

    A.ensure();
    const act = KEYS[e.key];
    if (act) { input[act] = true; return; }
    switch (e.code) {
      case 'ArrowUp': case 'KeyX': rotate(1); break;
      case 'KeyZ': rotate(-1); break;
      case 'KeyA': rotate(2); break;
      case 'Space': hardDrop(); break;
      case 'KeyC': case 'ShiftLeft': case 'ShiftRight': hold(); break;
    }
  });

  window.addEventListener('keyup', (e) => {
    const act = KEYS[e.key];
    if (act) input[act] = false;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') togglePause(true);
  });

  // buttons
  $('btnStart').addEventListener('click', startGame);
  $('btnRestart').addEventListener('click', startGame);
  $('btnResume').addEventListener('click', () => togglePause());
  $('btnSound').addEventListener('click', toggleSound);

  function toggleSound() {
    A.ensure();
    const muted = !A.isMuted();
    A.setMuted(muted);
    $('btnSound').textContent = muted ? '🔇 Muted' : '🔊 Sound on';
  }

  // touch controls
  document.querySelectorAll('#touch button').forEach(btn => {
    const act = btn.dataset.act;
    let iv = null;
    const fire = () => {
      A.ensure();
      // pad buttons never start or restart the game; that is the
      // Start / Play again button's job alone
      if (state === 'menu' || state === 'over') return;
      switch (act) {
        case 'left': if (tryMove(-1)) sfx.move(); break;
        case 'right': if (tryMove(1)) sfx.move(); break;
        case 'soft':
          if (tryMove(0, 1)) { score += 1; sfx.move(); hud(); }
          break;
        case 'cw': rotate(1); break;
        case 'ccw': rotate(-1); break;
        case 'drop': hardDrop(); break;
        case 'pause': togglePause(); break;
      }
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (btn.setPointerCapture) { try { btn.setPointerCapture(e.pointerId); } catch (err) {} }
      fire();
      if (act === 'left' || act === 'right' || act === 'soft')
        iv = setInterval(fire, 110);
    });
    const stop = () => { if (iv) { clearInterval(iv); iv = null; } };
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('lostpointercapture', stop);
  });

  window.addEventListener('resize', () => {
    setupMini(holdCv);
    setupMini(nextCv);
    updateMinis();
  });

  // mobile hiding applied from JS so it works even if a stale cached sheet
  // wins the race; inline styles outrank stylesheets, and the panels are
  // located by their long-existing ids/classes, not new markup
  function applyMobileUI() {
    const narrow = window.innerWidth <= 940 || window.matchMedia('(pointer:coarse)').matches;
    const targets = [];
    const hc = $('holdCv');
    if (hc && hc.closest('.panel')) targets.push(hc.closest('.panel'));
    document.querySelectorAll('.keys').forEach(el => targets.push(el));
    document.querySelectorAll('.hide-mobile').forEach(el => { if (targets.indexOf(el) === -1) targets.push(el); });
    targets.forEach(el => { el.style.display = narrow ? 'none' : ''; });
    // the Next canvas spacing fix, also applied inline
    nextCv.style.height = narrow ? '224px' : '';
    nextCv.style.flex = narrow ? '0 0 auto' : '';
    updateMinis();
  }
  window.addEventListener('resize', applyMobileUI);
  applyMobileUI();

  /* ---------------- init ---------------- */
  grid = emptyGrid();
  score = 0; lines = 0; level = 1; chain = 0;
  holdKey = null; canHold = true;
  refill();
  setupMini(holdCv);
  setupMini(nextCv);
  updateMinis();
  hud();
  showScreen('start');
  music.onBeat = () => { if (window.NEONPULSE) window.NEONPULSE(0.3); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { updateMinis(); });
  requestAnimationFrame(frame);
})();
