/* ============================================================================
 * validate.js  —  content/art/wiring linter. Run `node validate.js` after ANY
 * change to content.js, view.js SKINS, audio SFX names, art/, or sw.js.
 *
 * Why this exists: the game's cross-file contracts all fail SILENTLY —
 *   • a bad enemy/pool/summon id just never spawns (spawnEnemy returns null)
 *   • a missing art PNG falls back to an emoji with no error
 *   • an unknown sound name is a no-op (audio.js play() returns)
 *   • an upgrade whose `effect` isn't in Engine.EFFECTS throws only when picked
 * This script makes every one of those mismatches loud.
 *
 * ERROR = a reference that is broken right now (will misbehave in play) → exit 1
 * WARN  = drift or known staging gaps (missing art, manifest rot)       → exit 0
 * ========================================================================== */
'use strict';
var fs = require('fs'), path = require('path');
var C = require('./content.js');
var E = require('./engine.js');

var ROOT = __dirname;
var errors = 0, warns = 0;
function err(msg)  { errors++; console.log('ERROR  ' + msg); }
function warn(msg) { warns++;  console.log('WARN   ' + msg); }
function section(name) { console.log('\n== ' + name + ' =='); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function pngKeys(dir) {
  var p = path.join(ROOT, dir);
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p).filter(function (f) { return /\.png$/.test(f); }).map(function (f) { return f.replace(/\.png$/, ''); });
}
// a MANIFEST.txt line documents one asset: "<filename>.png  — <description>"
function manifestKeys(file) {
  var p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').split('\n')
    .map(function (l) { var m = l.match(/^(\S+)\.png\s/); return m && m[1]; })
    .filter(Boolean);
}

var viewSrc = read('view.js'), engineSrc = read('engine.js'), audioSrc = read('audio.js'), swSrc = read('sw.js');

/* ---- extract view.js SKINS ids (view.js can't be require()d — it needs a DOM).
 * Matches the object-literal ids inside the `var SKINS = [ ... ];` block. */
var skinsBlock = (viewSrc.match(/var SKINS = \[([\s\S]*?)\n\s*\];/) || [, ''])[1];
var SKIN_IDS = [], skinRe = /\{\s*id:\s*'([^']+)'/g, sm;
while ((sm = skinRe.exec(skinsBlock))) SKIN_IDS.push(sm[1]);
if (!SKIN_IDS.length) err('could not extract SKINS ids from view.js — did the SKINS array move or change shape?');
var conditionSkinIds = [];
var condRe = /\{\s*id:\s*'([^']+)'[^}]*unlock:\s*'condition'/g;
while ((sm = condRe.exec(skinsBlock))) conditionSkinIds.push(sm[1]);

/* ---- extract audio.js FX names (the `var FX = { name: function ... }` registry) */
var fxBlock = (audioSrc.match(/var FX = \{([\s\S]*?)\n  \};/) || [, ''])[1];
var FX_NAMES = [], fxRe = /^\s{4}(\w+):\s*function/gm;
while ((sm = fxRe.exec(fxBlock))) FX_NAMES.push(sm[1]);
if (!FX_NAMES.length) err('could not extract FX sound names from audio.js — did the FX registry move?');

/* =========================================================================
 * 1. ENEMIES: schema + every enemy-id reference resolves
 * ========================================================================= */
section('enemies & pools');
var enemyKeys = Object.keys(C.ENEMIES);
// roles whose intent math reads a per-enemy stat field — missing it meant NaN intents, and NaN
// armor/heal poisons e.armor → e.hp → the enemy can become unkillable (the screambread bug,
// 2026-07; turtle now has an engine || 2 fallback, mender's heal still NaNs). Either way a
// missing field is a content mistake worth failing on. warden/berserker/summoner have sane || fallbacks.
var ROLE_REQUIRES = { turtle: 'selfArmor', mender: 'heal' };
enemyKeys.forEach(function (k) {
  var e = C.ENEMIES[k];
  if (!C.ROLES[e.role]) err('ENEMIES.' + k + ' has role "' + e.role + '" which is not in CONTENT.ROLES (stats screen breaks, behaviour falls to plain attack)');
  ['hp', 'atk', 'gold'].forEach(function (f) { if (typeof e[f] !== 'number') err('ENEMIES.' + k + '.' + f + ' is not a number'); });
  var reqField = ROLE_REQUIRES[e.role];
  if (reqField && typeof e[reqField] !== 'number') err('ENEMIES.' + k + ' (role ' + e.role + ') is missing numeric "' + reqField + '" — its intent shows NaN and can corrupt the enemy into an unkillable state');
  if (!e.icon) err('ENEMIES.' + k + ' has no icon (emoji fallback renders blank)');
});

