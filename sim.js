/* ============================================================================
 * sim.js  —  headless balance harness. Auto-plays many runs at several
 * investment tiers and prints win-rate / depth / economy. Pure engine, no DOM.
 *   node sim.js            # default 300 runs/tier
 *   node sim.js 1000       # custom run count
 * The auto-player is deliberately simple (a competent-but-not-optimal policy);
 * read the numbers as a relative curve, not an absolute skill ceiling.
 * ========================================================================== */
var path = require('path');
global.CONTENT = require(path.join(__dirname, 'content.js'));
var E = require(path.join(__dirname, 'engine.js'));
var C = global.CONTENT;

var N = parseInt(process.argv[2], 10) || 300;

// deterministic-ish RNG so runs are reproducible across invocations
var seed = 123456789;
function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

function pip(v) { return v === 'W' ? 6 : (v === 1 ? 6 : v); }

// reroll low, non-matching dice while budget remains
function autoReroll(st) {
  var p = st.player, guard = 0;
  while (p.rerolls > 0 && guard++ < 24) {
    var counts = {}; p.dice.forEach(function (d) { if (d.value !== 'W') counts[d.value] = (counts[d.value] || 0) + 1; });
    var modal = null, mc = 0; Object.keys(counts).forEach(function (k) { if (counts[k] > mc) { mc = counts[k]; modal = +k; } });
    var idx = -1, lo = 99;
    p.dice.forEach(function (d, i) {
      if (d.anchor) return;
      var matches = mc > 1 && d.value == modal, pv = pip(d.value);
      if (!matches && pv < lo) { lo = pv; idx = i; }
    });
    if (idx < 0 || lo >= 5) break;               // nothing worth rerolling
    if (!E.rerollDie(st, idx, rng)) break;
  }
}

var SUPPORT = { mender: 1, warden: 1, standard: 1, summoner: 1, hexer: 1, jammer: 1, jailer: 1, rust: 1, sealer: 1, fogger: 1 };
function chooseTarget(st) {
  var live = st.enemies.map(function (e, i) { return { e: e, i: i }; }).filter(function (o) { return o.e.hp > 0; });
  if (!live.length) return 0;
  function rank(o) {
    if (o.e._totem) return 0;                    // break lifelink first
    if (SUPPORT[o.e.role]) return 1;             // then supports/debuffers
    if (o.e.role === 'boss') return 3;           // boss last
    return 2;
  }
  live.sort(function (a, b) { return rank(a) - rank(b) || a.e.hp - b.e.hp; });
  return live[0].i;
}

var REWARD_PREF = ['forge', 'load', 'echo', 'freeroll', 'overcharge', 'engrave', 'magnet',
  'whetstone', 'bulwark', 'siphon', 'cleave', 'shockwave', 'bubble', 'twin', 'uniform',
  'brand', 'momentum', 'banker', 'overflow', 'ascend', 'kindle', 'ward', 'piercer', 'bulkUp', 'patient'];
// a cautious player avoids steep HP/reroll-slashing tradeoffs it can't reliably pilot
var AVOID = { glassCannon: 1, allOrNothing: 1, liveWire: 1, pawnbroker: 1, allInRoll: 1, sacrificialDie: 1, doubleNothing: 1, scarTissue: 1, reckless: 1, greed: 1 };
function pickReward(offer) {
  var safe = offer.filter(function (u) { return !AVOID[u.id]; });
  var pool = safe.length ? safe : offer;
  for (var k = 0; k < REWARD_PREF.length; k++) { var f = pool.find(function (u) { return u.id === REWARD_PREF[k]; }); if (f) return f; }
  return pool[0];
}
// does the offer contain anything from the top of our preference list?
function offerHasTopPick(offer) {
  return offer.some(function (u) { return REWARD_PREF.indexOf(u.id) > -1 && REWARD_PREF.indexOf(u.id) < 10 && !AVOID[u.id]; });
}

