/* ============================================================================
 * audio.js  —  self-contained Web Audio sound effects.
 * Every effect is synthesized in code (oscillators + gain envelopes, a little
 * noise for texture). No audio files, no libraries, no network. Safe to require
 * in node (becomes a silent no-op — all AudioContext/window access is guarded).
 * This file NEVER touches game logic; view.js calls into it at event points.
 * ========================================================================== */
(function () {
  "use strict";

  var LS = { muted: 'ddd_muted', vol: 'ddd_vol' };
  var DEFAULT_VOL = 0.38;                // comfortable, not blaring

  // -- persisted settings (guard localStorage: absent/blocked in some contexts)
  function lsGet(k) { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); } catch (e) {} }

  var muted = lsGet(LS.muted) === '1';
  var volRaw = parseFloat(lsGet(LS.vol));
  var vol = (isFinite(volRaw) && volRaw >= 0 && volRaw <= 1) ? volRaw : DEFAULT_VOL;

  // -- lazy audio graph (created on first use; null in node / unsupported)
  var ctx = null, master = null, noiseBuf = null, unlocked = false;

  function AC() { return (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext); }

  function ensure() {
    if (ctx) return ctx;
    var Ctor = AC();
    if (!Ctor) return null;                 // node or no Web Audio → stay silent
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : vol;
      // gentle master lowpass rolls off the harsh/brittle top end so ticks & blips
      // sound rounded instead of sharp (keeps enough sparkle to still read).
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.4;
      master.connect(lp); lp.connect(ctx.destination);
      // one short mono noise buffer, reused for tumble/thud texture
      var n = Math.floor(ctx.sampleRate * 0.4);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; return null; }
    return ctx;
  }

  function applyMaster() { if (master && ctx) { try { master.gain.value = muted ? 0 : vol; } catch (e) {} } }

  // -- tiny synth helpers ----------------------------------------------------
  // a single oscillator with an exponential-decay gain envelope
  function tone(opts) {
    if (!ctx) return;
    var t0 = ctx.currentTime + (opts.at || 0);
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.f, t0);
    if (opts.to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
    var peak = opts.gain != null ? opts.gain : 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + opts.dur + 0.02);
  }

  // a burst of filtered noise from the shared buffer
  function noise(opts) {
    if (!ctx || !noiseBuf) return;
    var t0 = ctx.currentTime + (opts.at || 0);
    var src = ctx.createBufferSource(); src.buffer = noiseBuf;
    var g = ctx.createGain(), out = g;
    if (opts.filter) {
      var flt = ctx.createBiquadFilter();
      flt.type = opts.filter; flt.frequency.value = opts.freq || 1200;
      if (opts.q != null) flt.Q.value = opts.q;
      src.connect(flt); flt.connect(g); out = g;
    } else src.connect(g);
    var peak = opts.gain != null ? opts.gain : 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    out.connect(master);
    src.start(t0); src.stop(t0 + opts.dur + 0.02);
  }

  // -- per-effect synth functions -------------------------------------------
  var FX = {
    roll: function () {                     // dice tumble: filtered noise + a few clicks
      noise({ filter: 'bandpass', freq: 1600, q: 0.8, dur: 0.22, gain: 0.22 });
      for (var i = 0; i < 4; i++) tone({ type: 'square', f: 300 + Math.random() * 500, dur: 0.03, gain: 0.06, at: i * 0.04 });
    },
    lock: function () {                     // soft tick when poking a single die
      tone({ type: 'sine', f: 880, to: 660, dur: 0.06, gain: 0.14, attack: 0.002 });
    },
    attack: function () {                   // meaty low thud + a hint of noise
      tone({ type: 'triangle', f: 150, to: 60, dur: 0.22, gain: 0.4, attack: 0.004 });
      tone({ type: 'sine', f: 90, to: 45, dur: 0.28, gain: 0.3 });
      noise({ filter: 'lowpass', freq: 400, dur: 0.09, gain: 0.14 });
    },
    enemyHurt: function () {                // short descending blip
      tone({ type: 'triangle', f: 520, to: 240, dur: 0.12, gain: 0.18 });
    },
    playerHurt: function () {               // harsher lower buzz
      tone({ type: 'sawtooth', f: 200, to: 90, dur: 0.18, gain: 0.24, attack: 0.003 });
      noise({ filter: 'lowpass', freq: 700, dur: 0.1, gain: 0.1 });
    },
    heal: function () {                     // gentle upward shimmer
      tone({ type: 'sine', f: 440, to: 880, dur: 0.35, gain: 0.2, attack: 0.02 });
      tone({ type: 'sine', f: 660, to: 1320, dur: 0.3, gain: 0.1, at: 0.04 });
    },
    shield: function () {                   // glassy high tick
      tone({ type: 'triangle', f: 1400, to: 1900, dur: 0.14, gain: 0.16, attack: 0.002 });
      tone({ type: 'sine', f: 2100, dur: 0.1, gain: 0.08, at: 0.02 });
    },
    win: function () {                      // short triumphant major arpeggio
      var notes = [523.25, 659.25, 783.99, 1046.5];   // C E G C
      notes.forEach(function (f, i) { tone({ type: 'triangle', f: f, dur: 0.32, gain: 0.22, at: i * 0.08 }); });
    },
    lose: function () {                     // descending squash
      tone({ type: 'sawtooth', f: 300, to: 70, dur: 0.5, gain: 0.28, attack: 0.005 });
      noise({ filter: 'lowpass', freq: 500, dur: 0.3, gain: 0.12 });
    },
    button: function () {                   // subtle UI tick
      tone({ type: 'sine', f: 660, dur: 0.05, gain: 0.1, attack: 0.002 });
    },
    purchase: function () {                 // two quick ascending notes, a coin chime
      tone({ type: 'triangle', f: 880, dur: 0.12, gain: 0.2 });
      tone({ type: 'triangle', f: 1320, dur: 0.18, gain: 0.2, at: 0.09 });
      tone({ type: 'sine', f: 2640, dur: 0.12, gain: 0.06, at: 0.09 });
    },
    allyhit: function () {                   // light metallic jab — an ally strike (paperclip/pitcherling)
      tone({ type: 'square', f: 720, to: 380, dur: 0.09, gain: 0.15, attack: 0.002 });
      tone({ type: 'triangle', f: 1500, to: 900, dur: 0.07, gain: 0.1, at: 0.01 });
    },
    poison: function () {                    // soft bubbling hiss — a venom/poison tick
      noise({ filter: 'bandpass', freq: 900, q: 1.2, dur: 0.26, gain: 0.13 });
      tone({ type: 'sine', f: 320, to: 200, dur: 0.22, gain: 0.1, attack: 0.02 });
    }
  };

  // -- combo stinger ---------------------------------------------------------
  // baseMult is the raw C.COMBOS value the engine returns (1 = no combo, up to 5
  // for Five of a Kind). Its ascending order IS the ladder: 1.5 One Pair, 2.5
  // Three of a Kind, 3 Two Pair, 3.5 Four of a Kind, 4.5 Full House/Straight,
  // 5 Five of a Kind. Higher tier → more notes, higher root; climaxes on 5oak.
  var LADDER = [1.5, 2.5, 3, 3.5, 4.5, 5];   // tier index 1..6
  function tierOf(baseMult) {
    if (!(baseMult > 1)) return 0;             // no combo → no arpeggio
    var t = 1;
    for (var i = 0; i < LADDER.length; i++) if (baseMult >= LADDER[i] - 0.001) t = i + 1;
    return t;                                  // 1..6
  }
  var MAJOR = [0, 4, 7, 12, 16, 19, 24];       // semitone steps of a rising major arpeggio
  function combo(baseMult) {
    try {
      if (muted || !ensure()) return;
      var tier = tierOf(baseMult);
      if (tier <= 0) return;                    // plain thud handled by play('attack')
      var notes = 1 + tier;                     // 2 notes at One Pair … 7 at Five of a Kind
      var root = 392 * Math.pow(2, (tier - 1) / 12 * 2);   // root climbs with tier
      var top = tier >= 6;                      // Five of a Kind climax
      for (var i = 0; i < notes; i++) {
        var f = root * Math.pow(2, MAJOR[i] / 12);
        tone({ type: 'triangle', f: f, dur: 0.26, gain: 0.16, at: 0.05 + i * 0.06, attack: 0.004 });
      }
      if (top) {                                // extra shimmer on the payoff
        tone({ type: 'sine', f: root * 4, dur: 0.5, gain: 0.08, at: 0.05 + notes * 0.06 });
        tone({ type: 'sine', f: root * 6, dur: 0.4, gain: 0.05, at: 0.1 + notes * 0.06 });
      }
    } catch (e) {}
  }

  // -- public API (all guarded → never throws into gameplay) -----------------
  function play(name) {
    try {
      if (muted || !FX[name] || !ensure()) return;
      FX[name]();
    } catch (e) {}
  }

  function unlock() {
    try {
      if (unlocked) return;
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      unlocked = true;
    } catch (e) {}
  }

  function toggleMuted() {
    muted = !muted; lsSet(LS.muted, muted ? '1' : '0'); applyMaster();
    return muted;
  }
  function isMuted() { return muted; }
  function setVolume(v) {
    v = +v; if (!isFinite(v)) return; vol = Math.max(0, Math.min(1, v));
    lsSet(LS.vol, String(vol)); applyMaster();
  }
  function getVolume() { return vol; }

  // shared with music.js: hand back the one lazy AudioContext (null in node) so
  // music runs off the same ctx — iOS only allows one, and one unlock covers both.
  function context() { return ensure(); }

  var Sound = {
    play: play, combo: combo, unlock: unlock,
    toggleMuted: toggleMuted, isMuted: isMuted,
    setVolume: setVolume, getVolume: getVolume,
    context: context
  };

  if (typeof window !== 'undefined') window.Sound = Sound;
  if (typeof module !== 'undefined') module.exports = Sound;
})();