// collect every place an enemy id is referenced, so we can check both directions
var referenced = {};   // id -> [where]
function ref(id, where) { (referenced[id] = referenced[id] || []).push(where); }
function checkPools(pools, label) {
  if (!pools) return;
  Object.keys(pools).forEach(function (band) {
    pools[band].forEach(function (group, gi) {
      group.forEach(function (id) {
        ref(id, label + '.' + band + '[' + gi + ']');
        if (!C.ENEMIES[id]) err(label + '.' + band + '[' + gi + '] references unknown enemy "' + id + '" (fight node spawns nothing for it)');
      });
    });
  });
}
checkPools(C.ENCOUNTER_POOLS, 'ENCOUNTER_POOLS');
checkPools(C.ELITE_POOLS, 'ELITE_POOLS');
checkPools(C.ENCOUNTER_POOLS_S2, 'ENCOUNTER_POOLS_S2');
checkPools(C.ELITE_POOLS_S2, 'ELITE_POOLS_S2');
checkPools(C.ENCOUNTER_POOLS_KITCHEN, 'ENCOUNTER_POOLS_KITCHEN');
if (C.ELITE_POOLS_KITCHEN) checkPools(C.ELITE_POOLS_KITCHEN, 'ELITE_POOLS_KITCHEN');
(C.MAP.bossKeys.minibossPool || []).concat(C.MAP.bossKeys.bossPool || []).forEach(function (id) {
  ref(id, 'MAP.bossKeys');
  if (!C.ENEMIES[id]) err('MAP.bossKeys references unknown enemy "' + id + '"');
  else if (C.ENEMIES[id].role !== 'boss') err('MAP.bossKeys "' + id + '" does not have role boss (no signatures will be assigned)');
});
// Kitchen map: fixed minibosses (minibossAt: {col: key}) + a single bossKey (the multi-miniboss schema)
if (C.MAP_KITCHEN) {
  var kbosses = Object.keys(C.MAP_KITCHEN.minibossAt || {}).map(function (col) { return C.MAP_KITCHEN.minibossAt[col]; });
  if (C.MAP_KITCHEN.bossKey) kbosses.push(C.MAP_KITCHEN.bossKey);
  kbosses.forEach(function (id) {
    ref(id, 'MAP_KITCHEN.minibossAt/bossKey');
    if (!C.ENEMIES[id]) err('MAP_KITCHEN references unknown boss enemy "' + id + '"');
    else if (C.ENEMIES[id].role !== 'boss') err('MAP_KITCHEN boss "' + id + '" does not have role boss (no signatures will be assigned)');
  });
}
// summon / buffer fields point at other enemies; spawnEnemy(null) silently no-ops
enemyKeys.forEach(function (k) {
  var e = C.ENEMIES[k];
  ['summon', 'buffer'].forEach(function (f) {
    if (e[f] === undefined) return;
    ref(e[f], 'ENEMIES.' + k + '.' + f);
    if (!C.ENEMIES[e[f]]) err('ENEMIES.' + k + '.' + f + ' = "' + e[f] + '" is not an enemy — the summon/reinforcement silently does NOTHING in fights');
  });
});
// event-triggered fights (fightThenReward) name a specific enemy the pools never mention
C.EVENTS.forEach(function (ev) {
  ev.choices.forEach(function (ch, i) {
    if (ch.outcome !== 'fightThenReward') return;
    if (!ch.enemy) { err('EVENTS.' + ev.id + '.choice' + i + ' is fightThenReward with no `enemy` (nothing to fight)'); return; }
    ref(ch.enemy, 'EVENTS.' + ev.id + '.choice' + i + '.enemy');
    if (!C.ENEMIES[ch.enemy]) err('EVENTS.' + ev.id + ' fightThenReward enemy "' + ch.enemy + '" is not an enemy — the ambush spawns nothing');
  });
});
// PUNS keyed by enemy id (a stray key is dead flavor text, never shown)
Object.keys(C.PUNS).forEach(function (k) { if (!C.ENEMIES[k]) warn('PUNS.' + k + ' has no matching enemy (dead flavor line)'); });
// enemies nothing references can never appear in a run
var unreachable = enemyKeys.filter(function (k) { return !referenced[k]; });
if (unreachable.length) warn(unreachable.length + ' enemies are in no pool/bossKeys/summon/buffer and can never spawn: ' + unreachable.join(', '));

