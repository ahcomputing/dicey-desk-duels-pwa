# Kitchen bestiary: 50-enemy brainstorm

A pull-from list for the kitchen biome, grouped by function and numbered 1 to 50.
Most map straight onto existing roles (grunt, swarm, brute, mender, turtle,
berserker, warden, summoner, standard/aura, hexer, jammer, boss). Tags:
- **[POISON]** uses the new poison system
- **[BUFF]** carries a passive active from spawn (armor, aura, rage, sticky, and
  so on)
- **[HOOK]** wants a small new engine hook beyond poison (called out inline)

Emoji are placeholders for real sprites later.

## Poison: the new system (define this before building)
Poison is stacks on the player that tick damage at the start of each player turn,
decaying by one per turn (numbers to tune). Enemies interact three ways:
- **cast**: an action that only applies stacks, little or no direct hit
- **on-hit**: its normal attack also adds stacks
- **aura**: applies a stack every turn just by being alive

Plus a couple of on-death poison bursts. This is engine work; the enemies below
only reference it.

## Cadence
Levels 1 to 20. Minibosses at 5, 10, and 15, boss at 20. The level-5 miniboss is
deliberately weak (an easy, funny speed bump). It ramps to a real wall at 15 and
the boss at 20.

## Default buffs
You wanted more enemies buffed out of the gate, so a large share carry a [BUFF]
passive. If the engine has no spawn-time "apply passive" step yet (starting
armor, an always-on aura, starting rage), that is the one small addition this
list leans on.

---

## Rabble: bugs and small bites (1-15)
1. **Sugar Ant** (🐜): grunt. The basic chomper, always in numbers.
2. **Ant Line** (🐜): summoner. Spawns an ant every turn (the one we discussed). [BUFF: relentless]
3. **Fruit Fly** (🪰): swarm. Two or three tiny hits, barely there.
4. **Gnat Cloud** (🦟): swarm. A haze of pin-pricks.
5. **Pantry Moth** (🦋): summoner. Drops larvae adds.
6. **Weevil** (🐛): swarm. Hides in the flour, steady chip.
7. **Silverfish** (🐟): jammer. Darts in and jams a die.
8. **Cockroach** (🪳): turtle. Refuses to die. [BUFF: hard-shell armor]
9. **Maggot** (🐛): grunt, poison-on-hit. Gross bites stack poison. [POISON]
10. **Housefly** (🪰): swarm. Buzzes for several hits.
11. **Toothpick Soldier** (🍢): swarm. Two quick pokes.
12. **Chopsticks** (🥢): swarm. A pair, two hits.
13. **Crumb Pile** (🍞): swarm. Lots of tiny nibblers.
14. **Popcorn Kernel** (🍿): berserker. Heats up, then pops for a burst. [BUFF: heating] [HOOK: on-death pop]
15. **Skewer** (🍢): swarm. Rapid jabs.

## Poison crew (16-25)
16. **Moldy Bread** (🍞): poison-cast. Puffs spores that stack poison. [POISON][BUFF: spore aura]
17. **Mold Colony** (🟢): standard, poison-aura. A stack every turn just by existing, and it patches allies. [POISON][BUFF]
18. **Spoiled Milk** (🥛): poison-cast. Heavy curdle stacks, and a poison splash on death. [POISON][HOOK: on-death splash]
19. **Rotten Egg** (🥚): hexer, on-death poison bomb. Stink cuts your combo, then it pops into a cloud. [POISON][HOOK]
20. **Moldy Cheese** (🧀): mender, poison-on-hit. Funky bites, heals its friends. [POISON][BUFF]
21. **Rusty Can** (🥫): turtle, poison-on-hit. Tetanus edge. [POISON][BUFF: armor]
22. **Bug Spray Can** (🧴): poison-cast. The pest that sprays you, ironically. [POISON]
23. **Mustard Blob** (🟡): grunt, poison-on-hit. Tangy sting. [POISON]
24. **Compost Clump** (🍂): summoner, poison-aura. Breeds flies and reeks. [POISON][BUFF]
25. **Ghost Pepper** (🌶️): berserker, poison-on-hit. An escalating burn. [POISON][BUFF: burning]

