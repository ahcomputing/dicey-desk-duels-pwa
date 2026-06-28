# Dice Roguelike — Design Doc

> **Concept:** Single-player roguelike crossed with Yahtzee. You roll dice; the roll is your damage. Poker/Yahtzee combos give dramatic multipliers. Progress through a branching run, fight telegraphed enemies, earn **fight rewards** (temporary, per-run upgrades) and **currency** (permanent, between-run). Tap dice to selectively reroll, push-your-luck style. **Kill or be killed — no defending, no whiff protection.**

**Status legend:** ✅ LOCKED · ❓ OPEN (needs a decision) · 🧠 TO BRAINSTORM

---

## 1. Core combat math

### Dice & rolling ✅
- Player owns 1–5 dice (more dice = permanent unlocks, see §5).
- **Fresh roll of all dice at the start of each combat turn.** No banking (exception: **Anchor** premium, §7).
- Standard d6 faces (1–6) by default; faces can be modified by upgrades (see §7).

### The 1-as-6 rule ✅
1. **Combo detection → literal faces.** A 1 is a 1. A pair of 1s is a pair; `1-2-3-4-5` is a straight.
2. **Damage sum → every 1 counts as 6.** Always. A single die rolling a 1 deals **6**.
3. **All other effects → a 1 is a 1.** "Pip added as shield" on a 1 grants **1**. (Wildcard is its own case — §7.)

> A pair of 1s deals identical damage to a pair of 6s. Both straights deal identical damage (each sums to 20).

### Combo multipliers ✅
**Only the single highest multiplier applies per turn.** Damage = (sum of damage-pips) × (best combo multiplier).

| Combo | Multiplier |
|---|---|
| No combo | 1.0× |
| One pair | 1.5× |
| Three of a kind | 2.5× |
| Two pair | 3.0× |
| Four of a kind | 3.5× |
| Full house | 4.5× |
| Straight | 4.5× |
| Five of a kind | 5.0× |

> **Hard cap: five-of-a-kind (5.0×). ✅** No six/seven-of-a-kind. Extra matched dice make top combos *easier to reach*, never exceed 5.0×.
> **Derivation:** sorts by dice committed, then difficulty within tier. Sum always uses all five pips.

### Reroll mechanics ✅
- **Per-die.** Tap a die → spend 1 reroll → only that die rerolls.
- Base pool = **3** free rerolls per attacking turn. Scopes: **per-die free reroll** and **global stash**.
- **No whiff protection ✅.**

---

## 2. Player stats: HP / Armor / Shield ✅

| Stat | Source | Behavior | Base |
|---|---|---|---|
| **HP** | Permanent upgrades | Hits 0 → run ends. | **30** |
| **Armor** | Permanent (expensive) | Flat block **per hit**, **does not deplete**. | 0 |
| **Shield** | In-run abilities only | Flat block, **depletes**. Doesn't carry between fights. | 0 |

**Per incoming hit:** shield absorbs first (depleting) → armor blocks its flat amount (per hit, non-depleting) → remainder hits HP. *Example: 10 shield + 5 armor vs 3×15 → 20 to HP total.*

> Shield persists across turns within a fight, clears at fight end. **No block button** — defense is woven into offense.

---

## 3. Economy: Fight Rewards & Currency ✅

- **Currency** drops from defeated enemies; banked permanently for menu upgrades, also spent at in-run shops/treasure.
- **Fight Rewards** (the in-run upgrade picks) are granted **per encounter** — no XP counter. **1 per standard fight, 2 per elite, 1 free at rest.** Each reward = choose 1 of 3 options.

### Run-end rewards & economy philosophy ✅
- **Leave after the miniboss (node 10):** small bonus gold — the "confidence prize."
- **Beat the final boss (node 20):** large bonus, **≥ 3× the leave bonus.**
- **Rewards kept deliberately small** so expensive permanents feel *earned*. The **challenge multiplier** (greed knob — multiply enemy HP/shield/damage for more gold) is the main accelerator; the design nudges players toward it.

---

## 4. In-run encounters & reward flow ✅

### Fight reward (per encounter)
- Offered **3 upgrade options**, pick one.
- **One free option-reroll per run ✅** — a single token that rerolls the 3 offered options.

### Shop
- **Not guaranteed.** Sits near a boss. **5 options, buy up to 3.** Spends only currency found that run. Same pool; temporary.

