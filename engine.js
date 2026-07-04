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
  function shuffle(a, rng) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rint(i + 1, rng); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

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
  function newDie() { return { faces: [1, 2, 3, 4, 5, 6], value: 1, feature: null, flevel: 0, _rr: 0, _mom: 0 }; }
  function effRerolls(p) { return p.maxRerolls; }   // kept as the single chokepoint for per-turn reroll pools (rerollTax etc. layer on top)
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
  function bandFor(col, M) { var b = (M || C.MAP).bands; return col < b.early ? 'early' : col < b.mid ? 'mid' : 'late'; }
  // a column is a miniboss if it's in the biome's minibossCols list (kitchen) or the single scalar (desk)
  function isMinibossCol(M, c) { return M.minibossCols ? M.minibossCols.indexOf(c) > -1 : c === M.miniboss; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  // build a randomized branching DAG: { cols: [ [node,...], ... ] }, node = {type,enemies?,next:[],col,row,_done}
  function generateMap(rng, content) {
    var M = (content || C).MAP, R = rng || defaultRng;
    var ri = function (n) { return Math.floor(R() * n); };
    // 1. column widths (bosses single-lane)
    var widths = [];
    for (var c = 0; c < M.cols; c++) {
      widths[c] = (isMinibossCol(M, c) || c === M.boss) ? 1 : M.widthMin + ri(M.widthMax - M.widthMin + 1);
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
        if (isMinibossCol(M, col)) node.type = 'miniboss';
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
        if (node.type === 'fight') node.enemies = pickPool((s2 ? CC.ENCOUNTER_POOLS_S2 : CC.ENCOUNTER_POOLS)[bandFor(col, M)], ri);
        else if (node.type === 'elite') node.enemies = pickPool((s2 ? CC.ELITE_POOLS_S2 : CC.ELITE_POOLS)[col < M.bands.mid ? 'mid' : 'late'], ri);
        else if (node.type === 'miniboss') node.enemies = [M.minibossAt ? M.minibossAt[col] : M.bossKeys.minibossPool[ri(M.bossKeys.minibossPool.length)]];   // kitchen: fixed miniboss per column; desk: random from pool
        else if (node.type === 'boss') node.enemies = [M.bossKey || M.bossKeys.bossPool[ri(M.bossKeys.bossPool.length)]];
      });
    }
    return { cols: cols };
  }
  function pickPool(pool, ri) { return (pool[ri(pool.length)] || []).slice(); }

  // a content view for a non-desk biome: swaps the MAP and aliases the pool tables generateMap reads.
  // Kitchen has no stage-2 split → alias both encounter slots to one table; elites draw from ELITE_POOLS_KITCHEN.
  function biomeContent(biome) {
    if (biome !== 'kitchen') return null;
    var K = C.ENCOUNTER_POOLS_KITCHEN, EK = C.ELITE_POOLS_KITCHEN;
    return { MAP: C.MAP_KITCHEN, ENCOUNTER_POOLS: K, ENCOUNTER_POOLS_S2: K, ELITE_POOLS: EK, ELITE_POOLS_S2: EK };
  }
  function startRun(state, rng, biome) {
    biome = biome || 'desk';
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
      bubbleFlat: 0, bubblePct: 0.03, bubbleCharge: 0, shockPct: 0.08, shockCharge: 0, shockFocus: false,
      // event-driven: next-fight debuffs (applied at fight start), poison drain, decaying buffs & trickle income
      pendingDebuffs: [], poison: 0, _accFactor: 1, _tempGreed: 0, timedBuffs: [], trickles: [],
      allies: []   // player pets (event-granted): each deals dmgPerTurn to a random enemy every turn; persist across fights (never cleared in winFight)
    };
    var bc = biomeContent(biome);
    state.map = generateMap(rng, bc);
    // Heirloom: start the run with N free pre-applied reward picks (reuses the reward flow)
    // taken/premiums/offered/rounds/death = playtest-stats accumulators (pure data, read at run end)
    var sigCls = C.CLASSES[b.activeClass];
    state.run = { pos: null, total: (bc ? bc.MAP.cols : C.MAP.cols), round: 1, biome: biome, pendingRewards: b.heirloomBought || 0, optionRerolls: 1, offer: null,
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
    if (node.type === 'treasure') { state.phase = 'treasure'; state.treasure = shuffle(enabledPool(state, C.PREMIUMS).filter(function (u) { return premiumAvailable(state, u); }), rng).slice(0, 2); return; }
    if (node.type === 'shop') { state.phase = 'shop'; state.shop = { offers: shuffle(enabledPool(state, C.UPGRADES).filter(function (u) { return runRewardAvailable(state, u); }), rng).slice(0, 5), bought: 0 }; return; }
    if (node.type === 'reforge') { state.phase = 'reforge'; state.reforge = { mods: 0 }; return; }   // mods: face-mod stamps used this visit (cap 2)
    if (node.type === 'event') { state.phase = 'event'; var biome = state.run.biome || 'desk'; var epool = C.EVENTS.filter(function (e) { return (e.minCol || 0) <= col && (e.biome || 'desk') === biome; }); state.event = epool[rint(epool.length, rng)]; return; }
    if (node.type === 'miniboss') configureBoss(1, false);
    else if (node.type === 'boss') { var bp = state.run.bossPreview; configureBoss(bp ? bp.count : 2 + rint(2, rng), bp ? bp.phase : true); }   // 2-3 signatures + phase flip (reuse scouted pre-roll if any)
    startFight(state, node.enemies, rng);
  }
  function spawnEnemy(key, state) {
    var a = C.ENEMIES[key]; if (!a) return null;
    var hp = Math.round(scaleHP(a.hp, state.player.upgrades, state.player.greed) * chal(state));
    // spawn-time passive: [BUFF] enemies enter already armored (cockroach, rusty can, ...)
    var armor0 = Math.round((a.startArmor || 0) * chal(state));
    return { key: key, icon: a.icon, name: a.name, role: a.role, hp: hp, maxHp: hp, armor: armor0, intent: null, poison: 0, _paid: false };
  }
  // assign `count` random signatures (+ optional phaseFlip) to a boss, scaling params to its stats
  function assignSignatures(e, count, withPhase, state, rng) {
    var a = C.ENEMIES[e.key], up = state.player ? state.player.upgrades : 0, g = state.player ? state.player.greed : 0, atk = Math.round(scaleAtk(a.atk, up, g) * chal(state));
    // windup is never rolled at random — it's mousetrap's signature move, force-added below (keeps desk bosses unchanged)
    var pool = Object.keys(C.SIGNATURES).filter(function (k) { return k !== 'phaseFlip' && k !== 'windup'; });
    var want = (a.sigCount != null) ? a.sigCount : count;   // per-enemy override: a weak intro miniboss (Gingerbread) can opt out of signatures entirely
    // if the final boss was scouted (Moth at the Lamp), reuse the pre-rolled id set so preview matches the fight
    var bp = state.run && state.run.bossPreview;
    var pick = (bp && bp.key === e.key) ? bp.ids.slice() : (function () { var s = shuffle(pool, rng).slice(0, want); if (withPhase) s.push('phaseFlip'); return s; })();
    if (e.key === 'mousetrap' && pick.indexOf('windup') < 0) pick.push('windup');   // the SNAP is guaranteed on the kitchen final boss
    e.sig = {}; e._reinforced = 0; e._flipped = false; e._armed = false;
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
      else if (id === 'windup') e.sig.windup = true;
    });
  }
  // shared so view/engine agree; set by the run/node layer (Phase 3). default: final boss.
  var bossPlan = { count: 2, phase: true };
  function configureBoss(count, phase) { bossPlan = { count: count, phase: phase }; }
  function startFight(state, enemies, rng) {
    applyPendingDebuffs(state);   // event next-fight debuffs land before enemies spawn (enemyBuff scales HP too)
    state.enemies = enemies.map(function (key) { return spawnEnemy(key, state); });
    state.enemies.forEach(function (e) { if (e.role === 'boss') assignSignatures(e, bossPlan.count, bossPlan.phase, state, rng); });
    // Lifelink: spawn the totem add that keeps its boss immune while it lives
    state.enemies.slice().forEach(function (e) {
      if (e.sig && e.sig.lifelink) { var t = spawnEnemy(e.sig.lifelink.key, state); if (t) { t._totem = true; t.name = 'Lifelink Totem'; t.icon = '🪬'; state.enemies.push(t); } }
    });
    // Boss buffer add: a support enemy that turns the boss into a kill-the-support puzzle
    state.enemies.slice().forEach(function (e) {
      if (e.role === 'boss' && C.ENEMIES[e.key].buffer) { var add = spawnEnemy(C.ENEMIES[e.key].buffer, state); if (add) state.enemies.push(add); }
    });
    state.run.round = 1; state.player.shield = 0; state.targetIdx = 0;
    state.player.dice.forEach(function (d) { d._mom = 0; });   // Momentum builds anew each fight (else Anchor+Momentum rides the whole run)
    // one enemy delivers a battle-start pun; the view shows it once and clears state.speaker
    var speakers = state.enemies.filter(function (e) { return e.hp > 0 && !e._totem; });
    if (speakers.length) { var sp = speakers[rint(speakers.length, rng)]; state.speaker = { i: state.enemies.indexOf(sp), text: C.PUNS[sp.key] || C.PUN_FALLBACK[rint(C.PUN_FALLBACK.length, rng)] }; }
    else state.speaker = null;
    state.enemies.forEach(function (e) { setIntent(state, e); });
    startPlayerTurn(state, true, rng);
  }
  // fresh copy of an ally descriptor so multiple grants don't alias the content-defined object
  function cloneAlly(a) { return { id: a.id, icon: a.icon, art: a.art, name: a.name, dmgPerTurn: a.dmgPerTurn, target: a.target || 'random' }; }
  // Custom Brand (Spice Rack): every face of the chosen die becomes the player-picked pip
  function brandDie(state, dieIndex, pip) { var d = state.player.dice[dieIndex]; if (d) d.faces = d.faces.map(function () { return pip; }); }
  // give a die a feature by index (Garbage Disposal → poisonDie); honors applyFeature's overwrite/level rules
  function giveFeature(state, dieIndex, feature) { state._targetDie = dieIndex; applyFeature(state, feature); state._targetDie = null; }
  // Compost Bin: strip a die's feature, then offer three fresh feature upgrades to (optionally) plant
  function stripFeature(state, dieIndex) { var d = state.player.dice[dieIndex]; if (d) { d.feature = null; d.flevel = 0; } }
  function featureOffer(state, rng) { return shuffle(enabledPool(state, C.UPGRADES).filter(function (u) { return u.effect === 'addFeature'; }), rng).slice(0, 3); }
  // Vending Machine: pay again to redraw the single-upgrade offer (Take is applied via the normal reward flow in the view)
  function vendingReroll(state, rng) { var p = state.player, c = state.run.vendingCost || 100; if (p.runCurrency < c) return false; p.runCurrency -= c; state.run.vendingOffer = rewardChoices(state, rng).slice(0, 1); return true; }
  // event → combat ambush (fightThenReward): fight a named roster; winFight resolves run.onWin on victory.
  function startEventFight(state, keys, onWin, rng) {
    state.run.onWin = onWin || null; state.run.eventFight = true;
    startFight(state, keys, rng);   // leaves state.phase === 'player'; the view's default branch renders the fight
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
      e.intent = (round % 2 === 1) ? { type: 'armor', value: Math.round((a.selfArmor || 2) * ch) } : { type: 'attack', value: atk };   // || 2 mirrors warden's wardArmor fallback — a turtle without selfArmor must not intend NaN armor (NaN then poisons e.armor → e.hp → unkillable)
    } else if (e.role === 'swarm') {
      e.intent = { type: 'attack', value: atk, hits: a.hits };
    } else if (e.role === 'berserker') {
      e.intent = { type: 'attack', value: Math.round(scaleAtk(a.atk + (round - 1 + (a.startRage || 0)) * (a.rage || 2), up, g) * ch) + auraAtk(state, e) };   // startRage: enters already ramped
    } else if (e.role === 'warden') {
      e.intent = hasAlly(state, e) ? { type: 'armorAlly', value: Math.round((a.wardArmor || 2) * ch) } : { type: 'attack', value: atk };
    } else if (e.role === 'summoner') {
      // summonEvery overrides the default odd-round cadence (antline: every turn); board still capped at 6
      var room = state.enemies.filter(function (o) { return o.hp > 0; }).length < 6;
      var summonNow = a.summonEvery ? (round % a.summonEvery === 0) : (round % 2 === 1);
      e.intent = (summonNow && room) ? { type: 'summon', key: a.summon || 'paperclip' } : { type: 'attack', value: atk };
    } else if (e.role === 'poisoner') {
      e.intent = (round % 2 === 1) ? { type: 'debuff', debuff: 'poison', value: a.poisonCast || 1 } : { type: 'attack', value: atk };   // cast poison on odd rounds, attack on even (mirrors hexer)
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
      if (sigVal(e, 'windup')) {
        // Mousetrap: arm for a turn (telegraphed, no damage), then unload a massive SNAP; repeat
        if (!e._armed) { e._armed = true; e.intent = { type: 'windup' }; }
        else { e._armed = false; e.intent = { type: 'attack', value: Math.round(scaleAtk(a.atk + (e._flipped ? 4 : 0), up, g) * ch * 2.2), windup: true }; }
      } else if (a.bossSummonHeal) {
        // Mold Colossus: cycle summon a spore add → heal the hurt add → attack; poisonAura fires passively in enemyTurn
        var room = state.enemies.filter(function (o) { return o.hp > 0; }).length < 6;
        var myAdd = state.enemies.find(function (o) { return o !== e && o.hp > 0 && o.key === a.summon; });
        if (!myAdd && room) e.intent = { type: 'summon', key: a.summon || 'sugarant' };
        else if (myAdd && myAdd.hp < myAdd.maxHp) e.intent = { type: 'heal', value: Math.round(scaleAtk(a.heal || 4, up, g) * ch) };
        else e.intent = { type: 'attack', value: Math.round(scaleAtk((round % 2 === 0 ? a.atk + 5 : a.atk) + (e._flipped ? 4 : 0), up, g) * ch) };
      } else if (e._flipped && round % 2 === 1) e.intent = { type: 'debuff', debuff: 'hex', value: 1 };     // phase 2: harasses the dice engine
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
  /* ---- die-feature behaviour registry -------------------------------------
   * ONE entry per CONTENT.FEATURES key — the single place a die feature's
   * mechanics live (validate.js enforces the 1:1 pairing, so an unwired
   * feature is a loud error instead of a silent no-op). A die carries exactly
   * one feature, so every hook is a single dispatch. Hooks:
   *   onRoll(d, v, rng, floor) -> v    shape the rolled value (echo, ascend)
   *   onTurnStart(state, p, d)         fresh-turn upkeep (bulwark, momentum)
   *   onReroll(state, p, d, rng)       after a manual reroll of this die
   *   damage(p, d, acc)                damage evaluation (preview == attack):
   *                                    acc.sum (pre-mult) · acc.kindle (capped +1)
   *                                    acc.mult (global 5x still rules) · acc.flat (post-mult)
   *   onAttack(state, p, d, ctx, acc)  attack resolution; ctx {ev, dealt}; add healing to acc.heal
   *   splash(d, mult) -> dmg           cleave-style splash to every untargeted enemy
   *   aoe(state, p, d, ctx)            charge AoE; ctx {primary, pierce, rng, hits, living(), hitEnemy(tgt, amt, tag)}
   *   reflect(p, d) -> dmg             thorns-style reflect when an enemy hits you
   *   counterBank(d) -> n              rerolls banked for next turn when you are hit
   *   pierce: true                     attack ignores enemy armor (flevel>=2: also boss damage caps)
   *   overkill: true                   excess damage chains to lowest-HP enemies (algorithm in attack)
   */
  var FEATURE_HOOKS = {
    cleave:      { splash: function (d, mult) { return Math.round(pipOf(d.value) * mult * d.flevel); } },
    bulwark:     { onTurnStart: function (state, p, d) { p.shield += (typeof d.value === 'number' ? d.value : 1) * d.flevel; } },   // wild face counts as 1 (raw 'W' would NaN the shield)
    bulwarkRoll: { onReroll: function (state, p, d) { if (d._rr <= 5) p.shield += pipOf(d.value) * d.flevel; } },        // Tide Wall: first 5 rerolls/turn
    bulwarkCombo:{ onAttack: function (state, p, d, ctx) { p.shield += Math.round(ctx.ev.mult * 1.5 * d.flevel); } },    // Aegis
    echo:        { onRoll: function (d, v, rng) {   // record rolls (pure data) so the view can animate the crush; keeps-max logic unchanged
                     var rolls = [v]; for (var k = 0; k < d.flevel; k++) { var r = rollOnce(d, rng); rolls.push(r); if (pipOf(r) > pipOf(v)) v = r; }
                     d._echoRolls = rolls; return v; } },
    overcharge:  { damage: function (p, d, acc) { if (d.value === 6) acc.mult += 0.4 * d.flevel; } },
    banker:      { damage: function (p, d, acc) { acc.sum += p.rerolls * pipOf(d.value) * d.flevel; } },   // pre-mult: restraint scales with your combo
    whetstone:   { damage: function (p, d, acc) { acc.sum += (d._rr || 0) * 2 * d.flevel; } },
    siphon:      { onAttack: function (state, p, d, ctx, acc) { acc.heal += pipOf(d.value) * d.flevel; } },
    siphonRoll:  { onReroll: function (state, p, d) { if (d._rr <= 5) p.hp = Math.min(p.maxHp, p.hp + pipOf(d.value) * d.flevel); } },   // Bloodletter: first 5 rerolls/turn
    siphonCombo: { onAttack: function (state, p, d, ctx, acc) { acc.heal += Math.round(ctx.ev.mult * 1.5 * d.flevel); } },   // Vital Surge
    siphonDamage:{ onAttack: function (state, p, d, ctx, acc) { acc.heal += Math.round(ctx.dealt * 0.1 * d.flevel); } },  // Leech: lifesteal of primary
    thorns:      { reflect: function (p, d) { return pipOf(d.value) * d.flevel; } },
    thornsCombo: { reflect: function (p, d) { return Math.round((p.lastMult || 1) * 2 * d.flevel); } },                   // Bramble
    thornsPoison:{ reflectPoison: function (p, d) { return pipOf(d.value) * d.flevel; } },                               // Nettle: poison the attacker when it hits you
    ascend:      { onRoll: function (d, v, rng, floor) {            // literal face value: a reroll never shows a lower number
                     if (typeof floor !== 'number') return v;
                     var lo = floor; if (d.flevel >= 2 && lo < 4) lo = 4;   // level 2+: never below 4
                     return (typeof v === 'number' && v < lo) ? lo : v; } }, // (wild 'W' stays as-is)
    magnet:      { onReroll: function (state, p, d, rng) { var cv = commonValue(p.dice); if (cv != null && d.faces.indexOf(cv) > -1 && (rng || defaultRng)() < Math.min(1, 0.5 * d.flevel)) d.value = cv; } },
    momentum:    { onTurnStart: function (state, p, d) { d._mom = (d._mom || 0) + 1; },                                   // another stack per surviving turn
                   onReroll: function (state, p, d) { d._mom = 0; },                                                      // manual reroll resets the streak
                   damage: function (p, d, acc) { acc.mult += (d._mom || 0) * 0.1 * d.flevel; } },
    overflow:    { onAttack: function (state, p, d, ctx) { if (ctx.ev.baseMult >= C.COMBOS['Four of a Kind']) p.overflowBank += 1; } },
    piercer:     { pierce: true },
    kindle:      { damage: function (p, d, acc) { acc.kindle += (d._rr || 0) * 0.1; acc.kindleCap = (acc.kindleCap || 0) + d.flevel; } },   // cap grows +1.0 per level
    shockwave:   { aoe: function (state, p, d, ctx) {
                     var charges = d.flevel + (p.shockCharge || 0), amt = Math.round(ctx.primary * (p.shockPct || 0.08));
                     for (var k = 0; k < charges; k++) {
                       var pool = ctx.living(); if (!pool.length) break;
                       ctx.hitEnemy(p.shockFocus ? pool.reduce(function (a, b) { return b.hp < a.hp ? b : a; }) : pool[rint(pool.length, ctx.rng)], amt, 'shock');
                     } } },
    bubble:      { aoe: function (state, p, d, ctx) {
                     var bch = d.flevel + (p.bubbleCharge || 0), bamt = Math.round(ctx.primary * (p.bubblePct || 0.03)) + (p.bubbleFlat || 0);
                     for (var c = 0; c < bch; c++) state.enemies.forEach(function (e) { if (e.hp > 0) ctx.hitEnemy(e, bamt, 'bubble'); }); } },
    prism:       { damage: function (p, d, acc) { acc.mult += 0.2 * d.flevel; } },
    counter:     { counterBank: function (d) { return d.flevel; } },
    jackpot:     { onAttack: function (state, p, d, ctx) { if (ctx.ev.baseMult >= C.COMBOS['Five of a Kind']) addBeans(state, 100 * d.flevel); } },
    overkill:    { overkill: true },
    ricochet:    { aoe: function (state, p, d, ctx) {   // Gambler AoE: every reroll made this turn fires a bolt at a random enemy for 10%/level of primary
                     var rbolts = p.dice.reduce(function (s, x) { return s + (x._rr || 0); }, 0), ramt = Math.round(ctx.primary * 0.15 * d.flevel);
                     for (var rk = 0; rk < rbolts; rk++) {
                       var rpool = ctx.living(); if (!rpool.length) break;
                       ctx.hitEnemy(rpool[rint(rpool.length, ctx.rng)], ramt, 'shock');
                     } } },
    poisonDie:   { onAttack: function (state, p, d, ctx) { if (ctx.t && ctx.t.hp > 0) ctx.t.poison = (ctx.t.poison || 0) + pipOf(d.value) * d.flevel; } },   // Toxin: poison the target by this die's pips on each attack (player→enemy DOT)
    poisonRoll:  { onReroll: function (state, p, d, rng) { if (d._rr <= 5) { var alive = state.enemies.filter(function (e) { return e.hp > 0; }); if (alive.length) { var t = alive[Math.floor((rng || defaultRng)() * alive.length)]; t.poison = (t.poison || 0) + d.flevel; } } } },   // Venom: each of the first 5 rerolls poisons a RANDOM alive enemy
    poisonCombo: { onAttack: function (state, p, d, ctx) { if (ctx.t && ctx.t.hp > 0) ctx.t.poison = (ctx.t.poison || 0) + Math.round(ctx.ev.mult * d.flevel); } }   // Blight: poison scaled by combo multiplier each attack
  };
  function hooksFor(d) { return (d.feature && FEATURE_HOOKS[d.feature]) || null; }

  // floor (optional): Ascend won't let a reroll drop below this pip value
  function rollDie(d, rng, floor) {
    var v = rollOnce(d, rng);
    var H = hooksFor(d);
    if (H && H.onRoll) v = H.onRoll(d, v, rng, floor);
    d.value = v;
  }
  function startPlayerTurn(state, fresh, rng) {
    var p = state.player;
    if (fresh) {
      if (p.poison > 0) {                                      // poison (enemy- or event-applied): ticks at turn start, halves each turn, can be lethal
        p.hp -= p.poison;
        if (p.hp <= 0) { p.hp = 0; loseRun(state); return; }   // route to lose centrally so sim/view (which read state.phase) resolve it — no softlock
        p.poison = Math.floor(p.poison / 2);                   // decay 50%/turn (floored): front-loaded pressure, terminates cleanly
      }
      // sealer: a die's feature is off for one turn, then restored; fogger blinds telegraphs for one turn
      p.dice.forEach(function (d) { if (d._sealedFeature != null) { if (d._seal > 0) d._seal--; else { d.feature = d._sealedFeature; d._sealedFeature = null; } } });
      if (p.fogged) { if (p._fog > 0) p._fog--; else p.fogged = false; }
      p.dice.forEach(function (d) { d._rr = 0; if (!d.anchor) rollDie(d, rng); });
      p._bloodCost = 1;                                        // Bloodroll: the doubling HP price resets each turn
      if (p.jam) { var jd = p.dice[rint(p.dice.length, rng)]; jd.value = minFace(jd); p.jam = false; }
      var tax = 0; (state.enemies || []).forEach(function (e) { if (e.hp > 0 && sigVal(e, 'rerollTax')) tax += e.sig.rerollTax; });
      p.turnRerolls = Math.max(0, effRerolls(p) - tax);
      p.rerolls = p.turnRerolls;
      if (p.overflowBank > 0) { p.turnRerolls += p.overflowBank; p.rerolls = p.turnRerolls; p.overflowBank = 0; }   // Overflow: banked from last turn
      if (p.rerollLock) { p.turnRerolls = Math.min(p.turnRerolls, 1); p.rerolls = p.turnRerolls; p.rerollLock = false; }   // jailer: capped at one
      if (p.wardPerTurn > 0) p.shield += p.wardPerTurn;
      p.dice.forEach(function (d) { var H = hooksFor(d); if (H && H.onTurnStart) H.onTurnStart(state, p, d); });     // bulwark shield, momentum stack, …
    }
    trackHp(state);   // Gladiator: sample HP at turn start (reflects damage taken on the prior enemy turn)
    state.phase = 'player';
  }
  function rerollDie(state, i, rng) {
    var p = state.player;
    if (p.rerolls <= 0) {   // Bloodroll: pay HP past the free pool — the price doubles each paid reroll (1,2,4,8…, reset each turn) and may spend your last HP → a fatal reroll
      if (!p.bloodroll || p.hp <= 0) return false;
      var bc = p._bloodCost || 1; p.hp -= bc; p._bloodCost = bc * 2;
    }
    else p.rerolls--;
    if (state.run) state.run.rerollsUsedThisRun++;   // Samurai: count every reroll actually consumed this run
    var d = p.dice[i], prev = d.value; rollDie(d, rng, prev); d._rr = (d._rr || 0) + 1;
    var H = hooksFor(d);
    if (H && H.onReroll) H.onReroll(state, p, d, rng);   // magnet bias, momentum reset, Tide Wall/Bloodletter (capped at 5 rerolls/turn in the hooks)
    return true;
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
    // feature damage accumulators (see FEATURE_HOOKS.damage): whetstone → sum,
    // kindle (capped +1) / prism / overcharge / momentum → mult, banker → flat
    var acc = { sum: 0, kindle: 0, mult: 0, flat: 0 };
    p.dice.forEach(function (d) { var H = hooksFor(d); if (H && H.damage) H.damage(p, d, acc); });
    var mult = ev.mult + (p.comboBonus || 0) + Math.min(acc.kindleCap || 1, acc.kindle) + acc.mult - (p.comboPenalty || 0);
    mult = Math.min(5, Math.max(1, +mult.toFixed(2)));                       // global 5× cap
    var sum = ev.sum + acc.sum;                                              // pre-multiplier bonuses land in the sum
    var base = Math.round(sum * mult * (p.dmgMult || 1));
    if (p.berserker) base = Math.round(base * (1 + (p.maxHp - p.hp) / p.maxHp));   // +1% dmg per 1% maxHP missing
    var damage = base + acc.flat;
    return { name: ev.name, mult: mult, sum: sum, baseMult: ev.mult, damage: Math.max(0, damage) };
  }
  function preview(state) { return effEval(state); }
  function cleaveTotal(state, mult) {
    var t = 0;
    state.player.dice.forEach(function (d) { var H = hooksFor(d); if (H && H.splash) t += H.splash(d, mult); });
    return t;
  }

  /* ---- combat resolution (returns events; view animates them) ------------ */
  function sigVal(e, name) { return e && e.sig && e.sig[name]; }
  // Lifelink: a boss with the signature takes no damage while any totem add still lives
  function lifelinkImmune(state, e) { return !!sigVal(e, 'lifelink') && state.enemies.some(function (o) { return o._totem && o.hp > 0; }); }
  // Shockwave/Bubble/Ricochet splash off the primary-target damage; each feature's `aoe`
  // hook appends tagged hits for the view to animate via ctx.hitEnemy
  function aoeHits(state, primary, pierce, rng, hits) {
    var p = state.player;
    var ctx = {
      primary: primary, pierce: pierce, rng: rng, hits: hits,
      living: function () { return state.enemies.filter(function (e) { return e.hp > 0; }); },
      hitEnemy: function (tgt, amt, tag) {
        var idx = state.enemies.indexOf(tgt), dd = lifelinkImmune(state, tgt) ? 0 : Math.max(0, pierce ? amt : amt - tgt.armor);
        tgt.hp = Math.max(0, tgt.hp - dd); hits.push({ i: idx, amount: dd, aoe: tag });
      }
    };
    p.dice.forEach(function (d) { var H = hooksFor(d); if (H && H.aoe) H.aoe(state, p, d, ctx); });
  }
  function attack(state, rng) {
    var p = state.player, t = state.enemies[state.targetIdx];
    var ev = effEval(state);
    var hits = [];
    var coin = p.doubleOrNothing ? ((rng || defaultRng)() < 0.5 ? 2 : 0) : 1;   // Double or Nothing
    var pierce = p.dice.some(function (d) { var H = hooksFor(d); return H && H.pierce; });   // ignores enemy armor
    var pierce2 = p.dice.some(function (d) { var H = hooksFor(d); return H && H.pierce && d.flevel >= 2; });   // L2: also ignores damage caps
    var cap = pierce2 ? null : sigVal(t, 'damageCap');
    var primary = (cap ? Math.min(ev.damage, cap) : ev.damage) * coin;
    var immune = lifelinkImmune(state, t);
    var ta = C.ENEMIES[t.key] || {};
    var dodged = !immune && ta.dodge && (rng || defaultRng)() < ta.dodge;   // Gingerbread: slips the odd hit
    var dealt = (immune || dodged) ? 0 : Math.max(0, pierce ? primary : primary - t.armor);
    var tHpBefore = t.hp;
    if (!immune && !dodged) t.hp = Math.max(0, t.hp - dealt);
    hits.push({ i: state.targetIdx, amount: dealt, immune: immune, dodged: dodged });
    var spiked = 0;   // Spikes signature: reflect part of the hit back at the player
    if (sigVal(t, 'spikes') && dealt > 0) { spiked = Math.round(dealt * t.sig.spikes); damagePlayer(state, spiked, {}); }
    // Overkill (Brute): damage past the target's HP carves into the lowest-HP living enemies; levels chain further
    var okLevel = 0; if (!immune) p.dice.forEach(function (d) { var H = hooksFor(d); if (H && H.overkill && d.flevel > okLevel) okLevel = d.flevel; });
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
    // attack-resolution feature hooks: siphon heals → aacc.heal, Aegis shield, Overflow bank, Jackpot payout
    var aacc = { heal: 0 };
    p.dice.forEach(function (d) { var H = hooksFor(d); if (H && H.onAttack) H.onAttack(state, p, d, { ev: ev, dealt: dealt, t: t }, aacc); });
    var heal = aacc.heal;
    if (heal > 0) p.hp = Math.min(p.maxHp, p.hp + heal);
    p.comboPenalty = 0;                                  // hexer debuff: one attack only
    p.dealtThisTurn = ev.damage;                         // for boss hardening (Phase 4)
    p.lastMult = ev.mult;                                // for Bramble (thornsCombo) reflect
    state._lastHitDamage = ev.damage;                    // Viking: biggest single-attack damage this turn
    evaluateSkinUnlocks(state);                          // Viking check fires on damage dealt
    state.enemies.forEach(function (e) { if (e.hp <= 0 && !e._paid) { e._paid = true; addBeans(state, Math.round(C.ENEMIES[e.key].gold * (p.goldMult || 1))); } });
    var deathFx = []; deathEffects(state, deathFx);   // kitchen on-death pops (burst / poison splash)
    var allDead = state.enemies.every(function (e) { return e.hp <= 0; });
    if (!allDead && state.enemies[state.targetIdx].hp <= 0) state.targetIdx = state.enemies.findIndex(function (e) { return e.hp > 0; });
    return { ev: ev, hits: hits, allDead: allDead, heal: heal, coin: coin, spiked: spiked, dodged: dodged, deathFx: deathFx };
  }
  // on-death effects (kitchen): the first time an enemy hits 0 HP, deathBurst pops chip
  // damage onto the player (floored at 1 HP — a killing blow can never flip a cleared board
  // into a loss) and deathPoison splashes stacks (which CAN kill later via the normal tick).
  function deathEffects(state, out) {
    var p = state.player;
    state.enemies.forEach(function (e) {
      if (e.hp > 0 || e._deathFx) return;
      e._deathFx = true;
      var a = C.ENEMIES[e.key] || {};
      if (a.deathBurst) { var amt = Math.round(a.deathBurst * chal(state)), before = p.hp; damagePlayer(state, amt, {}); if (p.hp <= 0 && before > 0) p.hp = 1; out.push({ enemy: e, kind: 'burst', value: amt }); }   // floor only rescues from the burst itself — never revives a player something else already killed
      if (a.deathPoison) { p.poison = (p.poison || 0) + a.deathPoison; out.push({ enemy: e, kind: 'deathPoison', value: a.deathPoison }); }
    });
  }
  function damagePlayer(state, amount, opts) {
    var p = state.player, dmg = Math.round(amount * (p.dmgTakenMult || 1));
    if (!(opts && opts.sunder)) { var abs = Math.min(p.shield, dmg); p.shield -= abs; dmg -= abs; }
    dmg = Math.max(0, dmg - p.armor); p.hp = Math.max(0, p.hp - dmg);
  }
  function thornsDamage(state) {
    var t = 0, p = state.player;
    p.dice.forEach(function (d) { var H = hooksFor(d); if (H && H.reflect) t += H.reflect(p, d); });
    return t;
  }
  // Nettle: poison stacks reflected onto an enemy that hits you (mirrors thornsDamage)
  function thornsPoisonTotal(state) {
    var t = 0, p = state.player;
    p.dice.forEach(function (d) { var H = hooksFor(d); if (H && H.reflectPoison) t += H.reflectPoison(p, d); });
    return t;
  }
  function enemyTurn(state, rng) {
    var actions = [], p = state.player, thorns = thornsDamage(state), thornsPois = thornsPoisonTotal(state);
    // enemy poison (player poison-dice DOT): tick before enemies act, mirroring the player-side poison tick
    state.enemies.forEach(function (e) {
      if (e.hp > 0 && e.poison > 0) { e.hp = Math.max(0, e.hp - e.poison); actions.push({ enemy: e, type: 'enemyPoison', value: e.poison }); e.poison = Math.floor(e.poison / 2); }   // decay 50%/turn (floored)
    });
    state.enemies.forEach(function (e) {
      if (e.hp <= 0 || !e.intent) return; var it = e.intent;
      if (it.type === 'attack') {
        var h = it.hits || 1, sunder = !!sigVal(e, 'shieldSunder'), ea = C.ENEMIES[e.key] || {};
        for (var k = 0; k < h; k++) damagePlayer(state, it.value, { sunder: sunder });
        actions.push({ enemy: e, type: 'attack', total: it.value * h, windup: !!it.windup });
        if (ea.poisonHit) { p.poison = (p.poison || 0) + ea.poisonHit * h; actions.push({ enemy: e, type: 'poison', value: ea.poisonHit * h }); }   // venom on hit (maggot, rusty can, rancid rat)
        if (ea.goldSteal) { var st = Math.min(p.runCurrency || 0, ea.goldSteal); if (st > 0) { p.runCurrency -= st; actions.push({ enemy: e, type: 'steal', value: st }); } }   // rancid rat filches beans
        if (sigVal(e, 'vampiric')) { var vl = Math.round(it.value * h * e.sig.vampiric); e.hp = Math.min(e.maxHp, e.hp + vl); actions.push({ enemy: e, type: 'heal', value: vl }); }
        if (thorns > 0) { e.hp = Math.max(0, e.hp - thorns); actions.push({ enemy: e, type: 'thorns', value: thorns }); }
        if (thornsPois > 0) { e.poison = (e.poison || 0) + thornsPois; actions.push({ enemy: e, type: 'poisonApplied', value: thornsPois }); }   // Nettle: attacker gets poisoned
      }
      else if (it.type === 'windup') { actions.push({ enemy: e, type: 'windup' }); }   // arming — telegraph only, no damage this turn
      else if (it.type === 'heal') { var hurt = state.enemies.find(function (o) { return o !== e && o.hp > 0 && o.hp < o.maxHp; }) || (e.hp < e.maxHp ? e : null); if (hurt) { hurt.hp = Math.min(hurt.maxHp, hurt.hp + it.value); actions.push({ enemy: hurt, type: 'heal', value: it.value }); } }
      else if (it.type === 'armor') { e.armor += it.value; actions.push({ enemy: e, type: 'armor', value: it.value }); }
      else if (it.type === 'armorAlly') { var ally = state.enemies.find(function (o) { return o !== e && o.hp > 0; }) || e; ally.armor += it.value; actions.push({ enemy: ally, type: 'armor', value: it.value }); }
      else if (it.type === 'summon') { if (state.enemies.filter(function (o) { return o.hp > 0; }).length < 6) { var spawn = spawnEnemy(it.key, state); if (spawn) { state.enemies.push(spawn); actions.push({ enemy: spawn, type: 'summon' }); } } }   // re-check the board cap at spawn time — the intent was gated when set, but the board can fill in between
      else if (it.type === 'debuff') {
        if (it.debuff === 'hex') p.comboPenalty = (p.comboPenalty || 0) + it.value;
        else if (it.debuff === 'poison') p.poison = (p.poison || 0) + it.value;             // poisoner cast: stacks damage-over-time
        else if (it.debuff === 'jam') p.jam = true;
        else if (it.debuff === 'lock') p.rerollLock = true;                                  // jailer: cap next turn's rerolls at 1
        else if (it.debuff === 'rust') { var amt = Math.min(p.armor, it.value || 2); p.armor -= amt; p.rustLost = (p.rustLost || 0) + amt; }   // restored at fight end
        else if (it.debuff === 'seal') { var cand = p.dice.filter(function (d) { return d.feature; }); if (cand.length) { var sd = cand[rint(cand.length, rng)]; sd._sealedFeature = sd.feature; sd.feature = null; sd._seal = 1; } }
        else if (it.debuff === 'fog') { p.fogged = true; p._fog = 1; }
        actions.push({ enemy: e, type: 'debuff', debuff: it.debuff });
      }
      // poison aura: a stack every turn just by being alive (mold colony, mold colossus)
      var epa = C.ENEMIES[e.key]; if (epa && epa.poisonAura) { p.poison = (p.poison || 0) + epa.poisonAura; actions.push({ enemy: e, type: 'poison', value: epa.poisonAura }); }
      // --- boss signatures (passive, fire regardless of intent — but not from a corpse:
      // thorns reflect above can zero e.hp mid-iteration, and a dead boss must not riposte,
      // call reinforcements, or harden) ---
      if (e.sig && e.hp > 0) {
        if (e.sig.hardening && (p.dealtThisTurn || 0) < e.sig.hardening.threshold) { e.armor += e.sig.hardening.gain; actions.push({ enemy: e, type: 'armor', value: e.sig.hardening.gain }); }
        if (e.sig.reinforcements) { var th = e.sig.reinforcements.at[e._reinforced]; if (th != null && e.hp / e.maxHp <= th && state.enemies.filter(function (o) { return o.hp > 0; }).length < 6) { e._reinforced++; var add = spawnEnemy(e.sig.reinforcements.key, state); if (add) { state.enemies.push(add); setIntent(state, add); actions.push({ enemy: add, type: 'summon' }); } } }   // honor the 6-enemy board cap (summon intents are gated; reinforcements must be too)
        if (e.sig.riposte) { damagePlayer(state, e.sig.riposte, { sunder: !!e.sig.shieldSunder }); actions.push({ enemy: e, type: 'attack', total: e.sig.riposte, riposte: true }); }
        if (e.sig.regen && e.hp > 0 && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.sig.regen); actions.push({ enemy: e, type: 'heal', value: e.sig.regen }); }
      }
    });
    // player allies (event-granted pets): each chips true damage into a random living enemy once per turn
    (p.allies || []).forEach(function (al) {
      var alive = state.enemies.filter(function (e) { return e.hp > 0; });
      if (!alive.length) return;
      var tgt = alive[rint(alive.length, rng)];
      tgt.hp = Math.max(0, tgt.hp - al.dmgPerTurn);   // pets bypass armor (chip damage)
      actions.push({ enemy: tgt, type: 'allyHit', value: al.dmgPerTurn, ally: al });
    });
    var counterBank = p.dice.reduce(function (s, d) { var H = hooksFor(d); return s + (H && H.counterBank ? H.counterBank(d) : 0); }, 0);   // Counter: bank rerolls when hit
    if (counterBank > 0 && actions.some(function (a) { return a.type === 'attack'; })) p.overflowBank += counterBank;
    state.enemies.forEach(function (e) { if (e.hp <= 0 && !e._paid) { e._paid = true; addBeans(state, Math.round(C.ENEMIES[e.key].gold * (p.goldMult || 1))); } });
    var dfx = []; deathEffects(state, dfx);   // thorns kills can pop on-death effects too
    dfx.forEach(function (f) { actions.push({ enemy: f.enemy, type: f.kind, value: f.value }); });
    trackHp(state);   // Gladiator: sample HP after the enemy turn's damage lands
    return { actions: actions, playerDead: state.player.hp <= 0, allDead: state.enemies.every(function (e) { return e.hp <= 0; }) };
  }
  function advanceAfterEnemy(state, rng) {
    state.run.round++; state.run.rounds++;   // run.rounds = total player turns across the whole run (stats)
    state.enemies.forEach(function (e) {     // armorDecay: melting armor (ice cube) sheds a chunk each round
      var a = C.ENEMIES[e.key]; if (e.hp > 0 && a && a.armorDecay && e.armor > 0) e.armor = Math.max(0, e.armor - a.armorDecay);
    });
    state.enemies.forEach(function (e) { if (e.hp > 0) setIntent(state, e); });
    startPlayerTurn(state, true, rng);
  }

  /* ---- rewards (effects registry — content references these by name) ----- */
  // honor a player-chosen die (state._targetDie) when present; else random (sim / fallback)
  function pickDie(state, rng) {
    if (state._targetDie != null && state.player.dice[state._targetDie]) return state.player.dice[state._targetDie];
    return state.player.dice[rint(state.player.dice.length, rng)];
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
  // +1 to a die's n lowest numeric faces (wilds untouched) — shared by Load (2) and Engrave (3)
  function raiseLowest(d, n) {
    var idx = d.faces.map(function (f, i) { return i; }).filter(function (i) { return typeof d.faces[i] === 'number'; })
      .sort(function (a, b) { return d.faces[a] - d.faces[b]; }).slice(0, n);
    idx.forEach(function (i) { d.faces[i] = Math.min(6, d.faces[i] + 1); });
  }
  // which UI flow an effect needs: 'face' (preview/diff), 'die' (pick one), 'global' (apply now)
  var FACE_EFFECTS = { forge: 1, load: 1, brand: 1, engrave: 1, uniform: 1, polish: 1, wildcard: 1 };
  var DIE_EFFECTS = { addFeature: 1, anchor: 1, splitter: 1 };
  function effectKind(eff) { return FACE_EFFECTS[eff] ? 'face' : DIE_EFFECTS[eff] ? 'die' : 'global'; }
  var EFFECTS = {   // signature: (state, u, rng) — rng optional, falls back to Math.random
    addFeature: function (state, u) { applyFeature(state, u.feature); },
    forge: function (state, u, rng) { var d = pickDie(state, rng), c = 0, order = shuffle([0, 1, 2, 3, 4, 5], rng); for (var i = 0; i < order.length && c < 2; i++) { if (d.faces[order[i]] !== 6) { d.faces[order[i]] = 6; c++; } } },
    load: function (state, u, rng) { raiseLowest(pickDie(state, rng), 2); },
    ward: function (state, u) { state.player.wardPerTurn += u.amount; },
    // --- face mods (stackable; pure face-array ops) ---
    brand: function (state, u, rng) { var d = pickDie(state, rng); d.faces = d.faces.map(function () { return 1; }); },   // all faces → 1 (every roll = 6 dmg + five-of-a-kind)
    engrave: function (state, u, rng) { raiseLowest(pickDie(state, rng), 3); },
    uniform: function (state, u, rng) { var d = pickDie(state, rng), counts = {}; d.faces.forEach(function (f) { counts[f] = (counts[f] || 0) + 1; }); var common = d.faces[0]; d.faces.forEach(function (f) { if (counts[f] > counts[common] || (counts[f] === counts[common] && f > common)) common = f; }); d.faces[rint(6, rng)] = common; },
    polish: function (state, u, rng) { var d = pickDie(state, rng); d.faces = d.faces.map(function (f) { return typeof f === 'number' ? Math.min(6, f + 1) : f; }); },
    // --- tradeoff / one-off swaps (global player modifiers) ---
    glassCannon:  function (state) { var p = state.player; p.dmgMult *= 2;    setMaxHp(p, p.maxHp * 0.3); },
    reckless:     function (state) { var p = state.player; p.dmgMult *= 1.25; p.dmgTakenMult *= 1.2; },
    liveWire:     function (state) { var p = state.player; p.maxRerolls += 2;  setMaxHp(p, p.maxHp * 0.75); },
    bulwarkStance:function (state) { var p = state.player; p.wardPerTurn += 16; p.dmgMult *= 0.8; },
    allInRoll:    function (state) { var p = state.player; p.dmgMult *= 1.3;   p.maxRerolls -= 2; },
    patient:      function (state) { var p = state.player; p.maxRerolls += 3;  p.dmgMult *= 0.85; },
    bulkUp:       function (state) { var p = state.player; setMaxHp(p, p.maxHp * 1.3); p.dmgMult *= 0.8; },
    pawnbroker:   function (state) { var p = state.player; p.goldMult *= 1.15; setMaxHp(p, p.maxHp * 0.7); },
    scarTissue:   function (state) { var p = state.player; p.dmgMult *= 1.25; p.healMult *= 0.5; },
    seasoned:     function (state) { state.player.dmgMult *= 1.15; },   // Spice Rack (event-only): flat damage buff, no downside
    berserkerPact:function (state) { state.player.berserker = true; },
    greed:        function (state) { var p = state.player; p.goldMult *= 1.5;  p.greed += 0.3; },
    sacrificialDie:function (state){ var p = state.player; p.comboBonus += 3;  if (p.dice.length > 1) p.dice.pop(); },
    doubleOrNothing:function(state){ state.player.doubleOrNothing = true; },
    allOrNothing: function (state) { var p = state.player; p.dmgMult *= 5;     setMaxHp(p, 1); },
    // --- AoE effect enhancers (global; buff every matching instance) ---
    bubbleReinforced: function (state) { state.player.bubbleFlat += 6; },
    bubbleBigger:     function (state) { state.player.bubblePct = 0.05; },
    bubbleDouble:     function (state) { state.player.bubbleCharge += 1; },
    shockAmplified:   function (state) { state.player.shockPct = 0.12; },
    shockChain:       function (state) { state.player.shockCharge += 1; },
    shockFocused:     function (state) { state.player.shockFocus = true; },
    // --- premiums (treasure pool) ---
    wildcard:  function (state, u, rng) { var d = pickDie(state, rng); d.faces[rint(6, rng)] = 'W'; },
    anchor:    function (state, u, rng) { var d = state._targetDie != null ? pickDie(state, rng) : (state.player.dice.find(function (x) { return !x.anchor; }) || pickDie(state, rng)); d.anchor = true; },
    splitter:  function (state, u, rng) { var d = state._targetDie != null ? pickDie(state, rng) : (state.player.dice.find(function (x) { return !x.split; }) || pickDie(state, rng)); d.split = true; },
    bloodroll: function (state) { state.player.bloodroll = true; },
    extradie:  function (state) { var p = state.player; if (p.dice.length < 5) p.dice.push(newDie()); }
  };
  // enhancer upgrades only matter (and only appear) once you own the matching base feature
  function enhancerOk(state, u) {
    var e = u.effect;
    if (e.indexOf('bubble') === 0) return state.player.dice.some(function (d) { return d.feature === 'bubble'; });
    if (e.indexOf('shock') === 0)  return state.player.dice.some(function (d) { return d.feature === 'shockwave'; });
    // Venom / Blight are poison enhancers — only offered once you own the base Toxin die
    if (u.feature === 'poisonRoll' || u.feature === 'poisonCombo') return state.player.dice.some(function (d) { return d.feature === 'poisonDie'; });
    return true;
  }
  // run-reward eligibility: enhancer gate + per-run caps — `once` (idempotent enhancers) and
  // `cap: N` (stackable-but-compounding picks like the face mods; counts every applyReward, so
  // reward offers, heirloom picks and shop-node buys all share the same budget)
  function runRewardAvailable(state, u) {
    if (u.eventOnly) return false;   // granted only by specific events (Spice Rack) — never in normal reward/shop offers
    if (!enhancerOk(state, u)) return false;
    if (!state.run) return true;
    if (u.once && state.run.taken.indexOf(u.id) > -1) return false;
    if (u.cap && state.run.taken.filter(function (id) { return id === u.id; }).length >= u.cap) return false;
    return true;
  }
  // enabled run-reward pool (workshop toggles can switch pieces off). Fall back to the full list if all are off.
  function enabledPool(state, list) { var pool = list.filter(function (u) { return !isDisabled(state.bank, u.id); }); return pool.length ? pool : list.slice(); }
  function rewardChoices(state, rng) {
    var picks = shuffle(enabledPool(state, C.UPGRADES).filter(function (u) { return runRewardAvailable(state, u); }), rng).slice(0, 3);
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
  function offerRewards(state, rng) {
    if (!state.run.offer) { state.run.offer = rewardChoices(state, rng); state.run.offer.forEach(function (u) { state.run.offered[u.id] = (state.run.offered[u.id] || 0) + 1; }); }
    return state.run.offer;
  }
  // spend the one-per-run token to redraw the offer
  function rerollOffer(state, rng) { if (!state.run.optionRerolls) return false; state.run.optionRerolls--; state.run.offer = rewardChoices(state, rng); return true; }
  // per-run premium cap check (Wildcard/Anchor/Bloodroll ×1, Splitter ×2, …)
  function premiumAvailable(state, u) { return u.cap == null || ((state.player._premiums && state.player._premiums[u.id]) || 0) < u.cap; }
  // apply one reward; the caller (view) advances the node once pendingRewards hits 0.
  // dieIndex (optional) targets a specific die for face/feature effects; undefined => random.
  function applyReward(state, upgradeId, rng, dieIndex) {
    var u = C.UPGRADES.find(function (x) { return x.id === upgradeId; }); if (!u) return 0;
    state._targetDie = dieIndex; EFFECTS[u.effect](state, u, rng); state._targetDie = null;
    state.player.upgrades++; state.run.offer = null; state.run.taken.push(u.id);   // next pick draws a fresh offer; record the pick
    if (state.run.pendingRewards > 0) state.run.pendingRewards--;
    return state.run.pendingRewards;
  }
  // decline a reward (take nothing): consume the pick WITHOUT the upgrade — so you also dodge the
  // enemy-scaling bump (no player.upgrades++). Drops the cached offer so any next pick draws fresh.
  function skipReward(state) {
    state.run.offer = null;
    if (state.run.pendingRewards > 0) state.run.pendingRewards--;
    return state.run.pendingRewards;
  }
  function applyPremium(state, premiumId, dieIndex, rng) {
    var u = C.PREMIUMS.find(function (x) { return x.id === premiumId; }); if (!u) return;
    state._targetDie = dieIndex; EFFECTS[u.effect](state, u, rng); state._targetDie = null;   // premiums don't scale enemies
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
  // reforge: stamp a chosen face mod onto a die — max 2 stamps per visit; wildcard and brand
  // are premium-gated and can't be bought here
  function reforgeFaceMod(state, dieIndex, modId, rng) {
    if (modId === 'wildcard' || modId === 'brand' || !FACE_EFFECTS[modId] || !EFFECTS[modId]) return false;
    if (state.reforge && state.reforge.mods >= 2) return false;
    if (!chargeBeans(state, C.NODECOST.reforgeFaceMod)) return false;
    state._targetDie = dieIndex; EFFECTS[modId](state, null, rng); state._targetDie = null;
    if (state.reforge) state.reforge.mods++;
    return true;
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
  function rollBossPreview(state, rng) {
    if (state.run.bossPreview) return state.run.bossPreview;
    var bnode = state.map.cols[C.MAP.boss][0], key = bnode && bnode.enemies && bnode.enemies[0];
    if (!key) return null;
    var count = 2 + rint(2, rng), pool = Object.keys(C.SIGNATURES).filter(function (k) { return k !== 'phaseFlip'; });
    var ids = shuffle(pool, rng).slice(0, count); ids.push('phaseFlip');                  // final boss: 2-3 sigs + phase flip
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
    // event-fight onWin extensions: cosmetic skin, N sequential upgrade picks, a persistent ally
    if (b.unlockSkin) {
      var bk = state.bank; if (bk && !bk.skins) bk.skins = {};
      if (bk && bk.skins[b.unlockSkin]) { var scon = (C.SKIN_UNLOCKS && C.SKIN_UNLOCKS.consolationBeans) || 0; addBeans(state, scon); parts.push(scon + ' beans (skin already owned)'); }
      else if (bk) { bk.skins[b.unlockSkin] = true; (state.skinUnlocks = state.skinUnlocks || []).push(b.unlockSkin); parts.push('a new companion'); }
    }
    if (b.grantAlly) { (p.allies = p.allies || []).push(cloneAlly(b.grantAlly)); parts.push((b.grantAlly.name || 'an ally') + ' joins you'); }
    if (b.pendingRewards) { state.run.pendingRewards = (state.run.pendingRewards || 0) + b.pendingRewards; parts.push(b.pendingRewards + ' upgrade pick' + (b.pendingRewards > 1 ? 's' : '')); }
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
      state._targetDie = null; EFFECTS[m](state, null, rng);
      var mu = C.UPGRADES.concat(C.PREMIUMS).find(function (u) { return u.id === m; });   // brand lives in PREMIUMS now
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
      state.run.scoutCol = (state.run.pos ? state.run.pos.col : 0) + 5; rollBossPreview(state, rng);
      queueDebuff(p, { kind: 'accuracy', pct: ch.pct || 0.2 });
      msg = 'The light shows the road ahead — but your aim swims (−' + Math.round((ch.pct || 0.2) * 100) + '% damage next fight).'; state.phase = 'map';
    } else if (ch.outcome === 'randomTable') {
      var row = weightedRow(ch.table || [], rng);
      msg = 'The fortune reads: ' + resolveOutcomeBlock(state, row, rng); state.phase = 'map';
    } else if (ch.outcome === 'fightThenReward') {
      startEventFight(state, [ch.enemy], ch.onWin, rng);   // sets state.phase='player'; view routes into combat, winFight resolves onWin
      msg = '';   // no event-result panel — the fight begins immediately
    } else if (ch.outcome === 'grantSpecificUpgrade') {
      applyReward(state, ch.id, rng);   // apply a NAMED upgrade's effect directly, bypassing the random 3-card offer
      var gu = C.UPGRADES.find(function (u) { return u.id === ch.id; });
      msg = (gu ? gu.name : 'A boon') + ' takes hold.'; state.phase = 'map';
    } else if (ch.outcome === 'brandChosen') {
      state._eventUI = 'brand'; msg = '';   // view launches the die + pip picker, then calls Engine.brandDie
    } else if (ch.outcome === 'disposalReward') {
      state._eventUI = 'poison'; msg = '';   // view picks a die → Engine.giveFeature('poisonDie')
    } else if (ch.outcome === 'compostReroll') {
      state._eventUI = 'compost'; msg = '';   // view picks a die → strip feature → offer 3 addFeature (decline-capable)
    } else if (ch.outcome === 'vendingRoll') {
      var vc = ch.cost || 100; if (p.runCurrency < vc) { state.phase = 'event'; return null; }
      p.runCurrency -= vc; state.run.vendingCost = vc; state.run.vendingOffer = rewardChoices(state, rng).slice(0, 1);
      state._eventUI = 'vending'; msg = '';
    } else if (ch.outcome === 'hireAlly') {
      var ac = ch.cost || 20; if (p.runCurrency < ac) { state.phase = 'event'; return null; }
      p.runCurrency -= ac; (p.allies = p.allies || []).push(cloneAlly(ch.ally));
      msg = 'A new hand joins your side.'; state.phase = 'map';
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
    p._wonAtZero = p.hp <= 0;   // Gremlin: cleared the fight at exactly 0 HP — sampled BEFORE the heal below (which is always ≥1, so hp is never 0 by the time the view checks)
    p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * C.BALANCE.healBetweenFights * (p.healMult || 1)));
    // event-fight (fightThenReward): resolve the onWin block, then route to reward (if it granted picks) or back to the map
    if (state.run.eventFight) {
      state.run.eventFight = false; var ow = state.run.onWin; state.run.onWin = null;
      if (ow) resolveOutcomeBlock(state, ow, null);   // onWin fields (unlockSkin/pendingRewards/grantAlly) are deterministic — rng unused
      state.phase = state.run.pendingRewards > 0 ? 'reward' : 'map';
      return state.phase;
    }
    if (!node) { state.run.pendingRewards = 1; state.phase = 'reward'; return 'reward'; }   // defensive: never deref a null node (run.pos unset) → resolve to a reward instead of throwing (softlock)
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
    applyReward: applyReward, skipReward: skipReward, effRerolls: effRerolls,
    effectKind: effectKind, setIntent: setIntent, EFFECTS: EFFECTS, FEATURE_HOOKS: FEATURE_HOOKS, configureBoss: configureBoss,
    toggleDisabled: toggleDisabled, isDisabled: isDisabled, applyClass: applyClass, cycleChallenge: cycleChallenge,
    loadClass: loadClass, saveClass: saveClass, resetClass: resetClass, hasClassSave: hasClassSave, setAllDisabled: setAllDisabled,
    runShopCost: runShopCost, buyRunUpgrade: buyRunUpgrade,
    reforgeReroll: reforgeReroll, reforgeTransfer: reforgeTransfer, reforgeFaceMod: reforgeFaceMod,
    applyEvent: applyEvent, evaluateSkinUnlocks: evaluateSkinUnlocks, addBeans: addBeans,
    startEventFight: startEventFight, brandDie: brandDie, giveFeature: giveFeature,
    stripFeature: stripFeature, featureOffer: featureOffer, vendingReroll: vendingReroll
  };
  if (typeof module !== 'undefined') module.exports = global.Engine;
})(typeof window !== 'undefined' ? window : globalThis);
