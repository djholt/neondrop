'use strict';
/* NEON DROP — background: 3D starfield flight ported from the starfield app.
   The camera always drifts forward; the mouse steers the vanishing point,
   with a slow idle sweep before the first pointer move. Layers: low-res
   dithered nebula gas (#gas), stardust motes and streaked stars (#bg).
   The game calls window.NEONPULSE(amount 0..1) on music kicks, line clears
   and big hits: it tints the sky and gives the flight a small warp surge. */
(function () {
  const cv = document.getElementById('bg');
  const ctx = cv.getContext('2d');
  const gas = document.getElementById('gas');
  const gctx = gas.getContext('2d');

  const DEPTH = 1400;   // how far the star field extends, in z units
  const SPEED = 320;    // forward flight speed, z units per second
  const STEER = 0.62;   // how far the vanishing point follows the cursor
  const TURN = 2.4;     // how quickly the heading turns toward the target

  const COLORS = [
    [223, 232, 255], [207, 217, 255], [235, 240, 255],
    [228, 216, 255], [213, 240, 255], [255, 243, 230],
  ];
  const DUST_COLORS = [
    [129, 140, 248], [192, 132, 252], [94, 234, 212], [56, 189, 248], [148, 163, 184],
  ];
  const GAS_SCALE = 10;
  const GAS_COLORS = [
    [129, 140, 248], [192, 132, 252], [99, 102, 241],
    [56, 189, 248], [94, 234, 212], [148, 163, 184],
  ];

  let w = 0, h = 0, cx = 0, cy = 0, f = 800;
  let gw = 0, gh = 0, gasImg = null;
  let stars = [], dust = [], blobs = [];

  let mx = 0, my = 0;
  const dir = { x: 0, y: 0, z: 1 };
  const target = { x: 0, y: 0, z: 1 };

  let impulse = 0, surge = 0, pulse = 0;

  window.NEONPULSE = function (a) {
    pulse = Math.max(pulse, a);
    impulse = Math.max(impulse, a * 0.55); // the beat nudges the flight speed
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    cx = w / 2;
    cy = h / 2;
    f = Math.min(w, h) * 1.15;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // slightly sparser than the standalone starfield app: this sits behind a game
    const wanted = Math.max(500, Math.min(1600, Math.round((w * h) / 1200)));
    while (stars.length < wanted) stars.push(makeStar(Math.random() * DEPTH));
    if (stars.length > wanted) stars.length = wanted;

    const dustWanted = Math.max(20, Math.min(75, Math.round((w * h) / 28000)));
    while (dust.length < dustWanted) dust.push(makeDust(250 + Math.random() * (DEPTH - 250)));
    if (dust.length > dustWanted) dust.length = dustWanted;

    gw = Math.max(24, Math.ceil(w / GAS_SCALE));
    gh = Math.max(24, Math.ceil(h / GAS_SCALE));
    gas.width = gw;
    gas.height = gh;
    gasImg = gctx.createImageData(gw, gh);
    const blobWanted = Math.max(12, Math.min(28, Math.round((gw * gh) / 640)));
    while (blobs.length < blobWanted) blobs.push(makeBlob());
    if (blobs.length > blobWanted) blobs.length = blobWanted;
  }

  function makeStar(z) {
    const spread = (z / f) * 0.62;
    return {
      x: (Math.random() * 2 - 1) * w * spread,
      y: (Math.random() * 2 - 1) * h * spread,
      z: Math.max(2, z),
      pz: 0,
      size: 0.4 + Math.random() * 1.5,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.55 + Math.random() * 0.45,
    };
  }

  function respawn(s) {
    const fresh = makeStar(DEPTH * (0.85 + Math.random() * 0.15));
    s.x = fresh.x; s.y = fresh.y; s.z = fresh.z; s.pz = 0;
    s.size = fresh.size; s.color = fresh.color;
    s.phase = fresh.phase; s.twinkle = fresh.twinkle;
  }

  function makeDust(z) {
    const spread = (z / f) * 0.8;
    return {
      x: (Math.random() * 2 - 1) * w * spread,
      y: (Math.random() * 2 - 1) * h * spread,
      z: z,
      size: 0.4 + Math.random() * 0.9,
      color: DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0],
      alpha: 0.04 + Math.random() * 0.09,
      phase: Math.random() * Math.PI * 2,
      wobble: 8 + Math.random() * 14,
    };
  }

  function respawnDust(s) {
    const fresh = makeDust(DEPTH * (0.85 + Math.random() * 0.15));
    s.x = fresh.x; s.y = fresh.y; s.z = fresh.z;
    s.size = fresh.size; s.color = fresh.color;
    s.alpha = fresh.alpha; s.phase = fresh.phase; s.wobble = fresh.wobble;
  }

  function makeBlob() {
    const b = {
      x: Math.random() * gw,
      y: Math.random() * gh,
      r: Math.min(gw, gh) * (0.18 + Math.random() * 0.26),
      a: 0.03 + Math.random() * 0.05,
      color: GAS_COLORS[(Math.random() * GAS_COLORS.length) | 0],
      vx: (Math.random() * 2 - 1) * 0.8,
      vy: (Math.random() * 2 - 1) * 0.8,
      sway: 0.04 + Math.random() * 0.08,
      phase: Math.random() * Math.PI * 2,
      pulse: 0.05 + Math.random() * 0.1,
      flash: 0,          // smash energy: >0 while a cleared-row color glows
      fc: null,          // flash color, [r,g,b]
    };
    b.fc = b.color;
    return b;
  }

  function hexRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }

  // Line smash: light up gas blobs with the cleared rows' block colors.
  // More lines = more blobs AND more intensity per blob. The flash rides the
  // blob's own color/alpha and decays over ~2s, so it fades as part of the
  // nebulosity instead of switching off.
  window.NEONBURST = function (lines, colors) {
    if (!blobs.length) return;
    const cols = (colors && colors.length ? colors : ['#818cf8'])
      .map(c => (typeof c === 'string' ? hexRgb(c) : c));
    // level: 0 = piece placed normally (the old hard-drop glow),
    // 0.5 = hard drop (a notch stronger + more blobs),
    // 1+ = line smash: more blobs and more punch per extra line
    const count = Math.min(blobs.length, 4 + Math.floor(lines * 5));
    const intensity = lines <= 0 ? 1.7 : lines < 1 ? 2.0 : 2.4 + (lines - 1) * 1.4;
    // shuffle blob indices so a random spread of blobs lights up
    const idx = blobs.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    for (let k = 0; k < count; k++) {
      const b = blobs[idx[k]];
      b.flash = Math.min(6, Math.max(b.flash, intensity * (0.7 + Math.random() * 0.6)));
      b.fc = cols[(Math.random() * cols.length) | 0];
    }
  };

  // Nebula gas: painted per pixel at 1/10 scale, dithered BEFORE rounding to
  // 8 bits so banding rings never form; upscale + CSS blur smooth it further.
  function drawGas(dt) {
    const data = gasImg.data;
    for (const b of blobs) {
      b.x += (b.vx + Math.cos(elapsed * b.sway + b.phase) * 0.5) * dt;
      b.y += (b.vy + Math.sin(elapsed * b.sway * 1.3 + b.phase) * 0.5) * dt;
      if (b.x < -b.r) b.x = gw + b.r;
      else if (b.x > gw + b.r) b.x = -b.r;
      if (b.y < -b.r) b.y = gh + b.r;
      else if (b.y > gh + b.r) b.y = -b.r;
      b.rr = b.r * (1 + 0.15 * Math.sin(elapsed * b.pulse + b.phase));
      b.aa = b.a * (0.7 + 0.3 * Math.sin(elapsed * b.pulse * 1.7 + b.phase * 2));
      b.rr2 = b.rr * b.rr;

      // smash flash: bleed toward the cleared-row color and brighten,
      // then decay smoothly (~2s tail) into the normal gas breathing
      if (b.flash > 0) {
        b.flash *= Math.exp(-dt / 1.15);
        if (b.flash < 0.01) b.flash = 0;
      }
      const w = Math.min(0.95, b.flash * 0.42);
      b.cr = b.color[0] + (b.fc[0] - b.color[0]) * w;
      b.cg = b.color[1] + (b.fc[1] - b.color[1]) * w;
      b.cb = b.color[2] + (b.fc[2] - b.color[2]) * w;
      b.da = b.aa * (1 + 2.8 * b.flash);
    }

    let i = 0;
    for (let py = 0; py < gh; py++) {
      for (let px = 0; px < gw; px++) {
        let r = 5, g = 6, b = 13; // deep-space base tone
        for (const bl of blobs) {
          const dx = px - bl.x;
          const dy = py - bl.y;
          const t2 = (dx * dx + dy * dy) / bl.rr2;
          if (t2 < 1) {
            const fall = (1 - t2) * (1 - t2) * bl.da;
            r += bl.cr * fall;
            g += bl.cg * fall;
            b += bl.cb * fall;
          }
        }
        const dither = Math.random() * 2 - 1;
        data[i] = r + dither;
        data[i + 1] = g + dither;
        data[i + 2] = b + dither;
        data[i + 3] = 255;
        i += 4;
      }
    }
    gctx.putImageData(gasImg, 0, 0);
  }

  function setPointer(px, py) {
    mx = Math.max(-cx, Math.min(cx, px - cx));
    my = Math.max(-cy, Math.min(cy, py - cy));
    gas.style.setProperty('--px', (mx / cx).toFixed(3));
    gas.style.setProperty('--py', (my / cy).toFixed(3));
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => setPointer(e.clientX, e.clientY));
  let idle = true;
  window.addEventListener('pointermove', () => { idle = false; }, { once: true });

  resize();
  setPointer(cx, cy);

  let last = performance.now();
  let elapsed = 0;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    elapsed += dt;

    // Idle: a slow circular drift until the user takes the wheel.
    let tx = mx, ty = my;
    if (idle) {
      tx = Math.cos(elapsed * 0.32) * cx * 0.28;
      ty = Math.sin(elapsed * 0.23) * cy * 0.2;
    }

    const vx = tx * STEER;
    const vy = ty * STEER;
    const len = Math.hypot(vx, vy, f);
    target.x = vx / len;
    target.y = vy / len;
    target.z = f / len;

    const k = 1 - Math.exp(-TURN * dt);
    dir.x += (target.x - dir.x) * k;
    dir.y += (target.y - dir.y) * k;
    dir.z += (target.z - dir.z) * k;
    const dl = Math.hypot(dir.x, dir.y, dir.z);
    dir.x /= dl; dir.y /= dl; dir.z /= dl;

    // Warp surge: ramps in fast, bleeds off slowly (music kicks, big clears).
    impulse *= Math.exp(-dt * 0.9);
    const surgeTarget = impulse * 1.6;
    surge += (surgeTarget - surge) * (1 - Math.exp(-dt * 7));

    drawGas(dt);

    const move = SPEED * (1 + surge) * dt;
    const dx = -dir.x * move;
    const dy = -dir.y * move;
    const dz = -dir.z * move;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // Stardust: motes drifting at a third of flight speed, wobbling.
    const slow = move * 0.3;
    for (const s of dust) {
      s.x -= dir.x * slow + Math.sin(elapsed * 0.3 + s.phase) * s.wobble * dt;
      s.y -= dir.y * slow + Math.cos(elapsed * 0.24 + s.phase * 1.7) * s.wobble * dt;
      s.z -= dir.z * slow;
      if (s.z <= 120) { respawnDust(s); continue; }

      const sx = cx + (s.x / s.z) * f;
      const sy = cy + (s.y / s.z) * f;
      if (sx < -w * 0.5 || sx > w * 1.5 || sy < -h * 0.5 || sy > h * 1.5) { respawnDust(s); continue; }

      const near = 1 - s.z / DEPTH;
      let a = s.alpha * (0.35 + near * 0.9);
      a *= 0.6 + 0.4 * Math.sin(elapsed * 0.7 + s.phase);
      if (a <= 0.004) continue;

      const [r, g, b] = s.color;
      const rad = s.size * (2.5 + near * 5);
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a})`);
      grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${a * 0.35})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of stars) {
      const oz = s.z, ox = s.x, oy = s.y;
      s.x += dx; s.y += dy; s.z += dz;

      if (s.z <= 4 || s.z > DEPTH + 40) { respawn(s); continue; }

      const sx = cx + (s.x / s.z) * f;
      const sy = cy + (s.y / s.z) * f;
      if (sx < -w || sx > w * 2 || sy < -h || sy > h * 2) { respawn(s); continue; }

      const near = 1 - s.z / DEPTH;
      let a = near * near * (0.28 + s.twinkle * 0.72);
      a *= 0.8 + 0.2 * Math.sin(elapsed * 2.1 + s.phase);
      if (a <= 0.01) continue;
      if (a > 1) a = 1;

      const [r, g, b] = s.color;
      const depth = s.pz && s.pz > 4 ? s.pz : oz;
      const px = cx + (ox / depth) * f;
      const py = cy + (oy / depth) * f;
      const stretch = Math.hypot(sx - px, sy - py);

      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
      if (stretch > 1.2) {
        ctx.lineWidth = Math.min(2.4, s.size * (0.5 + near));
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        const rad = s.size * (0.4 + near * 0.9);
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // game glow pulse: sky-wide cyan wash + magenta horizon bloom
    ctx.globalCompositeOperation = 'source-over';
    if (pulse > 0.01) {
      ctx.fillStyle = 'rgba(34,231,255,' + (pulse * 0.07).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h * 0.95, 10, w / 2, h * 0.95, h * 0.9);
      g.addColorStop(0, 'rgba(255,45,149,' + (pulse * 0.18).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,45,149,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      pulse *= 0.93;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