function playRun(bank) {
  var st = { bank: bank };
  E.startRun(st, rng);
  var guard = 0, beansEarned = 0, visits = {};
  while (guard++ < 1200) {
    var ph = st.phase;
    if (ph === 'win' || ph === 'lose' || ph === 'left') break;
    visits[ph] = (visits[ph] || 0) + 1;
    if (ph === 'map') {
      var opts = E.reachable(st); if (!opts.length) break;
      var pick = opts[Math.floor(rng() * opts.length)];
      E.enterNode(st, pick.col, pick.row, rng);
    } else if (ph === 'player') {
      autoReroll(st);
      st.targetIdx = chooseTarget(st);
      var r = E.attack(st, rng);
      if (r.allDead) { E.winFight(st); continue; }
      var et = E.enemyTurn(st, rng);
      if (et.playerDead) { E.loseRun(st); }
      else if (et.allDead) { E.winFight(st); }
      else E.advanceAfterEnemy(st, rng);
    } else if (ph === 'reward') {
      var offer = E.offerRewards(st);
      if (!offerHasTopPick(offer) && st.run.optionRerolls > 0) { E.rerollOffer(st); continue; }   // reroll a junk offer once
      var u = pickReward(offer); E.applyReward(st, u.id, rng, undefined);
      if (st.run.pendingRewards <= 0) E.toMap(st);
    } else if (ph === 'treasure') { if (st.treasure[0]) E.applyPremium(st, st.treasure[0].id, undefined); E.toMap(st); }
    else if (ph === 'rest') { E.restHeal(st); }
    else if (ph === 'shop') { var best = pickReward(st.shop.offers); if (best) E.buyRunUpgrade(st, best.id, rng, undefined); E.toMap(st); }
    else if (ph === 'reforge') { E.toMap(st); }                      // auto-player skips paid reforge
    else if (ph === 'event') { E.applyEvent(st, 0, rng); if (st.phase === 'event') E.toMap(st); }
    else if (ph === 'miniboss') { E.toMap(st); }                     // always press on
    else break;
  }
  var col = st.run.pos ? st.run.pos.col + 1 : 0;
  if (st.phase === 'win') col = C.MAP.cols;
  return { phase: st.phase, node: col, beans: st.player.runCurrency, visits: visits, upgrades: st.player.upgrades };
}

// ---- tiers --------------------------------------------------------------
function freshBank() { return E.newBank(); }
function tierBank(setup) { var b = freshBank(); setup(b); return b; }
var tiers = [
  { name: 'bare',         make: function () { return freshBank(); } },
  { name: 'mid',          make: function () { return tierBank(function (b) { b.diceCount = 3; b.hpBought = 2; b.rerollBought = 1; b.healBought = 1; }); } },
  { name: 'full',         make: function () { return tierBank(full); } },
  { name: 'full+brute',   make: function () { var b = tierBank(full); E.applyClass(b, 'brute'); return b; } },
  { name: 'full+warden',  make: function () { var b = tierBank(full); E.applyClass(b, 'warden'); return b; } },
  { name: 'full+gambler', make: function () { var b = tierBank(full); E.applyClass(b, 'gambler'); return b; } },
  { name: 'full+tinkerer',make: function () { var b = tierBank(full); E.applyClass(b, 'tinkerer'); return b; } }
];
function full(b) { b.diceCount = 5; b.hpBought = 8; b.armorBought = 3; b.rerollBought = 3; b.healBought = 3; b.beansBought = 2; b.luckBought = 2; }

// ---- run ----------------------------------------------------------------
function pct(n, d) { return (100 * n / d).toFixed(1) + '%'; }
function setSeed(s) { seed = s; }
function runTier(t, n) {
  var win = 0, left = 0, lose = 0, nodeSum = 0, beanSum = 0, upgSum = 0;
  for (var i = 0; i < n; i++) {
    var r = playRun(t.make());
    if (r.phase === 'win') win++; else if (r.phase === 'left') left++; else lose++;
    nodeSum += r.node; beanSum += r.beans; upgSum += r.upgrades;
  }
  return { win: win, left: left, lose: lose, node: nodeSum / n, beans: beanSum / n, upg: upgSum / n, n: n };
}
function report(n) {
  console.log('Dicey Desk Duels balance sim — ' + n + ' runs/tier\n');
  console.log(['tier', 'win%', 'left%', 'lose%', 'avgNode', 'avgBeans', 'avgUpg'].map(function (s) { return s.padEnd(12); }).join(''));
  tiers.forEach(function (t) {
    var r = runTier(t, n);
    console.log([t.name, pct(r.win, n), pct(r.left, n), pct(r.lose, n), r.node.toFixed(1), r.beans.toFixed(0), r.upg.toFixed(1)]
      .map(function (s) { return String(s).padEnd(12); }).join(''));
  });
}

module.exports = { playRun: playRun, tiers: tiers, runTier: runTier, setSeed: setSeed, full: full };
if (require.main === module) report(N);