### Treasure ✅
- **Not guaranteed.** **Choice of two premiums — pick one, free. Cadence: 1–2/run, early-to-mid.**

---

## 5. Permanent upgrade economy (menu) ✅

| Upgrade | Cost curve | Grants |
|---|---|---|
| **Max HP** | 10 → 20 → 40 … (×2) | +5 max HP each |
| **Armor** | 10 → 20 → 40 … (×2) | +1 armor each |
| **Dice** | 10 → 20 → 40 → 80 (×2) | +1 die, max 5 |
| **Permanent rerolls** | 100 → 300 → 900 … (×3) | +1 base reroll |
| **Natural healing** | TBD | raises the % healed between fights (base 10%) |

🧠 **TO BRAINSTORM — more permanent upgrades.** Seed: *start a run with up to 3 pre-applied upgrades.*

---

## 6. Enemies & combat structure ✅ (partial)

- **1 enemy per fight early**, up to **3 per fight**.
- **Elites:** one strong enemy, or three fairly strong — grant **2 fight rewards**.
- Enemies **scale with each upgrade the player collects** (and the greed multiplier).
- **Telegraphed actions.** Enemies act **after** the player. Player picks a target; base **1 target/turn**.
- **Caster telegraph:** strip armor · lock rerolls · reduce combo multiplier · summon ally. *Reroll-lock casts after the player's reroll, limiting them to one.*
- No combo-immunity enemies.

### Enemy archetypes ✅
Because the player is single-target by default, multi-enemy fights are **target-priority puzzles** — the support/debuff enemies are the ones you must decide to kill first.

**Attackers**
- **Grunt** — low HP, modest hit. Filler.
- **Brute** — high HP, one big hit. *Punches through armor (per-hit); counter with shield or kill first.*
- **Swarm/Striker** — low HP, multi-hit small attacks. *Armor neuters them; they punish armorless builds & drain shield pools.*
- **Berserker** — attack escalates each turn it survives. *Kill-fast urgency.*
- **Turtle** — has its own armor (flat reduction on your hit). *Punishes small rolls; rewards big combos / Piercer.*

**Support / buffers**
- **Mender** — heals an ally. Priority kill.
- **Warden** — grants an ally armor (the cast we defined). Priority kill.
- **Standard-bearer** — passive aura: all other enemies gain +damage/+armor while it lives. Kill to collapse the group.
- **Summoner** — spawns grunts; can stall forever if ignored. Priority kill.

**Debuffers (attack the dice engine — the spicy ones)**
- **Hexer** — reduces your combo multiplier next turn.
- **Jailer** — reroll-lock (casts after your reroll, capping you at one).
- **Rust** — strips player armor.
- **Jammer** — forces one of your dice to a fixed low value next turn.
- **Sealer** — disables one die's feature next turn.
- **Fogger** — hides enemy telegraphs next turn (blinds your prioritization).

### Boss abilities ✅ (designed as "build checks")
Bosses = big HP/damage, sometimes with a buffer add. Each signature ability **punishes one dominant strategy** so no single build trivializes every boss — this is the main pressure that keeps build variety alive across runs.
- **Damage Cap / Ward** — takes at most X damage per turn → checks pure burst (Glass Cannon, All or Nothing); rewards consistency & AoE.
- **Shield Sunder** — ignores or strips your shield → checks shield-stacking; rewards HP/armor/offense.
- **Reinforcements** — summons adds at HP thresholds → checks single-target; rewards Shockwave/Bubble.
- **Hardening** — gains armor every turn you don't deal ≥X → checks slow ramp; rewards burst.
- **Reroll Tax** — −1 to your reroll pool while alive → checks reroll-hungry builds; rewards efficiency (Banker/Overflow).
- **Riposte** — telegraphs "if I survive this turn, I strike for [big]" → push-your-luck burst pressure.
- **Lifelink Totem** *(boss + add)* — boss is immune while its totem-add lives → forces split focus.
- **Phase Flip** — at 50% HP, swaps behavior (attacker → debuffer, or gains an aura) → two-phase fight.

**Signatures roll randomly each run ✅** (for replayability): the **miniboss** draws **1** random signature (a teaching moment); the **final boss** draws **2–3** random signatures plus its HP-threshold **phase shift**, often with a buffer add. The player can't pre-build for a specific boss, so flexible builds are rewarded and no single strategy is safe every run. *(Signature counts tunable.)*

