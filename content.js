/* ============================================================================
 * content.js  —  ALL game content lives here, as plain data.
 * This is the file you edit to grow the game. Adding a monster or an upgrade
 * should never require touching engine.js or view.js.
 *   • New enemy  -> add to ENEMIES (existing role) + drop its id into an ENCOUNTER_POOLS band
 *   • New upgrade-> add to UPGRADES referencing an `effect` (see Engine.EFFECTS)
 *   • New premium-> add to PREMIUMS (treasure pool); new boss check -> SIGNATURES
 * ========================================================================== */
var CONTENT = {
  BALANCE: {
    startHp: 32,
    baseRerolls: 3,
    startCurrency: 30,     // small stipend so run 1 can buy a die or two
    startDice: 1,          // faithful to design: you begin with one die
    hpPerUpgrade: 0.11,    // additive enemy HP scaling per upgrade (re-tuned post-expansion via sim.js)
    atkPerUpgrade: 0.11,   // loosened from 0.18/0.12 to offset boss buffers, debuffers & deeper reward counts
    healBetweenFights: 0.10
  },

  // permanent Workshop economy (between-run). cost = base * mult^(timesBought)
  SHOP: {
    dice:     { base: 10,  mult: 2, max: 5 },
    hp:       { base: 10,  mult: 2, inc: 5 },
    armor:    { base: 10,  mult: 2, inc: 1 },
    reroll:   { base: 100, mult: 3, inc: 1 },
    heal:     { base: 30,  mult: 2, inc: 0.05 },          // Natural Healing: +5% to between-fight/rest heal each
    beans:    { base: 20,  mult: 2, inc: 15 },            // Deep Pockets: +15 starting beans each
    luck:     { base: 40,  mult: 2, inc: 0.05 },          // Lucky Find: +5% beans from all fights each
    heirloom: { base: 60,  mult: 3, inc: 1, max: 3 }      // Heirloom: pre-applied free reward picks at run start
  },

  // bean costs for in-run nodes (spent from run beans, not banked)
  NODECOST: {
    shopUpgrade: 20,        // flat price per shop-node purchase (buy up to 3)
    reforgeReroll: 15,      // re-roll a die's feature
    reforgeTransfer: 20,    // move a feature between dice
    reforgeFaceMod: 15      // stamp a chosen face mod
  },

  // in-run shopkeeper flavor (one drawn at random per shop visit)
  SHOP_FLAVOR: [
    'Gimme them beans!',
    'Beans for blades, friend. Best on the desk.',
    'No refunds, no whiff protection.',
    'You squash \'em, I stock \'em.',
    'Everything’s legit. Mostly.',
    'Spend big, die slower.'
  ],

  COMBOS: {
    'No Combo': 1, 'One Pair': 1.5, 'Three of a Kind': 2.5, 'Two Pair': 3,
    'Four of a Kind': 3.5, 'Full House': 4.5, 'Straight': 4.5, 'Five of a Kind': 5
  },

  // Class loadout presets. Picking one in the Workshop enables exactly its `ids`
  // (every other reward/premium is switched OFF) — then you can still hand-tweak.
  // Overlap between classes is intentional: a piece can belong to several kits.
  CLASSES: {
    brute:    { icon: '⚔️', name: 'Brute',    desc: 'Burst, low-HP gambles, aggression. Live by the dagger.', signature: 'overkill',
      ids: ['glassCannon','berserkerPact','reckless','allInRoll','scarTissue','sacrificialDie','doubleNothing',
            'whetstone','kindle','momentum','piercer','prism','brand','forge','load','uniform','polish',
            'allOrNothing','bloodroll','wildcard','overkill'] },
    warden:   { icon: '🛡️', name: 'Warden',   desc: 'Shield, sustain, thorns. Outlast the desk.',
      ids: ['bulwark','bulwarkRoll','bulwarkCombo','bulwarkStance','bulkUp','ward','thorns','thornsCombo','counter',
            'siphon','siphonRoll','siphonCombo','siphonDamage','echo','ascend','engrave','polish','patient',
            'anchor','extradie'] },
    gambler:  { icon: '🎲', name: 'Gambler',  desc: 'A reroll & combo engine — chase the perfect roll.', signature: 'ricochet',
      ids: ['freeroll','overcharge','banker','overflow','magnet','liveWire','allInRoll','patient',
            'echo','ascend','kindle','prism','jackpot','uniform','load','brand',
            'wildcard','splitter','bloodroll','anchor','ricochet'] },
    tinkerer: { icon: '🔧', name: 'Tinkerer', desc: 'AoE shockwave/bubble + control. Clear the board.',
      ids: ['cleave','shockwave','bubble','bubbleReinforced','bubbleBigger','bubbleDouble',
            'shockAmplified','shockChain','shockFocused','siphonDamage','bulwarkCombo','greed','pawnbroker','forge','engrave',
            'splitter','extradie'] },
    // Empty user slots — no default loadout. Loading one before saving turns every piece OFF; then
    // the player saves their own active toggles as the preset (see Engine.loadClass / saveClass).
    custom1:  { icon: '🧪', name: 'Custom 1', desc: 'An empty slot — save your own build here.', ids: [] },
    custom2:  { icon: '🧪', name: 'Custom 2', desc: 'An empty slot — save your own build here.', ids: [] }
  },

  FEATURES: {
    cleave:     { icon: '🌊', name: 'Cleave',      desc: "Splashes pip × combo multiplier to every untargeted enemy." },
    bulwark:    { icon: '🛡', name: 'Bulwark',     desc: "Adds this die's pip as shield each turn." },
    bulwarkRoll:{ icon: '🌀', name: 'Tide Wall',   desc: 'Each reroll of this die adds its new pip as shield.' },
    bulwarkCombo:{icon: '🔰', name: 'Aegis',       desc: 'Adds your combo multiplier (×2) as shield each attack.' },
    freereroll: { icon: '🔄', name: 'Free Reroll', desc: '+1 reroll each turn.' },
    echo:       { icon: '🔮', name: 'Echo',        desc: 'Rolls twice, keeps the higher value.' },
    overcharge: { icon: '⚡', name: 'Overcharge',  desc: 'When this die shows a 6, gain +1 reroll this turn.' },
    banker:     { icon: '🏦', name: 'Banker',      desc: 'Each unused reroll at attack → this die’s pip as bonus damage.' },
    whetstone:  { icon: '🪓', name: 'Whetstone',   desc: 'Each reroll of this die → +2 bonus damage this turn.' },
    siphon:     { icon: '🩸', name: 'Siphon',      desc: 'Heal this die’s pip every time you attack.' },
    siphonRoll: { icon: '💉', name: 'Bloodletter', desc: 'Each reroll of this die heals its new pip.' },
    siphonCombo:{ icon: '❤️‍🔥', name: 'Vital Surge', desc: 'Heal scaled by your combo multiplier (×2) each attack.' },
    siphonDamage:{icon: '🧛', name: 'Leech',       desc: 'Lifesteal: heal 10% of the damage you deal each attack.' },
    thorns:     { icon: '🌵', name: 'Thorns',      desc: 'Reflect this die’s pip back when an enemy hits you.' },
    thornsCombo:{ icon: '🌹', name: 'Bramble',     desc: 'Reflect damage scaled by your last combo multiplier (×2) when hit.' },
    ascend:     { icon: '⬆️', name: 'Ascend',      desc: "Rerolls of this die never show a lower number than it currently shows." },
    magnet:     { icon: '🧲', name: 'Magnet',      desc: 'Rerolls of this die bias toward the value most dice are showing.' },
    momentum:   { icon: '🏃', name: 'Momentum',    desc: '+1 bonus damage per consecutive turn this die is left unrerolled; resets when rerolled.' },
    overflow:   { icon: '💧', name: 'Overflow',    desc: 'On attack, four-of-a-kind or better banks +1 reroll for next turn.' },
    piercer:    { icon: '🗡️', name: 'Piercer',     desc: 'Your attack ignores enemy armor (L2: also ignores boss damage caps).' },
    kindle:     { icon: '🔥', name: 'Kindle',      desc: 'Each reroll of this die adds +0.1 to your combo multiplier this turn (capped +1.0).' },
    shockwave:  { icon: '💥', name: 'Shockwave',   desc: 'Each charge hits a random enemy for 10% of your primary-target damage.' },
    bubble:     { icon: '🫧', name: 'Bubble',      desc: 'Each charge hits every enemy for 3% of your primary-target damage.' },
    prism:      { icon: '🔆', name: 'Prism',       desc: 'Each die showing a 6 adds +0.2 to your combo multiplier this attack.' },
    counter:    { icon: '↩️', name: 'Counter',     desc: 'When an enemy hits you, bank +1 reroll for next turn.' },
    jackpot:    { icon: '🎰', name: 'Jackpot',     desc: 'Five-of-a-kind on attack pays out bonus beans.' },
    overkill:   { icon: '🪦', name: 'Overkill',    desc: 'Damage past the target’s HP carves into the lowest-HP enemies. Levels chain to more.' },
    ricochet:   { icon: '🎯', name: 'Ricochet',    desc: 'On attack, every reroll you made this turn fires a bolt at a random enemy for 10% of primary damage (×level).' }
  },

  // human-readable behaviour blurbs for the enemy stats screen (keyed by ENEMIES.role)
  ROLES: {
    grunt:     { name: 'Grunt',       desc: 'Plain attacker — hits you for its attack value each turn.' },
    swarm:     { name: 'Swarm',       desc: 'Strikes several times a turn, each hit checked against shield/armor separately.' },
    brute:     { name: 'Brute',       desc: 'Slow, heavy hitter. Big single blows.' },
    mender:    { name: 'Mender',      desc: 'Heals a wounded ally; attacks only when nobody needs patching up.' },
    turtle:    { name: 'Turtle',      desc: 'Alternates between armoring up and attacking. Burst it on its attack turn.' },
    berserker: { name: 'Berserker',   desc: 'Attack grows every round it survives. Kill it early.' },
    warden:    { name: 'Warden',      desc: 'Shields an ally while one lives; attacks once it stands alone.' },
    summoner:  { name: 'Summoner',    desc: 'Periodically calls in another foe. Cut it down before the board fills.' },
    standard:  { name: 'Standard-Bearer', desc: 'Passively buffs every ally’s attack while alive. High-priority target.' },
    hexer:     { name: 'Hexer',       desc: 'Curses your dice (✨ hex weakens your next combo); attacks on the off turn.' },
    jammer:    { name: 'Jammer',      desc: 'Jams a die to its lowest face next turn; attacks on the off turn.' },
    jailer:    { name: 'Jailer',      desc: 'Pins your dice — caps you at a single reroll next turn; attacks on the off turn.' },
    rust:      { name: 'Rust',        desc: 'Eats your armor — strips a chunk for the rest of this fight; attacks on the off turn.' },
    sealer:    { name: 'Sealer',      desc: 'Seals a die — disables its feature next turn; attacks on the off turn.' },
    fogger:    { name: 'Fogger',      desc: 'Fogs the board — hides every telegraph next turn; attacks on the off turn.' },
    boss:      { name: 'Boss',        desc: 'Carries special signatures (below) and shifts behaviour as the fight goes.' }
  },

  // battle-start one-liners — one enemy "speaks" per fight (Engine.startFight picks the speaker)
  PUN_FALLBACK: ['Have at you, tiny human!', 'Step to me, better step quick!', 'En garde!', 'This’ll only hurt a lot.'],
  PUNS: {
    paperclip: 'Let’s get attached.',
    pen: 'You’re about to get inked.',
    thumbtack: 'Pin your hopes elsewhere.',
    book: 'Let me throw the book at you.',
    stapler: 'Time to staple this shut.',
    glue: 'Stick around — this won’t take long.',
    whiteout: 'I’ll correct your mistake. Permanently.',
    binder: 'I’ve got you bound.',
    tape: 'This is gonna be a wrap.',
    rubberband: 'I’m about to snap.',
    dispenser: 'Let me roll out the welcome.',
    pencilcup: 'I’ve got friends. Lots of them.',
    desklamp: 'Step into the light.',
    eraser: 'I’ll rub you out.',
    gum: 'You’re stuck with me.',
    clamp: 'Time to clamp down on you.',
    screw: 'Screw you. Literally.',
    sticker: 'Label me trouble.',
    coffee: 'I’ll leave a stain you can’t shake.',
    key: 'I hold the key to your defeat.',
    magnet: 'You’re drawn to your doom.',
    pushpin: 'Let’s get to the point.',
    battery: 'I’m fully charged.',
    paperweight: 'I’ll hold you down.',
    usb: 'Plug in and give up.',
    cassette: 'Rewind? Too late.',
    magnifier: 'I see right through you.',
    ruler: 'Let’s measure your defeat.',
    correctionpen: 'I’ll white out your win.',
    crayon: 'I’ll color you defeated.',
    button: 'Cute as a button — deadly as one too.',
    marble: 'You’ve lost your marbles.',
    highlighter: 'Let me highlight your weak spot.',
    rubberstamp: 'Approved: your doom.',
    calculator: 'Your odds don’t add up.',
    stickynote: 'Note to self: crush this one.',
    dvd: 'Prepare for a scratch.',
    headphones: 'Can’t hear your pleas.',
    bookmark: 'I’ll mark where you fell.',
    roguedie: 'Bet you didn’t roll for this.',
    sharpener: 'Let me put a point on it.',
    swissknife: 'I’ve got a tool for everything. Including you.',
    holepunch: 'I’ll punch right through you.',
    heavystapler: 'One heavy ka-chunk and you’re done.',
    scissors: 'Running with me was a mistake. Snip, snip.'
  },

  // role drives behaviour (handled in engine). stats + roster are pure data.
  ENEMIES: {
    paperclip: { icon: '📎', name: 'Paperclip',   hp: 6,  atk: 3,  gold: 3,  role: 'grunt'  },
    pen:       { icon: '🖊', name: 'Pen',         hp: 6,  atk: 3,  gold: 3,  role: 'grunt'  },
    thumbtack: { icon: '📌', name: 'Thumbtack',   hp: 5,  atk: 2,  gold: 2,  role: 'swarm', hits: 2 },
    book:      { icon: '📚', name: 'Book',        hp: 14, atk: 8,  gold: 6,  role: 'brute'  },
    stapler:   { icon: '🗜', name: 'Stapler',     hp: 18, atk: 10, gold: 8,  role: 'brute'  },
    glue:      { icon: '🧴', name: 'Glue',        hp: 8,  atk: 3,  gold: 4,  role: 'mender', heal: 5 },
    whiteout:  { icon: '🖌', name: 'White-Out',   hp: 9,  atk: 3,  gold: 5,  role: 'mender', heal: 7 },
    binder:    { icon: '🧷', name: 'Binder Clip', hp: 10, atk: 4,  gold: 5,  role: 'turtle', selfArmor: 3 },
    tape:      { icon: '🩹', name: 'Tape Roll',   hp: 12, atk: 4,  gold: 5,  role: 'turtle', selfArmor: 4 },
    rubberband:{ icon: '➰', name: 'Rubber Band',  hp: 11, atk: 3,  gold: 6,  role: 'berserker', rage: 3 },
    dispenser: { icon: '📭', name: 'Tape Dispenser',hp: 13,atk: 4, gold: 7,  role: 'warden', wardArmor: 3 },
    pencilcup: { icon: '🥤', name: 'Pencil Cup',  hp: 12, atk: 3,  gold: 7,  role: 'summoner', summon: 'paperclip' },
    desklamp:  { icon: '💡', name: 'Desk Lamp',   hp: 14, atk: 3,  gold: 8,  role: 'standard', auraAtk: 2 },
    eraser:    { icon: '🧽', name: 'Eraser',      hp: 9,  atk: 3,  gold: 6,  role: 'hexer', hex: 1 },
    gum:       { icon: '🍬', name: 'Gum Wad',     hp: 9,  atk: 3,  gold: 6,  role: 'jammer' },
    clamp:     { icon: '🗜', name: 'Spring Clamp', hp: 10, atk: 3,  gold: 6,  role: 'jailer' },
    screw:     { icon: '🔩', name: 'Rusty Screw', hp: 9,  atk: 4,  gold: 6,  role: 'rust', rust: 2 },
    sticker:   { icon: '🏷', name: 'Sticker',     hp: 8,  atk: 3,  gold: 6,  role: 'sealer' },
    coffee:    { icon: '☕', name: 'Coffee Spill', hp: 10, atk: 3,  gold: 6,  role: 'fogger' },

    // --- Stage 2 palette: the drawer & desktop heavies (existing roles, fresh skins) ---
    key:       { icon: '🔑', name: 'Lost Key',    hp: 9,  atk: 4,  gold: 5,  role: 'grunt' },
    magnet:    { icon: '🧲', name: 'Horseshoe Magnet', hp: 22, atk: 11, gold: 10, role: 'brute' },
    pushpin:   { icon: '📍', name: 'Push-Pins',   hp: 9,  atk: 3,  gold: 5,  role: 'swarm', hits: 3 },
    battery:   { icon: '🔋', name: 'Loose Battery', hp: 14, atk: 4, gold: 8,  role: 'berserker', rage: 4 },
    paperweight:{icon: '🪨', name: 'Paperweight', hp: 16, atk: 5,  gold: 8,  role: 'turtle', selfArmor: 5 },
    usb:       { icon: '🔌', name: 'USB Stick',   hp: 12, atk: 4,  gold: 7,  role: 'jailer' },
    cassette:  { icon: '📼', name: 'Cassette',    hp: 14, atk: 4,  gold: 8,  role: 'summoner', summon: 'key' },
    magnifier: { icon: '🔍', name: 'Magnifier',   hp: 11, atk: 4,  gold: 7,  role: 'hexer', hex: 1 },
    ruler:     { icon: '📏', name: 'Steel Ruler', hp: 17, atk: 4,  gold: 9,  role: 'standard', auraAtk: 2 },
    correctionpen:{icon:'🖊', name: 'Correction Pen', hp: 11, atk: 3, gold: 7, role: 'mender', heal: 7 },

    // --- Stage 1 extras (the open desktop) ---
    crayon:    { icon: '🖍', name: 'Crayon',      hp: 7,  atk: 3,  gold: 3,  role: 'grunt' },
    button:    { icon: '🔘', name: 'Loose Button', hp: 6, atk: 2,  gold: 3,  role: 'swarm', hits: 2 },
    marble:    { icon: '🔵', name: 'Marble',      hp: 8,  atk: 4,  gold: 4,  role: 'grunt' },
    highlighter:{icon: '🟨', name: 'Highlighter', hp: 9,  atk: 3,  gold: 5,  role: 'hexer', hex: 1 },
    rubberstamp:{icon: '📪', name: 'Rubber Stamp', hp: 15, atk: 8, gold: 7,  role: 'brute' },

    // --- Stage 2 extras (the drawer & shelves) ---
    calculator:{ icon: '🧮', name: 'Calculator',  hp: 22, atk: 10, gold: 10, role: 'brute' },
    stickynote:{ icon: '🗒', name: 'Sticky Note', hp: 11, atk: 3,  gold: 7,  role: 'mender', heal: 6 },
    dvd:       { icon: '💿', name: 'Scratched DVD', hp: 16, atk: 5, gold: 8,  role: 'turtle', selfArmor: 4 },
    headphones:{ icon: '🎧', name: 'Headphones',  hp: 15, atk: 4,  gold: 8,  role: 'warden', wardArmor: 3 },
    bookmark:  { icon: '🔖', name: 'Bookmark',    hp: 10, atk: 5,  gold: 6,  role: 'grunt' },
    roguedie:  { icon: '🎲', name: 'Rogue Die',   hp: 12, atk: 5,  gold: 9,  role: 'berserker', rage: 3 },

    // --- Bosses (drawn from pools each run; see MAP.bossKeys) ---
    holepunch: { icon: '🕳', name: 'Hole-Punch',  hp: 26, atk: 10, gold: 25, role: 'boss', summon: 'pushpin' },
    heavystapler:{icon:'⚙️', name: 'Industrial Stapler', hp: 40, atk: 12, gold: 55, role: 'boss', summon: 'staples', buffer: 'stickynote' },
    scissors:  { icon: '✂️', name: 'Scissors',    hp: 42, atk: 13, gold: 60, role: 'boss', summon: 'pushpin', buffer: 'headphones' },
    sharpener: { icon: '✏️', name: 'Pencil Sharpener', hp: 26, atk: 10, gold: 25, role: 'boss', summon: 'pen' },
    swissknife:{ icon: '🔪', name: 'Swiss Army Knife', hp: 40, atk: 13, gold: 60, role: 'boss', summon: 'pushpin', buffer: 'ruler' }
  },

  // The run is a procedurally-generated branching map (see Engine.generateMap):
  //   20 columns · col 9 = miniboss (leave/continue) · col 18 = guaranteed rest · col 19 = final boss.
  // Combat nodes draw a random encounter from the band matching their depth.
  // bossKeys feed the single-node miniboss/boss columns.
  MAP: {
    cols: 20, miniboss: 9, boss: 19, preBossRest: 18,
    widthMin: 2, widthMax: 4, paths: 6,                 // lanes up to widthMax; ~paths routes carved
    bossKeys: { minibossPool: ['sharpener', 'holepunch'], bossPool: ['swissknife', 'scissors', 'heavystapler'] },
    bands: { early: 4, mid: 13 },                       // col < early = early band; < mid = mid; else late
    // per-stage type weights (stage 1 = cols 0-9, stage 2 = cols 10-19). fight is the staple.
    weights: {
      stage1: { fight: 52, elite: 10, rest: 10, treasure: 12, shop: 6, reforge: 6, event: 8 },
      stage2: { fight: 48, elite: 18, rest: 12, treasure: 6, shop: 6, reforge: 4, event: 8 }
    },
    eliteMinCol: 4, treasureMaxCol: 12, treasureCap: 2, // doc cadence: elites mid+, treasure early-mid, 1-2/run
    shopMinCol: 5, reforgeMinCol: 4, eventMinCol: 3,    // service nodes appear mid+ (not in the opening)
    fightOnlyCols: 2                                     // first N columns are always plain fights
  },

  // Depth-banded encounter pools — generateMap picks one at random for each combat node.
  // Enemy-count rises with the band (early 1-2, mid 2, late 2-3), echoing the +1-every-4-fights cadence.
  ENCOUNTER_POOLS: {
    early: [ ['paperclip'], ['pen'], ['paperclip', 'thumbtack'], ['rubberband'], ['glue', 'pen'], ['thumbtack', 'thumbtack'], ['crayon'], ['button', 'paperclip'], ['marble'], ['crayon', 'button'] ],
    mid:   [ ['pencilcup', 'thumbtack'], ['glue', 'pen', 'eraser'], ['book', 'eraser'], ['desklamp', 'paperclip', 'gum'], ['binder', 'paperclip'], ['rubberband', 'whiteout'], ['clamp', 'pen'], ['screw', 'thumbtack'], ['sticker', 'paperclip'], ['coffee', 'paperclip'], ['highlighter', 'crayon'], ['rubberstamp', 'button'], ['marble', 'highlighter'], ['rubberstamp', 'screw'] ],
    late:  [ ['book', 'eraser', 'gum'], ['tape', 'thumbtack', 'gum'], ['pencilcup', 'eraser', 'gum'], ['stapler', 'dispenser'], ['desklamp', 'binder', 'paperclip'], ['paperclip', 'whiteout', 'thumbtack'], ['clamp', 'screw', 'paperclip'], ['coffee', 'sticker', 'book'], ['screw', 'binder', 'gum'], ['sticker', 'clamp', 'whiteout'], ['rubberstamp', 'highlighter', 'button'], ['stapler', 'highlighter', 'marble'] ]
  },
  ELITE_POOLS: {
    mid:  [ ['stapler', 'dispenser'], ['book', 'desklamp'], ['binder', 'pencilcup', 'eraser'] ],
    late: [ ['stapler', 'desklamp', 'binder'], ['stapler', 'dispenser', 'whiteout'], ['book', 'pencilcup', 'tape'] ]
  },

  // Stage-2 palette (cols 10-19) — the drawer/desktop heavies, with a few crossover veterans.
  ENCOUNTER_POOLS_S2: {
    mid:  [ ['key', 'pushpin'], ['magnifier', 'key'], ['battery', 'usb'], ['cassette', 'pushpin'], ['paperweight', 'screw'], ['ruler', 'key'], ['bookmark', 'roguedie'], ['stickynote', 'key', 'magnifier'], ['dvd', 'pushpin'], ['headphones', 'bookmark'] ],
    late: [ ['magnet', 'magnifier'], ['paperweight', 'usb', 'pushpin'], ['ruler', 'battery', 'key'], ['cassette', 'magnifier', 'screw'], ['magnet', 'correctionpen', 'pushpin'], ['paperweight', 'usb', 'sticker'], ['calculator', 'headphones'], ['dvd', 'roguedie', 'usb'], ['calculator', 'stickynote', 'magnifier'], ['headphones', 'ruler', 'roguedie'] ]
  },
  ELITE_POOLS_S2: {
    mid:  [ ['magnet', 'usb'], ['ruler', 'paperweight'], ['cassette', 'battery', 'magnifier'], ['calculator', 'headphones'] ],
    late: [ ['magnet', 'ruler', 'usb'], ['paperweight', 'cassette', 'correctionpen'], ['calculator', 'dvd', 'magnifier'], ['calculator', 'headphones', 'roguedie'] ]
  },

  // run economy bonuses for the miniboss leave-decision and a full clear
  RUN: { leaveBonus: 40, winBonus: 140 },

  // tunable thresholds for the condition-based bonus skins (logic lives in Engine.evaluateSkinUnlocks).
  // consolationBeans pays out when an `unlockSkin` event grants a skin you already own (so the node is never dead).
  SKIN_UNLOCKS: {
    monkKindnessRequired: 3,       // give to the Begging Beetle this many times (lifetime) → Monk
    gladiatorHpPct: 0.10,          // win a run that dipped to ≤10% HP → Gladiator
    cowboyLifetimeBeans: 50000,    // PLACEHOLDER — tune after playtest (real economy unknown)
    vikingTurnDamage: 500,         // PLACEHOLDER — depends entirely on the damage curve, tune after playtest
    consolationBeans: 15
  },

  // pre-run difficulty dial (set in the Workshop). `enemy` = multiplicative factor on enemy
  // HP/attack/shield; `beans` = multiplier on all bean income. Greed knob from the design doc.
  CHALLENGE: [
    { mult: 1, enemy: 1, beans: 1,   desc: 'Standard.' },
    { mult: 2, enemy: 2, beans: 1.5, desc: 'Enemies +100% HP & damage. Beans +50%.' },
    { mult: 3, enemy: 3, beans: 2.2, desc: 'Enemies +200% HP & damage. Beans +120%.' },
    { mult: 4, enemy: 4, beans: 2.6, desc: 'Enemies +300% HP & damage. Beans +160%.' },
    { mult: 5, enemy: 5, beans: 3.2, desc: 'Enemies +400% HP & damage. Beans +220%.' },
    { mult: 6, enemy: 5.5, beans: 3.4, desc: 'Enemies +450% HP & damage. Beans +240%.' },
    { mult: 7, enemy: 6, beans: 3.6, desc: 'Enemies +500% HP & damage. Beans +260%.' },
    { mult: 8, enemy: 6.5, beans: 3.8, desc: 'Enemies +550% HP & damage. Beans +280%.' },
    { mult: 9, enemy: 7, beans: 4.2, desc: 'Enemies +600% HP & damage. Beans +320%.' },
    { mult: 10, enemy: 8, beans: 5, desc: 'Enemies +700% HP & damage. Beans +400%.' }
  ],

  // Treasure premiums (choose 1 of 2, free). Mapped to Engine.EFFECTS. `cap` = max times applied per run.
  PREMIUMS: [
    { id: 'wildcard', name: 'Wildcard', desc: 'Turn one face of a die WILD — counts as any value for combos, exactly 1 for the sum.', effect: 'wildcard', cap: 1 },
    { id: 'anchor',   name: 'Anchor',   desc: 'A die persists across turns — it only changes when you manually reroll it.',       effect: 'anchor', cap: 1 },
    { id: 'bloodroll',name: 'Bloodroll',desc: 'Unlimited rerolls — but each reroll past your free pool costs 1 HP.',             effect: 'bloodroll', cap: 1 },
    { id: 'extradie', name: 'Spare Die', desc: 'Gain an extra die for the rest of this run.',                                    effect: 'extradie', cap: 2 },
    { id: 'splitter', name: 'Splitter',  desc: 'A die counts as TWO dice for combos (not the sum) — helps pairs, two pair & full houses, but never trips+.', effect: 'splitter', cap: 2 },
    { id: 'allOrNothing',name:'All or Nothing',desc: '5× damage — but your max HP becomes 1. Any hit kills you.',               effect: 'allOrNothing', cap: 1 }
  ],

  // boss "build-check" signatures. Drawn randomly each run (engine assigns params).
  // miniboss draws 1; final boss draws 2-3 + phaseFlip. Each id = one small engine hook.
  SIGNATURES: {
    damageCap:      { icon: '🚧', name: 'Ward',           desc: 'Takes at most a capped amount of damage per hit. Checks pure burst.' },
    shieldSunder:   { icon: '💥', name: 'Shield Sunder',  desc: 'Its hits ignore your shield. Checks shield-stacking.' },
    reinforcements: { icon: '📣', name: 'Reinforcements', desc: 'Summons an add at HP thresholds. Checks single-target.' },
    hardening:      { icon: '🪨', name: 'Hardening',      desc: 'Gains armor on turns you fail to deal enough. Checks slow ramp.' },
    rerollTax:      { icon: '🔒', name: 'Reroll Tax',     desc: '−1 to your reroll pool while it lives. Checks reroll-hungry builds.' },
    riposte:        { icon: '↩️', name: 'Riposte',        desc: 'If it survives your turn, it strikes back hard. Kill it fast.' },
    phaseFlip:      { icon: '🔃', name: 'Phase Flip',     desc: 'At 50% HP it changes behavior. Two-phase fight.' },
    lifelink:       { icon: '🪬', name: 'Lifelink Totem', desc: 'Immune while its totem add lives. Kill the totem first.' },
    vampiric:       { icon: '🧛', name: 'Vampiric',     desc: 'Heals a share of the damage it deals you. Out-race its sustain.' },
    regen:          { icon: '💚', name: 'Regenerate',   desc: 'Heals a little every turn. Burst it down fast.' },
    spikes:         { icon: '🔱', name: 'Spikes',       desc: 'Reflects part of your hit back at you. Watch your HP.' }
  },

  // in-run reward pool (temporary). `effect` maps to Engine.EFFECTS.
  UPGRADES: [
    // per-die features (effect: addFeature)
    { id: 'cleave',     name: 'Cleave (die)',      desc: 'A die splashes its pip × combo multiplier to every untargeted enemy. Your AoE answer.', effect: 'addFeature', feature: 'cleave' },
    { id: 'bulwark',    name: 'Bulwark (die)',     desc: 'A die adds its pip as shield each turn. Outlast the chip damage.',                       effect: 'addFeature', feature: 'bulwark' },
    { id: 'bulwarkRoll',name: 'Tide Wall (die)',   desc: 'Each reroll of this die adds its new pip as shield. Rewards churn defensively.',        effect: 'addFeature', feature: 'bulwarkRoll' },
    { id: 'bulwarkCombo',name:'Aegis (die)',       desc: 'Adds your combo multiplier (×2) as shield each attack. Big combos, big guard.',         effect: 'addFeature', feature: 'bulwarkCombo' },
    { id: 'freeroll',   name: 'Free Reroll (die)', desc: 'A die grants +1 reroll each turn.',                                                     effect: 'addFeature', feature: 'freereroll' },
    { id: 'echo',       name: 'Echo (die)',        desc: 'A die rolls twice and keeps the higher value. Consistency.',                            effect: 'addFeature', feature: 'echo' },
    { id: 'overcharge', name: 'Overcharge (die)',  desc: 'When this die shows a 6, gain +1 reroll this turn. Rolls into more rolls.',             effect: 'addFeature', feature: 'overcharge' },
    { id: 'banker',     name: 'Banker (die)',      desc: 'Each unused reroll becomes this die’s pip in bonus damage. Rewards restraint.',         effect: 'addFeature', feature: 'banker' },
    { id: 'whetstone',  name: 'Whetstone (die)',   desc: 'Each reroll of this die adds +2 bonus damage this turn. Rewards churn.',                effect: 'addFeature', feature: 'whetstone' },
    { id: 'siphon',     name: 'Siphon (die)',      desc: 'Heal this die’s pip every time you attack. Sustain.',                                   effect: 'addFeature', feature: 'siphon' },
    { id: 'siphonRoll', name: 'Bloodletter (die)', desc: 'Each reroll of this die heals its new pip. Sustain through churn.',                      effect: 'addFeature', feature: 'siphonRoll' },
    { id: 'siphonCombo',name: 'Vital Surge (die)', desc: 'Heal scaled by your combo multiplier (×2) each attack. Big combos, big heals.',         effect: 'addFeature', feature: 'siphonCombo' },
    { id: 'siphonDamage',name:'Leech (die)',       desc: 'Lifesteal: heal 10% of the damage you deal each attack. Scales with your hits.',        effect: 'addFeature', feature: 'siphonDamage' },
    { id: 'thorns',     name: 'Thorns (die)',      desc: 'Reflect this die’s pip back when an enemy hits you. Punish attackers.',                 effect: 'addFeature', feature: 'thorns' },
    { id: 'thornsCombo',name: 'Bramble (die)',     desc: 'Reflect damage scaled by your last combo multiplier (×2) when hit. Punish harder.',     effect: 'addFeature', feature: 'thornsCombo' },
    { id: 'ascend',     name: 'Ascend (die)',      desc: "A die's rerolls never show a lower number than it shows now (L2: never below 4). Reroll fearlessly.", effect: 'addFeature', feature: 'ascend' },
    { id: 'magnet',     name: 'Magnet (die)',      desc: 'A die rerolls biased toward your most common showing value. Chase combos.',            effect: 'addFeature', feature: 'magnet' },
    { id: 'momentum',   name: 'Momentum (die)',    desc: '+1 bonus damage per consecutive turn this die is left alone; resets if rerolled.',      effect: 'addFeature', feature: 'momentum' },
    { id: 'overflow',   name: 'Overflow (die)',    desc: 'Four-of-a-kind or better on attack banks +1 reroll for next turn. Efficiency.',         effect: 'addFeature', feature: 'overflow' },
    { id: 'piercer',    name: 'Piercer (die)',     desc: 'Your attack ignores enemy armor. Answers turtles.',                                     effect: 'addFeature', feature: 'piercer' },
    { id: 'kindle',     name: 'Kindle (die)',      desc: 'Each reroll of this die adds +0.1 combo multiplier this turn (capped +1.0). Rewards churn.', effect: 'addFeature', feature: 'kindle' },
    { id: 'prism',      name: 'Prism (die)',       desc: 'Each die showing a 6 adds +0.2 combo multiplier this attack. Pairs with big-six builds.',    effect: 'addFeature', feature: 'prism' },
    { id: 'counter',    name: 'Counter (die)',     desc: 'When an enemy hits you, bank +1 reroll for next turn. Turtle up, roll more.',                 effect: 'addFeature', feature: 'counter' },
    { id: 'jackpot',    name: 'Jackpot (die)',     desc: 'Five-of-a-kind on attack pays bonus beans. For the high-combo gambler.',                     effect: 'addFeature', feature: 'jackpot' },
    { id: 'shockwave',  name: 'Shockwave (die)',   desc: 'A die hits a random enemy for 10% of primary damage. Levels add charges. Bursty AoE.',  effect: 'addFeature', feature: 'shockwave' },
    { id: 'bubble',     name: 'Bubble (die)',      desc: 'A die hits every enemy for 3% of primary damage. Levels add charges. Reliable AoE.',    effect: 'addFeature', feature: 'bubble' },
    { id: 'overkill',   name: 'Overkill (die)',    desc: 'Damage beyond the target’s HP carves into the next lowest-HP enemies; levels chain further. Brute crowd-breaker.', effect: 'addFeature', feature: 'overkill' },
    { id: 'ricochet',   name: 'Ricochet (die)',    desc: 'On attack, every reroll you made this turn fires a bolt at a random enemy for 10% of primary damage (×level). Gambler AoE.', effect: 'addFeature', feature: 'ricochet' },
    // AoE effect enhancers (buff every matching instance; only offered once you own the base)
    { id: 'bubbleReinforced', name: 'Bubble: Reinforced', desc: 'Every Bubble hit deals +10 flat damage.',                  effect: 'bubbleReinforced' },
    { id: 'bubbleBigger',     name: 'Bubble: Bigger',     desc: 'Bubble hits for 5% of primary damage (was 3%).',          effect: 'bubbleBigger', once: true },
    { id: 'bubbleDouble',     name: 'Bubble: Double',     desc: 'Every Bubble die gains +1 charge.',                       effect: 'bubbleDouble' },
    { id: 'shockAmplified',   name: 'Shockwave: Amplified',desc: 'Shockwave hits for 15% of primary damage (was 10%).',    effect: 'shockAmplified', once: true },
    { id: 'shockChain',       name: 'Shockwave: Chain',   desc: 'Every Shockwave die gains +1 charge.',                    effect: 'shockChain' },
    { id: 'shockFocused',     name: 'Shockwave: Focused', desc: 'Shockwave targets the lowest-HP enemy instead of random.',effect: 'shockFocused', once: true },
    // face mods (stackable)
    { id: 'forge',      name: 'Forge a Die',       desc: 'Turn up to 2 random faces of a die into 6s.',                                           effect: 'forge' },
    { id: 'load',       name: 'Load a Die',        desc: "Raise a die's lowest faces by one (snowballs).",                                        effect: 'load' },
    { id: 'brand',      name: 'Brand a Die',       desc: 'Turn ALL faces of a die into 1s — every roll strikes as 6 and makes five-of-a-kind.',   effect: 'brand' },
    { id: 'engrave',    name: 'Engrave a Die',     desc: 'Raise a die’s two lowest faces by one. Smooths the low end.',                           effect: 'engrave' },
    { id: 'uniform',    name: 'Uniform a Die',     desc: 'Set a random face to the die’s most common value. Chase a combo.',                      effect: 'uniform' },
    { id: 'polish',     name: 'Polish a Die',      desc: 'Raise every face of a die by one (max 6). Smooths the whole die upward.',               effect: 'polish' },
    // run-wide
    { id: 'ward',       name: 'Ward',              desc: 'Gain 2 shield at the start of each turn this run.',                                      effect: 'ward', amount: 2 },
    // tradeoffs & swaps (downside always visible)
    { id: 'glassCannon',name: 'Glass Cannon',      desc: '+100% damage, but −70% max HP. Live by the dagger.',                                    effect: 'glassCannon' },
    { id: 'reckless',   name: 'Reckless',          desc: '+25% damage, but +20% damage taken.',                                                   effect: 'reckless' },
    { id: 'liveWire',   name: 'Live Wire',         desc: '+2 rerolls per turn, but −25% max HP.',                                                 effect: 'liveWire' },
    { id: 'bulwarkStance',name: 'Bulwark Stance',  desc: '+8 shield each turn, but −20% damage.',                                                 effect: 'bulwarkStance' },
    { id: 'allInRoll',  name: 'All-In Roll',       desc: '+30% damage, but −2 rerolls per turn.',                                                 effect: 'allInRoll' },
    { id: 'patient',    name: 'Patient',           desc: '+1 reroll per turn, but −15% damage.',                                                  effect: 'patient' },
    { id: 'bulkUp',     name: 'Bulk Up',           desc: '+30% max HP, but −20% damage.',                                                         effect: 'bulkUp' },
    { id: 'pawnbroker', name: 'Pawnbroker',        desc: '+15% gold from fights, but −30% max HP.',                                               effect: 'pawnbroker' },
    { id: 'scarTissue', name: 'Scar Tissue',       desc: '+25% damage, but −50% natural healing.',                                                effect: 'scarTissue' },
    { id: 'berserkerPact',name:"Berserker's Pact", desc: '+1% damage for every 1% of max HP you are missing. Rewards living low.',                 effect: 'berserkerPact' },
    { id: 'greed',      name: 'Greed',             desc: '+50% gold from fights, but enemies gain +30% HP & +30% attack.',                         effect: 'greed' },
    { id: 'sacrificialDie',name:'Sacrificial Die', desc: '+3.0 combo multiplier every turn, but permanently lose one die (floor: 1).',             effect: 'sacrificialDie' },
    { id: 'doubleNothing',name:'Double or Nothing',desc: 'Each attack flips a coin: double your damage, or deal nothing.',                        effect: 'doubleOrNothing' }
  ],

  // Event "?" nodes — narrative risk/reward. Each choice maps to an engine outcome (the if/else chain in
  //   Engine.applyEvent). content.js is data-only: all outcome LOGIC lives in engine.js.
  // outcome ids: hpForFaceMod (pay HP% → random face mod), beanGamble (double/halve beans), hpForReward
  //   (pay HP → reward pick), mysteryBox (pay beans → reward pick), heal (pct of maxHP), beansFlat,
  //   wardRun (pay HP → +shield/turn this run), levelFeature (pay beans → +1 die-feature level),
  //   maxRerollRun, extraDieRun, nothing (walk away).
  // NEW: riskBite (coin flip; win/lose each = an outcome block, see below), raid (deterministic trade block),
  //   timedBuff (decaying run buff over N fights, optional two-phase `then`), trickleIncome (beans after each
  //   of N fights), stateScaledReward (pay beans → payout scaled by run state: missingHpPct|beans|dieCount),
  //   scoutReveal (reveal upcoming rosters + boss preview, costs accuracy next fight), randomTable (one
  //   weighted pull → an outcome block), unlockSkin (field: skin id — unlock a cosmetic skin for free;
  //   pays SKIN_UNLOCKS.consolationBeans if already owned).
  // Outcome BLOCK fields (riskBite win/lose, raid.effect, randomTable rows): beans, hp, hpPct, healFull,
  //   maxHpPct (permanent), featureAllDice (+lvl to every featured die), ward, debuff {kind:combo|poison|
  //   accuracy}, enemyBuff {pct} (one-fight enemy enrage), buff {timedBuff descriptor}.
  // Choice flags: hidden:true (view renders desc as "???" until chosen). Event flags: minCol (gate to deeper runs).
  EVENTS: [
    { id: 'whetrock', icon: '🪨', name: 'A Whetstone Outcrop',
      desc: 'A grey slab juts from the desk seam. You could grind a die against it — sharper edges, but it costs you.',
      choices: [
        { label: 'Grind a die', desc: 'Lose 15% max HP → a free face mod on a die.', outcome: 'hpForFaceMod', hpPct: 0.15 },
        { label: 'Walk on', desc: 'Leave it be.', outcome: 'nothing' }
      ] },
    { id: 'beanpot', icon: '🫘', name: 'A Bubbling Bean Pot',
      desc: 'Something simmers in a thimble. Toss your beans in and the pot might double them — or swallow half.',
      choices: [
        { label: 'Gamble the beans', desc: 'Coin flip: double your run beans, or lose half.', outcome: 'beanGamble' },
        { label: 'Keep your beans', desc: 'Pocket them and move on.', outcome: 'nothing' }
      ] },
    { id: 'pact', icon: '🩸', name: 'A Pricking Needle',
      desc: 'A pin offers power for blood. Press your thumb to it and something useful follows.',
      choices: [
        { label: 'Pay 8 HP', desc: 'Lose 8 HP → a free reward pick.', outcome: 'hpForReward', hp: 8 },
        { label: 'Refuse', desc: 'Not today.', outcome: 'nothing' }
      ] },
    { id: 'box', icon: '🎁', name: 'A Wrapped Parcel',
      desc: 'A tiny parcel, unlabelled. The vendor wants beans up front — no peeking.',
      choices: [
        { label: 'Buy it (20 beans)', desc: 'Pay 20 beans → a random reward.', outcome: 'mysteryBox', cost: 20 },
        { label: 'Leave it', desc: 'Too rich for you.', outcome: 'nothing' }
      ] },
    { id: 'nook', icon: '🛏', name: 'A Quiet Nook',
      desc: 'A soft scrap of felt, out of the draft. You could catch your breath.',
      choices: [
        { label: 'Rest a moment', desc: 'Heal 25% of max HP.', outcome: 'heal', pct: 0.25 },
        { label: 'Press on', desc: 'No time to waste.', outcome: 'nothing' }
      ] },
    { id: 'crumbs', icon: '🍪', name: 'A Trail of Crumbs',
      desc: 'Someone left a snack behind. The crumbs glitter with stray beans.',
      choices: [
        { label: 'Scoop them up', desc: 'Gain 20 beans.', outcome: 'beansFlat', beans: 20 },
        { label: 'Leave them', desc: 'Not worth the detour.', outcome: 'nothing' }
      ] },
    { id: 'talisman', icon: '🧿', name: 'A Worn Charm',
      desc: 'A bead on a string hums faintly. Wear it and it wards you — for a steep price in blood.',
      choices: [
        { label: 'Wear it (−12 HP)', desc: 'Gain +2 shield at the start of every turn this run.', outcome: 'wardRun', hp: 12, ward: 2 },
        { label: 'Pass', desc: 'Leave the charm.', outcome: 'nothing' }
      ] },
    { id: 'grindstone', icon: '🪨', name: 'The Grindstone',
      desc: 'A rough wheel spins. For a few beans you can hone one of your dice features sharper.',
      choices: [
        { label: 'Hone (15 beans)', desc: '+1 level to a random die feature.', outcome: 'levelFeature', cost: 15 },
        { label: 'Move on', desc: 'Keep your beans.', outcome: 'nothing' }
      ] },
    { id: 'jolt', icon: '⚡', name: 'A Static Jolt',
      desc: 'A charge arcs off the carpet. Grab it and your hands move faster all run — but it really stings.',
      choices: [
        { label: 'Take the jolt (−14 HP)', desc: '+1 reroll every turn this run.', outcome: 'maxRerollRun', hp: 14 },
        { label: 'Ground yourself', desc: 'Avoid the shock.', outcome: 'nothing' }
      ] },
    { id: 'sparedie', icon: '🎲', name: 'A Spare Die',
      desc: 'A lone die rattles in the dust. You could press it into service — if you can spare the blood.',
      choices: [
        { label: 'Claim it (−10 HP)', desc: 'Gain an extra die for the run.', outcome: 'extraDieRun', hp: 10 },
        { label: 'Leave it', desc: 'One die fewer to worry about.', outcome: 'nothing' }
      ] },
    { id: 'well', icon: '⛲', name: 'A Bottlecap Well',
      desc: 'A bottle-cap full of rainwater. Toss beans in and fortune may smile — or not.',
      choices: [
        { label: 'Make a wish', desc: 'Coin flip: double or halve your beans.', outcome: 'beanGamble' },
        { label: 'Stay thirsty', desc: 'Walk past.', outcome: 'nothing' }
      ] },

    // ---- expansion: biting gambles (riskBite) ----
    { id: 'cat', icon: '🐈', name: 'The Sleeping Cat',
      desc: 'A vast warm shape dozes across the carpet, tail twitching. Something glints beneath one paw.',
      choices: [
        { label: 'Snatch and run', desc: 'Coin flip: a big haul of beans, or a swat that costs HP and leaves you rattled next fight.', outcome: 'riskBite', odds: 0.5, win: { beans: 60 }, lose: { hp: -10, debuff: { kind: 'combo', value: 1 } } },
        { label: 'Pluck a shed whisker', desc: 'A small, safe gain.', outcome: 'beansFlat', beans: 15 },
        { label: 'Tiptoe past', desc: 'Do not wake it.', outcome: 'nothing' }
      ] },
    { id: 'capsule', icon: '💊', name: 'A Spilled Capsule',
      desc: 'A giant\'s pill lies split open, full of strange dust. Medicine, maybe. Maybe not.',
      choices: [
        { label: 'Swallow it', desc: 'Coin flip: heal to full, or lose a slice of max HP for good.', outcome: 'riskBite', odds: 0.5, win: { healFull: true }, lose: { maxHpPct: -0.2 } },
        { label: 'Leave it', desc: 'Not worth the risk.', outcome: 'nothing' }
      ] },
    { id: 'spiderweb', icon: '🕸', name: 'The Spider\'s Web',
      desc: 'Silk strung across the gap, sticky and strong. Threads like this could reinforce every die, if the weaver is not home.',
      choices: [
        { label: 'Harvest the silk', desc: 'Coin flip: +1 level to a feature on every die, or get bitten (poison next fight).', outcome: 'riskBite', odds: 0.5, win: { featureAllDice: 1 }, lose: { debuff: { kind: 'poison', value: 2 } } },
        { label: 'Cut one strand', desc: 'A small, safe ward.', outcome: 'wardRun', hp: 0, ward: 1 },
        { label: 'Back away', desc: 'Leave the web alone.', outcome: 'nothing' }
      ] },

    // ---- expansion: decaying buffs (timedBuff) ----
    { id: 'torch', icon: '🔥', name: 'A Guttering Matchstick',
      desc: 'A spent match, its head still warm. Carry it and your hands move faster, while it lasts.',
      choices: [
        { label: 'Carry the flame', desc: '+1 reroll each turn for the next 3 fights, then it burns out.', outcome: 'timedBuff', buff: { stat: 'maxRerolls', amount: 1, mode: 'add', fights: 3 } },
        { label: 'Let it die', desc: 'Move on in the dark.', outcome: 'nothing' }
      ] },
    { id: 'sugar', icon: '🍬', name: 'A Sugar Cube',
      desc: 'A glittering white block, pure energy. The rush is immediate. The crash is not.',
      choices: [
        { label: 'Lick it', desc: 'Big combo boost next fight, then a sluggish penalty the fight after.', outcome: 'timedBuff', buff: { stat: 'comboBonus', amount: 1.5, mode: 'add', fights: 1, then: { stat: 'comboBonus', amount: -1.0, mode: 'add', fights: 1 } } },
        { label: 'Save it', desc: 'Pocket it untouched.', outcome: 'nothing' }
      ] },

    // ---- expansion: trickle income + greed fork (trickleIncome / raid) ----
    { id: 'ants', icon: '🐜', name: 'An Ant Caravan',
      desc: 'A column of ants marches in lockstep, hauling crumbs. Fall in line and they share, if you carry your weight.',
      choices: [
        { label: 'March with them', desc: 'Earn a trickle of beans after each of the next 3 fights.', outcome: 'trickleIncome', beans: 12, fights: 3 },
        { label: 'Raid the column', desc: 'Grab a pile of beans now, but they turn hostile (enemies enraged next fight).', outcome: 'raid', effect: { beans: 40, enemyBuff: { pct: 0.3 } } },
        { label: 'Step aside', desc: 'Let them pass.', outcome: 'nothing' }
      ] },

    // ---- expansion: state-scaled reward (stateScaledReward) ----
    { id: 'beetle', icon: '🪲', name: 'A Begging Beetle',
      desc: 'A small ragged beetle holds out one claw. Spare a few beans?',
      choices: [
        { label: 'Give 15 beans', desc: 'The more down on your luck you are, the more it repays the kindness.', outcome: 'stateScaledReward', cost: 15, read: 'missingHpPct', base: 10, scale: 60 },
        { label: 'Shoo it off', desc: 'Keep your beans.', outcome: 'nothing' }
      ] },

    // ---- expansion: scouting (scoutReveal) ----
    { id: 'moth', icon: '🦟', name: 'A Moth at the Lamp',
      desc: 'A moth circles a bulb\'s glow, hypnotized. Join it and the light shows you what lies ahead, at a cost to your eyes.',
      choices: [
        { label: 'Circle the light', desc: 'Reveal the next stretch of the map (and a boss preview), but take an accuracy debuff next fight.', outcome: 'scoutReveal', pct: 0.2 },
        { label: 'Look away', desc: 'Keep your night vision.', outcome: 'nothing' }
      ] },

    // ---- expansion: roulette + blind doors (randomTable / blindChoice) ----
    { id: 'fortune', icon: '🥠', name: 'A Fortune Crumb',
      desc: 'A sliver of paper curls inside a crumb. Read it and fate leans your way, probably.',
      choices: [
        { label: 'Read the fortune', desc: 'One pull on a wheel of small blessings and curses.', outcome: 'randomTable', table: [
          { weight: 3, hpPct: 0.15 }, { weight: 3, beans: 12 }, { weight: 2, ward: 1 },
          { weight: 2, debuff: { kind: 'combo', value: 1 } }, { weight: 2 } ] },
        { label: 'Eat the crumb', desc: 'Ignore the paper.', outcome: 'beansFlat', beans: 8 }
      ] },
    { id: 'fork', icon: '🪵', name: 'A Fork in the Floorboard',
      desc: 'The seam splits two ways. One path smells of beans, the other of blood. You cannot tell which is which.',
      choices: [
        { label: 'Take the left seam', desc: '???', hidden: true, outcome: 'beansFlat', beans: 35 },
        { label: 'Take the right seam', desc: '???', hidden: true, outcome: 'riskBite', odds: 0.5, win: { healFull: true }, lose: { hpPct: -0.25 } }
      ] },

    // ---- expansion: gated setpiece (minCol) ----
    { id: 'giantHand', icon: '✋', name: 'The Giant\'s Hand', minCol: 6,
      desc: 'The whole world darkens. Five vast pillars descend from above. Hold still, or run.',
      choices: [
        { label: 'Hold your nerve', desc: 'Risk it for a huge reward if you survive the suspense.', outcome: 'riskBite', odds: 0.6, win: { beans: 100, healFull: true }, lose: { hpPct: -0.45 } },
        { label: 'Run for cover', desc: 'A small, guaranteed reward and safety.', outcome: 'beansFlat', beans: 25 }
      ] },

    // ---- expansion: skin-granting befrienders (unlockSkin) ----
    // Grants are free; if the skin is already owned the engine pays SKIN_UNLOCKS.consolationBeans instead.
    { id: 'windupToy', icon: '🤖', name: 'A Windup Toy',
      desc: 'Half-buried in the dust lies a dented windup robot, its key frozen mid-turn. A few good winds might bring it back.',
      choices: [
        { label: 'Wind it back to life', desc: 'It sputters awake and joins you. Unlocks the Robot skin.', outcome: 'unlockSkin', skin: 'robot' },
        { label: 'Leave it in the dust', desc: 'Move on.', outcome: 'nothing' }
      ] },
    { id: 'waryFox', icon: '🦊', name: 'A Wary Fox',
      desc: 'A fox watches from the shadow of the baseboard, ears flat, unsure of you. Share a crumb and it might decide you are a friend.',
      choices: [
        { label: 'Offer a crumb', desc: 'It warms to you and tags along. Unlocks the Fox skin.', outcome: 'unlockSkin', skin: 'fox' },
        { label: 'Back away slowly', desc: 'Leave it be.', outcome: 'nothing' }
      ] }
  ]
};

if (typeof module !== 'undefined') module.exports = CONTENT;