## Buffed by default (26-35)
26. **Chili Pepper** (🌶️): berserker. Enters already raging. [BUFF]
27. **Onion** (🧅): hexer. Tear aura cuts your combo from turn one. [BUFF]
28. **Garlic Clove** (🧄): warden. Wards its allies from the start. [BUFF]
29. **Steel Wool** (🧽): turtle. Scrubby armor on. [BUFF: armor]
30. **Rolling Pin** (🥖): brute. Enters armored and heavy. [BUFF: armor]
31. **Ice Cube** (🧊): turtle. Armor that melts a little each turn. [BUFF: melting armor][HOOK: decaying armor]
32. **Gummy Bear** (🐻): turtle. Sticky, soaks a hit. [BUFF]
33. **Honey Blob** (🍯): jammer. Sticky aura, gums a die on contact. [BUFF]
34. **Microwave** (📟): standard. A radiation aura pumps allies' attack. [BUFF: aura]
35. **Box Grater** (🧀): berserker or swarm. Sharp, shreds for bonus hits. [BUFF]

## Support and disruptors (36-45)
36. **Sponge** (🧽): mender. Soaks damage and heals up.
37. **Ladle** (🥄): mender. Scoops a heal onto an ally.
38. **Spatula** (🍳): warden. Flips a shield onto a friend.
39. **Butter Stick** (🧈): mender. Greasy self-heal, hard to pin.
40. **Sour Lemon** (🍋): hexer. Pucker cuts your combo.
41. **Fridge Magnet** (🧲): jammer. Magnetizes a die out of place. [BUFF: magnetic]
42. **Fly Paper** (📜): jammer. Sticky, holds a die down. [BUFF: sticky]
43. **Blender** (🌀): summoner. Spits out chopped bits each turn.
44. **Toaster** (🍞): berserker. Heats, then pops for a burst. [BUFF: heating]
45. **Can Opener** (🔧): jammer. Cranks a die off its face.

## Heavy (46)
46. **Cast-Iron Skillet** (🍳): brute. One big flat wallop, and tough. [BUFF: armor]

## Minibosses and boss (47-50)
47. **MINIBOSS · L5 (weak) · The Gingerbread Man** (🍪): the speed bump. Cocky and
    slippery, dodges the odd hit and taunts, with a small self-heal but low
    damage. Meant to be beatable and funny, your gentle intro to the miniboss
    slot. [HOOK: dodge chance]
48. **MINIBOSS · L10 · Rancid Rat** (🐀): a brute with poison-on-hit that also
    filches a little gold when it connects. Punishes slow kills. [POISON][HOOK: gold steal]
49. **MINIBOSS · L15 · Mold Colossus** (🟩): the poison wall. Poison aura every
    turn, summons spore adds, and mends them. Forces you to answer poison and AoE
    at the same time. [POISON][BUFF]
50. **BOSS · L20 · The Mousetrap** (🪤): the finale. A giant, gorgeously
    telegraphed SNAP. It arms over a turn, then unloads a huge burst you have to
    brace for. Draws the boss signatures and phase-flips (arms, fires, re-arms) at
    50 percent HP. Alternate finale if you want poison to headline instead: the
    Garbage Disposal, a grinding maw that summons rot and stacks poison.

---

## New engine hooks this list leans on (beyond poison)
Everything else is existing roles plus the poison system. Only these need a new
small hook:
- **on-death bursts**: Popcorn Kernel, Spoiled Milk, Rotten Egg
- **decaying armor**: Ice Cube
- **dodge chance**: The Gingerbread Man
- **gold steal on hit**: Rancid Rat
- **spawn-time passive**: the shared thing most [BUFF] enemies want

## How to use this
Do not ship all 50. Pick roughly 12 to 15 for the actual kitchen roster: a spread
of roles, three or four poison carriers so the new system gets shown off, a
handful of [BUFF] passives so fights feel textured, and the four specials. Keep
the rest on the bench for later waves or events.

---
admin@ahcomputing.com
