/* ============================================================================
 * music.js  —  generative, layered background music (pure Web Audio).
 * Every note is synthesized in code; no files, no libraries, no network.
 * Shares the ONE AudioContext that audio.js owns (Sound.context()) so iOS is
 * happy and a single first-tap unlock covers both. Runs on its own music bus
 * with independent mute/volume. Node-safe (all ctx/window access guarded → no-op).
 * NEVER touches game logic; view.js drives it at event points.
 * ========================================================================== */
(function () {
  "use strict";

  var LS = { muted: 'ddd_music_muted', vol: 'ddd_music_vol' };
  var DEFAULT_VOL = 0.24;                    // sits gently under the SFX

  function lsGet(k) { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); } catch (e) {} }

  var muted = lsGet(LS.muted) === '1';
  var volRaw = parseFloat(lsGet(LS.vol));
  var vol = (isFinite(volRaw) && volRaw >= 0 && volRaw <= 1) ? volRaw : DEFAULT_VOL;

  // ---- biome palettes (structured so kitchen/etc. drop in later) -----------
  // scale = semitone offsets from root; progression = one chord per bar over the
  // 8-bar loop. Desk = C Lydian (the #4 / F# supplies the whimsy).
  var CH = {
    Cmaj7: { root: 0, pcs: [0, 4, 7, 11] },   // C E G B
    D:     { root: 2, pcs: [2, 6, 9] },        // D F# A  (the Lydian II)
    G:     { root: 7, pcs: [7, 11, 2] },       // G B D
    Em7:   { root: 4, pcs: [4, 7, 11, 2] }     // E G B D
  };
  var PALETTES = {
    desk: {
      bpm: 90, rootMidi: 60,                                    // C4
      scale: [0, 2, 4, 6, 7, 9, 11],                            // Lydian
      progression: [CH.Cmaj7, CH.Cmaj7, CH.D, CH.D, CH.Cmaj7, CH.Cmaj7, CH.G, CH.G],
      melodyRange: [67, 81],                                    // G4 .. A5
      padCut: 1400, melodyCut: 1800, padGain: 0.5
    }
  };

  // ---- lazy shared audio graph (null in node / unsupported) ----------------
  var ctx = null, bus = null, noiseBuf = null, layers = null, started = false;
  var pal = PALETTES.desk;

  function getCtx() {
    if (ctx) return ctx;
    try {
      if (typeof window !== 'undefined' && window.Sound && window.Sound.context) ctx = window.Sound.context();
      if (!ctx) {                                              // fallback if audio.js absent
        var Ctor = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
        if (!Ctor) return null;
        ctx = new Ctor();
      }
    } catch (e) { ctx = null; return null; }
    return ctx;
  }

  function build() {
    if (bus || !getCtx()) return bus;
    try {
      bus = ctx.createGain();
      bus.gain.value = muted ? 0 : vol;
      // soft master lowpass keeps the whole loop warm & rounded (no brittle highs)
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.4;
      bus.connect(lp); lp.connect(ctx.destination);
      var n = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      // one gain node per layer; `vol` is its target level when on
      layers = {};
      var defs = {
        pad: 0.5, bass: 0.5, melody: 0.42, perc: 0.32,          // biome bed
        intBass: 0.5, drums: 0.5, tensionPad: 0.42, phase2: 0.4 // intensity (start off)
      };
      Object.keys(defs).forEach(function (k) {
        var g = ctx.createGain(); g.gain.value = 0; g.connect(bus);
        layers[k] = { gain: g, vol: defs[k], on: false, fade: null };
      });
    } catch (e) { bus = null; return null; }
    return bus;
  }

  function applyBus() { if (bus && ctx) { try { bus.gain.setTargetAtTime(muted ? 0 : vol, ctx.currentTime, 0.05); } catch (e) {} } }

  // crossfade a layer in/out over ~one bar; keep it "on" (scheduling) until the
  // fade-out finishes so the tail still sounds.
  function barSeconds() { return 60 / pal.bpm * 4; }
  function setLayer(name, on) {
    var L = layers && layers[name]; if (!L || !ctx) return;
    if (L.fade) { clearTimeout(L.fade); L.fade = null; }
    var now = ctx.currentTime, dur = barSeconds();
    try {
      L.gain.gain.cancelScheduledValues(now);
      L.gain.gain.setValueAtTime(Math.max(0.0001, L.gain.gain.value), now);
      L.gain.gain.linearRampToValueAtTime(on ? L.vol : 0.0001, now + dur);
    } catch (e) {}
    if (on) L.on = true;
    else L.fade = setTimeout(function () { L.on = false; L.fade = null; }, dur * 1000 + 80);
  }

  // ---- synth voices (reusable; oscillators stop after their envelope) ------
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function osc(type, freq, t, dur, dest, peak, attack, cutoff) {
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain(), node = g;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (cutoff) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); f.connect(g); }
    else o.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
    return o;
  }

  // soft evolving pad: each chord tone = two detuned oscillators, slow attack
  function padChord(pcs, t, dur, dest, cut, level) {
    if (!ctx) return;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut || 1600;
    var g = ctx.createGain(); g.gain.value = 1; lp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level || 0.5, t + dur * 0.35);       // slow swell
    g.gain.linearRampToValueAtTime(0.0001, t + dur);                    // slow release
    var notes = [48 + pcs[0]];                                          // a low anchor
    pcs.forEach(function (pc) { notes.push(60 + pc); });
    notes.forEach(function (m) {
      [-4, 4].forEach(function (cents) {
        var o = ctx.createOscillator(); o.type = 'triangle';
        o.frequency.value = mtof(m) * Math.pow(2, cents / 1200 / 100);
        o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
      });
    });
  }

  function noise(t, dur, dest, peak, filterType, freq, q) {
    if (!ctx || !noiseBuf) return;
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var g = ctx.createGain(), out = g;
    if (filterType) { var f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq || 2000; if (q != null) f.Q.value = q; s.connect(f); f.connect(g); }
    else s.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(dest);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function kick(t, dest) {
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.2);
  }
  function snare(t, dest) { noise(t, 0.14, dest, 0.3, 'bandpass', 1600, 0.8); osc('triangle', 200, t, 0.09, dest, 0.18, 0.004); }

  // ---- transport (the one clock: 16th-note look-ahead scheduler) -----------
  var timer = null, nextNoteTime = 0, step = 0, lastMelody = 74;
  var LOOKAHEAD = 25, AHEAD = 0.1;
  function sec16() { return 60 / pal.bpm / 4; }

  function scalePitchesInRange() {
    var lo = pal.melodyRange[0], hi = pal.melodyRange[1], out = [];
    for (var m = lo; m <= hi; m++) { var pc = ((m - pal.rootMidi) % 12 + 12) % 12; if (pal.scale.indexOf(pc) > -1) out.push(m); }
    return out;
  }
  function pickMelody(chord) {
    var pitches = scalePitchesInRange();
    var chordOnly = pitches.filter(function (m) { return chord.pcs.indexOf(((m - pal.rootMidi) % 12 + 12) % 12) > -1; });
    var pool = (Math.random() < 0.75 && chordOnly.length) ? chordOnly : pitches;
    pool = pool.slice().sort(function (a, b) { return Math.abs(a - lastMelody) - Math.abs(b - lastMelody); });   // stepwise bias
    var idx = Math.floor(Math.random() * Math.min(4, pool.length));                                             // one of the nearest few
    lastMelody = pool[idx]; return lastMelody;
  }

  function scheduleStep(s, t) {
    if (!layers) return;
    var beatStep = s % 16, barInLoop = Math.floor(s / 16) % 8, chord = pal.progression[barInLoop];
    // --- biome bed ---
    if (layers.pad.on && beatStep === 0) padChord(chord.pcs, t, barSeconds() * 1.05, layers.pad.gain, pal.padCut, pal.padGain);
    if (layers.bass.on) {                                     // sparse roots
      if (beatStep === 0) osc('triangle', mtof(36 + chord.root), t, 0.6, layers.bass.gain, 0.5, 0.01, 500);
      else if (beatStep === 8 && Math.random() < 0.45) osc('triangle', mtof(36 + chord.root), t, 0.4, layers.bass.gain, 0.35, 0.01, 500);
    }
    if (layers.melody.on && beatStep % 2 === 0 && Math.random() < 0.4) {   // ~40% of eighths → breathes
      osc('triangle', mtof(pickMelody(chord)), t, 0.5, layers.melody.gain, 0.34, 0.014, pal.melodyCut);   // softer attack, no click
    }
    if (layers.perc.on) {                                     // light, soft pencil-tap ticks
      if (beatStep === 4 || beatStep === 12) noise(t, 0.03, layers.perc.gain, 0.2, 'bandpass', 1600, 1.1);
      else if (Math.random() < 0.06) noise(t, 0.02, layers.perc.gain, 0.12, 'bandpass', 2000, 1.2);
    }
    // --- intensity layers ---
    if (layers.intBass.on && beatStep % 2 === 0) {            // driving eighth-note bass (triangle = rounder than saw)
      osc('triangle', mtof(36 + chord.root), t, 0.24, layers.intBass.gain, 0.42, 0.008, 500);
    }
    if (layers.drums.on) {
      if (beatStep === 0 || beatStep === 8) kick(t, layers.drums.gain);
      if (beatStep === 4 || beatStep === 12) snare(t, layers.drums.gain);
    }
    if (layers.tensionPad.on && beatStep === 0) {             // sustained held chord (boss)
      padChord([chord.root, (chord.root + 7) % 12], t, barSeconds() * 1.1, layers.tensionPad.gain, 900, 0.5);
    }
    if (layers.phase2.on) {                                   // busier hats + chord arp (tamed highs)
      noise(t, 0.02, layers.phase2.gain, beatStep % 2 === 0 ? 0.13 : 0.07, 'bandpass', 4000, 1.2);
      if (beatStep % 2 === 0) { var arp = chord.pcs[(s / 2) % chord.pcs.length | 0]; osc('triangle', mtof(72 + arp), t, 0.12, layers.phase2.gain, 0.13, 0.006, 2000); }
    }
  }

  function tick() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + AHEAD) {
      scheduleStep(step, nextNoteTime);
      nextNoteTime += sec16(); step++;
    }
  }

  // ---- public API (all guarded → never throws into gameplay) ---------------
  function start() {
    try {
      if (started || !build()) return;
      if (ctx.state === 'suspended') ctx.resume();
      started = true; step = 0; nextNoteTime = ctx.currentTime + 0.1;
      ['pad', 'bass', 'melody', 'perc'].forEach(function (k) { setLayer(k, true); });   // biome bed swells in
      timer = setInterval(tick, LOOKAHEAD);
    } catch (e) {}
  }
  function stop() {
    try {
      if (timer) { clearInterval(timer); timer = null; }
      started = false;
      if (layers) Object.keys(layers).forEach(function (k) { setLayer(k, false); });
    } catch (e) {}
  }
  function setBiome(name) {
    try {
      var p = PALETTES[name]; if (!p) return;
      pal = p;   // (single biome for now; structured for crossfade when more exist)
    } catch (e) {}
  }
  function enterMiniboss() { try { setLayer('intBass', true); setLayer('drums', true); } catch (e) {} }
  function enterBoss() { try { setLayer('intBass', true); setLayer('drums', true); setLayer('tensionPad', true); } catch (e) {} }
  function bossPhase(n) { try { if (n === 2) setLayer('phase2', true); } catch (e) {} }
  function clearBoss() { try { ['intBass', 'drums', 'tensionPad', 'phase2'].forEach(function (k) { setLayer(k, false); }); } catch (e) {} }

  function toggleMuted() { muted = !muted; lsSet(LS.muted, muted ? '1' : '0'); applyBus(); return muted; }
  function isMuted() { return muted; }
  function setVolume(v) { v = +v; if (!isFinite(v)) return; vol = Math.max(0, Math.min(1, v)); lsSet(LS.vol, String(vol)); applyBus(); }
  function getVolume() { return vol; }

  var Music = {
    start: start, stop: stop, setBiome: setBiome,
    enterMiniboss: enterMiniboss, enterBoss: enterBoss, bossPhase: bossPhase, clearBoss: clearBoss,
    toggleMuted: toggleMuted, isMuted: isMuted, setVolume: setVolume, getVolume: getVolume
  };

  if (typeof window !== 'undefined') window.Music = Music;
  if (typeof module !== 'undefined') module.exports = Music;
})();
