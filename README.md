# 🎲 Dicey Desk Duels

**A dice roguelike fought on a desk — and in the kitchen.** Roll your dice, chain poker-style combos to
multiply the damage, and fight your way across a branching map of office-supply foes (or, when you're ready,
the crawling horrors of the pantry) — then bank your beans and go again, stronger.

### ▶ **Play it live: [dice.ahcomputing.com](https://dice.ahcomputing.com)**

`vanilla JS` · `no build step` · `zero dependencies` · `installable PWA` · `MIT licensed`

<!-- Screenshot: drop an image at docs/screenshot.png and uncomment the next line. -->
<!-- ![Dicey Desk Duels](docs/screenshot.png) -->

> Best seen, not described — open the [live demo](https://dice.ahcomputing.com) (installable to your home
> screen, plays offline).

---

## What it is

You're tiny, the desk is a battlefield, and the stationery has it out for you. Each turn you **roll your
dice — the total is your damage**, and matching **combos multiply it** (only the best combo counts). A
quirk to build around: a **`1` strikes as a `6`** for damage, but stays a `1` for combos, so a die of all
1s is both a heavy hitter *and* an instant five-of-a-kind.

A run is a **procedurally generated, branching map** you pick your way across. Between runs, a permanent
**Workshop economy** (saved in your browser) lets you invest your winnings — every run feeds the next.

## Features

- **🎲 Combo-driven dice combat** — poker combos (pairs → five-of-a-kind) scale your hit; per-turn reroll
  economy; enemies telegraph, then strike. No block, no whiff protection.
- **🗺️ Procedural branching map** — a 20-column, Slay-the-Spire-style route with `fight` / `elite` /
  `rest` / `treasure` / `shop` / `reforge` / `?` event / `miniboss` / `boss` nodes, depth-weighted with
  anchors (miniboss, a guaranteed pre-boss rest, final boss).
- **🛠️ Workshop meta-progression** — a permanent **bank** (beans, dice, HP, armor, rerolls, plus Natural
  Healing / Deep Pockets / Lucky Find / Heirloom) that **persists across reloads** via `localStorage`.
- **⚔️ Classes** — **4 classes** (Brute, Warden, Gambler, Tinkerer) **+ 2 custom slots**, each a loadout
  preset with a signature AoE; pick one and hand-tweak from there.
- **🎯 Build pieces** — stackable per-die **features** (cleave, bulwark, siphon, thorns, shockwave, bubble,
  …), **face mods** (forge/load/brand/engrave/uniform/polish), and treasure **premiums** (wildcard, anchor,
  bloodroll, spare die, splitter, all-or-nothing).
- **👑 Boss build-checks** — bosses draw random **signatures** (damage cap, shield sunder, reinforcements,
  hardening, reroll tax, riposte, phase flip, lifelink totem, vampiric, regen, spikes), so each fight tests
  a different part of your build.
- **🍳 Two biomes** — the **Desk** and the **Kitchen**, chosen from a home-screen level switcher. The
  Kitchen is a full second bestiary (bugs, mold, spice, appliances) fought across **three escalating
  miniboss gates** (a joke of a Gingerbread Man at L5 → a poison **wall** at L15) and an L20 SNAP.
- **🧪 Poison / damage-over-time** — an enemy poison crew (spore auras, on-hit venom, on-death splashes) and
  a matching line of dice (Toxin / Venom / Blight / Nettle). Stacks tick each turn and **halve**; an on-screen
  🧪 counter shows exactly how much is ticking on you and on each foe.
- **🤝 Allies** — some events **recruit a companion** that flanks your hero, jabs a random enemy every turn,
  and sticks with you for the REST of the run — a recruited foe even fights in its own sprite.
- **🐜 `?` events** — 36 narrative risk/reward nodes (gambles, decaying buffs, trickle income, blind doors,
  ambush minibosses, and a few that **befriend a companion and unlock a skin**).
