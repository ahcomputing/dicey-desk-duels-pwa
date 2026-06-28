/* ============================================================================
 * view.js  —  DOM rendering + input + animation timing.
 * This is the ONLY file that touches the document. It drives Engine and
 * narrates the resulting state. No game rules live here.
 * ========================================================================== */
(function () {
  "use strict";
  var C = window.CONTENT, E = window.Engine;
  var $ = function (id) { return document.getElementById(id); };
  var rng = Math.random;
  /* ---- art layer: <img> with silent emoji fallback ----------------------
   * One helper drives every sprite. Returns an <img src="art/<cat>/<key>.png">
   * that's invisible until it loads (opacity:0 → .loaded), so a 404 never
   * flashes a broken-image glyph. Two failure modes:
   *   replace (enemies, hero/skin) — on 404 the img becomes its emoji text node,
   *                                  pixel-identical to the pre-art rendering.
   *   layer   (die skins)          — the img is a background layer inside .die;
   *                                  load → marks .skinned, 404 → removes itself,
   *                                  leaving today's plain die + emoji badge.
   * With zero art present everything falls back to exactly today's look. Drop a
   * correctly-named PNG into art/<cat>/ and it appears with no code change. */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function artImg(category, key, fallbackEmoji, opts) {
    opts = opts || {};
    var mode = opts.mode || 'replace';
    var cls = 'art art-' + category + (opts.cls ? ' ' + opts.cls : '');
    return '<img alt="" draggable="false" class="' + cls + '" src="art/' + category + '/' + key + '.png"' +
      ' data-fb="' + esc(fallbackEmoji || '') + '" data-mode="' + mode + '"' +
      ' onload="window.__UFart.ok(this)" onerror="window.__UFart.err(this)">';
  }
  // inline on* handlers run in global scope, so the implementation lives on window
  window.__UFart = {
    ok: function (img) { img.classList.add('loaded'); if (img.getAttribute('data-mode') === 'layer' && img.parentNode) img.parentNode.classList.add('skinned'); },
    err: function (img) { if (img.getAttribute('data-mode') === 'layer') { if (img.parentNode) img.parentNode.removeChild(img); return; } img.outerHTML = img.getAttribute('data-fb') || ''; }
  };
  // swap a single-glyph host (hero) to art only when the skin actually changed — renderPlayer runs every frame
  function renderHeroArt(el, skin, cls) {
    if (!el || el.getAttribute('data-skin') === skin.id) return;
    el.setAttribute('data-skin', skin.id);
    el.innerHTML = artImg('skin', skin.id, skin.emoji, { cls: cls });
  }
  // ---- cosmetic player skins (view-only; ownership lives in the bank, no engine involvement) ----
  var SKINS = [
    { id: 'elf',     emoji: '🧝', name: 'Elf',     unlock: 'free' },
    { id: 'mage',    emoji: '🧙', name: 'Mage',    unlock: 'free' },
    { id: 'rogue',   emoji: '🦹', name: 'Rogue',   unlock: 'free' },
    { id: 'penguin', emoji: '🐧', name: 'Penguin', unlock: 'default' },   // unlocked for every save (see backfillBank)
    // challenge-win unlocks — runOver() grants the one matching the winning tier's mult
    { id: 'ninja',       emoji: '🥷', name: 'Ninja',         unlock: 'challenge', mult: 1 },
    { id: 'vampire',     emoji: '🧛', name: 'Vampire',       unlock: 'challenge', mult: 2 },
    { id: 'royal',       emoji: '🤴', name: 'Royal',         unlock: 'challenge', mult: 3 },
    { id: 'knight',      emoji: '🛡️', name: 'Knight',        unlock: 'challenge', mult: 4 },
    { id: 'pirate',      emoji: '🏴‍☠️', name: 'Pirate',     unlock: 'challenge', mult: 5 },
    { id: 'plaguedoctor',emoji: '⚕️', name: 'Plague Doctor', unlock: 'challenge', mult: 6 },
    { id: 'astronaut',   emoji: '👨‍🚀', name: 'Astronaut',   unlock: 'challenge', mult: 7 },
    { id: 'barbarian',   emoji: '🪓', name: 'Barbarian',     unlock: 'challenge', mult: 8 },
    { id: 'druid',       emoji: '🧚', name: 'Druid',         unlock: 'challenge', mult: 9 },
    { id: 'mecha',       emoji: '🤖', name: 'Mecha',         unlock: 'challenge', mult: 10 },
    // shop cosmetics — same buy flow as Dapper (showShop)
    { id: 'chef',        emoji: '👨‍🍳', name: 'Chef',        unlock: 'shop', cost: 1000 },
    { id: 'techie',      emoji: '👨‍💻', name: 'Techie',      unlock: 'shop', cost: 2000 },
    { id: 'bard',        emoji: '🎻', name: 'Bard',          unlock: 'shop', cost: 3000 },
    { id: 'cat',         emoji: '🐱', name: 'Cat',           unlock: 'shop', cost: 4000 },
    { id: 'dog',         emoji: '🐶', name: 'Dog',           unlock: 'shop', cost: 5000 },
    { id: 'explorer',    emoji: '🧗', name: 'Explorer',      unlock: 'shop', cost: 6000 },
    { id: 'drone',       emoji: '🛸', name: 'Drone',         unlock: 'shop', cost: 7000 },
    { id: 'dolphin',     emoji: '🐬', name: 'Dolphin',       unlock: 'shop', cost: 8000 },
    { id: 'jester',      emoji: '🃏', name: 'Jester',        unlock: 'shop', cost: 9000 },
    { id: 'dapper',      emoji: '🎩', name: 'Dapper',        unlock: 'shop', cost: 10000 },
    // condition / event unlocks — Engine.evaluateSkinUnlocks (or an unlockSkin event) flips ownership;
    // `hint` is the locked-tile label shown in the picker (logic & thresholds live in engine/content).
    { id: 'robot',       emoji: '🤖', name: 'Robot',         unlock: 'condition', hint: 'Befriend the Windup Toy' },
    { id: 'fox',         emoji: '🦊', name: 'Fox',           unlock: 'condition', hint: 'Befriend the Wary Fox' },
    { id: 'madscientist',emoji: '👨‍🔬', name: 'Mad Scientist',unlock: 'condition', hint: 'Get lucky with a Spilled Capsule' },
    { id: 'monk',        emoji: '🧘', name: 'Monk',          unlock: 'condition', hint: 'Give to the Begging Beetle 3 times' },
    { id: 'samurai',     emoji: '🥋', name: 'Samurai',       unlock: 'condition', hint: 'Win a run without rerolling' },
    { id: 'gladiator',   emoji: '🗡️', name: 'Gladiator',     unlock: 'condition', hint: 'Win a run after dropping to the brink' },
    { id: 'cowboy',      emoji: '🤠', name: 'Cowboy',        unlock: 'condition', hint: 'Earn a fortune in beans, all-time' },
    { id: 'viking',      emoji: '🪖', name: 'Viking',        unlock: 'condition', hint: 'Land one colossal hit' },
    { id: 'detective',   emoji: '🕵️', name: 'Detective',     unlock: 'condition', hint: 'Read how the game works' }
  ];
  // ---- persistence: the bank (permanent progression) survives reloads via localStorage ----
  var SAVE_KEY = 'underfoot.bank.v1';
  function backfillBank(b) {   // defaults for fields not in E.newBank() (cosmetic skins)
    if (!b.skin) b.skin = 'elf';
    if (!b.skins || typeof b.skins !== 'object') b.skins = {};
    if (!b.skins.penguin) b.skins.penguin = true;   // Penguin is unlocked for every save (new or migrated)
    return b;
  }
  function loadBank() {
    try { return backfillBank(Object.assign(E.newBank(), JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'))); }
    catch (e) { return backfillBank(E.newBank()); }   // schema-merge: newBank() defaults backfill missing fields
  }
  function saveBank() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.bank)); } catch (e) {} }
  function currentSkin() { return SKINS.find(function (s) { return s.id === state.bank.skin; }) || SKINS[0]; }
  function skinOwned(s) { return s.unlock === 'free' || !!(state.bank.skins && state.bank.skins[s.id]); }
  function skinHint(s) {
    return s.unlock === 'challenge' ? 'Win a Challenge ×' + s.mult + ' run'
      : s.unlock === 'shop' ? 'Buy in the Shop (' + s.cost.toLocaleString() + ' 🫘)'
      : s.hint || '';   // condition / default skins carry their own hint string
  }
  // surface skins the engine just unlocked (state.skinUnlocks): a brief toast each, then persist ownership.
  function flushSkinUnlocks() {
    var ids = state.skinUnlocks; if (!ids || !ids.length) return;
    state.skinUnlocks = [];
    ids.forEach(function (id, i) {
      var s = SKINS.find(function (x) { return x.id === id; }); if (!s) return;
      setTimeout(function () { showSkinToast(s); }, i * 350);   // stagger if several land at once
    });
    saveBank();   // ownership was written engine-side; persist it now
  }
  function showSkinToast(s) {
    var host = $('game') || document.body;
    var t = document.createElement('div');
    t.className = 'skintoast';
    t.innerHTML = '<span class="stic">' + s.emoji + '</span><span class="sttx">🎉 New skin unlocked<br><b>' + esc(s.name) + '</b></span>';
    host.appendChild(t);
    anim(t, [{ opacity: 0, transform: 'translate(-50%,12px)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: 220, easing: 'ease-out' });
    setTimeout(function () {
      anim(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).then(function () { if (t.parentNode) t.parentNode.removeChild(t); });
    }, 2200);
  }
  // ---- playtest stats: aggregate in localStorage, exportable as JSON for offline analysis ----
  var STATS_KEY = 'underfoot.stats.v1';
  function defaultStats() { return { version: 1, runs: 0, wins: 0, lefts: 0, losses: 0, byClass: {}, byChallenge: {}, offered: {}, chosen: {}, deathNodes: {}, killedBy: {}, log: [] }; }
  function loadStats() { try { return Object.assign(defaultStats(), JSON.parse(localStorage.getItem(STATS_KEY) || '{}')); } catch (e) { return defaultStats(); } }
  function saveStats(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {} }
  // build a per-run summary and fold it into the aggregate
  function recordRun(result) {
    if (!state.player || !state.run) return;
    var b = state.bank, p = state.player, r = state.run;
    var sum = {
      ts: Date.now(), result: result, node: r.pos ? r.pos.col + 1 : 0, total: r.total,
      challenge: p.challengeMult || 1, cls: b.activeClass || 'custom',
      invest: { dice: b.diceCount, hp: b.hpBought, armor: b.armorBought, reroll: b.rerollBought, heal: b.healBought, beans: b.beansBought, luck: b.luckBought, heirloom: b.heirloomBought },
      beans: p.runCurrency, taken: (r.taken || []).slice(), premiums: (r.premiums || []).slice(),
      offered: r.offered || {}, rounds: r.rounds || 0, death: r.death || null
    };
    var s = loadStats();
    s.runs++; if (result === 'win') s.wins++; else if (result === 'left') s.lefts++; else s.losses++;
    function bump(map, key) { var m = map[key] || { runs: 0, wins: 0 }; m.runs++; if (result === 'win') m.wins++; map[key] = m; }
    bump(s.byClass, sum.cls); bump(s.byChallenge, 'x' + sum.challenge);
    Object.keys(sum.offered).forEach(function (id) { s.offered[id] = (s.offered[id] || 0) + sum.offered[id]; });
    sum.taken.forEach(function (id) { s.chosen[id] = (s.chosen[id] || 0) + 1; });
    if (result === 'lose' && sum.death) { s.deathNodes[sum.death.node] = (s.deathNodes[sum.death.node] || 0) + 1; (sum.death.enemies || []).forEach(function (e) { s.killedBy[e.role] = (s.killedBy[e.role] || 0) + 1; }); }
    s.log.push(sum); if (s.log.length > 300) s.log = s.log.slice(-300);
    saveStats(s);
  }
  var state = { bank: loadBank() };
  var busy = false;

  /* ---- animation helpers (Web Animations API; respect reduced-motion) ---- */
  var prefersReduced = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }   // gameplay pacing (kept under reduced-motion)
  // thin WAAPI wrapper: returns the .finished promise, or resolves now under reduced-motion / no support
  function anim(el, frames, opts) {
    if (!el || prefersReduced() || !el.animate) return Promise.resolve();
    try { return el.animate(frames, opts).finished.catch(function () {}); }
    catch (e) { return Promise.resolve(); }
  }

  /* ---- Workshop home (between runs): shop · character · upgrades --------- */
  // pre-run challenge selector (tap to cycle ×1/×2/×3)
  function challengeBtn(b) {
    var tier = C.CHALLENGE.find(function (t) { return t.mult === (b.challenge || 1); }) || C.CHALLENGE[0];
    return '<button class="wschal" id="wsChal"><span class="chmult">🔥 Challenge ×' + tier.mult + '</span>' +
      '<span class="chdesc">' + tier.desc + ' (tap to change)</span></button>';
  }
  function showWorkshop() {
    saveBank();   // backstop: persist whatever's banked whenever we land here
    var ov = $('overlay'); ov.style.display = 'flex';
    var b = state.bank;
    ov.innerHTML =
      '<div class="wshome">' +
        '<div class="wstopbar">' +
          '<button class="wscorner" id="wsShop"><span class="wsic">🛠️</span><span>Shop</span></button>' +
          '<div class="wstitle">WORKSHOP<div class="wsgold">🫘 ' + b.currency + ' banked</div></div>' +
          '<button class="wscorner" id="wsUpg"><span class="wsic">⚙️</span><span>Upgrades</span></button>' +
        '</div>' +
        '<button class="wschar" id="wschar">' + artImg('skin', currentSkin().id, currentSkin().emoji, { cls: 'wsart' }) + '<div class="wssub">Tap to change skin · Ready for the desk.</div></button>' +
        challengeBtn(b) +
        '<button class="wsgo" id="beginrun">One more run?</button>' +
        '<div class="wslinks"><button class="wslink" id="wsStats">📊 Stats</button><button class="wsreset" id="wsReset">Reset progress</button></div>' +
      '</div>';
    $('wsShop').onclick = showShop;
    $('wsUpg').onclick = showUpgrades;
    $('wschar').onclick = showSkins;
    $('wsChal').onclick = function () { E.cycleChallenge(state.bank); saveBank(); showWorkshop(); };
    $('wsStats').onclick = showStats;
    $('beginrun').onclick = function () { E.startRun(state, rng); busy = false; enterPhase(); };
    $('wsReset').onclick = function () {
      if (!confirm('Wipe all permanent progression and start fresh?')) return;
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      state.bank = E.newBank(); showWorkshop();
    };
  }
  // playtest stats screen + JSON export (drop the file in the repo for offline analysis)
  function showStats() {
    var ov = $('overlay'); ov.style.display = 'flex';
    var s = loadStats();
    function pctRow(label, m) { return m && m.runs ? '<div class="statline"><span>' + label + '</span><span>' + Math.round(100 * m.wins / m.runs) + '% · ' + m.runs + ' runs</span></div>' : ''; }
    var overall = s.runs ? Math.round(100 * s.wins / s.runs) + '% win · ' + s.runs + ' runs (' + s.wins + 'W/' + s.lefts + 'L-left/' + s.losses + 'L)' : 'No runs recorded yet.';
    var byClass = Object.keys(s.byClass).map(function (k) { return pctRow(k, s.byClass[k]); }).join('');
    var byChal = Object.keys(s.byChallenge).map(function (k) { return pctRow(k, s.byChallenge[k]); }).join('');
    // dead picks: lowest pick-rate among upgrades offered ≥ 8 times
    var dead = Object.keys(s.offered).filter(function (id) { return s.offered[id] >= 8; })
      .map(function (id) { return { id: id, rate: (s.chosen[id] || 0) / s.offered[id], off: s.offered[id] }; })
      .sort(function (a, b) { return a.rate - b.rate; }).slice(0, 6)
      .map(function (d) { return '<div class="statline"><span>' + d.id + '</span><span>' + Math.round(d.rate * 100) + '% picked (' + d.off + ' seen)</span></div>'; }).join('') || '<p>Not enough data yet.</p>';
    var deaths = Object.keys(s.deathNodes).sort(function (a, b) { return s.deathNodes[b] - s.deathNodes[a]; }).slice(0, 6)
      .map(function (n) { return '<div class="statline"><span>node ' + n + '</span><span>' + s.deathNodes[n] + ' deaths</span></div>'; }).join('') || '<p>—</p>';
    ov.innerHTML = '<h2>📊 Playtest Stats</h2><div class="reveal">Overall</div><p>' + overall + '</p>' +
      '<div class="reveal">By class</div><div class="statbox">' + (byClass || '<p>—</p>') + '</div>' +
      '<div class="reveal">By challenge</div><div class="statbox">' + (byChal || '<p>—</p>') + '</div>' +
      '<div class="reveal">Least-picked (dead?) upgrades</div><div class="statbox">' + dead + '</div>' +
      '<div class="reveal">Death nodes</div><div class="statbox">' + deaths + '</div>' +
      '<div class="rowbtns"><button class="bigbtn" id="stExport">⬇️ Export data</button><button class="bigbtn ghost" id="stBack">Back</button></div>';
    $('stExport').onclick = exportStats;
    $('stBack').onclick = showWorkshop;
  }
  function exportStats() {
    try {
      var blob = new Blob([JSON.stringify(loadStats(), null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'dicey-desk-duels-stats.json'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) {}
  }
  // permanent upgrades (bought with banked 🫘) — persist between runs
  function showShop() {
    var ov = $('overlay'); ov.style.display = 'flex';
    function render() {
      var b = state.bank, maxHp = C.BALANCE.startHp + 5 * b.hpBought;
      var healPct = Math.round((C.BALANCE.healBetweenFights * (1 + b.healBought * (C.SHOP.heal.inc / C.BALANCE.healBetweenFights))) * 100);
      var rows = [
        ['dice', '🎲 Dice', 'You roll ' + b.diceCount + ' — more dice, bigger combos'],
        ['hp', '❤️ Max HP', maxHp + ' HP · +5 each'],
        ['armor', '🛡️ Armor', b.armorBought + ' · blocks that much per hit, forever'],
        ['reroll', '🔄 Rerolls', (C.BALANCE.baseRerolls + b.rerollBought) + '/turn · +1 each'],
        ['heal', '🌿 Natural Healing', healPct + '% healed between fights · +5% each'],
        ['beans', '👝 Deep Pockets', '+' + (b.beansBought * C.SHOP.beans.inc) + ' starting beans · +15 each'],
        ['luck', '🍀 Lucky Find', '+' + Math.round(b.luckBought * C.SHOP.luck.inc * 100) + '% beans from fights · +5% each'],
        ['heirloom', '🏺 Heirloom', b.heirloomBought + '/' + C.SHOP.heirloom.max + ' free reward picks at run start · +1 each']
      ].map(function (r) {
        var id = r[0], s = C.SHOP[id];
        var maxed = (id === 'dice' && b.diceCount >= s.max) || (s.max != null && id !== 'dice' && !E.canBuy(b, id) && b.currency >= E.shopCost(b, id));
        var cost = maxed ? 0 : E.shopCost(b, id), afford = !maxed && b.currency >= cost;
        return '<div class="shopline"><div><div class="ct">' + r[1] + '</div><div class="cd">' + r[2] + '</div></div>' +
          '<button class="buybtn" data-buy="' + id + '" ' + (afford ? '' : 'disabled') + '>' + (maxed ? 'MAX' : cost + ' 🫘') + '</button></div>';
      }).join('');
      // cosmetic skin offers (engine economy untouched; handled view-side). One row per shop skin, cheapest first.
      var skinRows = SKINS.filter(function (s) { return s.unlock === 'shop'; })
        .sort(function (a, c) { return a.cost - c.cost; })
        .map(function (s) {
          var owned = skinOwned(s), afford = b.currency >= s.cost;
          return '<div class="shopline"><div><div class="ct">' + s.emoji + ' ' + s.name + ' skin</div>' +
            '<div class="cd">Cosmetic only — equip it on the Workshop character.</div></div>' +
            '<button class="buybtn" data-buyskin="' + s.id + '" ' + (owned || !afford ? 'disabled' : '') + '>' +
            (owned ? 'OWNED' : s.cost.toLocaleString() + ' 🫘') + '</button></div>';
        }).join('');
      ov.innerHTML = '<h2>🛠️ Shop</h2><div class="reveal">🫘 ' + b.currency + ' banked</div>' +
        '<p>Permanent upgrades — they persist between runs. <b>Dice live here</b>, so in-run rewards stay free for build pieces.</p>' +
        '<div class="cards">' + rows + '</div>' +
        '<div class="reveal">Cosmetics</div><div class="cards">' + skinRows + '</div>' +
        '<button class="bigbtn ghost" id="shopback">Back</button>';
      ov.querySelectorAll('[data-buy]').forEach(function (btn) { btn.onclick = function () { E.buy(state, btn.dataset.buy); saveBank(); render(); }; });
      ov.querySelectorAll('[data-buyskin]').forEach(function (btn) { btn.onclick = function () {
        var s = SKINS.find(function (x) { return x.id === btn.dataset.buyskin; });
        if (!s || skinOwned(s) || b.currency < s.cost) return;
        b.currency -= s.cost; b.skins[s.id] = true; saveBank(); render();
      }; });
      $('shopback').onclick = showWorkshop;
    }
    render();
  }
  // enable/disable which build pieces can show up during a run (persists in the bank)
  function showUpgrades() {
    var ov = $('overlay'); ov.style.display = 'flex';
    var selected = state.bank.activeClass;   // which class's Load/Save/Reset row is shown (null = none)
    function lineFor(u, premium) {
      var off = E.isDisabled(state.bank, u.id);
      return '<div class="togline' + (off ? ' off' : '') + '"><div><div class="ct">' + (premium ? '✦ ' : '') + u.name + '</div>' +
        '<div class="cd">' + u.desc + '</div></div>' +
        '<button class="toggle' + (off ? '' : ' on') + '" data-tog="' + u.id + '">' + (off ? 'OFF' : 'ON') + '</button></div>';
    }
    function classBar() {
      var act = state.bank.activeClass;
      var btns = Object.keys(C.CLASSES).map(function (id) {
        var c = C.CLASSES[id], saved = E.hasClassSave(state.bank, id);
        return '<button class="classbtn' + (act === id ? ' on' : '') + (selected === id ? ' sel' : '') + '" data-cls="' + id + '">' +
          (saved ? '<span class="clssaved" title="Has a saved build">●</span>' : '') +
          '<span class="clsic">' + c.icon + '</span><span class="clsnm">' + c.name + '</span>' +
          '<span class="clsds">' + c.desc + '</span></button>';
      }).join('');
      var actions = '';
      if (selected) {
        var nm = C.CLASSES[selected].name;
        actions = '<div class="clsactions">' +
          '<button class="bigbtn" data-clsact="load">Load ' + nm + '</button>' +
          '<button class="bigbtn ghost" data-clsact="save">Save to ' + nm + '</button>' +
          (E.hasClassSave(state.bank, selected) ? '<button class="bigbtn ghost" data-clsact="reset">Reset ↺</button>' : '') +
          '</div>';
      }
      return '<div class="reveal">Class loadout</div>' +
        '<p>Tap a class, then <b>Load</b> its build or <b>Save</b> your current toggles to it. <b>' +
        (act ? C.CLASSES[act].name + ' active' : 'Custom') + '</b>.</p>' +
        '<div class="classrow">' + btns + '</div>' + actions;
    }
    function render() {
      ov.innerHTML = '<h2>⚙️ Upgrades</h2>' +
        '<div class="toggleall"><button class="bigbtn ghost" id="allOn">All ON</button><button class="bigbtn ghost" id="allOff">All OFF</button></div>' +
        classBar() +
        '<p>Turn build pieces on or off. Anything switched <b>OFF</b> won’t be offered as a run reward or treasure premium — so you only see the ones you actually want.</p>' +
        '<div class="reveal">Run rewards</div><div class="cards">' + C.UPGRADES.map(function (u) { return lineFor(u, false); }).join('') + '</div>' +
        '<div class="reveal">Treasure premiums</div><div class="cards">' + C.PREMIUMS.map(function (u) { return lineFor(u, true); }).join('') + '</div>' +
        '<button class="bigbtn ghost" id="upgback">Back</button>';
      // class buttons just SELECT (reveal Load/Save/Reset) — they no longer auto-apply
      ov.querySelectorAll('[data-cls]').forEach(function (btn) { btn.onclick = function () { selected = (selected === btn.dataset.cls) ? null : btn.dataset.cls; render(); }; });
      ov.querySelectorAll('[data-clsact]').forEach(function (btn) { btn.onclick = function () {
        var a = btn.dataset.clsact;
        if (a === 'load') E.loadClass(state.bank, selected);
        else if (a === 'save') E.saveClass(state.bank, selected);
        else if (a === 'reset') E.resetClass(state.bank, selected);
        saveBank(); render();
      }; });
      ov.querySelectorAll('[data-tog]').forEach(function (btn) { btn.onclick = function () { E.toggleDisabled(state.bank, btn.dataset.tog); selected = null; saveBank(); render(); }; });
      $('allOn').onclick = function () { E.setAllDisabled(state.bank, false); selected = null; saveBank(); render(); };
      $('allOff').onclick = function () { E.setAllDisabled(state.bank, true); selected = null; saveBank(); render(); };
      $('upgback').onclick = showWorkshop;
    }
    render();
  }
  // cosmetic skin picker (opened from the Workshop character)
  function showSkins() {
    var ov = $('overlay'); ov.style.display = 'flex';
    var sel = state.bank.skin;
    var tiles = SKINS.map(function (s) {
      var owned = skinOwned(s), equipped = s.id === sel;
      var status = equipped ? 'Equipped' : owned ? 'Tap to equip' : '🔒 ' + skinHint(s);
      return '<button class="skinbtn' + (equipped ? ' on' : '') + (owned ? '' : ' locked') + '"' +
        (owned && !equipped ? ' data-skin="' + s.id + '"' : ' disabled') + '>' +
        '<span class="skinic">' + artImg('skin', s.id, s.emoji, { cls: 'skinart' }) + '</span><span class="skinnm">' + s.name + '</span>' +
        '<span class="skinhint">' + status + '</span></button>';
    }).join('');
    ov.innerHTML = '<h2 class="win">Skins</h2>' +
      '<p>Pick your look on the desk — purely cosmetic. Unlock more by winning Challenge runs or buying in the Shop.</p>' +
      '<div class="skingrid">' + tiles + '</div><button class="bigbtn ghost" id="skback">Back</button>';
    ov.querySelectorAll('[data-skin]').forEach(function (b) {
      b.onclick = function () { state.bank.skin = b.dataset.skin; saveBank(); showSkins(); };
    });
    $('skback').onclick = showWorkshop;
  }

  /* ---- render ----------------------------------------------------------- */
  function pips(v) {
    var m = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }, h = '';
    for (var i = 1; i <= 9; i++) h += m[v].indexOf(i) > -1 ? '<span class="dot"></span>' : '<span></span>';
    return h;
  }
  function renderDice() {
    var row = $('dicerow'); row.innerHTML = ''; var p = state.player;
    for (var i = 0; i < 5; i++) {
      var d = document.createElement('div');
      if (i < p.dice.length) {
        var die = p.dice[i], wild = die.value === 'W';
        d.className = 'die' + (die.value === 6 || die.value === 1 ? ' six' : '') + (wild ? ' wild' : '') + (die.anchor ? ' anchor' : '');
        var skin = die.feature ? artImg('die', die.feature, '', { mode: 'layer', cls: 'dieart' }).replace('<img', '<img style="transform: scale(1.75);"') : '';
        d.innerHTML = skin + (wild ? '<div class="wildface">★</div>' : pips(die.value)) +
          (die.anchor ? '<div class="abadge">⚓</div>' : '') +
          (die.split ? '<div class="sbadge">×2</div>' : '') +
          (die.feature ? '<div class="fbadge">' + C.FEATURES[die.feature].icon + '</div>' + (die.flevel > 1 ? '<div class="flvl">' + die.flevel + '</div>' : '') : '');
        (function (idx) { d.onclick = function () { reroll(idx); }; })(i);
      } else d.className = 'die locked';
      row.appendChild(d);
    }
    $('rerolls').textContent = p.rerolls;
    $('maxrerolls').textContent = p.turnRerolls != null ? p.turnRerolls : E.effRerolls(p);
  }
  function renderPreview() {
    var ev = E.preview(state), cl = $('combolabel');
    cl.textContent = ev.name === 'No Combo' ? (state.player.dice.length === 1 ? 'single die' : 'no combo') : ev.name;
    cl.className = 'combo' + (ev.name === 'No Combo' ? ' none' : '');
    $('dmgval').textContent = ev.damage;
    var p = state.player, pierce = p.dice.some(function (d) { return d.feature === 'piercer'; });
    var t = state.enemies[state.targetIdx], blk = (t && t.armor > 0 && !pierce) ? ' (−' + t.armor + ')' : '';
    var hex = p.comboPenalty > 0 ? ' ✸hex' : '';
    var coin = p.doubleOrNothing ? ' 🎲×2/0' : '';
    $('dmgmeta').textContent = (ev.mult > 1 ? '×' + ev.mult : '') + blk + hex + coin;
  }
  function renderPlayer() {
    var p = state.player;
    renderHeroArt($('hero'), currentSkin(), 'heroart');
    $('phpfill').style.width = Math.max(0, p.hp / p.maxHp * 100) + '%';
    $('phptext').textContent = p.hp + ' / ' + p.maxHp;
    var sp = $('shieldpip'); if (p.shield > 0) { sp.style.display = 'flex'; $('shieldval').textContent = p.shield; } else sp.style.display = 'none';
    var ap = $('armorpip'); if (p.armor > 0) { ap.style.display = 'flex'; $('armorval').textContent = p.armor; } else ap.style.display = 'none';
  }
  function renderEnemies() {
    var wrap = $('enemies'); wrap.innerHTML = '';
    if (!state.enemies) return;
    if (state.targetIdx == null || !state.enemies[state.targetIdx] || state.enemies[state.targetIdx].hp <= 0) {
      var alive = state.enemies.findIndex(function (e) { return e.hp > 0; }); if (alive > -1) state.targetIdx = alive;
    }
    state.enemies.forEach(function (e, i) {
      var el = document.createElement('div');
      el.className = 'enemy' + (i === state.targetIdx && e.hp > 0 ? ' targeted' : '') + (e.hp <= 0 ? ' dead' : '');
      el.dataset.idx = i;
      var ih = '';
      if (e.hp > 0 && state.player && state.player.fogged) {
        ih = '<div class="intent fog">❓</div>';   // fogger: telegraphs hidden this turn
      } else if (e.hp > 0 && e.intent) {
        var it = e.intent;
        if (it.type === 'attack') { var h = it.hits > 1 ? it.hits + '×' : ''; ih = '<div class="intent atk">⚔️ ' + h + it.value + '</div>'; }
        else if (it.type === 'heal') ih = '<div class="intent heal">✚ ' + it.value + '</div>';
        else if (it.type === 'armor') ih = '<div class="intent arm">🛡️ ' + it.value + '</div>';
        else if (it.type === 'armorAlly') ih = '<div class="intent arm">🛡️→ ' + it.value + '</div>';
        else if (it.type === 'summon') ih = '<div class="intent heal">✦ summon</div>';
        else if (it.type === 'debuff') ih = '<div class="intent hex">' + (INTENT_DEBUFF[it.debuff] || '✸') + '</div>';
      }
      var sigs = '';
      if (e.sig) { var ids = Object.keys(C.SIGNATURES).filter(function (k) { return e.sig[k]; }); if (ids.length) sigs = '<div class="sigs">' + ids.map(function (k) { return '<span title="' + C.SIGNATURES[k].name + ': ' + C.SIGNATURES[k].desc + '">' + C.SIGNATURES[k].icon + (k === 'phaseFlip' && e._flipped ? '!' : '') + '</span>'; }).join('') + '</div>'; }
      el.innerHTML = (i === state.targetIdx && e.hp > 0 ? '<div class="reticle">▼</div>' : '') +
        '<div class="sprite">' + artImg('enemy', e.key, e.icon) + '</div><div class="name">' + e.name + '</div>' + sigs +
        '<div class="ehp"><i style="width:' + Math.max(0, e.hp / e.maxHp * 100) + '%"></i><span>' + e.hp + '/' + e.maxHp + '</span></div>' +
        (e.armor > 0 ? '<div class="earmor">🛡️' + e.armor + '</div>' : '') + ih;
      (function (idx) { el.onclick = function () { showEnemyStats(idx); }; })(i);
      wrap.appendChild(el);
    });
  }
  function enemyEl(i) { return document.querySelector('.enemy[data-idx="' + i + '"]'); }
  function renderAll() {
    if (!state.player) return;
    $('curlabel').textContent = state.player.runCurrency;
    var chchip = $('chalchip'); if (chchip) { var cm = state.player.challengeMult || 1; chchip.style.display = cm > 1 ? '' : 'none'; $('challabel').textContent = cm; }
    $('fightlabel').textContent = (state.run.pos ? state.run.pos.col + 1 : 1) + ' / ' + state.run.total;
    $('roundlabel').textContent = state.run.round;
    renderEnemies(); renderDice(); renderPreview(); renderPlayer();
    if (state.speaker) showPun(state.speaker);   // battle-start pun (shown once, then cleared)
    var t = state.enemies[state.targetIdx];
    $('attackbtn').disabled = busy || !t || t.hp <= 0;
    flushSkinUnlocks();   // surface any skin the engine just unlocked mid-fight (Viking / Cowboy)
  }

  /* ---- actions ---------------------------------------------------------- */
  // die levitates, flickers through random faces airborne, then slots onto the TRUE face with a bounce
  function rollDieAnim(dieEl, finalValue) {
    if (!dieEl) return Promise.resolve();
    var finalHTML = dieEl.innerHTML;   // element already shows the true face + badges (post-render)
    if (prefersReduced() || !dieEl.animate) { dieEl.innerHTML = finalHTML; return Promise.resolve(); }
    var total = 550, settle = 150, flick = setInterval(function () {
      dieEl.innerHTML = pips(1 + Math.floor(rng() * 6));   // flicker a random face mid-air
    }, 55);
    var restore = setTimeout(function () { clearInterval(flick); dieEl.innerHTML = finalHTML; }, total - settle);
    var a = anim(dieEl, [
      { transform: 'translateY(0) scale(1) rotate(0deg)', offset: 0 },
      { transform: 'translateY(-28px) scale(1.08) rotate(-6deg)', offset: 0.22 },     // lift (ease-out feel via offsets)
      { transform: 'translateY(-30px) scale(1.06) rotate(5deg)', offset: 0.45 },      // airborne wobble
      { transform: 'translateY(-26px) scale(1.07) rotate(-4deg)', offset: 0.62 },
      { transform: 'translateY(-28px) scale(1.05) rotate(0deg)', offset: 0.73 },      // poised to drop
      { transform: 'translateY(4px) scale(.98) rotate(0deg)', offset: 0.90 },         // overshoot below baseline
      { transform: 'translateY(0) scale(1) rotate(0deg)', offset: 1 }                 // settle
    ], { duration: total, easing: 'ease-in-out' });
    return a.then(function () { clearInterval(flick); clearTimeout(restore); dieEl.innerHTML = finalHTML; });
  }
  // cascade: roll every die staggered, so a fresh turn's roll tumbles in sequence
  function rollAllDice() {
    var p = state.player; if (!p) return;
    p.dice.forEach(function (die, i) {
      delay(i * 50).then(function () {
        var el = document.querySelectorAll('.dicerow .die')[i];
        if (el) rollDieAnim(el, die.value);
      });
    });
  }
  function reroll(i) {
    if (busy || state.phase !== 'player') return;
    if (!E.rerollDie(state, i, rng)) return;
    renderAll();
    rollDieAnim(document.querySelectorAll('.dicerow .die')[i], state.player.dice[i].value);
  }
  async function doAttack() {
    if (busy || state.phase !== 'player') return;
    var t = state.enemies[state.targetIdx]; if (!t || t.hp <= 0) return;
    busy = true; $('attackbtn').disabled = true;
    var targetIdx = state.targetIdx, targetEl = enemyEl(targetIdx);   // capture the LIVE target before resolving
    var aliveBefore = state.enemies.map(function (e) { return e.hp > 0; });
    var res = E.attack(state, rng);
    renderPlayer();   // update player hp/shield/armor WITHOUT rebuilding enemies (keeps live elements for knock-off)

    // hero lunge toward the target at the moment of impact
    var lunge = heroLunge(targetEl);
    if (!prefersReduced()) await delay(150);

    if (res.coin === 0) flash($('hero'), 'NOTHING!', '#9fb3ac');
    else if (res.coin === 2) flash($('hero'), 'DOUBLE!', '#ffd98a');

    // hit-stop: brief freeze on a strong combo (Four of a Kind or better)
    if (res.ev && res.ev.baseMult >= C.COMBOS['Four of a Kind']) await delay(60);

    // floaters + hurts on the live elements; primary-target floater scales/heats with the combo mult
    res.hits.forEach(function (h) {
      var el = enemyEl(h.i); if (!el) return; hurt(el);
      if (h.immune) { flash(el.querySelector('.sprite'), 'IMMUNE', '#9fb3ac'); return; }
      if (h.amount <= 0) return;
      var color = h.aoe === 'bubble' ? '#b6f0d0' : h.aoe === 'shock' ? '#ffd1f0' : h.aoe === 'overkill' ? '#ff9b6b' : h.splash ? '#9fe0ff' : '#ffd98a';
      var scale = 1;
      if (h.i === targetIdx && res.ev) {
        scale = Math.min(1.8, Math.max(1, 1 + (res.ev.mult - 1.5) / 3 * 0.8));   // ~1.0 at mult≤1.5 → ~1.8 at mult≥4.5
        if (scale >= 1.5) color = '#ff8a4c';                                     // hotter for big combos
      }
      flash(el.querySelector('.sprite'), '−' + h.amount, color, scale);
    });
    syncEnemyBars();   // drain survivors' HP bars in place
    // themed death: knock dying enemies off the desk on their live elements
    var knocks = [];
    state.enemies.forEach(function (e, i) {
      if (aliveBefore[i] && e.hp <= 0) { var el = enemyEl(i); if (el) knocks.push(knockOff(el)); }
    });
    if (res.heal > 0) flash($('hero'), '+' + res.heal, '#5fcf8f');
    if (res.spiked > 0) { hurt($('hero')); flash($('hero'), '🔱−' + res.spiked, '#ff9b9b'); }
    beanBurst(aliveBefore);

    // screen shake scaled to the hit magnitude
    if (res.hits.some(function (h) { return h.amount > 0; })) screenShake(res.ev ? 4 + (res.ev.mult - 1) * 4 : 4);

    await Promise.all(knocks);   // let the death arcs finish before the next render replaces them
    await delay(420);

    if (res.allDead) { var r = E.winFight(state); afterCombat(r); return; }

    var aliveBefore2 = state.enemies.map(function (e) { return e.hp > 0; });
    var et = E.enemyTurn(state); renderAll();   // rebuilds: dead enemies settle to the static .dead end-state
    et.actions.forEach(function (a) {
      var idx = state.enemies.indexOf(a.enemy), el = enemyEl(idx);
      if (a.type === 'attack') flash($('hero'), '−' + a.total + (a.riposte ? ' ↩' : ''), '#ff7b7b');
      else if (a.type === 'heal' && el) flash(el.querySelector('.sprite'), '+' + a.value, '#5fcf8f');
      else if (a.type === 'armor' && el) flash(el.querySelector('.sprite'), '🛡️+' + a.value, '#bcd0ff');
      else if (a.type === 'thorns' && el) { hurt(el); flash(el.querySelector('.sprite'), '🌵' + a.value, '#7fd98a'); }
      else if (a.type === 'summon' && el) flash(el.querySelector('.sprite'), '✦ summoned', '#d9b3ff');
      else if (a.type === 'debuff') flash($('hero'), DEBUFF_FX[a.debuff] || '✸', '#c89bff');
    });
    beanBurst(aliveBefore2);
    if (et.actions.some(function (a) { return a.type === 'attack'; })) {
      $('playerzone').classList.add('hurt'); setTimeout(function () { $('playerzone').classList.remove('hurt'); }, 300);
      screenShake(6);   // player took a hit
    }
    await delay(650);

    if (et.playerDead) { E.loseRun(state); runOver(false); return; }
    if (et.allDead) { afterCombat(E.winFight(state)); return; }   // Thorns can kill the last enemy on its own turn
    E.advanceAfterEnemy(state, rng); busy = false; renderAll(); rollAllDice();   // fresh turn → cascade roll
  }
  // dispatch on engine phase after a combat win or a node transition
  function afterCombat(r) {
    if (r === 'win') return runOver('win');
    if (r === 'miniboss') return showMiniboss();
    showRewards();   // 'reward'
  }
  function enterPhase() {
    busy = false;
    switch (state.phase) {
      case 'map': return showMap();
      case 'rest': return showRest();
      case 'treasure': return showTreasure();
      case 'shop': return showShopNode();
      case 'reforge': return showReforge();
      case 'event': return showEvent();
      case 'reward': return showRewards();
      case 'win': return runOver('win');
      default: $('overlay').style.display = 'none'; renderAll(); rollAllDice();   // fresh fight → cascade roll
    }
  }
  function proceed() { E.toMap(state); enterPhase(); }   // back to the map to pick the next node

  /* ---- the branching map ------------------------------------------------- */
  var MAPICON = { fight: '⚔️', elite: '💀', rest: '💤', treasure: '🎁', shop: '🛒', reforge: '⚒️', event: '❓', miniboss: '👑', boss: '☠️' };
  function showMap() {
    var ov = $('overlay'); ov.style.display = 'flex';
    var cols = state.map.cols, M = C.MAP;
    var SLOT = 62, ROW = 58, NODE = 42, PAD = 30;
    var W = M.widthMax * SLOT, H = M.cols * ROW + PAD * 2;
    // geometry: boss (col 19) at top, start (col 0) at bottom; nodes centered within each column
    function nx(c, i) { var k = cols[c].length; return W / 2 + (i - (k - 1) / 2) * SLOT; }
    function ny(c) { return PAD + (M.cols - 1 - c) * ROW + ROW / 2; }
    // reachable set + whether this is the opening pick
    var reach = {}; E.reachable(state).forEach(function (n) { reach[n.col + ':' + n.row] = true; });
    var pos = state.run.pos;
    // edges (SVG) — highlight the path you've taken and the choices you can make now
    var lines = [];
    cols.forEach(function (col, c) {
      if (c >= M.cols - 1) return;
      col.forEach(function (node, i) {
        node.next.forEach(function (j) {
          var child = cols[c + 1][j];
          var live = (node._done && child._done) || (pos && pos.col === c && pos.row === i && reach[(c + 1) + ':' + j]);
          lines.push('<line x1="' + nx(c, i).toFixed(1) + '" y1="' + ny(c).toFixed(1) + '" x2="' + nx(c + 1, j).toFixed(1) + '" y2="' + ny(c + 1).toFixed(1) + '" class="edge' + (live ? ' live' : '') + '"/>');
        });
      });
    });
    // Moth at the Lamp: a scouted node reveals its enemy roster (icons) instead of a bare count, up to scoutCol
    var scoutCol = state.run.scoutCol;
    var nodesHtml = '';
    cols.forEach(function (col, c) {
      col.forEach(function (node, i) {
        var k = node.col + ':' + node.row;
        var isCur = pos && pos.col === node.col && pos.row === node.row;
        var cls = node._done ? 'done' : isCur ? 'current' : reach[k] ? 'reach' : 'locked';
        var isCombat = (node.type === 'fight' || node.type === 'elite') && node.enemies;
        var scouted = isCombat && scoutCol != null && pos && node.col > pos.col && node.col <= scoutCol;
        var cnt = !isCombat ? ''
          : scouted ? '<span class="mroster">' + node.enemies.map(function (kk) { return (C.ENEMIES[kk] || {}).icon || '?'; }).join('') + '</span>'
          : '<span class="mcount">' + node.enemies.length + '</span>';
        nodesHtml += '<button class="mnode ' + cls + ' t-' + node.type + '"' + (cls === 'reach' ? '' : ' disabled') +
          ' data-c="' + node.col + '" data-r="' + node.row + '"' +
          ' style="left:' + (nx(c, i) - NODE / 2).toFixed(1) + 'px;top:' + (ny(c) - NODE / 2).toFixed(1) + 'px">' +
          MAPICON[node.type] + cnt + (isCur ? '<span class="mret">▼</span>' : '') + '</button>';
      });
    });
    // boss preview panel (revealed by the Moth at the Lamp): boss + its scouted signatures
    var bp = state.run.bossPreview, bpHtml = '';
    if (bp && C.ENEMIES[bp.key]) {
      var be = C.ENEMIES[bp.key];
      var sigs = bp.ids.map(function (id) { var s = C.SIGNATURES[id]; return s ? s.icon + ' ' + s.name : id; }).join(' · ');
      bpHtml = '<div class="bosspreview">' + artImg('enemy', bp.key, be.icon, { cls: 'bpico' }) +
        '<div><div class="bpname">☠️ ' + be.name + '</div><div class="bpsigs">' + sigs + '</div></div></div>';
    }
    ov.innerHTML = '<h2 class="win">' + (pos ? 'Choose your path' : 'Onto the desk') + '</h2>' +
      '<p>Node ' + (pos ? pos.col + 1 : 0) + ' / ' + M.cols + ' · ☠️ boss at the top. Lit nodes are reachable — tap one.</p>' + bpHtml +
      '<div class="mapscroll" id="mapscroll"><div class="map" style="width:' + W + 'px;height:' + H + 'px">' +
      '<svg class="medges" width="' + W + '" height="' + H + '">' + lines.join('') + '</svg>' + nodesHtml + '</div></div>';
    ov.querySelectorAll('.mnode.reach').forEach(function (btn) {
      btn.onclick = function () { E.enterNode(state, +btn.dataset.c, +btn.dataset.r, rng); enterPhase(); };
    });
    // auto-scroll: opening pick -> bottom (start); mid-run -> keep current node in view
    var sc = $('mapscroll');
    sc.scrollTop = pos ? Math.max(0, ny(pos.col) - sc.clientHeight * 0.6) : sc.scrollHeight;
  }

  function showRewards() {
    var ov = $('overlay'); ov.style.display = 'flex';
    var picks = E.offerRewards(state), left = state.run.pendingRewards, tok = state.run.optionRerolls;
    ov.innerHTML = '<div class="reveal">🫘 ' + state.player.runCurrency + ' this run' + (left > 1 ? ' · ' + left + ' picks left' : '') + '</div>' +
      '<h2 class="win">Pick a Reward</h2><p>Temporary build pieces for this run. Each pick also bumps enemy scaling.</p><div class="cards" id="rc"></div>' +
      '<button class="bigbtn ghost" id="rcReroll"' + (tok > 0 ? '' : ' disabled') + '>🎲 Reroll options (' + tok + ' left)</button>';
    var wrap = $('rc');
    picks.forEach(function (u) {
      var c = document.createElement('div'); c.className = 'card';
      c.innerHTML = '<div class="ct">' + u.name + '</div><div class="cd">' + u.desc + '</div>';
      c.onclick = function () { applyWithTarget(u, false, function () { if (state.run.pendingRewards > 0) showRewards(); else proceed(); }); };
      wrap.appendChild(c);
    });
    $('rcReroll').onclick = function () { if (E.rerollOffer(state)) showRewards(); };
  }

  /* ---- die targeting: pick a die (and preview/diff for face mods) -------- */
  function doApply(u, isPremium, idx) { return isPremium ? E.applyPremium(state, u.id, idx) : E.applyReward(state, u.id, rng, idx); }
  function faceCell(v, cls) {
    var wild = v === 'W';
    return '<div class="facetile' + (cls ? ' ' + cls : '') + (wild ? ' wild' : '') + '">' + (wild ? '<span class="wf">★</span>' : pips(v)) + '</div>';
  }
  function faceTiles(faces, changed) {
    return '<div class="facerow">' + faces.map(function (v, i) { return faceCell(v, changed && changed[i] ? 'changed' : ''); }).join('') + '</div>';
  }
  function dieTag(d, i) { return 'Die ' + (i + 1) + (d.feature ? ' · ' + C.FEATURES[d.feature].icon : '') + (d.anchor ? ' ⚓' : ''); }
  // entry point from a reward/premium card: route by effect kind
  function applyWithTarget(u, isPremium, onComplete) {
    var kind = E.effectKind(u.effect), dice = state.player.dice;
    if (kind === 'global') { doApply(u, isPremium, undefined); return onComplete(); }
    if (kind === 'die') { if (dice.length === 1) { doApply(u, isPremium, 0); return onComplete(); } return showDiePicker(u, isPremium, onComplete); }
    // face: single die -> straight to preview; else choose first
    if (dice.length === 1) return showFacePreview(u, isPremium, 0, onComplete);
    return showFaceChooser(u, isPremium, onComplete);
  }
  function showDiePicker(u, isPremium, onComplete) {
    var ov = $('overlay'); ov.style.display = 'flex';
    var tiles = state.player.dice.map(function (d, i) {
      var feat = d.feature ? '<div class="dpfeat">' + C.FEATURES[d.feature].icon + ' ' + C.FEATURES[d.feature].name + (d.flevel > 1 ? ' ' + d.flevel : '') + '</div>' : '<div class="dpfeat none">no feature</div>';
      var anc = d.anchor ? '<div class="dpfeat">⚓ anchored</div>' : '';
      return '<button class="diepick" data-i="' + i + '"><div class="dplabel">Die ' + (i + 1) + '</div>' + faceCell(d.value, 'big') + feat + anc + '</button>';
    }).join('');
    ov.innerHTML = '<div class="reveal">' + u.name + '</div><h2 class="win">Choose a die</h2><p>' + u.desc + '</p><div class="diegrid">' + tiles + '</div>';
    ov.querySelectorAll('.diepick').forEach(function (b) { b.onclick = function () { doApply(u, isPremium, +b.dataset.i); onComplete(); }; });
  }
  function showFaceChooser(u, isPremium, onComplete) {
    var ov = $('overlay'); ov.style.display = 'flex';
    var tiles = state.player.dice.map(function (d, i) {
      return '<button class="diepick wide" data-i="' + i + '"><div class="dplabel">' + dieTag(d, i) + '</div>' + faceTiles(d.faces) + '</button>';
    }).join('');
    ov.innerHTML = '<div class="reveal">' + u.name + '</div><h2 class="win">Choose a die</h2><p>' + u.desc + '</p><div class="diegrid">' + tiles + '</div>';
    ov.querySelectorAll('.diepick').forEach(function (b) { b.onclick = function () { showFacePreview(u, isPremium, +b.dataset.i, onComplete); }; });
  }
  function showFacePreview(u, isPremium, idx, onComplete) {
    var ov = $('overlay'); ov.style.display = 'flex';
    var d = state.player.dice[idx], multi = state.player.dice.length > 1;
    ov.innerHTML = '<div class="reveal">' + u.name + '</div><h2 class="win">' + dieTag(d, idx) + '</h2>' +
      '<p>Current faces. ' + u.desc + '</p>' + faceTiles(d.faces) +
      '<div class="rowbtns">' + (multi ? '<button class="bigbtn ghost" id="fpback">Back to dice</button>' : '') + '<button class="bigbtn" id="fpok">Confirm</button></div>';
    $('fpok').onclick = function () { var before = d.faces.slice(); doApply(u, isPremium, idx); showFaceDiff(u, idx, before, onComplete); };
    if (multi) $('fpback').onclick = function () { showFaceChooser(u, isPremium, onComplete); };
  }
  function showFaceDiff(u, idx, before, onComplete) {
    var ov = $('overlay'); ov.style.display = 'flex';
    var d = state.player.dice[idx], after = d.faces;
    var changed = after.map(function (v, i) { return v !== before[i]; });
    var none = changed.every(function (x) { return !x; });
    ov.innerHTML = '<div class="reveal">' + u.name + ' applied</div><h2 class="win">Die ' + (idx + 1) + (none ? ' unchanged' : ' changed') + '</h2>' +
      '<div class="diffwrap"><div class="difflabel">before</div>' + faceTiles(before) +
      '<div class="difflabel">after</div>' + faceTiles(after, changed) + '</div>' +
      '<button class="bigbtn" id="fdok">Continue</button>';
    $('fdok').onclick = function () { onComplete(); };
  }

  function showRest() {
    var ov = $('overlay'); ov.style.display = 'flex';
    ov.innerHTML = '<h2 class="win">Rest</h2><p>You patch yourself up — <b>60% heal</b> — and pocket a free build piece.</p>' +
      '<button class="bigbtn" id="restgo">Heal & pick a reward</button>';
    $('restgo').onclick = function () { E.restHeal(state); showRewards(); };
  }
  function showTreasure() {
    var ov = $('overlay'); ov.style.display = 'flex';
    ov.innerHTML = '<div class="reveal">Treasure</div><h2 class="win">Choose a Premium</h2>' +
      '<p>Powerful, free — and it won’t scale the enemies. Pick one.</p><div class="cards" id="tc"></div>';
    var wrap = $('tc');
    state.treasure.forEach(function (u) {
      var c = document.createElement('div'); c.className = 'card';
      c.innerHTML = '<div class="ct">✦ ' + u.name + '</div><div class="cd">' + u.desc + '</div>';
      c.onclick = function () { applyWithTarget(u, true, proceed); };
      wrap.appendChild(c);
    });
  }

  /* ---- in-run service nodes -------------------------------------------- */
  function showShopNode() {
    var ov = $('overlay'); ov.style.display = 'flex';
    var s = state.shop;
    if (!s.flavor) s.flavor = C.SHOP_FLAVOR[Math.floor(Math.random() * C.SHOP_FLAVOR.length)];
    function buyOffer(u) {
      var cost = E.runShopCost(state, u.id);
      if (s.bought >= 3 || state.player.runCurrency < cost) return;
      state.player.runCurrency -= cost; s.bought++;
      s.offers = s.offers.filter(function (x) { return x.id !== u.id; });
      applyWithTarget(u, false, function () { showShopNode(); });   // applies effect (+ enemy scaling), like a reward
    }
    var cards = s.offers.map(function (u) {
      var cost = E.runShopCost(state, u.id), afford = state.player.runCurrency >= cost && s.bought < 3;
      return '<button class="card shopoffer" data-id="' + u.id + '"' + (afford ? '' : ' disabled') + '>' +
        '<div class="ct">' + u.name + '</div><div class="cd">' + u.desc + '</div><div class="price">' + cost + ' 🫘</div></button>';
    }).join('') || '<p>Shelves are bare.</p>';
    ov.innerHTML = '<div class="reveal">🫘 ' + state.player.runCurrency + ' · bought ' + s.bought + '/3</div>' +
      '<h2 class="win">🛒 Shop</h2><p class="shopkeep">“' + s.flavor + '”</p>' +
      '<div class="cards">' + cards + '</div><button class="bigbtn" id="shopleave">Leave</button>';
    ov.querySelectorAll('.shopoffer').forEach(function (b) { b.onclick = function () { var u = s.offers.find(function (x) { return x.id === b.dataset.id; }); if (u) buyOffer(u); }; });
    $('shopleave').onclick = proceed;
  }
  function showReforge() {
    var ov = $('overlay'); ov.style.display = 'flex';
    function dieGrid(predicate) {
      return state.player.dice.map(function (d, i) {
        var ok = !predicate || predicate(d, i);
        var feat = d.feature ? C.FEATURES[d.feature].icon + ' ' + C.FEATURES[d.feature].name + (d.flevel > 1 ? ' ' + d.flevel : '') : 'no feature';
        return '<button class="diepick" data-i="' + i + '"' + (ok ? '' : ' disabled') + '><div class="dplabel">Die ' + (i + 1) + '</div>' + faceCell(d.value, 'big') + '<div class="dpfeat' + (d.feature ? '' : ' none') + '">' + feat + '</div></button>';
      }).join('');
    }
    function bindDice(fn) { ov.querySelectorAll('.diepick').forEach(function (b) { if (b.disabled) return; b.onclick = function () { fn(+b.dataset.i); }; }); }
    function main(note) {
      var beans = state.player.runCurrency, c = C.NODECOST;
      var hasFeat = state.player.dice.some(function (d) { return d.feature; }), multi = state.player.dice.length > 1;
      ov.innerHTML = '<div class="reveal">🫘 ' + beans + ' · ⚒️ Workbench</div><h2 class="win">Reforge</h2>' +
        (note ? '<p class="shopkeep">' + note + '</p>' : '<p>Spend beans to reshape your dice.</p>') +
        '<div class="cards">' +
        '<button class="card rfop" data-op="reroll"' + (beans >= c.reforgeReroll ? '' : ' disabled') + '><div class="ct">🎲 Re-roll a feature</div><div class="cd">Swap a die’s feature for a new random one.</div><div class="price">' + c.reforgeReroll + ' 🫘</div></button>' +
        '<button class="card rfop" data-op="transfer"' + ((beans >= c.reforgeTransfer && hasFeat && multi) ? '' : ' disabled') + '><div class="ct">🔀 Transfer a feature</div><div class="cd">Move a feature from one die to another.</div><div class="price">' + c.reforgeTransfer + ' 🫘</div></button>' +
        '<button class="card rfop" data-op="facemod"' + (beans >= c.reforgeFaceMod ? '' : ' disabled') + '><div class="ct">🪨 Stamp a face mod</div><div class="cd">Apply a chosen face mod to a die.</div><div class="price">' + c.reforgeFaceMod + ' 🫘</div></button>' +
        '</div><button class="bigbtn" id="rfleave">Leave</button>';
      ov.querySelectorAll('.rfop').forEach(function (b) { if (b.disabled) return; b.onclick = function () { pick(b.dataset.op); }; });
      $('rfleave').onclick = proceed;
    }
    function pick(op) {
      if (op === 'reroll') {
        ov.innerHTML = '<h2 class="win">Re-roll which die?</h2><p>Its feature becomes a new random one.</p><div class="diegrid">' + dieGrid(null) + '</div><button class="bigbtn ghost" id="rfback">Back</button>';
        bindDice(function (i) { E.reforgeReroll(state, i, rng); main('A fresh feature takes hold.'); });
      } else if (op === 'facemod') {
        var mods = ['forge', 'load', 'brand', 'engrave', 'uniform', 'polish'];
        var btns = mods.map(function (m) { var u = C.UPGRADES.find(function (x) { return x.id === m; }); return '<button class="card rfmod" data-m="' + m + '"><div class="ct">' + u.name + '</div><div class="cd">' + u.desc + '</div></button>'; }).join('');
        ov.innerHTML = '<h2 class="win">Which face mod?</h2><div class="cards">' + btns + '</div><button class="bigbtn ghost" id="rfback">Back</button>';
        ov.querySelectorAll('.rfmod').forEach(function (b) { b.onclick = function () { pickDieForMod(b.dataset.m); }; });
      } else if (op === 'transfer') {
        ov.innerHTML = '<h2 class="win">Move from which die?</h2><p>Pick the source (must have a feature).</p><div class="diegrid">' + dieGrid(function (d) { return !!d.feature; }) + '</div><button class="bigbtn ghost" id="rfback">Back</button>';
        bindDice(function (from) { chooseTarget(from); });
      }
      $('rfback').onclick = function () { main(); };
    }
    function pickDieForMod(m) {
      ov.innerHTML = '<h2 class="win">Stamp onto which die?</h2><div class="diegrid">' + dieGrid(null) + '</div><button class="bigbtn ghost" id="rfback">Back</button>';
      bindDice(function (i) { E.reforgeFaceMod(state, i, m); main('Stamped into the die.'); });
      $('rfback').onclick = function () { pick('facemod'); };
    }
    function chooseTarget(from) {
      ov.innerHTML = '<h2 class="win">Move to which die?</h2><div class="diegrid">' + dieGrid(function (d, i) { return i !== from; }) + '</div><button class="bigbtn ghost" id="rfback">Back</button>';
      bindDice(function (to) { E.reforgeTransfer(state, from, to); main('Feature moved.'); });
      $('rfback').onclick = function () { pick('transfer'); };
    }
    main();
  }
  function showEvent() {
    var ov = $('overlay'); ov.style.display = 'flex';
    var ev = state.event;
    var choices = ev.choices.map(function (ch, i) {
      var afford = (ch.outcome !== 'mysteryBox' && ch.outcome !== 'stateScaledReward') || state.player.runCurrency >= (ch.cost || 20);
      var body = ch.hidden ? '<span class="blind">???</span>' : ch.desc;   // blind door: outcome stays hidden until chosen
      return '<button class="card eventchoice" data-i="' + i + '"' + (afford ? '' : ' disabled') + '><div class="ct">' + ch.label + '</div><div class="cd">' + body + '</div></button>';
    }).join('');
    ov.innerHTML = '<div class="reveal">Event</div><h2 class="win">' + ev.icon + ' ' + ev.name + '</h2><p>' + ev.desc + '</p><div class="cards">' + choices + '</div>';
    ov.querySelectorAll('.eventchoice').forEach(function (b) {
      if (b.disabled) return;
      b.onclick = function () { var msg = E.applyEvent(state, +b.dataset.i, rng); if (msg === null) return; showEventResult(msg); };
    });
  }
  function showEventResult(msg) {
    if (state.phase === 'reward') return showRewards();   // pick-granting outcomes
    flushSkinUnlocks();   // Robot / Fox / Mad Scientist / Monk grant via events
    var ov = $('overlay'); ov.style.display = 'flex';
    ov.innerHTML = '<h2 class="win">…and on you go.</h2><p>' + (msg || 'You move on.') + '</p><button class="bigbtn" id="evok">Continue</button>';
    $('evok').onclick = function () { E.toMap(state); enterPhase(); };
  }
  function showMiniboss() {
    renderAll();
    var ov = $('overlay'); ov.style.display = 'flex';
    ov.innerHTML = '<h2 class="win">Miniboss down.</h2>' +
      '<p>Halfway across the desk. Leave now for a safe bonus of <b>🫘 ' + C.RUN.leaveBonus + '</b>, or press on toward the final boss for a much bigger payout — and the risk of losing this run’s beans.</p>' +
      '<div class="cards"><div class="card" id="leave"><div class="ct">Leave with the loot</div><div class="cd">Bank 🫘 ' + C.RUN.leaveBonus + ' now. Safe.</div></div>' +
      '<div class="card" id="press"><div class="ct">Press on</div><div class="cd">Continue to node 20. Bigger prize, real risk.</div></div></div>';
    $('leave').onclick = function () { E.leaveRun(state); runOver('left'); };
    $('press').onclick = function () { proceed(); };
  }
  function runOver(kind) {
    // first win at a Challenge tier unlocks its skin (persisted via the saveBank below)
    var unlockedSkin = null;
    if (kind === 'win' && state.player) {
      var m = state.player.challengeMult || 1;
      var s = SKINS.find(function (x) { return x.unlock === 'challenge' && x.mult === m; });
      if (s && !skinOwned(s)) { state.bank.skins[s.id] = true; unlockedSkin = s; }
    }
    renderAll();
    saveBank();   // run beans were just banked by winFight/leaveRun/loseRun
    flushSkinUnlocks();   // achievement skins the engine granted on win/leave (Samurai / Gladiator / Cowboy)
    recordRun(kind === 'win' ? 'win' : kind === 'left' ? 'left' : 'lose');   // playtest stats
    var ov = $('overlay'); ov.style.display = 'flex';
    var head = kind === 'win' ? 'You made it off the desk.' : kind === 'left' ? 'You slipped away.' : 'Squashed.';
    var body = kind === 'win' ? 'Beat the final boss — huge bonus banked.' :
      kind === 'left' ? 'Left after the miniboss with the confidence prize.' :
      'Fell on node ' + ((state.run.pos ? state.run.pos.col : 0) + 1) + ' of ' + state.run.total + '.';
    ov.innerHTML = '<h2 class="' + (kind === 'lose' ? 'lose' : 'win') + '">' + head + '</h2>' +
      '<p>' + body + ' Banked <b>🫘 ' + state.player.runCurrency + '</b> this run (total ' + state.bank.currency + '). Spend it, then go again stronger.</p>' +
      (unlockedSkin ? '<div class="reveal">🎉 New skin unlocked: ' + unlockedSkin.emoji + ' ' + unlockedSkin.name + '</div>' : '') +
      '<button class="bigbtn" id="toworkshop">To Workshop</button>';
    $('toworkshop').onclick = showWorkshop;
  }

  /* ---- stat panels: tap an enemy or your hero --------------------------- */
  function statItem(icon, name, desc) {
    return '<div class="statitem"><span class="si-ic">' + icon + '</span><span class="si-tx"><b>' + name + '</b>' + (desc ? '<span>' + desc + '</span>' : '') + '</span></div>';
  }
  function intentDesc(e) {
    if (e.hp <= 0 || !e.intent) return null;
    var it = e.intent;
    if (it.type === 'attack') { var multi = it.hits > 1; return { icon: '⚔️', txt: 'Attack — ' + (multi ? it.hits + ' hits of ' + it.value + ' (' + (it.value * it.hits) + ' total)' : it.value + ' damage') }; }
    if (it.type === 'heal') return { icon: '✚', txt: 'Heal a wounded ally for ' + it.value };
    if (it.type === 'armor') return { icon: '🛡️', txt: 'Armor up by ' + it.value };
    if (it.type === 'armorAlly') return { icon: '🛡️', txt: 'Give an ally ' + it.value + ' armor' };
    if (it.type === 'summon') return { icon: '✦', txt: 'Summon another enemy' };
    if (it.type === 'debuff') {
      var D = {
        hex: 'Hex you — weakens your next combo', jam: 'Jam a die to its lowest face next turn',
        lock: 'Pin your dice — only one reroll next turn', rust: 'Strip your armor for the rest of the fight',
        seal: 'Seal a die — disable its feature next turn', fog: 'Fog the board — hide telegraphs next turn'
      };
      return { icon: '✨', txt: D[it.debuff] || 'Curse your dice' };
    }
    return null;
  }
  function closeStats() { $('overlay').style.display = 'none'; renderAll(); }
  function showEnemyStats(i) {
    var e = state.enemies && state.enemies[i]; if (!e) return;
    var ov = $('overlay'); ov.style.display = 'flex';
    var alive = e.hp > 0, role = C.ROLES[e.role] || { name: e.role, desc: '' };
    var mv = intentDesc(e);
    var items = '<div class="reveal">Telegraphed move</div>' + (mv ? statItem(mv.icon, mv.txt, '') : '<p>No move telegraphed.</p>') +
      '<div class="reveal">Traits</div>' + statItem(e.icon, role.name, role.desc);
    if (e.sig) Object.keys(C.SIGNATURES).forEach(function (k) {
      if (e.sig[k]) { var s = C.SIGNATURES[k]; items += statItem(s.icon, s.name + (k === 'phaseFlip' && e._flipped ? ' (flipped)' : ''), s.desc); }
    });
    var hpPct = Math.max(0, e.hp / e.maxHp * 100);
    ov.innerHTML = '<div class="statpanel">' +
      '<div class="statbig">' + artImg('enemy', e.key, e.icon, { cls: 'big' }) + '</div><div class="statname">' + e.name + (i === state.targetIdx && alive ? ' <span class="statbadge">🎯 targeted</span>' : '') + '</div>' +
      '<div class="statbars"><div class="ehp big"><i style="width:' + hpPct + '%"></i><span>' + e.hp + ' / ' + e.maxHp + '</span></div>' +
      (e.armor > 0 ? '<span class="statchip">🛡️ ' + e.armor + '</span>' : '') + '</div>' +
      '<div class="statlist">' + items + '</div>' +
      '<div class="rowbtns">' + (alive ? '<button class="bigbtn" id="sttarget">🎯 Target</button>' : '') +
      '<button class="bigbtn ghost" id="stback">Return to battle view</button></div></div>';
    if (alive) $('sttarget').onclick = function () { if (!busy && state.phase === 'player') state.targetIdx = i; closeStats(); };
    $('stback').onclick = closeStats;
  }
  function playerStatuses() {
    var p = state.player, out = [];
    if (p.shield > 0) out.push(['🔷', 'Shield ' + p.shield, 'Absorbs the next ' + p.shield + ' damage, then fades.']);
    if (p.armor > 0) out.push(['🛡️', 'Armor ' + p.armor, 'Blocks ' + p.armor + ' off every hit you take, all run.']);
    if (p.wardPerTurn > 0) out.push(['🔷', 'Ward', '+' + p.wardPerTurn + ' shield at the start of every turn.']);
    if (p.dmgMult && p.dmgMult !== 1) out.push([p.dmgMult > 1 ? '⚔️' : '🪶', 'Damage ×' + (+p.dmgMult.toFixed(2)), p.dmgMult > 1 ? 'Your attacks hit harder.' : 'Your attacks hit softer.']);
    if (p.dmgTakenMult && p.dmgTakenMult !== 1) out.push(['💢', 'Incoming ×' + (+p.dmgTakenMult.toFixed(2)), p.dmgTakenMult > 1 ? 'You take more damage.' : 'You take less damage.']);
    if (p.comboPenalty > 0) out.push(['✨', 'Hexed −' + p.comboPenalty, 'Your next combo multiplier is reduced.']);
    if (p.jam) out.push(['🔒', 'Jammed', 'One die will be forced to its lowest face next turn.']);
    if (p.fogged) out.push(['🌫', 'Fogged', 'Enemy telegraphs are hidden this turn.']);
    if (p.dice.some(function (d) { return d._sealedFeature != null; })) out.push(['🏷', 'Sealed', 'A die’s feature is disabled this turn.']);
    if (p.bloodroll) out.push(['🩸', 'Bloodroll', 'Unlimited rerolls — each past your free pool costs 1 HP.']);
    if (p.comboBonus > 0) out.push(['✚', 'Combo +' + p.comboBonus, 'Added to your combo multiplier every turn (capped at 5×).']);
    if (p.berserker) out.push(['💀', "Berserker's Pact", '+1% damage for every 1% of max HP you are missing.']);
    if (p.doubleOrNothing) out.push(['🎲', 'Double or Nothing', 'Each attack flips a coin: double your damage, or zero.']);
    if (p.goldMult && p.goldMult !== 1) out.push(['🫘', 'Beans ×' + (+p.goldMult.toFixed(2)), 'Beans from fights are scaled.']);
    if (p.healMult && p.healMult !== 1) out.push(['❤️', 'Healing ×' + (+p.healMult.toFixed(2)), 'Between-fight and rest healing is scaled.']);
    if (p.greed > 0) out.push(['😈', 'Greed', 'Enemies have +' + Math.round(p.greed * 100) + '% HP & attack (you took the beans).']);
    if (p.overflowBank > 0) out.push(['💧', 'Banked rerolls +' + p.overflowBank, 'Added to your pool next turn (Overflow).']);
    var bub = state.player.dice.some(function (d) { return d.feature === 'bubble'; });
    var shk = state.player.dice.some(function (d) { return d.feature === 'shockwave'; });
    if (bub && (p.bubbleFlat || p.bubblePct !== 0.03 || p.bubbleCharge)) out.push(['🫧', 'Bubble enhanced', Math.round(p.bubblePct * 100) + '% of primary' + (p.bubbleFlat ? ' +' + p.bubbleFlat + ' flat' : '') + (p.bubbleCharge ? ', +' + p.bubbleCharge + ' charge' : '') + ' per hit.']);
    if (shk && (p.shockPct !== 0.10 || p.shockCharge || p.shockFocus)) out.push(['💥', 'Shockwave enhanced', Math.round(p.shockPct * 100) + '% of primary' + (p.shockCharge ? ', +' + p.shockCharge + ' charge' : '') + (p.shockFocus ? ', targets lowest HP' : '') + '.']);
    return out;
  }
  function showPlayerStats() {
    if (!state.player || state.phase === 'map') return;
    var p = state.player, ov = $('overlay'); ov.style.display = 'flex';
    var rr = p.turnRerolls != null ? p.turnRerolls : E.effRerolls(p);
    var st = playerStatuses().map(function (s) { return statItem(s[0], s[1], s[2]); }).join('') || '<p>No active buffs or debuffs.</p>';
    // every die is a tappable row → preview its faces
    var feats = p.dice.map(function (d, i) {
      var f = d.feature ? C.FEATURES[d.feature] : null;
      var name = 'Die ' + (i + 1) + (f ? ' · ' + f.name + (d.flevel > 1 ? ' ' + d.flevel : '') : '') + (d.anchor ? ' · ⚓' : '') + (d.split ? ' · ×2' : '');
      return '<button class="statitem diestatrow" data-i="' + i + '"><span class="si-ic">' + (f ? f.icon : '🎲') + '</span>' +
        '<span class="si-tx"><b>' + name + '</b><span>' + (f ? f.desc : 'Tap to see this die’s faces.') + '</span></span>' +
        '<span class="si-go">›</span></button>';
    }).join('');
    var hpPct = Math.max(0, p.hp / p.maxHp * 100);
    ov.innerHTML = '<div class="statpanel">' +
      '<div class="statbig">' + artImg('skin', currentSkin().id, currentSkin().emoji, { cls: 'big' }) + '</div><div class="statname">You</div>' +
      '<div class="statbars"><div class="php big"><i style="width:' + hpPct + '%"></i><span>' + p.hp + ' / ' + p.maxHp + '</span></div></div>' +
      '<div class="statrow2"><span class="statchip">🔄 ' + rr + '/turn</span>' + (p.armor > 0 ? '<span class="statchip">🛡️ ' + p.armor + '</span>' : '') + (p.shield > 0 ? '<span class="statchip">🔷 ' + p.shield + '</span>' : '') + '</div>' +
      '<div class="reveal">Buffs & debuffs</div><div class="statlist">' + st + '</div>' +
      '<div class="reveal">Your dice <span class="hinttiny">(tap to preview faces)</span></div><div class="statlist">' + feats + '</div>' +
      '<button class="bigbtn ghost" id="stback">Return to battle view</button></div>';
    ov.querySelectorAll('.diestatrow').forEach(function (b) { b.onclick = function () { showDieFaces(+b.dataset.i); }; });
    $('stback').onclick = closeStats;
  }
  function showDieFaces(i) {
    var d = state.player.dice[i]; if (!d) return;
    var ov = $('overlay'); ov.style.display = 'flex';
    var f = d.feature ? C.FEATURES[d.feature] : null;
    var cap = 'Die ' + (i + 1) + (f ? ' · ' + f.icon + ' ' + f.name + (d.flevel > 1 ? ' ' + d.flevel : '') : '') + (d.anchor ? ' · ⚓' : '') + (d.split ? ' · ×2' : '');
    ov.innerHTML = '<div class="statpanel"><div class="statname">' + cap + '</div>' +
      '<p>Current faces — what this die can roll.</p>' + faceTiles(d.faces) +
      (f ? '<div class="statlist">' + statItem(f.icon, f.name + (d.flevel > 1 ? ' ' + d.flevel : ''), f.desc) + '</div>' : '') +
      '<button class="bigbtn ghost" id="dfback">Back</button></div>';
    $('dfback').onclick = showPlayerStats;
  }

  /* ---- fx --------------------------------------------------------------- */
  var DEBUFF_FX = { hex: '✸ hexed', jam: '✸ jammed', lock: '🔒 pinned', rust: '🦠 rusted', seal: '🏷 sealed', fog: '🌫 fogged' };
  var INTENT_DEBUFF = { hex: '✸ hex', jam: '✸ jam', lock: '🔒 pin', rust: '🦠 rust', seal: '🏷 seal', fog: '🌫 fog' };
  function hurt(el) { el.classList.add('hurt'); setTimeout(function () { el.classList.remove('hurt'); }, 300); }
  // battle-start speech bubble over the speaking enemy; clears state.speaker so it only shows once
  function showPun(sp) {
    var el = enemyEl(sp.i); state.speaker = null; if (!el) return;
    var b = document.createElement('div'); b.className = 'punbubble'; b.textContent = '“' + sp.text + '”';
    el.appendChild(b);
    setTimeout(function () { b.classList.add('fade'); setTimeout(function () { if (b.parentNode) b.remove(); }, 600); }, 3000);
  }
  // pop a bean floater over each enemy that died since `aliveBefore` was snapshotted
  function beanBurst(aliveBefore) {
    state.enemies.forEach(function (e, i) {
      if (aliveBefore[i] && e.hp <= 0 && !e._totem) {
        var el = enemyEl(i); if (!el) return;
        var gold = Math.round((C.ENEMIES[e.key] ? C.ENEMIES[e.key].gold : 0) * (state.player.goldMult || 1));
        if (gold > 0) flash(el.querySelector('.sprite'), '🫘 +' + gold, '#ffe08a');
      }
    });
  }
  function flash(anchor, text, color, scale) {
    if (!anchor) return;
    var r = anchor.getBoundingClientRect(), host = $('game').getBoundingClientRect();
    var f = document.createElement('div'); f.className = 'floater'; f.textContent = text; f.style.color = color;
    if (scale && scale !== 1) {                                  // bigger + hotter for high-mult hits
      f.style.fontSize = (22 * scale) + 'px';
      if (scale >= 1.5) f.style.textShadow = '0 0 10px ' + color + ',0 2px 3px rgba(0,0,0,.6)';
    }
    f.style.left = (r.left - host.left + r.width / 2 - 12) + 'px';
    f.style.top = (r.top - host.top - 6) + 'px';
    $('game').appendChild(f); setTimeout(function () { f.remove(); }, 1000);
  }
  // lunge the hero toward the targeted enemy at the moment of impact, then back
  function heroLunge(targetEl) {
    var hero = $('hero'); if (!hero || !targetEl) return Promise.resolve();
    var hr = hero.getBoundingClientRect(), tr = targetEl.getBoundingClientRect();
    var dx = ((tr.left + tr.width / 2) - (hr.left + hr.width / 2)), dy = ((tr.top + tr.height / 2) - (hr.top + hr.height / 2));
    var len = Math.hypot(dx, dy) || 1, reach = 34;                // travel a fixed reach toward the target
    var ox = (dx / len) * reach, oy = (dy / len) * reach;
    return anim(hero, [
      { transform: 'translate(0,0)', offset: 0 },
      { transform: 'translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px)', offset: 0.5 },   // out (~170ms)
      { transform: 'translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px)', offset: 0.62 },  // brief hold
      { transform: 'translate(0,0)', offset: 1 }                                                  // back (~150ms)
    ], { duration: 340, easing: 'ease-out' });
  }
  // quick decaying random-offset shake of the whole board; amplitude scales with hit magnitude
  function screenShake(amp) {
    var g = $('game'); if (!g) return Promise.resolve();
    var a = Math.max(2, amp), frames = [{ transform: 'translate(0,0)' }];
    for (var i = 0; i < 6; i++) {
      var d = a * (1 - i / 6);   // decay
      frames.push({ transform: 'translate(' + ((rng() * 2 - 1) * d).toFixed(1) + 'px,' + ((rng() * 2 - 1) * d).toFixed(1) + 'px)' });
    }
    frames.push({ transform: 'translate(0,0)' });
    return anim(g, frames, { duration: 260, easing: 'ease-out' });
  }
  // themed death: knock the enemy off the desk (down + sideways + spin + fade) on the LIVE element
  function knockOff(el) {
    if (!el) return Promise.resolve();
    var dir = rng() < 0.5 ? -1 : 1, dx = dir * (40 + rng() * 50), rot = dir * (25 + rng() * 15);
    return anim(el, [
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: 'translate(' + dx.toFixed(1) + 'px,90px) rotate(' + rot.toFixed(1) + 'deg)', opacity: 0, offset: 1 }
    ], { duration: 420, easing: 'ease-in', fill: 'forwards' });
  }
  // drain on-screen HP bars in place (so survivors react instantly without a full rebuild that would hide the dead)
  function syncEnemyBars() {
    if (!state.enemies) return;
    state.enemies.forEach(function (e, i) {
      var el = enemyEl(i); if (!el) return;
      var fill = el.querySelector('.ehp > i'), txt = el.querySelector('.ehp span');
      if (fill) fill.style.width = Math.max(0, e.hp / e.maxHp * 100) + '%';
      if (txt) txt.textContent = Math.max(0, e.hp) + '/' + e.maxHp;
    });
  }

  /* ---- wiring ----------------------------------------------------------- */
  // mirror the overlay's open/closed state onto #game (.ov-open) so CSS can hide the
  // board beneath it — keeps the battle hero/enemies from ghosting through the ~94%
  // opaque overlay. One observer covers every show/hide site (incl. inline handlers).
  (function () {
    var ovEl = $('overlay'), gEl = $('game');
    function syncOv() { gEl.classList.toggle('ov-open', ovEl.style.display !== 'none'); }
    new MutationObserver(syncOv).observe(ovEl, { attributes: true, attributeFilter: ['style'] });
    syncOv();
  })();
  $('attackbtn').onclick = doAttack;
  $('playerzone').onclick = function (ev) { if (ev.target.closest('#infobtn')) return; showPlayerStats(); };
  $('infobtn').onclick = function () {
    state.bank.tutorialOpened = true; E.evaluateSkinUnlocks(state); saveBank(); flushSkinUnlocks();   // Detective: opening the tutorial
    var ov = $('overlay'); ov.style.display = 'flex';
    ov.innerHTML = '<h2>How it works</h2><p style="text-align:left">' +
      '• Roll your dice; the total is your damage. Matching combos multiply it (only the best counts).<br>' +
      '• A <b>1 strikes as a 6</b> for damage, but stays a 1 for combos.<br>' +
      '• Tap a die to reroll just it. Tap an enemy for its stats, telegraph & how to target it; tap yourself for your buffs.<br>' +
      '• Enemies act <b>after</b> you and telegraph it. No block, no whiff protection.<br>' +
      '• <b>Workshop = permanent</b> (bought with banked 🫘). <b>Run rewards = temporary</b> build pieces.<br>' +
      '• Beans bank even when you lose — every run feeds the next.</p>' +
      '<button class="bigbtn" onclick="document.getElementById(\'overlay\').style.display=\'none\'">Got it</button>';
  };
  showWorkshop();
})();