### Enemy scaling ✅ (playtest-validated)
- **First enemy: 6 HP** — one die's max, so a fresh single-die player can one-shot it.
- **Additive per upgrade collected this run: +30% HP, +20% attack.** Validated in v2 playtest — felt right: enemies keep pace with the snowball (the brake on degenerate builds) while the gentler attack curve avoids one-shotting the player. Used `base × (1 + rate·upgrades)`.
- **Enemy count +1 every 4 fights, capped at 3:** fights 1–4 = 1 enemy, 5–8 = 2, 9+ = 3 → groups of 3 by the miniboss (node 10).

---

## 7. Dice upgrades

### Two classes
- **Face mods — stackable.** Modify faces.
- **Per-die features — one slot, replaceable, levelable.** New feature replaces old; duplicate **levels it up**.

### Trigger taxonomy ✅
Feature = **trigger** × **effect**. Triggers: **`(pip)`**, **`(reroll)`**, **`(combo)`**; candidates **`(keep)`**, **`(6)`**.

### Face mods (stackable) ✅
| Face mod | Effect |
|---|---|
| **Forge** | 2 random faces → 6 (skips existing 6s) |
| **Twin** | copy one random face's value onto another face |
| **Loaded** | lowest value → all its instances +1. Snowballs: `1`→`2,2`→`3,3,3`→`4,4,4,4`→`5×5`→ all 6s |
| **Brand** | a random non-1 face → **1** (1 = 6 damage *and* pairs) |
| **Engrave** | the two lowest faces each +1. Tracks Loaded early, slower past 5→6 |
| **Uniform** | a random face → the die's most common value |

### Per-die features ✅
| Feature | Effect | Level-up |
|---|---|---|
| **Free Reroll** `(self)` | +1 free reroll for this die each turn | +2 / +3 |
| **Cleave** `(combo)` | (pip × combo mult) splash to **each untargeted** enemy | ×2 |
| **Ascend** `(reroll)` | on reroll, can't roll below current value | strictly higher / never below 4 |
| **Bulwark** `(pip/reroll/combo)` | pip / new roll / combo-mult added as shield | 2× |
| **Echo** `(reroll)` | rolls twice, takes higher (UI: mini-dice, larger "expands") | best of 3 |
| **Siphon** `(pip/reroll/combo/damage)` | heal flat-pip / new roll / combo-scaled / on-damage | 2× |
| **Magnet** `(reroll)` | on reroll, biased to your most common showing value | stronger / guaranteed |
| **Momentum** `(keep)` | +1 pip per consecutive turn unrerolled; resets if rerolled | +2 |
| **Overcharge** `(6)` | shows a 6 → +1 reroll this turn | +2 |
| **Banker** `(reroll)` | each **unused** reroll at turn end → pip as bonus damage | 2× |
| **Whetstone** `(reroll)` | each reroll of this die → +X bonus damage this turn | 2× |
| **Overflow** `(combo)` | four-of-a-kind+ → bank +1 reroll next turn | — |
| **Thorns** `(pip/combo)` | reflect damage when hit | 2× |
| **Piercer** `(damage)` ⚑ on-trial | ignores enemy armor & shield | also unreducible |
| **Kindle** `(reroll)` ⚑ on-trial | each reroll → combo mult +0.1 this turn (capped) | — |

### AoE effects: Shockwave vs Bubble ✅
Charge-based, `(pip/reroll/combo)` triggers — **one trigger per die**, spread to scale.
- **Shockwave** — each charge hits a **random** enemy for **10%** of primary-target damage. Bursty.
- **Bubble** — each charge hits **every** enemy for **3%** of primary-target damage. Reliable.
> "Total damage" = primary-target damage. **Level-ups add charges, not %.**

### Effect Enhancers ✅ (global, conditional)
Own ≥1 instance → enhancers unlock that buff **every** instance. Go **wide** then **deep**.
- **Bubble:** *Reinforced* (+10 flat/hit) · *Bigger* (3%→5%) · *Double* (+1/source)
- **Shockwave:** *Amplified* (10%→15%) · *Chain* (+1 charge/source) · *Focused* (target lowest-HP)