- **🧝 47 unlockable cosmetic skins** — 4 default (incl. Penguin), **10** via Challenge wins (×1–×10), **20**
  bought in the shop (1,000–20,000 beans), and **13** earned through play (zero-reroll win, brink-HP win,
  lifetime beans, a colossal hit, besting the Kitchen minibosses, befriending event critters, and more).
- **🔊 Sound & generative music** — synthesized SFX and a layered, biome-aware soundtrack (the boss layers
  intensity in); mute + volume for each live in Settings.
- **🔥 Challenge dial (×1–×10)** — a pre-run difficulty/greed knob: tougher enemies, richer bean payouts.
- **📱 Installable PWA** — works offline, installs to the home screen; an art layer of PNG sprites with a
  silent **emoji fallback**, so it looks complete with or without art assets.

## Quickstart

**Easiest:** just open the **[live demo](https://dice.ahcomputing.com)** — and, on HTTPS, install it to
your home screen to play offline.

**Run it locally** — it's a PWA, so serve it over http(s) (the service worker and install need it). From
the project folder:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
```

Any static host works too (nginx, Caddy, GitHub Pages, …) — there's **nothing to build**, just files.

---

## Architecture — the content / engine / view split

This is the whole point of the codebase: **content, logic, and rendering are three separate things.**

| File | What it is | You touch it to… |
|---|---|---|
| `content.js` | **Pure data.** Enemies, encounters, upgrades, shop curves, balance numbers, events. | Add/tune game content. |
| `engine.js`  | **Pure logic.** Combo math, scaling, turn flow, unlocks. No DOM, no timers. | Change rules. Unit-test in node. |
| `audio.js`   | **Optional leaf.** Synthesized Web-Audio SFX. Never called from the engine. | Add/adjust sound effects. |
| `music.js`   | **Optional leaf.** Generative, biome-aware soundtrack (shares the audio graph). Never called from the engine. | Add/adjust music. |
| `view.js`    | **Presentation.** DOM, input, animation, skins; the only file that drives audio/music. | Change how it looks/feels. |

The rule: **adding a monster or an upgrade should only ever touch `content.js`.** Script load order in
`index.html` is load-bearing: content → engine → audio → music → view.

### Add an enemy
1. Add an entry to `ENEMIES` in `content.js` with a `role` that already exists:
   grunt / swarm / brute / mender / turtle / **berserker** / **warden** / **summoner** / **standard** (aura)
   / **hexer** / **jammer** / **jailer** (reroll-lock) / **rust** (strips armor) / **sealer** (disables a
   die feature) / **fogger** (hides telegraphs) / boss.
2. Drop its id into a depth band of `ENCOUNTER_POOLS` (or `ELITE_POOLS`). That's it — no engine or view
   changes.

### Add an upgrade
Add an entry to `UPGRADES` with an `effect` that exists in `Engine.EFFECTS`. Available effects:
`addFeature` (per-die features: cleave, bulwark + variants, freereroll, echo, overcharge, banker,
whetstone, siphon + variants, thorns + variants, piercer, shockwave, bubble, …), the face mods (`forge`,
`load`, `engrave`, `uniform`, `polish` — `brand` is treasure-only), `ward`, and the tradeoffs (`glassCannon`, `reckless`,
`liveWire`, `bulwarkStance`, …). A genuinely new *kind* of effect is the only thing that needs an engine
edit (add it to `EFFECTS`). Pre-run difficulty is the `CHALLENGE` dial.

### The run (procedural branching map)
Each run is a randomly generated, branching 20-column map (`Engine.generateMap`), Slay-the-Spire style:
pick a starting node, then route forward through up to 3 choices per step. Node types are assigned by
depth-weighted RNG with anchors (miniboss@9, guaranteed rest@18, boss@19) and min-column guards for the
service nodes. Tune everything from the `MAP` block in `content.js` (column widths, path count, per-stage
type weights, treasure/elite caps, service-node min-cols); fight contents are drawn from the depth-banded
`ENCOUNTER_POOLS` / `ELITE_POOLS`. Events live in `EVENTS`, in-run node prices in `NODECOST`. No engine
changes needed to re-theme or re-balance the run.

The **Kitchen** biome is the same `generateMap` fed a second map/pool set: `MAP_KITCHEN` swaps the single
miniboss anchor for **three fixed gates** (`minibossCols` / `minibossAt`) plus a `bossKey`, and fights draw
from `ENCOUNTER_POOLS_KITCHEN` / `ELITE_POOLS_KITCHEN`. Events tagged `biome:'kitchen'` surface only there.

### Classes & the bank
The **bank** (permanent progression — beans, dice, HP, armor, rerolls, Natural Healing / Deep Pockets /
Lucky Find / Heirloom, plus reward toggles) **persists across reloads via `localStorage`** (`view.js`). A
**class** (`CLASSES`) is a loadout preset: picking one flips the per-reward toggles to that kit; you can
still hand-tweak. "Reset progress" in the Workshop wipes the save.

### Premiums & boss signatures
`PREMIUMS` (treasure pool: wildcard, anchor, bloodroll, spare die, splitter, all-or-nothing, brand) map to the
same `EFFECTS` registry and carry a per-run `cap`. `SIGNATURES` are the boss "build-checks" (damage cap,
shield sunder, reinforcements, hardening, reroll tax, riposte, phase flip, **lifelink totem**, vampiric,
regen, spikes), drawn randomly each run — miniboss gets 1, the final boss gets 2–3 + phase flip, and the
final boss also spawns a **buffer add** (`buffer` field on the boss enemy) so it plays as a priority puzzle.

### Skins & unlocks
Cosmetic skins are defined view-side (`view.js` `SKINS`), owned in the bank (`bank.skins`), and unlocked
through three paths: **Challenge wins** (×1–×10), **shop purchases** (beans), and **condition/event
achievements** evaluated by `Engine.evaluateSkinUnlocks` against persistent trackers (lifetime beans,
big-hit damage, zero-reroll wins, brink-HP wins, event befriendings, tutorial opened). Tunable thresholds
live in `content.js` `SKIN_UNLOCKS`.

## Verify the engine without a browser

Because `engine.js` is pure, you can test it headlessly:

```bash
node -e "const E=require('./engine.js'); console.log(E.evaluate([6,6,6,1,1]))"
```

There's also a committed balance harness:

```bash
node sim.js            # 300 runs/tier; pass a number to change the count
```

It auto-plays bare / mid / full / full+each-class and prints win% / avg node / avg beans. The bot is a
deliberately simple *lower bound* (cautious picks, crude rerolls, skips reforge) — read it as a **relative
curve**, not a skill ceiling. Enemy scaling lives in `BALANCE.hpPerUpgrade` / `atkPerUpgrade`; re-run the
sim after changing it.

## Contributing

Contributions are welcome — the data/logic/view split means most changes (new enemies, upgrades, events,
balance tweaks) touch only `content.js`, with no build tooling to fight. Start from the
[Architecture](#architecture--the-content--engine--view-split) section, keep `engine.js` DOM-free and
node-testable, and re-run `node sim.js` after any balance change. Open an issue or PR.

### Deeper docs & tooling (for contributors and AI assistants)

- **[`doc.html`](doc.html)** — the full developer reference: architecture, every data schema, the engine
  API, step-by-step recipes (add an enemy / die feature / skin / status effect / biome), and the list of
  silent-failure gotchas. Open it in a browser; it's self-contained.
- **`CLAUDE.md`** — the condensed rules-of-the-road for AI coding assistants.
- **`node validate.js`** — a wiring linter that cross-checks enemy/feature/skin/sound IDs against pools,
  art files, manifests, engine registries, and the service-worker shell. The game's cross-file contracts
  fail *silently* (a bad id just never spawns; a missing PNG falls back to an emoji) — run this after any
  content or art change to make mistakes loud.

## License

MIT © 2026 Aaron Hendricks — free to use, modify, and build on. See [`LICENSE`](LICENSE).

Questions: admin@ahcomputing.com