/* =========================================================================
 * 2. Effects wiring: content ids must resolve to engine registries
 * ========================================================================= */
section('upgrades, premiums, classes, signatures');
var upgradeIds = {}, premiumIds = {};
C.UPGRADES.forEach(function (u) {
  upgradeIds[u.id] = true;
  if (!E.EFFECTS[u.effect]) err('UPGRADES.' + u.id + ' effect "' + u.effect + '" is not in Engine.EFFECTS (throws when the player picks it)');
  if (u.effect === 'addFeature' && !C.FEATURES[u.feature]) err('UPGRADES.' + u.id + ' feature "' + u.feature + '" is not in CONTENT.FEATURES (die renders blank, no behaviour)');
});
C.PREMIUMS.forEach(function (u) {
  premiumIds[u.id] = true;
  if (!E.EFFECTS[u.effect]) err('PREMIUMS.' + u.id + ' effect "' + u.effect + '" is not in Engine.EFFECTS');
});
Object.keys(C.CLASSES).forEach(function (cid) {
  var cls = C.CLASSES[cid];
  (cls.ids || []).forEach(function (id) {
    if (!upgradeIds[id] && !premiumIds[id]) err('CLASSES.' + cid + ' loadout id "' + id + '" is not an UPGRADES or PREMIUMS id (toggle points at nothing)');
  });
  if (cls.signature && !upgradeIds[cls.signature]) err('CLASSES.' + cid + '.signature "' + cls.signature + '" is not an UPGRADES id (first-offer guarantee silently skipped)');
});
// every FEATURES key must have a FEATURE_HOOKS registry entry (and vice versa) —
// the registry is the single place die-feature behaviour lives (engine.js)
Object.keys(C.FEATURES).forEach(function (k) {
  if (!E.FEATURE_HOOKS || !E.FEATURE_HOOKS[k]) err('FEATURES.' + k + ' has no Engine.FEATURE_HOOKS entry — it renders on a die but does nothing');
});
Object.keys(E.FEATURE_HOOKS || {}).forEach(function (k) {
  if (!C.FEATURES[k]) warn('Engine.FEATURE_HOOKS.' + k + ' has no CONTENT.FEATURES entry — behaviour that can never be acquired or rendered');
});
// SIGNATURES: every id assignSignatures can roll must have an assignment branch
Object.keys(C.SIGNATURES).forEach(function (k) {
  if (engineSrc.indexOf("'" + k + "'") < 0) err('SIGNATURES.' + k + ' has no branch in Engine assignSignatures — bosses that roll it get a blank signature');
});

/* =========================================================================
 * 3. Events: outcomes and skin grants must exist
 * ========================================================================= */
section('events & skin unlocks');
// legal outcome ids = the `ch.outcome === '...'` branches in Engine.applyEvent (auto-extracted, so it can't drift)
var OUTCOMES = { nothing: true };
var outRe = /ch\.outcome === '(\w+)'/g;
while ((sm = outRe.exec(engineSrc))) OUTCOMES[sm[1]] = true;
C.EVENTS.forEach(function (ev) {
  ev.choices.forEach(function (ch, i) {
    if (!OUTCOMES[ch.outcome]) err('EVENTS.' + ev.id + ' choice ' + i + ' outcome "' + ch.outcome + '" has no branch in Engine.applyEvent (choice does nothing)');
    if (ch.outcome === 'unlockSkin' && SKIN_IDS.indexOf(ch.skin) < 0) err('EVENTS.' + ev.id + ' unlocks skin "' + ch.skin + '" which is not in view.js SKINS (toast + picker tile never appear)');
    if (ch.onWin && ch.onWin.unlockSkin && SKIN_IDS.indexOf(ch.onWin.unlockSkin) < 0) err('EVENTS.' + ev.id + ' onWin unlocks skin "' + ch.onWin.unlockSkin + '" which is not in view.js SKINS');
  });
});
// condition skins need a granter: Engine.evaluateSkinUnlocks grant('id'), a view unlockSkin('id'), or an unlockSkin event
var eventSkins = {};
C.EVENTS.forEach(function (ev) { ev.choices.forEach(function (ch) { if (ch.outcome === 'unlockSkin') eventSkins[ch.skin] = true; if (ch.onWin && ch.onWin.unlockSkin) eventSkins[ch.onWin.unlockSkin] = true; }); });
conditionSkinIds.forEach(function (id) {
  var granted = engineSrc.indexOf("grant('" + id + "'") > -1 || viewSrc.indexOf("unlockSkin('" + id + "')") > -1 || eventSkins[id];
  if (!granted) err('SKINS "' + id + '" (unlock: condition) has no grant path in engine.js, view.js, or an unlockSkin event — permanently unobtainable');
});
// thresholds engine reads (cfg.<key>) must exist in CONTENT.SKIN_UNLOCKS — a missing
// one defaults to Infinity in evaluateSkinUnlocks, silently making the skin unobtainable
var cfgRe = /cfg\.(\w+)/g, cfgKeys = {};
while ((sm = cfgRe.exec(engineSrc))) cfgKeys[sm[1]] = true;
Object.keys(cfgKeys).forEach(function (k) {
  if (!(k in C.SKIN_UNLOCKS)) err('engine.js reads SKIN_UNLOCKS.' + k + ' but content.js does not define it (threshold defaults to Infinity — unlock can never fire)');
});