### Tradeoff upgrades ✅ (powerful + costly)
Downside always visible. Lighter ones in normal pools; the heaviest in the premium chest.
| Upgrade | Upside | Downside |
|---|---|---|
| **Bloodroll** *(premium)* | **unlimited rerolls** | each reroll costs **1 HP** |
| **Glass Cannon** | **+100% all damage** | **−70% max HP** |
| **Berserker's Pact** | +1% damage per 1% max HP missing (1:1) | — (rewards low HP) |
| **Greed** | +50% currency from fights | enemies **+30% HP & +30% damage** |
| **Sacrificial Die** | **+3.0 to your combo multiplier** every turn | permanently lose one die this run (floor: 1 die) |
| **Double or Nothing** | per attack, coin flip: **double** your damage… | …or **set it to 0** |
| **All or Nothing** *(extreme)* | **5× damage** | **max HP becomes 1** — any hit kills you |

> These stack into builds: Glass Cannon + Berserker + All or Nothing + Bloodroll = a 1-HP glass dagger that one-shots or dies trying.

### One-off swaps ✅ (small, modular, grab several)
Minor two-sided trades that appear in the normal pool. Per-run, stackable.
| Swap | + | − |
|---|---|---|
| **Live Wire** | +2 rerolls / turn | −25% max HP |
| **Bulwark Stance** | +8 shield each turn | −20% damage |
| **Reckless** | +25% damage | +20% damage taken |
| **All-In Roll** | +30% damage | −2 rerolls / turn |
| **Patient** | +1 reroll / turn | −15% damage |
| **Pawnbroker** | +15% currency from fights | −30% max HP |
| **Scar Tissue** | +25% damage | −50% natural healing |
| **Bulk Up** | +30% max HP | −20% damage |

### Premium upgrades (Treasure pool) ✅
| Premium | Effect | Per-run cap |
|---|---|---|
| **Wildcard** | one face = **WILD** (any value for detection; contributes exactly 1 to the sum) | 1 |
| **Splitter** | a die counts as **two dice** for **detection only**; no trips; can't exceed cap | 2 |
| **Anchor** | this die persists across turns; only changes via **manual** reroll | 1 |
| **Bloodroll** | unlimited rerolls at 1 HP each | 1 |

---

## 8. Run structure & map ✅

### Shape
- **Two stages of 10 nodes.**
  - **Stage 1:** 9 encounters → **miniboss (node 10)** → **Decision: leave with a small bonus, or continue.**
  - **Stage 2:** 9 encounters → **final boss (node 20)** → **Victory** (large bonus, ≥3× the leave bonus).

### Map / pathing
- **Branching, up to 5 lanes wide**, Slay-the-Spire style. Each node connects forward to **up to 3** (left/straight/right); **edges clamp to 2**.
- **Hug a side** → fewer onward options; **stay central** → more choices. Positional tradeoff.
- **Previews:** each upcoming node shows its contents, so players route deliberately.

### Node types ✅
| Node | Contents | Reward |
|---|---|---|
| **Standard fight** | 1–3 enemies | 1 fight reward |
| **Elite** | 1 strong, or 3 fairly strong | **2 fight rewards** |
| **Rest** | — | **60% heal + 1 free fight reward** |
| **Treasure** | choose 1 of 2 premiums | the premium (1–2/run, early-mid) |
| **Shop** | 5 options, buy ≤3 | purchased upgrades |
| **Reforge / Workbench** | spend gold to re-roll/swap a die's feature, apply a chosen face mod, or transfer a feature between dice | build-fixing |
| **Event "?"** | narrative risk/reward | home for tradeoff/cursed picks, gambles, HP-for-power trades |
| **Miniboss** | node 10 | leave-or-continue decision |
| **Boss** | node 20 | win + large bonus |

### Healing ✅
- **+10% max HP after each fight** (base; raised by the Natural Healing permanent upgrade).
- **Rest node: 60% heal.**

---

## 9. Theme & presentation ✅

### Setting
- **You are a shrunk-down human fighting across a tabletop / desk.** Enemies are everyday desk & tabletop objects scaled up to monster size — which *justifies the dice* (combat literally plays out on a game table).
- **Stage 1:** the open desktop (cutting mat / notebook page). **Stage 2:** a new zone — inside the drawer, across the keyboard, or up on a bookshelf (TBD). The "path" reskins the causeway as a seam on a cutting mat / an open book's spine / a ruler's edge.

