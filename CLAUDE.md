# Dicey Desk Duels — agent guide

Dice roguelike PWA, vanilla JS, **zero dependencies, no build step**. Live at dice.ahcomputing.com.
Depth lives in **`doc.html`** (architecture, schemas, recipes, gotchas — open it before nontrivial work);
this file is the short rules.

## Hard rules

- **content.js** = pure data (`CONTENT`). **engine.js** = pure logic (`Engine`) — no DOM, no timers, must stay
  `require()`-able in node. **view.js** = the ONLY file that touches the document — no game rules.
  audio.js/music.js are optional leaf layers; never call them from engine.
- Script load order in index.html is load-bearing: content → engine → audio → music → view.
- Keep the dual-export pattern (`window.X` + `module.exports`) in every JS file.
- Adding a monster/upgrade/event should touch only content.js. If it doesn't, question the design.
- Grant beans only via `Engine.addBeans` (it accrues lifetime totals + skin unlocks).

## Verify (always)

```bash
node validate.js     # after ANY change to content, art/, view SKINS, sounds, sw.js — catches silent id breakage
node sim.js 200      # after balance changes — win% per tier; bot is a lower bound, read relatively
node -e "const E=require('./engine.js'); console.log(E.evaluate([6,6,6,1,1]))"   # engine smoke test
python3 -m http.server 8080   # manual check (PWA needs http; file:// won't register the SW)
```

Known baseline (July 2026): validate.js reports 1 pre-existing ERROR (`heavystapler.summon: 'staples'`
doesn't exist — its Reinforcements signature silently no-ops) and WARNs for missing kitchen art +
unreachable staged kitchen enemies. Don't add new errors; fixing that one means adding a `staples`
enemy or repointing the summon.

## The trap this codebase sets

Cross-file IDs are hand-synced and **fail silently**: enemy keys ↔ pools/summons ↔ `art/enemy/*.png` ↔
MANIFEST.txt; skin ids ↔ `bank.skins` ↔ `SKIN_UNLOCKS` thresholds (missing threshold → Infinity →
unobtainable); `S.play('name')` ↔ audio.js `FX` (unknown → no-op). Filenames must equal ids exactly,
case-sensitive. validate.js exists because of this. Die-feature behaviour lives in ONE registry —
`Engine.FEATURE_HOOKS` (engine.js, above `rollDie`; hook signatures in its header comment) — paired 1:1
with `CONTENT.FEATURES` and validate-enforced.

## Recipes (full versions with hook sites in doc.html)

Skills exist for the four common workflows — `/add-enemy`, `/add-feature`, `/balance`, `/ship`
(`.claude/skills/`); use them when doing that work. The rest, in brief:

- **Enemy**: `ENEMIES` entry (role must exist in `ROLES`) + drop id into an `ENCOUNTER_POOLS*` band
  (+ optional PUNS line, art PNG, MANIFEST line).
- **Die feature**: `FEATURES` + `UPGRADES` (`effect:'addFeature'`) + ONE entry in `Engine.FEATURE_HOOKS`
  (onRoll / onTurnStart / onReroll / damage / onAttack / aoe / reflect / pierce / overkill) — the `damage`
  hook keeps preview == attack automatically; honor `d.flevel`.
- **Skin**: view.js `SKINS` entry; challenge/shop types are automatic; condition type needs
  `SKIN_UNLOCKS` threshold + `grant()` in `Engine.evaluateSkinUnlocks` + usually a `newBank()` counter.
- **Status effect**: copy the poison pattern — field in `startRun`, apply in `enemyTurn`, tick at top of
  `startPlayerTurn` (route death through `loseRun`, never set hp<0 and continue — softlock), clear in
  `winFight`, label in BOTH `DEBUFF_FX` and `INTENT_DEBUFF` (view.js:1073).
- **Ship**: bump `dice-duels-vN` in sw.js; new offline-needed files go in `SHELL` — but **never art/ PNGs**
  (one 404 kills the whole PWA install). "Change doesn't show" during dev = stale SW cache, not your code.

## Save data

`localStorage['underfoot.bank.v1']` (bank; schema-merged via `Object.assign(newBank(), saved)` — new fields
need a default in `newBank()` or view `backfillBank()`, there is NO versioned migration) and
`underfoot.stats.v1` (playtest telemetry). Run state is never persisted.

## Current staging (July 2026)

Kitchen biome: ~50 enemies + pools + `MAP_KITCHEN` exist as data; ALL mechanics are engine-complete
(poison, `deathBurst` — floored at 1 HP, can't kill —, `deathPoison`, `armorDecay`, dodge, goldSteal);
the biome is **not wired into the run flow** and has no art. Wiring plan: doc.html § kitchen biome;
design source: `kitchen_bestiary.md`. The sim is fully deterministic now (rng threaded through EFFECTS/
offers/signatures) — identical `node sim.js N` output every run; keep it that way when adding randomness.