/* =========================================================================
 * 4. Art ↔ key cross-checks (filename must exactly equal the id, case-sensitive)
 * ========================================================================= */
section('art files');
function crossCheckArt(dir, keys, label) {
  var files = pngKeys(dir);
  files.forEach(function (f) {
    if (keys.indexOf(f) < 0) err(dir + '/' + f + '.png matches no ' + label + ' key — orphan (typo/case mismatch? it will never render)');
  });
  var missing = keys.filter(function (k) { return files.indexOf(k) < 0; });
  if (missing.length) warn(missing.length + ' ' + label + ' keys have no ' + dir + '/ PNG (emoji fallback shows): ' + missing.join(', '));
}
crossCheckArt('art/enemy', enemyKeys, 'ENEMIES');
crossCheckArt('art/die', Object.keys(C.FEATURES), 'FEATURES');
crossCheckArt('art/skin', SKIN_IDS, 'SKINS');

/* =========================================================================
 * 5. MANIFEST drift (hand-maintained docs; keep them honest)
 * ========================================================================= */
section('art manifests');
[ { file: 'art/enemy/MANIFEST.txt', dir: 'art/enemy', keys: enemyKeys, label: 'ENEMIES' },
  { file: 'art/die/MANIFEST.txt',   dir: 'art/die',   keys: Object.keys(C.FEATURES), label: 'FEATURES' },
  { file: 'art/skin/MANIFEST.txt',  dir: 'art/skin',  keys: SKIN_IDS, label: 'SKINS' }
].forEach(function (m) {
  var listed = manifestKeys(m.file);
  if (listed === null) { warn(m.file + ' missing'); return; }
  listed.forEach(function (k) {
    if (m.keys.indexOf(k) < 0) warn(m.file + ' lists ' + k + '.png but there is no matching ' + m.label + ' key (stale entry)');
  });
  var undoc = m.keys.filter(function (k) { return listed.indexOf(k) < 0; });
  if (undoc.length) warn(m.file + ' is missing lines for ' + undoc.length + ' ' + m.label + ' keys: ' + undoc.join(', '));
});

/* =========================================================================
 * 6. Sounds: every S.play('name') in view.js must exist in audio.js FX
 * ========================================================================= */
section('sounds');
var playRe = /S\.play\('(\w+)'\)/g, played = {};
while ((sm = playRe.exec(viewSrc))) played[sm[1]] = true;
Object.keys(played).forEach(function (n) {
  if (FX_NAMES.indexOf(n) < 0) err("view.js calls S.play('" + n + "') but audio.js FX has no such sound (silent no-op)");
});

/* =========================================================================
 * 7. PWA shell: everything sw.js precaches must exist (one 404 fails install)
 * ========================================================================= */
section('service worker shell');
var shellBlock = (swSrc.match(/const SHELL = \[([\s\S]*?)\];/) || [, ''])[1];
var shellRe = /'([^']+)'/g;
while ((sm = shellRe.exec(shellBlock))) {
  var f = sm[1]; if (f === '.') continue;
  if (!fs.existsSync(path.join(ROOT, f))) err('sw.js SHELL lists "' + f + '" which does not exist — caches.addAll() rejects and the PWA never installs offline');
}
if (!/const CACHE = 'dice-duels-v\d+'/.test(swSrc)) warn("sw.js cache name doesn't match the expected 'dice-duels-vN' pattern — remember it must be BUMPED on shell changes");

/* ---- summary ------------------------------------------------------------ */
console.log('\n' + (errors ? '✗ ' + errors + ' error(s)' : '✓ no errors') + ', ' + warns + ' warning(s).');
if (errors) process.exit(1);