### Enemy reskins (mapping the §6 archetypes)
| Archetype | Desk-object skin |
|---|---|
| Grunt | paperclip |
| Brute (one big hit) | stapler — slams down |
| Swarm (multi-hit) | staples / thumbtacks |
| Berserker (escalates) | rubber band — winds up, snaps harder each turn |
| Turtle (self-armor) | binder clip / roll of tape |
| Mender (heals allies) | glue bottle / white-out — "mends" damage |
| Warden (armors allies) | tape dispenser — wraps allies |
| Standard-bearer (aura) | desk lamp — buffing glow |
| Summoner | pencil cup / box of staples |
| Hexer (cuts combo mult) | eraser — rubs out your combo |
| Jailer (reroll-lock) | binder clip / clamp — pins your dice |
| Rust (strips armor) | rusty screw / water drop |
| Jammer (jams a die low) | gum wad — sticks a die |
| Sealer (disables a feature) | sticker / tape |
| Fogger (hides telegraphs) | spilled coffee / eraser dust |

### Bosses
- Big desk implements: **scissors** (snapping Riposte), **pencil sharpener** (crank grinder), **hole-punch**, the **industrial stapler**.
- **Final boss: the Swiss Army knife** — perfect for randomized signatures, since it unfolds a different tool each run.

### UI / UX direction ✅
- **Emulate Dicero's clean *combat* HUD** (it maps ~1:1 to our design): encounter counter (1/20), round counter, challenge multiplier (×1), the **5-die row with locked slots for dice not yet unlocked**, per-die bonus readout, 3/3 reroll counter, target reticle, **telegraphed enemy attack number**, player HP + shield bars, central Attack button.
- Steal two touches: a **live outgoing-damage preview** before committing Attack, and **stacked relic-style icons** for active upgrades/enhancers (Dicero's "High Roller ×1").
- **Reject the dark patterns.** No cluttered menu, no multiple competing shops, no attention nags, not pay-to-win. **One clean shop** (the permanent-upgrade menu). The product value is a respectful, premium-feeling experience — the opposite of the inspiration's monetization.

---

## Resolved decisions
1–11. *(combat math, stats, reroll, treasure cadence, shockwave/bubble — see sections above)* ✅
12. ✅ No whiff protection.
13. ✅ No status-effect layer (Shockwave/Bubble/Thorns are the spice).
14. ✅ No block button — kill or be killed.
15. ✅ Run = 2×10 nodes, miniboss@10 (leave option), boss@20.
16. ✅ Healing: 10%/fight (upgradable) + 60% rest.
17. ✅ Elites grant 2 fight rewards; standard 1; rest 1.
18. ✅ Economy tight; challenge multiplier is the accelerator.
19. ✅ **XP dropped — replaced by per-encounter "fight rewards."**
20. ✅ Reforge/Workbench & Event "?" nodes adopted.
21. ✅ Tradeoff set finalized (Glass Cannon, Berserker, Greed, Sacrificial Die, Double or Nothing, All or Nothing, Bloodroll); Brittle Wall cut.
22. ✅ One-off swaps added (repeatable without limit); Sacrificial Die repeatable down to a 1-die floor.
23. ✅ Enemy archetypes & boss "build-check" abilities locked; boss signatures roll **randomly each run** (miniboss 1, final boss 2–3 + phase shift).
24. ✅ **Theme: shrunk-down human on a tabletop; enemies = desk objects.** Final boss = Swiss Army knife (§9).
25. ✅ Enemy tuning starting point: first enemy 6 HP, +30%/upgrade, +1 enemy every 4 fights (cap 3) (§6).
26. ✅ UI: emulate Dicero's clean combat HUD; one shop, no dark patterns, not pay-to-win (§9).

## Open questions
- *(none blocking — enemy/boss section is a working draft pending your reactions)*

## Brainstorm backlog
- ✅ **v2 playable prototype** — `underfoot_prototype.html` (single-file). Difficulty curve validated by play.
- ✅ **Data-driven foundation** — `underfoot/` project: `content.js` (all content as data) + `engine.js` (pure logic, no DOM, node-testable) + `view.js` (presentation), PWA shell (manifest + service worker), and a bundled `underfoot.html` for quick play. Headless sim confirms the meta-progression curve (~0% bare → ~79% fully invested). **This is the build foundation going forward.**
- 🧠 More permanent upgrades *(§5)*
- 🧠 Stage 2 setting + per-stage enemy/object palettes *(§9)*
- 🧠 Game feel & juice (dice physics, hit feedback, telegraph animation)
- 🧠 Platform / tech stack → prototype

---
*Design doc — Dice Roguelike · admin@ahcomputing.com*
