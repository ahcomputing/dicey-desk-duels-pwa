/* ============================================================================
 * engine.js  —  PURE game logic. No DOM, no rendering, no timers.
 * Everything here is testable in node (see the headless sim in the README).
 * The view drives it: call a function, read the mutated `state`, render.
 * ========================================================================== */
(function (global) {
  "use strict";
  var C = global.CONTENT || (typeof require !== 'undefined' ? require('./content.js') : null);
  var defaultRng = Math.random;
  function rint(n, rng) { return Math.floor((rng || defaultRng)() * n); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rint(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---- combo evaluation (1 strikes as 6 for the sum; literal for detection) */
  // detect combo on concrete faces (no wilds). `phantom` (optional) flags Splitter copies:
  // a phantom may top a value up to a pair (2) but never form trips+ ("no trips"). Returns {name, mult}.
  function detectCombo(values, phantom) {
    var n = values.length, real = {}, ph = {};
    values.forEach(function (v, i) { if (phantom && phantom[i]) ph[v] = (ph[v] || 0) + 1; else real[v] = (real[v] || 0) + 1; });
    var counts = {};
    Object.keys(real).forEach(function (v) { counts[v] = real[v]; });
    Object.keys(ph).forEach(function (v) { var r = real[v] || 0; counts[v] = r + Math.min(ph[v], Math.max(0, 2 - r)); });
    var cv = Object.keys(counts).map(function (k) { return counts[k]; }).sort(function (a, b) { return b - a; });
    var dist = Object.keys(counts).map(Number).sort(function (a, b) { return a - b; });
    var best = { name: 'No Combo', mult: 1 };
    function set(name) { if (C.COMBOS[name] > best.mult) best = { name: name, mult: C.COMBOS[name] }; }
    var mx = cv[0] || 0, pairs = cv.filter(function (c) { return c === 2; }).length;
    if (mx >= 5) set('Five of a Kind');
    if (mx === 4) set('Four of a Kind');
    if (mx === 3 && cv.indexOf(2) > -1) set('Full House');
    if (mx === 3 && cv.indexOf(2) < 0) set('Three of a Kind');
    if (pairs >= 2) set('Two Pair');
    if (pairs === 1 && mx < 3) set('One Pair');
    if (n >= 5) { var k = dist.join(','); if (k === '1,2,3,4,5' || k === '2,3,4,5,6') set('Straight'); }
    return best;
  }
  // WILD support: a wild rolls as 'W' — counts as any value for detection, exactly 1 for the sum.
  // Args: detect = detection multiset (real + Splitter phantoms); phantom = parallel bool flags;
  //   sumv = real-only values for the sum. Single-arg legacy calls (no phantoms/sumv) are unchanged.
  function evaluate(detect, phantom, sumv) {
    if (phantom === undefined) phantom = null;
    var sumSource = sumv || detect.filter(function (v, i) { return !(phantom && phantom[i]); });
    var reals = [], wilds = 0;
    sumSource.forEach(function (v) { if (v === 'W') wilds++; else reals.push(v); });
    var sum = reals.reduce(function (s, v) { return s + (v === 1 ? 6 : v); }, 0) + wilds; // each wild = 1 to the sum
    var dvals = [], dph = [], dwild = 0;
    detect.forEach(function (v, i) { if (v === 'W') dwild++; else { dvals.push(v); dph.push(phantom ? !!phantom[i] : false); } });
    var best;
    if (dwild === 0) best = detectCombo(dvals, dph);
    else {
      best = { name: 'No Combo', mult: 1 };
      (function assign(arr, parr, left) {
        if (left === 0) { var c = detectCombo(arr, parr); if (c.mult > best.mult) best = c; return; }
        for (var f = 1; f <= 6; f++) assign(arr.concat(f), parr.concat(false), left - 1);
      })(dvals, dph, dwild);
    }
    return { name: best.name, mult: best.mult, sum: sum, damage: Math.round(sum * best.mult) };
  }

  // `g` (optional) = Greed's additive enemy-scaling fraction; defaults 0 (backward-compatible)
  var scaleHP  = function (b, up, g) { return Math.round(b * (1 + C.BALANCE.hpPerUpgrade  * up + (g || 0))); };
  var scaleAtk = function (b, up, g) { return Math.round(b * (1 + C.BALANCE.atkPerUpgrade * up + (g || 0))); };
  // challenge multiplier (greed knob): an outer multiply on finalized enemy HP/atk/shield
  function chal(state) { return (state.player && state.player.challenge) || 1; }

  /* ---- permanent economy ------------------------------------------------- */
  function newBank() { return { currency: C.BALANCE.startCurrency, diceCount: C.BALANCE.startDice, hpBought: 0, armorBought: 0, rerollBought: 0, healBought: 0, beansBought: 0, luckBought: 0, heirloomBought: 0, challenge: 1, disabled: {}, activeClass: null, classSaves: {},
    // lifetime stat/achievement trackers (persist between runs; drive Engine.evaluateSkinUnlocks)
    lifetimeBeans: 0, beetleKindnessCount: 0, capsuleGoodOutcome: false, tutorialOpened: false }; }
  // pre-run difficulty dial: rotate the chosen challenge tier (mult 1→2→3→1)
  function cycleChallenge(bank) {
    var mults = C.CHALLENGE.map(function (t) { return t.mult; });
    var i = mults.indexOf(bank.challenge || 1);
    bank.challenge = mults[(i + 1) % mults.length];
    return bank.challenge;
  }
  function challengeTier(bank) { return C.CHALLENGE.find(function (t) { return t.mult === (bank.challenge || 1); }) || C.CHALLENGE[0]; }
  // toggle whether a reward/premium id may appear during runs (persists in the bank, between runs)
  function toggleDisabled(bank, id) { if (!bank.disabled) bank.disabled = {}; if (bank.disabled[id]) delete bank.disabled[id]; else bank.disabled[id] = true; bank.activeClass = null; return !bank.disabled[id]; }
  function isDisabled(bank, id) { return !!(bank.disabled && bank.disabled[id]); }
  // enable exactly `ids`, switch every other reward/premium OFF
  function enableOnly(bank, ids) {
    var keep = {}; ids.forEach(function (id) { keep[id] = true; });
    bank.disabled = {};
    C.UPGRADES.concat(C.PREMIUMS).forEach(function (u) { if (!keep[u.id]) bank.disabled[u.id] = true; });
  }
  // loadout preset (sim/default path): enable exactly a class's hard-coded `ids`, ignoring saved presets.
  function applyClass(bank, classId) {
    var cls = C.CLASSES[classId]; if (!cls) return;
    enableOnly(bank, cls.ids || []); bank.activeClass = classId;
  }
  // a class's effective loadout: the player's saved preset wins; else its default ids; else [] (custom = all off)
  function classLoadout(bank, classId) {
    var saved = bank.classSaves && bank.classSaves[classId];
    if (saved) return saved.slice();
    var cls = C.CLASSES[classId]; return (cls && cls.ids) ? cls.ids.slice() : [];
  }
  function hasClassSave(bank, classId) { return !!(bank.classSaves && bank.classSaves[classId]); }
  // Load: apply the class's effective loadout (save-aware). Used by the Upgrades screen.
  function loadClass(bank, classId) { enableOnly(bank, classLoadout(bank, classId)); bank.activeClass = classId; }
  // Save: snapshot whatever is currently enabled as this class's preset (overrides its default on future Loads).
  function saveClass(bank, classId) {
    var on = C.UPGRADES.concat(C.PREMIUMS).filter(function (u) { return !isDisabled(bank, u.id); }).map(function (u) { return u.id; });
    (bank.classSaves = bank.classSaves || {})[classId] = on; bank.activeClass = classId;
  }
  // Reset: drop the saved preset and re-load the class's default (custom classes → all off).
  function resetClass(bank, classId) { if (bank.classSaves) delete bank.classSaves[classId]; loadClass(bank, classId); }
  // bulk toggle: enable or disable every reward/premium at once (clears the active-class highlight).
  function setAllDisabled(bank, disable) {
    bank.disabled = {};
    if (disable) C.UPGRADES.concat(C.PREMIUMS).forEach(function (u) { bank.disabled[u.id] = true; });
    bank.activeClass = null;
  }
  // counter-backed permanents share the `bought` curve; dice is special (capped, prices off diceCount)
  var BOUGHT = { hp: 'hpBought', armor: 'armorBought', reroll: 'rerollBought', heal: 'healBought', beans: 'beansBought', luck: 'luckBought', heirloom: 'heirloomBought' };
  function shopCost(bank, type) {
    var s = C.SHOP[type];
    if (type === 'dice') return s.base * Math.pow(s.mult, bank.diceCount - 1);
    return s.base * Math.pow(s.mult, bank[BOUGHT[type]]);
  }
  function canBuy(bank, type) {
    var s = C.SHOP[type];
    if (type === 'dice' && bank.diceCount >= s.max) return false;
    if (s.max != null && type !== 'dice' && bank[BOUGHT[type]] >= s.max) return false;
    return bank.currency >= shopCost(bank, type);
  }
  function buy(state, type) {
    if (!canBuy(state.bank, type)) return false;
    var b = state.bank; b.currency -= shopCost(b, type);
    if (type === 'dice') b.diceCount++;
    else b[BOUGHT[type]]++;
    return true;
  }

  /* ---- run / fight setup ------------------------------------------------- */
  function newDie() { return { faces: [1, 2, 3, 4, 5, 6], value: 1, feature: null, flevel: 0, _rr: 0, _oc: false, _mom: 0 }; }
  function effRerolls(p) { return p.maxRerolls + p.dice.reduce(function (s, d) { return s + (d.feature === 'freereroll' ? d.flevel : 0); }, 0); }
  function pipOf(v) { return v === 'W' ? 1 : (v === 1 ? 6 : v); }
  function setMaxHp(p, v) { p.maxHp = Math.max(1, Math.round(v)); if (p.hp > p.maxHp) p.hp = p.maxHp; }
  function minFace(d) { var nums = d.faces.filter(function (f) { return typeof f === 'number'; }); return nums.length ? Math.min.apply(null, nums) : 1; }

  /* ---- map generation (pure; testable) ----------------------------------- */
  function weightedPick(weights, rng) {
    var keys = Object.keys(weights), total = 0; keys.forEach(function (k) { total += weights[k]; });
    var r = (rng || defaultRng)() * total;
    for (var i = 0; i < keys.length; i++) { r -= weights[keys[i]]; if (r < 0) return keys[i]; }
    return keys[keys.length - 1];
  }
  function bandFor(col) { var b = C.MAP.bands; return col < b.early ? 'early' : col < b.mid ? 'mid' : 'late'; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  // build a randomized branching DAG: { cols: [ [node,...], ... ] }, node = {type,enemies?,next:[],col,row,_done}
  function generateMap(rng, content) {
    var M = (content || C).MAP, R = rng || defaultRng;
    var ri = function (n) { return Math.floor(R() * n); };
    // 1. column widths (bosses single-lane)
    var widths = [];
    for (var c = 0; c < M.cols; c++) {
      widths[c] = (c === M.miniboss || c === M.boss) ? 1 : M.widthMin + ri(M.widthMax - M.widthMin + 1);
    }
    // 2. carve `paths` routes col0 -> boss, recording used slots + forward edges
    var used = {}, edges = {};
    function key(c, r) { return c + ':' + r; }
    function stepRow(r, wc, wn) {
      if (wn === 1) return 0;
      var base = wc === 1 ? Math.floor((wn - 1) / 2) : Math.round(r * (wn - 1) / (wc - 1));
      return clamp(base + (ri(3) - 1), 0, wn - 1);
    }
    for (var p = 0; p < M.paths; p++) {
      var r = ri(widths[0]); used[key(0, r)] = true;
      for (var col = 0; col < M.cols - 1; col++) {
        var nr = stepRow(r, widths[col], widths[col + 1]);
        used[key(col + 1, nr)] = true;
        edges[key(col, r) + '>' + (col + 1) + ':' + nr] = [col, r, nr];
        r = nr;
      }
    }
    // 3. prune unused slots, rebuild columns with remapped `next` indices
    var remap = [], cols = [];
    for (var c2 = 0; c2 < M.cols; c2++) {
      var rows = []; for (var rr = 0; rr < widths[c2]; rr++) if (used[key(c2, rr)]) rows.push(rr);
      remap[c2] = {}; cols[c2] = rows.map(function (oldRow, idx) { remap[c2][oldRow] = idx; return { col: c2, row: idx, next: [], _done: false }; });
    }
    Object.keys(edges).forEach(function (k) {
      var e = edges[k], from = cols[e[0]][remap[e[0]][e[1]]], toIdx = remap[e[0] + 1][e[2]];
      if (from.next.indexOf(toIdx) < 0) from.next.push(toIdx);
    });
    // 4. assign node types (depth-weighted RNG + hard rules) and encounters
    var treasures = 0;
    for (var c3 = 0; c3 < M.cols; c3++) {
      cols[c3].forEach(function (node) {
        var col = node.col;
        if (col === M.miniboss) node.type = 'miniboss';
        else if (col === M.boss) node.type = 'boss';
        else if (col === M.preBossRest) node.type = 'rest';
        else if (col < M.fightOnlyCols) node.type = 'fight';
        else {
          var w = {}, src = col < 10 ? M.weights.stage1 : M.weights.stage2;
          Object.keys(src).forEach(function (k) { w[k] = src[k]; });
          if (col < M.eliteMinCol) delete w.elite;
          if (col > M.treasureMaxCol || treasures >= M.treasureCap) delete w.treasure;
          if (col < M.shopMinCol) delete w.shop;
          if (col < M.reforgeMinCol) delete w.reforge;
          if (col < M.eventMinCol) delete w.event;
          node.type = weightedPick(w, R);
          if (node.type === 'treasure') treasures++;
        }
        var CC = content || C, s2 = col >= 10;   // stage 2 (cols 10-19) draws from the S2 palette
        if (node.type === 'fight') node.enemies = pickPool((s2 ? CC.ENCOUNTER_POOLS_S2 : CC.ENCOUNTER_POOLS)[bandFor(col)], ri);
        else if (node.type === 'elite') node.enemies = pickPool((s2 ? CC.ELITE_POOLS_S2 : CC.ELITE_POOLS)[col < M.bands.mid ? 'mid' : 'late'], ri);
        else if (node.type === 'miniboss') node.enemies = [M.bossKeys.minibossPool[ri(M.bossKeys.minibossPool.length)]];
        else if (node.type === 'boss') node.enemies = [M.bossKeys.bossPool[ri(M.bossKeys.bossPool.length)]];
      });
    }
    return { cols: cols };
  }
  function pickPool(pool, ri) { return (pool[ri(pool.length)] || []).slice(); }

  function startRun(state, rng) {
    var b = state.bank, maxHp = C.BALANCE.startHp + 5 * b.hpBought;
    var rr = C.BALANCE.baseRerolls + b.rerollBought, tier = challengeTier(b);
    state.player = {
      maxHp: maxHp, hp: maxHp, shield: 0, armor: b.armorBought, rustLost: 0,
      dice: Array.from({ length: b.diceCount }, newDie),
      maxRerolls: rr, rerolls: rr, wardPerTurn: 0, upgrades: 0,
      challenge: tier.enemy, challengeMult: tier.mult,    // greed knob: enemy HP/atk/shield factor
      runCurrency: b.beansBought * C.SHOP.beans.inc,     // Deep Pockets: starting bean stipend
      dmgMult: 1, dmgTakenMult: 1, comboPenalty: 0, jam: false, rerollLock: false, fogged: false,
      // run-modifier fields (rewards/tradeoffs/AoE enhancers fill these)
      goldMult: (1 + b.luckBought * C.SHOP.luck.inc) * tier.beans,   // Lucky Find + challenge bean bonus
      healMult: 1 + b.healBought * (C.SHOP.heal.inc / C.BALANCE.healBetweenFights),  // Natural Healing
      comboBonus: 0, berserker: false, greed: 0,
      doubleOrNothing: false, overflowBank: 0, _premiums: {},
      bubbleFlat: 0, bubblePct: 0.03, bubbleCharge: 0, shockPct: 0.10, shockCharge: 0, shockFocus: false,
      // event-driven: next-fight debuffs (applied at fight start), poison drain, decaying buffs & trickle income
      pendingDebuffs: [], poison: 0, _accFactor: 1, _tempGreed: 0, timedBuffs: [], trickles: []
    };
    state.map = generateMap(rng);
    // Heirloom: start the run with N free pre-applied reward picks (reuses the reward flow)
    // taken/premiums/offered/rounds/death = playtest-stats accumulators (pure data, read at run end)
    var sigCls = C.CLASSES[b.activeClass];
    state.run = { pos: null, total: C.MAP.cols, round: 1, pendingRewards: b.heirloomBought || 0, optionRerolls: 1, offer: null,
                  signature: (sigCls && sigCls.signature && !isDisabled(b, sigCls.signature)) ? sigCls.signature : null,   // class AoE guaranteed in the first reward offer
                  scoutCol: null, bossPreview: null,   // event-driven map scouting (Moth at the Lamp)
                  rerollsUsedThisRun: 0, lowestHpPctThisRun: 1,   // per-run achievement trackers (Samurai / Gladiator)
                  taken: [], premiums: [], offered: {}, rounds: 0, death: null };
    state.phase = b.heirloomBought > 0 ? 'reward' : 'map';
  }
  function currentNode(state) { var p = state.run.pos; return p ? state.map.cols[p.col][p.row] : null; }
  // the next nodes the player may move to: col-0 nodes at the start, else current node's forward edges
  function reachable(state) {
    var p = state.run.pos;
    if (!p) return state.map.cols[0].map(function (n) { return { col: 0, row: n.row }; });
    var node = currentNode(state);
    return node.next.map(function (row) { return { col: p.col + 1, row: row }; });
  }
  // move to (col,row) and enter it: combat nodes start a fight; rest/treasure set a phase for the view.
  function enterNode(state, col, row, rng) {
    var prev = currentNode(state); if (prev) prev._done = true;
    state.run.pos = { col: col, row: row };
    var node = currentNode(state);
    if (node.type === 'rest') { state.phase = 'rest'; return; }
    if (node.type === 'treasure') { state.phase = 'treasure'; state.treasure = shuffle(enabledPool(state, C.PREMIUMS).filter(function (u) { return premiumAvailable(state, u); })).slice(0, 2); return; }
    if (node.type === 'shop') { state.phase = 'shop'; state.shop = { offers: shuffle(enabledPool(state, C.UPGRADES).filter(function (u) { return runRewardAvailable(state, u); })).slice(0, 5), bought: 0 }; return; }
    if (node.type === 'reforge') { state.phase = 'reforge'; return; }
    if (node.type === 'event') { state.phase = 'event'; var epool = C.EVENTS.filter(function (e) { return (e.minCol || 0) <= col; }); state.event = epool[rint(epool.length, rng)]; return; }
    if (node.type === 'miniboss') configureBoss(1, false);
    else if (node.type === 'boss') { var bp = state.run.bossPreview; configureBoss(bp ? bp.count : 2 + rint(2, rng), bp ? bp.phase : true); }   // 2-3 signatures + phase flip (reuse scouted pre-roll if any)
    startFight(state, node.enemies, rng);
  }
  function spawnEnemy(key, state) {
    var a = C.ENEMIES[key]; if (!a) return null;
    var hp = Math.round(scaleHP(a.hp, state.player.upgrades, state.player.greed) * chal(state));
    return { key: key, icon: a.icon, name: a.name, role: a.role, hp: hp, maxHp: hp, armor: 0, intent: null, _paid: false };
  }
  // assign `count` random signatures (+ optional phaseFlip) to a boss, scaling params to its stats
  function assignSignatures(e, count, withPhase, state) {
    var a = C.ENEMIES[e.key], up = state.player ? state.player.upgrades : 0, g = state.player ? state.player.greed : 0, atk = Math.round(scaleAtk(a.atk, up, g) * chal(state));
    var pool = Object.keys(C.SIGNATURES).filter(function (k) { return k !== 'phaseFlip'; });
    // if the final boss was scouted (Moth at the Lamp), reuse the pre-rolled id set so preview matches the fight
    var bp = state.run && state.run.bossPreview;
    var pick = (bp && bp.key === e.key) ? bp.ids.slice() : (function () { var s = shuffle(pool).slice(0, count); if (withPhase) s.push('phaseFlip'); return s; })();
    e.sig = {}; e._reinforced = 0; e._flipped = false;
    pick.forEach(function (id) {
      if (id === 'damageCap') e.sig.damageCap = Math.max(12, Math.round(e.maxHp * 0.18));
      else if (id === 'shieldSunder') e.sig.shieldSunder = true;
      else if (id === 'reinforcements') e.sig.reinforcements = { key: a.summon || 'paperclip', at: [0.66, 0.33] };
      else if (id === 'hardening') e.sig.hardening = { threshold: Math.max(8, Math.round(e.maxHp * 0.22)), gain: 2 };
      else if (id === 'rerollTax') e.sig.rerollTax = 1;
      else if (id === 'riposte') e.sig.riposte = Math.round(atk * 1.4);
      else if (id === 'phaseFlip') e.sig.phaseFlip = true;
      else if (id === 'lifelink') e.sig.lifelink = { key: a.summon || 'paperclip' };
      else if (id === 'vampiric') e.sig.vampiric = 0.3;
      else if (id === 'regen') e.sig.regen = Math.max(3, Math.round(e.maxHp * 0.05));
      else if (id === 'spikes') e.sig.spikes = 0.2;
    });
  }
  // shared so view/engine agree; set by the run/node layer (Phase 3). default: final boss.
  var bossPlan = { count: 2, phase: true };
  function configureBoss(count, phase) { bossPlan = { count: count, phase: phase }; }
  function startFight(state, enemies, rng) {
    applyPendingDebuffs(state);   // event next-fight debuffs land before enemies spawn (enemyBuff scales HP too)
    state.enemies = enemies.map(function (key) { return spawnEnemy(key, state); });
    state.enemies.forEach(function (e) { if (e.role === 'boss') assignSignatures(e, bossPlan.count, bossPlan.phase, state); });
    // Lifelink: spawn the totem add that keeps its boss immune while it lives
    state.enemies.slice().forEach(function (e) {
      if (e.sig && e.sig.lifelink) { var t = spawnEnemy(e.sig.lifelink.key, state); if (t) { t._totem = true; t.name = 'Lifelink Totem'; t.icon = '🪬'; state.enemies.push(t); } }
    });
    // Boss buffer add: a support enemy that turns the boss into a kill-the-support puzzle
    state.enemies.slice().forEach(function (e) {
      if (e.role === 'boss' && C.ENEMIES[e.key].buffer) { var add = spawnEnemy(C.ENEMIES[e.key].buffer, state); if (add) state.enemies.push(add); }
    });
    state.run.round = 1; state.player.shield = 0; state.targetIdx = 0;
    // one enemy delivers a battle-start pun; the view shows it once and clears state.speaker
    var speakers = state.enemies.filter(function (e) { return e.hp > 0 && !e._totem; });
    if (speakers.length) { var sp = speakers[rint(speakers.length, rng)]; state.speaker = { i: state.enemies.indexOf(sp), text: C.PUNS[sp.key] || C.PUN_FALLBACK[rint(C.PUN_FALLBACK.length, rng)] }; }
    else state.speaker = null;
    state.enemies.forEach(function (e) { setIntent(state, e); });
    startPlayerTurn(state, true, rng);
  }
  // standard-bearer aura: every living bearer adds flat attack to its allies' hits
  function auraAtk(state, self) {
    var bonus = 0;
    state.enemies.forEach(function (b) { if (b !== self && b.hp > 0 && b.role === 'standard') bonus += C.ENEMIES[b.key].auraAtk || 0; });
    return bonus;
  }
  function hasAlly(state, e) { return state.enemies.some(function (o) { return o !== e && o.hp > 0; }); }
  function setIntent(state, e) {
    var a = C.ENEMIES[e.key], up = state.player.upgrades, g = state.player.greed, round = state.run.round, ch = chal(state);
    var atk = Math.round(scaleAtk(a.atk, up, g) * ch) + auraAtk(state, e);
    if (e.role === 'mender') {
      var hurt = state.enemies.find(function (o) { return o !== e && o.hp > 0 && o.hp < o.maxHp; });
      e.intent = hurt ? { type: 'heal', value: Math.round(scaleAtk(a.heal, up, g) * ch) } : { type: 'attack', value: atk };
    } else if (e.role === 'turtle') {
      e.intent = (round % 2 === 1) ? { type: 'armor', value: Math.round(a.selfArmor * ch) } : { type: 'attack', value: atk };
    } else if (e.role === 'swarm') {
      e.intent = { type: 'attack', value: atk, hits: a.hits };
    } else if (e.role === 'berserker') {
      e.intent = { type: 'attack', value: Math.round(scaleAtk(a.atk + (round - 1) * (a.rage || 2), up, g) * ch) + auraAtk(state, e) };
    } else if (e.role === 'warden') {
      e.intent = hasAlly(state, e) ? { type: 'armorAlly', value: Math.round((a.wardArmor || 2) * ch) } : { type: 'attack', value: atk };
    } else if (e.role === 'summoner') {
      e.intent = (round % 2 === 1 && state.enemies.filter(function (o) { return o.hp > 0; }).length < 4)
        ? { type: 'summon', key: a.summon || 'paperclip' } : { type: 'attack', value: atk };
    } else if (e.role === 'hexer') {
      e.intent = (round % 2 === 1) ? { type: 'debuff', debuff: 'hex', value: a.hex || 1 } : { type: 'attack', value: atk };
    } else if (e.role === 'jammer') {
      e.intent = (round % 2 === 1) ? { type: 'debuff', debuff: 'jam' } : { type: 'attack', value: atk };
    } else if (e.role === 'jailer') {
      e.intent = (round % 2 === 1) ? { type: 'debuff', debuff: 'lock' } : { type: 'attack', value: atk };
    } else if (e.role === 'rust') {
      e.intent = (round % 2 === 1 && state.player.armor > 0) ? { type: 'debuff', debuff: 'rust', value: a.rust || 2 } : { type: 'attack', value: atk };
    } else if (e.role === 'sealer') {
      var hasFeat = state.player.dice.some(function (d) { return d.feature; });
      e.intent = (round % 2 === 1 && hasFeat) ? { type: 'debuff', debuff: 'seal' } : { type: 'attack', value: atk };
    } else if (e.role === 'fogger') {
      e.intent = (round % 2 === 1) ? { type: 'debuff', debuff: 'fog' } : { type: 'attack', value: atk };
    } else if (e.role === 'boss') {
      if (sigVal(e, 'phaseFlip') && !e._flipped && e.hp <= e.maxHp * 0.5) e._flipped = true;
      if (e._flipped && round % 2 === 1) e.intent = { type: 'debuff', debuff: 'hex', value: 1 };           // phase 2: harasses the dice engine
      else e.intent = { type: 'attack', value: Math.round(scaleAtk((round % 2 === 0 ? a.atk + 5 : a.atk) + (e._flipped ? 4 : 0), up, g) * ch) };
    } else {
      e.intent = { type: 'attack', value: atk };
    }
  }

  /* ---- player turn ------------------------------------------------------- */
  function rollOnce(d, rng) { return d.faces[rint(d.faces.length, rng)]; }
  // most-common showing value across the dice (ignores wilds). null if none repeat to grab.
  function commonValue(dice) {
    var counts = {}, best = null, bestC = 0;
    dice.forEach(function (d) { var v = d.value; if (v === 'W') return; counts[v] = (counts[v] || 0) + 1; if (counts[v] > bestC) { bestC = counts[v]; best = v; } });
    return best;
  }
  // floor (optional): Ascend won't let a reroll drop below this pip value
  function rollDie(d, rng, floor) {
    var v = rollOnce(d, rng);
    if (d.feature === 'echo') { var rolls = [v]; for (var k = 0; k < d.flevel; k++) { var r = rollOnce(d, rng); rolls.push(r); if (pipOf(r) > pipOf(v)) v = r; } d._echoRolls = rolls; }   // record rolls (pure data) so the view can animate the crush; keeps-max logic unchanged
    if (d.feature === 'ascend' && typeof floor === 'number') {            // literal face value: a reroll never shows a lower number
      var lo = floor; if (d.flevel >= 2 && lo < 4) lo = 4;                // level 2+: never below 4
      if (typeof v === 'number' && v < lo) v = lo;                        // (wild 'W' stays as-is)
    }
    d.value = v;
  }
  function grantOvercharge(p, d) {
    if (d.feature === 'overcharge' && d.value === 6 && !d._oc) { d._oc = true; p.rerolls += d.flevel; }
  }
  function startPlayerTurn(state, fresh, rng) {
    var p = state.player;
    if (fresh) {
      if (p.poison > 0) p.hp = Math.max(1, p.hp - p.poison);   // event poison: drain each turn this fight (cleared on win)
      // sealer: a die's feature is off for one turn, then restored; fogger blinds telegraphs for one turn
      p.dice.forEach(function (d) { if (d._sealedFeature != null) { if (d._seal > 0) d._seal--; else { d.feature = d._sealedFeature; d._sealedFeature = null; } } });
      if (p.fogged) { if (p._fog > 0) p._fog--; else p.fogged = false; }
      p.dice.forEach(function (d) { d._rr = 0; d._oc = false; if (!d.anchor) rollDie(d, rng); });
      if (p.jam) { var jd = p.dice[rint(p.dice.length)]; jd.value = minFace(jd); p.jam = false; }
      var tax = 0; (state.enemies || []).forEach(function (e) { if (e.hp > 0 && sigVal(e, 'rerollTax')) tax += e.sig.rerollTax; });
      p.turnRerolls = Math.max(0, effRerolls(p) - tax);
      p.rerolls = p.turnRerolls;
      if (p.overflowBank > 0) { p.turnRerolls += p.overflowBank; p.rerolls = p.turnRerolls; p.overflowBank = 0; }   // Overflow: banked from last turn
      if (p.rerollLock) { p.turnRerolls = Math.min(p.turnRerolls, 1); p.rerolls = p.turnRerolls; p.rerollLock = false; }   // jailer: capped at one
      p.dice.forEach(function (d) { if (d.feature === 'momentum') d._mom = (d._mom || 0) + 1; });                    // Momentum: +1 per surviving turn
      p.dice.forEach(function (d) { grantOvercharge(p, d); });
      if (p.wardPerTurn > 0) p.shield += p.wardPerTurn;
      p.dice.forEach(function (d) { if (d.feature === 'bulwark') p.shield += d.value * d.flevel; });
    }
    trackHp(state);   // Gladiator: sample HP at turn start (reflects damage taken on the prior enemy turn)
    state.phase = 'player';
  }
  function rerollDie(state, i, rng) {
    var p = state.player;
    if (p.rerolls <= 0) { if (!p.bloodroll || p.hp <= 0) return false; p.hp -= 1; }   // Bloodroll: pay HP past the free pool (may spend your last HP → a fatal reroll)
    else p.rerolls--;
    if (state.run) state.run.rerollsUsedThisRun++;   // Samurai: count every reroll actually consumed this run
    var d = p.dice[i], prev = d.value; rollDie(d, rng, prev); d._rr = (d._rr || 0) + 1;
    if (d.feature === 'magnet') { var cv = commonValue(p.dice); if (cv != null && d.faces.indexOf(cv) > -1 && (rng || defaultRng)() < Math.min(1, 0.5 * d.flevel)) d.value = cv; }
    if (d.feature === 'momentum') d._mom = 0;   // manual reroll resets the streak
    if (d.feature === 'bulwarkRoll') p.shield += pipOf(d.value) * d.flevel;                                  // Tide Wall: new pip as shield
    if (d.feature === 'siphonRoll') p.hp = Math.min(p.maxHp, p.hp + pipOf(d.value) * d.flevel);              // Bloodletter: heal new pip
    grantOvercharge(p, d); return true;
  }
  // bonus damage from features whose value is knowable before Attack (live preview)
  function featureBonus(state) {
    var p = state.player, b = 0;
    p.dice.forEach(function (d) {
      if (d.feature === 'whetstone') b += (d._rr || 0) * 2 * d.flevel;
      if (d.feature === 'banker') b += p.rerolls * pipOf(d.value) * d.flevel;
      if (d.feature === 'momentum') b += (d._mom || 0) * d.flevel;
    });
    return b;
  }
  // central evaluation that folds in the player's run-modifiers (preview + attack agree)
  function effEval(state) {
    var p = state.player;
    // detection sees a phantom copy per Splitter die; the sum uses only real faces
    var detect = [], phantom = [], sumv = [];
    p.dice.forEach(function (d) {
      detect.push(d.value); phantom.push(false); sumv.push(d.value);
      if (d.split) { detect.push(d.value); phantom.push(true); }
    });
    var ev = evaluate(detect, phantom, sumv);
    var kindle = 0; p.dice.forEach(function (d) { if (d.feature === 'kindle') kindle += (d._rr || 0) * 0.1; });
    var prism = 0; p.dice.forEach(function (d) { if (d.feature === 'prism' && d.value === 6) prism += 0.2 * d.flevel; });
    var mult = ev.mult + (p.comboBonus || 0) + Math.min(1, kindle) + Math.min(1.2, prism) - (p.comboPenalty || 0);
    mult = Math.min(5, Math.max(1, +mult.toFixed(2)));                       // global 5× cap
    var base = Math.round(ev.sum * mult * (p.dmgMult || 1));
    if (p.berserker) base = Math.round(base * (1 + (p.maxHp - p.hp) / p.maxHp));   // +1% dmg per 1% maxHP missing
    var damage = base + featureBonus(state);
    return { name: ev.name, mult: mult, sum: ev.sum, baseMult: ev.mult, damage: Math.max(0, damage) };
  }
  function preview(state) { return effEval(state); }
  function cleaveTotal(state, mult) {
    var t = 0;
    state.player.dice.forEach(function (d) { if (d.feature === 'cleave') { t += Math.round(pipOf(d.value) * mult * d.flevel); } });
    return t;
  }

  /* ---- combat resolution (returns events; view animates them) ------------ */
  function sigVal(e, name) { return e && e.sig && e.sig[name]; }
  // Lifelink: a boss with the signature takes no damage while any totem add still lives
  function lifelinkImmune(state, e) { return !!sigVal(e, 'lifelink') && state.enemies.some(function (o) { return o._totem && o.hp > 0; }); }
  // Shockwave/Bubble splash off the primary-target damage; appends tagged hits for the view to animate
  function aoeHits(state, primary, pierce, rng, hits) {
    var p = state.player;
    function living() { return state.enemies.filter(function (e) { return e.hp > 0; }); }
    p.dice.forEach(function (d) {
      if (d.feature === 'shockwave') {
        var charges = d.flevel + (p.shockCharge || 0), amt = Math.round(primary * (p.shockPct || 0.10));
        for (var k = 0; k < charges; k++) {
          var pool = living(); if (!pool.length) break;
          var tgt = p.shockFocus ? pool.reduce(function (a, b) { return b.hp < a.hp ? b : a; }) : pool[rint(pool.length, rng)];
          var idx = state.enemies.indexOf(tgt), dd = lifelinkImmune(state, tgt) ? 0 : Math.max(0, pierce ? amt : amt - tgt.armor);
          tgt.hp = Math.max(0, tgt.hp - dd); hits.push({ i: idx, amount: dd, aoe: 'shock' });
        }
      }
      if (d.feature === 'bubble') {
        var bch = d.flevel + (p.bubbleCharge || 0), bamt = Math.round(primary * (p.bubblePct || 0.03)) + (p.bubbleFlat || 0);
        for (var c = 0; c < bch; c++) state.enemies.forEach(function (e, i) {
          if (e.hp > 0) { var dd2 = lifelinkImmune(state, e) ? 0 : Math.max(0, pierce ? bamt : bamt - e.armor); e.hp = Math.max(0, e.hp - dd2); hits.push({ i: i, amount: dd2, aoe: 'bubble' }); }
        });
      }
      if (d.feature === 'ricochet') {
        // Gambler AoE: every reroll you made this turn fires a bolt at a random living enemy for 10%/level of primary
        var rbolts = p.dice.reduce(function (s, x) { return s + (x._rr || 0); }, 0), ramt = Math.round(primary * 0.10 * d.flevel);
        for (var rk = 0; rk < rbolts; rk++) {
          var rpool = living(); if (!rpool.length) break;
          var rtgt = rpool[rint(rpool.length, rng)], ri = state.enemies.indexOf(rtgt);
          var rdd = lifelinkImmune(state, rtgt) ? 0 : Math.max(0, pierce ? ramt : ramt - rtgt.armor);
          rtgt.hp = Math.max(0, rtgt.hp - rdd); hits.push({ i: ri, amount: rdd, aoe: 'shock' });
        }
      }
    });
  }
  function attack(state, rng) {
    var p = state.player, t = state.enemies[state.targetIdx];
    var ev = effEval(state);
    var hits = [];
    var coin = p.doubleOrNothing ? ((rng || defaultRng)() < 0.5 ? 2 : 0) : 1;   // Double or Nothing
    var pierce = p.dice.some(function (d) { return d.feature === 'piercer'; });   // ignores enemy armor
    var pierce2 = p.dice.some(function (d) { return d.feature === 'piercer' && d.flevel >= 2; });   // L2: also ignores damage caps
    var cap = pierce2 ? null : sigVal(t, 'damageCap');
    var primary = (cap ? Math.min(ev.damage, cap) : ev.damage) * coin;
    var immune = lifelinkImmune(state, t);
    var dealt = immune ? 0 : Math.max(0, pierce ? primary : primary - t.armor);
    var tHpBefore = t.hp;
    if (!immune) t.hp = Math.max(0, t.hp - dealt);
    hits.push({ i: state.targetIdx, amount: dealt, immune: immune });
    var spiked = 0;   // Spikes signature: reflect part of the hit back at the player
    if (sigVal(t, 'spikes') && dealt > 0) { spiked = Math.round(dealt * t.sig.spikes); damagePlayer(state, spiked, {}); }
    // Overkill (Brute): damage past the target's HP carves into the lowest-HP living enemies; levels chain further
    var okLevel = 0; if (!immune) p.dice.forEach(function (d) { if (d.feature === 'overkill' && d.flevel > okLevel) okLevel = d.flevel; });
    if (okLevel > 0) {
      var excess = Math.max(0, dealt - tHpBefore), hops = okLevel;
      while (excess > 0 && hops > 0) {
        var oalive = state.enemies.filter(function (e) { return e.hp > 0; });
        if (!oalive.length) break;
        var ot = oalive.reduce(function (a, b) { return b.hp < a.hp ? b : a; });
        if (lifelinkImmune(state, ot)) break;
        var oi = state.enemies.indexOf(ot), ocap = pierce2 ? null : sigVal(ot, 'damageCap');
        var ce = ocap ? Math.min(excess, ocap) : excess, odd = Math.max(0, pierce ? ce : ce - ot.armor), ob = ot.hp;
        ot.hp = Math.max(0, ot.hp - odd); hits.push({ i: oi, amount: odd, aoe: 'overkill' });
        excess = Math.max(0, odd - ob); hops--;
      }
    }
    var splash = cleaveTotal(state, ev.mult) * coin;
    if (splash > 0) state.enemies.forEach(function (e, i) {
      if (i !== state.targetIdx && e.hp > 0 && !lifelinkImmune(state, e)) { var c = pierce2 ? null : sigVal(e, 'damageCap'); var s = c ? Math.min(splash, c) : splash; var dd = Math.max(0, pierce ? s : s - e.armor); e.hp = Math.max(0, e.hp - dd); hits.push({ i: i, amount: dd, splash: true }); }
    });
    aoeHits(state, primary, pierce, rng, hits);          // Shockwave / Bubble
    if (ev.baseMult >= C.COMBOS['Four of a Kind']) p.dice.forEach(function (d) { if (d.feature === 'overflow') p.overflowBank += 1; });   // bank reroll for next turn
    if (ev.baseMult >= C.COMBOS['Five of a Kind']) p.dice.forEach(function (d) { if (d.feature === 'jackpot') addBeans(state, 5 * d.flevel); });   // Jackpot payout
    var heal = 0;
    p.dice.forEach(function (d) {
      if (d.feature === 'siphon') heal += pipOf(d.value) * d.flevel;                       // flat pip
      else if (d.feature === 'siphonCombo') heal += Math.round(ev.mult * 2 * d.flevel);    // combo-scaled
      else if (d.feature === 'siphonDamage') heal += Math.round(dealt * 0.1 * d.flevel);   // lifesteal of primary
      if (d.feature === 'bulwarkCombo') p.shield += Math.round(ev.mult * 2 * d.flevel);     // Aegis: combo-mult as shield
    });
    if (heal > 0) p.hp = Math.min(p.maxHp, p.hp + heal);
    p.comboPenalty = 0;                                  // hexer debuff: one attack only
    p.dealtThisTurn = ev.damage;                         // for boss hardening (Phase 4)
    p.lastMult = ev.mult;                                // for Bramble (thornsCombo) reflect
    state._lastHitDamage = ev.damage;                    // Viking: biggest single-attack damage this turn
    evaluateSkinUnlocks(state);                          // Viking check fires on damage dealt
    state.enemies.forEach(function (e) { if (e.hp <= 0 && !e._paid) { e._paid = true; addBeans(state, Math.round(C.ENEMIES[e.key].gold * (p.goldMult || 1))); } });
    var allDead = state.enemies.every(function (e) { return e.hp <= 0; });
    if (!allDead && state.enemies[state.targetIdx].hp <= 0) state.targetIdx = state.enemies.findIndex(function (e) { return e.hp > 0; });
    return { ev: ev, hits: hits, allDead: allDead, heal: heal, coin: coin, spiked: spiked };
  }
  function damagePlayer(state, amount, opts) {
    var p = state.player, dmg = Math.round(amount * (p.dmgTakenMult || 1));
    if (!(opts && opts.sunder)) { var abs = Math.min(p.shield, dmg); p.shield -= abs; dmg -= abs; }
    dmg = Math.max(0, dmg - p.armor); p.hp = Math.max(0, p.hp - dmg);
  }
  function thornsDamage(state) {
    var t = 0, p = state.player;
    p.dice.forEach(function (d) {
      if (d.feature === 'thorns') t += pipOf(d.value) * d.flevel;
      else if (d.feature === 'thornsCombo') t += Math.round((p.lastMult || 1) * 2 * d.flevel);   // Bramble: last combo-mult scaled
    });
    return t;
  }
  function enemyTurn(state, rng) {
    var actions = [], p = state.player, thorns = thornsDamage(state);
    state.enemies.forEach(function (e) {
      if (e.hp <= 0 || !e.intent) return; var it = e.intent;
      if (it.type === 'attack') {
        var h = it.hits || 1, sunder = !!sigVal(e, 'shieldSunder');
        for (var k = 0; k < h; k++) damagePlayer(state, it.value, { sunder: sunder });
        actions.push({ enemy: e, type: 'attack', total: it.value * h });
        if (sigVal(e, 'vampiric')) { var vl = Math.round(it.value * h * e.sig.vampiric); e.hp = Math.min(e.maxHp, e.hp + vl); actions.push({ enemy: e, type: 'heal', value: vl }); }
        if (thorns > 0) { e.hp = Math.max(0, e.hp - thorns); actions.push({ enemy: e, type: 'thorns', value: thorns }); }
      }
      else if (it.type === 'heal') { var hurt = state.enemies.find(function (o) { return o !== e && o.hp > 0 && o.hp < o.maxHp; }) || (e.hp < e.maxHp ? e : null); if (hurt) { hurt.hp = Math.min(hurt.maxHp, hurt.hp + it.value); actions.push({ enemy: hurt, type: 'heal', value: it.value }); } }
      else if (it.type === 'armor') { e.armor += it.value; actions.push({ enemy: e, type: 'armor', value: it.value }); }
      else if (it.type === 'armorAlly') { var ally = state.enemies.find(function (o) { return o !== e && o.hp > 0; }) || e; ally.armor += it.value; actions.push({ enemy: ally, type: 'armor', value: it.value }); }
      else if (it.type === 'summon') { var spawn = spawnEnemy(it.key, state); if (spawn) { state.enemies.push(spawn); actions.push({ enemy: spawn, type: 'summon' }); } }
      else if (it.type === 'debuff') {
        if (it.debuff === 'hex') p.comboPenalty = (p.comboPenalty || 0) + it.value;
        else if (it.debuff === 'jam') p.jam = true;
        else if (it.debuff === 'lock') p.rerollLock = true;                                  // jailer: cap next turn's rerolls at 1
        else if (it.debuff === 'rust') { var amt = Math.min(p.armor, it.value || 2); p.armor -= amt; p.rustLost = (p.rustLost || 0) + amt; }   // restored at fight end
        else if (it.debuff === 'seal') { var cand = p.dice.filter(function (d) { return d.feature; }); if (cand.length) { var sd = cand[rint(cand.length, rng)]; sd._sealedFeature = sd.feature; sd.feature = null; sd._seal = 1; } }
        else if (it.debuff === 'fog') { p.fogged = true; p._fog = 1; }
        actions.push({ enemy: e, type: 'debuff', debuff: it.debuff });
      }
      // --- boss signatures (passive, fire regardless of intent) ---
      if (e.sig) {
        if (e.sig.hardening && (p.dealtThisTurn || 0) < e.sig.hardening.threshold) { e.armor += e.sig.hardening.gain; actions.push({ enemy: e, type: 'armor', value: e.sig.hardening.gain }); }
        if (e.sig.reinforcements) { var th = e.sig.reinforcements.at[e._reinforced]; if (th != null && e.hp / e.maxHp <= th) { e._reinforced++; var add = spawnEnemy(e.sig.reinforcements.key, state); if (add) { state.enemies.push(add); setIntent(state, add); actions.push({ enemy: add, type: 'summon' }); } } }
        if (e.sig.riposte) { damagePlayer(state, e.sig.riposte, { sunder: !!e.sig.shieldSunder }); actions.push({ enemy: e, type: 'attack', total: e.sig.riposte, riposte: true }); }
        if (e.sig.regen && e.hp > 0 && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.sig.regen); actions.push({ enemy: e, type: 'heal', value: e.sig.regen }); }
      }
    });
    var counterBank = p.dice.reduce(function (s, d) { return s + (d.feature === 'counter' ? d.flevel : 0); }, 0);   // Counter: bank rerolls when hit
    if (counterBank > 0 && actions.some(function (a) { return a.type === 'attack'; })) p.overflowBank += counterBank;
    state.enemies.forEach(function (e) { if (e.hp <= 0 && !e._paid) { e._paid = true; addBeans(state, Math.round(C.ENEMIES[e.key].gold * (p.goldMult || 1))); } });
    trackHp(state);   // Gladiator: sample HP after the enemy turn's damage lands
    return { actions: actions, playerDead: state.player.hp <= 0, allDead: state.enemies.every(function (e) { return e.hp <= 0; }) };
  }
  function advanceAfterEnemy(state, rng) {
    state.run.round++; state.run.rounds++;   // run.rounds = total player turns across the whole run (stats)
    state.enemies.forEach(function (e) { if (e.hp > 0) setIntent(state, e); });
    startPlayerTurn(state, true, rng);
  }

  /* ---- rewards (effects registry — content references these by name) ----- */
  // honor a player-chosen die (state._targetDie) when present; else random (sim / fallback)
  function pickDie(state) {
    if (state._targetDie != null && state.player.dice[state._targetDie]) return state.player.dice[state._targetDie];
    return state.player.dice[rint(state.player.dice.length)];
  }
  function applyFeature(state, type) {
    var dice = state.player.dice;
    if (state._targetDie != null && dice[state._targetDie]) {
      var t = dice[state._targetDie];
      if (t.feature === type) t.flevel++; else { t.feature = type; t.flevel = 1; }   // same → level, else replace
      return;
    }
    var d = dice.find(function (x) { return x.feature === null; });
    if (d) { d.feature = type; d.flevel = 1; return; }
    var same = dice.find(function (x) { return x.feature === type; });
    if (same) { same.flevel++; return; }
    dice[0].feature = type; dice[0].flevel = 1;
  }
  // which UI flow an effect needs: 'face' (preview/diff), 'die' (pick one), 'global' (apply now)
  var FACE_EFFECTS = { forge: 1, load: 1, brand: 1, engrave: 1, uniform: 1, polish: 1, wildcard: 1 };
  var DIE_EFFECTS = { addFeature: 1, anchor: 1, splitter: 1 };
  function effectKind(eff) { return FACE_EFFECTS[eff] ? 'face' : DIE_EFFECTS[eff] ? 'die' : 'global'; }
  var EFFECTS = {
    addFeature: function (state, u) { applyFeature(state, u.feature); },
    forge: function (state) { var d = pickDie(state), c = 0, order = shuffle([0, 1, 2, 3, 4, 5]); for (var i = 0; i < order.length && c < 2; i++) { if (d.faces[order[i]] !== 6) { d.faces[order[i]] = 6; c++; } } },
    load: function (state) { var d = pickDie(state), m = minFace(d); d.faces = d.faces.map(function (f) { return f === m ? Math.min(6, f + 1) : f; }); },
    ward: function (state, u) { state.player.wardPerTurn += u.amount; },
    // --- face mods (stackable; pure face-array ops) ---
    brand: function (state) { var d = pickDie(state); d.faces = d.faces.map(function () { return 1; }); },   // all faces → 1 (every roll = 6 dmg + five-of-a-kind)
    engrave: function (state) { var d = pickDie(state), idx = d.faces.map(function (f, i) { return i; }).filter(function (i) { return typeof d.faces[i] === 'number'; }).sort(function (a, b) { return d.faces[a] - d.faces[b]; }).slice(0, 2); idx.forEach(function (i) { d.faces[i] = Math.min(6, d.faces[i] + 1); }); },
    uniform: function (state) { var d = pickDie(state), counts = {}; d.faces.forEach(function (f) { counts[f] = (counts[f] || 0) + 1; }); var common = d.faces[0]; d.faces.forEach(function (f) { if (counts[f] > counts[common] || (counts[f] === counts[common] && f > common)) common = f; }); d.faces[rint(6)] = common; },
    polish: function (state) { var d = pickDie(state); d.faces = d.faces.map(function (f) { return typeof f === 'number' ? Math.min(6, f + 1) : f; }); },
    // --- tradeoff / one-off swaps (global player modifiers) ---
    glassCannon:  function (state) { var p = state.player; p.dmgMult *= 2;    setMaxHp(p, p.maxHp * 0.3); },
    reckless:     function (state) { var p = state.player; p.dmgMult *= 1.25; p.dmgTakenMult *= 1.2; },
    liveWire:     function (state) { var p = state.player; p.maxRerolls += 2;  setMaxHp(p, p.maxHp * 0.75); },
    bulwarkStance:function (state) { var p = state.player; p.wardPerTurn += 8;  p.dmgMult *= 0.8; },
    allInRoll:    function (state) { var p = state.player; p.dmgMult *= 1.3;   p.maxRerolls -= 2; },
    patient:      function (state) { var p = state.player; p.maxRerolls += 1;  p.dmgMult *= 0.85; },
    bulkUp:       function (state) { var p = state.player; setMaxHp(p, p.maxHp * 1.3); p.dmgMult *= 0.8; },
    pawnbroker:   function (state) { var p = state.player; p.goldMult *= 1.15; setMaxHp(p, p.maxHp * 0.7); },
    scarTissue:   function (state) { var p = state.player; p.dmgMult *= 1.25; p.healMult *= 0.5; },
    berserkerPact:function (state) { state.player.berserker = true; },
    greed:        function (state) { var p = state.player; p.goldMult *= 1.5;  p.greed += 0.3; },
    sacrificialDie:function (state){ var p = state.player; p.comboBonus += 3;  if (p.dice.length > 1) p.dice.pop(); },
    doubleOrNothing:function(state){ state.player.doubleOrNothing = true; },
    allOrNothing: function (state) { var p = state.player; p.dmgMult *= 5;     setMaxHp(p, 1); },
    // --- AoE effect enhancers (global; buff every matching instance) ---
    bubbleReinforced: function (state) { state.player.bubbleFlat += 10; },
    bubbleBigger:     function (state) { state.player.bubblePct = 0.05; },
    bubbleDouble:     function (state) { state.player.bubbleCharge += 1; },
    shockAmplified:   function (state) { state.player.shockPct = 0.15; },
    shockChain:       function (state) { state.player.shockCharge += 1; },
    shockFocused:     function (state) { state.player.shockFocus = true; },
    // --- premiums (treasure pool) ---
    wildcard:  function (state) { var d = pickDie(state); d.faces[rint(6)] = 'W'; },
    anchor:    function (state) { var d = state._targetDie != null ? pickDie(state) : (state.player.dice.find(function (x) { return !x.anchor; }) || pickDie(state)); d.anchor = true; },
    splitter:  function (state) { var d = state._targetDie != null ? pickDie(state) : (state.player.dice.find(function (x) { return !x.split; }) || pickDie(state)); d.split = true; },
    bloodroll: function (state) { state.player.bloodroll = true; },
    extradie:  function (state) { var p = state.player; if (p.dice.length < 5) p.dice.push(newDie()); }
  };
  // enhancer upgrades only matter (and only appear) once you own the matching base feature
  function enhancerOk(state, u) {
    var e = u.effect;
    if (e.indexOf('bubble') === 0) return state.player.dice.some(function (d) { return d.feature === 'bubble'; });
    if (e.indexOf('shock') === 0)  return state.player.dice.some(function (d) { return d.feature === 'shockwave'; });
    return true;
  }
  // run-reward eligibility: enhancer gate + per-run "once" cap (idempotent enhancers shouldn't re-offer)
  function runRewardAvailable(state, u) { return enhancerOk(state, u) && !(u.once && state.run && state.run.taken.indexOf(u.id) > -1); }
  // enabled run-reward pool (workshop toggles can switch pieces off). Fall back to the full list if all are off.
  function enabledPool(state, list) { var pool = list.filter(function (u) { return !isDisabled(state.bank, u.id); }); return pool.length ? pool : list.slice(); }
  function rewardChoices(state) {
    var picks = shuffle(enabledPool(state, C.UPGRADES).filter(function (u) { return runRewardAvailable(state, u); })).slice(0, 3);
    var sig = state.run && state.run.signature;   // class AoE: force into the FIRST offer only
    if (sig) {
      state.run.signature = null;
      if (!isDisabled(state.bank, sig) && !picks.some(function (u) { return u.id === sig; })) {
        var su = C.UPGRADES.find(function (x) { return x.id === sig; });
        if (su && picks.length) picks[picks.length - 1] = su;
      }
    }
    return picks;
  }
  // the current 3-card offer, memoized per pick so re-renders don't reshuffle it; cleared by applyReward
  function offerRewards(state) {
    if (!state.run.offer) { state.run.offer = rewardChoices(state); state.run.offer.forEach(function (u) { state.run.offered[u.id] = (state.run.offered[u.id] || 0) + 1; }); }
    return state.run.offer;
  }
  // spend the one-per-run token to redraw the offer
  function rerollOffer(state) { if (!state.run.optionRerolls) return false; state.run.optionRerolls--; state.run.offer = rewardChoices(state); return true; }
  // per-run premium cap check (Wildcard/Anchor/Bloodroll ×1, Splitter ×2, …)
  function premiumAvailable(state, u) { return u.cap == null || ((state.player._premiums && state.player._premiums[u.id]) || 0) < u.cap; }
  // apply one reward; the caller (view) advances the node once pendingRewards hits 0.
  // dieIndex (optional) targets a specific die for face/feature effects; undefined => random.
  function applyReward(state, upgradeId, rng, dieIndex) {
    var u = C.UPGRADES.find(function (x) { return x.id === upgradeId; }); if (!u) return 0;
    state._targetDie = dieIndex; EFFECTS[u.effect](state, u); state._targetDie = null;
    state.player.upgrades++; state.run.offer = null; state.run.taken.push(u.id);   // next pick draws a fresh offer; record the pick
    if (state.run.pendingRewards > 0) state.run.pendingRewards--;
    return state.run.pendingRewards;
  }
  function applyPremium(state, premiumId, dieIndex) {
    var u = C.PREMIUMS.find(function (x) { return x.id === premiumId; }); if (!u) return;
    state._targetDie = dieIndex; EFFECTS[u.effect](state, u); state._targetDie = null;   // premiums don't scale enemies
    if (!state.player._premiums) state.player._premiums = {};
    state.player._premiums[premiumId] = (state.player._premiums[premiumId] || 0) + 1;
    if (state.run) state.run.premiums.push(premiumId);
  }

  /* ---- in-run service nodes: shop · reforge · event ---------------------- */
  function chargeBeans(state, amt) { if (state.player.runCurrency < amt) return false; state.player.runCurrency -= amt; return true; }
  function runShopCost(state, id) { return C.NODECOST.shopUpgrade; }   // flat for now; id kept for future scaling
  // buy one offer from the shop node (≤3): spends run beans, then applies it exactly like a reward (scales enemies)
  function buyRunUpgrade(state, id, rng, dieIndex) {
    var s = state.shop; if (!s || s.bought >= 3) return false;
    var cost = runShopCost(state, id); if (state.player.runCurrency < cost) return false;
    state.player.runCurrency -= cost;
    applyReward(state, id, rng, dieIndex);
    s.bought++; s.offers = s.offers.filter(function (u) { return u.id !== id; });
    return true;
  }
  // reforge: re-roll a die's feature to a new random one
  function reforgeReroll(state, dieIndex, rng) {
    var d = state.player.dice[dieIndex]; if (!d) return false;
    if (!chargeBeans(state, C.NODECOST.reforgeReroll)) return false;
    var keys = Object.keys(C.FEATURES); d.feature = keys[rint(keys.length, rng)]; d.flevel = 1; return true;
  }
  // reforge: move a feature (and its level) from one die to another
  function reforgeTransfer(state, fromIdx, toIdx) {
    var dice = state.player.dice, a = dice[fromIdx], b = dice[toIdx];
    if (fromIdx === toIdx || !a || !b || !a.feature) return false;
    if (!chargeBeans(state, C.NODECOST.reforgeTransfer)) return false;
    b.feature = a.feature; b.flevel = a.flevel; a.feature = null; a.flevel = 0; return true;
  }
  // reforge: stamp a chosen face mod onto a die
  function reforgeFaceMod(state, dieIndex, modId) {
    if (modId === 'wildcard' || !FACE_EFFECTS[modId] || !EFFECTS[modId]) return false;
    if (!chargeBeans(state, C.NODECOST.reforgeFaceMod)) return false;
    state._targetDie = dieIndex; EFFECTS[modId](state); state._targetDie = null; return true;
  }
  /* ---- event mechanics shared by riskBite / raid / randomTable / timedBuff / scoutReveal ---- */
  // queue a debuff that lands at the START of the next fight (events fire on the map, not mid-combat)
  function queueDebuff(p, d) { (p.pendingDebuffs = p.pendingDebuffs || []).push(d); }
  function debuffLabel(d) {
    return d.kind === 'poison' ? 'poisoned next fight' : d.kind === 'accuracy' ? 'shaky aim next fight'
      : d.kind === 'enemyBuff' ? 'enemies enraged next fight' : 'rattled next fight';
  }
  function buffLabel(b) {
    var dur = b.fights + ' fight' + (b.fights > 1 ? 's' : '');
    return b.stat === 'maxRerolls' ? '+' + b.amount + ' reroll/turn for ' + dur
      : b.stat === 'comboBonus' ? (b.amount >= 0 ? '+' : '') + b.amount + ' combo for ' + dur : 'a buff for ' + dur;
  }
  // consume queued next-fight debuffs (called at the top of startFight, before enemies spawn)
  function applyPendingDebuffs(state) {
    var p = state.player, q = p.pendingDebuffs || []; p.pendingDebuffs = [];
    q.forEach(function (d) {
      if (d.kind === 'combo') p.comboPenalty = (p.comboPenalty || 0) + d.value;          // rattled: weakens the first attack (hex path)
      else if (d.kind === 'poison') p.poison = (p.poison || 0) + d.value;                 // drains HP each player turn
      else if (d.kind === 'accuracy') { var f = 1 - d.pct; p.dmgMult *= f; p._accFactor = (p._accFactor || 1) * f; }   // whole-fight damage cut
      else if (d.kind === 'enemyBuff') { p.greed += d.pct; p._tempGreed = (p._tempGreed || 0) + d.pct; }              // one-fight enemy enrage (reuses greed scaling)
    });
  }
  // timed (decaying) buffs: apply now, expire after N fights. mode 'add' adjusts, 'mult' scales.
  function applyBuffStat(p, b, sign) { if (b.mode === 'mult') { if (sign > 0) p[b.stat] *= b.amount; else p[b.stat] /= b.amount; } else p[b.stat] += sign * b.amount; }
  function grantTimedBuff(p, b) {
    applyBuffStat(p, b, 1);
    (p.timedBuffs = p.timedBuffs || []).push({ stat: b.stat, amount: b.amount, mode: b.mode || 'add', fights: b.fights, then: b.then || null });
  }
  // per-fight tick (called once per cleared combat node): pay trickle income, count down & expire decaying buffs
  function tickPerFight(state) {
    var p = state.player;
    if (p.trickles && p.trickles.length) {
      p.trickles.forEach(function (t) { addBeans(state, t.beans); t.fights--; });        // Ant Caravan: beans after each fight
      p.trickles = p.trickles.filter(function (t) { return t.fights > 0; });
    }
    if (p.timedBuffs && p.timedBuffs.length) {
      var survivors = [], followups = [];
      p.timedBuffs.forEach(function (b) {
        b.fights--;
        if (b.fights > 0) { survivors.push(b); return; }
        applyBuffStat(p, b, -1);                                                          // expired: reverse the buff
        if (b.then) followups.push(b.then);                                               // Sugar Cube two-phase: start the follow-up window
      });
      p.timedBuffs = survivors;
      followups.forEach(function (f) { grantTimedBuff(p, f); });                          // grantTimedBuff applies the stat + queues it
    }
  }
  // pre-roll the final boss's signature id set once, so a scouted preview matches the eventual fight
  function rollBossPreview(state) {
    if (state.run.bossPreview) return state.run.bossPreview;
    var bnode = state.map.cols[C.MAP.boss][0], key = bnode && bnode.enemies && bnode.enemies[0];
    if (!key) return null;
    var count = 2 + rint(2), pool = Object.keys(C.SIGNATURES).filter(function (k) { return k !== 'phaseFlip'; });
    var ids = shuffle(pool).slice(0, count); ids.push('phaseFlip');                       // final boss: 2-3 sigs + phase flip
    state.run.bossPreview = { key: key, count: count, phase: true, ids: ids };
    return state.run.bossPreview;
  }
  // apply one data-driven outcome block (shared by riskBite win/lose, raid, randomTable). Returns a message fragment.
  function resolveOutcomeBlock(state, b, rng) {
    if (!b) return 'Nothing happens.';
    var p = state.player, parts = [];
    if (b.beans != null) { addBeans(state, b.beans); parts.push((b.beans >= 0 ? '+' : '') + b.beans + ' beans'); }
    if (b.hp != null) { if (b.hp >= 0) { p.hp = Math.min(p.maxHp, p.hp + b.hp); parts.push('+' + b.hp + ' HP'); } else { p.hp = Math.max(1, p.hp + b.hp); parts.push(b.hp + ' HP'); } }
    if (b.hpPct != null) { var amt = Math.round(p.maxHp * Math.abs(b.hpPct)); if (b.hpPct >= 0) { p.hp = Math.min(p.maxHp, p.hp + amt); parts.push('+' + amt + ' HP'); } else { p.hp = Math.max(1, p.hp - amt); parts.push('-' + amt + ' HP'); } }
    if (b.healFull) { p.hp = p.maxHp; parts.push('fully healed'); }
    if (b.maxHpPct != null) { setMaxHp(p, p.maxHp * (1 + b.maxHpPct)); parts.push((b.maxHpPct >= 0 ? '+' : '') + Math.round(b.maxHpPct * 100) + '% max HP'); }
    if (b.featureAllDice) { var n = 0; p.dice.forEach(function (d) { if (d.feature) { d.flevel += b.featureAllDice; n++; } }); parts.push(n ? '+' + b.featureAllDice + ' level to ' + n + ' die feature' + (n > 1 ? 's' : '') : 'no die features to strengthen'); }
    if (b.ward) { p.wardPerTurn += b.ward; parts.push('+' + b.ward + ' shield/turn this run'); }
    if (b.debuff) { queueDebuff(p, b.debuff); parts.push(debuffLabel(b.debuff)); }
    if (b.enemyBuff) { queueDebuff(p, { kind: 'enemyBuff', pct: b.enemyBuff.pct }); parts.push('enemies enraged next fight'); }
    if (b.buff) { grantTimedBuff(p, b.buff); parts.push(buffLabel(b.buff)); }
    return parts.length ? parts.join(', ') + '.' : 'Nothing happens.';
  }

  // resolve an event "?" choice. Sets state.phase ('reward' for pick-granting outcomes, else 'map'). Returns a flavor message.
  function applyEvent(state, choiceIndex, rng) {
    var ev = state.event, ch = ev && ev.choices[choiceIndex]; var p = state.player;
    if (!ch) { state.phase = 'map'; return ''; }
    var msg = '';
    if (ch.outcome === 'hpForFaceMod') {
      setMaxHp(p, p.maxHp * (1 - (ch.hpPct || 0.15)));
      var mods = ['forge', 'load', 'brand', 'engrave', 'uniform', 'polish'], m = mods[rint(mods.length, rng)];
      state._targetDie = null; EFFECTS[m](state);
      var mu = C.UPGRADES.find(function (u) { return u.id === m; });
      msg = 'You grind a die — ' + (mu ? mu.name : m) + '.'; state.phase = 'map';
    } else if (ch.outcome === 'beanGamble') {
      if ((rng || defaultRng)() < 0.5) { addBeans(state, p.runCurrency); msg = 'The pot bubbles over — your beans double!'; }   // gained delta = old balance
      else { p.runCurrency = Math.floor(p.runCurrency / 2); msg = 'The pot swallows half your beans.'; }
      state.phase = 'map';
    } else if (ch.outcome === 'hpForReward') {
      p.hp = Math.max(1, p.hp - (ch.hp || 8)); state.run.pendingRewards = 1; state.phase = 'reward'; msg = 'Blood paid. Take your pick.';
    } else if (ch.outcome === 'mysteryBox') {
      var cost = ch.cost || 20; if (p.runCurrency < cost) { state.phase = 'event'; return null; }
      p.runCurrency -= cost; state.run.pendingRewards = 1; state.phase = 'reward'; msg = 'The parcel is yours.';
    } else if (ch.outcome === 'heal') {
      var h = Math.ceil(p.maxHp * (ch.pct || 0.25)); p.hp = Math.min(p.maxHp, p.hp + h); msg = 'You catch your breath (+' + h + ' HP).'; state.phase = 'map';
    } else if (ch.outcome === 'beansFlat') {
      addBeans(state, ch.beans || 20); msg = 'You pocket ' + (ch.beans || 20) + ' beans.'; state.phase = 'map';
    } else if (ch.outcome === 'wardRun') {
      p.hp = Math.max(1, p.hp - (ch.hp || 6)); p.wardPerTurn += ch.ward || 3; msg = 'A lasting ward settles over you.'; state.phase = 'map';
    } else if (ch.outcome === 'levelFeature') {
      var lc = ch.cost || 15; if (p.runCurrency < lc) { state.phase = 'event'; return null; }
      var feat = p.dice.filter(function (d) { return d.feature; });
      if (feat.length) { p.runCurrency -= lc; feat[rint(feat.length, rng)].flevel++; msg = 'A die feature grows stronger.'; }
      else msg = 'No die feature to hone — you keep your beans.';
      state.phase = 'map';
    } else if (ch.outcome === 'maxRerollRun') {
      p.hp = Math.max(1, p.hp - (ch.hp || 8)); p.maxRerolls += 1; msg = 'Your hands feel quicker (+1 reroll/turn).'; state.phase = 'map';
    } else if (ch.outcome === 'extraDieRun') {
      p.hp = Math.max(1, p.hp - (ch.hp || 10));
      if (p.dice.length < 5) { p.dice.push(newDie()); msg = 'A spare die joins your hand.'; } else msg = 'Your hand is full — nothing gained.';
      state.phase = 'map';
    } else if (ch.outcome === 'riskBite') {
      var won = (rng || defaultRng)() < (ch.odds != null ? ch.odds : 0.5);
      msg = (won ? 'Fortune favors you — ' : 'It bites back — ') + resolveOutcomeBlock(state, won ? ch.win : ch.lose, rng);
      if (won && ev.id === 'capsule' && state.bank) { state.bank.capsuleGoodOutcome = true; evaluateSkinUnlocks(state); }   // Mad Scientist trigger (rewards unchanged)
      state.phase = 'map';
    } else if (ch.outcome === 'raid') {
      msg = 'You raid the column — ' + resolveOutcomeBlock(state, ch.effect, rng);   // deterministic trade (beans now, enemy enrage next fight)
      state.phase = 'map';
    } else if (ch.outcome === 'timedBuff') {
      grantTimedBuff(p, ch.buff); msg = 'A fleeting boon: ' + buffLabel(ch.buff) + '.'; state.phase = 'map';
    } else if (ch.outcome === 'trickleIncome') {
      (p.trickles = p.trickles || []).push({ beans: ch.beans || 10, fights: ch.fights || 3 });
      msg = 'You fall in line — ' + (ch.beans || 10) + ' beans after each of the next ' + (ch.fights || 3) + ' fights.'; state.phase = 'map';
    } else if (ch.outcome === 'stateScaledReward') {
      var sc = ch.cost || 15; if (p.runCurrency < sc) { state.phase = 'event'; return null; }
      p.runCurrency -= sc;
      var readVal = ch.read === 'beans' ? p.runCurrency : ch.read === 'dieCount' ? p.dice.length : (p.maxHp - p.hp) / p.maxHp;   // default: missingHpPct
      var payout = Math.round((ch.base || 0) + (ch.scale || 0) * readVal);
      addBeans(state, payout); msg = 'The beetle repays your kindness — +' + payout + ' beans.'; state.phase = 'map';
      if (ev.id === 'beetle' && state.bank) { state.bank.beetleKindnessCount = (state.bank.beetleKindnessCount || 0) + 1; evaluateSkinUnlocks(state); }   // Monk trigger (payout/flavor unchanged)
      // TODO: optional Phase-7 callback — instead of paying now, set state.run.beetleFavor and gift on a later node
    } else if (ch.outcome === 'scoutReveal') {
      state.run.scoutCol = (state.run.pos ? state.run.pos.col : 0) + 5; rollBossPreview(state);
      queueDebuff(p, { kind: 'accuracy', pct: ch.pct || 0.2 });
      msg = 'The light shows the road ahead — but your aim swims (−' + Math.round((ch.pct || 0.2) * 100) + '% damage next fight).'; state.phase = 'map';
    } else if (ch.outcome === 'randomTable') {
      var row = weightedRow(ch.table || [], rng);
      msg = 'The fortune reads: ' + resolveOutcomeBlock(state, row, rng); state.phase = 'map';
    } else if (ch.outcome === 'unlockSkin') {
      var b = state.bank; if (b && !b.skins) b.skins = {};
      if (b && b.skins[ch.skin]) {   // already owned → small consolation so the node is never dead
        var con = (C.SKIN_UNLOCKS && C.SKIN_UNLOCKS.consolationBeans) || 0; addBeans(state, con);
        msg = 'An old friend, already by your side. It leaves you ' + con + ' beans.';
      } else if (b) {
        b.skins[ch.skin] = true; (state.skinUnlocks = state.skinUnlocks || []).push(ch.skin);
        msg = 'A new companion joins you for the journey.';
      }
      state.phase = 'map';
    } else { state.phase = 'map'; }
    return msg;
  }
  // pick one weighted row from a randomTable: [{weight, ...outcome fields}]
  function weightedRow(table, rng) {
    var total = 0; table.forEach(function (r) { total += (r.weight || 1); });
    var x = (rng || defaultRng)() * total;
    for (var i = 0; i < table.length; i++) { x -= (table[i].weight || 1); if (x < 0) return table[i]; }
    return table[table.length - 1] || null;
  }

  /* ---- stat / achievement trackers → cosmetic skin unlocks --------------- */
  // Persistent counters/flags live on the bank (saved between runs); per-run ones on state.run (reset each run).
  // addBeans is the single income chokepoint: it accrues lifetimeBeans and re-checks unlocks (Cowboy).
  function addBeans(state, n) {
    if (!n) return;
    var p = state.player; if (p) p.runCurrency = Math.max(0, p.runCurrency + n);
    if (n > 0 && state.bank) { state.bank.lifetimeBeans = (state.bank.lifetimeBeans || 0) + n; evaluateSkinUnlocks(state); }
  }
  // sample current HP-as-fraction whenever it may be at a new low this run (Gladiator's brink check)
  function trackHp(state) {
    var p = state.player, r = state.run; if (!p || !r || !p.maxHp) return;
    r.lowestHpPctThisRun = Math.min(r.lowestHpPctThisRun, p.hp / p.maxHp);
  }
  // Grant any condition-based bonus skins now satisfied. Idempotent: already-owned skins are no-ops.
  // Skins are defined view-side (view.js SKINS) and ownership is the bank.skins map — here we only flip
  // ownership and queue the id onto state.skinUnlocks (transient) for the view to toast.
  function evaluateSkinUnlocks(state, ctx) {
    var b = state.bank; if (!b) return;
    if (!b.skins) b.skins = {};
    var cfg = C.SKIN_UNLOCKS || {}, run = state.run, won = ctx && ctx.won;
    function grant(id, ok) {
      if (!ok || b.skins[id]) return;
      b.skins[id] = true;
      (state.skinUnlocks = state.skinUnlocks || []).push(id);
    }
    grant('madscientist', !!b.capsuleGoodOutcome);
    grant('monk', (b.beetleKindnessCount || 0) >= (cfg.monkKindnessRequired || 3));
    grant('cowboy', (b.lifetimeBeans || 0) >= (cfg.cowboyLifetimeBeans != null ? cfg.cowboyLifetimeBeans : Infinity));
    grant('detective', !!b.tutorialOpened);
    grant('viking', (state._lastHitDamage || 0) >= (cfg.vikingTurnDamage != null ? cfg.vikingTurnDamage : Infinity));
    if (won && run) {
      grant('samurai', run.rerollsUsedThisRun === 0);
      grant('gladiator', run.lowestHpPctThisRun <= (cfg.gladiatorHpPct != null ? cfg.gladiatorHpPct : 0.10));
    }
  }

  /* ---- run flow / end ---------------------------------------------------- */
  // call after a combat node is cleared. Returns what the view should show next.
  function winFight(state) {
    var p = state.player, node = currentNode(state);
    tickPerFight(state);                                    // Ant Caravan trickle income + decaying buffs (Matchstick/Sugar Cube)
    // lift event-driven fight-scoped effects: poison, accuracy debuff, one-fight enemy enrage
    p.poison = 0;
    if (p._accFactor && p._accFactor !== 1) { p.dmgMult /= p._accFactor; p._accFactor = 1; }
    if (p._tempGreed) { p.greed -= p._tempGreed; p._tempGreed = 0; }
    // clear fight-scoped debuffs: restore rusted armor & sealed features, lift fog/lock
    if (p.rustLost) { p.armor += p.rustLost; p.rustLost = 0; }
    p.dice.forEach(function (d) { if (d._sealedFeature != null) { d.feature = d._sealedFeature; d._sealedFeature = null; d._seal = 0; } });
    p.fogged = false; p._fog = 0; p.rerollLock = false;
    p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * C.BALANCE.healBetweenFights * (p.healMult || 1)));
    if (node.type === 'boss') {
      state.phase = 'win'; state.bank.currency += p.runCurrency + C.RUN.winBonus;
      state.bank.lifetimeBeans = (state.bank.lifetimeBeans || 0) + C.RUN.winBonus;   // win bonus counts toward lifetime earned (Cowboy)
      evaluateSkinUnlocks(state, { won: true });   // Samurai (0 rerolls) / Gladiator (brink HP) fire on the win
      return 'win';
    }
    if (node.type === 'miniboss') { state.phase = 'miniboss'; return 'miniboss'; }       // leave-or-continue
    state.run.pendingRewards = node.type === 'elite' ? 2 : 1;
    state.phase = 'reward'; return 'reward';
  }
  // rest node: 60% heal, then one free reward
  function restHeal(state) {
    var p = state.player; p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.6 * (p.healMult || 1)));
    state.run.pendingRewards = 1; state.phase = 'reward';
  }
  // back to the map to choose the next node (after rewards/treasure/leave-continue resolved)
  function toMap(state) { state.phase = 'map'; }
  function leaveRun(state) {
    state.phase = 'left'; state.bank.currency += state.player.runCurrency + C.RUN.leaveBonus;
    state.bank.lifetimeBeans = (state.bank.lifetimeBeans || 0) + C.RUN.leaveBonus; evaluateSkinUnlocks(state);   // leave bonus counts toward lifetime (Cowboy)
  }
  function loseRun(state) {
    var node = currentNode(state), pos = state.run.pos;
    state.run.death = { node: pos ? pos.col + 1 : 0, type: node ? node.type : null, enemies: (state.enemies || []).map(function (e) { return { key: e.key, role: e.role }; }) };
    state.phase = 'lose'; state.bank.currency += state.player.runCurrency;
  }

  global.Engine = {
    evaluate: evaluate, newBank: newBank, shopCost: shopCost, canBuy: canBuy, buy: buy,
    generateMap: generateMap, startRun: startRun, enterNode: enterNode, reachable: reachable,
    currentNode: currentNode, toMap: toMap, startPlayerTurn: startPlayerTurn,
    rerollDie: rerollDie, preview: preview, attack: attack, enemyTurn: enemyTurn,
    advanceAfterEnemy: advanceAfterEnemy, winFight: winFight, loseRun: loseRun,
    restHeal: restHeal, leaveRun: leaveRun, applyPremium: applyPremium,
    rewardChoices: rewardChoices, offerRewards: offerRewards, rerollOffer: rerollOffer,
    applyReward: applyReward, effRerolls: effRerolls,
    effectKind: effectKind, setIntent: setIntent, EFFECTS: EFFECTS, configureBoss: configureBoss,
    toggleDisabled: toggleDisabled, isDisabled: isDisabled, applyClass: applyClass, cycleChallenge: cycleChallenge,
    loadClass: loadClass, saveClass: saveClass, resetClass: resetClass, hasClassSave: hasClassSave, setAllDisabled: setAllDisabled,
    runShopCost: runShopCost, buyRunUpgrade: buyRunUpgrade,
    reforgeReroll: reforgeReroll, reforgeTransfer: reforgeTransfer, reforgeFaceMod: reforgeFaceMod,
    applyEvent: applyEvent, evaluateSkinUnlocks: evaluateSkinUnlocks, addBeans: addBeans
  };
  if (typeof module !== 'undefined') module.exports = global.Engine;
})(typeof window !== 'undefined' ? window : globalThis);
