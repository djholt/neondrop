'use strict';
/* NEON DROP — synthesized audio engine. No audio files: everything is Web Audio.
   Buses: master -> compressor -> speakers.  sfxBus and musicBus feed master.
   A feedback delay gives the music its spacey echo. */
const NeonAudio = (function () {
  let ctx = null, master = null, sfxBus = null, musicBus = null, echoIn = null, noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 22; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    master.connect(comp); comp.connect(ctx.destination);

    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);

    // echo: delay -> lowpass -> feedback, wet out
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.23;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2400;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    delay.connect(damp); damp.connect(fb); fb.connect(delay);
    damp.connect(wet); wet.connect(master);
    echoIn = delay;

    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function env(g, t, vol, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // Generic oscillator blip. slide is a frequency multiplier over the note.
  function tone(o) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.t0 || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freq * o.slide), t + o.dur);
    const g = ctx.createGain(); env(g, t, o.vol || 0.3, o.dur);
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.dest || sfxBus);
    if (o.echo && echoIn) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(echoIn); }
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  function noise(o) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.t0 || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'highpass';
    f.frequency.setValueAtTime(o.filter || 3000, t);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, (o.filter || 3000) * o.slide), t + o.dur);
    const g = ctx.createGain(); env(g, t, o.vol || 0.3, o.dur);
    s.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    s.start(t); s.stop(t + o.dur + 0.05);
  }

  /* ---------------- sound effects ---------------- */
  const sfx = {
    move()     { tone({ freq: 260, type: 'square', dur: 0.045, vol: 0.11 }); },
    rotate()   { tone({ freq: 440, slide: 1.5, type: 'triangle', dur: 0.08, vol: 0.22 }); },
    lock()     { tone({ freq: 180, slide: 0.4, type: 'sine', dur: 0.14, vol: 0.5 });
                 noise({ dur: 0.06, vol: 0.14, filter: 1200, type: 'lowpass' }); },
    hardDrop() { noise({ dur: 0.18, vol: 0.5, filter: 2400, slide: 0.15, type: 'lowpass' });
                 tone({ freq: 300, slide: 0.15, type: 'square', dur: 0.2, vol: 0.32 }); },
    hold()     { tone({ freq: 330, slide: 1.6, type: 'sine', dur: 0.09, vol: 0.25 });
                 tone({ freq: 495, type: 'sine', dur: 0.07, vol: 0.12, t0: 0.06 }); },
    // n = lines cleared this drop, chain = current combo chain
    clear(n, chain) {
      const base = [523.25, 587.33, 659.25, 783.99];
      for (let i = 0; i < n; i++) {
        tone({ freq: base[i] * Math.pow(2, Math.min(chain, 8) / 12), type: 'square',
               dur: 0.12, vol: 0.22, echo: 0.35, t0: i * 0.06, filter: 5000 });
      }
      if (n === 4) sfx.tetris();
    },
    tetris() {
      const notes = [659.25, 783.99, 987.77, 1318.5];
      notes.forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.5, vol: 0.18,
                                     echo: 0.5, t0: 0.05 + i * 0.09, filter: 4200 }));
      noise({ dur: 0.5, vol: 0.08, filter: 9000, type: 'highpass', t0: 0.1 });
    },
    levelUp() { tone({ freq: 300, slide: 4, type: 'sawtooth', dur: 0.5, vol: 0.22, echo: 0.4, filter: 3500 });
                tone({ freq: 600, slide: 4, type: 'square',  dur: 0.4, vol: 0.1,  t0: 0.08 }); },
    start()   { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
                  tone({ freq: f, type: 'square', dur: 0.14, vol: 0.18, echo: 0.3, t0: i * 0.07 })); },
    gameOver() {
      [440, 392, 329.63, 261.63, 220].forEach((f, i) =>
        tone({ freq: f, type: 'sawtooth', dur: 0.55, vol: 0.2, echo: 0.4, t0: i * 0.17, filter: 2500 }));
      noise({ dur: 1.2, vol: 0.06, filter: 900, slide: 0.2, type: 'lowpass', t0: 0.2 });
    },
  };

  /* ---------------- music: Korobeiniki, 8 bars, eighth-note grid ---------------- */
  const MELODY = [
    76, 0, 71, 72, 74, 0, 72, 71,
    69, 0, 69, 60, 64, 0, 69, 67,
    71, 0, 72, 76, 0, 74, 72, 0,
    71, 0, 0, 72, 69, 0, 0, 0,
    76, 0, 71, 72, 74, 0, 72, 71,
    69, 0, 69, 60, 64, 0, 69, 67,
    71, 0, 72, 76, 0, 74, 72, 0,
    71, 0, 0, 72, 69, 0, 0, 0,
  ];
  const BASS_ROOTS = [110, 110, 82.41, 110, 110, 110, 82.41, 110]; // A2 / E2 per bar
  const BASS_PAT = [0, 12, 7, 12, 0, 12, 7, 12];                   // root-octave-fifth bounce

  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function lead(f, t, dur) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'square'; o2.type = 'square';
    o1.frequency.value = f; o2.frequency.value = f; o2.detune.value = 9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.012);
    g.gain.setValueAtTime(0.15, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(musicBus);
    const e = ctx.createGain(); e.gain.value = 0.3; g.connect(e); e.connect(echoIn);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }

  const music = {
    bpm: 104,
    playing: false,
    step: 0,
    nextTime: 0,
    timer: null,
    onBeat: null, // game hooks a visual-pulse callback here

    start() {
      ensure();
      if (!ctx || this.playing) return;
      this.playing = true;
      this.step = 0;
      this.nextTime = ctx.currentTime + 0.08;
      this.timer = setInterval(() => this.tick(), 25);
    },
    stop() {
      this.playing = false;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    },
    tick() {
      if (!ctx || !this.playing) return;
      const e = 60 / this.bpm / 2; // one eighth note
      while (this.nextTime < ctx.currentTime + 0.12) {
        this.playStep(this.step, this.nextTime, e);
        this.nextTime += e;
        this.step = (this.step + 1) % 64;
      }
    },
    playStep(i, t, e) {
      const bar = i >> 3, s = i & 7;

      const m = MELODY[i];
      if (m) lead(midi(m), t, e * 0.92);

      // bass: root / octave / fifth triangle
      const b = BASS_ROOTS[bar] * Math.pow(2, BASS_PAT[s] / 12);
      tone({ freq: b, type: 'triangle', dur: e * 1.3, vol: 0.3, dest: musicBus, t0: t - ctx.currentTime, filter: 700 });

      // drums
      if (s === 0 || s === 4) {
        tone({ freq: 150, slide: 0.3, type: 'sine', dur: 0.12, vol: 0.55, dest: musicBus, t0: t - ctx.currentTime });
        if (this.onBeat) {
          const cb = this.onBeat;
          setTimeout(cb, Math.max(0, (t - ctx.currentTime) * 1000));
        }
      }
      if (s === 4) noise({ dur: 0.08, vol: 0.16, filter: 1800, type: 'bandpass', dest: musicBus, t0: t - ctx.currentTime });
      noise({ dur: s % 2 ? 0.025 : 0.04, vol: s % 2 ? 0.04 : 0.07, filter: 7500, type: 'highpass', dest: musicBus, t0: t - ctx.currentTime });
    },
  };

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.03);
  }

  window.NeonAudio = {
    ensure,
    setMuted,
    isMuted: () => muted,
    sfx,
    music,
  };
})();
